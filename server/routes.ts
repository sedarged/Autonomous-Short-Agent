import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { enqueueJob } from "./videoWorker";
import { objectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertJobSchema, insertPresetSchema, jobSettingsSchema } from "@shared/schema";
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

      // Enqueue for processing
      enqueueJob(job.id);

      res.status(201).json(job);
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

      // Enqueue for processing
      enqueueJob(newJob.id);

      res.status(201).json(newJob);
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

  // Update preset
  app.put("/api/presets/:id", async (req: Request, res: Response) => {
    try {
      const existingPreset = await storage.getPreset(req.params.id);
      
      if (!existingPreset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const updated = await storage.updatePreset(req.params.id, req.body);
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

  // Update settings
  app.put("/api/settings", async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      
      // Save each setting
      for (const [key, value] of Object.entries(updates)) {
        await storage.setSetting(key, value);
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
          cost += 0.005;
        }
        
        const scenes = Array.isArray(job.scenes) ? job.scenes : [];
        const scenesWithAudio = scenes.filter((s: any) => s.audioAssetUrl).length;
        const scriptCharCount = job.scriptText?.length || 0;
        cost += (scriptCharCount / 1000) * 0.015;
        
        const scenesWithImages = scenes.filter((s: any) => s.backgroundAssetUrl).length;
        cost += scenesWithImages * 0.02;
        
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
}
