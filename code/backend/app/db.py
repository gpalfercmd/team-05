# =============================================================================
# Proof of Aid — Team 05 — SQLAlchemy engine, session factory and declarative base
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Database wiring (spec P3.1). Models are portable: the same metadata runs on
PostgreSQL (production) and SQLite (tests) — `Uuid` renders natively on
PostgreSQL and as CHAR(32) elsewhere.
"""

from __future__ import annotations

from collections.abc import Generator

from fastapi import Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.settings import Settings


class Base(DeclarativeBase):
    """Declarative base for all backend models."""


def make_engine(settings: Settings) -> Engine:
    """Create the SQLAlchemy engine from the configured database URL."""
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a session factory bound to `engine` (stored on `app.state`)."""
    factory: sessionmaker[Session] = sessionmaker(bind=engine, autoflush=False)
    return factory


def get_session(request: Request) -> Generator[Session, None, None]:
    """FastAPI dependency yielding one session per request, always closed."""
    factory: sessionmaker[Session] = request.app.state.session_factory
    session = factory()
    try:
        yield session
    finally:
        session.close()
