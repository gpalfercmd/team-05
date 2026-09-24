# =============================================================================
# Proof of Aid — Team 05 — FastAPI application factory
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Application entry point (spec P3.1).

`create_app` builds the app from explicit settings so tests inject their own
(SQLite + temp storage) without touching the real `.env`. Routers: auth
(wallet login), claims (create/read/upload), files (download/visibility).
"""

from __future__ import annotations

from fastapi import FastAPI
from sqlalchemy import Engine
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.claims import router as claims_router
from app.api.files import router as files_router
from app.db import make_engine, make_session_factory
from app.settings import Settings, load_settings


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    """Build the FastAPI app with session middleware and request-scoped sessions.

    `engine` is injectable so tests share one in-memory SQLite connection
    across threads; production always builds it from `settings`.
    """
    resolved = settings if settings is not None else load_settings()
    active_engine = engine if engine is not None else make_engine(resolved)
    app = FastAPI(title="Proof of Aid — backend")
    app.state.settings = resolved
    app.state.session_factory = make_session_factory(active_engine)
    app.add_middleware(SessionMiddleware, secret_key=resolved.session_secret)
    app.include_router(auth_router)
    app.include_router(claims_router)
    app.include_router(files_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        """Liveness probe (no auth, no DB)."""
        status: dict[str, str] = {"status": "ok"}
        return status

    built: FastAPI = app
    return built
