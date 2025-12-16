# Multi-Niche AI Shorts Studio

## Overview

This is a full-stack web application for automatically generating TikTok/YouTube Shorts videos using AI-generated media. The app enables single-user content creation across multiple niches (Reddit stories, quizzes, facts, motivational content, etc.) with a complete pipeline for script generation, visual asset creation, audio synthesis, and video rendering.

The system provides full pipeline visibility with job tracking, progress percentages, ETAs, and logs through a clean dashboard interface designed for workflow efficiency.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **File Storage**: Google Cloud Storage integration via Replit Object Storage

### Data Model
Core entities managed through Drizzle schema:
- **Jobs**: Video generation requests with status tracking, progress, and settings
- **JobSteps**: Individual pipeline steps (script, assets_visual, assets_audio, video, caption)
- **Assets**: Generated media files linked to jobs
- **Presets**: Saved configuration templates for quick content creation
- **Settings**: User preferences and defaults

### Video Generation Pipeline
Five-stage processing workflow:
1. **Script Generation**: LLM-powered content creation via OpenAI
2. **Visual Assets**: AI image generation for scenes
3. **Audio Assets**: TTS voiceover synthesis
4. **Video Rendering**: Final MP4 composition with overlays
5. **Caption Generation**: Hashtags and descriptions

### Content Types Supported
Narrative (Reddit stories, horror, fiction), Interactive (would-you-rather, quizzes, riddles), Educational (facts, history, science), and Motivational content categories.

## External Dependencies

### AI Services
- **OpenAI API**: Via Replit AI Integrations for script generation and content creation (GPT-5 model)
- Uses Replit's managed endpoint at `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and type-
- safe queries

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