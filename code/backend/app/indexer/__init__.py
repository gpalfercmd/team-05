# =============================================================================
# Proof of Aid — Team 05 — Chain event indexer (P4): registries → database
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""P4 indexer (spec F6). Reads ParticipantRegistry and ClaimRegistry events
over JSON-RPC, decodes them with the frozen ABIs in `code/shared/abi/` and
stores them with their projections. Run it with `python -m app.indexer`.

Modules: `deployment` (which contracts, from `code/shared/deployments/*.json`),
`abi` (event decoding), `rpc` (web3.py reads), `projection` (events → roles
and claim state), `sync` (chunked, idempotent catch-up loop).
"""
