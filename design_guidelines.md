# Design Guidelines: Multi-Niche AI Shorts Studio

## Design Approach

**Selected Approach:** Design System + Reference Hybrid
- **Primary Reference:** Linear's clean dashboard aesthetics for job management and status tracking
- **Secondary References:** Notion for content organization, Vercel for modern data displays
- **Rationale:** This is a utility-focused, information-dense productivity tool requiring efficiency, clarity, and professional polish for complex job management workflows

## Core Design Principles

1. **Information Hierarchy First:** Complex data (jobs, pipelines, progress) must be scannable at a glance
2. **Real-time Clarity:** Status changes, progress updates, and ETAs need immediate visual feedback
3. **Workflow Efficiency:** Multi-step video creation process should feel guided and confident
4. **Professional Polish:** Single-user tool that should feel like enterprise-grade software

---

## Typography System

**Font Stack:**
- **Primary:** Inter (via Google Fonts CDN) for UI elements, body text, and data
- **Monospace:** JetBrains Mono for job IDs, timestamps, and technical data

**Scale:**
- Hero/Page titles: `text-3xl font-semibold` (30px)
- Section headers: `text-xl font-semibold` (20px)
- Card titles: `text-lg font-medium` (18px)
- Body/Labels: `text-sm font-medium` (14px)
- Captions/Meta: `text-xs` (12px)
- Technical data: `text-sm font-mono` (14px monospace)

**Weight Distribution:**
- Titles and headers: `font-semibold` (600)
- Labels and buttons: `font-medium` (500)
- Body text and descriptions: `font-normal` (400)

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16** (e.g., `p-4`, `gap-6`, `space-y-8`)

**Grid Structure:**
- Dashboard: 2-column layout with sidebar (256px fixed) + main content area
- Job cards: 3-column grid on desktop (`grid-cols-3`), 2-column tablet (`md:grid-cols-2`), single mobile
- Forms: Single column max-width containers (`max-w-2xl`)

**Container Widths:**
- Page containers: `max-w-7xl mx-auto px-8`
- Form containers: `max-w-2xl`
- Modal content: `max-w-4xl`

**Responsive Breakpoints:**
- Mobile-first base styles
- Tablet: `md:` (768px)
- Desktop: `lg:` (1024px)
- Wide: `xl:` (1280px)

---

## Component Library

### Navigation
**Top Navigation Bar:**
- Fixed height: `h-16`
- Logo/brand left, main nav center, user actions right
- Navigation items: `px-4 py-2 rounded-lg` with subtle interaction states
- Active state: distinct visual indicator (border-bottom or subtle background)

**Sidebar (Dashboard only):**
- Fixed width: `w-64`
- Vertical nav stack with icons + labels
- Section dividers with `text-xs` uppercase labels
- Compact spacing: `space-y-1`

### Cards & Containers
**Job Cards:**
- Border: `border rounded-lg`
- Padding: `p-6`
- Hover: subtle lift effect (`hover:shadow-md transition-shadow`)
- Thumbnail: `aspect-video rounded-md` at top
- Status badge: top-right corner position

**Content Panels:**
- Sections separated by `border-b` dividers
- Consistent padding: `p-8`
- Headers: `pb-4 mb-6 border-b`

### Status & Progress
**Status Badges:**
- Pill shape: `px-3 py-1 rounded-full text-xs font-medium`
- Queued, Running, Completed, Failed states with distinct visual treatment
- Icon + text combination

**Progress Bars:**
- Height: `h-2 rounded-full`
- Container: full width with subtle background
- Smooth animated fill with `transition-all duration-300`
- Percentage label: `text-xs font-medium` displayed adjacent

**Pipeline Visualization:**
- Horizontal stepper/timeline layout
- Steps: circular nodes (`w-10 h-10 rounded-full`) connected by lines
- Active step: pulsing animation
- Completed: checkmark icon
- Failed: alert icon
- Each step includes label below and optional ETA/duration

### Forms & Inputs
**Form Layout:**
- Vertical stack with consistent `space-y-6`
- Labels: `text-sm font-medium mb-2 block`
- Input fields: `w-full px-4 py-2.5 rounded-lg border`
- Helper text: `text-xs mt-1.5`

**Input Types:**
- Text/Number: standard rounded rectangles
- Select dropdowns: custom styled with chevron icon
- Textareas: `min-h-32` with resize capability
- Radio/Checkbox: custom styled with labels
- Toggle switches: modern pill-style switches

**Dynamic Form Sections:**
- Collapsible panels with header + expand icon
- Smooth height transitions
- Clear visual hierarchy between sections

### Buttons
**Primary Action:**
- Size: `px-6 py-2.5 rounded-lg text-sm font-medium`
- Icon + text combination where appropriate
- Loading state: spinner + "Generating..." text

**Secondary/Outline:**
- Border style with transparent background
- Same sizing as primary

**Icon Buttons:**
- Square: `w-10 h-10 rounded-lg`
- Icon centered with `w-5 h-5` size

### Data Display
**Tables:**
- Full width with `border rounded-lg`
- Header: `text-xs font-medium uppercase tracking-wide`
- Row padding: `px-6 py-4`
- Alternating row treatment optional
- Hover: subtle highlight
- Responsive: stack on mobile

**Job Details Timeline:**
- Vertical timeline with left-aligned timestamps
- Step cards indented from timeline
- Connection lines between steps
- Real-time status updates with smooth transitions

### Modals & Overlays
**Modal Structure:**
- Backdrop: semi-transparent overlay
- Content: `rounded-xl shadow-2xl` with `max-w-2xl`
- Header: `px-8 py-6 border-b`
- Body: `px-8 py-6`
- Footer: `px-8 py-6 border-t` with action buttons

### Feedback Elements
**Empty States:**
- Centered icon (large, 48-64px)
- Heading + description
- Primary action button
- Generous vertical spacing: `py-16`

**Loading States:**
- Skeleton loaders matching content structure
- Pulsing animation
- Same dimensions as actual content

**Error Messages:**
- Alert-style containers: `p-4 rounded-lg border-l-4`
- Icon + message layout
- Dismissible when appropriate

---

## Interactions & Animations

**Motion Philosophy:** Purposeful, subtle, performance-focused
- Transitions: `transition-all duration-200 ease-in-out` for most interactive elements
- Progress updates: smooth `duration-300` for filling bars
- Page transitions: minimal, instant content swaps
- Real-time updates: gentle fade-in for new content
- **No decorative animations** - only functional feedback

**Hover States:**
- Cards: subtle shadow elevation
- Buttons: slight opacity change
- Links: underline appear

---

## Page-Specific Layouts

### Dashboard (/)
**Quick Create Panel:**
- Prominent card at top: `p-8 border rounded-xl`
- Single-row form layout with dropdown + input + button
- Preset selector as secondary action

**Jobs Table:**
- Full-width below quick create with `mt-8`
- Filters bar above table: `flex items-center justify-between mb-4`
- Polling indicator: subtle animated icon in corner

### New Video (/new)
**Multi-Step Wizard:**
- Progress indicator at top showing steps 1-5
- Each step: full-width panel with `max-w-2xl mx-auto`
- Clear "Next" / "Back" navigation
- Sticky bottom bar with actions
- Settings panels: accordion-style with expand/collapse

### Job Detail (/jobs/[id])
**Layout:**
- Header: job title, metadata, actions
- Pipeline visualization: horizontal across page width
- Two-column below: Left (script, config), Right (video player, assets)
- Bottom: full-width steps table with logs

---

## Icons & Assets

**Icon Library:** Lucide React (via CDN)
- Consistent 20px (`w-5 h-5`) for UI icons
- 24px (`w-6 h-6`) for section headers
- 16px (`w-4 h-4`) for inline icons

**Thumbnails & Media:**
- Aspect ratio: `aspect-video` (16:9) for thumbnails
- Loading: skeleton with pulsing background
- Rounded corners: `rounded-md` or `rounded-lg`

---

## Accessibility

- All interactive elements keyboard navigable
- Focus states: visible ring with offset
- ARIA labels on icon-only buttons
- Form validation: inline error messages
- Status changes: announced to screen readers
- Minimum touch targets: 44x44px

This design system creates a professional, efficient dashboard experience optimized for managing complex video generation workflows with real-time feedback and data-dense displays.