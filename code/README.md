# Code

Implementation of the **Trust, Evidence & Privacy** contribution described in
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#implementation-focus).

> **Status:** checkpoint (2026-09-24). Directories below are being built in this order:
> contracts → backend → frontend.

| Directory | Purpose | Stack |
| --- | --- | --- |
| `contracts/` | `ParticipantRegistry` (accreditation) and `ClaimRegistry` (evidence anchoring, two-stage verification, proof requests, disputes). Tests and deployment scripts. | Solidity, Foundry, OpenZeppelin |
| `shared/` | Merkle test vectors every layer must pass, so the public page and the contract agree on the evidence root. | JSON |
| `backend/` | Evidence pipeline (EXIF strip, SHA-256, encryption at rest, role-based access), wallet login, event indexer and public API. | Python, FastAPI, PostgreSQL |
| `frontend/` | Role views and the public claim page that re-verifies evidence in the browser. | React, Vite, TypeScript, viem/wagmi |

- [Architecture](../docs/ARCHITECTURE.md): complete system design.
- [Runbook](../docs/RUNBOOK.md): setup, run, validation, and demo instructions.
- [Submission](../docs/SUBMISSION.md): scope, evidence, and limitations.
