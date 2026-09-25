# Project Submission


## 1. Project snapshot

| | |
| --- | --- |
| **Project name** | Proof of Aid — Team 05 |
| **Team ID & members** | team-05 · Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez |
| **System vision** | Anyone, without special access, can check that an aid claim is backed by unaltered evidence reviewed by independent, accredited verifiers, without seeing beneficiaries' personal data. |
| **Implementation focus** | **Trust, Evidence & Privacy:** trusting aid claims whose evidence cannot be published, through encrypted offchain evidence anchored onchain by Merkle root and a contract-enforced two-stage verification. |
| **What we built** | Two smart contracts on Arbitrum Sepolia that enforce accreditation, evidence anchoring, two-stage verification with proof requests, disputes and a per-claim ETH escrow; a Python backend that strips image metadata, salts, hashes and encrypts evidence, serves privacy-safe views and indexes the chain; and a React app where anyone re-checks evidence against the chain in their own browser and each accredited role signs its actions with its wallet. |
| **Code & run instructions** | [code/](../code/) ([developer guide](../code/README.md)) · [Setup and demo](RUNBOOK.md) |
| **Complete system design** | [ARCHITECTURE.md](ARCHITECTURE.md) |

**Summary.** Take the case walked through in
[ARCHITECTURE.md → The case](ARCHITECTURE.md#the-case-500-food-kits-after-the-valencia-floods): a
foundation says it delivered 500 food kits after the Valencia floods, but its strongest evidence
(delivery lists, photos of families) cannot be published. Proof of Aid keeps that evidence offchain,
cleaned of metadata, salted, fingerprinted and encrypted, and anchors only its Merkle root onchain.
Two contracts on Arbitrum Sepolia then enforce who may confirm it, from an internal verifier to an
independently accredited auditor, with bonded disputes and deposits that make fraud cost money, and
anyone can re-check the claim in their own browser against the chain. Full summary:
[Appendix → A.1 Project summary](#a1-project-summary).

## 2. Implemented contribution

### Problem and approach

We focus on **Trust, Evidence & Privacy**: how a donor can trust a claim such as the foundation's
500 food kits when the evidence that proves it contains beneficiaries' personal data. We separate
*what is proven* (the evidence is unchanged since it was anchored, who approved it and when, whether
it was disputed) from *what is shown* (fingerprints, roots, wallet addresses, status). The
contribution covers the *Verification* step and feeds *Transparent history*; donor funding and
beneficiary confirmation are designed but not built. Scope statement, rationale and fit in the full
flow: [Appendix → A.2 Problem and approach](#a2-problem-and-approach).

### What works and how

Two contracts enforce accreditation, evidence anchoring, the two-stage verification with proof
requests, disputes and a per-claim ETH escrow. A FastAPI backend cleans, salts, fingerprints and
encrypts every file, serves privacy-safe views and indexes the chain; a React app lets each role sign
its own step and lets anyone re-check evidence in the browser. In the case, that is the foundation
anchoring its evidence, Laura confirming checkpoint 1, AuditAid Iberia approving and a donor matching
the published invoice against the chain. The nine mechanisms, each linked to its ARCHITECTURE
section: [Appendix → A.3 What works and how](#a3-what-works-and-how).

### End-to-end flow

Accreditation, claim record, evidence upload, anchoring with the organization's deposit,
checkpoint 1, auditor assignment, an optional proof loop, final approval with the auditor's deposit,
an optional bonded dispute within 60 days, settlement and withdrawal, and public verification. The
Arbitrum Sepolia demo was executed by a script from accreditation to a dismissed dispute; the whole
flow, including settlement, runs from the role screens on local anvil. Details:
[Appendix → A.4 End-to-end flow](#a4-end-to-end-flow).

### Implementation boundary

**Implemented:** both contracts with deposits (live on Arbitrum Sepolia), the privacy pipeline for
images and PDFs with role-based access, evidence bundles and manifests, the public verification
page, the indexer and the role screens for every participant, including the reviewer view and
salted notes. **Simulated or mocked:** participants' real-world identity, file storage (a local
encrypted folder), bundle sealing by upload order, and the demo evidence and demo claim text.
**Designed only:** the donor funding escrow, beneficiary confirmation and Kleros arbitration; KYC,
mainnet deployment and a contract audit are out of scope. The full table with the four category
definitions: [Appendix → A.5 Implementation boundary](#a5-implementation-boundary).

### Effort split

Percentages describe implementation effort, must total **100%**, and have no ideal distribution.

Current estimate: UX 30%, Real-world connection 30%, Blockchain 40%. The work behind each share:
[Appendix → A.6 Effort split](#a6-effort-split).

### Security fixes from the logic review

A logic review of the verification flow on 2026-09-24 produced four fixes: revoked organizations
can no longer reach `Verified` (P8.1), every file is fingerprinted with a salt (P8.2), the claim text
is checked against the chain (P8.4), and deposits make fraud cost money (P9). Three privacy follow-ups
on 2026-09-25 closed further gaps without a contract change: PDF metadata stripping (P10.1), a
reviewer view of private files (P10.2) and salted, stored notes (P10.3). Each fix with its commits
and tests: [Appendix → A.7 Security fixes](#a7-security-fixes-from-the-logic-review).

## 3. Demo and validation

The demo proves that a claim which went through the full two-stage verification and
a bonded, dismissed dispute on Arbitrum Sepolia can be checked by anyone in a browser: a genuine
evidence file matches the root recorded onchain, a one-character change is detected, and no private
file name or content is exposed. It runs the onchain steps of the Valencia case, up to a dismissed
dispute, on made-up receipts, with a single internal verifier and no proof round.
Reproduce it with [RUNBOOK.md](RUNBOOK.md) (paths A–D and the 10-step demo table). Contract
addresses, the demo transactions and the test results (contracts 168 passed with 100% coverage,
shared 34, backend 128, frontend 512 passed and 8 skipped) are in
[Appendix → A.8 Demo and validation](#a8-demo-and-validation).

### Mock demonstration

Short screen recordings of the web app, one per role, following the Valencia case with the demo
wallets on local anvil ([RUNBOOK path D](RUNBOOK.md#d-role-screens-sign-each-roles-actions-from-the-browser)).
The videos are not recorded yet. Commit each one under the suggested path, or, on GitHub, open this
file in the web editor and drag the video into it to get an embeddable URL.

**1. Public visitor (verify a file).** A donor opens the 500-kit claim page with no wallet, drops the
published supplier invoice into **Verify it yourself** and gets **Match**, then drops a copy with one
changed character and gets **No match**.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/public-visitor.mp4`.

**2. Organization.** The foundation signs in with its wallet, records the 500-kit claim with its
evidence files and anchors it, paying the anchor deposit.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/organization.mp4`.

**3. Internal verifier.** Laura checks a downloaded private file in *Evidence files (authorized)*
(**Match**) and approves checkpoint 1 with **Approve evidence**. The four-eyes refusal is shown on
a second claim with two verifiers: Laura is refused **Accept proof** there because she did
checkpoint 1, and the other verifier accepts it.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/internal-verifier.mp4`.

**4. Auditor.** AuditAid Iberia reviews the evidence, then approves the claim and locks its deposit.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/auditor.mp4`.

**5. Accreditation Authority.** The Oversight Authority accredits AuditAid Iberia with **Accredit
auditor**, assigns it to the claim with **Assign auditor**, and later resolves the 480-kit dispute
with **Uphold dispute** or **Dismiss dispute**.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/accreditation-authority.mp4`.

**6. Registry Admin.** The platform operator registers the foundation's wallet with **Register
organization** and Laura's wallet with **Register internal verifier**.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/registry-admin.mp4`.

**7. Withdraw / Settle.** After the 60-day window (anvil's clock moved forward), any wallet settles
the claim with **Settle deposits**, and the foundation and AuditAid Iberia collect their credits with
**Withdraw**.

> **TODO (team):** add video link. Suggested file: `docs/evidence/videos/withdraw-settle.mp4`.

## 4. Limitations and next step

Integrity is not truth: the chain proves that the foundation's files have not changed since they
were anchored, not that 500 kits were really delivered; that still rests on Laura, AuditAid
Iberia and anyone who disputes. The main trust assumptions are a single Accreditation Authority (it
assigns auditors and judges disputes), one auditor per claim, wallets that do not prove distinct
people, and a backend operator trusted for confidentiality; claims recorded before the salting
fixes, including the Sepolia demo claim, keep unsalted fingerprints and notes. The single most
useful next step is decentralized dispute resolution with Kleros on Arbitrum, which removes the
Authority as judge. All 14 limitations with their scenarios, the ordered next steps and the Kleros
design: [Appendix → A.9 Limitations and next step](#a9-limitations-and-next-step).

## 5. AI usage

We used Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` spec-driven workflow for
specifications, reviews, implementation, tests and documentation, partly through delegated
sub-agents, and for web research on the Kleros design. Every design decision was taken by the team;
all test suites were re-run independently after each delegated task, the contract tests were
mutation-checked, and the public page was checked in a browser against the live deployment. Tool by
tool: [Appendix → A.10 AI usage](#a10-ai-usage).

We confirm that the team can explain and technically defend the submitted work.

## Technical appendix

The full text behind each brief section above, moved here unchanged.

### A.1 Project summary

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

### A.2 Problem and approach

> Within our complete Proof of Aid design, we focus on **Trust, Evidence & Privacy**, addressing **how a third party can trust an aid claim whose evidence contains beneficiaries' personal data and therefore cannot be published** through **offchain encrypted evidence whose Merkle root is anchored onchain, a contract-enforced two-stage verification (internal verifier → independent, officially accredited auditor with proof requests), accredited disputes, and a public page that re-verifies evidence integrity without revealing personal data**.

**Why it matters.** The strongest evidence of delivery is exactly what cannot be shown to donors.
Today donors either trust the organization blindly or the organization leaks personal data. We
separate *what is proven* (the evidence is unchanged since it was anchored, who approved it and when,
whether it was disputed) from *what is shown* (nothing personal: fingerprints, roots, wallet
addresses, status).

**The area's questions** (who verifies claims, how evidence is checked, how it is disputed, how it
is kept private) are answered in
[ARCHITECTURE.md → Implementation focus](ARCHITECTURE.md#implementation-focus). In short: an
internal verifier and then an independently accredited, assigned auditor verify; salted file
fingerprints are checked against a Merkle root anchored onchain; accredited third parties dispute
with a bond within 60 days; files stay offchain and encrypted, and outsiders see private files as a
fingerprint only.

**Where it fits.** It covers the *Verification* step of
`Need → Verification → Funding → Delivery → Outcome → Transparent history`, and feeds *Transparent
history* directly from contract events. *Funding* (donations escrowed and released on `Verified`) and
*Delivery & Impact* (beneficiary confirmation) are designed in [ARCHITECTURE.md](ARCHITECTURE.md#components)
but not implemented. The P9 escrow is not donor funding: it holds the participants' own deposits.

### A.3 What works and how

Each item is a short summary; the linked ARCHITECTURE section has the full mechanics.

1. **Accreditation (`ParticipantRegistry`).** The Registry Admin registers organizations and their
   internal verifiers; a separate Accreditation Authority accredits auditors. A wallet holds one
   participant role **for life**, which closes an attack found while building (a revoked verifier
   re-accredited as auditor signing both checkpoints of the same claim). See
   [ARCHITECTURE.md → Roles and permissions](ARCHITECTURE.md#roles-and-permissions).
2. **Verification state machine (`ClaimRegistry`).** `Anchored → InternallyVerified →
   (ProofRequested ⇄ ProofSubmitted) → Verified | Rejected`, then `Verified → Disputed → Verified |
   Rejected`; every other call reverts, and the contract enforces separation of duties (submitter ≠
   checkpoint-1 verifier ≠ proof confirmer) and that only the Authority-assigned auditor can act.
   Guards, events and ETH per function:
   [ARCHITECTURE.md → Claim lifecycle](ARCHITECTURE.md#claim-lifecycle-enforced-onchain).
3. **Evidence pipeline (FastAPI backend).** After a wallet-signature login, uploads are stripped of
   image and PDF metadata, committed as SHA-256(random salt ‖ sanitized bytes), encrypted with AES-256-GCM
   under a per-claim key and grouped into bundles whose Merkle root is the root the organization
   anchors. Step by step: [ARCHITECTURE.md → Evidence pipeline](ARCHITECTURE.md#evidence-pipeline).
4. **Access control follows the chain.** With `ROLE_SOURCE=chain` only the organization, its active
   internal verifiers and the auditor assigned onchain can decrypt a claim's private files; denied
   reads answer 404, like a missing file. Those reviewers open, download and re-check private files
   on the claim page (*Evidence files (authorized)*): each downloaded file is re-hashed with its salt
   in the browser and proven against the onchain root. Access matrix:
   [ARCHITECTURE.md → Backend API](ARCHITECTURE.md#backend-api); view:
   [→ Reviewer view](ARCHITECTURE.md#reviewer-view-of-private-files-p102).
5. **Public verification (React, no wallet, no login).** The claim page reads status, roots, escrow
   and history **directly from `ClaimRegistry`** and checks a dropped file or a whole bundle against
   the onchain root in the browser; files never leave it, and the claim's title and description are
   shown only when their hash matches `metadataHash`. Algorithm:
   [ARCHITECTURE.md → Public verification algorithm](ARCHITECTURE.md#public-verification-algorithm).
6. **Role screens (React + wagmi/viem, MetaMask).** The workspace page (`/workspace`) lists what needs the wallet's action, reads the connected wallet's role
   and offers only the actions `ClaimRegistry` would accept; every call is simulated first (reverts
   explained in plain English), then signed, with payable amounts read from the contract. Notes
   (justifications, proof requests, counter-evidence, dispute decisions) are anchored as salted
   fingerprints and, with the backend, stored encrypted for the claim's reviewers. See
   [ARCHITECTURE.md → Components](ARCHITECTURE.md#components) and
   [→ Note recipe](ARCHITECTURE.md#note-recipe-p103-codesharedpoa_sharednotespy).
7. **Fraud costs money (P9).** `ClaimRegistry` escrows ETH per claim: the organization deposits a
   penalty plus the auditor's reward when anchoring, the auditor deposits when approving and a
   disputant posts a bond; payouts are credited and pulled with `withdraw()`. Amounts and who gets
   what in each outcome:
   [ARCHITECTURE.md → Incentives](ARCHITECTURE.md#incentives-deposits-rewards-and-penalties-p9).
8. **Chain indexer (optional speed-up).** A web3.py poller copies both registries' events into
   PostgreSQL, feeds the backend's access rules and serves a public timeline API; the page uses it
   only when it provably matches the contract. See [ARCHITECTURE.md → Indexer](ARCHITECTURE.md#indexer).
9. **One recipe, three implementations.** The Merkle, metadata and note recipes are implemented in
   Python, TypeScript and (Merkle) Solidity tests, and all pass the same committed vectors byte for
   byte. See
   [ARCHITECTURE.md → Merkle recipe](ARCHITECTURE.md#merkle-recipe-frozen-in-p1-codesharedpoa_sharedmerklepy)
   and [→ `metadataHash` recipe](ARCHITECTURE.md#metadatahash-recipe-p84-codesharedpoa_sharedmetadatapy).

### A.4 End-to-end flow

Accreditation → wallet login and claim record → evidence upload (bundle 0) → `anchorClaim` with
the organization's deposit → checkpoint 1 (`attestInternal`) → auditor assignment → optional proof
loop (`requestProof`, `submitProof`, `confirmProof` by a second verifier) → `attestFinal` with the
auditor's deposit → optional dispute within 60 days (`openDispute`, `resolveDispute`) → `settle` and
`withdraw` → public verification. The full flow is in
[ARCHITECTURE.md → End-to-end flow](ARCHITECTURE.md#end-to-end-flow); each function's caller,
status change and ETH movement in
[ARCHITECTURE.md → Claim lifecycle](ARCHITECTURE.md#claim-lifecycle-enforced-onchain).

The Arbitrum Sepolia demo, executed by `DemoLifecycle.s.sol`, runs from accreditation to the
dismissed dispute (transactions in section 3) with a single verifier and no proof round. It anchored the demo claim directly, so the wallet
login, the claim record and the backend uploads did not happen on it: its root is the Merkle root
of the committed demo files. The whole flow, including settlement and withdrawal, runs from the role
screens on local anvil ([RUNBOOK path D](RUNBOOK.md#d-role-screens-sign-each-roles-actions-from-the-browser)).

### A.5 Implementation boundary

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
| Privacy pipeline (image and PDF metadata strip, salted fingerprints, encryption, role-based access) | Implemented | FastAPI evidence service; private files exposed to outsiders as fingerprints only; JPEG/PNG/WebP are re-encoded and PDFs rewritten without their metadata (an encrypted or unreadable PDF is rejected); other file types are stored as uploaded |
| Evidence bundles and manifests (v1 unsalted, v2 salted) | Implemented | One root per bundle, equal to `evidenceRoots[i]`; `GET /claims/{id}/bundles/{n}/manifest` in the shared JSON Schema |
| Public verification page | Implemented | Reads the deployed contract directly; single-file (via a manifest proven against the chain) and whole-bundle checks in the browser; title and description shown only when their hash matches the onchain `metadataHash` |
| Event indexer and public timeline API | Implemented | web3.py poller into PostgreSQL (idempotent, restart-safe, confirmation margin, range halving); `GET /public/claims`, `/public/claims/{id}/timeline`, `/public/indexer/status` |
| Evidence access follows the chain | Implemented | `ROLE_SOURCE=chain`: onchain accreditation, revocation and auditor assignment change decryption rights once indexed. The hand-seeded `participants` table remains a development fallback (`ROLE_SOURCE=local`) |
| Role screens (sign actions from the UI) | Implemented | Registry Admin, Accreditation Authority, organization (record a claim with its evidence, answer proof requests), internal verifier, auditor, anyone (settle, withdraw). Checked with Vitest (mocked wallet), an anvil end-to-end test with the same calls and a browser run with a scripted test wallet, **not** with MetaMask itself |
| Reviewing private evidence in the UI | Implemented | *Evidence files (authorized)* on the claim page: wallet sign-in, then every file of the claim for the organization, its verifiers and the assigned auditor, with **Download** (`GET /files/{id}`, decrypted by the backend) and **Check this file** (salted re-hash proven against the onchain root). No per-file visibility switch in the UI (`PATCH /files/{id}` exists; the upload form sets one public/private flag per batch) |
| Notes behind justification, proof-request, counter-evidence and resolution hashes | Implemented (with the backend) | Anchored as keccak256(random salt ‖ note); with the backend, text and salt are stored encrypted before the transaction and shown to the claim's reviewers and the note's author next to the history event, checked in the browser. Without the backend the note is kept nowhere (the author is shown note and salt to copy). Notes anchored before P10.3 stay unsalted |
| Bundle sealing by onchain anchoring | Simulated | The backend seals bundle n when bundle n+1 is started (upload order), not when root n is anchored onchain |
| Real-world identity of participants | Simulated | Accreditation is a manual admin action on test wallets |
| File storage | Simulated | Local encrypted folder (`STORAGE_DIR`) instead of S3/MinIO |
| Demo evidence and demo claim text | Mocked | Made-up receipts, invoice, delivery summary and stock count; no real personal data. The Sepolia demo claim anchors a stand-in `metadataHash` and has no backend record. EXIF/GPS stripping is shown by a backend test on a synthetic JPEG |
| Funding escrow of donations released on `Verified` | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) (`FundingEscrow`) |
| Beneficiary confirmation of receipt | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| Decentralized arbitration (Kleros) | Designed only | Section 4, *Next step: Kleros arbitration* |
| KYC / verifiable credentials, mainnet deployment, contract audit | Out of scope | — |

### A.6 Effort split

| Dimension | Effort | Work implemented |
| --- | ---: | --- |
| UX | 30% | Public verification page (timeline, verification summary, deposits card, in-browser file and bundle checks, claim text check), role screens for every participant (MetaMask signing, simulation before signing, plain-language contract errors, wrong-network switch), design system and layout (light and dark, 375 px) |
| Real-world connection | 30% | Evidence privacy pipeline (image metadata strip, salted fingerprints of cleaned files, per-claim encryption, access control), wallet login, bundles and manifests, chain indexer and chain-driven access, accreditation of real-world entities |
| Blockchain | 40% | Accreditation registry, claim state machine, disputes, escrow with rewards and penalties, events, 100%-coverage test suite with fuzzing and invariants, deployment and full lifecycle on Arbitrum Sepolia |

### A.7 Security fixes from the logic review

A logic review of the verification flow on 2026-09-24 produced four fixes, each with its own tests.

| Fix | Problem | Fix (details) | Evidence |
| --- | --- | --- | --- |
| **P8.1** Revoked organization | A revoked organization's claim could still end `Verified`. | Approve, request proof and dismiss revert `NotActiveOrganization`; reject, dispute and uphold stay allowed ([ARCHITECTURE.md → Claim lifecycle](ARCHITECTURE.md#claim-lifecycle-enforced-onchain)). | Commit `8dfae6b`; tests in `code/contracts/test/ClaimRegistry.t.sol` and the invariant `invariant_RevokedOrganizationNeverBecomesVerified`. |
| **P8.2** Salted commitments | Anyone who could guess a private file could confirm it from its public fingerprint. | Every upload is committed as SHA-256(salt ‖ file); only public files publish their salt ([ARCHITECTURE.md → Evidence pipeline](ARCHITECTURE.md#evidence-pipeline)). | Commits `e73f0b8`, `2b0e510`, `3dc40c2`, `dfc3b02`; `code/backend/tests/test_salted_commitments.py`, `code/frontend/src/evidence/verification.test.ts`. |
| **P8.4** Metadata check | A server could show a different title or description than the one anchored. | The public page recomputes `metadataHash` and shows the text only on a match ([recipe](ARCHITECTURE.md#metadatahash-recipe-p84-codesharedpoa_sharedmetadatapy)). | Commit `17171ac`; `code/shared/tests/test_metadata.py`, `code/backend/tests/test_metadata.py`, `code/frontend/src/components/ClaimMetadata.test.tsx`. |
| **P9** Incentives | Fraud and repeated disputes cost nothing. | Per-claim ETH escrow, bonded disputes within a 60-day window, pull payments ([ARCHITECTURE.md → Incentives](ARCHITECTURE.md#incentives-deposits-rewards-and-penalties-p9)). | Commits `7c0d842`, `691717c`, `7fdfb5b`, `e4180a9`, redeploy `b780756`; `code/contracts/test/ClaimRegistryIncentives.t.sol` (37) and the escrow invariants. |

Two further findings were kept as documented limitations (section 4): identity/Sybil of attesters
and claim-ID squatting.

**Privacy follow-ups (P10, 2026-09-25).** Three limitations of the first submission draft were
closed without any contract change (no redeploy):

| Fix | Problem | Fix (details) | Evidence |
| --- | --- | --- | --- |
| **P10.1** PDF metadata | PDFs were stored as uploaded, with author, creator tool, dates and XMP metadata. | PDFs (detected by `%PDF-`, not by name) are rewritten with pypdf without `/Info`, XMP `/Metadata`, page `/PieceInfo` and unreferenced objects (older revisions); the salted commitment is computed on the cleaned bytes. An encrypted or unparseable PDF is **rejected with 422**, never stored with its metadata ([ARCHITECTURE.md → Upload](ARCHITECTURE.md#upload-post-claimsidevidence)). | Commit `31e1827`; `code/backend/tests/test_pdf_sanitize.py` (9: generated PDF with author/creator/XMP, incremental revision, header after junk, non-PDF untouched, malformed and encrypted PDFs, commitment on cleaned bytes, API upload/download and 422 with nothing stored). |
| **P10.2** Reviewer view | Verifiers and auditors could open private files only through the API. | *Evidence files (authorized)* on the claim page: wallet sign-in, the backend's existing access matrix (now explicit as `viewer_access` in `GET /claims/{id}`), **Download** and **Check this file** against the salted commitment and the onchain root; states for demo, no API, no wallet, signed out, no access, no record ([ARCHITECTURE.md → Reviewer view](ARCHITECTURE.md#reviewer-view-of-private-files-p102)). | Commit `ca48bdb`; `code/frontend/src/components/AuthorizedEvidence.test.tsx`, `code/frontend/src/evidence/authorizedCheck.test.ts`, `code/frontend/src/data/evidenceApi.test.ts`, `code/backend/tests/test_privacy.py`. |
| **P10.3** Salted, stored notes | Note fingerprints were `keccak256(text)`: a short note ("approved") could be confirmed by guessing, and the text was stored nowhere. | `noteHash = keccak256(salt ‖ utf8(text))` with a random 32-byte salt from the browser; with the backend, `POST /claims/{id}/notes` checks the hash and stores text and salt sealed with the claim key before the transaction (migration 0005); reviewers and each author read them back, verified against the history event ([ARCHITECTURE.md → Note recipe](ARCHITECTURE.md#note-recipe-p103-codesharedpoa_sharednotespy)). | Commit `811d822` (part of the change landed in merge `4d2eaaf`); `code/shared/note-vectors.json` with `code/shared/tests/test_notes.py` and `code/frontend/src/utils/noteHash.test.ts`; `code/backend/tests/test_notes.py`; `code/frontend/src/components/wallet/NoteFlow.test.tsx`, `code/frontend/src/evidence/noteCheck.test.ts`. |

### A.8 Demo and validation

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
| Backend | `uv run --project backend pytest -c backend/pyproject.toml backend/tests` | **128 passed**, 0 skipped (includes the anvil end-to-end indexer test: it starts anvil on chain ID 31338, runs `Deploy` + `DemoLifecycle`, indexes twice); re-run after P10 |
| Shared recipe | `cd shared && uv run pytest` | **34 passed** (19 Merkle incl. salted, 11 metadata, 4 notes); re-run after P10 |
| Frontend | `cd frontend && pnpm test` | **511 passed, 8 skipped** (52 files passed, 1 skipped: the opt-in anvil end-to-end file); re-run after P10 |
| Frontend static checks | `pnpm typecheck`, `pnpm lint`, `pnpm build` | typecheck and oxlint silent; build OK (JS gzip: 69.7 kB app + 95.1 kB React + 105.8 kB web3) |
| Migration 0005 | `alembic upgrade head`, `downgrade -1`, `upgrade head` on a scratch SQLite file; `alembic check` | 0001–0005 applied, 0005 reverted and re-applied; no drift between models and migrations |
| Recipes and ABIs are in sync | `uv run python -m poa_shared.gen_vectors`, `… gen_metadata_vectors`, `… gen_note_vectors`, `bash script/export-abi.sh` | regenerated files identical to the committed ones (`git status` clean) |

What the suites cover, in short: every valid and invalid transition (the full action × status
matrix), separation of duties, revoked wallets and organizations, role-admin isolation, deposits and
payouts, the window boundary, reentrancy, events and stored state (contracts); login and replay,
claim validation, EXIF/GPS stripping on a synthetic JPEG (`test_sanitize_strips_exif_and_gps`), PDF
metadata stripping and rejection of encrypted or broken PDFs (`test_pdf_sanitize.py`), hash of
sanitized bytes, sealed notes and who may read them (`test_notes.py`), encryption round trip and tampering, the access matrix in local and chain mode,
privacy of public views, bundle sealing, manifests, CORS, indexer idempotency, restart,
confirmations and range halving, and the public API (backend); the Merkle and metadata recipes
against every shared vector, manifest parsing and verification, the claim page, the Deposits card,
role detection, the action planner per role and status, payable amounts, the transaction lifecycle,
decoded reverts, the wrong-network state, the reviewer view (sign-in, access states, download, salted
match and mismatch) and salted notes (stored before the transaction, or handed to the author)
(frontend). Removing the four-eyes check or the
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
- **Secret scan (P7.2):** no `.env` file is tracked or was ever committed (only the three
  `.env.example` templates and the public-address `code/frontend/.env.sepolia`); the only private key
  and mnemonic in the repository are Foundry's public anvil development ones, in the local-demo
  instructions and tests.

### A.9 Limitations and next step

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
9. **Only images and PDFs are sanitized.** JPEG, PNG and WebP are re-encoded without metadata, and
   since P10.1 PDFs are rewritten without their document information, XMP metadata and earlier
   revisions; every other type is stored as uploaded. *Scenario:* an office document (DOCX, XLSX)
   whose properties carry an author name or a location is kept with that metadata; it stays
   encrypted, but reaches every authorized reviewer and, if the organization marks the file public,
   anyone. An encrypted or damaged PDF cannot be cleaned, so it is refused (422) and must be
   re-exported without a password. Text inside a document (a name typed on a page) and metadata
   embedded inside a PDF's images or attachments are not removed.
10. **Notes depend on the backend, and old notes are unsalted.** Since P10.3 notes are anchored as
    keccak256(salt ‖ text) and, when the backend is used, stored encrypted for the claim's reviewers
    and the note's author. *Scenario:* an action signed without the backend (or on a claim the
    backend does not know, like the Sepolia demo claim) keeps the note only if its author copies it;
    and a note anchored before P10.3, including every note of the Sepolia demo, is still
    `keccak256(text)`, so a short one ("approved") can be confirmed by guessing. The backend operator
    can read every stored note (limitation 8), and any signed-in wallet can store a note on a claim
    the backend knows: reviewers see it listed as "not found in the history" unless its fingerprint
    was anchored.
11. **Bundles are sealed by upload order, not by anchoring.** Bundle n is closed to new files only
    when bundle n+1 is started. *Scenario:* after anchoring root 0, the organization uploads one more
    file into bundle 0; the backend's root for bundle 0 changes and no longer equals
    `evidenceRoots[0]`, so the served manifest is rejected by the page ("File list altered") and that
    file is not covered by the onchain root.
12. **Private salted files cannot be checked by the public.** A private entry never publishes its
    salt, so a visitor cannot match a private salted file, and a whole-bundle check fails for any
    bundle that holds one. Since P10.2 the claim's reviewers download and check private files on the
    claim page; manifests served by the API still carry no download links, and the app has no
    per-file visibility switch.
13. **Operational constraints.** Each organization needs at least one active internal verifier; a revoked
    participant needs a new wallet (identity is permanent by design); the backend session cookie
    works same-site only (`localhost` for page and API), so a cross-site deployment would need
    `SameSite=None; Secure` cookies; the indexer has no reorg rollback beyond its confirmation margin
    (logs flagged `removed` are skipped); without the API the workspace lists no claims (paste an ID)
    and the page cannot check the claim text.
14. **Validation gaps.** The role screens were checked against real contracts on anvil (automated
    test and a browser run with a scripted test wallet), not with MetaMask and not on Arbitrum
    Sepolia; the Sepolia demo was executed by `DemoLifecycle.s.sol`, and its claim anchors a stand-in
    `metadataHash` with no backend record, so its page says there is nothing to check.

**Next steps**, in order of value (the first is the single most useful):

1. Decentralized dispute resolution with Kleros (designed below), removing the Authority as judge.
2. Bind claim IDs to the anchoring organization onchain, and seal backend bundles when the indexer
   sees their root anchored.
3. Show a claim's notes where they are needed, not only in the reviewer view: the proof request on
   the organization's *Submit proof* form, and the notes with each role action; restrict who may
   store a note to the wallets that can anchor one; a per-file visibility switch.
4. Let the Authority close a claim stuck by an organization's revocation and refund or forfeit its
   deposit.
5. Metadata stripping for office documents (DOCX, XLSX) and for images embedded in PDFs.
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

### A.10 AI usage

| Tool | Used for / assisted work | How we reviewed or validated it |
| --- | --- | --- |
| Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` spec-driven workflow | Specifications, architecture and plan from the team's decisions; adversarial and logic reviews of the verification flow (source of the P8 fixes and the P9 incentives); implementation of contracts, backend, indexer, frontend and tests, partly through delegated sub-agents | Every design decision was taken by the team through explicit questions. All test suites were re-run independently after each delegated task; contract tests were mutation-checked (removing a security rule must break them) and reach 100% coverage; the public page was verified against the live Arbitrum Sepolia deployment in a browser. |
| Claude Code (Claude Opus 5.5), delegated sub-agent | P5.3 role screens: role detection, transaction flow, per-role forms, withdraw / settle, their tests and the anvil end-to-end test; P5.5 layout restyle (layout only, design tokens unchanged) | All frontend checks re-run (tests, typecheck, lint, build); the calls were executed against real contracts on anvil and the organization and verifier flows clicked through in a browser against anvil with a scripted test wallet; contracts untouched. |
| Claude Code (Claude Opus 5.5) | Documentation: RUNBOOK, this submission, ARCHITECTURE, READMEs; the fresh-clone dry run, the secret scan, and a final review of these documents against the code | The RUNBOOK was executed step by step from a fresh clone and corrected where a step was unclear; every number quoted here comes from a re-run on 2026-09-25 and every link was generated from the deployment file; the team reviewed and edited all documents. |
| Claude Code, web research | The Kleros arbitration design (section 4) | Sources linked; items we could not confirm are marked *Not verified*. |
