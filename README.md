# TaleMotion

TaleMotion is a cinematic video-production workspace. This repository now
contains a production-shaped Historical Documentary vertical slice:

```text
frontend/   Next.js application and HTTP/domain adapters
backend/    FastAPI API, Celery worker, providers, storage, and rendering
docs/       Implemented API contract and OpenAPI specification
```

The real slice supports English Historical Documentaries at 30 or 45 seconds,
9:16, exactly four scenes, narration, and burned captions. Microdrama and
Product Advertisement are Coming Soon and do not silently use backend mocks.

## Infrastructure

Copy `backend/.env.example` to `backend/.env`, provide the required OpenAI and
Backblaze B2 values, then start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Start the API and worker in separate terminals:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

```bash
cd backend
uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering --loglevel=info
```

Alternatively, `docker compose up --build` runs PostgreSQL, Redis, API, and
worker. FFmpeg is included in the backend container.

## Frontend

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

HTTP mode uses:

```env
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

There is no HTTP-to-mock fallback. API and generation errors are shown to the
user.

## Verification

```bash
cd backend
uv sync
uv run ruff check .
uv run pytest
```

```bash
cd frontend
pnpm run lint
npx tsc --noEmit
pnpm build
```

See [docs/api-contract.md](docs/api-contract.md) and
[docs/openapi.yaml](docs/openapi.yaml). Provider credentials, B2 keys, database
passwords, and generated media are not committed.
