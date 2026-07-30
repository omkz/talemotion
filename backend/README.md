# TaleMotion Backend

This backend now includes one real, provider-backed vertical slice: an
persisted TaleMotion scene can generate a GMICloud keyframe and animate it.
FastAPI creates a PostgreSQL `GenerationJob`, Celery performs the Genblaze
work, and media plus provenance manifests are stored in Backblaze B2. Asset
metadata and the scene's active asset remain in PostgreSQL.

## Configure native services

Verify the existing Linux services:

```bash
systemctl status postgresql
systemctl status redis-server
pg_isready
redis-cli ping
```

Copy `.env.example` to `.env` and set local credentials. Both
`DATABASE_URL` and a distinct `TEST_DATABASE_URL` are required. Tests refuse a
test URL that matches the development URL or does not visibly name a test
database.

If needed, create the role and databases manually:

```bash
sudo -u postgres psql
```

```sql
CREATE USER talemotion WITH PASSWORD 'development-password';
CREATE DATABASE talemotion_dev OWNER talemotion;
CREATE DATABASE talemotion_test OWNER talemotion;
```

Do not run these statements over existing resources.

For real scene media, also configure `GMI_API_KEY`, `B2_REGION`,
`B2_BUCKET_NAME`, `B2_KEY_ID`, and `B2_APPLICATION_KEY`. Model slugs and
supported clip durations are configurable through `TALEMOTION_IMAGE_MODEL`,
`TALEMOTION_VIDEO_MODEL`, and `TALEMOTION_VIDEO_DURATIONS`. The health endpoint
starts without these keys; a generation request reports
`missing_configuration` instead of inventing a successful result.

## Run and migrate

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Run the worker separately:

```bash
uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering,system --loglevel=info
```

Migration reversibility:

```bash
uv run alembic downgrade base
uv run alembic upgrade head
```

## Verify

```bash
uv run ruff check .
uv run pytest
```

The suite uses PostgreSQL JSONB and constraints through `talemotion_test`;
SQLite is not supported. Set `RUN_CELERY_INTEGRATION=1` only while a worker is
running to exercise the Redis → worker → PostgreSQL diagnostic path.

## Persistent scene media workflow

`POST /api/v1/scenes/{scene_id}/generations` loads the persisted scene,
commits a queued job, dispatches `app.tasks.media.generate_scene_media` to the
`media` queue, and returns HTTP 202. The frontend polls
`GET /api/v1/jobs/{job_id}` approximately every 1.5 seconds. On completion it
fetches `GET /api/v1/assets/{asset_id}` and requests a signed preview with
`POST /api/v1/assets/{asset_id}/preview-url`.

The worker records real stage progress, persists the image before starting
video generation, and preserves that image if video generation fails. Media
is stored under:

```text
talemotion/projects/{safe_project}/scenes/{safe_scene}/runs/{run_id}/
```

Signed preview URLs expire after approximately 15 minutes. Credentials and
raw provider errors are never stored in job payloads or returned by the API.

Automatic storyboards, narration, music, full-project rendering, scene
full-project rendering, and long-form generation remain unimplemented. The
frontend uses this workflow only when `NEXT_PUBLIC_REAL_SCENE_GENERATION=true`.
