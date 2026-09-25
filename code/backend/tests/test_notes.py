# =============================================================================
# Proof of Aid — Team 05 — Note endpoint tests: salted fingerprint check, sealing, who reads (P10.3)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""A note is stored only when its hash is keccak256(salt ‖ utf8(text)); text and
salt are sealed with the claim key; the claim's authorized viewers read every
note, other signed-in wallets only their own, anonymous visitors none."""

from __future__ import annotations

import json
import secrets
import uuid
from pathlib import Path

from eth_account import Account
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.models import Claim, ClaimNote
from poa_shared.notes import legacy_note_hash, note_hash
from poa_shared.result import Ok
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles

VECTORS_PATH = Path(__file__).parents[2] / "shared" / "note-vectors.json"
NOTE_TEXT = "Missing receipt for kit 12."


def _note(text: str = NOTE_TEXT, kind: str = "justification") -> dict[str, str]:
    salt = secrets.token_bytes(32)
    hashed = note_hash(salt, text)
    assert isinstance(hashed, Ok)
    body = {"kind": kind, "text": text, "salt": f"0x{salt.hex()}", "note_hash": f"0x{hashed.value.hex()}"}
    return body


def _signed_in(client: TestClient, account: Account) -> TestClient:
    other = TestClient(client.app)
    login(other, account)
    return other


def _claim(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> str:
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    claim_id: str = create_claim(client)["claim_id_hex"]
    return claim_id


def _assign_auditor(engine: Engine, claim_id_hex: str, auditor: str) -> None:
    with Session(engine) as db:
        claim = db.scalars(select(Claim).where(Claim.claim_id_hex == claim_id_hex)).one()
        claim.auditor_address = auditor
        db.commit()


def test_backend_uses_the_shared_note_vectors() -> None:
    vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    for case in vectors["cases"]:
        salt = bytes.fromhex(case["salt"].removeprefix("0x"))
        assert note_hash(salt, case["text"]) == Ok(bytes.fromhex(case["note_hash"].removeprefix("0x")))
        assert legacy_note_hash(case["text"]).hex() == case["legacy_hash"].removeprefix("0x")


def test_author_stores_a_note_and_reads_it_back(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id = _claim(client, engine, wallets)
    verifier = _signed_in(client, wallets["verifier"])
    body = _note()
    stored = verifier.post(f"/claims/{claim_id}/notes", json=body)
    assert stored.status_code == 201, stored.text
    assert stored.json() | {"id": None, "created_at": None} == {
        "id": None,
        "created_at": None,
        "claim_id": claim_id,
        "kind": "justification",
        "author": addresses_of(wallets)["verifier"],
        "note_hash": body["note_hash"],
        "text": NOTE_TEXT,
        "salt": body["salt"],
    }
    listed = verifier.get(f"/claims/{claim_id}/notes").json()["notes"]
    assert [note["note_hash"] for note in listed] == [body["note_hash"]]


def test_a_hash_that_does_not_match_the_recipe_is_refused(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id = _claim(client, engine, wallets)
    body = _note()
    unsalted = {**body, "note_hash": f"0x{legacy_note_hash(NOTE_TEXT).hex()}"}
    other_text = {**body, "text": "approved"}
    for wrong in (unsalted, other_text):
        response = client.post(f"/claims/{claim_id}/notes", json=wrong)
        assert response.status_code == 422, response.text
    assert client.post(f"/claims/{claim_id}/notes", json={**body, "kind": "gossip"}).status_code == 422
    with Session(engine) as db:
        assert db.scalars(select(ClaimNote)).first() is None


def test_the_same_fingerprint_twice_conflicts(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id = _claim(client, engine, wallets)
    body = _note()
    assert client.post(f"/claims/{claim_id}/notes", json=body).status_code == 201
    assert client.post(f"/claims/{claim_id}/notes", json=body).status_code == 409


def test_text_and_salt_are_sealed_at_rest(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id = _claim(client, engine, wallets)
    body = _note()
    assert client.post(f"/claims/{claim_id}/notes", json=body).status_code == 201
    with Session(engine) as db:
        row = db.scalars(select(ClaimNote)).one()
        salt = bytes.fromhex(body["salt"].removeprefix("0x"))
        assert NOTE_TEXT.encode() not in row.text_sealed
        assert salt not in row.salt_sealed
        assert row.note_hash_hex == body["note_hash"]


def test_authorized_viewers_read_every_note_and_others_only_their_own(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id = _claim(client, engine, wallets)
    addrs = addresses_of(wallets)
    _assign_auditor(engine, claim_id, addrs["auditor"])
    verifier = _signed_in(client, wallets["verifier"])
    outsider = _signed_in(client, wallets["outsider"])
    auditor = _signed_in(client, wallets["auditor"])
    by_verifier = _note("Receipts match.")
    by_outsider = _note("Counter-evidence: photo is from 2024.", kind="counter_evidence")
    assert verifier.post(f"/claims/{claim_id}/notes", json=by_verifier).status_code == 201
    assert outsider.post(f"/claims/{claim_id}/notes", json=by_outsider).status_code == 201
    everything = {by_verifier["note_hash"], by_outsider["note_hash"]}
    for reader in (client, verifier, auditor):
        notes = reader.get(f"/claims/{claim_id}/notes").json()["notes"]
        assert {note["note_hash"] for note in notes} == everything
    own = outsider.get(f"/claims/{claim_id}/notes").json()["notes"]
    assert [note["note_hash"] for note in own] == [by_outsider["note_hash"]]


def test_anonymous_visitors_get_no_notes_and_the_public_view_has_no_text(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id = _claim(client, engine, wallets)
    body = _note()
    assert client.post(f"/claims/{claim_id}/notes", json=body).status_code == 201
    anonymous = TestClient(client.app)
    assert anonymous.get(f"/claims/{claim_id}/notes").status_code == 401
    assert anonymous.post(f"/claims/{claim_id}/notes", json=_note()).status_code == 401
    public = anonymous.get(f"/claims/{claim_id}")
    assert NOTE_TEXT not in public.text
    assert body["salt"] not in public.text


def test_notes_need_a_claim_the_backend_knows(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    _claim(client, engine, wallets)
    unknown = "0x" + uuid.uuid4().hex * 2
    assert client.post(f"/claims/{unknown}/notes", json=_note()).status_code == 404
    assert client.get(f"/claims/{unknown}/notes").status_code == 404
