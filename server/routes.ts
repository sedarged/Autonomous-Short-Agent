import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { enqueueJob } from "./videoWorker";
import { objectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertJobSchema, insertPresetSchema, jobSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { randomUUID } from "crypto";

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
        id: randomUUID(),
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
      const newJob = await storage.createJob({
        id: randomUUID(),
        title: originalJob.title,
        contentType: originalJob.contentType,
        settings: originalJob.settings,
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
      const validationResult = insertPresetSchema.safeParse({
        ...req.body,
        id: randomUUID()
      });

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
