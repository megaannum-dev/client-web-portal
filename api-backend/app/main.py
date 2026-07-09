import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, engine
from app.libs.auth.router import router as auth_router
from app.libs.trade_models.router import router as trade_models_router
from app.libs.allocation_matrix.router import router as allocation_matrix_router
from app.libs.allocation_matrix.scheduler import start_scheduler
from app.libs.users.router import router as users_router
from app.libs.clients.router import router as clients_router

import app.models.users as _models_users  # noqa: F401 — registers User with Base.metadata
import app.models.pc as _models_pc  # noqa: F401 — registers PC tables with Base.metadata

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):  # type: ignore[type-arg]
    Base.metadata.create_all(bind=engine)
    logger.info("Database metadata ensured (create_all).")
    scheduler_task = start_scheduler()
    yield
    scheduler_task.cancel()


settings = get_settings()
app: FastAPI = FastAPI(title="CRM Web Portal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(trade_models_router, prefix="/api")
app.include_router(allocation_matrix_router, prefix="/api")
app.include_router(clients_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
