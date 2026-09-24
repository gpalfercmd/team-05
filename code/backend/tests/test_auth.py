# =============================================================================
# Proof of Aid — Team 05 — Auth tests: challenge, verify, session, anti-replay
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Wallet login over HTTP (spec P3.4): malformed input, unknown signatures,
single-use nonces and expiry all refuse with 401/400 — never a session."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.models import Challenge
from tests.conftest import login


def test_challenge_rejects_malformed_address(client: TestClient) -> None:
    assert client.post("/auth/challenge", json={"address": "0xZZZ"}).status_code == 400
    assert client.post("/auth/challenge", json={"address": ""}).status_code == 400


def test_verify_without_challenge_is_401(client: TestClient, wallets: dict[str, Account]) -> None:
    account = wallets["org"]
    response = client.post(
        "/auth/verify", json={"address": account.address, "signature": "0x" + "ab" * 65}
    )
    assert response.status_code == 401


def test_verify_wrong_signature_is_401(client: TestClient, wallets: dict[str, Account]) -> None:
    org, outsider = wallets["org"], wallets["outsider"]
    challenge = client.post("/auth/challenge", json={"address": org.address}).json()
    foreign = outsider.sign_message(encode_defunct(text=challenge["message"])).signature.hex()
    response = client.post(
        "/auth/verify", json={"address": org.address, "signature": "0x" + foreign}
    )
    assert response.status_code == 401
    assert client.get("/auth/me").status_code == 401


def test_verify_malformed_signature_is_401(client: TestClient, wallets: dict[str, Account]) -> None:
    account = wallets["org"]
    client.post("/auth/challenge", json={"address": account.address})
    response = client.post("/auth/verify", json={"address": account.address, "signature": "0x123"})
    assert response.status_code == 401


def test_login_me_logout_flow(client: TestClient, wallets: dict[str, Account]) -> None:
    account = wallets["org"]
    login(client, account)
    assert client.get("/auth/me").json() == {"address": account.address.lower()}
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401


def test_nonce_cannot_be_reused(client: TestClient, wallets: dict[str, Account]) -> None:
    account = wallets["org"]
    challenge = client.post("/auth/challenge", json={"address": account.address}).json()
    signature = account.sign_message(encode_defunct(text=challenge["message"])).signature.hex()
    payload = {"address": account.address, "signature": "0x" + signature}
    assert client.post("/auth/verify", json=payload).status_code == 200
    assert client.post("/auth/verify", json=payload).status_code == 401


def test_expired_challenge_is_401(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    account = wallets["org"]
    challenge = client.post("/auth/challenge", json={"address": account.address}).json()
    with Session(engine) as db:
        row = db.scalars(select(Challenge).where(Challenge.nonce == challenge["nonce"])).one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    signature = account.sign_message(encode_defunct(text=challenge["message"])).signature.hex()
    response = client.post(
        "/auth/verify", json={"address": account.address, "signature": "0x" + signature}
    )
    assert response.status_code == 401
