# =============================================================================
# Proof of Aid — Team 05 — CORS tests: credentialed access for the frontend only
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""The frontend (another origin) calls the API with the session cookie, so
CORS must allow credentials for the configured origins only — and a wildcard
origin is refused at startup, because `*` plus credentials would let any site
act as the logged-in wallet."""

from __future__ import annotations

import base64
import os
import secrets

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.settings import DEFAULT_CORS_ORIGINS, Settings

ALLOWED_ORIGIN = DEFAULT_CORS_ORIGINS
DISALLOWED_ORIGIN = "https://evil.example"


def _preflight(client: TestClient, origin: str):
    """Send the browser's preflight for a JSON POST."""
    response = client.options(
        "/claims",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    return response


def test_preflight_from_allowed_origin_succeeds_with_credentials(client: TestClient) -> None:
    response = _preflight(client, ALLOWED_ORIGIN)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_disallowed_origin_gets_no_allow_origin(client: TestClient) -> None:
    preflight = _preflight(client, DISALLOWED_ORIGIN)
    simple = client.get("/health", headers={"Origin": DISALLOWED_ORIGIN})
    assert "access-control-allow-origin" not in preflight.headers
    assert "access-control-allow-origin" not in simple.headers


def test_simple_request_from_allowed_origin_echoes_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


@pytest.mark.parametrize("origins", ["*", "http://localhost:5173,*", " , ", "localhost:5173"])
def test_settings_refuse_wildcard_or_malformed_origins(origins: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="sqlite://",
            evidence_encryption_key=base64.b64encode(os.urandom(32)).decode(),
            storage_dir="./storage",
            session_secret=secrets.token_hex(32),
            cors_origins=origins,
        )


def test_settings_split_comma_separated_origins() -> None:
    configured = Settings(
        database_url="sqlite://",
        evidence_encryption_key=base64.b64encode(os.urandom(32)).decode(),
        storage_dir="./storage",
        session_secret=secrets.token_hex(32),
        cors_origins="http://localhost:5173, https://poa.example",
    )
    assert configured.cors_origin_list == ["http://localhost:5173", "https://poa.example"]
