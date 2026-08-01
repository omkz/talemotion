# TaleMotion Backend Foundation API

## Current scope

The `/api/v1` API persists projects, their internal chapters, ordered scenes,
and generation-job state in PostgreSQL. Redis is the Celery broker, and the
storyboard worker produces validated four-scene plans, and media workers
execute the existing real per-scene Genblaze pipeline.

All JSON fields use `snake_case`, IDs are opaque prefixed UUID strings, and
timestamps are timezone-aware ISO 8601 values. Every new short-form project is
created atomically with one `Main` chapter at position `1`.

All product resources require a cookie session. Passwords use Argon2 through
`pwdlib`; the database stores only password hashes and SHA-256 session-token
hashes. Authenticated mutations also require `X-CSRF-Token` to match the
separately generated CSRF token whose SHA-256 hash belongs to the current
session. Browser clients never store access tokens in localStorage.

## Implemented endpoints

| Method and path | Behavior |
| --- | --- |
| `GET /health` | API process identity |
| `GET /health/dependencies` | Non-secret PostgreSQL and Redis status |
| `POST /auth/register`, `POST /auth/login` | Create an account or session |
| `POST /auth/logout`, `GET /auth/me` | Revoke or inspect the current session |
| `GET /auth/csrf` | Rotate and return the current session's CSRF token |
| `GET /credits` | Current balance, reservations, availability, and rates |
| `GET /credits/transactions` | Current user's immutable credit ledger |
| `GET /usage` | Current user's provider-operation usage records |
| `GET`, `POST /projects` | Cursor list or atomically create a project |
| `GET`, `PATCH`, `DELETE /projects/{id}` | Read, update safe fields, soft-delete |
| `POST /projects/{id}/storyboard` | Queue structured historical storyboard planning |
| `POST /projects/{id}/generations` | Queue one parent and four scene-media children |
| `POST /projects/{id}/renders` | Queue asynchronous final-video assembly |
| `GET /projects/{id}/renders` | List persisted render versions |
| `GET /chapters/{id}` | Chapter with scenes ordered by position |
| `POST /chapters/{id}/scenes` | Append or insert a scene |
| `POST /chapters/{id}/scenes/reorder` | Apply a complete scene order |
| `GET`, `PATCH`, `DELETE /scenes/{id}` | Scene CRUD |
| `POST /scenes/{id}/duplicate` | Insert a draft copy after the source |
| `POST /scenes/{id}/generations` | Commit and enqueue a real scene-media job |
| `POST /scenes/{id}/regenerations` | Preserve prior assets and enqueue a new version |
| `GET /jobs?project_id=…` | Restore persisted project job state after reload |
| `GET /jobs/{id}` | Inspect persisted job state |
| `POST /jobs/{id}/cancel` | Request cancellation of queued/running work |
| `POST /jobs/{id}/retry` | Resume eligible storyboard, scene, project, or render work |
| `GET /assets/{id}` | Read persisted generated-asset metadata |
| `POST /assets/{id}/preview-url` | Request a short-lived signed B2 URL |
| `GET /renders/{id}` | Read a persisted render |
| `POST /renders/{id}/preview-url` | Request its signed final-video URL |

Generation endpoints accept `Idempotency-Key`. Keys are persisted and protected
with a PostgreSQL advisory transaction lock, so repeated requests return the
original job rather than enqueueing duplicate work. Retries preserve failed job
history and completed B2 assets. Project retries enqueue only failed or
cancelled scenes and never regenerate successful siblings.

## Ownership and authorization

`Project`, `GenerationJob`, `Asset`, and `Render` rows carry a non-null
`user_id`. Chapters and scenes inherit ownership through their project. Every
HTTP repository is scoped to the authenticated user; cross-user project,
chapter, scene, job, asset, render, and signed-preview requests return `404`.
Celery workers use the persisted job/project ownership and propagate it to
new asset records.

Migration `0006_authentication_ownership` preserves pre-authentication
development records by assigning them to the locked
`development@talemotion.local` migration user. It does not delete legacy
projects. Reassign those records explicitly in local administration if they
need to become accessible to a registered account.

Migration `0007_session_csrf` adds the per-session CSRF hash. It revokes
pre-existing sessions because their raw CSRF values cannot be reconstructed;
users and owned resources are unaffected.

Migration `0008_usage_credits` adds decimal-safe credit accounts,
transactions, and usage records. Existing development users receive one
documented initial grant; registration creates the same configurable grant
atomically with the user.

## Credits and provider usage

Credits use PostgreSQL `NUMERIC`, never floating point. Storyboard, scene,
regeneration, Generate All, TTS/music work inside rendering, and final
assembly use centralized configurable rates. A generation transaction locks
the user's account, reserves its maximum estimate, and creates the job in the
same database transaction. Insufficient availability returns HTTP 402
`insufficient_credits` and no task is enqueued.

Workers persist actual successful provider operations. Terminal settlement
charges only billable usage and releases the unused reservation; a failure
before provider usage releases it all. A project-generation parent owns the
aggregate reservation for its children. Database uniqueness keys tie
reservations and charges to jobs and usage records to one provider operation,
so task retries do not double-charge. Redis is never the balance source of
truth.

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

Workers cooperatively confirm cancellation between provider/storage/render
stages. A periodic system task marks abandoned queued or heartbeat-stale jobs
failed (or cancelled when requested), without deleting completed Asset rows or
B2 objects. Run Celery beat alongside workers to schedule this cleanup.

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

## Historical storyboard and Generate All

Only `historical_documentary`, `9:16`, 30/45-second projects are supported.
Storyboard jobs resolve
`TALEMOTION_STORYBOARD_PROVIDER:TALEMOTION_STORYBOARD_MODEL` through
PydanticAI. The default is `alibaba:qwen-plus` using `DASHSCOPE_API_KEY` (or
`ALIBABA_API_KEY`). The structured response must contain exactly four
ordered scenes whose durations total the requested duration within two
seconds. Invalid output is retried at most the configured limit; no hardcoded
storyboard fallback is used.

Creating a project performs no LLM request. Clicking Generate Storyboard
persists and queues the paid planning job. Switching to
`openai:gpt-5-mini` requires only the provider, model, and `OPENAI_API_KEY`
configuration; Celery task and storyboard persistence behavior stay the same.
Genblaze remains responsible for image, video, narration, music, manifests,
and B2 media workflows.

### Provider selections and job immutability

The backend catalog exposes `storyboard`, `image`, `video`, `tts`, and `music`.
Storyboard adapters use PydanticAI; current media adapters use Genblaze. Public
requests do not accept provider names. Queue services resolve backend defaults
and store credential-free `provider_selections` in the job JSON payload.
Generate All children inherit their parent's media snapshot, and retries copy
the failed attempt's snapshot. Usage is attributed from the snapshot rather
than mutable process settings.

Changing environment defaults affects new jobs only. A legacy queued job with
no snapshot resolves and persists current defaults at worker start. A present
but unsupported or incomplete snapshot fails with `unsupported_parameters`;
there is no cross-provider fallback. API keys are never accepted in provider
selection payloads or stored with jobs.

Provider catalog entries are the source of supported combinations, credential
alternatives, defaults, and model capability constraints. A media registration
maps the validated entry to its concrete Genblaze adapter; the adapter owns
provider-specific runtime behavior such as signed-URL video handoff and parent
lineage. Scene, narration, and music orchestration remain provider-neutral.
Backblaze B2 signing, upload, download, sink creation, and object-key validation
are owned by a separate storage gateway. Signed-preview endpoints use only that
gateway, so invalid AI configuration cannot block access to a previously
persisted asset. Immutable job snapshots—not mutable process settings—own the
provider and model choice for an execution attempt.

Generate All creates a `project_generation` parent plus four
`scene_generation` children. Children run concurrently through Celery's media
queue and reuse the same B2-backed task as an individual Generate action.
Parent progress is the persisted completed-child ratio (0/25/50/75/100), and
`GET /jobs/{id}` includes current child summaries.

## Real scene media vertical slice

With `NEXT_PUBLIC_API_MODE=http` (or the legacy
`NEXT_PUBLIC_REAL_SCENE_GENERATION=true` feature flag), Generate posts to
`/scenes/{scene_id}/generations`, receives a job ID, and polls
`/jobs/{job_id}` every 1.5 seconds. `result_payload.image_asset_id` becomes
available as soon as the keyframe is stored; `video_asset_id` replaces it when
animation succeeds. Failures retain the image asset ID when one exists.
The same mode also creates projects through PostgreSQL, persists scene edits,
uses the regeneration endpoint, and restores active jobs and completed renders
from the API after a browser refresh. It never falls back to mock media.

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

## Final rendering

A render request validates that each ordered scene has an available active
image or video. It persists a `Render` and `render` generation job before
dispatching `app.tasks.rendering.render_project_video` to the `rendering`
queue. Narration, captions, and music default to the persisted project output
settings and may be overridden per render.

The worker downloads scene media through `genblaze-s3`, reuses matching
narration/music assets, and generates missing audio through the configured
Genblaze GMICloud audio provider. Captions are deterministic SRT files derived
from scene narration and duration. FFmpeg normalizes every visual to 1080×1920,
loops images, concatenates scenes in position order, pads narration per scene,
mixes music below narration, burns captions when enabled, and emits H.264/AAC
MP4. The final object is stored under:

```text
talemotion/projects/{safe_project}/renders/v{version}/final.mp4
```

Progress stages and terminal errors are persisted in PostgreSQL. Temporary
files are scoped to one worker invocation and removed on success or failure.

## Explicitly deferred

Long-form chapter generation remains deferred. Provider-backed audio and final
rendering require configured credentials and FFmpeg; no mock-success fallback
is used.
