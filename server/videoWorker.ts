// Video Generation Worker - Background processing for video jobs
import { storage } from "./storage";
import { generateScript, generateImagePrompt, generateImage, generateCaptionAndHashtags, generateSpeech, type TTSVoice, DUMMY_MODE } from "./ai";
import { objectStorageService } from "./objectStorage";
import { renderVideo, checkVideoIntegrity } from "./videoRenderer";
import type { Job, JobStep, JobSettings, ContentType, Scene, JobStatus, StepStatus } from "@shared/schema";
import { randomUUID } from "crypto";
import crypto from "crypto";

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const LEASE_SECONDS = 120; // 2 minutes
const LEASE_RENEW_INTERVAL = 30000; // 30 seconds

interface JobContext {
  job: Job;
  settings: JobSettings;
  script?: string;
  scenes?: Scene[];
}

// Step weights for progress calculation
const STEP_WEIGHTS = {
  script: 15,
  assets_visual: 35,
  assets_audio: 20,
  video: 25,
  caption: 5
};

// Initialize all job steps (exported for routes to use)
export async function initializeJobSteps(jobId: string): Promise<void> {
  const stepTypes = ['script', 'assets_visual', 'assets_audio', 'video', 'caption'];
  
  // Check if steps already exist
  const existingSteps = await storage.getJobSteps(jobId);
  if (existingSteps.length > 0) {
    console.log(`[Worker] Steps already exist for job ${jobId}`);
    return;
  }
  
  for (const stepType of stepTypes) {
    await storage.createJobStep({
      jobId,
      stepType,
      status: 'queued'
    });
  }
}

// Check if job was cancelled
async function isCancelled(jobId: string): Promise<boolean> {
  const job = await storage.getJob(jobId);
  return job?.cancelRequested === true;
}

// Generate hash for idempotent asset keys
function generateHash(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex').slice(0, 8);
}

// Process a queued job through the pipeline
export async function processJob(jobId: string): Promise<void> {
  console.log(`[Worker] Starting job ${jobId}`);
  
  // Try to acquire lock
  const lockAcquired = await storage.acquireJobLock(jobId, WORKER_ID, LEASE_SECONDS);
  if (!lockAcquired) {
    console.log(`[Worker] Could not acquire lock for job ${jobId}, skipping`);
    return;
  }
  
  // Set up lease renewal interval
  const leaseInterval = setInterval(async () => {
    const renewed = await storage.renewJobLease(jobId, WORKER_ID, LEASE_SECONDS);
    if (!renewed) {
      console.log(`[Worker] Lost lease for job ${jobId}`);
      clearInterval(leaseInterval);
    }
  }, LEASE_RENEW_INTERVAL);
  
  try {
    const job = await storage.getJob(jobId);
    if (!job) {
      console.error(`[Worker] Job ${jobId} not found`);
      return;
    }

    const settings = job.settings as JobSettings;
    const context: JobContext = { job, settings };

    // Update job status to running
    await storage.updateJob(jobId, { status: 'running', progressPercent: 0 });
    await storage.updateLastProgress(jobId);

    // Step 1: Generate Script
    if (await isCancelled(jobId)) throw new Error('Cancelled by user');
    
    await runStep(jobId, 'script', async () => {
      const result = await generateScript(settings.contentType as ContentType, settings.contentConfig || {});
      context.script = result.script;
      context.scenes = result.scenes;
      
      await storage.updateJob(jobId, { 
        status: 'generating_script',
        scriptText: result.script,
        scenes: result.scenes,
        progressPercent: STEP_WEIGHTS.script
      });
      await storage.updateLastProgress(jobId);
    });

    // Step 2: Generate Visual Assets (with idempotency)
    if (await isCancelled(jobId)) throw new Error('Cancelled by user');
    
    await runStep(jobId, 'assets_visual', async () => {
      await storage.updateJob(jobId, { status: 'generating_assets' });
      
      // Reload scenes from DB in case of resume
      const freshJob = await storage.getJob(jobId);
      if (freshJob?.scenes) {
        context.scenes = freshJob.scenes as Scene[];
      }
      
      if (context.scenes && context.scenes.length > 0) {
        const updatedScenes = [...context.scenes];
        
        for (let i = 0; i < updatedScenes.length; i++) {
          if (await isCancelled(jobId)) throw new Error('Cancelled by user');
          
          const scene = updatedScenes[i];
          
          // Skip if already has image (idempotency)
          if (scene.backgroundAssetUrl) {
            console.log(`[Worker] Scene ${i} already has image, skipping`);
            continue;
          }
          
          // Generate image prompt
          const imagePrompt = await generateImagePrompt(
            scene,
            settings.visual?.stylePrompt,
            settings.contentType as ContentType
          );
          updatedScenes[i].backgroundPrompt = imagePrompt;

          // Generate hash-based filename for idempotency
          const promptHash = generateHash(imagePrompt + jobId + i);
          const filename = `${jobId}/images/scene_${i}_${promptHash}.png`;

          // Check if asset already exists
          const existingAsset = await storage.getAssetByPath(jobId, `/objects/generated/${filename}`);
          if (existingAsset) {
            console.log(`[Worker] Image already exists for scene ${i}, using cached`);
            updatedScenes[i].backgroundAssetUrl = existingAsset.url;
          } else {
            // Generate image
            try {
              const imageBuffer = await generateImage(imagePrompt);
              const imageUrl = await objectStorageService.uploadBuffer(imageBuffer, 'image/png', filename);
              updatedScenes[i].backgroundAssetUrl = imageUrl;
              
              // Save asset reference
              await storage.createAsset({
                jobId,
                assetType: 'image',
                url: imageUrl,
                metadata: { sceneIndex: i, prompt: imagePrompt, hash: promptHash }
              });
            } catch (err) {
              console.error(`[Worker] Failed to generate image for scene ${i + 1}:`, err);
              updatedScenes[i].backgroundAssetUrl = '';
            }
          }

          // Update progress
          const visualProgress = STEP_WEIGHTS.script + 
            (STEP_WEIGHTS.assets_visual * (i + 1)) / updatedScenes.length;
          await storage.updateJob(jobId, { 
            progressPercent: Math.round(visualProgress),
            scenes: updatedScenes
          });
          await storage.updateLastProgress(jobId);
        }
        
        context.scenes = updatedScenes;
        await storage.updateJob(jobId, { scenes: updatedScenes });
      }
    });

    // Step 3: Generate Audio Assets (with idempotency)
    if (await isCancelled(jobId)) throw new Error('Cancelled by user');
    
    await runStep(jobId, 'assets_audio', async () => {
      await storage.updateJob(jobId, { status: 'generating_assets' });
      
      // Reload scenes from DB
      const freshJob = await storage.getJob(jobId);
      if (freshJob?.scenes) {
        context.scenes = freshJob.scenes as Scene[];
      }
      
      if (context.script && context.scenes && context.scenes.length > 0) {
        const voice = (settings.audio?.voiceModel || 'nova') as TTSVoice;
        const updatedScenes = [...context.scenes];
        
        for (let i = 0; i < updatedScenes.length; i++) {
          if (await isCancelled(jobId)) throw new Error('Cancelled by user');
          
          const scene = updatedScenes[i];
          const text = scene.voiceSegmentText || scene.textOverlay || '';
          
          // Skip if already has audio (idempotency)
          if (scene.audioAssetUrl) {
            console.log(`[Worker] Scene ${i} already has audio, skipping`);
            continue;
          }
          
          if (text.trim()) {
            // Generate hash-based filename
            const textHash = generateHash(text + voice + jobId);
            const filename = `${jobId}/audio/voice_${i}_${textHash}.mp3`;
            
            // Check if asset already exists
            const existingAsset = await storage.getAssetByPath(jobId, `/objects/generated/${filename}`);
            if (existingAsset) {
              console.log(`[Worker] Audio already exists for scene ${i}, using cached`);
              updatedScenes[i].audioAssetUrl = existingAsset.url;
            } else {
              try {
                const audioBuffer = await generateSpeech(text, voice);
                const audioUrl = await objectStorageService.uploadBuffer(audioBuffer, 'audio/mpeg', filename);
                updatedScenes[i].audioAssetUrl = audioUrl;
                
                await storage.createAsset({
                  jobId,
                  assetType: 'audio',
                  url: audioUrl,
                  metadata: { sceneIndex: i, voice, hash: textHash }
                });
              } catch (err) {
                console.error(`[Worker] Failed to generate audio for scene ${i + 1}:`, err);
              }
            }
          }
          
          const audioProgress = STEP_WEIGHTS.script + STEP_WEIGHTS.assets_visual + 
            (STEP_WEIGHTS.assets_audio * (i + 1)) / updatedScenes.length;
          await storage.updateJob(jobId, { 
            progressPercent: Math.round(audioProgress),
            scenes: updatedScenes
          });
          await storage.updateLastProgress(jobId);
        }
        
        context.scenes = updatedScenes;
        await storage.updateJob(jobId, { scenes: updatedScenes });
      }
    });

    // Step 4: Render Video
    if (await isCancelled(jobId)) throw new Error('Cancelled by user');
    
    await runStep(jobId, 'video', async () => {
      await storage.updateJob(jobId, { status: 'rendering_video' });
      
      // Reload scenes from DB
      const freshJob = await storage.getJob(jobId);
      if (freshJob?.scenes) {
        context.scenes = freshJob.scenes as Scene[];
      }
      
      if (context.scenes && context.scenes.length > 0) {
        const result = await renderVideo({
          jobId,
          scenes: context.scenes,
          settings
        });
        
        // Verify MP4 integrity before proceeding
        const integrity = result.integrityCheck;
        if (!integrity.valid) {
          throw new Error(`Video integrity check failed: ${integrity.error}`);
        }
        
        await storage.createAsset({
          jobId,
          assetType: 'video',
          url: result.videoUrl,
          metadata: { duration: result.durationSeconds }
        });
        
        await storage.createAsset({
          jobId,
          assetType: 'image',
          url: result.thumbnailUrl,
          metadata: { type: 'thumbnail' }
        });
        
        const videoProgress = STEP_WEIGHTS.script + STEP_WEIGHTS.assets_visual + 
                             STEP_WEIGHTS.assets_audio + STEP_WEIGHTS.video;
        
        await storage.updateJob(jobId, { 
          progressPercent: videoProgress,
          durationSeconds: result.durationSeconds,
          thumbnailUrl: result.thumbnailUrl,
          videoUrl: result.videoUrl
        });
        await storage.updateLastProgress(jobId);
      }
    });

    // Step 5: Generate Caption & Hashtags
    if (await isCancelled(jobId)) throw new Error('Cancelled by user');
    
    await runStep(jobId, 'caption', async () => {
      await storage.updateJob(jobId, { status: 'generating_caption' });
      
      // Reload script from DB
      const freshJob = await storage.getJob(jobId);
      const script = freshJob?.scriptText || context.script;
      
      if (script) {
        const { caption, hashtags } = await generateCaptionAndHashtags(
          settings.contentType as ContentType,
          script
        );
        
        await storage.updateJob(jobId, { 
          caption,
          hashtags,
          progressPercent: 100
        });
        await storage.updateLastProgress(jobId);
      }
    });

    // Mark job as completed
    await storage.updateJob(jobId, { 
      status: 'completed',
      progressPercent: 100,
      etaSeconds: 0
    });
    
    console.log(`[Worker] Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`[Worker] Job ${jobId} failed:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const status = errorMessage.includes('Cancelled') ? 'failed' : 'failed';
    
    await storage.updateJob(jobId, { 
      status,
      errorMessage
    });
  } finally {
    // Always clean up lease and interval
    clearInterval(leaseInterval);
    await storage.releaseJobLock(jobId, WORKER_ID);
  }
}

// Run a single step with status tracking
async function runStep(
  jobId: string, 
  stepType: string, 
  fn: () => Promise<void>
): Promise<void> {
  const job = await storage.getJob(jobId);
  const step = job?.steps.find(s => s.stepType === stepType);
  
  if (!step) {
    console.error(`[Worker] Step ${stepType} not found for job ${jobId}`);
    return;
  }

  // Skip if already completed (for resume scenarios)
  if (step.status === 'completed') {
    console.log(`[Worker] Step ${stepType} already completed, skipping`);
    return;
  }

  const startTime = Date.now();

  try {
    // Mark step as running
    await storage.updateJobStep(step.id, {
      status: 'running',
      startedAt: new Date()
    });

    // Execute step
    await fn();

    const durationMs = Date.now() - startTime;

    // Mark step as completed
    await storage.updateJobStep(step.id, {
      status: 'completed',
      finishedAt: new Date(),
      durationMs
    });
    
    // Save step timing for ETA calculation
    await saveStepTiming(job!.contentType, stepType, durationMs);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Step failed';
    
    await storage.updateJobStep(step.id, {
      status: 'failed',
      finishedAt: new Date(),
      message: errorMessage
    });
    
    throw error; // Re-throw to fail the job
  }
}

// Save step timing for ETA calculations
async function saveStepTiming(contentType: string, stepType: string, durationMs: number): Promise<void> {
  const key = `step_avg_${contentType}_${stepType}`;
  const existing = await storage.getSetting(key);
  
  let avgMs = durationMs;
  let count = 1;
  
  if (existing?.value) {
    const data = existing.value as { avgMs: number; count: number };
    // Rolling average
    count = data.count + 1;
    avgMs = ((data.avgMs * data.count) + durationMs) / count;
  }
  
  await storage.setSetting(key, { avgMs, count });
}

// Simple in-memory job queue
const jobQueue: string[] = [];
let isProcessing = false;

export function enqueueJob(jobId: string): void {
  if (!jobQueue.includes(jobId)) {
    jobQueue.push(jobId);
  }
  processQueue();
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  
  isProcessing = true;
  
  while (jobQueue.length > 0) {
    const jobId = jobQueue.shift();
    if (jobId) {
      await processJob(jobId);
    }
  }
  
  isProcessing = false;
}

// Resume jobs on startup
export async function resumeJobsOnStartup(): Promise<void> {
  console.log(`[Worker] Checking for jobs to resume...`);
  
  const resumableStatuses = ['queued', 'running', 'generating_script', 'generating_assets', 'rendering_video', 'generating_caption'];
  const jobs = await storage.getJobsByStatuses(resumableStatuses);
  
  for (const job of jobs) {
    // Release any stale locks
    if (job.leaseExpiresAt && new Date(job.leaseExpiresAt) < new Date()) {
      console.log(`[Worker] Releasing stale lock for job ${job.id}`);
      await storage.updateJob(job.id, { lockedBy: null, lockedAt: null, leaseExpiresAt: null });
    }
    
    // Re-enqueue job
    console.log(`[Worker] Re-enqueueing job ${job.id} (status: ${job.status})`);
    enqueueJob(job.id);
  }
  
  console.log(`[Worker] Resumed ${jobs.length} jobs`);
}
