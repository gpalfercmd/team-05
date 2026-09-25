# Project Submission

> **State:** final submission, 2026-09-25. Contracts (with deposits, rewards and penalties) deployed and
> exercised on Arbitrum Sepolia; evidence backend, chain indexer, public verification page and role
> screens implemented and tested; setup and demo dry-run from a fresh clone ([RUNBOOK.md](RUNBOOK.md)).
> Every number and address below was checked against the code, the test runs of 2026-09-25 and
> `code/shared/deployments/arbitrum-sepolia.json`.

## 1. Project snapshot

| | |
| --- | --- |
| **Project name** | Proof of Aid — Team 05 |
| **Team ID & members** | Team 05 *(TODO (team): confirm the exact Team ID the organizers assigned; it is also what goes in the final form)* · Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez |
| **System vision** | Anyone, without special access, can check that an aid claim is backed by unaltered evidence reviewed by independent, accredited verifiers, without seeing beneficiaries' personal data. |
| **Implementation focus** | **Trust, Evidence & Privacy:** trusting aid claims whose evidence cannot be published, through encrypted offchain evidence anchored onchain by Merkle root and a contract-enforced two-stage verification. |
| **What we built** | Two smart contracts on Arbitrum Sepolia that enforce accreditation, evidence anchoring, two-stage verification with proof requests, disputes and a per-claim ETH escrow; a Python backend that strips image metadata, salts, hashes and encrypts evidence, serves privacy-safe views and indexes the chain; and a React app where anyone re-checks evidence against the chain in their own browser and each accredited role signs its actions with its wallet. |
| **Code & run instructions** | [code/](../code/) ([developer guide](../code/README.md)) · [Setup and demo](RUNBOOK.md) |
| **Complete system design** | [ARCHITECTURE.md](ARCHITECTURE.md) |

**Summary.** Aid organizations cannot show donors their strongest evidence (photos of recipients,
signed delivery lists) because it contains beneficiaries' personal data. We keep that evidence
offchain, stripped of image metadata, salted, fingerprinted and encrypted, and put only its Merkle
root onchain from the organization's own wallet. Two contracts on Arbitrum Sepolia then enforce who
may confirm it: an internal verifier of the organization (checkpoint 1), an external auditor
accredited and assigned by a separate Accreditation Authority (final say, with proof requests whose
answers a second internal verifier must confirm), and accredited third parties who can dispute a
verified claim for 60 days. Deposits make fraud and frivolous disputes cost ETH. A public page, with
no wallet and no server in between, reads the claim's status, roots and history from the contract
and lets anyone check a file or a whole bundle against the onchain root in the browser; the claim's
title and description are shown only when their hash matches the onchain `metadataHash`.

## 2. Implemented contribution

### Problem and approach

> Within our complete Proof of Aid design, we focus on **Trust, Evidence & Privacy**, addressing **how a third party can trust an aid claim whose evidence contains beneficiaries' personal data and therefore cannot be published** through **offchain encrypted evidence whose Merkle root is anchored onchain, a contract-enforced two-stage verification (internal verifier → independent, officially accredited auditor with proof requests), accredited disputes, and a public page that re-verifies evidence integrity without revealing personal data**.

**Why it matters.** The strongest evidence of delivery is exactly what cannot be shown to donors.
Today donors either trust the organization blindly or the organization leaks personal data. We
separate *what is proven* (the evidence is unchanged since it was anchored, who approved it and when,
whether it was disputed) from *what is shown* (nothing personal: fingerprints, roots, wallet
addresses, status).

**The area's questions, answered by the prototype:**

| Question | Answer |
| --- | --- |
| Who verifies claims? | An internal verifier of the organization (never the submitting wallet), then the external auditor the Accreditation Authority assigned (final). Supplementary proof is confirmed by a second internal verifier, different from the checkpoint-1 verifier. |
| How is evidence checked? | Every file is fingerprinted after metadata stripping as a salted commitment SHA-256(salt ‖ bytes); the bundle's Merkle root is anchored onchain before review. Anyone recomputes the root in the browser; any change after anchoring is a mismatch. |
| How is it disputed? | Any accredited wallet other than the claim's organization and its approving auditor can dispute a `Verified` claim within 60 days of the approval, posting a bond and a counter-evidence hash; the Accreditation Authority upholds or dismisses it; deposits move accordingly. |
| How is it kept private? | Files are encrypted at rest with a per-claim key and decrypted only for the organization, its active internal verifiers and the assigned auditor. Outsiders see private files as a fingerprint only (no name, type, size or uploader). Nothing personal goes onchain. |

**Where it fits.** It covers the *Verification* step of
`Need → Verification → Funding → Delivery → Outcome → Transparent history`, and feeds *Transparent
history* directly from contract events. *Funding* (donations escrowed and released on `Verified`) and
*Delivery & Impact* (beneficiary confirmation) are designed in [ARCHITECTURE.md](ARCHITECTURE.md#components)
but not implemented. The P9 escrow is not donor funding: it holds the participants' own deposits.

### What works and how

1. **Accreditation (`ParticipantRegistry`).** The Registry Admin registers organizations and their
   internal verifiers; a separate Accreditation Authority accredits auditors (OpenZeppelin
   `AccessControl`, each admin role administers only its own participant roles, nobody holds
   `DEFAULT_ADMIN_ROLE`). A wallet holds one participant role **for life**: a wallet that was ever an
   organization, internal verifier or auditor can never be registered again in any role
   (`AlreadyAccredited`). While building we found that "one role at a time" let a revoked verifier be
   re-accredited as auditor and sign both checkpoints of the same claim.
2. **Verification state machine (`ClaimRegistry`).** `Anchored → InternallyVerified →
   (ProofRequested ⇄ ProofSubmitted) → Verified | Rejected`, then `Verified → Disputed → Verified |
   Rejected`. Every other call reverts (`InvalidStatus`). The contract enforces separation of duties
   (submitter ≠ checkpoint-1 verifier ≠ proof confirmer), that only the auditor the Authority
   assigned can act, that an organization needs two active verifiers to anchor, that evidence roots
   are append-only, and that a revoked organization's claim can be rejected but never (re)verified.
   Every transition emits `StatusChanged` plus an action event.
3. **Evidence pipeline (FastAPI backend).** Wallet-signature login (EIP-191 over a single-use nonce,
   10-minute expiry) opens a session. `POST /claims` stores the title, description, region and date
   and returns the claim ID (`keccak256` of a random UUID) and the `metadataHash` to anchor. Uploads
   (max 25 MiB per file) are sanitized (JPEG/PNG/WebP re-encoded without EXIF/GPS or ICC data; other
   files pass through unchanged), committed as SHA-256(random 32-byte salt ‖ sanitized bytes),
   checked for duplicates with a per-claim HMAC, and encrypted with AES-256-GCM under a per-claim key
   derived by HKDF from the master key. Files are grouped into bundles (0 = original evidence,
   n = answer to proof request n) and the upload returns that bundle's Merkle root, which equals the
   root the organization anchors.
4. **Access control follows the chain.** With `ROLE_SOURCE=chain` (the default when a deployment
   file is configured) the backend decides who may decrypt from the indexed registries: the
   organization that created the claim, its active internal verifiers while the organization is
   active, and the auditor assigned onchain, only if the claim was anchored by the organization that
   created it. Denied private reads answer 404, like a missing file.
5. **Public verification (React, no wallet, no login).** The claim page reads status, claim record,
   evidence roots, escrow and full history **directly from `ClaimRegistry`** (views plus
   `eth_getLogs` filtered by claim ID). A visitor drops a file: the browser computes its SHA-256 (and,
   for salted public files, SHA-256(salt ‖ file)) and checks it against a bundle file list that is
   accepted only if its recomputed root equals the onchain root, or drops a whole bundle and compares
   its root directly. Files never leave the browser. With the API configured, the page also shows
   the claim's title and description, only after recomputing `metadataHash` and matching the chain.
6. **Role screens (React + wagmi/viem, MetaMask).** The dashboard reads the connected wallet's role
   from `ParticipantRegistry` and offers only the actions `ClaimRegistry` would accept on each claim.
   Every call is simulated first (reverts explained in plain English), then signed; payable amounts
   are read from the contract, never typed.
7. **Fraud costs money (P9).** `ClaimRegistry` escrows ETH per claim: the organization deposits a
   penalty plus the auditor's reward when anchoring, the auditor deposits when approving, and a
   disputant posts a bond. Payouts are credited and pulled with `withdraw()`. See *Incentives* below.
8. **Chain indexer (optional speed-up).** A web3.py poller copies both registries' events into
   PostgreSQL (idempotent, restart-safe, 5-block confirmation margin by default), projects
   participants and claims for the access rules, and serves a public timeline API. The page uses the
   API history only when it provably ends in the contract's current state; otherwise it reads the chain.
9. **One recipe, three implementations.** The Merkle recipe and the metadata recipe are implemented in
   Python (`code/shared/poa_shared`), TypeScript (browser) and, for Merkle, Solidity tests with
   OpenZeppelin `MerkleProof`; all pass the same committed vectors byte for byte.

### End-to-end flow

Amounts: Sepolia deployment (1/100 scale), then the production reference in brackets. "Credited"
means added to `credits(account)`; ETH leaves the contract only through `withdraw()`.

| # | Actor (wallet) | Action (backend call or contract function) | Status before → after | Money |
| ---: | --- | --- | --- | --- |
| 0 | Registry Admin; Accreditation Authority | `registerOrganization(org)`, `registerInternalVerifier(v, org)` ×2; `accreditAuditor(a)` | — (no claim yet) | none |
| 1 | Organization | `POST /auth/challenge` → sign the message in the wallet → `POST /auth/verify` (session cookie) | — | none |
| 2 | Organization | `POST /claims` (title, description, region, date) → `claim_id_hex`, `metadata_hash_hex` | — (backend record only) | none |
| 3 | Organization | `POST /claims/{id}/evidence` with `root_index=0` → sanitize, salt, fingerprint, encrypt → `evidence_root` | — | none |
| 4 | Organization | `anchorClaim(claimId, evidenceRoot, metadataHash)` | `None → Anchored` | organization pays `anchorDeposit()` = 0.0101 ETH (1.01) |
| 5 | Internal verifier 1 | `attestInternal(claimId, approve, justificationHash)` | `Anchored → InternallyVerified` (approve) or `→ Rejected` (reject) | reject: organization credited 0.0101 (1.01) |
| 6 | Accreditation Authority | `assignAuditor(claimId, auditor)` (also reassignment) | no change; allowed in `InternallyVerified`, `ProofRequested`, `ProofSubmitted` | none |
| 7 | Assigned auditor | `requestProof(claimId, requestHash)` | `InternallyVerified → ProofRequested` | none |
| 8 | Organization | `POST /claims/{id}/evidence` with `root_index=n`, then `submitProof(claimId, supplementaryRoot)` | `ProofRequested → ProofSubmitted`; `evidenceRoots[n]` appended | none |
| 9 | Internal verifier 2 (≠ verifier 1) | `confirmProof(claimId, accept, justificationHash)` | `ProofSubmitted → InternallyVerified` (accept) or `→ ProofRequested` (return) | none |
| 10 | Assigned auditor | `attestFinal(claimId, approve, justificationHash)` | `InternallyVerified → Verified` (approve) or `→ Rejected` (reject) | approve: auditor pays `auditorDeposit()` = 0.001 (0.1), `verifiedAt` set; reject: pays 0, organization credited 0.0101 (1.01) |
| 11 | Accredited third party (not the organization, not the approving auditor) | `openDispute(claimId, counterEvidenceHash)` before `verifiedAt + 60 days` | `Verified → Disputed` | disputant pays `disputeBond()` = 0.001 (0.1) |
| 12 | Accreditation Authority | `resolveDispute(claimId, upheld, justificationHash)` | `Disputed → Verified` (dismissed) or `→ Rejected` (upheld) | dismissed: organization 0.0005 (0.05), auditor 0.0005 (0.05); upheld: disputant 0.0121 (1.21) |
| 13 | Anyone | `settle(claimId)` once `verifiedAt + 60 days` has passed | stays `Verified`; `settled = true`, never disputable again | organization credited 0.01 (1), auditor 0.0011 (0.11) |
| 14 | Anyone with credits | `withdraw()` | — | all of the caller's credits sent |
| 15 | Anyone | Public claim page: read the chain, drop a file or bundle, compare roots in the browser | — | none |

Steps 0 and 4–12 (dismissed branch) are the Arbitrum Sepolia demo, executed by
`DemoLifecycle.s.sol` (transactions in section 3). On the demo claim, which the script anchored
directly, steps 1–3 and the backend upload of step 8 did not happen: its roots are the Merkle roots of
the committed demo files. Steps 1–15 all run from the role screens on local anvil ([RUNBOOK path D](RUNBOOK.md#d-role-screens-sign-each-roles-actions-from-the-browser)).

### Implementation boundary

- **Implemented:** working code or another demonstrable technical artifact exists.
- **Simulated / mocked:** a real component is replaced or simplified.
- **Designed only:** part of the proposed system, but not implemented.
- **Out of scope:** deliberately excluded from the proposed Hackathon scope.

| Capability | Status | What exists in the prototype |
| --- | --- | --- |
| Participant accreditation (organizations, internal verifiers, auditors) | Implemented | `ParticipantRegistry` on Arbitrum Sepolia: separate Registry Admin and Accreditation Authority, one lifetime role per wallet (revocation is permanent), `grantRole`/`revokeRole`/`renounceRole` blocked for participant roles |
| Evidence anchoring (Merkle root onchain) | Implemented | `ClaimRegistry.anchorClaim` (original root) + `submitProof` (append-only supplementary roots); `evidenceRoots(claimId)` view |
| Two-stage verification + proof requests | Implemented | Onchain state machine: checkpoint 1, Authority-assigned auditor, proof loop with four-eyes confirmation, final attestation; full lifecycle executed on Arbitrum Sepolia |
| Disputes | Implemented | Any accredited wallet except the claim's own organization and approving auditor, within 60 days of the approval, one open at a time; the Authority upholds or dismisses (demo: dismissed) |
| Deposits, rewards, penalties, settlement (P9) | Implemented | Per-claim ETH escrow in `ClaimRegistry`, pull payments, 60-day window; full path including `settle` and `withdraw` run on local anvil; live on Arbitrum Sepolia the demo claim holds 0.0111 ETH (settle possible only after its window closes) |
| Privacy pipeline (image metadata strip, salted fingerprints, encryption, role-based access) | Implemented | FastAPI evidence service; private files exposed to outsiders as fingerprints only; only JPEG/PNG/WebP are re-encoded, other file types are stored as uploaded |
| Evidence bundles and manifests (v1 unsalted, v2 salted) | Implemented | One root per bundle, equal to `evidenceRoots[i]`; `GET /claims/{id}/bundles/{n}/manifest` in the shared JSON Schema |
| Public verification page | Implemented | Reads the deployed contract directly; single-file (via a manifest proven against the chain) and whole-bundle checks in the browser; title and description shown only when their hash matches the onchain `metadataHash` |
| Event indexer and public timeline API | Implemented | web3.py poller into PostgreSQL (idempotent, restart-safe, confirmation margin, range halving); `GET /public/claims`, `/public/claims/{id}/timeline`, `/public/indexer/status` |
| Evidence access follows the chain | Implemented | `ROLE_SOURCE=chain`: onchain accreditation, revocation and auditor assignment change decryption rights once indexed. The hand-seeded `participants` table remains a development fallback (`ROLE_SOURCE=local`) |
| Role screens (sign actions from the UI) | Implemented | Registry Admin, Accreditation Authority, organization (record a claim with its evidence, answer proof requests), internal verifier, auditor, anyone (settle, withdraw). Checked with Vitest (mocked wallet), an anvil end-to-end test with the same calls and a browser run with a scripted test wallet, **not** with MetaMask itself |
| Reviewing private evidence in the UI | Implemented in the API only | `GET /files/{id}` decrypts for authorized sessions; the app has no screen that lists or downloads private files for verifiers and auditors, and no per-file visibility switch (`PATCH /files/{id}` exists; the upload form sets one public/private flag per batch) |
| Notes behind justification, proof-request and counter-evidence hashes | Simulated | Only the keccak-256 fingerprint of the note is recorded onchain; the text is not stored anywhere |
| Bundle sealing by onchain anchoring | Simulated | The backend seals bundle n when bundle n+1 is started (upload order), not when root n is anchored onchain |
| Real-world identity of participants | Simulated | Accreditation is a manual admin action on test wallets |
| File storage | Simulated | Local encrypted folder (`STORAGE_DIR`) instead of S3/MinIO |
| Demo evidence and demo claim text | Mocked | Made-up receipts, invoice, delivery summary and stock count; no real personal data. The Sepolia demo claim anchors a stand-in `metadataHash` and has no backend record. EXIF/GPS stripping is shown by a backend test on a synthetic JPEG |
| Funding escrow of donations released on `Verified` | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) (`FundingEscrow`) |
| Beneficiary confirmation of receipt | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| Decentralized arbitration (Kleros) | Designed only | Section 4, *Next step: Kleros arbitration* |
| KYC / verifiable credentials, mainnet deployment, contract audit | Out of scope | — |

### Effort split

> **TODO (team):** the percentages below are the team's estimate, not a measurement (the checkpoint
> plan said Blockchain 50% · Real-world connection 30% · UX 20%). Replace them with the measured split
> before submitting; only the team knows it.

Percentages describe implementation effort, must total **100%**, and have no ideal distribution.

| Dimension | Effort | Work implemented |
| --- | ---: | --- |
| UX | 30% | Public verification page (timeline, verification summary, deposits card, in-browser file and bundle checks, claim text check), role screens for every participant (MetaMask signing, simulation before signing, plain-language contract errors, wrong-network switch), design system and layout (light and dark, 375 px) |
| Real-world connection | 30% | Evidence privacy pipeline (image metadata strip, salted fingerprints of cleaned files, per-claim encryption, access control), wallet login, bundles and manifests, chain indexer and chain-driven access, accreditation of real-world entities |
| Blockchain | 40% | Accreditation registry, claim state machine, disputes, escrow with rewards and penalties, events, 100%-coverage test suite with fuzzing and invariants, deployment and full lifecycle on Arbitrum Sepolia |

### Incentives: who pays whom

Parameters are immutable constructor arguments of `ClaimRegistry` (all non-zero), readable with
getters of the same name. Sepolia uses 1/100 of the reference amounts and the real 60-day window.

| Parameter | Reference | Arbitrum Sepolia |
| --- | ---: | ---: |
| `organizationPenalty` | 1 ETH | 0.01 ETH |
| `auditorReward` | 0.01 ETH | 0.0001 ETH |
| `anchorDeposit()` = penalty + reward | 1.01 ETH | 0.0101 ETH |
| `auditorDeposit` | 0.1 ETH | 0.001 ETH |
| `disputeBond` | 0.1 ETH | 0.001 ETH |
| `disputeWindow` | 60 days (5,184,000 s) | 60 days |

| Moment | Caller | Pays in (reference / Sepolia) | Credited (reference / Sepolia) | Escrow still held for the claim (`lockedOf`, Sepolia) |
| --- | --- | --- | --- | --- |
| **Anchor** `anchorClaim` | Organization | 1.01 / 0.0101 (exact `msg.value`) | — | 0.0101 |
| **Approve at checkpoint 1** `attestInternal(true)` | Internal verifier | nothing | — | 0.0101 |
| **Reject** at checkpoint 1 (`attestInternal(false)`) or by the auditor (`attestFinal(false)`, `msg.value` 0) | Verifier / auditor | nothing | organization: 1.01 / 0.0101 (its whole deposit) | 0 |
| **Approve** `attestFinal(true)` | Assigned auditor | 0.1 / 0.001 | — | 0.0111 |
| **Dispute** `openDispute` (only before `verifiedAt + 60 days`) | Accredited third party | 0.1 / 0.001 | — | 0.0121 |
| **Uphold** `resolveDispute(true)` | Authority | — | disputant: bond + penalty + auditor deposit + reward = 1.21 / 0.0121 | 0 (claim `Rejected`) |
| **Dismiss** `resolveDispute(false)` | Authority | — | auditor: half the bond 0.05 / 0.0005; organization: the rest (with any odd wei) 0.05 / 0.0005 | 0.0111 (claim `Verified`, same window) |
| **Settle** `settle` (window closed, not `Disputed`, not settled) | Anyone | — | organization: penalty 1 / 0.01; auditor: deposit + reward 0.11 / 0.0011 | 0 |
| **Withdraw** `withdraw()` | Anyone with credits | — | sends all of the caller's credits; `NothingToWithdraw` when zero | unchanged |

Rules the table does not show: the prepaid reward goes to the disputant, not back to the
organization, when fraud is proven (the organization caused it). The window starts once, at the
approval, and a dismissal does not restart it, so each repeat dispute costs a bond and every claim is
free of disputes 60 days after its approval. The organization and the approving auditor cannot
dispute their own claim (`CannotDisputeOwnClaim`): an upheld self-dispute would pay the forfeited
deposits back to the wrongdoers. `withdraw` is the only function that sends ETH (checks-effects-
interactions plus OpenZeppelin `ReentrancyGuard`); no function loops over claims; the contract has
no `receive`. A fuzzed invariant checks `contract balance == Σ credits + Σ lockedOf == Σ paid in − Σ
withdrawn`.

### Security fixes from the logic review

A logic review of the verification flow on 2026-09-24 produced four fixes, each with its own tests.

| Fix | Problem | Fix as built | Evidence |
| --- | --- | --- | --- |
| **P8.1** Revoked organization | An auditor could still approve, or the Authority dismiss a dispute on, the claim of an organization the Registry Admin had revoked (for example for fraud), so the claim ended `Verified`. | `attestFinal(approve)`, `requestProof` and `resolveDispute(dismiss)` revert `NotActiveOrganization(claim.organization)` when the claim's organization is revoked; reject, dispute and uphold stay allowed. Contracts redeployed. | Commit `8dfae6b` (+ redeploy `c766986`, superseded by the P9 redeploy `b780756`). Tests in `code/contracts/test/ClaimRegistry.t.sol`: `test_AttestFinal_RevokedOrganizationCannotBeVerified`, `test_ResolveDispute_RevokedOrganizationCannotBeDismissed`, `test_RequestProof_RevokedOrganizationCannotBeAskedForProof`, `test_RevokedOrganizationClaimNeverBecomesVerified_AllActionsActorsAndDecisions` (every action × status × actor × decision), and the invariant `invariant_RevokedOrganizationNeverBecomesVerified`. |
| **P8.2** Salted commitments | A public fingerprint SHA-256(file) lets anyone who can guess a private file (a standard form, a known photo) confirm it is part of a claim. | Every new upload is committed as SHA-256(salt ‖ sanitized bytes) with a random 32-byte salt, sealed with the claim key; public files publish their salt (claim view, manifest v2); duplicates are detected with a per-claim HMAC. The Merkle recipe and the contracts are unchanged (the commitment is the leaf input). | Commits `e73f0b8` (shared helper + salted vectors), `2b0e510` (backend + migration 0004 + manifest v2), `3dc40c2` (browser verifier), `dfc3b02` (docs). Tests: `code/backend/tests/test_salted_commitments.py` (10), the salted cases of `code/shared/tests/test_merkle.py`, and `code/frontend/src/evidence/verification.test.ts` (*never matches a private salted file from a guessed copy*, *matches a public salted file through SHA-256(salt ‖ file)*). |
| **P8.4** Metadata check | The title and description live only in the backend; a server could show donors a different text than the one the organization anchored. | `metadataHash` = keccak256 of the UTF-8 fields joined by a line feed (recipe below), frozen by `code/shared/metadata-vectors.json`; the API rejects line breaks in the title and region; the public page recomputes the hash over the onchain claim ID and shows the text only on a match. | Commit `17171ac`. Tests: `code/shared/tests/test_metadata.py`, `code/backend/tests/test_metadata.py`, `code/frontend/src/utils/metadata.test.ts`, `src/data/claimMetadata.test.ts`, `src/components/ClaimMetadata.test.tsx`. |
| **P9** Incentives | Fraud and disputes were free: an organization or colluding auditor risked nothing, and any accredited wallet could dispute the same claim over and over. | Per-claim ETH escrow (tables above), 60-day window set once at approval, bond per dispute, no self-dispute, pull payments. Interface extended; contracts redeployed. | Commits `7c0d842` (contract + tests), `691717c` (scripts, ABI, indexer), `7fdfb5b` (Deposits card), `e4180a9` (docs), `b780756` (Sepolia redeploy). Tests: `code/contracts/test/ClaimRegistryIncentives.t.sol` (37: every path, window boundary with `vm.warp`, odd bond, reentrant and rejecting receivers) and the invariants `invariant_BalanceEqualsCreditsPlusLockedEscrow`, `invariant_SettledClaimsArePastTheirWindow`. |

Two further findings were kept as documented limitations (section 4): identity/Sybil of attesters
and claim-ID squatting.

## 3. Demo and validation

**What the demo proves:** a claim that went through the full two-stage verification, a proof
request, a dispute with bond and its dismissal on Arbitrum Sepolia can be checked by anyone in a
browser: a genuine evidence file matches the root recorded onchain, a one-character change is
detected, and no private file name or content is ever exposed.

**Reproduce the demo:** Follow [RUNBOOK.md](RUNBOOK.md) for setup, initial state, scenario, and
expected results:

| Path | RUNBOOK section | Needs |
| --- | --- | --- |
| A. Live Sepolia page (read-only) | [A. Public page against the live Arbitrum Sepolia deployment](RUNBOOK.md#a-public-page-against-the-live-arbitrum-sepolia-deployment) | Node + pnpm |
| B. Full lifecycle on a local chain, including the 60-day settlement | [B. Local anvil demo](RUNBOOK.md#b-local-anvil-demo-full-lifecycle-on-your-machine) | + Foundry |
| C. Backend, migrations and indexer | [C. Backend API, migrations and indexer](RUNBOOK.md#c-backend-api-migrations-and-indexer) | + Python/uv + PostgreSQL |
| D. Every role signing from the browser | [D. Role screens](RUNBOOK.md#d-role-screens-sign-each-roles-actions-from-the-browser) | + MetaMask |
| Every test suite | [Validate](RUNBOOK.md#validate) | as above |
| The 12-step demo table (match, tamper, bundle) | [Demo](RUNBOOK.md#demo) | A or B |

### Live deployment (Arbitrum Sepolia, chain ID 421614)

Source of truth: [`code/shared/deployments/arbitrum-sepolia.json`](../code/shared/deployments/arbitrum-sepolia.json)
(every link below was generated from it).

| | |
| --- | --- |
| `ParticipantRegistry` | [`0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1`](https://sepolia.arbiscan.io/address/0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1) |
| `ClaimRegistry` | [`0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013`](https://sepolia.arbiscan.io/address/0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013) |
| `deployBlock` | 312397989 (L2 block of the first deployment receipt) |
| Registry Admin / Accreditation Authority | `0x92718b20EeBbbd2e228878D64bBCCCF951f779cf` / `0x0e53FF46bcAB90c2CEd3BADfafF453ef40a58e68` (test-only wallets) |
| Demo claim ID | `0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28` |
| Demo evidence roots | `evidenceRoots[0]` = `0x515344752095a24904ad32a660a1d15ddbf9c49e90f43d58323d76e398548707` (files of `code/frontend/public/demo-evidence/manifest.json`), `evidenceRoots[1]` = `0x8e94bc6a483ea396391f77e88e9359003f723d74463a8afef5279ab397612370` (`manifest-proof-1.json`) |
| Final state | `Verified`, 0.0111 ETH held (anchor deposit 0.0101 + auditor deposit 0.001), bond credited half to the organization and half to the auditor; settle possible 60 days after the approval |

| Deployment | Transaction | Block | Contract |
| --- | --- | ---: | --- |
| Deploy `ParticipantRegistry` | [`0x1d5418da…ccb99e`](https://sepolia.arbiscan.io/tx/0x1d5418da0086223ff590dc1698dfee5796dff262a8b8198ac888c58dc0ccb99e) | 312,397,989 | [`0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1`](https://sepolia.arbiscan.io/address/0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1) |
| Deploy `ClaimRegistry` | [`0x2e25fdcd…9223be`](https://sepolia.arbiscan.io/tx/0x2e25fdcdfeae38a1a4368c4d3bb13dc433a5fbb598e50734113bb286cb9223be) | 312,397,999 | [`0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013`](https://sepolia.arbiscan.io/address/0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013) |

| # | Function | Signed by | Transaction | Block |
| ---: | --- | --- | --- | ---: |
| 1 | `registerOrganization` | Registry Admin (`0x9271…79cf`) | [`0x31ec8a5b…627cd1`](https://sepolia.arbiscan.io/tx/0x31ec8a5bfa91e7427574dafbbea1a64a7e50d55a7671ecde65f3f8cdcf627cd1) | 312,398,031 |
| 2 | `registerInternalVerifier` | Registry Admin (`0x9271…79cf`) | [`0x08fca54e…84d154`](https://sepolia.arbiscan.io/tx/0x08fca54efbe0cd685a77bf1899a03ce306191e8f0a38b09eed3c7f70c784d154) | 312,398,038 |
| 3 | `registerInternalVerifier` | Registry Admin (`0x9271…79cf`) | [`0x3f5166dd…4452fb`](https://sepolia.arbiscan.io/tx/0x3f5166dd0d7383130da4f6451cb43b53965e5fb0474d1c1ce40f4b65b04452fb) | 312,398,049 |
| 4 | `accreditAuditor` | Accreditation Authority (`0x0e53…8e68`) | [`0x6a334156…b3aab1`](https://sepolia.arbiscan.io/tx/0x6a3341560254ec979ef8650ddc7f9b1dc5b9816ee35a6be26887f9cba7b3aab1) | 312,398,059 |
| 5 | `accreditAuditor` | Accreditation Authority (`0x0e53…8e68`) | [`0xb1b81e14…271064`](https://sepolia.arbiscan.io/tx/0xb1b81e14a2fb16167e4034d2c332cd773a322ac9733afcbddce9d1b618271064) | 312,398,069 |
| 6 | `anchorClaim` | Organization (`0xa8cc…ddaf`) | [`0x93f49b25…630a6e`](https://sepolia.arbiscan.io/tx/0x93f49b2514e4a7ae2d7e15619ebd37de3bdd7d8928d870a37548a60602630a6e) | 312,398,079 |
| 7 | `attestInternal` (approve) | Internal verifier 1 (`0x056b…382d`) | [`0x0aabdfef…acfa89`](https://sepolia.arbiscan.io/tx/0x0aabdfeff004ef228b3ca5d84ca723edd5fe2d542423a00b0359f795dfacfa89) | 312,398,089 |
| 8 | `assignAuditor` | Accreditation Authority (`0x0e53…8e68`) | [`0x3971213b…19e22b`](https://sepolia.arbiscan.io/tx/0x3971213bb081bd5836e90ad5afcb6b17ba5da05f2b57d0ab979cd0393719e22b) | 312,398,098 |
| 9 | `requestProof` | Auditor (`0xeddb…ebb9`) | [`0x74b91ba0…70ea4b`](https://sepolia.arbiscan.io/tx/0x74b91ba021ae078d442981f844592ed7313c4b27dcefd834fd48471cf670ea4b) | 312,398,108 |
| 10 | `submitProof` | Organization (`0xa8cc…ddaf`) | [`0xebf382b5…dc3be2`](https://sepolia.arbiscan.io/tx/0xebf382b5434e1aa8b975dfca9b1d02b74f3505eecf06b56595f4415d0bdc3be2) | 312,398,118 |
| 11 | `confirmProof` (accept) | Internal verifier 2 (`0x9b28…2bea`) | [`0x0d76c756…d6190a`](https://sepolia.arbiscan.io/tx/0x0d76c7561f4dd7326e4ffef6b1689c1de4fae4dc46907d97c6c3ab53ecd6190a) | 312,398,128 |
| 12 | `attestFinal` (approve) | Auditor (`0xeddb…ebb9`) | [`0xaa4ef572…12c76b`](https://sepolia.arbiscan.io/tx/0xaa4ef572c6616cd5e7cda66caf7f6d3da84f04e300c7f200a7748d1af812c76b) | 312,398,138 |
| 13 | `openDispute` | Disputant, a second accredited auditor (`0x631e…a747`) | [`0x508bd4de…ccd88f`](https://sepolia.arbiscan.io/tx/0x508bd4de097e0f5aa3969e07aea2e8200f29a1d80d08d0479fac24ac5cccd88f) | 312,398,148 |
| 14 | `resolveDispute` (dismissed) | Accreditation Authority (`0x0e53…8e68`) | [`0xbaaa25c4…641de6`](https://sepolia.arbiscan.io/tx/0xbaaa25c4c3be25806d465879650bb45296cb24d1c3e1f26dd6262c6035641de6) | 312,398,158 |

The wallet top-ups the script sends are not registry calls and are not recorded.

### Validation evidence

**Test suites, re-run on 2026-09-25 against the current `main`** (commands from `code/`, see
[RUNBOOK Validate](RUNBOOK.md#validate)):

| Suite | Command | Result |
| --- | --- | --- |
| Contracts | `cd contracts && forge test` | **168 passed**, 0 failed: `ClaimRegistryTest` 82 (incl. fuzz), `ParticipantRegistryTest` 45, `ClaimRegistryIncentivesTest` 37, `MerkleVectorsTest` 3, `ClaimRegistryInvariantTest` 1 (forge reports the suite's 9 invariants as one entry: 128 runs × 64 calls = 8,192 random calls, 0 failures) |
| Contract coverage | `cd contracts && forge coverage --report summary` | `ClaimRegistry.sol` 100% lines (200/200), statements (218/218), branches (39/39), functions (39/39); `ParticipantRegistry.sol` 100% lines (78/78), statements (89/89), branches (11/11), functions (20/20). Scripts are not covered (0%), by design |
| Contract format | `cd contracts && forge fmt --check` | clean |
| Backend | `uv run --project backend pytest -c backend/pyproject.toml backend/tests` | **111 passed**, 0 skipped (includes the anvil end-to-end indexer test: it starts anvil on chain ID 31338, runs `Deploy` + `DemoLifecycle`, indexes twice) |
| Shared recipe | `cd shared && uv run pytest` | **30 passed** (19 Merkle incl. salted, 11 metadata) |
| Frontend | `cd frontend && pnpm test` | **442 passed, 8 skipped** (42 files passed, 1 skipped: the opt-in anvil end-to-end file) |
| Frontend static checks | `pnpm typecheck`, `pnpm lint`, `pnpm build` | typecheck and oxlint silent; build OK (JS gzip: 64.9 kB app + 95.1 kB React + 105.8 kB web3) |
| Recipes and ABIs are in sync | `uv run python -m poa_shared.gen_vectors`, `… gen_metadata_vectors`, `bash script/export-abi.sh` | regenerated files identical to the committed ones (`git status` clean) |

What the suites cover, in short: every valid and invalid transition (the full action × status
matrix), separation of duties, revoked wallets and organizations, role-admin isolation, deposits and
payouts, the window boundary, reentrancy, events and stored state (contracts); login and replay,
claim validation, EXIF/GPS stripping on a synthetic JPEG (`test_sanitize_strips_exif_and_gps`), hash
of sanitized bytes, encryption round trip and tampering, the access matrix in local and chain mode,
privacy of public views, bundle sealing, manifests, CORS, indexer idempotency, restart,
confirmations and range halving, and the public API (backend); the Merkle and metadata recipes
against every shared vector, manifest parsing and verification, the claim page, the Deposits card,
role detection, the action planner per role and status, payable amounts, the transaction lifecycle,
decoded reverts and the wrong-network state (frontend). Removing the four-eyes check or the
permanent-identity rule makes contract tests fail (mutation spot checks during P2).

**Recorded earlier on 2026-09-25 (not re-run in this pass):**

- **Role screens end to end on local anvil:** `ANVIL_E2E_RPC=http://127.0.0.1:8545
  ANVIL_E2E_API=http://localhost:8000 pnpm vitest run src/chain/roleActions.anvil.test.ts` → 8 passed
  against `Deploy` + `DemoLifecycle` and the backend: roles of all demo wallets, admin and Authority
  registry actions, wallet login + claim + upload through the backend, anchor paying
  `anchorDeposit()`, checkpoint 1, auditor assignment, proof loop with the four-eyes refusal,
  approval, dispute guards, settle after a 60-day clock jump and withdraw. In a browser against the
  same chain, with a scripted test wallet instead of MetaMask, an organization recorded a claim
  through the form (login signature, upload, anchor) and an internal verifier approved it; the
  public page of a claim recorded through the backend showed "Title and description match the
  blockchain record".
- **Fresh-clone dry run:** the RUNBOOK was followed from a `git clone` on macOS (commit `b780756`):
  every suite green, `forge coverage` 100% on `src/`, the anvil demo ended `Verified` with 0.0111 ETH
  escrowed, `settle` after a 60-day clock jump left 0 locked and credited the organization 0.0105 ETH
  (penalty 0.01 + half the bond 0.0005) and the auditor 0.0016 ETH (deposit 0.001 + reward 0.0001 +
  half the bond 0.0005); on a throwaway PostgreSQL 18.6 database `alembic upgrade head` ran
  0001–0004, the indexer stored the 30 events of the anvil demo (including settlement) and a second
  run added 0; the API served the timeline; the page showed **Match** for `receipt-001.txt` and
  **No match** after one character was changed, on anvil and on the live Sepolia deployment.
- **Against the live chain:** the page pointed at the deployed contract shows the demo claim's
  history, both evidence bundles with their file lists and the Deposits card (0.0111 ETH held,
  "Disputes open until …"); the committed manifest is accepted because its root matches
  `evidenceRoots[0]`, and `receipt-001.txt` verifies as **Match**. The two files of supplementary
  proof #1 checked as a complete bundle → **Match** (root `0x8e94…2370`); the same files with one byte
  flipped in `stock-count.txt` → **No match** (computed `0x7f22…99ef`). No browser console errors.
- **PostgreSQL:** migrations verified on SQLite, a disposable PostgreSQL 18, the Docker PostgreSQL 16
  (0001–0003) and PostgreSQL 18.6 (0001–0004). Before the P9 redeploy, the indexer stored the 22
  registry events of the previous Sepolia deployment in about 7 s and a second run added 0.
- **UI screenshots (demo data, 2026-09-25):** dashboard and public claim page at 1280px and 375px, light and dark: [home desktop](evidence/ui-home-desktop.png) · [home desktop dark](evidence/ui-home-desktop-dark.png) · [home mobile](evidence/ui-home-mobile.png) · [home mobile dark](evidence/ui-home-mobile-dark.png) · [claim desktop](evidence/ui-claim-desktop.png) · [claim desktop dark](evidence/ui-claim-desktop-dark.png) · [claim mobile](evidence/ui-claim-mobile.png) · [claim mobile dark](evidence/ui-claim-mobile-dark.png).
- **Secret scan (P7.2):** no `.env` file is tracked or was ever committed (only the three
  `.env.example` templates and the public-address `code/frontend/.env.sepolia`); the only private key
  and mnemonic in the repository are Foundry's public anvil development ones, in the local-demo
  instructions and tests.

## 4. Limitations and next step

Each limitation with the concrete scenario it allows:

1. **Identity and Sybil resistance.** A wallet proves key control, not a person, and accreditation is
   a manual admin action without KYC or verifiable credentials. *Scenario:* one person controls both
   registered internal verifiers of an organization; they approve checkpoint 1 with one wallet and
   confirm the supplementary proof with the other, and the four-eyes rule is satisfied on paper. The
   contract makes identities permanent and roles exclusive, but cannot tell whether two wallets
   belong to the same human; the Registry Admin and the Accreditation Authority must check that.
2. **Claim-ID squatting.** A claim ID is `keccak256(uuid)` chosen offchain and not bound to the
   organization. *Scenario:* an accredited organization learns another organization's claim ID
   between `POST /claims` and the anchor transaction (for example from a link shared too early) and
   anchors it first, paying its own deposit; the rightful organization's `anchorClaim` reverts
   `ClaimAlreadyExists` and it must create a new claim. Squatting cannot open private evidence: the backend gives the assigned auditor access
   only when the claim was anchored by the organization that created it. Fix: derive the ID onchain
   from (organization, uuid).
3. **The Accreditation Authority is a single point of trust.** It accredits and revokes auditors,
   assigns the auditor of every claim and judges every dispute, and since P9 its ruling moves the
   deposits. *Scenario:* a captured Authority assigns a friendly auditor to a fraudulent claim and
   dismisses every dispute against it, paying the disputants' bonds to the organization and the
   auditor. Every decision is public and attributable to its wallet, but nothing onchain can overrule
   it. The designed next step is Kleros arbitration (below).
4. **Independence rests on one auditor.** The internal checks are affiliated with the organization by
   design. *Scenario:* the organization bribes the single assigned auditor; its approval makes the
   claim `Verified` and only a dispute within 60 days (with a bond) can undo it.
5. **Legacy unsalted claims.** Claims recorded before salted fingerprints (P8.2), including the
   Arbitrum Sepolia demo claim, keep plain SHA-256 fingerprints and version 1 manifests. *Scenario:*
   someone who can guess a private file of such a claim (a standard delivery form) hashes it and
   confirms it is in the claim. Claims created through the backend since P8.2 are salted.
6. **Deposits locked when the organization is revoked mid-review.** Revoking an organization makes
   `organizationOf` return zero for its verifiers and blocks `submitProof`, `requestProof` and approval.
   *Scenario:* the Registry Admin revokes an organization whose claim is `Anchored` (its verifiers can
   no longer attest), `ProofRequested` (it can no longer submit) or `ProofSubmitted` (its verifiers can
   no longer confirm): the claim can never move again and its 0.0101 ETH (1.01) stays in the contract
   forever. A claim in `InternallyVerified` can still be rejected by the auditor, which refunds the
   (revoked) organization. Deposits also need ETH up front, and the amounts are fixed at deployment.
7. **Integrity is not truth.** The chain proves the evidence has not changed since it was anchored,
   not that it is genuine. *Scenario:* an organization stages a delivery photo or fabricates a
   receipt before uploading it; everything verifies. Only the verifiers' and auditor's review, and a
   dispute, can catch it.
8. **The backend operator is trusted for confidentiality** (not for integrity, which is checked
   onchain). *Scenario:* whoever runs the backend holds `EVIDENCE_ENCRYPTION_KEY`, from which every
   per-claim key is derived, and can decrypt every private file. Its view of roles also lags the
   chain by the indexer's confirmation margin (5 blocks by default) plus the polling interval, so a
   just-revoked auditor keeps download access until the revocation is indexed.
9. **Only images are sanitized.** JPEG, PNG and WebP are re-encoded without metadata; every other
   type is stored as uploaded. *Scenario:* a PDF or office document whose properties carry an
   author name or a location is kept with that metadata; it stays encrypted, but reaches every
   authorized reviewer and, if the organization marks the file public, anyone.
10. **Notes are stored as fingerprints only.** Justifications, proof requests and counter-evidence
    are recorded as `keccak256` of the note text; the prototype stores the text nowhere. *Scenario:*
    an auditor requests proof with a detailed note; the organization sees only a hash onchain and has
    to learn the request by another channel. A short, guessable note ("approved") can also be
    confirmed from its hash, because the note hash is not salted.
11. **Bundles are sealed by upload order, not by anchoring.** Bundle n is closed to new files only
    when bundle n+1 is started. *Scenario:* after anchoring root 0, the organization uploads one more
    file into bundle 0; the backend's root for bundle 0 changes and no longer equals
    `evidenceRoots[0]`, so the served manifest is rejected by the page ("File list altered") and that
    file is not covered by the onchain root.
12. **Private salted files cannot be checked by the public, and the app has no reviewer view.** A
    private entry never publishes its salt, so a visitor cannot match a private salted file, and a
    whole-bundle check fails for any bundle that holds one. Reviewers can download and re-hash private
    files only through the API (`GET /files/{id}` with a session; the salt is in their view of
    `GET /claims/{id}`): the app has no screen for it, and manifests served by the API carry no
    download links.
13. **Operational constraints.** Each organization needs at least two internal verifiers; a revoked
    participant needs a new wallet (identity is permanent by design); the backend session cookie
    works same-site only (`localhost` for page and API), so a cross-site deployment would need
    `SameSite=None; Secure` cookies; the indexer has no reorg rollback beyond its confirmation margin
    (logs flagged `removed` are skipped); without the API the dashboard lists no claims (paste an ID)
    and the page cannot check the claim text.
14. **Validation gaps.** The role screens were checked against real contracts on anvil (automated
    test and a browser run with a scripted test wallet), not with MetaMask and not on Arbitrum
    Sepolia; the Sepolia demo was executed by `DemoLifecycle.s.sol`, and its claim anchors a stand-in
    `metadataHash` with no backend record, so its page says there is nothing to check.

**Next steps**, in order of value (the first is the single most useful):

1. Decentralized dispute resolution with Kleros (designed below), removing the Authority as judge.
2. Store the notes behind justification, proof-request and counter-evidence fingerprints in the
   evidence service (salted), so the role screens and the public page can show them and prove they
   match.
3. Bind claim IDs to the anchoring organization onchain, and seal backend bundles when the indexer
   sees their root anchored.
4. A reviewer view in the app: list, download and re-hash private files (with their salts) for the
   organization's verifiers and the assigned auditor; a per-file visibility switch.
5. Let the Authority close a claim stuck by an organization's revocation and refund or forfeit its
   deposit.
6. Verifiable credentials for accreditation, then beneficiary confirmation of receipt (Delivery &
   Impact) and the donor funding escrow released on `Verified`, both designed in
   [ARCHITECTURE.md](ARCHITECTURE.md#components).

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
| Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` spec-driven workflow | Specifications, architecture and plan from the team's decisions; adversarial and logic reviews of the verification flow (source of the P8 fixes and the P9 incentives); implementation of contracts, backend, indexer, frontend and tests, partly through delegated sub-agents | Every design decision was taken by the team through explicit questions. All test suites were re-run independently after each delegated task; contract tests were mutation-checked (removing a security rule must break them) and reach 100% coverage; the public page was verified against the live Arbitrum Sepolia deployment in a browser. |
| Claude Code (Claude Opus 5.5), delegated sub-agent | P5.3 role screens: role detection, transaction flow, per-role forms, withdraw / settle, their tests and the anvil end-to-end test; P5.5 layout restyle (layout only, design tokens unchanged) | All frontend checks re-run (tests, typecheck, lint, build); the calls were executed against real contracts on anvil and the organization and verifier flows clicked through in a browser against anvil with a scripted test wallet; contracts untouched. |
| Claude Code (Claude Opus 5.5) | Documentation: RUNBOOK, this submission, ARCHITECTURE, READMEs; the fresh-clone dry run, the secret scan, and a final review of these documents against the code | The RUNBOOK was executed step by step from a fresh clone and corrected where a step was unclear; every number quoted here comes from a re-run on 2026-09-25 and every link was generated from the deployment file; the team reviewed and edited all documents. |
| Claude Code, web research | The Kleros arbitration design (section 4) | Sources linked; items we could not confirm are marked *Not verified*. |

> **TODO (team):** add any other AI tool a teammate used (for example an editor assistant) and how its output was checked; only the team knows this.

We confirm that the team can explain and technically defend the submitted work.
