# 🎬 AI Shorts Studio

A full-stack web application for automatically generating TikTok/YouTube Shorts videos using AI. Create engaging short-form content across multiple niches with complete pipeline automation.

![Status](https://img.shields.io/badge/status-production--ready-green)
![TypeScript](https://img.shields.io/badge/TypeScript-0_errors-blue)
![Security](https://img.shields.io/badge/security-no_vulnerabilities-green)

---

## ✨ Features

### 🎥 Video Generation
- **16 Content Types**: Reddit stories, facts, quizzes, motivational content, and more
- **AI-Powered Pipeline**: Script generation, image creation, voice synthesis, video rendering
- **Duration Control**: 15-300 seconds with platform-specific presets
- **8 Caption Styles**: From minimal to neon glow effects

### 🚀 Production-Ready Infrastructure
- **Job Locking**: Prevents double-processing on server restarts
- **Idempotent Operations**: Resume failed jobs without regenerating assets
- **Cancel Anytime**: Stop jobs mid-processing with proper cleanup
- **Real-time Progress**: Live updates with accurate ETA estimates

### 🎨 User Experience
- **Clean Dashboard**: Track all jobs with progress bars and status
- **Conversational Editing**: Modify captions/hashtags with natural language
- **Trend Research**: AI-powered viral content suggestions
- **Preset System**: Save and reuse favorite configurations

---

## 🏗️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **TanStack Query** for server state management
- **shadcn/ui** components with Tailwind CSS
- **Wouter** for lightweight routing

### Backend
- **Express.js** with TypeScript
- **Drizzle ORM** with PostgreSQL
- **OpenAI API** for AI generation
- **FFmpeg** for video rendering
- **Google Cloud Storage** for asset management

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database
- FFmpeg installed
- OpenAI API access

### Installation

```bash
# Clone the repository
git clone https://github.com/sedarged/Autonomous-Short-Agent.git
cd Autonomous-Short-Agent

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:password@host:port/database
AI_INTEGRATIONS_OPENAI_API_KEY=your-openai-api-key

# Optional
DUMMY_MODE=true  # Enable for testing without API costs
NODE_ENV=development
PORT=5000
```

### Development

```bash
# Start development server (port 5000)
npm run dev

# Run TypeScript checks
npm run check

# Run verification tests
npm run verify
```

### Production

```bash
# Build for production
npm run build

# Start production server
npm run start
```

---

## 📖 Documentation

- **[replit.md](replit.md)** - Comprehensive system documentation
- **[design_guidelines.md](design_guidelines.md)** - UI/UX design rules
- **[AUDIT_REPORT.md](AUDIT_REPORT.md)** - Architecture and gap analysis
- **[FINAL_AUDIT_SUMMARY.md](FINAL_AUDIT_SUMMARY.md)** - Complete audit results

---

## 🎯 Content Types

| Type | Description | Use Case |
|------|-------------|----------|
| Reddit Story | AITA, confessions | High engagement narratives |
| Facts | Interesting trivia | Educational viral content |
| Would You Rather | Choice questions | Interactive engagement |
| Quiz/Trivia | Multiple choice | Gamified content |
| Motivation | Inspirational quotes | Positive viral content |
| Mini History | Historical events | Educational shorts |
| Two Sentence Horror | Micro horror stories | Niche horror community |
| ...and 9 more | | |

---

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run check        # TypeScript type checking
npm run verify       # Run golden job tests
npm run db:push      # Push database schema changes
```

---

## 🏛️ Architecture

### Video Generation Pipeline
1. **Script Generation** - AI creates content based on type and config
2. **Visual Assets** - Generate images for each scene (idempotent)
3. **Audio Assets** - Text-to-speech for voiceover (idempotent)
4. **Video Rendering** - Compose final video with FFmpeg
5. **Caption Generation** - Create viral caption and hashtags

### Database Schema
- **jobs** - Video generation requests with locking
- **job_steps** - Pipeline step tracking
- **assets** - Generated media files
- **presets** - Saved configurations
- **settings** - User preferences and defaults

---

## 🧪 Testing

### Golden Job Verification

```bash
# Start server in dummy mode (no API costs)
DUMMY_MODE=true npm run dev

# In another terminal, run verification
npm run verify
```

Expected output:
```
✅ Facts Golden Job PASSED
✅ Would You Rather Golden Job PASSED
✅ Short Story Golden Job PASSED

📊 VERIFICATION SUMMARY
   Total: 3
   Passed: 3
   Failed: 0
```

---

## 🔒 Security

- ✅ No SQL injection (parameterized queries)
- ✅ No XSS vulnerabilities (React auto-escaping)
- ✅ Input validation with Zod
- ✅ Proper error handling
- ✅ No secrets in code
- ✅ Production-safe configuration

---

## 📊 Status

| Metric | Status |
|--------|--------|
| TypeScript Compilation | ✅ 0 errors |
| Build Process | ✅ Working |
| Security Vulnerabilities | ✅ None (production) |
| Code Quality | ✅ Excellent |
| Documentation | ✅ Complete |
| Production Ready | ✅ Yes |

---

## 🤝 Contributing

This is a single-user content creation tool. For bug reports or feature requests, please open an issue.

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- OpenAI for GPT-4 and DALL-E APIs
- FFmpeg for video processing
- shadcn/ui for beautiful components
- Replit for hosting infrastructure

---

## 📧 Support

For issues or questions:
1. Check the [documentation](replit.md)
2. Review [audit reports](AUDIT_REPORT.md)
3. Open an issue on GitHub

---

**Built with ❤️ for content creators**
