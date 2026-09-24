# Project Submission

> **State:** 2026-09-24, after the checkpoint. Contracts deployed and exercised on Arbitrum Sepolia; evidence backend and public verification page implemented and tested.
> Items marked *(pending)* are being finished for the final submission.

## 1. Project snapshot

| | |
| --- | --- |
| **Project name** | Proof of Aid — Team 05 |
| **Team ID & members** | Team 05 · Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez |
| **System vision** | Anyone, without special access, can check that an aid claim is backed by unaltered evidence reviewed by independent, accredited verifiers, without seeing beneficiaries' personal data. |
| **Implementation focus** | **Trust, Evidence & Privacy:** trusting aid claims whose evidence cannot be published, through encrypted offchain evidence anchored onchain by Merkle root and a contract-enforced two-stage verification. |
| **What we built** | Two smart contracts on Arbitrum Sepolia that enforce accreditation, evidence anchoring, two-stage verification with proof requests and disputes; a Python backend that strips metadata, hashes and encrypts evidence and serves privacy-safe views; and a public page where anyone re-checks evidence against the chain in their own browser. |
| **Code & run instructions** | [code/](../code/) · [Setup and demo](RUNBOOK.md) |
| **Complete system design** | [ARCHITECTURE.md](ARCHITECTURE.md) |

## 2. Implemented contribution

### Problem and approach

> Within our complete Proof of Aid design, we focus on **Trust, Evidence & Privacy**, addressing **how a third party can trust an aid claim whose evidence contains beneficiaries' personal data and therefore cannot be published** through **offchain encrypted evidence whose Merkle root is anchored onchain, a contract-enforced two-stage verification (internal verifier → independent, officially accredited auditor with proof requests), accredited disputes, and a public page that re-verifies evidence integrity without revealing personal data**.

**Why it matters.** The strongest evidence of delivery (photos of recipients, signed delivery lists) is exactly what cannot be shown to donors. Today donors either trust the organization blindly or the organization leaks personal data. We separate *what is proven* (integrity, who approved, when) from *what is shown* (nothing personal).

**Where it fits.** It covers the *Verification* step of `Need → Verification → Funding → Delivery → Outcome → Transparent history`, and feeds *Transparent history* directly from contract events. *Funding* (escrow released on `Verified`) and *Delivery & Impact* (beneficiary confirmation) are designed in [ARCHITECTURE.md](ARCHITECTURE.md) but not implemented.

### What works and how

1. **Accreditation (`ParticipantRegistry`).** The Registry Admin registers organizations and their internal verifiers; a separate Accreditation Authority accredits auditors. Neither admin can do the other's job. A wallet holds one participant role **for life**: while building we found that "one role at a time" let a revoked verifier be re-accredited as auditor and sign both checkpoints of the same claim, so re-registration is now impossible.
2. **Verification state machine (`ClaimRegistry`).** `Anchored → InternallyVerified → (ProofRequested ⇄ ProofSubmitted) → Verified | Rejected`, then `Verified → Disputed → Verified | Rejected`. The contract enforces separation of duties (submitter ≠ checkpoint-1 verifier ≠ proof confirmer), that only the auditor assigned by the Authority can act, that organizations need two active verifiers, and that each proof request adds a new, append-only evidence root. Every step emits an event.
3. **Evidence pipeline (FastAPI backend).** Uploads have EXIF/GPS stripped, are fingerprinted **after** cleaning with a salted commitment SHA-256(salt ‖ bytes) (random 32-byte salt, encrypted at rest; public files publish it), so nobody can confirm a guessed private file from its public fingerprint, grouped into bundles (original evidence, then one per proof request) and encrypted with AES-GCM using a per-claim key. Only the organization, its internal verifiers and the assigned auditor can download private files; everyone else sees private files as fingerprints only (no name, type or size). Each bundle's Merkle root equals the root anchored onchain, and a public manifest endpoint lists the fingerprints of a bundle.
4. **Public verification (React page, no wallet, no login).** The page reads the claim's status, evidence roots and full history **directly from the contract** (event logs filtered by claim ID), with no server in between. A visitor drops a file: the browser computes its fingerprint and checks it against the onchain root, either through the bundle's manifest (itself accepted only if its root matches the chain) or by dropping the whole bundle. Files never leave the browser.
5. **One recipe, three implementations.** The Merkle recipe (SHA-256 leaves hashed with keccak256, sorted pairs) is implemented in Solidity, Python and TypeScript, and all three pass the same shared test vectors byte for byte.

### Implementation boundary

- **Implemented:** working code or another demonstrable technical artifact exists.
- **Simulated / mocked:** a real component is replaced or simplified.
- **Designed only:** part of the proposed system, but not implemented.
- **Out of scope:** deliberately excluded from the proposed Hackathon scope.

| Capability | Status | What exists in the prototype |
| --- | --- | --- |
| Participant accreditation (org, internal verifiers, auditors) | Implemented | `ParticipantRegistry` on Arbitrum Sepolia: separate Registry Admin and Accreditation Authority, one lifetime role per wallet (revocation is permanent) |
| Evidence anchoring (Merkle root onchain) | Implemented | `ClaimRegistry.anchorClaim` + append-only supplementary roots |
| Two-stage verification + proof requests | Implemented | Onchain state machine: checkpoint 1, Authority-assigned auditor, proof loop with four-eyes confirmation, final attestation; full lifecycle executed on Arbitrum Sepolia |
| Disputes | Implemented | Any accredited wallet disputes a `Verified` claim; the Authority upholds or dismisses it onchain (demo: dismissed) |
| Privacy pipeline (EXIF strip, hashing, encryption, role-based access) | Implemented | FastAPI evidence service; private files exposed to outsiders as fingerprints only |
| Evidence bundles and manifests | Implemented | Per-bundle roots matching `evidenceRoots[i]`; manifest endpoint in the shared JSON Schema |
| Public verification page | Implemented | Reads the deployed contract directly; single-file and whole-bundle checks in the browser; the claim's title and description from the API are shown only after their hash is recomputed in the browser and matches the onchain `metadataHash` (otherwise hidden with a warning) |
| Signing actions from the UI (role screens) | Simulated *(pending)* | Actions are performed by Foundry scripts (`DemoLifecycle.s.sol`) with test wallets; role screens are being built |
| Participants and assigned auditor in the backend | Simulated | Seeded in the backend database instead of synced from contract events |
| Real-world identity of participants | Simulated | Accreditation is a manual admin action on test wallets |
| File storage | Simulated | Local encrypted volume instead of S3/MinIO |
| Demo evidence | Mocked | Made-up receipts, invoices and counts; no real personal data |
| Event indexer for search and dashboards | Designed only | Not needed by the public page, which reads the chain directly |
| Funding escrow released on `Verified` | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| Beneficiary confirmation of receipt | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| KYC / verifiable credentials, decentralized arbitration, mainnet | Out of scope | — |

### Effort split

*(team estimate — confirm for the final submission)*

| Dimension | Effort | Work implemented |
| --- | ---: | --- |
| UX | 30% | Public verification page (timeline, verification summary, in-browser checks), design system, plain-language contract errors |
| Real-world connection | 30% | Evidence privacy pipeline (EXIF strip, hashing of cleaned files, encryption, access control), bundles and manifests, accreditation of real-world entities |
| Blockchain | 40% | Accreditation registry, claim state machine, disputes, events, 100%-coverage test suite with invariants, deployment and full lifecycle on Arbitrum Sepolia |

## 3. Demo and validation

**What the demo proves:** a claim that went through the full two-stage verification on Arbitrum Sepolia can be checked by anyone in a browser: a genuine evidence file matches the root recorded onchain, a one-character change is detected, and no private file name or content is ever exposed.

**Reproduce the demo:** Follow [RUNBOOK.md](RUNBOOK.md) for setup, initial state, scenario, and expected results. *(pending: RUNBOOK being written)*

**Validation evidence:**

- **Contracts:** `cd code/contracts && forge test` → 117 tests pass (45 ParticipantRegistry, 68 ClaimRegistry incl. fuzz, 3 Merkle vectors, 6 invariants over 8,192 random calls); `forge coverage` → 100% lines, branches and functions on both contracts. Removing the four-eyes check or the permanent-identity rule makes tests fail.
- **Backend:** `cd code/backend && uv run pytest` → 91 tests pass (login, claims, evidence, access matrix, privacy of public views, bundles, CORS, Merkle vectors, P4 indexer and chain-driven access, public API, plus an anvil end-to-end indexer run). Migrations 0001–0003 verified on SQLite, a disposable PostgreSQL 18 and the Docker PostgreSQL 16; the indexer on PostgreSQL indexes the 22 registry events of the Sepolia deployment in ~7 s and a second run adds 0; `GET /public/claims/{id}/timeline` returns the demo claim's 17 events.
- **Shared recipe:** `cd code/shared && uv run pytest` → 14 tests pass.
- **Frontend:** `cd code/frontend && pnpm test` → 216 tests pass, including the browser Merkle implementation against every shared vector.
- **Live on Arbitrum Sepolia** (`code/shared/deployments/arbitrum-sepolia.json`): [`ParticipantRegistry`](https://sepolia.arbiscan.io/address/0x50C0b9C11aC7863a0F918b6E730c55bf85279A26) · [`ClaimRegistry`](https://sepolia.arbiscan.io/address/0xC647048a91Fcc6dF42A3608487cEa42c2c8ee0F2). Full demo lifecycle of claim `0xfedebf75…a79b28`, whose evidence roots are the real Merkle roots of the files in `code/frontend/public/demo-evidence/`: [anchor](https://sepolia.arbiscan.io/tx/0x6916e5d9116ebda0c1653f05981d1f3e09a3082497570bbc5c7f535a9af39143) → [internal approval](https://sepolia.arbiscan.io/tx/0xbdca91f6c037625435de12680224c7fa8201478a2ce7dc8b6b3d9cf35a5b2806) → [auditor assigned](https://sepolia.arbiscan.io/tx/0xe020f8ee1355fbf016783ed334fffbf9bd9450c4644c9e20d477122918db649f) → [proof requested](https://sepolia.arbiscan.io/tx/0xa245b49d8ef156f24c707333a51578c0f029f6ab46170a5b2cd2bb10b0ba6344) → [proof submitted](https://sepolia.arbiscan.io/tx/0x52752720e7b5012a30c3aa4932d993e93bcc832491f0457043e78d59d2021aa6) → [second verifier confirms](https://sepolia.arbiscan.io/tx/0x1251df6d205fd19caf8ffe9dfafa459c3b89861104a13979fb66de0bf7c08404) → [final approval](https://sepolia.arbiscan.io/tx/0xf055346b70b693faeb6b120d01d6368f6c84b5f157200b57ddefafa2fad67555) → [dispute](https://sepolia.arbiscan.io/tx/0xe9d5000f3c9891f6e8f4ede7954b4a4529b6ee0c2f03ef2f5d83d82520a25257) → [dispute dismissed](https://sepolia.arbiscan.io/tx/0x56058e9850157a8bf31dda942ef422571e074fe81f386f40144b3611f91858e8). The claim ends `Verified`.
- **End-to-end check against the live chain:** the public page pointed at the deployed contract shows the 9-step history of the demo claim; the published manifest is accepted because its root matches `evidenceRoots[0]` onchain, and `receipt-001.txt` verifies as **Match**. The two files of supplementary proof #1 checked as a complete bundle → **Match** (root `0x8e94…2370`); the same files with one bit flipped in `stock-count.txt` → **No match** (computed `0x7f22…99ef`). No browser console errors.
- *(to add)* screenshots of the public page showing match / mismatch.

## 4. Limitations and next step

- Trust in the Registry Admin and Accreditation Authority is centralized; accreditation is manual, not backed by verifiable credentials.
- The internal checks are not independent by themselves; independence rests on a single assigned auditor, who could still collude.
- Integrity is proven, not truth: evidence can still be staged before it is anchored.
- The backend operator is trusted for confidentiality (not for integrity, which is checked onchain).
- Claims recorded before salted fingerprints (P8.2), including the demo claim on Arbitrum Sepolia, keep unsalted SHA-256 fingerprints: a guessed private file of those claims can still be confirmed. Claims created since then are salted.
- Each organization needs at least two internal verifiers, and a revoked participant needs a new wallet (identity is permanent by design).
- The backend does not yet read the chain: participants and auditor assignments are seeded, and bundles are sealed by upload order rather than by their onchain anchoring.
- Role screens for signing actions are still in progress; the demo lifecycle is executed with scripts.

**Next step:** sync the backend with contract events (participants, auditor assignment, bundle sealing), so the offchain access rules follow the onchain truth automatically.

## 5. AI usage

| Tool | Used for / assisted work | How we reviewed or validated it |
| --- | --- | --- |
| Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` SDD framework | Specifications, architecture and plan from the team's decisions; adversarial review of the verification flow; implementation of contracts, backend fixes, frontend and tests, partly through delegated sub-agents | Every design decision was taken by the team through explicit questions. All test suites were re-run independently after each delegated task; contract tests were mutation-checked (removing a security rule must break them); the public page was verified against the live Arbitrum Sepolia deployment; the team reviewed and edited all documents. |

We confirm that the team can explain and technically defend the submitted work.
