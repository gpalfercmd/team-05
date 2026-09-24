# =============================================================================
# Proof of Aid — Team 05 — Public chain-index API tests (no login)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""P4.2: `/public/claims`, `/public/claims/{id}/timeline` and
`/public/indexer/status` answer anonymous clients from the chain index, with
chain data only (never evidence file data), and 503 when no chain is configured."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from poa_shared.result import Ok

from app.indexer.sync import SyncOptions, sync_once
from app.main import create_app
from app.settings import Settings
from tests.chain_helpers import (
    CHAIN_ID,
    CLAIM_REGISTRY,
    DEPLOY_BLOCK,
    FakeChain,
    accredit_cast,
    catalog,
    claim_event,
    deployment,
    full_story,
    hash32,
    status,
    write_deployment,
)

ADMIN = "0x" + "a1" * 20
AUTHORITY = "0x" + "a2" * 20
CAST = {
    "org": "0x" + "0a" * 20,
    "verifier": "0x" + "0b" * 20,
    "verifier2": "0x" + "0c" * 20,
    "auditor": "0x" + "0d" * 20,
    "outsider": "0x" + "0e" * 20,
}
STORY_CLAIM = hash32("story")
SECOND_CLAIM = hash32("second")


@pytest.fixture
def indexed(settings: Settings, engine: Engine, tmp_path: Path) -> tuple[TestClient, FakeChain]:
    """App with a deployment file and a fake chain holding two claims, indexed."""
    app: FastAPI = create_app(
        settings.model_copy(update={"deployment_file": str(write_deployment(tmp_path))}),
        engine=engine,
    )
    chain = FakeChain(events=catalog(), target=deployment())
    accredit_cast(chain, ADMIN, AUTHORITY, CAST)
    full_story(chain, STORY_CLAIM, CAST, AUTHORITY)
    chain.tx(
        claim_event(
            "ClaimAnchored", claimId=SECOND_CLAIM, organization=CAST["org"],
            evidenceRoot=hash32("second-root"), metadataHash=hash32("second-meta"),
        ),
        status(SECOND_CLAIM, "None", "Anchored"),
    )
    chain.mine_empty(4)
    outcome = sync_once(
        app.state.session_factory, chain, catalog(), deployment(),
        SyncOptions(confirmations=2, block_chunk=2000),
    )
    assert isinstance(outcome, Ok), outcome
    return TestClient(app), chain


def test_claims_list_newest_first_with_status_filter(indexed: tuple[TestClient, FakeChain]) -> None:
    client, chain = indexed
    page = client.get("/public/claims").json()
    assert [item["claimId"] for item in page["items"]] == [SECOND_CLAIM, STORY_CLAIM]
    assert page["total"] == 2
    assert page["indexedToBlock"] == chain.head_block - 2
    assert page["items"][1]["status"] == "Verified"
    assert page["items"][1]["anchoredAt"].endswith(("Z", "+00:00"))
    verified = client.get("/public/claims", params={"status": "Verified"}).json()
    assert [item["claimId"] for item in verified["items"]] == [STORY_CLAIM]
    paged = client.get("/public/claims", params={"limit": 1, "offset": 1}).json()
    assert [item["claimId"] for item in paged["items"]] == [STORY_CLAIM]


def test_claims_list_validates_query(indexed: tuple[TestClient, FakeChain]) -> None:
    client, _ = indexed
    assert client.get("/public/claims", params={"status": "Bogus"}).status_code == 422
    assert client.get("/public/claims", params={"status": "None"}).status_code == 422
    assert client.get("/public/claims", params={"limit": 101}).status_code == 422
    assert client.get("/public/claims", params={"offset": -1}).status_code == 422


def test_timeline_is_ordered_and_carries_only_safe_values(
    indexed: tuple[TestClient, FakeChain],
) -> None:
    client, _ = indexed
    response = client.get(f"/public/claims/{STORY_CLAIM}/timeline")
    assert response.status_code == 200
    body = response.json()
    events = body["events"]
    assert len(events) == 17
    assert [event["event"] for event in events[:3]] == [
        "ClaimAnchored", "StatusChanged", "InternalAttestation",
    ]
    positions = [(event["blockNumber"], event["logIndex"]) for event in events]
    assert positions == sorted(positions)
    assert events[1]["args"] == {"claimId": STORY_CLAIM, "from": "None", "to": "Anchored"}
    submitted = next(event for event in events if event["event"] == "ProofSubmitted")
    assert submitted["args"]["rootIndex"] == 1
    assert body["status"] == "Verified"
    assert body["evidenceRoots"] == [hash32("root-0"), hash32("root-1")]
    assert body["chainId"] == CHAIN_ID
    assert body["claimRegistry"] == CLAIM_REGISTRY
    assert body["indexedToBlock"] is not None
    for event in events:
        assert event["txHash"].startswith("0x") and len(event["txHash"]) == 66
        for value in event["args"].values():
            assert isinstance(value, (bool, int, str))


def test_timeline_uppercase_id_unknown_and_malformed(indexed: tuple[TestClient, FakeChain]) -> None:
    client, _ = indexed
    upper = "0x" + STORY_CLAIM[2:].upper()
    assert client.get(f"/public/claims/{upper}/timeline").status_code == 200
    assert client.get(f"/public/claims/{hash32('nope')}/timeline").status_code == 404
    assert client.get("/public/claims/0x1234/timeline").status_code == 422
    assert client.get("/public/claims/not-hex/timeline").status_code == 422


def test_indexer_status_reports_lag(indexed: tuple[TestClient, FakeChain]) -> None:
    client, chain = indexed
    body = client.get("/public/indexer/status").json()
    assert body["chainId"] == CHAIN_ID
    assert body["deployBlock"] == DEPLOY_BLOCK
    assert body["headBlock"] == chain.head_block
    assert body["indexedToBlock"] == chain.head_block - 2
    assert body["lag"] == 2


def test_public_endpoints_need_a_configured_chain(client: TestClient) -> None:
    for path in ("/public/claims", f"/public/claims/{STORY_CLAIM}/timeline", "/public/indexer/status"):
        assert client.get(path).status_code == 503


def test_status_before_the_first_indexer_run(
    settings: Settings, engine: Engine, tmp_path: Path
) -> None:
    app = create_app(
        settings.model_copy(update={"deployment_file": str(write_deployment(tmp_path))}),
        engine=engine,
    )
    body = TestClient(app).get("/public/indexer/status").json()
    assert (body["indexedToBlock"], body["headBlock"], body["lag"]) == (None, None, None)
    assert TestClient(app).get("/public/claims").json()["items"] == []
