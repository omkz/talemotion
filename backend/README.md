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

TaleMotion resolves one immutable provider selection per capability when a
job is queued. For Qwen storyboard planning, configure `DASHSCOPE_API_KEY` (or
`ALIBABA_API_KEY`), `TALEMOTION_STORYBOARD_PROVIDER=alibaba`, and
`TALEMOTION_STORYBOARD_MODEL=qwen-plus`. Scene media still requires
`GMI_API_KEY`, `B2_REGION`, `B2_BUCKET_NAME`, `B2_KEY_ID`, and
`B2_APPLICATION_KEY`. Media model slugs and
supported clip durations are configurable through `TALEMOTION_IMAGE_PROVIDER`,
`TALEMOTION_IMAGE_MODEL`, `TALEMOTION_VIDEO_PROVIDER`,
`TALEMOTION_VIDEO_MODEL`, and `TALEMOTION_VIDEO_DURATIONS`. The health endpoint
starts without these keys; a generation worker reports
`missing_configuration` instead of inventing a successful result.

Final rendering additionally uses `TALEMOTION_TTS_PROVIDER`,
`TALEMOTION_TTS_MODEL`, `TALEMOTION_MUSIC_PROVIDER`, and
`TALEMOTION_MUSIC_MODEL` when their corresponding project options are enabled.
`FFMPEG_BINARY` defaults to `ffmpeg`; the executable must be installed on the
worker host.

Production mode always marks the session cookie Secure. The browser receives
an HTTP-only SameSite session cookie plus a readable, independently random
CSRF cookie. Passwords are hashed with Argon2 through `pwdlib`; only SHA-256
hashes of session and CSRF tokens are persisted.

New accounts receive the configurable `NEW_USER_FREE_CREDITS` grant.
Generation rates are configured with the `CREDIT_RATE_*` variables. Values
are internal product credits—not currency—and no payment processing is
implemented.

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
to the `storyboard` queue. PydanticAI resolves the configured provider-prefixed
model and returns a typed, validated four-scene structure; only valid output is
persisted. Project creation itself performs no LLM request.
Existing scenes require `replace_existing=true`.

Alibaba Qwen is selected with:

```env
TALEMOTION_STORYBOARD_PROVIDER=alibaba
TALEMOTION_STORYBOARD_MODEL=qwen-plus
DASHSCOPE_API_KEY=...
```

To switch only storyboard planning to OpenAI:

```env
TALEMOTION_STORYBOARD_PROVIDER=openai
TALEMOTION_STORYBOARD_MODEL=gpt-5-mini
OPENAI_API_KEY=...
```

This does not change Genblaze GMICloud image, video, narration, or music
generation.

## Unified provider layer

`app/providers/` is the capability boundary for `storyboard`, `image`,
`video`, `tts`, and `music`. The catalog validates supported combinations and
model constraints. PydanticAI implements storyboard; Genblaze implements the
four media capabilities. Celery tasks use the provider factory rather than
Alibaba, OpenAI, or GMICloud classes.

Catalog entries also own credential requirements, including alternative-key
groups such as `DASHSCOPE_API_KEY or ALIBABA_API_KEY`. The media registry maps
each catalog capability/provider pair to a concrete Genblaze constructor.
GMICloud model-registry quirks remain isolated in
`app/providers/media/gmicloud.py`; the reusable scene and audio pipelines
receive already-constructed providers and contain no GMICloud branches.

Backblaze operations are composed separately through
`app/storage/b2.py`. Signing, download, upload, Genblaze sinks, and safe
TaleMotion key parsing require only B2 configuration. Previewing an existing
asset therefore does not resolve or validate any AI provider.

At queue time, each job stores credential-free selections in its existing JSON
payload:

```json
{
  "provider_selections": {
    "image": {
      "capability": "image",
      "provider": "gmicloud",
      "model": "seedream-5.0-lite"
    },
    "video": {
      "capability": "video",
      "provider": "gmicloud",
      "model": "wan2.6-i2v"
    }
  }
}
```

Retries copy the original snapshot, and Generate All children inherit their
parent's selections. Changing `.env` affects only new jobs. A legacy queued
job with no snapshot resolves current defaults once and persists them before
execution. A present but invalid snapshot fails instead of being replaced or
falling back. Usage records use the snapshot provider/model; credentials
always come from backend settings. Provider selection is not exposed in the
frontend.

To add another media provider:

1. Install only its relevant Genblaze provider package.
2. Add one catalog and adapter registration.
3. Define capability metadata and constraints.
4. Add configuration validation without storing credentials in jobs.
5. Add contract tests using fake provider results.
6. Leave Celery business logic unchanged.

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
`GET /api/v1/auth/csrf` rotates the current session's CSRF token when a browser
needs to recover the readable cookie. Registration accepts passwords of at
least eight characters.

The ownership migration assigns existing local records to a locked
`development@talemotion.local` account so no project is deleted. Reassign
legacy rows deliberately if they should belong to a newly registered user.

## Usage metering

`GET /api/v1/credits`, `GET /api/v1/credits/transactions`, and
`GET /api/v1/usage` expose only the current user's account ledger and provider
usage. Paid jobs reserve a maximum estimate while holding the account row
lock. Workers record successful provider operations, convert the reservation
to the actual charge, and release the remainder. Failures before billable
usage release the full reservation. Job/type and usage idempotency constraints
prevent Celery retries from charging twice. Insufficient requests fail with
HTTP 402 before queue dispatch.

## Final render workflow

`POST /api/v1/projects/{project_id}/renders` validates all active scene assets,
creates a render plus job, and dispatches the rendering queue. The worker
downloads B2 media, optionally creates reusable narration and music, stores an
SRT subtitle asset, and invokes FFmpeg from `app/rendering/` using argument
arrays. The H.264/AAC MP4 is uploaded to B2 and exposed through
`POST /api/v1/renders/{render_id}/preview-url`.

Long-form generation remains unimplemented. Provider-backed workflows are
enabled in the frontend only when `NEXT_PUBLIC_REAL_SCENE_GENERATION=true`.
