# =============================================================================
# Proof of Aid — Team 05 — Indexer integration test against a real anvil chain
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""P4.3 end to end: anvil + the real P2 contracts + the real CLI.

Starts anvil on a free port, runs `Deploy.s.sol` and `DemoLifecycle.s.sol`
(USE_EXISTING=true) from `code/contracts`, migrates a throwaway SQLite
database with Alembic and runs `python -m app.indexer --once` twice.

anvil runs with chain id 31338 on purpose: the Foundry scripts name the
deployment file after the chain (`code/shared/deployments/<network>.json`),
and 31337 would overwrite the committed `anvil.json`. With 31338 they write a
throwaway `31338.json`, which is copied to the test's temp dir and deleted
(`anvil.json` is also checked byte-for-byte afterwards).

Expected events: the demo sends 12 registry transactions (2 contract
creations + 10 lifecycle calls). The creations emit no interface event (only
OpenZeppelin bookkeeping). The 4 accreditation calls emit one interface event
each; `assignAuditor` emits one and the other 5 claim actions emit two (the
action event + `StatusChanged`): 4 + 1 + 10 = 15 interface events, plus the P9
escrow events (3 `DepositLocked`, 2 `Credited`): 20. The raw logs of both
contracts are 31: those 20 plus 11 OpenZeppelin `AccessControl` logs
(5 `RoleAdminChanged` + 2 `RoleGranted` in the constructors,
4 `RoleGranted` for the accredited participants). The indexer
requests only the 20 interface topics, so those 11 never reach it.

Skipped automatically when `anvil`/`forge` are not on PATH or the Soldeer
dependencies are not installed.
"""

from __future__ import annotations

import base64
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
from collections.abc import Generator
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from web3 import HTTPProvider, Web3

from app.main import create_app
from app.settings import Settings

BACKEND_DIR: Final[Path] = Path(__file__).resolve().parents[1]
CONTRACTS_DIR: Final[Path] = BACKEND_DIR.parent / "contracts"
DEPLOYMENTS_DIR: Final[Path] = BACKEND_DIR.parent / "shared" / "deployments"
TEST_CHAIN_ID: Final[int] = 31338
# anvil's well-known default test mnemonic and its account 0/1 (public, test-only).
ANVIL_MNEMONIC: Final[str] = "test test test test test test test test test test test junk"
ANVIL_KEY_0: Final[str] = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
REGISTRY_ADMIN: Final[str] = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ACCREDITATION_AUTHORITY: Final[str] = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
DEMO_CLAIM: Final[str] = "0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28"
ORIGINAL_ROOT: Final[str] = "0x515344752095a24904ad32a660a1d15ddbf9c49e90f43d58323d76e398548707"
# The demo mnemonic's accounts: 2 organization, 3 verifier, 4 auditor, 5 disputant.
CAST: Final[dict[str, str]] = {
    "organization": "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    "verifier": "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    "auditor": "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
    "disputant": "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
}
# 11 claim events (6 story steps) + 4 participant events, plus the P9 escrow events of the
# story: 3 DepositLocked (anchor, approval, dispute bond) and 2 Credited (the dismissal's split).
MONEY_EVENTS: Final[dict[str, int]] = {"DepositLocked": 3, "Credited": 2}
CLAIM_TIMELINE_EVENTS: Final[int] = 11 + sum(MONEY_EVENTS.values())
INTERFACE_EVENTS: Final[int] = CLAIM_TIMELINE_EVENTS + 4
# OpenZeppelin AccessControl logs that are not part of the frozen interface.
ACCESS_CONTROL_LOGS: Final[dict[str, int]] = {
    "RoleAdminChanged(bytes32,bytes32,bytes32)": 5,
    "RoleGranted(bytes32,address,address)": 6,
}
SCRIPT_TIMEOUT: Final[int] = 600

pytestmark = [
    pytest.mark.anvil,
    pytest.mark.skipif(
        shutil.which("anvil") is None or shutil.which("forge") is None,
        reason="anvil/forge (Foundry) not on PATH",
    ),
    pytest.mark.skipif(
        not (CONTRACTS_DIR / "dependencies").is_dir(),
        reason="contract dependencies missing (run `forge soldeer install` in code/contracts)",
    ),
]


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@pytest.fixture
def anvil_url() -> Generator[str, None, None]:
    """A fresh anvil chain (id 31338) on a free local port, stopped afterwards."""
    port = _free_port()
    process = subprocess.Popen(
        ["anvil", "--port", str(port), "--chain-id", str(TEST_CHAIN_ID), "--silent"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}"
    w3 = Web3(HTTPProvider(url))
    try:
        deadline = time.monotonic() + 20
        while not w3.is_connected() and time.monotonic() < deadline:
            time.sleep(0.1)
        assert w3.is_connected(), "anvil did not start"
        yield url
    finally:
        process.terminate()
        process.wait(timeout=10)


def _run(command: list[str], cwd: Path, env: dict[str, str]) -> None:
    completed = subprocess.run(
        command, cwd=cwd, env={**os.environ, **env}, capture_output=True, text=True,
        timeout=SCRIPT_TIMEOUT, check=False,
    )
    assert completed.returncode == 0, f"{command[:3]} failed:\n{completed.stdout[-3000:]}\n{completed.stderr[-3000:]}"


def _deploy_demo(rpc_url: str, target: Path) -> None:
    """Deploy + DemoLifecycle; move the generated deployment file to `target`."""
    generated = DEPLOYMENTS_DIR / f"{TEST_CHAIN_ID}.json"
    try:
        _run(
            ["forge", "script", "script/Deploy.s.sol:Deploy", "--rpc-url", rpc_url,
             "--broadcast", "--private-key", ANVIL_KEY_0],
            CONTRACTS_DIR,
            {"REGISTRY_ADMIN": REGISTRY_ADMIN, "ACCREDITATION_AUTHORITY": ACCREDITATION_AUTHORITY},
        )
        _run(
            ["forge", "script", "script/DemoLifecycle.s.sol:DemoLifecycle", "--rpc-url", rpc_url,
             "--broadcast", "--slow"],
            CONTRACTS_DIR,
            {"MNEMONIC": ANVIL_MNEMONIC, "USE_EXISTING": "true"},
        )
        shutil.copyfile(generated, target)
    finally:
        generated.unlink(missing_ok=True)


def _backend_env(database: Path, tmp_path: Path, rpc_url: str, deployment_file: Path) -> dict[str, str]:
    return {
        "DATABASE_URL": f"sqlite:///{database}",
        "EVIDENCE_ENCRYPTION_KEY": base64.b64encode(os.urandom(32)).decode(),
        "STORAGE_DIR": str(tmp_path / "storage"),
        "SESSION_SECRET": os.urandom(16).hex(),
        "CHAIN_RPC_URL": rpc_url,
        "DEPLOYMENT_FILE": str(deployment_file),
        "INDEXER_CONFIRMATIONS": "0",
        "INDEXER_BLOCK_CHUNK": "2000",
    }


def _scalar(database: Path, sql: str) -> object:
    with sqlite3.connect(database) as connection:
        return connection.execute(sql).fetchone()[0]


def test_indexer_against_anvil_demo(anvil_url: str, tmp_path: Path) -> None:
    anvil_before = (DEPLOYMENTS_DIR / "anvil.json").read_bytes()
    deployment_file = tmp_path / "deployment.json"
    _deploy_demo(anvil_url, deployment_file)
    database = tmp_path / "index.db"
    env = _backend_env(database, tmp_path, anvil_url, deployment_file)
    _run([sys.executable, "-m", "alembic", "upgrade", "head"], BACKEND_DIR, env)

    _run([sys.executable, "-m", "app.indexer", "--once"], BACKEND_DIR, env)

    assert _scalar(database, "SELECT count(*) FROM chain_events") == INTERFACE_EVENTS
    assert _scalar(database, "SELECT count(*) FROM chain_events WHERE claim_id_hex IS NULL") == 4
    for name, expected in MONEY_EVENTS.items():
        assert _scalar(database, f"SELECT count(*) FROM chain_events WHERE event_name = '{name}'") == expected
    status, roots, auditor, verifier, organization = sqlite3.connect(database).execute(
        "SELECT status, evidence_roots, auditor, internal_verifier, organization "
        "FROM chain_claims WHERE claim_id_hex = ?",
        (DEMO_CLAIM,),
    ).fetchone()
    assert status == "Verified"
    assert roots.replace(" ", "") == f'["{ORIGINAL_ROOT}"]'
    assert (auditor, verifier, organization) == (
        CAST["auditor"], CAST["verifier"], CAST["organization"],
    )
    with sqlite3.connect(database) as connection:
        participants = dict(
            connection.execute("SELECT address, role FROM chain_participants WHERE active").fetchall()
        )
        verifier_orgs = {
            row[0] for row in connection.execute(
                "SELECT organization FROM chain_participants WHERE role = 'internal_verifier'"
            )
        }
    assert participants == {
        CAST["organization"]: "organization",
        CAST["verifier"]: "internal_verifier",
        CAST["auditor"]: "auditor",
        CAST["disputant"]: "auditor",
    }
    assert verifier_orgs == {CAST["organization"]}

    # The other raw logs are OpenZeppelin AccessControl bookkeeping, never requested.
    w3 = Web3(HTTPProvider(anvil_url))
    registries = [
        Web3.to_checksum_address(address)
        for address in sqlite3.connect(database).execute("SELECT contracts FROM sync_state").fetchone()[0].split(",")
    ]
    raw = w3.eth.get_logs({"address": registries, "fromBlock": 0, "toBlock": "latest"})
    assert len(raw) == INTERFACE_EVENTS + sum(ACCESS_CONTROL_LOGS.values())
    for signature, expected in ACCESS_CONTROL_LOGS.items():
        topic = Web3.keccak(text=signature)
        assert sum(1 for log in raw if log["topics"][0] == topic) == expected, signature

    # Re-running is a no-op: same rows, cursor at the head.
    _run([sys.executable, "-m", "app.indexer", "--once"], BACKEND_DIR, env)
    assert _scalar(database, "SELECT count(*) FROM chain_events") == INTERFACE_EVENTS
    assert _scalar(database, "SELECT cursor_block FROM sync_state") == w3.eth.block_number

    # The public API serves the indexed timeline without login.
    settings = Settings(
        database_url=env["DATABASE_URL"],
        evidence_encryption_key=env["EVIDENCE_ENCRYPTION_KEY"],
        storage_dir=env["STORAGE_DIR"],
        session_secret=env["SESSION_SECRET"],
        deployment_file=str(deployment_file),
    )
    engine = create_engine(env["DATABASE_URL"])
    try:
        client = TestClient(create_app(settings, engine=engine))
        timeline = client.get(f"/public/claims/{DEMO_CLAIM}/timeline").json()
        status_body = client.get("/public/indexer/status").json()
    finally:
        engine.dispose()
    assert len(timeline["events"]) == CLAIM_TIMELINE_EVENTS
    assert timeline["events"][-1]["args"]["to"] == "Verified"
    # Wei amounts are not on the public whitelist: money events publish only who and which claim.
    credited = [event for event in timeline["events"] if event["event"] == "Credited"]
    assert {event["args"]["account"] for event in credited} == {CAST["organization"], CAST["auditor"]}
    assert all("amount" not in event["args"] for event in credited)
    assert status_body["lag"] == 0

    assert (DEPLOYMENTS_DIR / "anvil.json").read_bytes() == anvil_before
    assert not (DEPLOYMENTS_DIR / f"{TEST_CHAIN_ID}.json").exists()
