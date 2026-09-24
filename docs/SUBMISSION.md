# Project Submission

> **State:** Thursday checkpoint draft (2026-09-24). Design complete; implementation in progress.
> Sections marked *(planned)* are updated with evidence for the final submission.

## 1. Project snapshot

| | |
| --- | --- |
| **Project name** | Proof of Aid — Team 05 |
| **Team ID & members** | Team 05 · Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez |
| **System vision** | Anyone, without special access, can check that an aid claim is backed by unaltered evidence reviewed by independent, accredited verifiers, without seeing beneficiaries' personal data. |
| **Implementation focus** | **Trust, Evidence & Privacy:** trusting aid claims whose evidence cannot be published, through encrypted offchain evidence anchored onchain by Merkle root and a contract-enforced two-stage verification. |
| **What we built** | *(planned)* Smart contracts on Arbitrum Sepolia enforcing accreditation, evidence anchoring, two-stage verification with proof requests and disputes, plus a Python evidence pipeline and a public verification page. |
| **Code & run instructions** | [code/](../code/) · [Setup and demo](RUNBOOK.md) |
| **Complete system design** | [ARCHITECTURE.md](ARCHITECTURE.md) |

## 2. Implemented contribution

### Problem and approach

> Within our complete Proof of Aid design, we focus on **Trust, Evidence & Privacy**, addressing **how a third party can trust an aid claim whose evidence contains beneficiaries' personal data and therefore cannot be published** through **offchain encrypted evidence whose Merkle root is anchored onchain, a contract-enforced two-stage verification (internal verifier → independent, officially accredited auditor with proof requests), accredited disputes, and a public page that re-verifies evidence integrity without revealing personal data**.

**Why it matters.** The strongest evidence of delivery (photos of recipients, signed delivery lists) is exactly what cannot be shown to donors. Today donors either trust the organization blindly or the organization leaks personal data. We separate *what is proven* (integrity, who approved, when) from *what is shown* (nothing personal).

**Where it fits.** It covers the *Verification* step of `Need → Verification → Funding → Delivery → Outcome → Transparent history`, and feeds *Transparent history* through indexed contract events. *Funding* (escrow released on `Verified`) and *Delivery & Impact* (beneficiary confirmation) are designed in [ARCHITECTURE.md](ARCHITECTURE.md) but not implemented.

### What works and how

*(planned — updated as each part lands)*

1. **Accreditation:** the Registry Admin registers organizations and their internal verifiers; a separate Accreditation Authority approves auditors.
2. **Evidence:** the backend strips EXIF/GPS, hashes each file (SHA-256), encrypts it at rest; the organization's wallet anchors the bundle's Merkle root onchain.
3. **Verification state machine (onchain):** `Anchored → InternallyVerified → (ProofRequested ⇄ ProofSubmitted) → Verified | Rejected`, then `Verified → Disputed → Verified | Rejected`. Separation of duties (submitter ≠ checkpoint-1 verifier ≠ proof confirmer) and the assigned auditor are enforced by the contract.
4. **Public verification:** a page without login shows the timeline and attestations and re-hashes public files in the browser against the onchain root.

### Implementation boundary

- **Implemented:** working code or another demonstrable technical artifact exists.
- **Simulated / mocked:** a real component is replaced or simplified.
- **Designed only:** part of the proposed system, but not implemented.
- **Out of scope:** deliberately excluded from the proposed Hackathon scope.

Status at the checkpoint: *In progress* marks capabilities being built for the final submission.

| Capability | Status | What exists in the prototype |
| --- | --- | --- |
| Participant accreditation (org, internal verifiers, auditors) | Implemented | `ParticipantRegistry` on Arbitrum Sepolia: separate Registry Admin and Accreditation Authority, one lifetime role per wallet (revocation is permanent) |
| Evidence anchoring (Merkle root onchain) | Implemented | `ClaimRegistry.anchorClaim` + append-only supplementary roots; shared Merkle vectors pass in Solidity and Python |
| Two-stage verification + proof requests | Implemented | Onchain state machine: checkpoint 1, Authority-assigned auditor, proof loop with four-eyes confirmation, final attestation; 117 Foundry tests, 100% coverage |
| Disputes | Implemented | Any accredited wallet disputes a `Verified` claim; the Authority upholds or dismisses it onchain |
| Privacy pipeline (EXIF strip, encryption, role-based access) | In progress | Planned: FastAPI evidence service with pytest |
| Public verification page | In progress | Planned: React page with browser-side re-hashing |
| Real-world identity of participants | Simulated | Accreditation is a manual admin action on test wallets |
| File storage | Simulated | Local encrypted Docker volume instead of S3/MinIO |
| Funding escrow released on `Verified` | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| Beneficiary confirmation of receipt | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| KYC / verifiable credentials, decentralized arbitration, mainnet | Out of scope | — |

### Effort split

*(planned — re-measured for the final submission)*

| Dimension | Effort | Work implemented |
| --- | ---: | --- |
| UX | 20% | Role views and the public verification page |
| Real-world connection | 30% | Evidence privacy pipeline (EXIF strip, hashing, encryption, access control) and accreditation of real-world entities |
| Blockchain | 50% | Accreditation registry, claim state machine, disputes, events, deployment on Arbitrum Sepolia |

## 3. Demo and validation

**What the demo proves:** *(planned)* a claim's evidence can be verified end to end by independent, accredited parties, and any change to a file after anchoring is detected by anyone, without exposing personal data.

**Reproduce the demo:** Follow [RUNBOOK.md](RUNBOOK.md) for setup, initial state, scenario, and expected results.

**Validation evidence:**

- **Contracts:** `cd code/contracts && forge test` → 117 tests pass (45 ParticipantRegistry, 68 ClaimRegistry incl. fuzz, 3 Merkle vectors, 6 invariants over 8,192 random calls); `forge coverage` → 100% lines, branches and functions on both contracts.
- **Live on Arbitrum Sepolia** (`code/shared/deployments/arbitrum-sepolia.json`): [`ParticipantRegistry`](https://sepolia.arbiscan.io/address/0x32a479e9Ad3C0C9e6e00eF2Dff4D7374b6460564) · [`ClaimRegistry`](https://sepolia.arbiscan.io/address/0x44780Bed68bDd0f9B9a74d82de81B4C069234BFE). Full demo lifecycle of claim `0xfedebf75…a79b28`, whose evidence roots are the real Merkle roots of the files in `code/frontend/public/demo-evidence/`: [anchor](https://sepolia.arbiscan.io/tx/0x758ab032bbf2b10e044f9218fecdb07031048d4d2bf47f9fde8e9549c86f990b) → [internal approval](https://sepolia.arbiscan.io/tx/0xf7234a13cf1ea8f45a25d56458e60ebc4d6d571d6b04e4edba4930e70eff0b03) → [auditor assigned](https://sepolia.arbiscan.io/tx/0x53f2c8f0a2f0fed64ba3933524eb7ce9e5fdc8fe706a18d489984babf3faf69a) → [proof requested](https://sepolia.arbiscan.io/tx/0x6c3afeb1f1127f05d3d49ca77a5f8a549e9f926eeea96bef769af7a31f0e337b) → [proof submitted](https://sepolia.arbiscan.io/tx/0x2d1d92c6a2fe9616f49f8a0e257a3dada2be265312f116939480de48a27c077f) → [second verifier confirms](https://sepolia.arbiscan.io/tx/0x8b40155fbd77aca4561ac6878379011e923150b454983b6179daa4c6b90e62e9) → [final approval](https://sepolia.arbiscan.io/tx/0x853d25339d5a0692ba6f6bf5f8b2e018b38117dfdde4e48fa960631b30fd75f7) → [dispute](https://sepolia.arbiscan.io/tx/0xe33989d631bbe8130ce609c1c8e6a6b1063093eb129e0743006cca12091bbf9c) → [dispute dismissed](https://sepolia.arbiscan.io/tx/0xe56d7ee7333b161be971bf612534fbef84f58687afd4359ce31f088208fc7353). The claim ends `Verified`.
- *(to add)* pytest output of the evidence pipeline; screenshots of the public page showing match / mismatch.

## 4. Limitations and next step

- Trust in the Registry Admin and Accreditation Authority is centralized; accreditation is manual, not backed by verifiable credentials.
- The internal checks are not independent by themselves; independence rests on a single assigned auditor, who could still collude.
- Integrity is proven, not truth: anchored evidence can still be staged before anchoring.
- The backend operator is trusted for confidentiality (not for integrity, which is checked onchain).
- Each organization needs at least two internal verifiers.

**Next step:** *(to be confirmed at the final submission)* the Funding escrow, so donations are released only for `Verified`, undisputed claims.

## 5. AI usage

| Tool | Used for / assisted work | How we reviewed or validated it |
| --- | --- | --- |
| Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` SDD framework | Drafting specifications, architecture and the implementation plan from the team's decisions; adversarial review of the verification flow | Every design decision (verifier roles, disputes, privacy, stack) was taken by the team through explicit questions; the team reviewed and edited all documents |

We confirm that the team can explain and technically defend the submitted work.
