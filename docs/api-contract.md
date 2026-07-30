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

## Explicitly deferred

Genblaze, AI providers, Backblaze B2, text-to-speech, scene media generation,
FFmpeg, final video production, signed URLs, and frontend HTTP mode are not
implemented in this stage.
