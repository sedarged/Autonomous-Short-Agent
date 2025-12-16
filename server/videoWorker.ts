// Video Generation Worker - Background processing for video jobs
import { storage } from "./storage";
import { generateScript, generateImagePrompt, generateImage, generateCaptionAndHashtags, generateSpeech, type TTSVoice } from "./ai";
import { objectStorageService } from "./objectStorage";
import { renderVideo } from "./videoRenderer";
import type { Job, JobStep, JobSettings, ContentType, Scene, JobStatus, StepStatus } from "@shared/schema";
import { randomUUID } from "crypto";

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

// Process a queued job through the pipeline
export async function processJob(jobId: string): Promise<void> {
  console.log(`[Worker] Starting job ${jobId}`);
  
  try {
    const job = await storage.getJob(jobId);
    if (!job) {
      console.error(`[Worker] Job ${jobId} not found`);
      return;
    }

    const settings = job.settings as JobSettings;
    const context: JobContext = { job, settings };

    // Initialize job steps
    await initializeJobSteps(jobId);
    
    // Update job status to running
    await storage.updateJob(jobId, { status: 'running', progressPercent: 0 });

    // Step 1: Generate Script
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
    });

    // Step 2: Generate Visual Assets
    await runStep(jobId, 'assets_visual', async () => {
      await storage.updateJob(jobId, { status: 'generating_assets' });
      
      if (context.scenes && context.scenes.length > 0) {
        const updatedScenes = [...context.scenes];
        
        for (let i = 0; i < updatedScenes.length; i++) {
          const scene = updatedScenes[i];
          
          // Generate image prompt
          const imagePrompt = await generateImagePrompt(
            scene,
            settings.visual?.stylePrompt,
            settings.contentType as ContentType
          );
          updatedScenes[i].backgroundPrompt = imagePrompt;

          // Generate image
          try {
            const imageBuffer = await generateImage(imagePrompt);
            const filename = `${jobId}/scene-${i + 1}.png`;
            const imageUrl = await objectStorageService.uploadBuffer(imageBuffer, 'image/png', filename);
            updatedScenes[i].backgroundAssetUrl = imageUrl;
            
            // Save asset reference
            await storage.createAsset({
              jobId,
              assetType: 'image',
              url: imageUrl,
              metadata: { sceneIndex: i, prompt: imagePrompt }
            });
          } catch (err) {
            console.error(`[Worker] Failed to generate image for scene ${i + 1}:`, err);
            // Continue with placeholder
            updatedScenes[i].backgroundAssetUrl = '';
          }

          // Update progress
          const visualProgress = STEP_WEIGHTS.script + 
            (STEP_WEIGHTS.assets_visual * (i + 1)) / updatedScenes.length;
          await storage.updateJob(jobId, { 
            progressPercent: Math.round(visualProgress),
            scenes: updatedScenes
          });
        }
        
        context.scenes = updatedScenes;
        await storage.updateJob(jobId, { scenes: updatedScenes });
      }
    });

    // Step 3: Generate Audio Assets (TTS using OpenAI)
    await runStep(jobId, 'assets_audio', async () => {
      await storage.updateJob(jobId, { status: 'generating_assets' });
      
      if (context.script && context.scenes && context.scenes.length > 0) {
        const voice = (settings.audio?.voiceModel || 'nova') as TTSVoice;
        const updatedScenes = [...context.scenes];
        
        for (let i = 0; i < updatedScenes.length; i++) {
          const scene = updatedScenes[i];
          const text = scene.voiceSegmentText || scene.textOverlay || '';
          
          if (text.trim()) {
            try {
              const audioBuffer = await generateSpeech(text, voice);
              const filename = `${jobId}/scene-${i + 1}.mp3`;
              const audioUrl = await objectStorageService.uploadBuffer(audioBuffer, 'audio/mpeg', filename);
              updatedScenes[i].audioAssetUrl = audioUrl;
              
              await storage.createAsset({
                jobId,
                assetType: 'audio',
                url: audioUrl,
                metadata: { sceneIndex: i, voice }
              });
            } catch (err) {
              console.error(`[Worker] Failed to generate audio for scene ${i + 1}:`, err);
            }
          }
          
          const audioProgress = STEP_WEIGHTS.script + STEP_WEIGHTS.assets_visual + 
            (STEP_WEIGHTS.assets_audio * (i + 1)) / updatedScenes.length;
          await storage.updateJob(jobId, { 
            progressPercent: Math.round(audioProgress),
            scenes: updatedScenes
          });
        }
        
        context.scenes = updatedScenes;
        await storage.updateJob(jobId, { scenes: updatedScenes });
      }
    });

    // Step 4: Render Video (ffmpeg)
    await runStep(jobId, 'video', async () => {
      await storage.updateJob(jobId, { status: 'rendering_video' });
      
      if (context.scenes && context.scenes.length > 0) {
        try {
          const result = await renderVideo({
            jobId,
            scenes: context.scenes,
            settings
          });
          
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
        } catch (err) {
          console.error(`[Worker] Failed to render video:`, err);
          const videoProgress = STEP_WEIGHTS.script + STEP_WEIGHTS.assets_visual + 
                               STEP_WEIGHTS.assets_audio + STEP_WEIGHTS.video;
          await storage.updateJob(jobId, { 
            progressPercent: videoProgress,
            durationSeconds: (context.scenes?.length || 6) * 5,
            thumbnailUrl: context.scenes?.[0]?.backgroundAssetUrl || undefined
          });
        }
      }
    });

    // Step 5: Generate Caption & Hashtags
    await runStep(jobId, 'caption', async () => {
      await storage.updateJob(jobId, { status: 'generating_caption' });
      
      if (context.script) {
        const { caption, hashtags } = await generateCaptionAndHashtags(
          settings.contentType as ContentType,
          context.script
        );
        
        await storage.updateJob(jobId, { 
          caption,
          hashtags,
          progressPercent: 100
        });
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
    await storage.updateJob(jobId, { 
      status: 'failed',
      errorMessage
    });
  }
}

// Initialize all job steps
async function initializeJobSteps(jobId: string): Promise<void> {
  const stepTypes = ['script', 'assets_visual', 'assets_audio', 'video', 'caption'];
  
  for (const stepType of stepTypes) {
    await storage.createJobStep({
      jobId,
      stepType,
      status: 'queued'
    });
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

  try {
    // Mark step as running
    await storage.updateJobStep(step.id, {
      status: 'running',
      startedAt: new Date()
    });

    // Execute step
    await fn();

    // Mark step as completed
    await storage.updateJobStep(step.id, {
      status: 'completed',
      finishedAt: new Date()
    });
    
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

// Simple in-memory job queue
const jobQueue: string[] = [];
let isProcessing = false;

export function enqueueJob(jobId: string): void {
  jobQueue.push(jobId);
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
