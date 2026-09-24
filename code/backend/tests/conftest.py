# =============================================================================
# Proof of Aid — Team 05 — Shared pytest fixtures for the backend suite
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Isolated app per test (spec P3.5): in-memory SQLite shared across threads
(`StaticPool`, per the memory.md decision), temp storage, fresh random keys.

`TestClient` serves the app from another thread, so `:memory:` needs one
shared connection — `check_same_thread=False` plus sequential tests keep that
sound. Nothing here touches the real `.env` or the dev Postgres.
"""

from __future__ import annotations

import base64
import os
import secrets
from collections.abc import Generator
from pathlib import Path

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import create_app
from app.models import (
    ROLE_AUDITOR,
    ROLE_INTERNAL_VERIFIER,
    ROLE_ORGANIZATION,
    Participant,
)
from app.settings import Settings

WALLET_NAMES: tuple[str, ...] = ("org", "verifier", "verifier2", "auditor", "outsider")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Fresh settings with throwaway keys and an isolated storage dir."""
    fresh = Settings(
        database_url="sqlite://",
        evidence_encryption_key=base64.b64encode(os.urandom(32)).decode(),
        storage_dir=str(tmp_path / "storage"),
        session_secret=secrets.token_hex(32),
    )
    return fresh


@pytest.fixture
def engine() -> Generator[Engine, None, None]:
    """Single shared in-memory connection; schema created, dropped after."""
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture
def app(settings: Settings, engine: Engine):
    """App wired to the test engine (prod path builds its own from settings)."""
    return create_app(settings, engine=engine)


@pytest.fixture
def client(app) -> TestClient:
    """Anonymous HTTP client for the test app."""
    return TestClient(app)


@pytest.fixture
def wallets() -> dict[str, Account]:
    """Fresh throwaway wallets per test (never mainnet, never reused)."""
    named = {name: Account.create() for name in WALLET_NAMES}
    return named


def addresses_of(wallets: dict[str, Account]) -> dict[str, str]:
    """Lowercased addresses keyed by wallet name."""
    lowered = {name: account.address.lower() for name, account in wallets.items()}
    return lowered


def seed_participants(engine: Engine, rows: list[Participant]) -> None:
    """Insert accreditation rows directly (the P6 seed script does this live)."""
    with Session(engine) as db:
        db.add_all(rows)
        db.commit()


def seed_standard_roles(engine: Engine, addrs: dict[str, str]) -> None:
    """One org with two verifiers plus two auditors (one will be assigned)."""
    seed_participants(
        engine,
        [
            Participant(address=addrs["org"], role=ROLE_ORGANIZATION, active=True),
            Participant(
                address=addrs["verifier"],
                role=ROLE_INTERNAL_VERIFIER,
                organization=addrs["org"],
                active=True,
            ),
            Participant(
                address=addrs["verifier2"],
                role=ROLE_INTERNAL_VERIFIER,
                organization=addrs["org"],
                active=True,
            ),
            Participant(address=addrs["auditor"], role=ROLE_AUDITOR, active=True),
            Participant(address=addrs["outsider"], role=ROLE_AUDITOR, active=True),
        ],
    )


def login(client: TestClient, account: Account) -> None:
    """Run the full challenge/sign/verify flow; the client keeps the cookie."""
    challenge = client.post("/auth/challenge", json={"address": account.address}).json()
    signature = account.sign_message(encode_defunct(text=challenge["message"])).signature.hex()
    response = client.post(
        "/auth/verify", json={"address": account.address, "signature": "0x" + signature}
    )
    assert response.status_code == 200, response.text


def create_claim(client: TestClient, body: dict | None = None) -> dict:
    """Create the standard demo claim as the client's logged-in org."""
    payload = {
        "title": "500 food kits",
        "description": "Delivered in district X",
        "location_region": "North District",
        "claim_date": "2026-09-24",
    }
    if body is not None:
        payload.update(body)
    response = client.post("/claims", json=payload)
    assert response.status_code == 201, response.text
    created: dict = response.json()
    return created


def upload_file(
    client: TestClient, claim_id_hex: str, content: bytes, name: str = "evidence.bin",
    mime: str = "application/octet-stream", public: bool = False,
) -> dict:
    """Upload one file to a claim; returns the upload response JSON."""
    response = client.post(
        f"/claims/{claim_id_hex}/evidence",
        files={"files": (name, content, mime)},
        data={"public": "true" if public else "false"},
    )
    assert response.status_code == 201, response.text
    uploaded: dict = response.json()
    return uploaded
