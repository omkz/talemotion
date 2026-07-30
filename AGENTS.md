# Repository Guidelines

## Project Structure & Module Organization

Talemotion is a frontend-only Next.js prototype for AI video generation. App Router pages live in `src/app/`; keep route files thin and place feature logic in `src/components/`. Components are grouped by domain, such as `projects/`, `storyboard/`, and `generation/`; reusable primitives belong in `shared/` or `ui/`.

Domain types live in `src/types/`. Static fixtures are in `src/lib/mock-data/`, while `src/lib/mock-api/` simulates backend operations and persistence. UI code should call the mock API rather than import mock data directly. Static browser assets belong in `public/`, and global theme tokens are defined in `src/app/globals.css`.

## Build, Test, and Development Commands

Use pnpm, matching `pnpm-lock.yaml`.

- `pnpm install` installs dependencies.
- `pnpm dev` starts the local Next.js development server.
- `pnpm run lint` runs ESLint with Next.js and TypeScript rules.
- `pnpm exec tsc --noEmit` performs a standalone strict type check.
- `pnpm build` creates a production build and catches integration/type errors.
- `pnpm start` serves an existing production build.

## Coding Style & Naming Conventions

Write strict TypeScript and functional React components. Follow the existing style: two-space indentation, double quotes, semicolons, and Tailwind utilities. Use kebab-case filenames (`scene-card.tsx`), PascalCase component/type names, and camelCase functions and variables. Import project modules through the `@/*` alias. Preserve the `mock-api` boundary and reuse shared/UI components before adding variants.

## Testing Guidelines

No automated test framework or coverage threshold is configured. Before submitting changes, run lint, the TypeScript check, and a production build. If tests are introduced, colocate them with the feature using names such as `scene-card.test.tsx`, and add the runner command to `package.json`. Manually verify affected workflows and describe that verification in the pull request.

## Commit & Pull Request Guidelines

The current history uses a concise, imperative summary (for example, `Initial Talemotion AI video prototype (Next.js + shadcn/ui)`). Keep commit subjects focused and include context in the body when behavior is non-obvious.

Pull requests should explain the user-visible change, identify affected routes/components, and list validation commands. Link relevant issues and include screenshots or recordings for visual changes. Call out changes to mock behavior, persistence, or dependencies explicitly.

## Configuration & Prototype Constraints

Do not commit secrets or generated `.next/` output. This prototype has no real backend, authentication, storage, or AI provider; implement plausible simulated behavior through `src/lib/mock-api/`. Preserve the dark cinematic theme and restrained amber accent unless a design change is explicitly requested.


## Browser policy

Do not use Chrome DevTools, Playwright, Puppeteer, browser automation,
screenshots, computer-use tools, or browser-related MCP servers unless
the user explicitly requests browser testing.

Do not launch a development server solely for visual inspection.

For normal frontend work, verify changes using:

- pnpm run lint
- npx tsc --noEmit
- pnpm build

When browser verification might be useful, report it as a manual
verification step instead of running browser tools automatically.
