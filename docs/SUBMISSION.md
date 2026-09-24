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
| Participant accreditation (org, internal verifiers, auditors) | In progress | Planned: `ParticipantRegistry` contract with separate Registry Admin and Accreditation Authority |
| Evidence anchoring (Merkle root onchain) | In progress | Planned: `ClaimRegistry.anchor` + shared Merkle test vectors (Solidity/Python/TypeScript) |
| Two-stage verification + proof requests | In progress | Planned: onchain state machine with Foundry tests for every valid and invalid transition |
| Disputes | In progress | Planned: accredited dispute + Authority resolution onchain |
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

**Validation evidence:** *(planned)* Foundry and pytest output, Arbiscan links to the deployment and the lifecycle transactions, screenshots of the public page showing match / mismatch.

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
