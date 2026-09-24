# =============================================================================
# Proof of Aid — Team 05 — FastAPI application factory
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Application entry point (spec P3.1).

`create_app` builds the app from explicit settings so tests inject their own
(SQLite + temp storage) without touching the real `.env`. Routers: auth
(wallet login), claims (create/read/upload/manifest), files (download/visibility).
CORS admits only the configured frontend origins, with credentials, so the
browser may send the session cookie cross-origin (Vite dev server by default).
"""

from __future__ import annotations

from typing import Final

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.claims import router as claims_router
from app.api.files import router as files_router
from app.db import make_engine, make_session_factory
from app.settings import Settings, load_settings

# Explicit lists (never "*"): exactly what the routers and the frontend use.
CORS_METHODS: Final[tuple[str, ...]] = ("GET", "POST", "PATCH", "OPTIONS")
CORS_HEADERS: Final[tuple[str, ...]] = ("Content-Type", "Accept")


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
    # Added last so it wraps everything: preflights are answered before the
    # session layer, and error responses still carry the CORS headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=True,  # the frontend sends the wallet-login session cookie
        allow_methods=list(CORS_METHODS),
        allow_headers=list(CORS_HEADERS),
    )
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
