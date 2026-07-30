# TaleMotion Backend Foundation API

## Current scope

The `/api/v1` API persists projects, their internal chapters, ordered scenes,
and generation-job state in PostgreSQL. Redis is the Celery broker, and the
media worker now executes the real per-scene Genblaze pipeline. Other frontend
resources remain on their existing provider boundary.

All JSON fields use `snake_case`, IDs are opaque prefixed UUID strings, and
timestamps are timezone-aware ISO 8601 values. Every new short-form project is
created atomically with one `Main` chapter at position `1`.

## Implemented endpoints

| Method and path | Behavior |
| --- | --- |
| `GET /health` | API process identity |
| `GET /health/dependencies` | Non-secret PostgreSQL and Redis status |
| `GET`, `POST /projects` | Cursor list or atomically create a project |
| `GET`, `PATCH`, `DELETE /projects/{id}` | Read, update safe fields, soft-delete |
| `GET /chapters/{id}` | Chapter with scenes ordered by position |
| `POST /chapters/{id}/scenes` | Append or insert a scene |
| `POST /chapters/{id}/scenes/reorder` | Apply a complete scene order |
| `GET`, `PATCH`, `DELETE /scenes/{id}` | Scene CRUD |
| `POST /scenes/{id}/duplicate` | Insert a draft copy after the source |
| `POST /scenes/{id}/generations` | Commit and enqueue a real scene-media job |
| `GET /jobs/{id}` | Inspect persisted job state |
| `POST /jobs/{id}/cancel` | Request cancellation of queued/running work |
| `POST /jobs/{id}/retry` | Validate retry eligibility |
| `GET /assets/{id}` | Read persisted generated-asset metadata |
| `POST /assets/{id}/preview-url` | Request a short-lived signed B2 URL |

The generic `/jobs/{id}/retry` endpoint still returns `not_implemented` after
eligibility checks. The workspace retries scene media by creating a new
generation job, preserving the prior job and asset history.

## Persistence and lifecycle

SQLAlchemy models cover `Project`, `Chapter`, `Scene`, `GenerationJob`,
`Asset`, and `Render`. Asset and render rows are foundation records only;
project and scene creation never creates placeholders. Alembic owns schema
creation—application startup does not call `create_all()`.

Project collection pagination uses `limit` (default `20`, maximum `100`) and an
opaque cursor. Soft-deleted projects are excluded from lists and normal reads.
Scene position mutations lock the owning chapter and normalize positions from
`1` in one transaction.

Job statuses are `queued`, `running`, `completed`, `failed`,
`cancel_requested`, and `cancelled`. Cancellation is a request until a worker
confirms it. Job JSONB input/result payloads, retry counts, errors, lineage, and
timestamps remain persisted for inspection.

## Errors and request IDs

Handled errors use one envelope:

```json
{
  "error": {
    "code": "scene_not_found",
    "message": "Scene not found.",
    "details": {"scene_id": "scene_123"},
    "request_id": "req_abc123"
  }
}
```

The API accepts `X-Request-ID`, generates one when absent, and returns it in
the response. Defined codes include `validation_error`, `project_not_found`,
`chapter_not_found`, `scene_not_found`, `job_not_found`, `project_deleted`,
`invalid_scene_order`, `state_conflict`, `dependency_unavailable`, and
`not_implemented`.

## Native development and tests

PostgreSQL and Redis are native services at `localhost:5432` and
`localhost:6379`. Credentials live only in `backend/.env`. Tests require a
distinct `TEST_DATABASE_URL` whose database name visibly contains `test`; they
create isolated PostgreSQL schemas and never clear the development database.

The Celery queues are `storyboard`, `media`, `rendering`, and `system`.
`app.tasks.media.generate_scene_media` is routed to `media`; API requests never
execute Genblaze or paid provider work in the FastAPI process.

## Real scene media vertical slice

With `NEXT_PUBLIC_REAL_SCENE_GENERATION=true`, Generate posts to
`/scenes/{scene_id}/generations`, receives a job ID, and polls
`/jobs/{job_id}` every 1.5 seconds. `result_payload.image_asset_id` becomes
available as soon as the keyframe is stored; `video_asset_id` replaces it when
animation succeeds. Failures retain the image asset ID when one exists.

GMICloud calls are made through Genblaze providers. `ObjectStorageSink` and
`genblaze-s3` persist assets and Genblaze manifests to Backblaze B2 under:

```text
talemotion/projects/{safe_project}/scenes/{safe_scene}/runs/{run_id}/
```

Asset metadata stores only the bucket display name, TaleMotion object key,
hash, media type, provider/model, version, and provenance object key.
`POST /assets/{asset_id}/preview-url` resolves only an available persisted
asset and returns a signed B2 URL with a development expiry of about 15
minutes.

`GET /health/integrations` reports only whether B2 and GMICloud configuration
is present; it performs no paid generation call. Required variables and
configurable model slugs are documented in `backend/.env.example`.

## Explicitly deferred

Automatic storyboard generation, narration, music, FFmpeg/full-project
rendering, and long-form chapter generation are not part of this vertical
slice. SSE is not used as the primary generation workflow.
