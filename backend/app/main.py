import sys
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import auth, admin, policies as policies_api, claims as claims_api
from app.core.config import settings

app = FastAPI(
    title="Watheeq AI API",
    version="0.1.0",
    description="Backend API for Watheeq AI insurance claims management platform",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(policies_api.admin_router, prefix="/api/admin", tags=["admin-policies"])
app.include_router(policies_api.router, prefix="/api", tags=["policies"])
app.include_router(claims_api.router, prefix="/api", tags=["claims"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return the real error message for any unhandled exception (dev mode)."""
    tb = traceback.format_exc()
    print(f"[UNHANDLED ERROR] {exc}\n{tb}", file=sys.stderr)
    # Manually inject CORS headers so the browser can read the error response
    origin = request.headers.get("origin", "")
    cors_headers = {}
    if origin:
        cors_headers["Access-Control-Allow-Origin"] = origin
        cors_headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
        headers=cors_headers,
    )


@app.get("/")
async def root():
    return {"status": "ok", "service": "Watheeq AI API"}
