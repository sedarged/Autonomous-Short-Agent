# Multi-Niche AI Shorts Studio

## Overview

This is a full-stack web application for automatically generating TikTok/YouTube Shorts videos using AI-generated media. The app enables single-user content creation across multiple niches (Reddit stories, quizzes, facts, motivational content, etc.) with a complete pipeline for script generation, visual asset creation, audio synthesis, and video rendering.

The system provides full pipeline visibility with job tracking, progress percentages, ETAs, and logs through a clean dashboard interface designed for workflow efficiency.

### Key Features
- **Duration Control**: 15-300 second video duration with presets for TikTok (60s), YouTube Shorts (90s), and long-form (180s)
- **Multi-Platform Support**: Optimized for TikTok, YouTube Shorts, and Instagram Reels with platform-specific AI guidance
- **8 Caption Styles**: bold, minimal, gradient, neon, typewriter, highlight, shadow, and classic styles
- **Viral Optimization**: Hook strength, pacing style, and CTA controls for maximizing engagement
- **AI Topic Suggestions**: Research-based viral trend recommendations for content ideas
- **Conversational Editing**: Natural language chat interface to modify captions and hashtags post-generation

## IMPORTANT RULES

### Design Freeze
- **MUST follow `design_guidelines.md`** for all UI/UX decisions
- NO redesign unless explicitly broken or missing functionality
- Use existing shadcn components as documented

### No Stock Footage Rule
- **NEVER use stock footage, stock images, or external media**
- All visual assets must be AI-generated via the pipeline
- Placeholder images only for development/testing (via dummy mode)

### Definition of Done
A feature is NOT complete unless ALL of the following are true:
1. `npm run typecheck` passes
2. `npm run verify` passes (golden jobs complete with valid MP4)
3. Real MP4 previews work in UI
4. Progress/ETA/logs update live while jobs run
5. Restart/resume works without double-processing
6. No stock footage usage anywhere

## User Preferences

Preferred communication style: Simple, everyday language.

## Run Commands

### Development
```bash
npm run dev          # Start development server (Express + Vite on port 5000)
npm run typecheck    # Run TypeScript type checking
npm run verify       # Run golden job verification tests (uses dummy mode)
npm run db:push      # Push database schema changes
```

### Production
```bash
npm run build        # Build for production
npm run start        # Start production server
```

## Environment Variables & Secrets

### Required (Auto-managed by Replit)
- `DATABASE_URL` - PostgreSQL connection string
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI API endpoint (Replit managed)
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (Replit managed)

### Optional
- `DUMMY_MODE=true` - Enable dummy mode for testing (no AI costs)
- `NODE_ENV` - 'development' or 'production'

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state with automatic polling for real-time job updates
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design system (Inter + JetBrains Mono fonts, dark/light theme support)
- **Build Tool**: Vite with React plugin and custom Replit integrations

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints under `/api/` prefix
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Background Processing**: Custom video worker for async job processing through a multi-step pipeline
- **File Storage**: Google Cloud Storage integration via Replit Object Storage (sidecar at 127.0.0.1:1106)

### Data Model
Core entities managed through Drizzle schema:
- **Jobs**: Video generation requests with status tracking, progress, locking/leasing, and settings
- **JobSteps**: Individual pipeline steps (script, assets_visual, assets_audio, video, caption)
- **Assets**: Generated media files linked to jobs (hash-based paths for idempotency)
- **Presets**: Saved configuration templates for quick content creation
- **Settings**: User preferences, defaults, and step time averages

### Video Generation Pipeline
Five-stage processing workflow:
1. **Script Generation**: LLM-powered content creation via OpenAI
2. **Visual Assets**: AI image generation for scenes (idempotent with hash-based keys)
3. **Audio Assets**: TTS voiceover synthesis (idempotent with hash-based keys)
4. **Video Rendering**: Final MP4 composition with overlays (1080x1920, 30fps)
5. **Caption Generation**: Hashtags and descriptions

### Pipeline Safety Features
- **Job Locking/Leasing**: Prevents double-processing via DB lease fields
- **Idempotency**: Hash-based asset paths allow safe resume without regeneration
- **MP4 Integrity Checks**: ffprobe validation before marking complete
- **Stuck Job Detection**: Auto-fail jobs with stale lastProgressAt
- **Cancel Support**: Jobs can be cancelled mid-processing

### Content Types Supported
Narrative (Reddit stories, horror, fiction), Interactive (would-you-rather, quizzes, riddles), Educational (facts, history, science), and Motivational content categories.

## External Dependencies

### AI Services
- **OpenAI API**: Via Replit AI Integrations for script generation and content creation (GPT-4o model)
- Uses Replit's managed endpoint at `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and type-safe queries

### File Storage
- **Replit Object Storage**: Google Cloud Storage compatible service for generated video assets and thumbnails
- Accessed via local sidecar endpoint at `127.0.0.1:1106`

### Key NPM Packages
- `@tanstack/react-query`: Server state management with polling
- `@radix-ui/*`: Accessible UI primitives
- `drizzle-orm` + `drizzle-kit`: Database toolkit
- `p-limit` + `p-retry`: Rate limiting and retry logic for AI calls
- `date-fns`: Date formatting utilities
- `zod`: Runtime validation for API inputs

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route pages
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utilities and query client
├── server/                 # Backend Express application
│   ├── routes.ts          # API route handlers
│   ├── storage.ts         # Database storage interface
│   ├── videoWorker.ts     # Job processing pipeline
│   ├── videoRenderer.ts   # FFmpeg video rendering
│   ├── ai.ts              # OpenAI API calls with retry logic
│   └── objectStorage.ts   # Object storage service
├── shared/                 # Shared code between client/server
│   └── schema.ts          # Drizzle schema + Zod validators
├── scripts/               # Utility scripts
│   └── verify.ts          # Golden job verification tests
└── design_guidelines.md   # UI/UX design system documentation
```
