import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Content Types - all supported video types
export const contentTypes = [
  'reddit_story',
  'aita_story',
  'two_sentence_horror',
  'short_story_generic',
  'would_you_rather',
  'this_or_that',
  'quiz_trivia',
  'riddles',
  'guessing_game',
  'facts',
  'top_list',
  'motivation',
  'affirmations',
  'language_mini_lesson',
  'mini_history',
  'science_mini_fact'
] as const;

export type ContentType = typeof contentTypes[number];

// Content types that require premium AI models (narrative/creative content)
export const premiumContentTypes: ContentType[] = [
  'reddit_story', 'aita_story', 'two_sentence_horror', 'short_story_generic',
  'motivation', 'mini_history'
];

// Job Status
export const jobStatuses = [
  'queued',
  'running',
  'generating_script',
  'generating_assets',
  'rendering_video',
  'generating_caption',
  'completed',
  'failed'
] as const;

export type JobStatus = typeof jobStatuses[number];

// Step Status
export const stepStatuses = [
  'queued',
  'running',
  'completed',
  'failed'
] as const;

export type StepStatus = typeof stepStatuses[number];

// Visual Generator Type
export const visualGeneratorTypes = ['image_sequence', 'looping_clip', 'mixed'] as const;
export type VisualGeneratorType = typeof visualGeneratorTypes[number];

// Target Platforms
export const targetPlatforms = ['tiktok', 'youtube_shorts', 'both'] as const;
export type TargetPlatform = typeof targetPlatforms[number];

// Caption Styles - different visual styles for subtitles
export const captionStyles = [
  'minimal',      // Clean, simple white text
  'bold_shadow',  // Bold text with drop shadow
  'gradient_pop', // Gradient colored text with pop effect
  'karaoke',      // Word-by-word highlight animation style
  'neon_glow',    // Neon glow effect
  'comic_bold',   // Comic book style bold text
  'elegant',      // Elegant serif with subtle animation
  'street'        // Urban/street style with motion
] as const;
export type CaptionStyle = typeof captionStyles[number];

// Video duration presets
export const durationPresets = [
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '60 seconds' },
  { value: 90, label: '90 seconds (Recommended)' },
  { value: 120, label: '2 minutes' },
  { value: 180, label: '3 minutes' }
] as const;

// Zod Schemas for Settings
export const visualSettingsSchema = z.object({
  generatorType: z.enum(visualGeneratorTypes).default('image_sequence'),
  stylePrompt: z.string().optional(),
  aspectRatio: z.literal('9:16').default('9:16'),
  fps: z.number().int().min(24).max(60).default(30),
  scenesPerMinute: z.number().int().min(2).max(12).default(6),
  allowCharacterCloseups: z.boolean().default(true)
});

export const audioSettingsSchema = z.object({
  voiceModel: z.string().default('alloy'),
  speakingStyle: z.string().optional(),
  language: z.enum(['en', 'pl', 'mixed']).default('en'),
  musicMode: z.enum(['none', 'ai_music', 'loop_from_library']).default('none'),
  musicPrompt: z.string().optional(),
  duckMusicUnderVoice: z.boolean().default(true)
});

export const subtitleSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  style: z.enum(captionStyles).default('minimal'),
  position: z.enum(['bottom', 'center', 'top']).default('bottom'),
  fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  animation: z.enum(['none', 'fade', 'pop', 'slide']).default('pop')
});

export const jobSettingsSchema = z.object({
  presetId: z.string().optional(),
  contentType: z.enum(contentTypes),
  contentConfig: z.record(z.any()).default({}),
  // Duration and platform settings
  targetDurationSeconds: z.number().int().min(15).max(300).default(90), // Default 90s for best viral potential
  targetPlatform: z.enum(targetPlatforms).default('both'),
  // Generation settings
  visual: visualSettingsSchema.default({}),
  audio: audioSettingsSchema.default({}),
  subtitles: subtitleSettingsSchema.default({}),
  // Viral optimization settings
  viralOptimization: z.object({
    hookStrength: z.enum(['subtle', 'medium', 'strong']).default('strong'), // How attention-grabbing the opening is
    pacingStyle: z.enum(['slow', 'medium', 'fast']).default('fast'), // Pacing for engagement
    ctaEnabled: z.boolean().default(true) // Call-to-action at end
  }).default({})
});

export type VisualSettings = z.infer<typeof visualSettingsSchema>;
export type AudioSettings = z.infer<typeof audioSettingsSchema>;
export type SubtitleSettings = z.infer<typeof subtitleSettingsSchema>;
export type JobSettings = z.infer<typeof jobSettingsSchema>;

// Scene model
export const sceneSchema = z.object({
  id: z.string(),
  index: z.number(),
  startTime: z.number(),
  endTime: z.number(),
  textOverlay: z.string().optional(),
  voiceSegmentText: z.string().optional(),
  backgroundPrompt: z.string().optional(),
  backgroundAssetUrl: z.string().optional(),
  audioAssetUrl: z.string().optional()
});

export type Scene = z.infer<typeof sceneSchema>;

// Database Tables

// Users table (keep for auth if needed later)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Jobs table
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: text("status").notNull().default('queued'),
  contentType: text("content_type").notNull(),
  settings: jsonb("settings").notNull(),
  scriptText: text("script_text"),
  scenes: jsonb("scenes"),
  caption: text("caption"),
  hashtags: text("hashtags").array(),
  videoUrl: text("video_url"),
  audioUrl: text("audio_url"),
  subtitlesUrl: text("subtitles_url"),
  thumbnailUrl: text("thumbnail_url"),
  durationSeconds: integer("duration_seconds"),
  progressPercent: integer("progress_percent").notNull().default(0),
  etaSeconds: integer("eta_seconds"),
  errorMessage: text("error_message"),
  // Locking/leasing fields for preventing double-processing
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  lastProgressAt: timestamp("last_progress_at"),
  cancelRequested: boolean("cancel_requested").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Job Steps table
export const jobSteps = pgTable("job_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  stepType: text("step_type").notNull(),
  status: text("status").notNull().default('queued'),
  message: text("message"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  etaSeconds: integer("eta_seconds"),
  durationMs: integer("duration_ms")
});

// Assets table
export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  assetType: text("asset_type").notNull(),
  url: text("url").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// Presets table
export const presets = pgTable("presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  contentType: text("content_type").notNull(),
  settings: jsonb("settings").notNull(),
  defaultTitleTemplate: text("default_title_template"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Settings table (key-value for global defaults)
export const settings = pgTable("settings", {
  key: varchar("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// Relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  steps: many(jobSteps),
  assets: many(assets)
}));

export const jobStepsRelations = relations(jobSteps, ({ one }) => ({
  job: one(jobs, {
    fields: [jobSteps.jobId],
    references: [jobs.id]
  })
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  job: one(jobs, {
    fields: [assets.jobId],
    references: [jobs.id]
  })
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  settings: jobSettingsSchema
});

export const insertJobStepSchema = createInsertSchema(jobSteps).omit({
  id: true
});

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true
});

export const insertPresetSchema = createInsertSchema(presets).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  settings: jobSettingsSchema
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  updatedAt: true
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export type InsertJobStep = z.infer<typeof insertJobStepSchema>;
export type JobStep = typeof jobSteps.$inferSelect;

export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export type InsertPreset = z.infer<typeof insertPresetSchema>;
export type Preset = typeof presets.$inferSelect;

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Job with relations type
export type JobWithSteps = Job & {
  steps: JobStep[];
  assets?: Asset[];
};

// Content type display info
export const contentTypeInfo: Record<ContentType, { label: string; description: string; icon: string }> = {
  reddit_story: { label: 'Reddit Story', description: 'Reddit-style stories (AITA, confessions, etc.)', icon: 'MessageSquare' },
  aita_story: { label: 'AITA Story', description: 'Am I The A**hole format stories', icon: 'HelpCircle' },
  two_sentence_horror: { label: 'Two Sentence Horror', description: 'Micro horror stories', icon: 'Ghost' },
  short_story_generic: { label: 'Short Story', description: 'Generic short fiction', icon: 'BookOpen' },
  would_you_rather: { label: 'Would You Rather', description: 'Interactive choice questions', icon: 'ArrowLeftRight' },
  this_or_that: { label: 'This or That', description: 'Quick choice comparisons', icon: 'Split' },
  quiz_trivia: { label: 'Quiz/Trivia', description: 'True/False or multiple choice', icon: 'Brain' },
  riddles: { label: 'Riddles', description: 'Brain teasers and puzzles', icon: 'Puzzle' },
  guessing_game: { label: 'Guessing Game', description: 'Guess from hints format', icon: 'Eye' },
  facts: { label: 'Facts', description: 'Interesting facts and shower thoughts', icon: 'Lightbulb' },
  top_list: { label: 'Top List', description: 'Top 5/10 lists', icon: 'ListOrdered' },
  motivation: { label: 'Motivation', description: 'Motivational quotes and stories', icon: 'Flame' },
  affirmations: { label: 'Affirmations', description: 'Positive affirmations', icon: 'Heart' },
  language_mini_lesson: { label: 'Language Lesson', description: 'Quick language phrases', icon: 'Languages' },
  mini_history: { label: 'Mini History', description: 'Historical facts and events', icon: 'Clock' },
  science_mini_fact: { label: 'Science Facts', description: 'Scientific mini facts', icon: 'Atom' }
};

// Caption style display info
export const captionStyleInfo: Record<CaptionStyle, { label: string; description: string }> = {
  minimal: { label: 'Minimal', description: 'Clean white text, simple and readable' },
  bold_shadow: { label: 'Bold Shadow', description: 'Bold text with drop shadow for contrast' },
  gradient_pop: { label: 'Gradient Pop', description: 'Colorful gradient text with pop animation' },
  karaoke: { label: 'Karaoke', description: 'Word-by-word highlight as audio plays' },
  neon_glow: { label: 'Neon Glow', description: 'Glowing neon effect for attention' },
  comic_bold: { label: 'Comic Bold', description: 'Comic book style bold text' },
  elegant: { label: 'Elegant', description: 'Elegant serif font with subtle animation' },
  street: { label: 'Street', description: 'Urban street style with motion effects' }
};

// Platform display info
export const platformInfo: Record<TargetPlatform, { label: string; description: string; maxDuration: number }> = {
  tiktok: { label: 'TikTok', description: 'Optimized for TikTok algorithm', maxDuration: 180 },
  youtube_shorts: { label: 'YouTube Shorts', description: 'Optimized for YouTube Shorts', maxDuration: 60 },
  both: { label: 'Both Platforms', description: 'Works great on TikTok and YouTube Shorts', maxDuration: 60 }
};
