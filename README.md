# TaleMotion

TaleMotion is a media-production prototype with a Next.js frontend and a
minimal FastAPI foundation for the future backend.

## Repository structure

```text
frontend/   Next.js application and frontend mock services
backend/    FastAPI service and future background-worker code
docs/       API contract and OpenAPI specification
```

The frontend remains fully functional in mock mode. The backend currently
implements only a health endpoint; it does not contain real generation,
storage, database, queue, or rendering integrations.

## Frontend development

```bash
cd frontend
pnpm install
pnpm dev
```

Static verification:

```bash
pnpm run lint
npx tsc --noEmit
pnpm build
```

Copy `frontend/.env.example` to `frontend/.env.local` when environment
overrides are needed. Mock mode works without environment files.

## Backend development

Python 3.12 and [uv](https://docs.astral.sh/uv/) are required.

```bash
cd backend
uv sync
uv run ruff check .
uv run pytest
uv run fastapi dev app/main.py
```

The API is served at `http://localhost:8000`; its current endpoint is
`GET /api/v1/health`. A production-style command is:

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Future worker tasks remain in `backend/app/tasks/` and run as a separate
process using the same backend codebase. Pipeline and integration code belongs
in `backend/app/pipelines/` and `backend/app/integrations/`.

## API documentation

See [docs/api-contract.md](docs/api-contract.md) for design decisions and
[docs/openapi.yaml](docs/openapi.yaml) for the machine-readable contract.

## Compose

`compose.yaml` provides optional development services for the frontend and
backend. It does not define a worker because no real background task runner
exists yet.
