import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { enqueueJob, initializeJobSteps } from "./videoWorker";
import { objectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertJobSchema, insertPresetSchema, jobSettingsSchema, premiumContentTypes, contentTypes } from "@shared/schema";
import type { ContentType } from "@shared/schema";
import { suggestTrendingTopics, processEditCommand, regenerateCaptionWithFeedback, researchViralTrends, analyzeCompetitor } from "./ai";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // ===================
  // JOBS ROUTES
  // ===================

  // Get all jobs with optional filters
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const { contentType, status, limit, offset } = req.query;
      
      const jobs = await storage.getJobs({
        contentType: contentType as string | undefined,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get single job by ID
  app.get("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const job = await storage.getJob(req.params.id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Create new job
  app.post("/api/jobs", async (req: Request, res: Response) => {
    try {
      const { title, settings } = req.body;

      // Validate settings
      const settingsResult = jobSettingsSchema.safeParse(settings);
      if (!settingsResult.success) {
        const validationError = fromZodError(settingsResult.error);
        return res.status(400).json({ error: validationError.message });
      }

      // Create job
      const job = await storage.createJob({
        title: title || `New ${settings.contentType} Video`,
        contentType: settings.contentType,
        settings: settingsResult.data,
        status: "queued",
        progressPercent: 0
      });

      // Initialize job steps immediately (so UI shows stepper from start)
      await initializeJobSteps(job.id);

      // Enqueue for processing
      enqueueJob(job.id);

      // Refetch job with steps
      const jobWithSteps = await storage.getJob(job.id);
      res.status(201).json(jobWithSteps);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  // Regenerate job (create new job with same settings)
  app.post("/api/jobs/:id/regenerate", async (req: Request, res: Response) => {
    try {
      const originalJob = await storage.getJob(req.params.id);
      
      if (!originalJob) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Create new job with same settings
      const parsedSettings = jobSettingsSchema.parse(originalJob.settings);
      const newJob = await storage.createJob({
        title: originalJob.title,
        contentType: originalJob.contentType,
        settings: parsedSettings,
        status: "queued",
        progressPercent: 0
      });

      // Initialize job steps immediately
      await initializeJobSteps(newJob.id);

      // Enqueue for processing
      enqueueJob(newJob.id);

      // Refetch job with steps
      const jobWithSteps = await storage.getJob(newJob.id);
      res.status(201).json(jobWithSteps);
    } catch (error) {
      console.error("Error regenerating job:", error);
      res.status(500).json({ error: "Failed to regenerate job" });
    }
  });

  // Delete job
  app.delete("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const job = await storage.getJob(req.params.id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      await storage.deleteJob(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Cancel job
  app.post("/api/jobs/:id/cancel", async (req: Request, res: Response) => {
    try {
      const job = await storage.getJob(req.params.id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Can only cancel jobs that are not already completed or failed
      if (job.status === 'completed' || job.status === 'failed') {
        return res.status(400).json({ error: "Cannot cancel completed or failed job" });
      }

      await storage.updateJob(req.params.id, { cancelRequested: true });
      res.json({ success: true, message: "Cancel requested" });
    } catch (error) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ error: "Failed to cancel job" });
    }
  });

  // ===================
  // PRESETS ROUTES
  // ===================

  // Get all presets
  app.get("/api/presets", async (_req: Request, res: Response) => {
    try {
      const presets = await storage.getPresets();
      res.json(presets);
    } catch (error) {
      console.error("Error fetching presets:", error);
      res.status(500).json({ error: "Failed to fetch presets" });
    }
  });

  // Get single preset
  app.get("/api/presets/:id", async (req: Request, res: Response) => {
    try {
      const preset = await storage.getPreset(req.params.id);
      
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      res.json(preset);
    } catch (error) {
      console.error("Error fetching preset:", error);
      res.status(500).json({ error: "Failed to fetch preset" });
    }
  });

  // Create preset
  app.post("/api/presets", async (req: Request, res: Response) => {
    try {
      const validationResult = insertPresetSchema.safeParse(req.body);

      if (!validationResult.success) {
        const validationError = fromZodError(validationResult.error);
        return res.status(400).json({ error: validationError.message });
      }

      const preset = await storage.createPreset(validationResult.data);
      res.status(201).json(preset);
    } catch (error) {
      console.error("Error creating preset:", error);
      res.status(500).json({ error: "Failed to create preset" });
    }
  });

  // Schema for updating presets - only allow specific fields
  const presetUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    contentType: z.enum(contentTypes).optional(),
    settings: jobSettingsSchema.optional(),
  }).strict();

  // Update preset
  app.put("/api/presets/:id", async (req: Request, res: Response) => {
    try {
      const existingPreset = await storage.getPreset(req.params.id);
      
      if (!existingPreset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      // Validate update data
      const validationResult = presetUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromZodError(validationResult.error);
        return res.status(400).json({ error: validationError.message });
      }

      const updated = await storage.updatePreset(req.params.id, validationResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating preset:", error);
      res.status(500).json({ error: "Failed to update preset" });
    }
  });

  // Delete preset
  app.delete("/api/presets/:id", async (req: Request, res: Response) => {
    try {
      const preset = await storage.getPreset(req.params.id);
      
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      await storage.deletePreset(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting preset:", error);
      res.status(500).json({ error: "Failed to delete preset" });
    }
  });

  // ===================
  // AI SUGGESTIONS ROUTES
  // ===================

  // Get trending topic suggestions for a content type
  app.get("/api/suggestions/topics/:contentType", async (req: Request, res: Response) => {
    try {
      const contentType = req.params.contentType as ContentType;
      
      // Validate content type
      if (!contentTypes.includes(contentType as any)) {
        return res.status(400).json({ error: "Invalid content type" });
      }

      const suggestions = await suggestTrendingTopics(contentType);
      res.json(suggestions);
    } catch (error) {
      console.error("Error getting topic suggestions:", error);
      res.status(500).json({ error: "Failed to get topic suggestions" });
    }
  });

  // ===================
  // JOB EDITS ROUTES (Conversational Editing)
  // ===================

  // Get edit history for a job
  app.get("/api/jobs/:id/edits", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const edits = await storage.getJobEdits(jobId);
      res.json(edits);
    } catch (error) {
      console.error("Error fetching job edits:", error);
      res.status(500).json({ error: "Failed to fetch job edits" });
    }
  });

  // Create a new edit message (conversational editing)
  app.post("/api/jobs/:id/edits", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== 'completed') {
        return res.status(400).json({ error: "Can only edit completed videos" });
      }

      // Save user message
      const userEdit = await storage.createJobEdit({
        jobId,
        role: 'user',
        message
      });

      // Process with AI
      const aiResult = await processEditCommand(message, {
        scriptText: job.scriptText || undefined,
        caption: job.caption || undefined,
        hashtags: job.hashtags || undefined,
        contentType: job.contentType
      });

      // Execute commands that can be applied immediately
      let updatedCaption = job.caption;
      let updatedHashtags = job.hashtags;
      const appliedChanges: string[] = [];

      for (const command of aiResult.commands) {
        if (command.action === 'regenerate_caption' || command.action === 'update_caption') {
          // Regenerate caption with user feedback
          try {
            const result = await regenerateCaptionWithFeedback(
              job.contentType as ContentType,
              job.scriptText || '',
              job.caption || undefined,
              job.hashtags || undefined,
              message
            );
            updatedCaption = result.caption;
            updatedHashtags = result.hashtags;
            appliedChanges.push('caption and hashtags updated');
          } catch (err) {
            console.error('Failed to regenerate caption:', err);
          }
        }
      }

      // Apply changes to job if any commands were executed
      if (appliedChanges.length > 0) {
        await storage.updateJob(jobId, {
          caption: updatedCaption,
          hashtags: updatedHashtags
        });
      }

      // Save AI response with applied changes note
      const responseMessage = appliedChanges.length > 0
        ? `${aiResult.response}\n\n[Changes applied: ${appliedChanges.join(', ')}]`
        : aiResult.response;

      const assistantEdit = await storage.createJobEdit({
        jobId,
        role: 'assistant',
        message: responseMessage,
        editCommand: aiResult.commands.length > 0 ? aiResult.commands : null,
        affectedStages: aiResult.commands.map(c => c.targetStage).filter(Boolean) as string[]
      });

      // Get the full updated job for the response
      const updatedJob = appliedChanges.length > 0 ? await storage.getJob(jobId) : null;

      res.status(201).json({
        userMessage: userEdit,
        assistantResponse: assistantEdit,
        commands: aiResult.commands,
        appliedChanges,
        updatedJob
      });
    } catch (error) {
      console.error("Error processing edit:", error);
      res.status(500).json({ error: "Failed to process edit" });
    }
  });

  // ===================
  // SETTINGS ROUTES
  // ===================

  // Get all settings
  app.get("/api/settings", async (_req: Request, res: Response) => {
    try {
      const allSettings = await storage.getAllSettings();
      
      // Return with defaults
      const defaultSettings = {
        defaultVoice: "alloy",
        defaultLanguage: "en",
        defaultScenesPerMinute: 6,
        defaultSubtitlesEnabled: true,
        defaultSubtitleStyle: "clean",
        autoPollingInterval: 15,
        maxConcurrentJobs: 2,
        ...allSettings
      };
      
      res.json(defaultSettings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Schema for allowed settings - prevents arbitrary key injection
  const settingsUpdateSchema = z.object({
    defaultVoice: z.string().optional(),
    defaultLanguage: z.enum(["en", "pl", "mixed"]).optional(),
    defaultScenesPerMinute: z.number().min(2).max(12).optional(),
    defaultSubtitlesEnabled: z.boolean().optional(),
    defaultSubtitleStyle: z.enum(["clean", "karaoke", "bold_outline"]).optional(),
    autoPollingInterval: z.number().min(5).max(60).optional(),
    maxConcurrentJobs: z.number().min(1).max(5).optional(),
    budgetMode: z.boolean().optional(),
    isMonetized: z.boolean().optional(),
  }).strict(); // Reject any unknown keys

  // Update settings
  app.put("/api/settings", async (req: Request, res: Response) => {
    try {
      // Validate settings against allowed schema
      const validationResult = settingsUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromZodError(validationResult.error);
        return res.status(400).json({ error: validationError.message });
      }

      const updates = validationResult.data;
      
      // Save each validated setting
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          await storage.setSetting(key, value);
        }
      }

      const allSettings = await storage.getAllSettings();
      res.json(allSettings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ===================
  // ANALYTICS ROUTES
  // ===================

  app.get("/api/analytics", async (_req: Request, res: Response) => {
    try {
      const allJobs = await storage.getJobs({});
      
      const completedJobs = allJobs.filter(j => j.status === "completed");
      const failedJobs = allJobs.filter(j => j.status === "failed");
      const processingJobs = allJobs.filter(j => 
        !["completed", "failed", "queued"].includes(j.status)
      );
      
      const successRate = allJobs.length > 0 
        ? (completedJobs.length / allJobs.length) * 100 
        : 0;
      
      const durationsWithValue = completedJobs
        .filter(j => j.durationSeconds && j.durationSeconds > 0)
        .map(j => j.durationSeconds!);
      const avgDurationSeconds = durationsWithValue.length > 0
        ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length
        : 0;
      
      const totalVideoDurationMinutes = durationsWithValue.reduce((a, b) => a + b, 0) / 60;
      
      const processingTimesMinutes = completedJobs
        .map(j => {
          if (!j.createdAt) return null;
          const created = new Date(j.createdAt);
          if (isNaN(created.getTime())) return null;
          
          const finishedSteps = j.steps
            ?.filter(s => s.finishedAt)
            .map(s => new Date(s.finishedAt!).getTime())
            .filter(t => !isNaN(t)) || [];
          
          if (finishedSteps.length > 0) {
            const lastFinished = Math.max(...finishedSteps);
            return (lastFinished - created.getTime()) / (1000 * 60);
          }
          
          if (j.updatedAt) {
            const updated = new Date(j.updatedAt);
            if (!isNaN(updated.getTime())) {
              return (updated.getTime() - created.getTime()) / (1000 * 60);
            }
          }
          return null;
        })
        .filter((t): t is number => t !== null && t > 0);
      
      const avgProcessingTimeMinutes = processingTimesMinutes.length > 0
        ? processingTimesMinutes.reduce((a, b) => a + b, 0) / processingTimesMinutes.length
        : 0;
      
      const contentTypeBreakdown: Record<string, number> = {};
      const statusBreakdown: Record<string, number> = {};
      
      for (const job of allJobs) {
        contentTypeBreakdown[job.contentType] = (contentTypeBreakdown[job.contentType] || 0) + 1;
        statusBreakdown[job.status] = (statusBreakdown[job.status] || 0) + 1;
      }
      
      const last7Days: { date: string; count: number }[] = [];
      const now = new Date();
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const count = allJobs.filter(j => {
          if (!j.createdAt) return false;
          const jobDateObj = new Date(j.createdAt);
          if (isNaN(jobDateObj.getTime())) return false;
          const jobDate = jobDateObj.toISOString().split('T')[0];
          return jobDate === dateStr;
        }).length;
        
        last7Days.push({ date: dateStr, count });
      }
      
      const estimateCost = (job: typeof allJobs[0]): number => {
        if (!['completed', 'failed'].includes(job.status)) return 0;
        
        let cost = 0;
        
        const hasCompletedScript = job.steps?.some(s => s.stepType === 'script' && s.status === 'completed');
        if (hasCompletedScript && job.scriptText) {
          const isPremium = premiumContentTypes.includes(job.contentType as any);
          cost += isPremium ? 0.005 : 0.0005;
        }
        
        const scenes = Array.isArray(job.scenes) ? job.scenes : [];
        const scriptCharCount = job.scriptText?.length || 0;
        cost += (scriptCharCount / 1000) * 0.015;
        
        const scenesWithImages = scenes.filter((s: any) => s.backgroundAssetUrl).length;
        cost += scenesWithImages * 0.02;
        
        cost += 0.0002;
        
        return cost;
      };
      
      const jobsWithCosts = allJobs.filter(j => ['completed', 'failed'].includes(j.status));
      const totalEstimatedCost = jobsWithCosts.reduce((sum, job) => sum + estimateCost(job), 0);
      const avgCostPerVideo = jobsWithCosts.length > 0 ? totalEstimatedCost / jobsWithCosts.length : 0;
      
      res.json({
        totalJobs: allJobs.length,
        completedJobs: completedJobs.length,
        failedJobs: failedJobs.length,
        processingJobs: processingJobs.length,
        successRate,
        avgDurationSeconds,
        totalEstimatedCost,
        avgCostPerVideo,
        avgProcessingTimeMinutes,
        contentTypeBreakdown,
        statusBreakdown,
        last7Days,
        totalVideoDurationMinutes
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ===================
  // OBJECT STORAGE ROUTES
  // ===================

  // Get upload URL
  app.get("/api/upload-url", async (_req: Request, res: Response) => {
    try {
      const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadUrl });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve object storage files
  app.get("/objects/*", async (req: Request, res: Response) => {
    try {
      const objectPath = req.path;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      
      // Check access
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        requestedPermission: ObjectPermission.READ
      });

      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      console.error("Error serving object:", error);
      res.status(500).json({ error: "Failed to serve object" });
    }
  });

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===================
  // TREND RESEARCH ROUTES
  // ===================

  // Research viral trends for a niche
  app.post("/api/trends/research", async (req: Request, res: Response) => {
    try {
      const { niche, platform } = req.body;
      
      if (!niche || typeof niche !== 'string') {
        return res.status(400).json({ error: "Niche is required" });
      }

      const validPlatforms = ['tiktok', 'youtube_shorts', 'both'];
      const selectedPlatform = validPlatforms.includes(platform) ? platform : 'both';

      const results = await researchViralTrends(niche, selectedPlatform);
      res.json(results);
    } catch (error) {
      console.error("Error researching trends:", error);
      res.status(500).json({ error: "Failed to research trends" });
    }
  });

  // Analyze competitor channel
  app.post("/api/trends/competitor", async (req: Request, res: Response) => {
    try {
      const { channelIdentifier, platform } = req.body;
      
      if (!channelIdentifier || typeof channelIdentifier !== 'string') {
        return res.status(400).json({ error: "Channel identifier is required" });
      }

      const validPlatforms = ['tiktok', 'youtube'];
      const selectedPlatform = validPlatforms.includes(platform) ? platform : 'youtube';

      const results = await analyzeCompetitor(channelIdentifier, selectedPlatform);
      res.json(results);
    } catch (error) {
      console.error("Error analyzing competitor:", error);
      res.status(500).json({ error: "Failed to analyze competitor" });
    }
  });
}
