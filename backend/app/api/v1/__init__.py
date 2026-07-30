from fastapi import APIRouter

from app.api.v1.chapters import router as chapters_router
from app.api.v1.health import router as health_router
from app.api.v1.projects import router as projects_router
from app.api.v1.scenes import router as scenes_router

v1_router = APIRouter()
v1_router.include_router(health_router)
v1_router.include_router(projects_router)
v1_router.include_router(chapters_router)
v1_router.include_router(scenes_router)
