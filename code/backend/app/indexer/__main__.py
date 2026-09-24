# =============================================================================
# Proof of Aid — Team 05 — Indexer command line: `python -m app.indexer`
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Run the P4 indexer.

    uv run python -m app.indexer          # poll every INDEXER_POLL_SECONDS
    uv run python -m app.indexer --once   # catch up to head - confirmations, exit

Configuration comes from the same `.env` as the API plus `CHAIN_RPC_URL` and
`DEPLOYMENT_FILE` (see README "Indexer (P4)"). The database schema must exist
(`uv run alembic upgrade head`). Exit codes: 0 success, 1 sync failed,
2 configuration error.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from functools import partial
from typing import Final

from pydantic import ValidationError

from poa_shared.result import Err

from app.db import make_engine, make_session_factory
from app.indexer.abi import load_catalog
from app.indexer.deployment import load_deployment
from app.indexer.rpc import Web3ChainReader
from app.indexer.sync import SyncOptions, run_forever, sync_once
from app.settings import load_settings

EXIT_OK: Final[int] = 0
EXIT_SYNC_FAILED: Final[int] = 1
EXIT_CONFIG: Final[int] = 2

logger = logging.getLogger("app.indexer")


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    """`--once` catches up and exits (tests, demo); default is the polling loop."""
    parser = argparse.ArgumentParser(prog="python -m app.indexer", description=__doc__)
    parser.add_argument("--once", action="store_true", help="catch up once and exit")
    namespace = parser.parse_args(argv)
    return namespace


def main(argv: Sequence[str] | None = None) -> int:
    """Build the indexer from settings and run it; return the process exit code."""
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        settings = load_settings()
    except ValidationError as cause:
        logger.error("invalid settings: %s", cause.error_count())
        return EXIT_CONFIG
    if not settings.chain_rpc_url or not settings.deployment_file:
        logger.error("CHAIN_RPC_URL and DEPLOYMENT_FILE are required for the indexer")
        return EXIT_CONFIG
    deployment = load_deployment(settings.deployment_file)
    catalog = load_catalog()
    if isinstance(deployment, Err):
        logger.error("configuration error: %s", deployment.message)
        return EXIT_CONFIG
    if isinstance(catalog, Err):
        logger.error("configuration error: %s", catalog.message)
        return EXIT_CONFIG
    factory = make_session_factory(make_engine(settings))
    options = SyncOptions(
        confirmations=settings.indexer_confirmations, block_chunk=settings.indexer_block_chunk
    )
    sync = partial(
        sync_once, factory, Web3ChainReader(settings.chain_rpc_url), catalog.value, deployment.value, options
    )
    logger.info(
        "indexing chain %d from block %d (confirmations %d)",
        deployment.value.chain_id, deployment.value.deploy_block, options.confirmations,
    )
    if not args.once:
        try:
            run_forever(sync, settings.indexer_poll_seconds)
        except KeyboardInterrupt:
            logger.info("stopped")
        return EXIT_OK
    outcome = sync()
    if isinstance(outcome, Err):
        # Only the cause's type: its text can contain the RPC URL, and hosted RPC
        # URLs often embed an API key.
        logger.error("sync failed: %s (%s)", outcome.message, type(outcome.cause).__name__)
        return EXIT_SYNC_FAILED
    report = outcome.value
    logger.info(
        "indexed to block %s (head %d): %d new events, %d already stored",
        report.cursor, report.head, report.stored, report.duplicates,
    )
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
