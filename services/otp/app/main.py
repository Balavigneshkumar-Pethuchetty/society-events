from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse

from app.routes import otp, register, monitor

# Swagger UI fetches the spec using this URL.  Using a bare filename (no
# leading slash) makes browsers resolve it relative to the current page URL:
#   https://host/api/otp/docs  →  spec fetched from  https://host/api/otp/openapi.json
# An absolute "/openapi.json" would resolve to the React frontend's root — wrong.
_OPENAPI_URL = "openapi.json"


@asynccontextmanager
async def lifespan(_: FastAPI):
    from app.otp_store import _get_redis
    await _get_redis().ping()
    yield


app = FastAPI(
    title="OTP Bridge Service",
    description=(
        "Mobile OTP login and phone-based registration bridge. "
        "Integrates with Redis (OTP storage) and Keycloak (token exchange)."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,          # served manually so we can control the openapi URL
    redoc_url=None,
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Route prefixes (nginx strips /api/otp/ → /) ───────────────────────────────
app.include_router(otp.router,      prefix="",           tags=["otp"])
app.include_router(register.router, prefix="/register",  tags=["register"])
app.include_router(monitor.router,  prefix="",           tags=["monitor"])


# ── Swagger UI — relative openapi URL so it works behind nginx ────────────────
@app.get("/docs", include_in_schema=False)
async def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=_OPENAPI_URL,   # relative → resolves to /api/otp/openapi.json
        title="OTP Bridge Service — API Docs",
    )


# ── OpenAPI spec — add servers so "Try it out" uses the nginx prefix ──────────
def _build_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema["servers"] = [{"url": "/api/otp", "description": "via nginx"}]
    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = _build_openapi


@app.get("/health", tags=["ops"])
async def health():
    from app.otp_store import _get_redis
    await _get_redis().ping()
    return {"status": "ok", "service": "otp-bridge"}
