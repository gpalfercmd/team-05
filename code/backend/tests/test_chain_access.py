# =============================================================================
# Proof of Aid — Team 05 — Chain-mode access tests: roles from indexed events
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""P4 access matrix with `ROLE_SOURCE=chain`: the private-evidence roles come
from the indexed ParticipantRegistry/ClaimRegistry events, never from the local
`participants` table. Events are synthetic (ABI-encoded) and go through the
real indexer before every check."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from eth_account import Account
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import Engine

from poa_shared.result import Ok

from app.indexer.deployment import DeploymentConfigError
from app.indexer.sync import SyncOptions, sync_once
from app.main import create_app
from app.models import ROLE_AUDITOR, ROLE_INTERNAL_VERIFIER, ROLE_ORGANIZATION, Participant
from app.services.evidence import sanitize_upload
from app.settings import Settings
from tests.chain_helpers import (
    FakeChain,
    accredit_cast,
    catalog,
    claim_event,
    deployment,
    hash32,
    participant,
    status,
    write_deployment,
)
from tests.conftest import addresses_of, create_claim, login, seed_participants, upload_file

ADMIN = "0x" + "a1" * 20
AUTHORITY = "0x" + "a2" * 20
PRIVATE_BYTES = b"private delivery photo"
ZERO_ADDRESS = "0x" + "00" * 20


@pytest.fixture
def chain_settings(settings: Settings, tmp_path: Path) -> Settings:
    """Test settings plus a deployment file: role source defaults to chain."""
    return settings.model_copy(update={"deployment_file": str(write_deployment(tmp_path))})


@pytest.fixture
def chain_app(chain_settings: Settings, engine: Engine) -> FastAPI:
    return create_app(chain_settings, engine=engine)


@pytest.fixture
def chain() -> FakeChain:
    return FakeChain(events=catalog(), target=deployment())


@pytest.fixture
def index(chain_app: FastAPI, chain: FakeChain) -> Callable[[], None]:
    """Run the indexer once against the fake chain into the app's database."""

    def run() -> None:
        outcome = sync_once(
            chain_app.state.session_factory, chain, catalog(), deployment(),
            SyncOptions(confirmations=0, block_chunk=2000),
        )
        assert isinstance(outcome, Ok), outcome
        assert outcome.value.projection_warnings == []

    return run


def _client(app: FastAPI, account: Account | None = None) -> TestClient:
    client = TestClient(app)
    if account is not None:
        login(client, account)
    return client


def _anchored_claim(
    app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> dict:
    """Org accredited onchain creates a claim, uploads one private file, anchors it."""
    addrs = addresses_of(wallets)
    accredit_cast(chain, ADMIN, AUTHORITY, addrs)
    index()
    org = _client(app, wallets["org"])
    claim = create_claim(org)
    uploaded = upload_file(org, claim["claim_id_hex"], PRIVATE_BYTES, "a.jpg", "image/jpeg")
    claim_id = claim["claim_id_hex"]
    chain.tx(
        claim_event(
            "ClaimAnchored", claimId=claim_id, organization=addrs["org"],
            evidenceRoot=uploaded["evidence_root"], metadataHash=claim["metadata_hash_hex"],
        ),
        status(claim_id, "None", "Anchored"),
    )
    chain.tx(
        claim_event(
            "InternalAttestation", claimId=claim_id, verifier=addrs["verifier"], approved=True,
            justificationHash=hash32("j1"),
        ),
        status(claim_id, "Anchored", "InternallyVerified"),
    )
    index()
    return {"claim_id": claim_id, "file_id": uploaded["files"][0]["id"]}


def _assign(chain: FakeChain, claim_id: str, auditor: str, previous: str = ZERO_ADDRESS) -> None:
    chain.tx(claim_event("AuditorAssigned", claimId=claim_id, auditor=auditor, previousAuditor=previous))


def _reads_private(app: FastAPI, account: Account, file_id: str) -> bool:
    response = _client(app, account).get(f"/files/{file_id}")
    assert response.status_code in (200, 404), response.text
    return response.status_code == 200 and response.content == sanitize_upload(PRIVATE_BYTES)


def test_role_source_defaults(settings: Settings, chain_settings: Settings) -> None:
    assert settings.effective_role_source == "local"
    assert chain_settings.effective_role_source == "chain"
    forced_local = chain_settings.model_copy(update={"role_source": "local"})
    assert forced_local.effective_role_source == "local"
    with pytest.raises(ValidationError):
        Settings(**{**settings.model_dump(), "role_source": "chain", "deployment_file": None})


def test_broken_deployment_file_stops_startup(settings: Settings, engine: Engine, tmp_path: Path) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text("{not json")
    with pytest.raises(DeploymentConfigError):
        create_app(settings.model_copy(update={"deployment_file": str(broken)}), engine=engine)


def test_local_participants_table_is_ignored_in_chain_mode(
    chain_app: FastAPI, engine: Engine, wallets: dict[str, Account]
) -> None:
    addrs = addresses_of(wallets)
    seed_participants(engine, [Participant(address=addrs["org"], role=ROLE_ORGANIZATION, active=True)])
    org = _client(chain_app, wallets["org"])
    response = org.post(
        "/claims",
        json={"title": "t", "description": "d", "location_region": "r", "claim_date": "2026-09-24"},
    )
    assert response.status_code == 403


def test_org_and_verifiers_read_private_evidence(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    scenario = _anchored_claim(chain_app, chain, index, wallets)
    for name in ("org", "verifier", "verifier2"):
        assert _reads_private(chain_app, wallets[name], scenario["file_id"]), name


def test_only_the_assigned_auditor_reads_private_evidence(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    scenario = _anchored_claim(chain_app, chain, index, wallets)
    addrs = addresses_of(wallets)
    assert not _reads_private(chain_app, wallets["auditor"], scenario["file_id"])
    _assign(chain, scenario["claim_id"], addrs["auditor"])
    index()
    assert _reads_private(chain_app, wallets["auditor"], scenario["file_id"])
    assert not _reads_private(chain_app, wallets["outsider"], scenario["file_id"])
    # Reassignment by the Authority moves access to the new auditor.
    _assign(chain, scenario["claim_id"], addrs["outsider"], previous=addrs["auditor"])
    index()
    assert _reads_private(chain_app, wallets["outsider"], scenario["file_id"])
    assert not _reads_private(chain_app, wallets["auditor"], scenario["file_id"])


def test_revoked_auditor_loses_access(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    scenario = _anchored_claim(chain_app, chain, index, wallets)
    addrs = addresses_of(wallets)
    _assign(chain, scenario["claim_id"], addrs["auditor"])
    index()
    assert _reads_private(chain_app, wallets["auditor"], scenario["file_id"])
    chain.tx(participant("AuditorRevoked", auditor=addrs["auditor"], authority=AUTHORITY))
    index()
    assert not _reads_private(chain_app, wallets["auditor"], scenario["file_id"])


def test_revoked_verifier_loses_access_after_the_revocation_event(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    scenario = _anchored_claim(chain_app, chain, index, wallets)
    addrs = addresses_of(wallets)
    chain.tx(
        participant(
            "InternalVerifierRevoked", verifier=addrs["verifier"], organization=addrs["org"],
            registryAdmin=ADMIN,
        )
    )
    # Not indexed yet: the backend only knows what the chain index says.
    assert _reads_private(chain_app, wallets["verifier"], scenario["file_id"])
    index()
    assert not _reads_private(chain_app, wallets["verifier"], scenario["file_id"])
    assert _reads_private(chain_app, wallets["verifier2"], scenario["file_id"])


def test_revoked_organization_cuts_off_itself_and_its_verifiers(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    scenario = _anchored_claim(chain_app, chain, index, wallets)
    addrs = addresses_of(wallets)
    org = _client(chain_app, wallets["org"])
    chain.tx(participant("OrganizationRevoked", organization=addrs["org"], registryAdmin=ADMIN))
    index()
    for name in ("org", "verifier", "verifier2"):
        assert not _reads_private(chain_app, wallets[name], scenario["file_id"]), name
    upload = org.post(
        f"/claims/{scenario['claim_id']}/evidence",
        files={"files": ("b.bin", b"more", "application/octet-stream")},
        data={"public": "false", "root_index": "1"},
    )
    assert upload.status_code == 403
    assert org.patch(f"/files/{scenario['file_id']}", json={"is_public": True}).status_code == 403


def test_verifier_of_another_organization_cannot_read(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    scenario = _anchored_claim(chain_app, chain, index, wallets)
    other_org, other_verifier = Account.create(), Account.create()
    chain.tx(participant("OrganizationRegistered", organization=other_org.address.lower(), registryAdmin=ADMIN))
    chain.tx(
        participant(
            "InternalVerifierRegistered", verifier=other_verifier.address.lower(),
            organization=other_org.address.lower(), registryAdmin=ADMIN,
        )
    )
    index()
    assert not _reads_private(chain_app, other_verifier, scenario["file_id"])
    assert not _reads_private(chain_app, other_org, scenario["file_id"])


def test_auditor_of_a_hijacked_claim_id_gets_nothing(
    chain_app: FastAPI, chain: FakeChain, index: Callable[[], None], wallets: dict[str, Account]
) -> None:
    """The claimId was anchored onchain by another organization first."""
    addrs = addresses_of(wallets)
    accredit_cast(chain, ADMIN, AUTHORITY, addrs)
    index()
    org = _client(chain_app, wallets["org"])
    claim = create_claim(org)
    uploaded = upload_file(org, claim["claim_id_hex"], PRIVATE_BYTES, "a.jpg", "image/jpeg")
    squatter = Account.create().address.lower()
    chain.tx(participant("OrganizationRegistered", organization=squatter, registryAdmin=ADMIN))
    chain.tx(
        claim_event(
            "ClaimAnchored", claimId=claim["claim_id_hex"], organization=squatter,
            evidenceRoot=hash32("other"), metadataHash=hash32("other-meta"),
        ),
        status(claim["claim_id_hex"], "None", "Anchored"),
    )
    _assign(chain, claim["claim_id_hex"], addrs["auditor"])
    index()
    assert not _reads_private(chain_app, wallets["auditor"], uploaded["files"][0]["id"])


def test_local_mode_still_uses_the_participants_table(
    settings: Settings, engine: Engine, tmp_path: Path, wallets: dict[str, Account]
) -> None:
    """Explicit `ROLE_SOURCE=local` keeps the P3 resolver even with a deployment file."""
    local = settings.model_copy(
        update={"deployment_file": str(write_deployment(tmp_path)), "role_source": "local"}
    )
    app = create_app(local, engine=engine)
    addrs = addresses_of(wallets)
    seed_participants(
        engine,
        [
            Participant(address=addrs["org"], role=ROLE_ORGANIZATION, active=True),
            Participant(
                address=addrs["verifier"], role=ROLE_INTERNAL_VERIFIER,
                organization=addrs["org"], active=True,
            ),
            Participant(address=addrs["auditor"], role=ROLE_AUDITOR, active=True),
        ],
    )
    org = _client(app, wallets["org"])
    claim = create_claim(org)
    uploaded = upload_file(org, claim["claim_id_hex"], PRIVATE_BYTES, "a.jpg", "image/jpeg")
    assert _reads_private(app, wallets["verifier"], uploaded["files"][0]["id"])
    assert not _reads_private(app, wallets["auditor"], uploaded["files"][0]["id"])
