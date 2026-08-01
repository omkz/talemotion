# TaleMotion

TaleMotion is a cinematic video-production workspace organized as:

```text
frontend/   Next.js application with opt-in persisted generation workflows
backend/    FastAPI API, PostgreSQL persistence, and Celery worker
docs/       API contract and OpenAPI specification
```

The backend persists projects, validated four-scene historical storyboards,
parent/child generation jobs, generated assets, and versioned final renders.
Celery workers use PydanticAI for provider-flexible storyboard planning,
Genblaze for GMICloud media generation, Backblaze B2 for durable media, and
FFmpeg for H.264/AAC final assembly.
Generation requests support persisted idempotency keys, and the frontend
restores current job and render state from PostgreSQL after reload. Run Celery
beat with the workers so abandoned queued or heartbeat-stale jobs are finalized
without deleting completed assets.

TaleMotion uses server-side cookie sessions. Password and session tokens are
never returned or stored in browser localStorage; all product resources are
scoped to their owning user, and mutations use CSRF protection.
PostgreSQL also stores each user's internal credit account, immutable
transaction ledger, and provider usage. This metering layer has no Stripe or
payment-processing integration.

## Native infrastructure

PostgreSQL and Redis run as native Linux services:

```bash
systemctl status postgresql
systemctl status redis-server
psql --version
pg_isready
redis-cli ping
```

Copy `backend/.env.example` to `backend/.env` and supply local credentials.
When databases do not exist, create them manually without replacing existing
roles or databases:

```bash
sudo -u postgres psql
```

```sql
CREATE USER talemotion WITH PASSWORD 'development-password';
CREATE DATABASE talemotion_dev OWNER talemotion;
CREATE DATABASE talemotion_test OWNER talemotion;
```

The password above is an example for local development, not a committed
credential.

## Development

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

In another terminal:

```bash
cd backend
uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering,system --loglevel=info
uv run celery -A app.core.celery_app beat --loglevel=info
```

Workers run storyboard planning, scene media generation, and the safe
`app.tasks.system.database_worker_health` diagnostic. Start the frontend
separately with `cd frontend && pnpm dev`. Set `NEXT_PUBLIC_API_MODE=http` for
the persisted Historical Documentary workflow; the legacy
`NEXT_PUBLIC_REAL_SCENE_GENERATION=true` flag remains supported during local
migration. HTTP mode never silently falls back to mock data.

See [docs/api-contract.md](docs/api-contract.md) for implementation status and
the testing workflow.
