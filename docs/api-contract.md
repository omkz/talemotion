# TaleMotion Historical MVP API

## Scope

The active backend slice supports one workflow:

```text
Historical topic → storyboard → scene images → B2 → narrated MP4
```

Projects are restricted to Historical Documentary, English, 30 or 45 seconds,
9:16, exactly four scenes, and captions enabled. Microdrama and Product
Advertisement remain frontend Coming Soon options. The API uses `/api/v1`,
opaque string IDs, snake_case JSON, and timezone-aware ISO 8601 timestamps.
PostgreSQL is the source of truth; Redis/Celery runs generation outside the
FastAPI request process.

## Domain and wire models

Frontend domain objects remain camelCase and presentation-oriented. API DTOs
use snake_case and describe persisted backend resources. Explicit mappers in
`frontend/src/lib/api/mappers.ts` prevent React components from depending on
wire shapes.

Every short project still owns a `Main` chapter at position 1. This internal
level allows future long-form chapters without restructuring Project → Chapter
→ Scene relationships.

## Implemented endpoints

All paths are relative to `/api/v1`.

| Method and path | Behavior |
| --- | --- |
| `GET /health` | Process identity; not provider health proof |
| `GET`, `POST /projects` | List or create PostgreSQL projects |
| `GET`, `PATCH`, `DELETE /projects/{id}` | Read, edit, or soft-delete |
| `GET /chapters/{id}` | Chapter with ordered scenes |
| `POST /projects/{id}/storyboard` | Queue structured Genblaze storyboard |
| `GET`, `PATCH`, `DELETE /scenes/{id}` | Scene operations |
| `POST /chapters/{id}/scenes` | Add a scene |
| `POST /chapters/{id}/scenes/reorder` | Apply a complete scene order |
| `POST /scenes/{id}/duplicate` | Duplicate a scene |
| `POST /scenes/{id}/generations` | Queue real image generation |
| `POST /scenes/{id}/regenerations` | Create the next asset version |
| `GET /jobs/{id}` | Poll persisted job progress |
| `GET /assets`, `GET /assets/{id}` | Read stored asset metadata |
| `POST /assets/{id}/preview-url` | Short-lived signed B2 preview |
| `POST /assets/{id}/download-url` | Short-lived signed B2 download |
| `POST /projects/{id}/renders` | Queue narrated, captioned FFmpeg render |
| `GET /projects/{id}/renders` | List project render versions |
| `GET /renders/{id}` | Render metadata and signed preview |

Archive/restore/delete asset mutations, project-wide generation jobs, job
retry/cancel, settings HTTP persistence, and thumbnail generation remain
planned and are not silently simulated by the HTTP adapter.

## Asynchronous jobs

Provider calls, B2 transfers, and FFmpeg exceed safe request times. Generation
requests return `202` with a job in `queued`; workers persist transitions
through `running` to `completed` or `failed`. The frontend polls roughly every
1.5 seconds. WebSockets and SSE are not required.

Celery routes work to `storyboard`, `media`, and `rendering` queues. Job types
currently implemented are `storyboard`, `scene_generation`,
`scene_regeneration`, and `final_render`.

## Storyboard and asset versioning

Genblaze must return exactly four validated scenes. Their durations must
approximately total the project duration; malformed structured output is
retried a bounded number of times and never replaced with hardcoded scenes.

Scene regeneration combines the stored visual prompt with the additional
instruction. It preserves v1, uploads v2 under a new object key, links its
parent asset, and advances `active_asset_version` only after storage and
metadata succeed.

Each generated scene asset has a B2 JSON manifest containing provider, model,
prompt, parameters, timestamp, SHA-256, object key, and parent asset when
applicable. The manifest records generation provenance; it does not prove
historical accuracy or real-world truth.

## Pagination and errors

Project and asset collections accept `limit` (default 20, maximum 100) and an
opaque cursor. Asset pages also return `total`.

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false
}
```

All handled errors use one envelope and include the response `X-Request-ID`:

```json
{
  "error": {
    "code": "provider_not_configured",
    "message": "OPENAI_API_KEY is required for this generation workflow.",
    "details": { "provider": "openai", "orchestration": "genblaze" },
    "request_id": "req_abc123"
  }
}
```

Generation endpoints fail with an explicit `503` when required provider,
storage, or renderer configuration is absent. HTTP mode never falls back to
mock data.

## Storage and security

B2 credentials and provider keys exist only in backend environment variables.
JSON may expose an object key, bucket display name, checksum, and short-lived
signed URL; it never exposes provider credentials, B2 application keys, or
unrestricted bucket access. Object keys follow:

```text
projects/{project_id}/scenes/{scene_id}/images/v{version}.png
projects/{project_id}/scenes/{scene_id}/manifests/v{version}.json
projects/{project_id}/renders/v{version}.mp4
```

## End-to-end sequence

```text
Create historical project
→ Queue storyboard
→ Poll job
→ Fetch four persisted scenes
→ Queue each scene image
→ Poll and request signed previews
→ Regenerate selected scenes as new versions
→ Queue final render
→ Poll and fetch signed MP4 preview
```

`NEXT_PUBLIC_API_MODE=http` activates this slice with
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1`. External Genblaze and
Backblaze B2 success still depends on valid operator-supplied configuration.
