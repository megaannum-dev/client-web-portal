import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import app.models.access as _models_access  # noqa: F401 — registers access tables with Base.metadata
import app.models.chat as _models_chat  # noqa: F401 — registers chat tables with Base.metadata
import app.models.onboarding as _models_onboarding  # noqa: F401 — registers onboarding tables with Base.metadata
import app.models.pc as _models_pc  # noqa: F401 — registers PC tables with Base.metadata
import app.models.reports as _models_reports  # noqa: F401 — registers reports tables with Base.metadata
import app.models.users as _models_users  # noqa: F401 — registers User with Base.metadata
from app.core.config import get_settings
from app.core.errors import GENERIC_500
from app.libs.access.router import router as access_router
from app.libs.allocation_matrix.router import router as allocation_matrix_router
from app.libs.allocation_matrix.scheduler import start_scheduler
from app.libs.auth.router import router as auth_router
from app.libs.chat.router import router as chat_router
from app.libs.client_portal.router import router as client_portal_router
from app.libs.client_portal.service import assert_upload_window_valid
from app.libs.clients.router import router as clients_router
from app.libs.onboarding.router import router as onboarding_router
from app.libs.onboarding.scheduler import start_scheduler as start_onboarding_scheduler
from app.libs.post_trade_allocation.router import router as post_trade_allocation_router
from app.libs.post_trade_allocation.scheduler import start_scheduler as start_pta_scheduler
from app.libs.reconciliation.router import router as reconciliation_router
from app.libs.reports.router import router as reports_router
from app.libs.staff.router import router as staff_router
from app.libs.trade_models.router import router as trade_models_router
from app.libs.users.router import router as users_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):  # type: ignore[type-arg]
    settings = get_settings()
    if settings.app_env == "production" and settings.firebase_auth_disabled:
        raise RuntimeError(
            "Fail-closed: firebase_auth_disabled cannot be enabled when APP_ENV=production."
        )
    assert_upload_window_valid()
    logger.info("Database migrations are applied before application startup.")
    scheduler_task = start_scheduler()
    pta_scheduler_task = start_pta_scheduler()
    onboarding_scheduler_task = start_onboarding_scheduler()
    yield
    scheduler_task.cancel()
    if pta_scheduler_task is not None:
        pta_scheduler_task.cancel()
    onboarding_scheduler_task.cancel()


settings = get_settings()
app: FastAPI = FastAPI(title="CRM Web Portal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Normalize `detail` to a string; lift a dict's slug into `code`.
    The string case (116 of 117 raise sites) is passed through UNTOUCHED."""
    detail: Any = exc.detail
    body: dict[str, Any]
    if isinstance(detail, str):
        body = {"detail": detail}
    elif isinstance(detail, dict):
        inner = detail.get("detail")
        body = {"detail": str(inner) if inner is not None else GENERIC_500}
        code = detail.get("code") or (inner if isinstance(inner, str) else None)
        if code:
            body["code"] = str(code)
    else:
        body = {"detail": str(detail)}
    return JSONResponse(body, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Flatten Pydantic's list-of-objects into a one-line string; keep the raw
    list under `errors` for any client that wants field-level detail."""
    errors = jsonable_encoder(exc.errors())
    first = errors[0] if errors else None
    if first is not None:
        loc = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        detail = f"{loc}: {first.get('msg', 'invalid value')}"
    else:
        detail = "Invalid request."
    return JSONResponse(
        {"detail": detail, "code": "validation_error", "errors": errors}, status_code=422
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Fixed generic message — never str(exc) (§4.1(c), and B-1)."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": GENERIC_500}, status_code=500)


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(trade_models_router, prefix="/api")
app.include_router(allocation_matrix_router, prefix="/api")
app.include_router(post_trade_allocation_router, prefix="/api")
# --- Internal (admin-portal) routes ---
app.include_router(clients_router, prefix="/api")  # /api/rm/…
app.include_router(staff_router, prefix="/api")  # /api/admin/staff/…
app.include_router(reconciliation_router, prefix="/api")
app.include_router(
    onboarding_router, prefix="/api"
)  # /api/rm|compliance|pc|client onboarding routes
app.include_router(client_portal_router, prefix="/api")  # /api/client|rm/tickets… (relocated + new)
app.include_router(access_router, prefix="/api")  # /api/admin/access/…, /api/admin/audit
app.include_router(reports_router, prefix="/api")  # /api/reports/eom-comments
app.include_router(chat_router, prefix="/api")  # /api/chat/…, /api/ws/chat


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
