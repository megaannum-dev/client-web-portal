import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, engine
from app.libs.auth.router import router as auth_router
from app.libs.documents.router import router as documents_router
from app.libs.financial.router import router as financial_router
from app.libs.users.router import router as users_router

import app.models.users as _models_users  # noqa: F401 — registers User with Base.metadata
import app.models.financial as _models_financial  # noqa: F401
import app.models.documents as _models_documents  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):  # type: ignore[type-arg]
    Base.metadata.create_all(bind=engine)
    logger.info("Database metadata ensured (create_all).")
    yield


settings = get_settings()
app: FastAPI = FastAPI(title="Client Web Portal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(financial_router, prefix="/api")
app.include_router(documents_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
