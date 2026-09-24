# Code

Implementation of the **Trust, Evidence & Privacy** contribution described in
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#implementation-focus).

> **Status:** final submission (2026-09-25). Contracts live on Arbitrum Sepolia
> (`shared/deployments/arbitrum-sepolia.json`); every layer below is implemented and tested.

| Directory | Purpose | Stack |
| --- | --- | --- |
| [`contracts/`](contracts/README.md) | `ParticipantRegistry` (accreditation) and `ClaimRegistry` (evidence anchoring, two-stage verification, proof requests, disputes, deposits/rewards/penalties with settlement). Tests (168, 100% coverage of `src/`) and deployment/demo scripts. | Solidity 0.8.30, Foundry, OpenZeppelin 5.7 |
| `shared/` | The cross-layer contract: exported ABIs, deployment files per network, the evidence manifest JSON Schema, Merkle and metadata test vectors every layer must pass, and the Python reference recipe (`poa_shared`, 30 tests). | JSON, Python |
| [`backend/`](backend/README.md) | Evidence pipeline (EXIF strip, salted SHA-256, AES-GCM at rest, role-based access), wallet login, chain indexer and public API (111 tests). | Python 3.12+, FastAPI, SQLAlchemy/Alembic, PostgreSQL, web3.py |
| [`frontend/`](frontend/README.md) | Public claim page that re-verifies evidence in the browser against the chain (317 tests). Role screens for signing actions were cut, not built. | React 19, Vite 8, TypeScript, viem/wagmi, pnpm |

- [Architecture](../docs/ARCHITECTURE.md): complete system design.
- [Runbook](../docs/RUNBOOK.md): setup, run, validation, and demo instructions.
- [Submission](../docs/SUBMISSION.md): scope, evidence, and limitations.
