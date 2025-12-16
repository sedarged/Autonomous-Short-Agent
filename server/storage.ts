import { 
  jobs, 
  jobSteps, 
  assets, 
  presets, 
  settings,
  type Job, 
  type InsertJob,
  type JobStep,
  type InsertJobStep,
  type Asset,
  type InsertAsset,
  type Preset,
  type InsertPreset,
  type Setting,
  type InsertSetting,
  type JobWithSteps,
  type JobStatus,
  type StepStatus
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // Jobs
  getJobs(filters?: { contentType?: string; status?: string; limit?: number; offset?: number }): Promise<JobWithSteps[]>;
  getJob(id: string): Promise<JobWithSteps | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined>;
  deleteJob(id: string): Promise<void>;

  // Job Steps
  getJobSteps(jobId: string): Promise<JobStep[]>;
  createJobStep(step: InsertJobStep): Promise<JobStep>;
  updateJobStep(id: string, updates: Partial<JobStep>): Promise<JobStep | undefined>;

  // Assets
  getAssets(jobId: string): Promise<Asset[]>;
  createAsset(asset: InsertAsset): Promise<Asset>;

  // Presets
  getPresets(): Promise<Preset[]>;
  getPreset(id: string): Promise<Preset | undefined>;
  createPreset(preset: InsertPreset): Promise<Preset>;
  updatePreset(id: string, updates: Partial<Preset>): Promise<Preset | undefined>;
  deletePreset(id: string): Promise<void>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  getAllSettings(): Promise<Record<string, unknown>>;
  setSetting(key: string, value: unknown): Promise<Setting>;
}

export class DatabaseStorage implements IStorage {
  // Jobs
  async getJobs(filters?: { contentType?: string; status?: string; limit?: number; offset?: number }): Promise<JobWithSteps[]> {
    const conditions = [];
    
    if (filters?.contentType) {
      conditions.push(eq(jobs.contentType, filters.contentType));
    }
    if (filters?.status) {
      conditions.push(eq(jobs.status, filters.status));
    }

    const query = db
      .select()
      .from(jobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(jobs.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    const jobsResult = await query;

    // Fetch steps for each job
    const jobsWithSteps: JobWithSteps[] = await Promise.all(
      jobsResult.map(async (job) => {
        const steps = await this.getJobSteps(job.id);
        return { ...job, steps };
      })
    );

    return jobsWithSteps;
  }

  async getJob(id: string): Promise<JobWithSteps | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return undefined;
    
    const steps = await this.getJobSteps(id);
    const jobAssets = await this.getAssets(id);
    return { ...job, steps, assets: jobAssets };
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const [updated] = await db
      .update(jobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  // Job Steps
  async getJobSteps(jobId: string): Promise<JobStep[]> {
    return db.select().from(jobSteps).where(eq(jobSteps.jobId, jobId));
  }

  async createJobStep(step: InsertJobStep): Promise<JobStep> {
    const [created] = await db.insert(jobSteps).values(step).returning();
    return created;
  }

  async updateJobStep(id: string, updates: Partial<JobStep>): Promise<JobStep | undefined> {
    const [updated] = await db
      .update(jobSteps)
      .set(updates)
      .where(eq(jobSteps.id, id))
      .returning();
    return updated;
  }

  // Assets
  async getAssets(jobId: string): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.jobId, jobId));
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [created] = await db.insert(assets).values(asset).returning();
    return created;
  }

  // Presets
  async getPresets(): Promise<Preset[]> {
    return db.select().from(presets).orderBy(desc(presets.updatedAt));
  }

  async getPreset(id: string): Promise<Preset | undefined> {
    const [preset] = await db.select().from(presets).where(eq(presets.id, id));
    return preset;
  }

  async createPreset(preset: InsertPreset): Promise<Preset> {
    const [created] = await db.insert(presets).values(preset).returning();
    return created;
  }

  async updatePreset(id: string, updates: Partial<Preset>): Promise<Preset | undefined> {
    const [updated] = await db
      .update(presets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(presets.id, id))
      .returning();
    return updated;
  }

  async deletePreset(id: string): Promise<void> {
    await db.delete(presets).where(eq(presets.id, id));
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async getAllSettings(): Promise<Record<string, unknown>> {
    const allSettings = await db.select().from(settings);
    return allSettings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, unknown>);
  }

  async setSetting(key: string, value: unknown): Promise<Setting> {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(settings).values({ key, value }).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
