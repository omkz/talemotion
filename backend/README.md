# TaleMotion Backend

Python 3.12 FastAPI foundation for TaleMotion. It currently exposes health
plus in-memory project, chapter, and scene resources under `/api/v1`.
Repository state is process-local and resets on restart. No database, queue,
AI provider, storage provider, or rendering pipeline is implemented.

## Development

```bash
uv sync
uv run ruff check .
uv run pytest
uv run fastapi dev app/main.py
```

Production-style server command:

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Copy `.env.example` to `.env` for local overrides.

## Server and worker convention

The API server and future background worker will share this Python codebase
but run as separate processes. Worker tasks belong in `app/tasks/`, generation
and rendering pipelines in `app/pipelines/`, and external-service adapters in
`app/integrations/`. Do not create a separate worker application.
