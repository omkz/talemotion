# Repository Guidelines

## Project Structure

TaleMotion has two application roots. `frontend/` contains the Next.js App
Router application, domain types, feature components, and current mock service
layer. `backend/` contains the FastAPI service and future worker code.
API documentation remains in `docs/`.

Within the frontend, routes live in `frontend/src/app/`, feature logic in
`frontend/src/components/`, domain types in `frontend/src/types/`, fixtures in
`frontend/src/lib/mock-data/`, and simulated services in
`frontend/src/lib/mock-api/`. Preserve the mock-service boundary.

Within the backend, versioned routes belong in `backend/app/api/`, core
configuration in `backend/app/core/`, future tasks in `backend/app/tasks/`,
pipelines in `backend/app/pipelines/`, and provider adapters in
`backend/app/integrations/`. The API server and worker share this codebase but
run as separate processes.

## Development and Verification

Run frontend commands from `frontend/`:

- `pnpm install`
- `pnpm run lint`
- `npx tsc --noEmit`
- `pnpm build`

Run backend commands from `backend/`:

- `uv sync`
- `uv run ruff check .`
- `uv run pytest`
- `uv run fastapi dev app/main.py`

Do not launch a development server solely for visual inspection. Do not use
browser automation unless the user explicitly requests it.

## Coding Conventions

Frontend code uses strict TypeScript, functional React, two-space indentation,
double quotes, semicolons, kebab-case filenames, PascalCase components/types,
and the `@/*` alias. Keep route files thin and reuse shared components.

Backend code targets Python 3.12 and follows Ruff formatting and lint rules.
Use snake_case for modules/functions, PascalCase for classes, type annotations
for public functions, and Pydantic models for API boundaries.

## Tests and Changes

Frontend changes must pass lint, TypeScript, and production build checks.
Backend changes must pass Ruff and pytest. Keep commits focused and use concise
imperative subjects. Pull requests should explain behavior, list validation
commands, and include visual evidence only when browser review was explicitly
performed.

Never commit secrets, local environment files, build output, virtual
environments, or dependency directories. Do not add real providers, storage,
databases, queues, authentication, or rendering infrastructure without an
explicit task.
