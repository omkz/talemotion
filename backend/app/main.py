from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import RequestIdMiddleware, register_error_handlers
from app.repositories.memory import InMemoryProjectRepository

app = FastAPI(
    title="TaleMotion API",
    version=settings.app_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)

app.include_router(api_router, prefix="/api")
app.state.project_repository = InMemoryProjectRepository()
register_error_handlers(app)
