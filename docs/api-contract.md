# TaleMotion API Contract

## Purpose and boundaries

This document defines the JSON contract between the Next.js frontend and a
future FastAPI service. The current application still uses local mock services;
no HTTP provider is active.

The API uses `/api/v1`, opaque string IDs, snake_case JSON fields, and ISO 8601
UTC timestamps. Binary media is never embedded in JSON. Authentication is out
of scope for v1; settings represent one local workspace until user/workspace
identity exists.

Frontend domain objects (`VideoProject`, `Chapter`, `Scene`, `Asset`, `Render`,
`AppSettings`) remain camelCase and optimized for components. API DTOs represent
the wire format. Explicit mappers isolate naming, enum, and lifecycle
differences so UI components never depend on backend response shapes.

## Core model decisions

Generation is asynchronous because provider calls, media transfer, and
rendering can exceed normal request timeouts. Generation endpoints return a
`GenerationJobResponse`; clients poll `GET /jobs/{job_id}` every 1–2 seconds for
the MVP. WebSockets and SSE are not required.

Every project contains chapters. A short-form project receives a default
`Main` chapter at position 1, while the same structure later supports
long-form projects, child jobs, and chapter-level coordination without a data
migration.

Storyboard regeneration uses the same
`POST /projects/{project_id}/storyboard` endpoint. Supplying
`additional_instruction` starts a new storyboard job; the backend retains
previous project history according to its future persistence policy.

Scene regeneration uses a distinct `/regenerations` endpoint because it creates
a new scene/asset version. Previous assets are not overwritten.

## Endpoints

All paths below are relative to `/api/v1`.

| Resource | Method and path | Result |
| --- | --- | --- |
| Health | `GET /health` | Process health; not provider proof |
| Projects | `GET /projects` | Cursor-paged projects |
|  | `POST /projects` | Create project and default chapter |
|  | `GET /projects/{project_id}` | Project with chapters and scenes |
|  | `PATCH /projects/{project_id}` | Update client-editable metadata |
|  | `DELETE /projects/{project_id}` | Soft delete initially; may become async |
| Storyboard | `POST /projects/{project_id}/storyboard` | Start generation/regeneration job |
| Scenes | `GET /scenes/{scene_id}` | Get scene |
|  | `PATCH /scenes/{scene_id}` | Update title, narration, prompt, duration, position |
|  | `DELETE /scenes/{scene_id}` | Delete scene |
|  | `POST /scenes/{scene_id}/duplicate` | Duplicate scene |
|  | `POST /chapters/{chapter_id}/scenes` | Add scene |
|  | `POST /chapters/{chapter_id}/scenes/reorder` | Apply complete ordered ID list |
| Generation | `POST /projects/{project_id}/generations` | Generate all scenes |
|  | `POST /scenes/{scene_id}/generations` | Generate selected media stages |
|  | `POST /scenes/{scene_id}/regenerations` | Generate a new version |
| Jobs | `GET /jobs/{job_id}` | Poll job |
|  | `POST /jobs/{job_id}/retry` | Create/restart retry job |
|  | `POST /jobs/{job_id}/cancel` | Best-effort cancellation |
| Assets | `GET /assets` | Filtered cursor page |
|  | `GET /assets/{asset_id}` | Asset metadata |
|  | `POST /assets/{asset_id}/archive` | Archive asset |
|  | `POST /assets/{asset_id}/restore` | Restore asset |
|  | `DELETE /assets/{asset_id}` | Delete metadata; object cleanup may be async |
| URLs | `POST /assets/{asset_id}/preview-url` | Short-lived preview URL |
|  | `POST /assets/{asset_id}/download-url` | Short-lived download URL |
| Renders | `POST /projects/{project_id}/renders` | Start final-render job |
|  | `GET /projects/{project_id}/renders` | Cursor-paged renders |
|  | `GET /renders/{render_id}` | Render metadata |
|  | `POST /renders/{render_id}/thumbnail` | Start thumbnail job |
| Settings | `GET /settings` | Workspace defaults |
|  | `PATCH /settings` | Update workspace defaults |

Project list filters are `status`, `mode`, and `search`. Asset filters are
`project_id`, `chapter_id`, `scene_id`, `type`, `status`, `search`, and `sort`.
Asset sort values are `newest`, `oldest`, `name`, `largest`, and `project`.
The backend default page size remains 20; the current media-library adapter
explicitly requests 15 to preserve its existing UI behavior.

## Pagination

Collection endpoints accept `limit` (default 20, maximum 100) and an opaque
`cursor`. Clients must not parse or construct cursors. Responses contain:

```json
{
  "items": [],
  "next_cursor": "opaque_cursor_or_null",
  "has_more": true
}
```

Asset pages additionally return `total` for the media-library count. A changed
search, filter, or sort starts again without a cursor.

## Job lifecycle

Job statuses are `queued → running → completed`, with terminal alternatives
`failed` and `cancelled`. Job types are `storyboard`, `project_generation`,
`scene_generation`, `scene_regeneration`, `final_render`, and
`thumbnail_generation`. Progress is 0–100. `parent_job_id` and `child_job_ids`
support project, chapter, and scene fan-out for future long-form work.

Cancellation is best-effort: an external provider request may finish after the
backend accepts cancellation. The backend must reconcile late results without
changing a cancelled job back to running.

## Idempotency

Storyboard generation, all-scene generation, single-scene generation,
regeneration, final rendering, and thumbnail generation accept
`Idempotency-Key`. Repeating a request with the same key and equivalent payload
must return the original job rather than create duplicate provider calls or
assets. Keys are scoped and retained according to the backend implementation.
The current frontend does not generate keys yet.

## Errors

Every non-2xx JSON error uses:

```json
{
  "error": {
    "code": "scene_generation_failed",
    "message": "The video clip could not be generated.",
    "details": { "scene_id": "scene_123" },
    "request_id": "req_abc123"
  }
}
```

Common statuses are 400 invalid request, 404 missing resource, 409 state
conflict, 422 validation error, 429 rate/concurrency limit, 500 unexpected
error, 502 provider failure, and 503 temporarily unavailable generation
service. Frontend code should branch on `code`, show `message`, log
`request_id`, and treat `details` as diagnostic context.

## Assets, URLs, and security

Asset JSON may expose an object key, bucket display name, storage state,
short-lived signed URL, and expiration timestamp. Preview/download URLs should
be narrowly scoped and short lived. The API must never return Backblaze
application keys, provider credentials, internal encryption keys, permanent
bucket access, or unrestricted public URLs.

Deleting an asset or project can later enqueue Backblaze B2 cleanup. A 204
response confirms API acceptance, not necessarily immediate physical deletion.
The health endpoint reports configuration/process state only and is not proof
that Genblaze, B2, or any provider is operational.

## Typical sequence

```text
Create project
→ Generate storyboard job
→ Poll job
→ Fetch updated project
→ Generate scene assets
→ Poll parent and child jobs
→ Render final video
→ Request signed download URL
```

## Mock-to-HTTP migration

`src/lib/api` contains DTOs, Zod validation for critical responses, domain
mappers, `VideoProjectApi`, `MockVideoProjectApi`, `HttpVideoProjectApi`, and a
polling helper. `videoProjectApi` explicitly uses the mock adapter. Existing
components still import the established mock functions, so behavior and timer
simulations remain unchanged.

Migration can happen feature by feature: move a component/service call behind
`VideoProjectApi`, verify parity in mock mode, then opt into a configured HTTP
provider. The future environment example is:

```bash
NEXT_PUBLIC_API_MODE=mock
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

Mock mode is the default when variables are absent. HTTP mode performs no
request until a method is called and must never fall back silently to mock
data. FastAPI, persistence, queues, provider integrations, authentication, and
render workers remain future implementation work.
