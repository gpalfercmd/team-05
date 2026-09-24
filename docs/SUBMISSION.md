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
5. **Fraud costs money (P9).** `ClaimRegistry` escrows ETH per claim: the organization deposits a penalty plus the auditor's reward when anchoring, the auditor deposits when approving, and a disputant posts a bond. A dismissed dispute pays the bond to the organization and the auditor; an upheld one pays the disputant everything at stake; after a 60-day window anyone settles the claim and the honest parties get their money back plus the reward. See *Incentives* below.
6. **One recipe, three implementations.** The Merkle recipe (SHA-256 leaves hashed with keccak256, sorted pairs) is implemented in Solidity, Python and TypeScript, and all three pass the same shared test vectors byte for byte.

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
| Disputes | Implemented | Any accredited wallet except the claim's own organization and approving auditor disputes a `Verified` claim within 60 days; the Authority upholds or dismisses it onchain (demo: dismissed) |
| Deposits, rewards, penalties, settlement (P9) | Implemented | Per-claim ETH escrow in `ClaimRegistry`, pull payments, 60-day dispute window; tested and run end to end on a local anvil chain. Live on Arbitrum Sepolia: the demo claim holds 0.0111 ETH in escrow. |
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
| Decentralized arbitration (Kleros) | Designed only | Section 4, *Next step* |
| KYC / verifiable credentials, mainnet | Out of scope | — |

### Effort split

*(team estimate — confirm for the final submission)*

| Dimension | Effort | Work implemented |
| --- | ---: | --- |
| UX | 30% | Public verification page (timeline, verification summary, in-browser checks), design system, plain-language contract errors |
| Real-world connection | 30% | Evidence privacy pipeline (EXIF strip, hashing of cleaned files, encryption, access control), bundles and manifests, accreditation of real-world entities |
| Blockchain | 40% | Accreditation registry, claim state machine, disputes, events, 100%-coverage test suite with invariants, deployment and full lifecycle on Arbitrum Sepolia |

### Incentives: who pays whom

Amounts: reference values, and in brackets the 1/100 values of the testnet deployment. The dispute window is 60 days in both.

| Moment | Organization | Auditor | Disputant |
| --- | --- | --- | --- |
| Anchors the claim | pays penalty 1 ETH + auditor reward 0.01 ETH (0.0101) | — | — |
| Auditor approves | — | pays deposit 0.1 ETH (0.001) | — |
| Dispute opened (before `verifiedAt + 60 days`) | — | — | pays bond 0.1 ETH (0.001) |
| Rejected at checkpoint 1 or by the auditor | gets its whole deposit back | — | — |
| Dispute dismissed | gets half the bond (+ odd wei) | gets half the bond | loses the bond |
| Dispute upheld | loses penalty and reward | loses its deposit | gets bond + penalty + auditor deposit + reward |
| `settle` after the window (anyone) | gets its penalty back | gets its deposit + the reward | — |

The prepaid reward goes to the disputant, not back to the organization, when fraud is proven: the organization caused it. The window starts once at the approval and a dismissal does not restart it, so each repeat dispute costs a bond and all disputes end after 60 days. The organization and the approving auditor cannot dispute their own claim. Money leaves the contract only through `withdraw()` (pull payments, reentrancy-guarded). Checkpoint 1 by the internal verifiers involves no money.

## 3. Demo and validation

**What the demo proves:** a claim that went through the full two-stage verification on Arbitrum Sepolia can be checked by anyone in a browser: a genuine evidence file matches the root recorded onchain, a one-character change is detected, and no private file name or content is ever exposed.

**Reproduce the demo:** Follow [RUNBOOK.md](RUNBOOK.md) for setup, initial state, scenario, and expected results. *(pending: RUNBOOK being written)*

**Validation evidence:**

- **Contracts:** `cd code/contracts && forge test` → 168 tests pass (45 ParticipantRegistry, 82 ClaimRegistry incl. fuzz, 37 incentives, 3 Merkle vectors, 9 invariants over 8,192 random calls, including `balance == credits owed + escrow locked`); `forge coverage` → 100% lines, statements, branches and functions on both contracts. Removing the four-eyes check or the permanent-identity rule makes tests fail. The P9 deploy + demo lifecycle runs on a local anvil chain and ends `Verified` with 0.0111 ETH escrowed.
- **Backend:** `cd code && uv run --project backend pytest -c backend/pyproject.toml backend/tests` → 111 tests pass (login, claims, evidence, access matrix, privacy of public views, bundles, CORS, Merkle vectors, P4 indexer and chain-driven access, public API, plus an anvil end-to-end indexer run). Migrations 0001–0003 verified on SQLite, a disposable PostgreSQL 18 and the Docker PostgreSQL 16; the indexer on PostgreSQL indexes the 22 registry events of the Sepolia deployment in ~7 s and a second run adds 0; `GET /public/claims/{id}/timeline` returns the demo claim's 17 events.
- **Shared recipe:** `cd code/shared && uv run pytest` → 30 tests pass.
- **Frontend:** `cd code/frontend && pnpm test` → 317 tests pass, including the browser Merkle implementation against every shared vector.
- **Live on Arbitrum Sepolia** (`code/shared/deployments/arbitrum-sepolia.json`): [`ParticipantRegistry`](https://sepolia.arbiscan.io/address/0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1) · [`ClaimRegistry`](https://sepolia.arbiscan.io/address/0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013). Full demo lifecycle of claim `0xfedebf75…a79b28`, whose evidence roots are the real Merkle roots of the files in `code/frontend/public/demo-evidence/`: [anchor](https://sepolia.arbiscan.io/tx/0x93f49b2514e4a7ae2d7e15619ebd37de3bdd7d8928d870a37548a60602630a6e) → [internal approval](https://sepolia.arbiscan.io/tx/0x0aabdfeff004ef228b3ca5d84ca723edd5fe2d542423a00b0359f795dfacfa89) → [auditor assigned](https://sepolia.arbiscan.io/tx/0x3971213bb081bd5836e90ad5afcb6b17ba5da05f2b57d0ab979cd0393719e22b) → [proof requested](https://sepolia.arbiscan.io/tx/0x74b91ba021ae078d442981f844592ed7313c4b27dcefd834fd48471cf670ea4b) → [proof submitted](https://sepolia.arbiscan.io/tx/0xebf382b5434e1aa8b975dfca9b1d02b74f3505eecf06b56595f4415d0bdc3be2) → [second verifier confirms](https://sepolia.arbiscan.io/tx/0x0d76c7561f4dd7326e4ffef6b1689c1de4fae4dc46907d97c6c3ab53ecd6190a) → [final approval](https://sepolia.arbiscan.io/tx/0xaa4ef572c6616cd5e7cda66caf7f6d3da84f04e300c7f200a7748d1af812c76b) → [dispute](https://sepolia.arbiscan.io/tx/0x508bd4de097e0f5aa3969e07aea2e8200f29a1d80d08d0479fac24ac5cccd88f) → [dispute dismissed](https://sepolia.arbiscan.io/tx/0xbaaa25c4c3be25806d465879650bb45296cb24d1c3e1f26dd6262c6035641de6). The claim ends `Verified`.
- **End-to-end check against the live chain:** the public page pointed at the deployed contract shows the 9-step history of the demo claim; the published manifest is accepted because its root matches `evidenceRoots[0]` onchain, and `receipt-001.txt` verifies as **Match**. The two files of supplementary proof #1 checked as a complete bundle → **Match** (root `0x8e94…2370`); the same files with one bit flipped in `stock-count.txt` → **No match** (computed `0x7f22…99ef`). No browser console errors.
- *(to add)* screenshots of the public page showing match / mismatch.

## 4. Limitations and next step

- Trust in the Registry Admin and Accreditation Authority is centralized; accreditation is manual, not backed by verifiable credentials. **The Accreditation Authority is a single point of trust:** it assigns auditors and judges every dispute, and since P9 its ruling also moves the deposits.
- Deposits need ETH up front and the amounts are fixed at deployment; a claim left in `ProofRequested`/`ProofSubmitted` when its organization is revoked keeps its deposit locked forever.
- The internal checks are not independent by themselves; independence rests on a single assigned auditor, who could still collude.
- Integrity is proven, not truth: evidence can still be staged before it is anchored.
- The backend operator is trusted for confidentiality (not for integrity, which is checked onchain).
- Claims recorded before salted fingerprints (P8.2), including the demo claim on Arbitrum Sepolia, keep unsalted SHA-256 fingerprints: a guessed private file of those claims can still be confirmed. Claims created since then are salted.
- Each organization needs at least two internal verifiers, and a revoked participant needs a new wallet (identity is permanent by design).
- The backend does not yet read the chain: participants and auditor assignments are seeded, and bundles are sealed by upload order rather than by their onchain anchoring.
- Role screens for signing actions are still in progress; the demo lifecycle is executed with scripts.

**Next step:** sync the backend with contract events (participants, auditor assignment, bundle sealing), so the offchain access rules follow the onchain truth automatically.

### Next step: Kleros arbitration (designed, not implemented)

The Authority stays the judge in code today. The designed replacement is decentralized arbitration by Kleros, which removes the single point of trust from dispute resolution (accreditation stays with the Authority).

**What is current (checked 2026-09-25):**

- The arbitration interface was standardized by Kleros as **ERC-792** (`IArbitrator` / `IArbitrable`) with the **ERC-1497** evidence standard (`MetaEvidence`, `Evidence`, `Dispute` events); this is what Kleros v1 on Ethereum mainnet uses. Sources: [kleros/erc-792](https://github.com/kleros/erc-792), [ERC-792 docs](https://docs.kleros.io/developer/arbitration-development/erc-792-arbitration-standard), [ERC-1497 docs](https://docs.kleros.io/developer/arbitration-development/erc-1497-evidence-standard).
- **Kleros 2.0 runs on Arbitrum One**, announced as a beta running in parallel with v1, with the stated plan to move all court activity to Arbitrum One once it is secure enough ([Arbitrum forum, Jan 2025](https://forum.arbitrum.foundation/t/introducing-kleros-2-0-beta-decentralized-justice-built-on-arbitrum-one/28136), [Kleros blog](https://blog.kleros.io/kleros-2-0-beta-is-here-get-started/)). Its interfaces are `IArbitratorV2` / `IArbitrableV2`: `createDispute(uint256 numberOfChoices, bytes extraData) payable`, `arbitrationCost(bytes extraData)`, and the callback `rule(uint256 disputeID, uint256 ruling)`, with ruling 0 reserved for "refuse to arbitrate" ([arbitrator spec](https://github.com/kleros/kleros-v2/blob/dev/contracts/specifications/arbitrator.md), [IArbitrableV2.sol](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/interfaces/IArbitrableV2.sol)). **V2 replaces ERC-1497 `MetaEvidence` with dispute templates** (a `DisputeRequest` event carrying a template id) and a separate `EvidenceModule`.
- **Not verified:** whether Kleros 2.0 left beta by today, its current mainnet `KlerosCore` address and court fees, and whether a Kleros v2 arbitrator is available on Arbitrum **Sepolia** for testing. A search result quoted `KlerosCore` at `0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002` on Arbitrum One; we did not confirm it against an official deployment list.

**Design.** Because our contracts already live on Arbitrum, Kleros 2.0 on Arbitrum One is the natural target (no cross-chain bridge).

1. `ClaimRegistry` implements `IArbitrable` (ERC-792; `IArbitrableV2` on Kleros 2.0) and stores the arbitrator address and its `extraData` (court id and number of jurors) as immutables.
2. `openDispute` stays payable: the disputant sends `disputeBond + arbitrator.arbitrationCost(extraData)`. The contract forwards the fee with `arbitrator.createDispute{value: fee}(2, extraData)` (two choices), stores `arbitratorDisputeId → claimId`, and keeps the bond in escrow as today. The Authority's `resolveDispute` is removed.
3. Evidence: the counter-evidence hash we already anchor becomes the `Evidence` URI of ERC-1497 (v1), with a `MetaEvidence` describing the claim and the two rulings; on Kleros 2.0 the same content is published as a dispute template plus `EvidenceModule` submissions. The encrypted files stay offchain; jurors get access through the backend like an auditor would.
4. `rule(disputeID, ruling)` (callable only by the arbitrator) maps 1 = uphold → today's upheld payout and `Rejected`, 2 = dismiss → today's bond split and `Verified`. Ruling 0 (refused) would return the bond to the disputant and the claim to `Verified` (to be decided by the team).
5. Appeals are handled inside Kleros (crowdfunded appeal fees), so our contract needs no appeal logic; the settlement rule (wait until the dispute is resolved) stays the same.

Trade-offs: arbitration fees make disputes more expensive than today's bond alone, rulings take days to weeks, and the revoked-organization rule (a revoked organization can never be dismissed back to `Verified`) must be re-checked inside `rule()`.

## 5. AI usage

| Tool | Used for / assisted work | How we reviewed or validated it |
| --- | --- | --- |
| Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` SDD framework | Specifications, architecture and plan from the team's decisions; adversarial review of the verification flow; implementation of contracts, backend fixes, frontend and tests, partly through delegated sub-agents | Every design decision was taken by the team through explicit questions. All test suites were re-run independently after each delegated task; contract tests were mutation-checked (removing a security rule must break them); the public page was verified against the live Arbitrum Sepolia deployment; the team reviewed and edited all documents. |

We confirm that the team can explain and technically defend the submitted work.
