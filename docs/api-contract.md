# TaleMotion Backend Foundation API

## Current scope

The `/api/v1` API persists projects, their internal chapters, ordered scenes,
and generation-job state in PostgreSQL. Redis and Celery provide the worker
foundation, but no product-generation task exists yet. The frontend remains on
its existing mock provider.

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
| `GET /jobs/{id}` | Inspect persisted job state |
| `POST /jobs/{id}/cancel` | Request cancellation of queued/running work |
| `POST /jobs/{id}/retry` | Validate retry eligibility |

Retry dispatch returns `not_implemented` after eligibility checks because no
storyboard, media, or rendering task exists. It never invents a successful job.

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

The Celery queues are `storyboard`, `media`, `rendering`, and `system`. Only
`app.tasks.system.database_worker_health` is implemented, to verify
worker-to-database connectivity without simulating product work.

## Real scene media vertical slice

The existing project workspace can opt into one real per-scene operation with
`NEXT_PUBLIC_REAL_SCENE_GENERATION=true`. Project, chapter, and scene data
remain supplied by the current frontend mock provider; this flag changes only
the individual scene Generate, Retry, and Regenerate actions.

`POST /scene-runs/stream` accepts `project_id`, `scene_id`, `title`,
`visual_prompt`, `aspect_ratio`, `duration_seconds`, and `generate_video`.
It returns `text/event-stream` with this ordered vocabulary:

```text
scene_run.started
scene_image.started
scene_image.progress
scene_image.completed
scene_video.started
scene_video.progress
scene_video.completed
scene_run.completed
scene_run.failed
```

Image-only requests stop after `scene_image.completed`. If video generation
fails after the keyframe succeeds, `scene_run.failed` includes the durable
image so the workspace can preserve it. Failures expose only TaleMotion codes:
`missing_configuration`, `provider_authentication_failed`,
`provider_rate_limited`, `provider_generation_failed`, `storage_failed`,
`invalid_request`, or `unknown_error`.

GMICloud calls are made through Genblaze providers. `ObjectStorageSink` and
`genblaze-s3` persist assets and Genblaze manifests to Backblaze B2 under:

```text
talemotion/projects/{safe_project}/scenes/{safe_scene}/runs/{run_id}/
```

`GET /media/{encoded_key}/preview` accepts only encoded keys in that namespace
and redirects to a signed B2 URL with a development expiry of about 15 minutes.
It never accepts external URLs or returns storage credentials.

`GET /health/integrations` reports only whether B2 and GMICloud configuration
is present; it performs no paid generation call. Required variables and
configurable model slugs are documented in `backend/.env.example`.

## Explicitly deferred

Automatic storyboard generation, project persistence for this scene-run
flow, narration, music, FFmpeg/full-project rendering, scene version history,
and long-form chapter generation are not part of this vertical slice.
