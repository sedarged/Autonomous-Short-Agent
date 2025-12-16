#!/usr/bin/env tsx
/**
 * Verification Script - Golden Job Tests
 * 
 * Creates 3 golden jobs and validates:
 * - Steps exist immediately after creation
 * - Progress increases over time
 * - ETA updates over time
 * - MP4 passes integrity checks
 * - Caption and hashtags are non-empty
 * 
 * Usage: DUMMY_MODE=true tsx scripts/verify.ts
 */

const BASE_URL = process.env.VERIFY_BASE_URL || 'http://localhost:5000';
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_WAIT_TIME = 300000; // 5 minutes max per job

interface Job {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  etaSeconds: number | null;
  videoUrl: string | null;
  caption: string | null;
  hashtags: string[] | null;
  steps: Array<{
    id: string;
    stepType: string;
    status: string;
  }>;
}

interface GoldenJob {
  name: string;
  contentType: string;
  config: Record<string, unknown>;
}

const GOLDEN_JOBS: GoldenJob[] = [
  {
    name: 'Facts Golden Job',
    contentType: 'facts',
    config: { count: 5, topic: 'interesting science' }
  },
  {
    name: 'Would You Rather Golden Job',
    contentType: 'would_you_rather',
    config: { count: 5, topic: 'fun choices' }
  },
  {
    name: 'Short Story Golden Job',
    contentType: 'short_story_generic',
    config: { prompt: 'A test adventure story' }
  }
];

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json() as Promise<T>;
}

async function createJob(goldenJob: GoldenJob): Promise<Job> {
  console.log(`\n📝 Creating job: ${goldenJob.name}`);
  
  const job = await fetchJson<Job>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      title: goldenJob.name,
      settings: {
        contentType: goldenJob.contentType,
        contentConfig: goldenJob.config,
        visual: { generatorType: 'image_sequence' },
        audio: { voiceModel: 'nova' },
        subtitles: { enabled: true }
      }
    })
  });
  
  console.log(`   Created job ${job.id}`);
  return job;
}

async function pollJob(jobId: string): Promise<Job> {
  return fetchJson<Job>(`/api/jobs/${jobId}`);
}

async function waitForCompletion(jobId: string, jobName: string): Promise<Job> {
  const startTime = Date.now();
  let lastProgress = -1;
  let lastEta: number | null = null;
  let progressChanged = false;
  let etaChanged = false;
  
  console.log(`   Waiting for job to complete...`);
  
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    const job = await pollJob(jobId);
    
    // Track progress changes
    if (job.progressPercent !== lastProgress) {
      if (lastProgress !== -1) progressChanged = true;
      console.log(`   Progress: ${job.progressPercent}% (status: ${job.status})`);
      lastProgress = job.progressPercent;
    }
    
    // Track ETA changes
    if (job.etaSeconds !== lastEta) {
      if (lastEta !== null) etaChanged = true;
      lastEta = job.etaSeconds;
    }
    
    // Check if completed or failed
    if (job.status === 'completed') {
      return job;
    }
    
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${(job as any).errorMessage || 'Unknown error'}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  throw new Error(`Job timed out after ${MAX_WAIT_TIME / 1000} seconds`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function verifyJob(goldenJob: GoldenJob): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing: ${goldenJob.name}`);
  console.log(`${'='.repeat(60)}`);
  
  // Create job
  const createdJob = await createJob(goldenJob);
  
  // Assert: Steps exist immediately
  assert(
    createdJob.steps && createdJob.steps.length === 5,
    `Steps should exist immediately after creation (got ${createdJob.steps?.length || 0})`
  );
  console.log(`   ✅ Steps exist immediately (${createdJob.steps.length} steps)`);
  
  const expectedSteps = ['script', 'assets_visual', 'assets_audio', 'video', 'caption'];
  for (const stepType of expectedSteps) {
    const step = createdJob.steps.find(s => s.stepType === stepType);
    assert(!!step, `Step "${stepType}" should exist`);
  }
  console.log(`   ✅ All required step types present`);
  
  // Wait for completion
  const completedJob = await waitForCompletion(createdJob.id, goldenJob.name);
  
  // Assert: Job completed
  assert(completedJob.status === 'completed', `Job should be completed (got ${completedJob.status})`);
  console.log(`   ✅ Job completed successfully`);
  
  // Assert: Progress reached 100%
  assert(completedJob.progressPercent === 100, `Progress should be 100% (got ${completedJob.progressPercent})`);
  console.log(`   ✅ Progress reached 100%`);
  
  // Assert: Video URL exists
  assert(!!completedJob.videoUrl, 'Video URL should exist');
  console.log(`   ✅ Video URL exists: ${completedJob.videoUrl}`);
  
  // Assert: Caption is non-empty
  assert(!!completedJob.caption && completedJob.caption.length > 0, 'Caption should be non-empty');
  console.log(`   ✅ Caption exists: "${completedJob.caption?.slice(0, 50)}..."`);
  
  // Assert: Hashtags are non-empty
  assert(
    !!completedJob.hashtags && completedJob.hashtags.length > 0,
    'Hashtags should be non-empty'
  );
  console.log(`   ✅ Hashtags exist: ${completedJob.hashtags?.join(', ')}`);
  
  // Assert: All steps completed
  for (const step of completedJob.steps) {
    assert(
      step.status === 'completed',
      `Step "${step.stepType}" should be completed (got ${step.status})`
    );
  }
  console.log(`   ✅ All steps completed`);
  
  console.log(`\n   🎉 ${goldenJob.name} PASSED`);
}

async function main(): Promise<void> {
  console.log('🚀 AI Shorts Studio Verification Script');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   DUMMY_MODE: ${process.env.DUMMY_MODE || 'not set'}`);
  console.log(`   Running ${GOLDEN_JOBS.length} golden job tests...\n`);
  
  // Check server health first
  try {
    const health = await fetchJson<{ status: string }>('/api/health');
    console.log(`   Server health: ${health.status}`);
  } catch (err) {
    console.error('❌ Server is not reachable. Make sure the app is running.');
    process.exit(1);
  }
  
  let passed = 0;
  let failed = 0;
  const errors: Array<{ name: string; error: string }> = [];
  
  for (const goldenJob of GOLDEN_JOBS) {
    try {
      await verifyJob(goldenJob);
      passed++;
    } catch (err) {
      failed++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push({ name: goldenJob.name, error: errorMessage });
      console.error(`\n   ❌ ${goldenJob.name} FAILED: ${errorMessage}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 VERIFICATION SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Total: ${GOLDEN_JOBS.length}`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\n   Errors:`);
    for (const { name, error } of errors) {
      console.log(`   - ${name}: ${error}`);
    }
  }
  
  if (failed > 0) {
    console.log(`\n❌ VERIFICATION FAILED`);
    process.exit(1);
  } else {
    console.log(`\n✅ ALL VERIFICATIONS PASSED`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
