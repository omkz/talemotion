# TaleMotion Backend

This backend now includes one real, provider-backed vertical slice: an
existing TaleMotion scene can generate a GMICloud keyframe and animate it,
while Genblaze stores the media and provenance manifests in Backblaze B2.
The request streams TaleMotion-specific progress events directly from
FastAPI; it does not create a database job or use Celery.

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

## Real scene media endpoint

`POST /api/v1/scene-runs/stream` accepts one scene prompt and returns
`text/event-stream`. Events cover the run, image, and video lifecycle. Media
is stored under:

```text
talemotion/projects/{safe_project}/scenes/{safe_scene}/runs/{run_id}/
```

`GET /api/v1/media/{encoded_key}/preview` validates that namespace and
redirects to a short-lived signed B2 URL. Credentials and raw provider errors
are never returned.

Automatic storyboards, narration, music, full-project rendering, scene
version history, and long-form generation remain unimplemented. Existing
frontend project data remains mock-backed; only the flagged per-scene action
uses this endpoint.
