# 📋 Specifications: Proof of Aid — Team 05

> **Phase:** `/spec` (Specification)
> **Status:** Planned — `/build` in progress
> **Last Review:** 2026-09-24
> **Focus area:** Trust, Evidence & Privacy (future extension: Delivery & Impact)

---

## 🎯 1. Context and Goals

- **Problem:** Donors and the public cannot verify that an aid organization's claims ("we delivered X to Y") are backed by real, unaltered evidence reviewed by someone independent. Publishing the evidence itself is not an option, because it contains beneficiaries' personal data (faces, names, IDs, locations).
- **Goal (Success):** A third party with no special access can, for any claim, (1) verify that its evidence has not changed since it was submitted, (2) see that the organization's internal verifier confirmed it and that an officially accredited external auditor gave the final approval, and when, and (3) see any dispute and its outcome, all without seeing personal data. Demonstrated end to end on Arbitrum Sepolia.

## 👥 2. Users and Scenarios

- **User profiles:** Aid Organization, Internal Verifier, External Auditor, Accreditation Authority, Donor / Public Auditor, Registry Admin (see [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#vision-and-actors)).
- **Key scenarios:**
  - *Scenario A:* An organization uploads photos and a signed delivery list for a claim; the system anchors their Merkle root onchain from the organization's wallet.
  - *Scenario B:* The organization's internal verifier checks the evidence and approves it (`InternallyVerified`); an accredited external auditor then reviews it and gives the final approval (`Verified`).
  - *Scenario B2:* The external auditor finds the evidence insufficient and requests proof (`ProofRequested`); the organization anchors supplementary evidence (`ProofSubmitted`); a second internal verifier, different from the checkpoint-1 verifier, confirms it and the auditor resumes the review.
  - *Scenario C:* A donor opens the claim's public page, sees the timeline and attestations, and verifies the integrity of a public evidence file by recomputing its hash.
  - *Scenario D:* The internal verifier or the auditor finds that evidence was altered after anchoring (hash mismatch) and rejects it; the claim becomes `Rejected`.
  - *Scenario E:* An accredited participant disputes a verified claim with counter-evidence; the claim shows `Disputed` until resolved.

## ✨ 3. Main Features (Requirements)

- [ ] **F1. Participant accreditation:** The Registry Admin registers or revokes `ORGANIZATION` wallets and `INTERNAL_VERIFIER` wallets linked to an organization; the Accreditation Authority approves or revokes `AUDITOR` wallets (a separate role from the Registry Admin).
  *Acceptance:* each role can only be granted by its role admin (the Registry Admin cannot approve auditors); revoked wallets cannot anchor or attest; covered by Foundry tests.
- [ ] **F2. Claim creation:** An organization creates a claim with offchain metadata (title, description, location at region level only — never exact coordinates, to protect beneficiaries, date).
  *Acceptance:* validated at the API boundary; stored in PostgreSQL with a unique claim ID.
- [ ] **F3. Evidence upload with privacy protection:** An organization uploads evidence files, private by default; it can mark individual non-personal files (receipts, invoices, aggregate reports) as public. The backend strips EXIF/GPS metadata, encrypts files at rest, and computes a SHA-256 hash per file.
  *Acceptance:* stored files are not readable without the key; the hash is computed on the stored (sanitized) bytes; no personal data is written to logs.
- [ ] **F4. Evidence anchoring:** The organization's wallet anchors the claim ID, the evidence Merkle root and the metadata hash onchain.
  *Acceptance:* a `ClaimAnchored` event is emitted; only accredited organizations with at least 2 active internal verifiers can anchor; a root cannot be silently overwritten (amendments are new, linked anchors).
- [ ] **F5a. Internal verification (checkpoint 1):** An internal verifier of the submitting organization reviews the evidence, checks the hashes against the onchain root and signs `approve` or `reject` with a justification hash.
  *Acceptance:* only an `INTERNAL_VERIFIER` linked to the same organization can attest; the internal verifier's wallet must differ from the submitter's (Q7); `approve` → `InternallyVerified`, `reject` → `Rejected`.
- [ ] **F5b. External audit with proof requests (checkpoint 2):** The Accreditation Authority assigns an accredited auditor to an `InternallyVerified` claim, and can reassign it (e.g. if the auditor is revoked) before the final attestation. The assigned auditor reviews the private evidence and can open a proof request (hash of the request) or sign the final `approve` / `reject`. Supplementary proof anchored by the organization is confirmed by a second internal verifier before returning to the auditor.
  *Acceptance:* only the assigned `AUDITOR` can act, and only after checkpoint 1; a proof request moves the claim to `ProofRequested`; supplementary evidence moves it to `ProofSubmitted`; an `INTERNAL_VERIFIER` of the same organization, different from the checkpoint-1 verifier and the submitter, confirms it (→ `InternallyVerified`) or returns it (→ `ProofRequested`); `approve` → `Verified`, `reject` → `Rejected`; invalid transitions revert.
- [ ] **F6. Public verification:** A public page shows a claim's status, timeline (from indexed events) and attestations, and lets anyone verify a public file or the whole bundle against the onchain root.
  *Acceptance:* works without a wallet or login; private files are never exposed; the result shows match/mismatch.
- [ ] **F7. Disputes:** Any accredited participant (organization, internal verifier or auditor) opens a dispute on a `Verified` claim with a counter-evidence hash (at most one open dispute per claim); the Accreditation Authority resolves it (upheld → `Rejected`, dismissed → `Verified`).
  *Acceptance:* only accredited wallets can dispute and only the Accreditation Authority can resolve; status transitions are enforced onchain; the full history stays visible.

## 🏗️ 4. Technical Solution (Summary)

*Direct link to [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (source of truth).*

- **Approach:** Evidence stays offchain (encrypted); its Merkle root and verifier attestations go onchain in two contracts (`ParticipantRegistry`, `ClaimRegistry`) on Arbitrum Sepolia. A Python backend handles evidence, access control and event indexing; the web frontend signs with MetaMask through viem/wagmi.
- **Critical dependencies:** Arbitrum Sepolia RPC and faucet ETH; MetaMask; OpenZeppelin Contracts; PostgreSQL.
- **Skills and MCP opportunities:** None required for the prototype. Re-evaluate if external data sources are added as oracles.
- **Design system:** The project has a UI, so `dbv-specs-ops/docs/DESIGN.md` will be created now that the frontend framework (React + Vite) is decided.

### 4.1. Agent Readiness Checklist (Web Projects)

*Pending: Agent Readiness (Web) is TBD in `project.config.md`. Not planned until the team decides.*

## 🚫 5. Out of Scope

- [ ] Funding flows (donations, escrow, milestone release): designed in ARCHITECTURE, not implemented.
- [ ] Beneficiary confirmation of receipt (Delivery & Impact): future extension, only if time allows.
- [ ] Real-world identity verification (KYC) or verifiable credentials: accreditation is a manual admin action.
- [ ] Decentralized dispute arbitration: admin resolution only.
- [ ] Mainnet deployment and a smart contract audit.

## ⚠️ 6. Risks and Mitigation

- **Risk:** Hashing low-entropy personal data (names, ID numbers) makes it brute-forceable once published.
  - **Mitigation:** Never hash raw personal data onchain; hash only files and use salted commitments for structured data.
- **Risk:** The internal verifier rubber-stamps the organization's own claims (conflict of interest).
  - **Mitigation:** Internal approval never makes a claim `Verified` on its own; the final say belongs to the external auditor.
- **Risk:** An auditor colludes with the organization.
  - **Mitigation:** Auditors are approved and assigned by a separate Accreditation Authority (the organization cannot pick its auditor) and can be revoked; every attestation is public and attributable to the auditor's wallet.
- **Risk:** Photo metadata (GPS/EXIF) leaks beneficiaries' locations.
  - **Mitigation:** Strip metadata before hashing and storing, with a test.
- **Risk:** The backend DB is tampered with to fake a timeline.
  - **Mitigation:** The DB is only an index; the public page verifies status and roots directly against the contract.
- **Security and privacy risk (AI/data):** secrets leaked in the repo (private keys, RPC keys); hallucinated or typosquatted dependencies.
  - **Mitigation:** `.env` excluded by `.gitignore`; dependency audit in `/code-simplify`; testnet-only keys.

## ❓ 7. Open Questions

- [x] **Q1 (critical):** Who are the verifiers, and how many approvals? → **Resolved (2026-09-24):** two sequential checkpoints: an internal verified account of the organization (first check), then an external auditor approved by an official body, who can request proof and gives the final confirmation.
- [x] **Q2 (critical):** Disputes → **Resolved (2026-09-24):** any accredited participant can dispute a `Verified` claim; the Accreditation Authority resolves it. Supplementary proof after a proof request is confirmed by a second internal verifier of the organization.
- [x] **Q3:** Public vs private evidence → **Resolved (2026-09-24):** private by default; the organization can mark individual non-personal files as public; the public always sees hashes and the Merkle root.
- [x] **Q4:** Auditor assignment → **Resolved (2026-09-24):** the Accreditation Authority assigns one auditor per claim.
- [x] **Q7:** → **Resolved (2026-09-24):** yes to both, implied by the Authority's assignment/dispute duties and the four-eyes proof confirmation.
- [x] **Q5:** → **Resolved (2026-09-24):** React + Vite frontend; FastAPI backend.
- [x] **Q6:** → **Resolved (2026-09-24):** local encrypted Docker volume for the demo.

## 🧪 8. Evaluation Criteria and Evals (Non-Deterministic)

- Not applicable: the system has no AI/LLM components. Quality is proven with deterministic tests (Foundry for contracts, pytest for the backend) and a reproducible end-to-end demo (`docs/RUNBOOK.md`).

---
**AI instruction:** Do not move to the `/plan` phase until the critical "Open Questions" have been resolved or have a defined path to resolution.
