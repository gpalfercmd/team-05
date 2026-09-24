# =============================================================================
# Proof of Aid — Team 05 — Indexer tests: decoding, projections, idempotency
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""P4.1 without a network: synthetic logs ABI-encoded from `code/shared/abi/`
go through the real decoder, projections and chunked sync loop. Checks that
every event is stored exactly once, the cursor survives restarts, confirmations
hold back unsafe blocks, and RPC range refusals shrink the chunk."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from poa_shared.result import Err, Ok

from app.indexer.abi import RawLog
from app.indexer.deployment import load_deployment, parse_deployment
from app.indexer.rpc import is_range_error
from app.indexer.sync import SyncOptions, SyncReport, run_forever, sync_once
from app.models import ChainClaim, ChainEvent, ChainParticipant, SyncState
from tests.chain_helpers import (
    CHAIN_ID,
    CLAIM_REGISTRY,
    DEPLOY_BLOCK,
    PARTICIPANT_REGISTRY,
    FakeChain,
    accredit_cast,
    catalog,
    claim_event,
    deployment,
    encode_log,
    full_story,
    hash32,
    participant,
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
CLAIM_ID = hash32("claim-uuid-1")
NO_CONFIRMATIONS = SyncOptions(confirmations=0, block_chunk=2000)


def _factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False)


def _story_chain() -> FakeChain:
    chain = FakeChain(events=catalog(), target=deployment())
    accredit_cast(chain, ADMIN, AUTHORITY, CAST)
    full_story(chain, CLAIM_ID, CAST, AUTHORITY)
    return chain


def _sync(engine: Engine, chain: FakeChain, options: SyncOptions = NO_CONFIRMATIONS) -> SyncReport:
    outcome = sync_once(_factory(engine), chain, catalog(), deployment(), options)
    assert isinstance(outcome, Ok), outcome
    return outcome.value


def _event_count(engine: Engine) -> int:
    with Session(engine) as db:
        return db.scalar(select(func.count()).select_from(ChainEvent)) or 0


# ------------------------------------------------------------------ decoding


def test_decoder_round_trips_every_argument_type() -> None:
    events = catalog()
    log = encode_log(
        events.claim_events,
        CLAIM_REGISTRY,
        "ProofSubmitted",
        {
            "claimId": CLAIM_ID,
            "organization": CAST["org"],
            "supplementaryRoot": hash32("root-1"),
            "rootIndex": 1,
        },
        block=11,
        tx_hash=hash32("tx"),
        log_index=3,
    )
    decoded = events.decode(log, deployment())
    assert isinstance(decoded, Ok), decoded
    assert decoded.value.name == "ProofSubmitted"
    assert decoded.value.claim_id_hex == CLAIM_ID
    assert decoded.value.args == {
        "claimId": CLAIM_ID,
        "organization": CAST["org"],
        "supplementaryRoot": hash32("root-1"),
        "rootIndex": 1,
    }


def test_decoder_handles_booleans_enums_and_participant_events() -> None:
    events = catalog()
    attestation = encode_log(
        events.claim_events, CLAIM_REGISTRY, "InternalAttestation",
        {"claimId": CLAIM_ID, "verifier": CAST["verifier"], "approved": False,
         "justificationHash": hash32("j")},
        block=12, tx_hash=hash32("a"), log_index=0,
    )
    change = encode_log(
        events.claim_events, CLAIM_REGISTRY, "StatusChanged",
        {"claimId": CLAIM_ID, "from": 1, "to": 6}, block=12, tx_hash=hash32("a"), log_index=1,
    )
    verifier = encode_log(
        events.participant_events, PARTICIPANT_REGISTRY, "InternalVerifierRevoked",
        {"verifier": CAST["verifier"], "organization": CAST["org"], "registryAdmin": ADMIN},
        block=13, tx_hash=hash32("b"), log_index=0,
    )
    decoded = [events.decode(log, deployment()) for log in (attestation, change, verifier)]
    assert all(isinstance(item, Ok) for item in decoded), decoded
    values = [item.value for item in decoded if isinstance(item, Ok)]
    assert values[0].args["approved"] is False
    assert (values[1].args["from"], values[1].args["to"]) == (1, 6)
    assert events.status_name(values[1].args["to"]) == "Rejected"
    assert values[2].claim_id_hex is None
    assert values[2].args["organization"] == CAST["org"]


def test_decoder_rejects_foreign_contracts_unknown_topics_and_bad_payloads() -> None:
    events = catalog()
    good = encode_log(
        events.claim_events, CLAIM_REGISTRY, "StatusChanged",
        {"claimId": CLAIM_ID, "from": 0, "to": 1}, block=11, tx_hash=hash32("t"), log_index=0,
    )
    foreign = RawLog("0x" + "99" * 20, good.topics, good.data, 11, good.tx_hash, 0)
    wrong_contract = RawLog(PARTICIPANT_REGISTRY, good.topics, good.data, 11, good.tx_hash, 0)
    missing_topic = RawLog(CLAIM_REGISTRY, good.topics[:1], good.data, 11, good.tx_hash, 0)
    short_data = RawLog(CLAIM_REGISTRY, good.topics, good.data[:10], 11, good.tx_hash, 0)
    for log in (foreign, wrong_contract, missing_topic, short_data):
        assert isinstance(events.decode(log, deployment()), Err)


def test_catalog_topics_cover_exactly_the_interface_events() -> None:
    events = catalog()
    names = {spec.name for spec in events.participant_events.values()} | {
        spec.name for spec in events.claim_events.values()
    }
    assert len(events.topics) == 16
    assert "RoleGranted" not in names
    assert {"StatusChanged", "ClaimAnchored", "AuditorRevoked"} <= names


def test_deployment_file_parsing(tmp_path: Path) -> None:
    good = {
        "chainId": 421614,
        "participantRegistry": "0x32a479e9Ad3C0C9e6e00eF2Dff4D7374b6460564",
        "claimRegistry": "0x44780Bed68bDd0f9B9a74d82de81B4C069234BFE",
        "deployBlock": 312262109,
    }
    path = tmp_path / "deployment.json"
    path.write_text(json.dumps(good))
    loaded = load_deployment(path)
    assert isinstance(loaded, Ok), loaded
    assert loaded.value.claim_registry == good["claimRegistry"].lower()
    assert loaded.value.deploy_block == 312262109
    assert isinstance(load_deployment(tmp_path / "missing.json"), Err)
    assert isinstance(parse_deployment({**good, "chainId": True}), Err)
    assert isinstance(parse_deployment({**good, "claimRegistry": "0x1234"}), Err)
    assert isinstance(parse_deployment([good]), Err)


def test_committed_deployment_files_parse() -> None:
    root = Path(__file__).resolve().parents[2] / "shared" / "deployments"
    for name in ("anvil.json", "arbitrum-sepolia.json"):
        assert isinstance(load_deployment(root / name), Ok), name


# ------------------------------------------------------------------ projections


def test_full_story_projects_roles_and_claim_state(engine: Engine) -> None:
    report = _sync(engine, _story_chain())
    assert report.stored == 22  # 5 accreditation events + 17 claim events
    assert report.projection_warnings == []
    with Session(engine) as db:
        claim = db.get(ChainClaim, (CHAIN_ID, CLAIM_ID))
        assert claim is not None
        assert claim.status == "Verified"
        assert claim.evidence_roots == [hash32("root-0"), hash32("root-1")]
        assert claim.organization == CAST["org"]
        assert claim.internal_verifier == CAST["verifier"]
        assert claim.auditor == CAST["auditor"]
        assert claim.metadata_hash == hash32("metadata")
        assert claim.anchored_block < claim.last_status_block
        verifier = db.get(ChainParticipant, (CHAIN_ID, CAST["verifier2"]))
        assert verifier is not None
        assert (verifier.role, verifier.organization, verifier.active) == (
            "internal_verifier", CAST["org"], True,
        )
        roles = {row.address: row.role for row in db.scalars(select(ChainParticipant))}
        assert roles == {
            CAST["org"]: "organization",
            CAST["verifier"]: "internal_verifier",
            CAST["verifier2"]: "internal_verifier",
            CAST["auditor"]: "auditor",
            CAST["outsider"]: "auditor",
        }


def test_revocation_and_reassignment_update_projections(engine: Engine) -> None:
    chain = _story_chain()
    _sync(engine, chain)
    chain.tx(participant("AuditorRevoked", auditor=CAST["auditor"], authority=AUTHORITY))
    chain.tx(
        participant(
            "InternalVerifierRevoked",
            verifier=CAST["verifier"], organization=CAST["org"], registryAdmin=ADMIN,
        )
    )
    _sync(engine, chain)
    with Session(engine) as db:
        auditor = db.get(ChainParticipant, (CHAIN_ID, CAST["auditor"]))
        verifier = db.get(ChainParticipant, (CHAIN_ID, CAST["verifier"]))
        assert auditor is not None and auditor.active is False and auditor.role == "auditor"
        assert verifier is not None and verifier.active is False
        assert verifier.organization == CAST["org"]


def test_event_for_unanchored_claim_is_stored_but_reported(engine: Engine) -> None:
    chain = FakeChain(events=catalog(), target=deployment())
    orphan = hash32("anchored-before-deploy-block")
    chain.tx(claim_event("AuditorAssigned", claimId=orphan, auditor=CAST["auditor"],
                         previousAuditor="0x" + "00" * 20))
    report = _sync(engine, chain)
    assert report.stored == 1
    assert len(report.projection_warnings) == 1
    assert _event_count(engine) == 1


# ------------------------------------------------------------------ idempotency / cursor


def test_same_range_twice_stores_each_event_once(engine: Engine) -> None:
    chain = _story_chain()
    first = _sync(engine, chain)
    assert _event_count(engine) == 22
    # Rewind the cursor to force the exact same range to be read again.
    with Session(engine) as db:
        state = db.get(SyncState, (CHAIN_ID, deployment().contracts_key))
        assert state is not None and state.cursor_block == chain.head_block
        state.cursor_block = None
        db.commit()
    second = _sync(engine, chain)
    assert (first.stored, second.stored, second.duplicates) == (22, 0, 22)
    assert _event_count(engine) == 22
    with Session(engine) as db:
        claim = db.get(ChainClaim, (CHAIN_ID, CLAIM_ID))
        assert claim is not None and len(claim.evidence_roots) == 2  # not re-appended


def test_restart_resumes_after_the_cursor(engine: Engine) -> None:
    chain = FakeChain(events=catalog(), target=deployment())
    accredit_cast(chain, ADMIN, AUTHORITY, CAST)
    first = _sync(engine, chain)
    assert first.cursor == chain.head_block
    full_story(chain, CLAIM_ID, CAST, AUTHORITY)
    chain.log_calls.clear()
    second = _sync(engine, chain)
    assert chain.log_calls[0][0] == first.cursor + 1
    assert second.stored == 17 and second.duplicates == 0
    third = _sync(engine, chain)
    assert (third.stored, third.duplicates) == (0, 0)


def test_starts_at_deploy_block_and_respects_confirmations(engine: Engine) -> None:
    chain = _story_chain()
    head = chain.head_block
    report = _sync(engine, chain, SyncOptions(confirmations=3, block_chunk=2000))
    assert chain.log_calls[0] == (DEPLOY_BLOCK, head - 3)
    assert report.cursor == head - 3
    with Session(engine) as db:
        newest = db.scalar(select(func.max(ChainEvent.block_number)))
        state = db.get(SyncState, (CHAIN_ID, deployment().contracts_key))
        assert newest is not None and newest <= head - 3
        assert state is not None and state.head_block == head


def test_block_timestamps_fetched_once_per_block(engine: Engine) -> None:
    chain = _story_chain()
    _sync(engine, chain, SyncOptions(confirmations=0, block_chunk=3))
    blocks_with_events = len({log.block_number for log in chain.stored})
    assert chain.timestamp_calls == blocks_with_events


def test_range_refusal_halves_the_chunk(engine: Engine) -> None:
    chain = _story_chain()
    chain.max_range = 5
    report = _sync(engine, chain, SyncOptions(confirmations=0, block_chunk=64))
    assert report.stored == 22
    assert all(end - start + 1 <= 64 for start, end in chain.log_calls)
    assert any(end - start + 1 <= 5 for start, end in chain.log_calls)


def test_range_refusal_below_floor_is_an_error(engine: Engine) -> None:
    chain = _story_chain()
    chain.max_range = 2
    outcome = sync_once(
        _factory(engine), chain, catalog(), deployment(),
        SyncOptions(confirmations=0, block_chunk=16, min_block_chunk=4),
    )
    assert isinstance(outcome, Err)
    assert is_range_error(outcome)


def test_rpc_failure_keeps_cursor_and_rows_untouched(engine: Engine) -> None:
    chain = _story_chain()
    chain.fail_logs = True
    outcome = sync_once(_factory(engine), chain, catalog(), deployment(), NO_CONFIRMATIONS)
    assert isinstance(outcome, Err)
    assert _event_count(engine) == 0
    with Session(engine) as db:
        state = db.get(SyncState, (CHAIN_ID, deployment().contracts_key))
        assert state is not None and state.cursor_block is None


def test_wrong_chain_is_refused(engine: Engine) -> None:
    chain = _story_chain()
    chain.chain = 1
    outcome = sync_once(_factory(engine), chain, catalog(), deployment(), NO_CONFIRMATIONS)
    assert isinstance(outcome, Err)
    assert "chain 1" in outcome.message
    assert _event_count(engine) == 0


def test_loop_survives_failures_and_unexpected_errors() -> None:
    calls: list[str] = []
    outcomes = iter([Err("rpc down"), RuntimeError("boom"), Ok(SyncReport(head=5, target=5, cursor=5))])

    def sync() -> Ok[SyncReport] | Err:
        calls.append("sync")
        outcome = next(outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    def sleep(_: float) -> None:
        if len(calls) == 3:
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        run_forever(sync, 0.01, sleep=sleep)
    assert calls == ["sync", "sync", "sync"]
