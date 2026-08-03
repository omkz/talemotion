# TaleMotion

TaleMotion is an AI-assisted cinematic production workspace for turning story ideas into structured storyboards, generated scene assets, and finished video projects.

Unlike one-shot prompt-to-video tools, TaleMotion keeps the production process structured and persistent. Projects are divided into editable scenes, generation runs happen in background jobs, completed assets are retained, failed scenes can be retried independently, and final videos can be assembled from the resulting clips.

The current MVP focuses on short-form documentaries and cinematic educational videos, with historical storytelling as its first supported workflow.

## Current Status

TaleMotion is an actively developed MVP with a working production-oriented vertical slice.

The current system supports:

* persistent user accounts and projects;
* structured four-scene storyboard generation;
* scene-level image and video generation;
* background processing with Celery;
* durable generated-media storage;
* independent scene retries;
* provider and model selection snapshots;
* asset hashes and provenance manifests;
* final video assembly with FFmpeg;
* internal usage and credit tracking.

Some provider integrations require external API access, compatible regional endpoints, model permissions, and sufficient provider credits.

## Product Direction

TaleMotion is being developed for creators who produce structured, narrative-driven videos, including:

* short-form documentary creators;
* educational video creators;
* history and culture channels;
* faceless YouTube and TikTok creators;
* independent filmmakers;
* small creative teams.

The goal is not to replace creative decision-making with a single prompt. TaleMotion provides a workspace where creators can plan, inspect, regenerate, organize, and assemble AI-generated media as part of a repeatable production process.

## How It Works

A typical TaleMotion project follows this workflow:

```text
Story idea or topic
        ↓
Structured storyboard
        ↓
Editable scenes
        ↓
Scene keyframes
        ↓
Animated video clips
        ↓
Review and regenerate
        ↓
Final video render
```

Each scene is stored independently, so users can review and regenerate one part of a project without restarting the entire production.

## Key Features

### Structured Storyboards

TaleMotion uses an AI-assisted planning workflow to convert a topic or story idea into a validated storyboard.

New projects are created through Story, Creative Direction, and Output steps.
Source notes remain distinct from presentation instructions, while content
type, language, tone, and target audience guide storyboard planning. A working
project title can be derived locally from the topic without an AI request. The
current four-scene workflow exposes only its supported 30/45-second vertical
output choices.

The current workflow produces four ordered scenes containing:

* scene title;
* description;
* narration text;
* visual prompt;
* duration;
* sequence information.

Storyboard output is validated before it is persisted.

### Scene-Based Production

Projects are divided into individual scenes instead of being generated as one opaque operation.

Each scene can contain:

* a generated keyframe;
* an animated video clip;
* generation history;
* active asset selection;
* media metadata;
* provider and model information;
* content hashes;
* provenance manifests.

A failed scene can be retried without discarding successful work from other scenes.

### Persistent Background Jobs

Long-running generation tasks are handled by Celery workers rather than inside browser requests.

FastAPI creates and persists jobs in PostgreSQL, while workers execute storyboard generation, media generation, and final rendering.

The frontend reads job progress from the API and can restore project state after a browser refresh.

### Durable Media Storage

Generated media is stored as durable project assets rather than relying on temporary provider URLs.

The storage layer supports:

* Backblaze B2 for deployed or multi-host environments;
* local filesystem storage for development.

Generated images, video clips, manifests, and final renders use structured object keys based on their project, scene, and generation run.

### Provider-Independent Architecture

TaleMotion separates application workflows from individual AI providers.

Capabilities are organized into:

* storyboard;
* image;
* video;
* text-to-speech;
* music.

Provider and model selections are captured when a job is queued. This means changing application defaults does not unexpectedly alter an existing job or retry.

The media pipeline remains independent of provider-specific request formats.

### Provenance and Asset Integrity

Generated assets include metadata that helps identify how they were created.

Depending on the generation pipeline, TaleMotion records:

* provider;
* model;
* media type;
* generation run;
* source relationships;
* SHA-256 content hash;
* provenance manifest;
* durable storage location.

This makes generated media easier to trace, verify, and manage.

### Final Rendering

TaleMotion uses FFmpeg to assemble completed scene clips into a final MP4.

The rendering architecture also supports optional:

* narration;
* subtitles;
* background music.

These features require their corresponding providers and project options to be configured.

### Authentication and Ownership

TaleMotion includes user-scoped project and media access.

The backend uses:

* server-side cookie sessions;
* HTTP-only authentication cookies;
* Argon2 password hashing;
* CSRF protection;
* ownership checks for projects, jobs, assets, and renders.

Provider API credentials are backend configuration and are not stored in browser state or generation-job payloads.

### Usage and Credit Tracking

The backend includes an internal credit and usage ledger.

It records:

* credit grants;
* reservations;
* provider usage;
* successful charges;
* released reservations;
* immutable credit transactions.

This is currently an internal metering system and does not include payment processing.

## Architecture

```text
┌──────────────────────────┐
│     Next.js Frontend     │
│ Projects and workspace   │
└─────────────┬────────────┘
              │ HTTP
┌─────────────▼────────────┐
│       FastAPI API        │
│ Auth, projects and jobs  │
└───────┬──────────┬───────┘
        │          │
┌───────▼──────┐   │
│ PostgreSQL   │   │
│ Durable state│   │
└──────────────┘   │
                   ▼
           ┌───────────────┐
           │ Redis / Celery│
           │ Background jobs
           └───────┬───────┘
                   │
        ┌──────────▼──────────┐
        │ Storyboard planning │
        │ PydanticAI          │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Media orchestration │
        │ Genblaze            │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Durable media       │
        │ Backblaze B2        │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Final rendering     │
        │ FFmpeg              │
        └─────────────────────┘
```

## Technology Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* pnpm

### Backend

* Python
* FastAPI
* Pydantic
* SQLAlchemy
* Alembic
* PostgreSQL
* Redis
* Celery
* PydanticAI
* Genblaze
* HTTPX
* FFmpeg

### Storage

* Backblaze B2
* S3-compatible object storage
* local filesystem storage for development

## AI Providers and Models

TaleMotion supports configurable providers by capability.

### Storyboard Generation

| Provider      | Example model | Purpose                        |
| ------------- | ------------- | ------------------------------ |
| Alibaba Cloud | `qwen-plus`   | Structured storyboard planning |
| OpenAI        | Configurable  | Optional storyboard provider   |

Storyboard providers are accessed through PydanticAI.

### Image Generation

| Provider  | Example model                    | Status                                |
| --------- | -------------------------------- | ------------------------------------- |
| GMICloud  | Configurable Seedream model      | Integrated                            |
| Replicate | `black-forest-labs/flux-schnell` | Integrated                            |
| QwenCloud | `wan2.6-t2i`                     | Integrated with mocked contract tests |

### Video Generation

| Provider  | Example model            | Status                                |
| --------- | ------------------------ | ------------------------------------- |
| GMICloud  | `wan2.6-i2v`             | Integrated                            |
| Replicate | Configurable video model | Integrated                            |
| QwenCloud | `wan2.6-i2v-flash`       | Integrated with mocked contract tests |

Media providers are connected through Genblaze adapters.

External generation depends on the provider account, API region, model availability, access permissions, and available credits.

Automated provider tests do not make paid generation requests.

## Backblaze B2 Storage

Backblaze B2 is used as the durable media layer for deployed TaleMotion environments.

Generated media is organized using project, scene, and generation-run prefixes:

```text
talemotion/
└── projects/
    └── {project}/
        └── scenes/
            └── {scene}/
                └── runs/
                    └── {run_id}/
```

Stored objects may include:

* generated keyframes;
* generated video clips;
* final rendered videos;
* provenance manifests;
* media metadata;
* content-addressed assets.

Temporary media URLs returned by providers are not treated as permanent application assets. Generated files are transferred into the configured storage backend, and TaleMotion stores durable references in PostgreSQL.

Signed preview URLs are created when users need to view private media.

## Genblaze Integration

Genblaze is the media orchestration layer used by TaleMotion.

It is responsible for parts of the workflow including:

* provider model validation;
* generation-step definitions;
* asynchronous task submission;
* provider polling;
* output retrieval;
* media transfer into durable storage;
* asset hashing;
* provenance manifests;
* parent-to-child media lineage;
* progress events;
* provider-independent pipeline execution.

Provider-specific request handling is isolated behind Genblaze `BaseProvider` implementations and media adapters.

The surrounding Celery workflow does not need provider-specific branches for each supported image or video service.

## Repository Structure

```text
talemotion/
├── frontend/                  # Next.js application
│
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI endpoints
│   │   ├── core/             # Configuration and Celery
│   │   ├── models/           # Database models
│   │   ├── providers/        # AI provider catalog and adapters
│   │   ├── rendering/        # FFmpeg rendering workflow
│   │   ├── schemas/          # API and job schemas
│   │   ├── storage/          # B2 and local storage
│   │   └── tasks/            # Celery tasks
│   │
│   ├── alembic/              # Database migrations
│   ├── tests/                # Backend test suite
│   └── README.md             # Detailed backend documentation
│
└── docs/
    ├── api-contract.md
    └── openapi.yaml
```

## Local Development

### Requirements

Install:

* a Python version supported by `backend/pyproject.toml`;
* `uv`;
* Node.js;
* `pnpm`;
* PostgreSQL;
* Redis;
* FFmpeg.

Verify the native services:

```bash
systemctl status postgresql
systemctl status redis-server

pg_isready
redis-cli ping
ffmpeg -version
```

## Backend Setup

Create a local environment file:

```bash
cd backend
cp .env.example .env
```

Install dependencies and apply migrations:

```bash
uv sync
uv run alembic upgrade head
```

Start FastAPI:

```bash
uv run uvicorn app.main:app --reload
```

Start a Celery worker in another terminal:

```bash
cd backend

uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering,system \
  --loglevel=info
```

Start Celery Beat in another terminal:

```bash
cd backend

uv run celery -A app.core.celery_app beat \
  --loglevel=info
```

## Frontend Setup

```bash
cd frontend

pnpm install
pnpm dev
```

Configure the frontend to use the persisted backend workflow:

```env
NEXT_PUBLIC_API_MODE=http
```

## Environment Configuration

Never commit `.env` files or real credentials.

### PostgreSQL and Redis

```env
DATABASE_URL=postgresql+psycopg://user:password@localhost/talemotion_dev
TEST_DATABASE_URL=postgresql+psycopg://user:password@localhost/talemotion_test

REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
```

The test database must be separate from the development database.

### Backblaze B2

```env
TALEMOTION_STORAGE_PROVIDER=b2

B2_REGION=...
B2_BUCKET_NAME=...
B2_KEY_ID=...
B2_APPLICATION_KEY=...
```

Local development can use:

```env
TALEMOTION_STORAGE_PROVIDER=local
```

### Alibaba Storyboard Provider

```env
TALEMOTION_STORYBOARD_PROVIDER=alibaba
TALEMOTION_STORYBOARD_MODEL=qwen-plus

DASHSCOPE_API_KEY=...
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

The endpoint must match the region and account associated with the API key.

### QwenCloud Media Provider

```env
DASHSCOPE_API_KEY=...
DASHSCOPE_MEDIA_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1

TALEMOTION_IMAGE_PROVIDER=qwencloud
TALEMOTION_IMAGE_MODEL=wan2.6-t2i

TALEMOTION_VIDEO_PROVIDER=qwencloud
TALEMOTION_VIDEO_MODEL=wan2.6-i2v-flash
TALEMOTION_VIDEO_DURATIONS=5
```

Changing provider configuration affects new generation jobs only. Existing jobs retain the provider and model selections captured when they were queued.

Restart FastAPI and Celery after changing backend environment variables.

## Testing

The backend suite requires PostgreSQL and a dedicated test database.

Run linting and all backend tests:

```bash
cd backend

uv run ruff check .
uv run pytest
```

Run the focused QwenCloud provider tests:

```bash
uv run pytest tests/test_qwencloud_provider.py
```

Mocked provider tests cover request payloads, polling, output parsing, error mapping, provider lifecycle, and media lineage without making paid external calls.

## Production-Oriented Design

TaleMotion includes architectural features intended to support continued product development:

* persisted project and job state;
* background workers;
* independent scene retries;
* immutable provider selections per job;
* idempotency keys;
* asset ownership;
* durable object storage;
* provenance manifests;
* content hashes;
* provider error normalization;
* stale-job handling;
* internal usage metering;
* final media rendering.

These features provide a foundation for a production product, but the current project should still be considered an MVP rather than a finished commercial service.

## Current Limitations

The current scope intentionally remains focused.

Known limitations include:

* the main workflow currently generates four-scene projects;
* historical documentaries are the first supported content format;
* long-form video production is not implemented;
* visual consistency across many scenes is still limited by provider capabilities;
* provider access and generation quality vary by model and account;
* narration and music require additional provider configuration;
* collaboration between multiple users is not yet implemented;
* payment processing is not implemented;
* deployment configuration depends on the selected hosting environment;
* some integrations are validated primarily through automated mocked tests.

## Roadmap

Potential next steps include:

* flexible storyboard length;
* editable scene planning;
* research and source references;
* visual-style presets;
* character and location consistency;
* reference-image workflows;
* generation cost previews;
* asset library and search;
* improved timeline preview;
* narration and subtitle editing;
* team collaboration;
* export presets for YouTube, TikTok, and other platforms;
* subscription and credit billing.

## Security Notes

Before deployment:

* keep API keys out of the repository;
* use HTTPS;
* restrict CORS to trusted origins;
* use secure production cookies;
* rotate exposed credentials;
* use separate development and test databases;
* restrict B2 application-key permissions;
* review generated logs for sensitive URLs;
* avoid committing local media, database dumps, or environment files.

## License

TaleMotion is licensed under the [Apache License 2.0](LICENSE).

Copyright © 2026 Kurnia Muhamad.
