# Build Plan - AI Shorts Studio Reliability Upgrade

## Phases Overview

| Phase | Focus | Est. Files Changed |
|-------|-------|-------------------|
| 1 | Documentation + Scripts Setup | 4 files |
| 2 | Database Schema + Migrations | 2 files |
| 3 | Worker Reliability (Locking + Idempotency) | 3 files |
| 4 | ETA Tracking + Resume | 3 files |
| 5 | Rendering Upgrade + Integrity | 2 files |
| 6 | Dummy Mode + Verification | 4 files |
| 7 | API Endpoints (Cancel + Stuck) | 2 files |
| 8 | UI Updates | 4 files |
| 9 | Final Verification | 0 files (testing only) |

---

## Phase 1: Documentation + Scripts Setup

### Files to Change
- `replit.md` - Update with rules, commands, env vars
- `.replit_agent_rules.md` - Create agent rules file
- `AUDIT_REPORT.md` - Create audit report
- `BUILD_PLAN.md` - Create this file
- `package.json` - Add typecheck, verify scripts

### Commands
```bash
# Add to package.json scripts:
"typecheck": "tsc --noEmit",
"verify": "DUMMY_MODE=true tsx scripts/verify.ts"
```

### Verification
- [ ] `npm run typecheck` runs without error
- [ ] Scripts section updated in package.json

---

## Phase 2: Database Schema + Migrations

### Files to Change
- `shared/schema.ts` - Add lease fields to jobs table
- Run `npm run db:push` to apply

### Schema Changes
```typescript
// Add to jobs table:
lockedBy: text("locked_by"),
lockedAt: timestamp("locked_at"),
leaseExpiresAt: timestamp("lease_expires_at"),
lastProgressAt: timestamp("last_progress_at"),
cancelRequested: boolean("cancel_requested").default(false),
```

### Verification
- [ ] `npm run db:push` succeeds
- [ ] New columns visible in database

---

## Phase 3: Worker Reliability (Locking + Idempotency)

### Files to Change
- `server/videoWorker.ts` - Add locking, idempotency, step creation on job create
- `server/storage.ts` - Add lock/unlock methods
- `server/routes.ts` - Create steps when job created

### Key Changes

**Job Steps Creation (in routes.ts POST /api/jobs)**:
```typescript
// After createJob, before enqueueJob:
await initializeJobSteps(job.id);
```

**Job Locking (in storage.ts)**:
```typescript
async acquireJobLock(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>
async renewJobLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>
async releaseJobLock(jobId: string, workerId: string): Promise<void>
async updateLastProgress(jobId: string): Promise<void>
```

**Idempotent Asset Keys (in videoWorker.ts)**:
```typescript
// Hash-based paths:
const hash = crypto.createHash('md5').update(prompt).digest('hex').slice(0, 8);
const filename = `${jobId}/images/scene_${i}_${hash}.png`;

// Skip if exists:
const existingAsset = await storage.getAssetByPath(jobId, filename);
if (existingAsset) {
  scene.backgroundAssetUrl = existingAsset.url;
  continue;
}
```

### Verification
- [ ] Steps exist immediately after job creation (before worker starts)
- [ ] Restarting worker doesn't regenerate existing assets
- [ ] Two workers can't process same job simultaneously

---

## Phase 4: ETA Tracking + Resume

### Files to Change
- `server/videoWorker.ts` - Add step timing, ETA updates
- `server/storage.ts` - Add step time average methods
- `shared/schema.ts` - Add etaSeconds to job_steps (if needed)

### Key Changes

**Step Time Averages (in settings table)**:
```typescript
// Key format: "step_avg_{contentType}_{stepType}"
// Value: { avgMs: number, count: number }
```

**ETA Calculation**:
```typescript
function calculateETA(job: Job): number {
  const remaining = ['script', 'assets_visual', 'assets_audio', 'video', 'caption']
    .filter(step => !isStepCompleted(job, step));
  
  return remaining.reduce((total, step) => {
    return total + getStepETA(job.contentType, step, job);
  }, 0);
}
```

**Resume on Boot (in server/index.ts)**:
```typescript
// On startup:
const staleJobs = await storage.getStaleJobs(['queued', 'running', 'generating_script', 'generating_assets', 'rendering_video']);
for (const job of staleJobs) {
  // Release stale locks
  if (job.leaseExpiresAt && job.leaseExpiresAt < new Date()) {
    await storage.releaseJobLock(job.id, job.lockedBy);
  }
  enqueueJob(job.id);
}
```

### Verification
- [ ] ETA updates during job processing
- [ ] ETA uses historical averages when available
- [ ] Jobs resume after server restart

---

## Phase 5: Rendering Upgrade + Integrity

### Files to Change
- `server/videoRenderer.ts` - 30fps, integrity checks
- `server/videoWorker.ts` - Check integrity before completing

### Key Changes

**FPS Update (in videoRenderer.ts)**:
```typescript
const FPS = 30; // Changed from 25
```

**Integrity Check**:
```typescript
async function checkVideoIntegrity(videoPath: string): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,width,height',
      '-of', 'json',
      videoPath
    ]);
    
    let stdout = '';
    proc.stdout.on('data', d => stdout += d);
    proc.on('close', code => {
      if (code !== 0) return resolve({ valid: false, error: 'ffprobe failed' });
      
      const data = JSON.parse(stdout);
      const duration = parseFloat(data.format?.duration || '0');
      const hasAudio = data.streams?.some(s => s.codec_type === 'audio');
      const videoStream = data.streams?.find(s => s.codec_type === 'video');
      
      if (duration <= 0) return resolve({ valid: false, error: 'No duration' });
      if (!hasAudio) return resolve({ valid: false, error: 'No audio stream' });
      if (videoStream?.width !== 1080 || videoStream?.height !== 1920) {
        return resolve({ valid: false, error: 'Wrong resolution' });
      }
      
      resolve({ valid: true });
    });
  });
}
```

### Verification
- [ ] Output videos are 1080x1920 @ 30fps
- [ ] Jobs fail if MP4 integrity check fails
- [ ] ffprobe validates duration, audio, resolution

---

## Phase 6: Dummy Mode + Verification

### Files to Change
- `server/ai.ts` - Add dummy mode conditionals
- `server/videoRenderer.ts` - Dummy mode placeholders
- `scripts/verify.ts` - Create verification script
- `package.json` - Add verify command

### Key Changes

**Dummy Mode Check**:
```typescript
const DUMMY_MODE = process.env.DUMMY_MODE === 'true';

export async function generateScript(contentType, config) {
  if (DUMMY_MODE) {
    return getDummyScript(contentType, config);
  }
  // ... real implementation
}
```

**Verification Script (scripts/verify.ts)**:
```typescript
const GOLDEN_JOBS = [
  { contentType: 'facts', config: { count: 5 } },
  { contentType: 'would_you_rather', config: { count: 5 } },
  { contentType: 'short_story_generic', config: {} }
];

async function runVerification() {
  for (const job of GOLDEN_JOBS) {
    // Create job
    // Assert: steps exist immediately
    // Poll until complete
    // Assert: progress increased
    // Assert: eta updated
    // Assert: MP4 integrity
    // Assert: caption non-empty
  }
}
```

### Verification
- [ ] `DUMMY_MODE=true npm run dev` works without AI costs
- [ ] `npm run verify` creates 3 jobs and validates them
- [ ] All assertions pass

---

## Phase 7: API Endpoints (Cancel + Stuck)

### Files to Change
- `server/routes.ts` - Add cancel endpoint
- `server/videoWorker.ts` - Check cancel flag, detect stuck

### Key Changes

**Cancel Endpoint**:
```typescript
app.post("/api/jobs/:id/cancel", async (req, res) => {
  await storage.updateJob(req.params.id, { cancelRequested: true });
  res.json({ success: true });
});
```

**Cancel Check in Worker**:
```typescript
async function checkCancelled(jobId: string): Promise<boolean> {
  const job = await storage.getJob(jobId);
  return job?.cancelRequested === true;
}

// In processJob, between steps:
if (await checkCancelled(jobId)) {
  await storage.updateJob(jobId, { status: 'failed', errorMessage: 'Cancelled by user' });
  await cleanupTempDir(jobId);
  return;
}
```

**Stuck Detection**:
```typescript
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

async function detectStuckJobs(): Promise<void> {
  const runningJobs = await storage.getJobs({ status: 'running' });
  const now = Date.now();
  
  for (const job of runningJobs) {
    const lastProgress = job.lastProgressAt?.getTime() || job.updatedAt.getTime();
    if (now - lastProgress > STUCK_THRESHOLD_MS) {
      await storage.updateJob(job.id, { 
        status: 'failed', 
        errorMessage: 'Job timed out (no progress for 10 minutes)' 
      });
    }
  }
}
```

### Verification
- [ ] POST /api/jobs/:id/cancel stops job
- [ ] Stuck jobs auto-fail after timeout
- [ ] Temp files cleaned on cancel

---

## Phase 8: UI Updates

### Files to Change
- `client/src/pages/job-detail.tsx` - Stepper, logs, preview, download
- `client/src/pages/dashboard.tsx` - Jobs table with filters
- `client/src/components/job-stepper.tsx` - Create stepper component
- `client/src/components/job-logs.tsx` - Create logs component

### Key Features

**Job Detail Page**:
- Stepper timeline with per-step status + ETA
- Global progress bar + ETA
- Expandable step logs
- lastUpdated timestamp + polling indicator
- MP4 preview (video element)
- Download button
- Regenerate button
- Cancel button (if running)

**Dashboard Page**:
- Jobs table with columns: Title, Status, Progress, ETA, Updated
- Status filter dropdown
- ContentType filter dropdown
- Progress bar in table cell
- Click row to navigate to detail

### Verification
- [ ] Stepper shows all 5 steps
- [ ] Progress bar updates live
- [ ] ETA updates live
- [ ] MP4 preview plays
- [ ] Download works
- [ ] Filters work

---

## Phase 9: Final Verification

### Commands
```bash
npm run typecheck    # Must pass
npm run verify       # Must pass (3 golden jobs)
```

### Manual Checks
- [ ] Create real job (not dummy mode)
- [ ] Watch progress/ETA update live
- [ ] MP4 plays in browser
- [ ] Download works
- [ ] Cancel mid-job works
- [ ] Restart server, jobs resume without duplication

### Definition of Done
All must be true:
1. `npm run typecheck` passes
2. `npm run verify` passes
3. Real MP4 previews in UI
4. Progress/ETA/logs update live while running
5. Restart/resume works without double-processing
6. No stock footage usage anywhere

---

## File Touch Points Summary

| File | Phases | Changes |
|------|--------|---------|
| `replit.md` | 1 | Rules, commands |
| `.replit_agent_rules.md` | 1 | Create |
| `AUDIT_REPORT.md` | 1 | Create |
| `BUILD_PLAN.md` | 1 | Create |
| `package.json` | 1, 6 | Add scripts |
| `shared/schema.ts` | 2 | Add lease fields |
| `server/storage.ts` | 3, 4 | Add lock/lease methods |
| `server/routes.ts` | 3, 7 | Steps on create, cancel endpoint |
| `server/videoWorker.ts` | 3, 4, 5, 7 | Locking, idempotency, ETA, cancel |
| `server/videoRenderer.ts` | 5, 6 | 30fps, integrity, dummy mode |
| `server/ai.ts` | 6 | Dummy mode |
| `scripts/verify.ts` | 6 | Create |
| `client/src/pages/job-detail.tsx` | 8 | Stepper, logs, preview |
| `client/src/pages/dashboard.tsx` | 8 | Table, filters |
| `client/src/components/job-stepper.tsx` | 8 | Create |
| `client/src/components/job-logs.tsx` | 8 | Create |
