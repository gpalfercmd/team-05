# =============================================================================
# Proof of Aid — Team 05 — FastAPI application factory
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Application entry point (spec P3.1).

`create_app` builds the app from explicit settings so tests inject their own
(SQLite + temp storage) without touching the real `.env`. Routers land here in
the P3.2–P3.4 slices.
"""

from __future__ import annotations

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.db import make_engine, make_session_factory
from app.settings import Settings, load_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI app with session middleware and request-scoped sessions."""
    resolved = settings if settings is not None else load_settings()
    engine = make_engine(resolved)
    app = FastAPI(title="Proof of Aid — backend")
    app.state.session_factory = make_session_factory(engine)
    app.add_middleware(SessionMiddleware, secret_key=resolved.session_secret)

    @app.get("/health")
    def health() -> dict[str, str]:
        """Liveness probe (no auth, no DB)."""
        status: dict[str, str] = {"status": "ok"}
        return status

    built: FastAPI = app
    return built
