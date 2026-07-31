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

For real storyboard planning and scene media, also configure `GMI_API_KEY`,
`TALEMOTION_STORYBOARD_MODEL`, `B2_REGION`,
`B2_BUCKET_NAME`, `B2_KEY_ID`, and `B2_APPLICATION_KEY`. Model slugs and
supported clip durations are configurable through `TALEMOTION_IMAGE_MODEL`,
`TALEMOTION_VIDEO_MODEL`, and `TALEMOTION_VIDEO_DURATIONS`. The health endpoint
starts without these keys; a generation request reports
`missing_configuration` instead of inventing a successful result.

Final rendering additionally uses `TALEMOTION_TTS_PROVIDER`,
`TALEMOTION_TTS_MODEL`, `TALEMOTION_MUSIC_PROVIDER`, and
`TALEMOTION_MUSIC_MODEL` when their corresponding project options are enabled.
`FFMPEG_BINARY` defaults to `ffmpeg`; the executable must be installed on the
worker host.

Set `AUTH_SECRET_KEY` to a long random value outside local development.
Production mode rejects the documented development default and always marks
the session cookie Secure. The browser receives an HTTP-only SameSite session
cookie plus a readable CSRF cookie; only the token hash is persisted.

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

`POST /api/v1/projects/{project_id}/storyboard` commits a storyboard job to
PostgreSQL and dispatches `app.tasks.storyboard.generate_project_storyboard`
to the `storyboard` queue. The configured Genblaze GMICloud chat connector
returns a validated four-scene structure; only valid output is persisted.
Existing scenes require `replace_existing=true`.

`POST /api/v1/projects/{project_id}/generations` creates one persisted parent
job and four child scene jobs, then dispatches the existing media task once
per scene. The parent derives progress from the latest child for each scene,
so a failed child can be retried without recreating successful work.

`POST /api/v1/scenes/{scene_id}/generations` loads the persisted scene,
commits a queued job, dispatches `app.tasks.media.generate_scene_media` to the
`media` queue, and returns HTTP 202. The frontend polls
`GET /api/v1/jobs/{job_id}` approximately every 1.5 seconds. On completion it
fetches `GET /api/v1/assets/{asset_id}` and requests a signed preview with
`POST /api/v1/assets/{asset_id}/preview-url`.

Storyboard, scene, project-generation, regeneration, and render requests accept
`Idempotency-Key`. Job state can be restored with
`GET /api/v1/jobs?project_id=...`; retries create new attempts while preserving
successful assets. Run `uv run celery -A app.core.celery_app beat` with the
worker to clean up abandoned queued or heartbeat-stale jobs.

The worker records real stage progress, persists the image before starting
video generation, and preserves that image if video generation fails. Media
is stored under:

```text
talemotion/projects/{safe_project}/scenes/{safe_scene}/runs/{run_id}/
```

Signed preview URLs expire after approximately 15 minutes. Credentials and
raw provider errors are never stored in job payloads or returned by the API.

## Authentication and ownership

Register or sign in through `/api/v1/auth/register` and `/api/v1/auth/login`.
All project/media endpoints require the resulting cookie session, and all
mutations require the matching `X-CSRF-Token`. Projects, jobs, assets, and
renders are user-owned; chapters and scenes inherit their project owner.
Requests for another user's IDs intentionally return `404`.

The ownership migration assigns existing local records to a locked
`development@talemotion.local` account so no project is deleted. Reassign
legacy rows deliberately if they should belong to a newly registered user.

## Final render workflow

`POST /api/v1/projects/{project_id}/renders` validates all active scene assets,
creates a render plus job, and dispatches the rendering queue. The worker
downloads B2 media, optionally creates reusable narration and music, stores an
SRT subtitle asset, and invokes FFmpeg from `app/rendering/` using argument
arrays. The H.264/AAC MP4 is uploaded to B2 and exposed through
`POST /api/v1/renders/{render_id}/preview-url`.

Long-form generation remains unimplemented. Provider-backed workflows are
enabled in the frontend only when `NEXT_PUBLIC_REAL_SCENE_GENERATION=true`.
