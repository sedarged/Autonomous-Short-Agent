# Audit Report - AI Shorts Studio

## Repository Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Dashboard  │  │  Job Detail  │  │    New Video Form    │  │
│  │   (polling)  │  │  (stepper)   │  │   (content config)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                            │                                    │
│                    TanStack Query (polling)                     │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP /api/*
┌────────────────────────────┼────────────────────────────────────┐
│                       SERVER (Express)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   routes.ts  │  │  storage.ts  │  │  videoWorker.ts      │  │
│  │  (REST API)  │  │  (Drizzle)   │  │  (job queue/steps)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                              │                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────┴───────────────┐  │
│  │    ai.ts     │  │ renderer.ts  │  │  objectStorage.ts    │  │
│  │  (OpenAI)    │  │  (ffmpeg)    │  │  (GCS sidecar)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  PostgreSQL  │  │   OpenAI     │  │  Object Storage      │  │
│  │  (Neon via   │  │  (via Replit │  │  (GCS sidecar at     │  │
│  │  DATABASE_   │  │   AI Integ)  │  │   127.0.0.1:1106)    │  │
│  │  URL)        │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Worker Flow

```
enqueueJob(jobId)
    │
    ▼
processQueue() ─── isProcessing? ─── yes ─── return
    │                                │
    no                               │
    │                                │
    ▼                                │
while (queue.length > 0)             │
    │                                │
    ├──► processJob(jobId)           │
    │       │                        │
    │       ├── initializeJobSteps() ◄── ISSUE: Steps created HERE, not at job creation
    │       │       │
    │       │       ├── script step
    │       │       ├── assets_visual step
    │       │       ├── assets_audio step
    │       │       ├── video step
    │       │       └── caption step
    │       │
    │       ├── runStep('script')
    │       │       └── generateScript() → OpenAI
    │       │
    │       ├── runStep('assets_visual')
    │       │       └── for each scene: generateImagePrompt() + generateImage()
    │       │
    │       ├── runStep('assets_audio')
    │       │       └── for each scene: generateSpeech() → OpenAI TTS
    │       │
    │       ├── runStep('video')
    │       │       └── renderVideo() → ffmpeg
    │       │
    │       ├── runStep('caption')
    │       │       └── generateCaptionAndHashtags() → OpenAI
    │       │
    │       └── updateJob(status: 'completed')
    │
    └── isProcessing = false
```

## Renderer Flow

```
renderVideo(options)
    │
    ├── ensureTempDir(/tmp/video-render/{jobId})
    │
    ├── Download assets
    │   ├── for each scene: downloadFile(imageUrl) or createPlaceholderImage()
    │   └── for each scene: downloadFile(audioUrl)
    │
    ├── Create silent video with Ken Burns effect
    │   └── ffmpeg -i images... -filter_complex zoompan... → silent_video.mp4
    │
    ├── (if audio) Concatenate audio
    │   └── ffmpeg concat audio → combined_audio.mp3
    │
    ├── (if audio) Merge audio with video
    │   └── ffmpeg -i video -i audio → video_with_audio.mp4
    │
    ├── (if subtitles) Burn subtitles
    │   ├── generateAssSubtitles() → subtitles.ass
    │   └── ffmpeg -vf ass=subtitles.ass → final_with_subtitles.mp4
    │
    ├── Upload to object storage
    │   ├── uploadBuffer(video, 'video/mp4', '{jobId}/final.mp4')
    │   └── uploadBuffer(thumbnail, 'image/jpeg', '{jobId}/thumbnail.jpg')
    │
    └── cleanupTempDir()
```

## Storage Sidecar Usage

- **Endpoint**: `127.0.0.1:1106`
- **Bucket**: Auto-created via `REPL_ID`
- **Paths**: 
  - `/objects/generated/{jobId}/scene-{i}.png`
  - `/objects/generated/{jobId}/scene-{i}.mp3`
  - `/objects/generated/{jobId}/final.mp4`
  - `/objects/generated/{jobId}/thumbnail.jpg`

## DB Schema Usage

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `jobs` | Main job records | id, status, progressPercent, etaSeconds, settings, scenes, videoUrl |
| `job_steps` | Pipeline step tracking | jobId, stepType, status, startedAt, finishedAt, message |
| `assets` | Asset references | jobId, assetType, url, metadata |
| `presets` | Saved configurations | name, contentType, settings |
| `settings` | Key-value config | key, value |

---

## Gap Analysis

### Missing: Job Locking / Leasing
**Risk**: Double-processing if server restarts or multiple workers
**Impact**: Wasted AI costs, corrupted outputs
**Fix**: Add `lockedBy`, `lockedAt`, `leaseExpiresAt`, `lastProgressAt` to jobs table

### Missing: Idempotency / Deterministic Asset Keys
**Risk**: Regenerating expensive assets on resume/retry
**Impact**: Cost leaks
**Fix**: Hash-based asset paths, skip if exists

### Missing: Job Steps Created at Queue Time
**Risk**: UI stepper inconsistent until worker starts
**Impact**: Poor UX
**Fix**: Create steps immediately when job is created

### Missing: Dummy Mode for Testing
**Risk**: Can't verify without AI costs
**Impact**: Development friction, CI/CD issues
**Fix**: Add DUMMY_MODE with deterministic outputs

### Missing: MP4 Integrity Checks
**Risk**: Jobs marked 'completed' with broken MP4
**Impact**: User gets broken videos
**Fix**: ffprobe validation before marking complete

### Missing: Cancel Endpoint
**Risk**: Can't stop runaway jobs
**Impact**: Wasted resources
**Fix**: Add cancel flag + endpoint

### Missing: Stuck Job Detection
**Risk**: Jobs stuck forever in 'running' state
**Impact**: Orphaned jobs
**Fix**: Check lastProgressAt, auto-fail stale jobs

### Missing: Server Restart Resume
**Risk**: Jobs lost on restart
**Impact**: Lost work
**Fix**: Re-enqueue queued/running jobs on boot

### Missing: Step Time Tracking for ETA
**Risk**: Inaccurate ETAs
**Impact**: Poor UX
**Fix**: Persist rolling averages per step/contentType

---

## Reliability Risks

### Queue Restart
- **Current**: In-memory queue lost on restart
- **Fix**: Re-enqueue from DB on boot, use locking to prevent duplicates

### Concurrent Processing
- **Current**: No locking, multiple workers could process same job
- **Fix**: Lease-based locking with expiry

### Orphaned Temp Files
- **Current**: Cleanup on success/error, but crash leaves orphans
- **Fix**: Add startup cleanup of old temp dirs

---

## Cost Leak Risks

### Regenerated Assets
- **Current**: Retry regenerates all assets
- **Fix**: Hash-based paths + skip if exists

### Double Processing
- **Current**: No locking
- **Fix**: Lease-based locking

### No Rate Limits
- **Current**: p-retry exists but not centralized
- **Fix**: Centralized wrapper with p-limit concurrency caps

---

## FFmpeg Risks

### FPS Inconsistency
- **Current**: Uses 25fps, should be 30fps
- **Fix**: Standardize to 30fps

### Subtitle Encoding
- **Current**: ASS format hardcoded
- **Fix**: Keep ASS but ensure proper escaping

### Temp Cleanup
- **Current**: Cleanup on success/error
- **Fix**: Also cleanup on cancel + startup

### No Integrity Check
- **Current**: Assumes ffmpeg success = valid MP4
- **Fix**: Add ffprobe validation (duration, audio, resolution)

---

## Security Risks

### URL Fetch (SSRF Potential)
- **Current**: `downloadFile()` fetches URLs from scene data
- **Risk**: If scene data contains attacker-controlled URLs
- **Mitigation**: Only fetch from `/objects/` paths or validate against allowlist

### Zod Validation
- **Current**: Partial validation on settings
- **Fix**: Ensure all user inputs validated with Zod before processing

### Input Sanitization
- **Current**: Scene text passed to ffmpeg ASS
- **Risk**: ASS injection
- **Mitigation**: Current escaping appears adequate, but review

---

## Summary

| Category | Issues Found | Priority |
|----------|--------------|----------|
| Reliability | 4 | HIGH |
| Cost Leaks | 3 | HIGH |
| FFmpeg | 4 | MEDIUM |
| Security | 3 | MEDIUM |
| UX | 3 | MEDIUM |

**Total Issues**: 17

**Critical Path**:
1. Add job locking/leasing
2. Add idempotency with hash-based keys
3. Fix job steps timing
4. Add MP4 integrity checks
5. Add dummy mode for verification
