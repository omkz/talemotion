# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Talemotion is a **frontend-only prototype** of an AI video generation product. It turns an idea, story, historical topic, or product into a generated short-form video. There is no real backend, database, auth, AI provider, or file storage — everything is simulated by a mock service layer with local React state (and optional `localStorage` persistence). The goal of this codebase is to explore product/UX/visual design before the real generation pipeline exists, so when adding features, prefer plausible simulated behavior over stubs that do nothing.

The domain model intentionally supports future long-form video (`Chapter` → `Scene` → `Asset`), even though the current UI only exposes a single implicit "Main" chapter per project.

## Commands

Package manager: **pnpm**.

```bash
pnpm dev          # start dev server (Next.js + Turbopack)
pnpm build        # production build (also runs the TypeScript check)
pnpm run lint     # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit  # type-check only, no dedicated script exists for this
```

There is no test suite configured in this repo.

Adding shadcn/ui components: `pnpm dlx shadcn@latest add <component>`. Note: this project's `components.json` uses `"style": "radix-nova"` — components use the unified `radix-ui` package (e.g. `import { Dialog as DialogPrimitive } from "radix-ui"`), not individual `@radix-ui/react-*` packages. The `form` registry entry returns empty for this style; `src/components/ui/form.tsx` was hand-written in the standard shadcn shape and imports `{ Label as LabelPrimitive, Slot }` from `"radix-ui"` — follow that pattern if regenerating it.

## Architecture

### Layered structure

```
types/          Domain model (VideoProject, Chapter, Scene, Asset, GenerationJob, Render, ...)
lib/mock-data/  Static seed data — the 4 dashboard projects, incl. the full 5-scene Majapahit storyboard
lib/mock-api/   Simulated service layer (async functions with artificial delay + a module-level store)
components/     UI, grouped by feature area (see below)
app/            Next.js App Router routes — thin wrappers around components/
```

`lib/mock-api` is the seam a real backend would replace. UI components call functions like `listProjects`, `getProject`, `createProject`, `generateStoryboard`, `generateAllScenes`, `regenerateScene`, `renderFinalVideo` — they never touch mock data directly. Keep that boundary intact: new UI features that need data should get it through a new/extended mock-api function, not by importing `lib/mock-data` into a component.

### The mock store

`lib/mock-api/store.ts` holds a module-level `VideoProject[]` array, lazily seeded from `lib/mock-data`, optionally hydrated from/persisted to `localStorage` (key `talemotion.mock-projects.v1`). `replaceProject()` writes a whole project back. Components generally own their own working copy of a `VideoProject` in React state and sync it back to the store via `replaceProject` in a `useEffect` (see `project-workspace.tsx`) rather than calling mutating mock-api functions for every keystroke.

### Simulated generation timing

`lib/mock-api/generation.ts` drives the Generate tab: `generateAllScenes()` kicks off independent, staggered per-scene pipelines (`waiting → generating-image → generating-narration → generating-video → uploading-assets → completed`) using chained `setTimeout`s, not a single promise — this is what lets scenes finish at different times and lets exactly one randomly-chosen scene fail (for the retry-flow demo). It reports progress via callbacks (`onSceneUpdate`, `onOverallProgress`, `onComplete`) rather than resolving once, and returns a cancel function for cleanup on unmount. `regenerateScene()` follows the same staged-progress pattern for a single scene and bumps its version.

### Route ↔ workspace mapping

Routes (`app/projects/page.tsx`, `app/projects/new/page.tsx`, `app/projects/[id]/page.tsx`) are thin — real logic lives in `components/projects/projects-dashboard.tsx`, `components/video-wizard/video-wizard.tsx`, and `components/project/project-workspace.tsx`.

`project-workspace.tsx` is the central orchestrator for `/projects/[id]`: it owns the loaded `VideoProject`, the active workflow tab (Brief/Storyboard/Generate/Final Video), a save-state indicator, and the current `Render`. It threads scene-mutation callbacks down into `StoryboardSection` / `GenerationSection` and computes the header's single contextual primary action (e.g. "Continue to Storyboard" → "Generate All Scenes" → "Render Final Video") from `activeTab` + generation completeness, rather than each section owning its own top-level CTA.

### Wizard → workspace handoff

The `/projects/new` wizard (`components/video-wizard/`) is a single React Hook Form instance spanning all 3 steps, validated with one Zod schema (`schema.ts`) that uses `superRefine` to conditionally require fields based on the selected `VideoMode`, rather than per-step schemas or a discriminated union — this keeps step navigation and `trigger()`-based partial validation simple. **By design, submitting the wizard always provisions/resets the `"majapahit"` project** (`lib/mock-api/projects.ts::createProject`) using whatever brief/output settings were submitted, then routes to `/projects/majapahit` — because Majapahit is the only fixture with a fully hand-written 5-scene storyboard. Arbitrary wizard input does not generate a new bespoke storyboard.

### Styling

Dark-only, cinematic-studio theme — there is no light/dark toggle; `<html className="dark ...">` is hardcoded in `app/layout.tsx`. Theme tokens live in `src/app/globals.css` (OKLCH custom properties feeding Tailwind v4's `@theme inline`). The accent color is a single restrained warm amber (`--accent`); avoid introducing additional saturated colors or gradients — status colors (emerald for success/ready, destructive red for failed) are the only exceptions, used via Tailwind's default palette.

`MediaPlaceholder` (`components/shared/media-placeholder.tsx`) is the one component standing in for all generated media (project thumbnails, scene previews, the final video player) — reuse it rather than building new placeholder treatments.
