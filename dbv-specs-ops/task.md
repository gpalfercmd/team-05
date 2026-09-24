# Backlog - Proof of Aid — Team 05

## Context Snapshot
* **Goal**: Trust, Evidence & Privacy — offchain encrypted evidence, Merkle root anchored onchain, two-stage verification (internal verifier → Authority-assigned external auditor with proof requests; supplementary proof confirmed by a 2nd internal verifier), public verification, disputes by accredited participants resolved by the Accreditation Authority.
* **Current state** (Thu 24 Sep, evening): P0–P2 done (contracts live on Arbitrum Sepolia, `code/shared/deployments/arbitrum-sepolia.json`); P3 evidence backend done; P4 backend done (indexer, chain-driven access, public API — `80fc6aa`); P5.1/P5.2/P5.4 done (public page verifies evidence in the browser against the live contract). Open: P6 RUNBOOK (still the empty template), P4.4 frontend `ApiClaimSource`, P5.3 role screens, P7 final.
* **Concrete problem (README Start here §2)**: Trust, Evidence & Privacy — letting a third party trust an aid claim whose evidence cannot be published because it contains beneficiaries' personal data. Scope statement in `docs/ARCHITECTURE.md#implementation-focus`; reuse it verbatim in `SUBMISSION.md` (P0.2). Every task must serve this problem; Funding and Delivery & Impact stay designed-only.
* **Build order**: contracts → backend → frontend (option 1). `DESIGN.md` is written at the start of P5, not in `/spec` (logged in `memory.md`).
* **Structure rule**: all implementation lives under `code/` (README "Start here" §2), which overrides MASTER_PROMPT's "venv/pyproject/package.json at the project root": each toolchain root is inside `code/`.
* **Branching (updated 2026-09-24)**: Guillermo merged `develop` into `main` (`19b877f`) to keep one line of work; work now continues on `main`. Pushing stays a team decision; evaluation reads `main`, so every pushed commit on `main` is a candidate for the final SHA.
* **Deadlines**: Thursday checkpoint (today, time set by organizers) · **Final: Friday 25, 14:00**.
* **Plan for Friday 25 Sep (final deadline 14:00)**, in this order:
  1. **P6 RUNBOOK first** (`docs/RUNBOOK.md` is still the template): requirements, setup per layer (contracts / backend + Postgres + `alembic upgrade head` + indexer / frontend with pnpm), `.env` files, run + validate commands (`forge test`, `uv run pytest`, `pnpm test`), demo table on the **live Sepolia deployment** (public page → ✅ match → edit one byte → ❌ mismatch → onchain timeline), Real/Mock/Simulated dependency table, reset steps. Then **dry-run it from a fresh clone** (P6.3). Target: done by ~11:00.
  2. Run `alembic upgrade head` once against the Docker Postgres (P4 migration only tested on SQLite so far).
  3. Screenshots of the live public page (match / mismatch) → SUBMISSION validation evidence.
  4. P7: re-measure effort split, AI-usage table, README "Before submitting" checklist, secret scan, push `main`, send Team ID + SHA through the final form **before 14:00**.
  5. Only if time remains: P4.4 `ApiClaimSource`, then a thin P5.3 role screen. Both are optional (cut line).
* **Frontend known gaps (for P5.3)**: role detection is a placeholder; no wrong-network warning; wagmi v3 renamed `useAccount` → `useConnection`; P4 `ApiClaimSource` is only a slot in `src/data/createClaimSource.ts`.
* **TDD mode**: off (not configured in project or session). Runners: `forge test` (code/contracts), `uv run pytest` (code/shared, later code/backend).

## Team Setup — what each phase needs

> Read this before picking up a phase. Work on `develop`; never commit `.env` files or private keys (`.gitignore` blocks `.env`, but check `git status` before every commit).

### Common (everyone)
| Tool | Why | Install / check |
| --- | --- | --- |
| Git + access to `proof-of-aid/team-05` | Shared repo, branch `develop` | `git fetch && git switch develop` |
| Claude Code (optional) | Same SDD workflow: it reads `CLAUDE.md` → `dbv-specs-ops/` | Open the repo root, ask it to continue from `task.md` |
| MetaMask (browser extension) | Test wallets for demo roles | Add network **Arbitrum Sepolia** (chain id 421614, RPC `https://sepolia-rollup.arbitrum.io/rpc`, explorer `https://sepolia.arbiscan.io`) |

### P5 — Frontend (`code/frontend/`)
| Need | Detail |
| --- | --- |
| **Node.js** ≥ 20.19 (tested with 26) | Vite 8 requirement. |
| **pnpm** 12.6.0 (pinned in `package.json` → `packageManager`) | Run `corepack enable` once; Corepack then uses the pinned pnpm. The lockfile is `pnpm-lock.yaml` — never run `npm install` here (it would create a second lockfile). If Corepack says a folder "is configured to use yarn", a stray `package.json` in a parent folder (e.g. your home directory) declares another manager; the frontend's own `packageManager` field wins inside `code/frontend/`. |
| Setup | `cd code/frontend && pnpm install && cp .env.example .env` (empty addresses = demo data). |
| Checks | `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. |

### P2 — Smart contracts (`code/contracts/`)
| Need | Detail |
| --- | --- |
| **Foundry** (`forge`, `cast`, `anvil`) | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` (or `brew install foundry`). Tested with forge 1.8.3. Soldeer is built in. |
| Dependencies | `cd code/contracts && forge soldeer install` (restores OpenZeppelin 5.7.0 + forge-std 1.16.2 from `soldeer.lock`); solc 0.8.30 downloads on first `forge build`. |
| **Testnet ETH** | Arbitrum Sepolia ETH for the deployer (a public faucet, or bridge Sepolia ETH). About 0.05 ETH is plenty; the demo script funds the other 6 test wallets from it. |
| **7 test wallets** | Registry Admin, Accreditation Authority, Organization, Internal Verifier 1, Internal Verifier 2, Auditor, Disputant. Use a **fresh test-only mnemonic** (e.g. `cast wallet new-mnemonic`), never a personal wallet. |
| `code/contracts/.env` (local only) | `ARBITRUM_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY` / `MNEMONIC` (test only), optional `ARBISCAN_API_KEY` for source verification. Template: `.env.example` (created in P2). |
| Output for other lanes | `code/shared/deployments/arbitrum-sepolia.json` (contract addresses + deploy block). |
| Checks | `forge build`, `forge test` (all transitions + reverts + fuzz), `forge coverage` optional. |

### P3 — Evidence pipeline (`code/backend/`)
| Need | Detail |
| --- | --- |
| **Python ≥ 3.12** + **uv** | `curl -LsSf https://astral.sh/uv/install.sh \| sh`. uv creates `.venv/` per package and pins versions in `uv.lock`. |
| **Docker Desktop** | Runs PostgreSQL 16 via `docker compose` (no local Postgres install needed). |
| Python libraries (verified names, avoid look-alikes) | `fastapi`, `uvicorn`, `pydantic` v2, `pydantic-settings`, `sqlalchemy` 2, `alembic`, `psycopg[binary]`, `pillow` (EXIF/GPS strip by re-encoding), `cryptography` (AES-GCM), `eth-account` (wallet-signature login), `python-multipart` (uploads), shared `proof-of-aid-shared` (`uv add --editable ../shared`); dev: `pytest`, `httpx`. |
| `code/backend/.env` (local only) | `DATABASE_URL`, `EVIDENCE_ENCRYPTION_KEY` (32 random bytes, base64 — generate locally, never share in chat), `STORAGE_DIR`, `SESSION_SECRET`. |
| Test data | Made-up files only; one demo photo **with** fake EXIF/GPS to prove stripping. No real personal data. |
| Checks | `uv run pytest` (EXIF removed, ciphertext unreadable, hash of sanitized bytes, access matrix, Merkle root = shared vectors). |
| Depends on | Only `code/shared` (P1). **Can start now, in parallel with P2.** |

### P4 — Indexer + public API (`code/backend/`, same app as P3)
| Need | Detail |
| --- | --- |
| Everything from P3 | Same Python env and database. |
| `web3` (web3.py) | Reads contract events over RPC; ABIs from `code/shared/abi/`. |
| **anvil** (from Foundry) | Local chain for indexer tests: deploy the P2 contracts, emit events, check the DB. |
| Contract addresses | From `code/shared/deployments/*.json` (P2 output) + the deploy block to start indexing from. |
| Env | `RPC_URL`, `CLAIM_REGISTRY_ADDRESS`, `PARTICIPANT_REGISTRY_ADDRESS`, `START_BLOCK`. |
| Checks | `uv run pytest` against anvil: every event stored exactly once (idempotent on tx hash + log index), survives restart; public endpoints return timeline without login. |
| Depends on | **P3 finished** (same app, claims table, file metadata) and P2 contracts (anvil tests + real deploy). Done jointly by all three. |

### Suggested split for 3 people
| Lane | Phases | Starts |
| --- | --- | --- |
Agreed 2026-09-24:

| Lane | Owner | Phases | Starts |
| --- | --- | --- | --- |
| A — Blockchain | teammate | P2 → deploy + demo script (P2.4) | now |
| B — Backend | teammate | P3 | now (uses `code/shared`) |
| C — Frontend | **Guillermo** | P5 (`DESIGN.md` first, UI against `code/shared/abi/`) | now, with mock data / local anvil; wired to real contracts after P2 deploy |
| Joint | all three | P4, **after P3 is finished** (shares the P3 backend app) | after P3 |
| Docs | first person free | P6 RUNBOOK + P7 SUBMISSION | when a lane finishes |

**Timing rule (deadline Friday 14:00):** the public page (P5.4) must work **without P4**: it reads the timeline directly from the contract with viem (`getLogs` + `statusOf` + `evidenceRoots`). The P4 API is an optional speed-up, switched on only if it lands in time. Keep joint P4 minimal: indexer + timeline endpoints + public file proofs.

## Task Checklist

- [x] **Phase 1: Specification (`/spec`)**
  - [x] Bootstrap `project.config.md` (identity, stack, conventions).
  - [x] Draft `SPECIFICATIONS.md` (F1–F7) and `docs/ARCHITECTURE.md`.
  - [x] Resolve critical open questions (Q1, Q2) plus Q3, Q4, Q7.
  - [x] Resolve Q5 (React + Vite, FastAPI) and Q6 (local encrypted volume).
  - [ ] ~~Create `DESIGN.md` in `/spec`~~ → moved to P5.1 (contracts-first decision).

- [x] **Phase 2: Plan (`/plan`)** — mode: Orchestrator (multi-file, 3 layers); lanes can run in parallel after P1 (see `PARALLEL_WORK.md`).

Phases below follow README "Start here": **S1 Design → S2 Implement under `code/` → S3 Prove (demo + RUNBOOK) → S4 Submit**.

- [ ] **P0 — Checkpoint (S1 + S4, today)**
  - [x] P0.1 Final pass on `docs/ARCHITECTURE.md`: assumptions resolved, designed-only components (`FundingEscrow`, beneficiary confirmation) added to diagram and table. Per-capability status lives in `SUBMISSION.md` (the template says so), not in ARCHITECTURE.
  - [x] P0.2 Draft `docs/SUBMISSION.md` §1 snapshot, problem & approach, planned implementation boundary, effort split (planned: Blockchain 50% · Real-world connection 30% · UX 20%), what works / what is missing.
  - [x] P0.3 `.gitignore` (`.env`, `venv/`, `node_modules/`, `out/`, `cache/`, `broadcast/*/dry-run`, `.DS_Store`, evidence volume) and `code/README.md` skeleton.
  - [x] P0.4a Commit on `develop` (`4efa4bb`).
  - [ ] P0.4b **Team decision:** merge `develop` into `main`, push, and send Team ID + SHA through the checkpoint form.

- [ ] **P1 — Contract interface freeze (S2, blocks every other lane)**
  - [x] P1.1 `code/contracts/` Foundry project (solc 0.8.30, EVM cancun); OpenZeppelin 5.7.0 + forge-std 1.16.2 via Soldeer, pinned in `soldeer.lock`. *Route: inline.*
  - [x] P1.2 `IParticipantRegistry` / `IClaimRegistry`: roles, `ClaimStatus` enum (`Anchored, InternallyVerified, ProofRequested, ProofSubmitted, Verified, Rejected, Disputed`), function signatures and **all events**. Exported ABI = contract between lanes (`code/shared/abi/`, regenerate with `code/contracts/script/export-abi.sh`; enum names in `claim-status.json`). *Route: inline (carries the design decisions from this session).*
  - [x] P1.3 Merkle spec + shared test vectors (`code/shared/merkle-vectors.json`): fileHash = SHA-256(bytes); leaf = keccak256(fileHash); sorted leaves; sorted-pair keccak256 nodes; odd node promoted. Python reference `code/shared/poa_shared/merkle.py` (Result pattern) reused by the backend. *Route: delegated (writer trigger: 5+ non-trivial files).* Evidence: `uv run pytest -q` 14 passed; `forge test` 3 passed (every proof verifies with OZ `MerkleProof`, tamper case rejected; negative control confirmed the test can fail).

- [x] **P2 — Smart contracts (S2, Blockchain)** — F1, F4, F5a, F5b, F7 · *deployed to Arbitrum Sepolia 2026-09-24*
  - [x] P2.1 `ParticipantRegistry`: `ORGANIZATION`, `INTERNAL_VERIFIER`(→org), `AUDITOR`; Registry Admin vs Accreditation Authority as separate role admins; revocation.
    - [x] Enforce one participant role per wallet; reject zero addresses, duplicate accreditation, inactive organizations, and revoked participants.
    - [x] Track each verifier's organization and active verifier counts; `organizationOf()` returns zero for revoked verifiers.
    - [x] Configure OpenZeppelin `AccessControl` so Registry Admin cannot grant/revoke auditor roles and Accreditation Authority cannot manage organizations/verifiers.
  - [x] P2.2 `ClaimRegistry` state machine: anchor (org must have ≥2 active internal verifiers), internal attest, auditor assignment/reassignment by Authority, proof request, supplementary anchor, 2nd-verifier confirm/return, final attest, dispute (one open at a time), resolve.
    - [x] Store one immutable original evidence root plus append-only supplementary roots; never overwrite an existing root or claim.
    - [x] Enforce the exact transitions from `IClaimRegistry.ClaimStatus`; every other transition reverts with `InvalidStatus`.
    - [x] Enforce separation of duties: the checkpoint-1 verifier, supplementary-proof verifier, organization submitter, and assigned auditor must satisfy the interface rules.
    - [x] Require the auditor to be active and assigned for proof requests and final attestations; allow Authority reassignment only in the three permitted pre-final states.
    - [x] Allow at most one open dispute through the `Verified → Disputed` status; only the Accreditation Authority resolves it.
    - [x] Emit `StatusChanged` on every transition and the action-specific event for every state-changing action.
  - [x] P2.3 Foundry tests: every valid transition, every invalid one reverts, separation-of-duties checks, revoked wallets, role-admin isolation, fuzz on transition function. *Route: delegated (writer trigger).* Evidence (re-run by the orchestrator): `forge test` **117 passed** (MerkleVectors 3, ParticipantRegistry 45, ClaimRegistry 68, 6 invariants × 8,192 random calls); `forge coverage` **100% lines/branches/functions** on both contracts; `forge fmt --check` clean; mutation spot-checks (removing the four-eyes check or the permanent-identity rule) make tests fail.
    - [x] Cover both approval and rejection branches, proof acceptance and return, auditor reassignment, and dispute dismissal and upholding.
    - [x] Cover zero hashes, unknown/duplicate claims, wrong organization, wrong verifier, wrong auditor, revoked wallets, unauthorized administrators, and calls in invalid states.
    - [x] Assert custom errors, emitted events, stored claims, root indexes, timestamps, and the complete status sequence.
  - [x] P2.4 `script/Deploy.s.sol` + `script/DemoLifecycle.s.sol` (full lifecycle with 7 test wallets); deploy to Arbitrum Sepolia; record addresses + tx hashes. **Anvil: done** — Deploy → DemoLifecycle → `record_transactions.py` ends with `statusOf` = 5 (Verified) and `evidenceRoots` = the frontend demo files' real roots; `code/shared/deployments/anvil.json` holds addresses, deploy block and 16 tx hashes. **Arbitrum Sepolia: done** (run by Guillermo): ParticipantRegistry `0x32a479e9Ad3C0C9e6e00eF2Dff4D7374b6460564`, ClaimRegistry `0x44780Bed68bDd0f9B9a74d82de81B4C069234BFE`, deployBlock 312262109, 22 txs all successful, demo claim `0xfedebf75…` ends Verified with 2 evidence roots. Fix found here: Arbitrum's in-EVM `block.number` is the L1 block, so `record_transactions.py` now sets `deployBlock` from the deployment receipt.
    - [x] Add `.env.example` for RPC/deployer configuration and keep private keys, mnemonics, and API keys local only.
    - [x] Write `code/shared/deployments/arbitrum-sepolia.json` with chain ID, both addresses, deploy block, and lifecycle transaction hashes.
    - [x] Use test-only wallets for Registry Admin, Accreditation Authority, Organization, two Internal Verifiers, Auditor, and Disputant; document the demo's initial state and reset path.

- [ ] **P3 — Evidence pipeline (S2, Real-world connection)** — F2, F3
  - [x] P3.1 `code/backend/` FastAPI app (own venv + `pyproject.toml`), settings from `.env`, PostgreSQL via SQLAlchemy + Alembic, docker-compose for Postgres.
    - Evidence (2026-09-24): `app/{settings,db,models,main}.py` with project headers; `itsdangerous` added for sessions; `alembic/` env reads `DATABASE_URL` from settings (never in `alembic.ini`); migration `0001` (`claims`, `evidence_files`, `participants`, `challenges`); `alembic upgrade head` OK on native Postgres; `GET /health` → 200; key validation rejects short keys.
  - [x] P3.2 Upload: EXIF/GPS strip → SHA-256 on sanitized bytes → AES-GCM encryption to the local volume; `public` flag per file; no personal data in logs.
    - Evidence (2026-09-24): `app/services/crypto.py` (HKDF per claim + AES-GCM, `Result`) and `app/services/evidence.py` (`sanitize_upload` re-encodes JPEG/PNG/WebP with empty EXIF, passthrough for non-images; `process_upload` → hash + packed blob; `store/load_packed` with traversal guard). Inline run: GPS-laden demo JPEG stripped (exif gone), hash == SHA-256(sanitized) ≠ raw, encrypt/store/load/decrypt roundtrip OK, tampered blob and wrong key → `Err`. `public` flag enforced at the API layer (P3.4 slice).
  - [x] P3.3 Merkle root builder in Python, passing P1.3 vectors.
    - Evidence (2026-09-24): `app/services/claims.py` (`claim_id_from_uuid` = keccak256(uuid), `metadata_digest` canónico v1, `build_evidence_root` sobre la receta P1.3). Inline run: keccak == `eth_utils.keccak` (coincide con Solidity), claim_id determinista/único, digest sensible a cada campo + guards, 6/6 vectores P1.3, e2e pipeline → root → proof válida.
  - [x] P3.4 Wallet login (EIP-191 signed nonce → session) and role-based decryption: org, its internal verifiers, and the claim's assigned auditor only.
    - Evidence (2026-09-24): `app/schemas.py` (Pydantic v2), `services/auth.py` (challenge single-use 10min + `eth-account` verify), `services/access.py` (matrix; denied private reads → 404, no oracle), `api/{auth,claims,files}.py` wired in `main.py`. E2E run (SQLite + TestClient): challenge/verify/replay-401/me/logout; POST /claims 401/403/422/201 + digest match; uploads 403-for-verifier/409-dup/root match; public GET claim (hashes+root, no bytes); matrix org/verifier/assigned-auditor 200, others 404, public file free; PATCH visibility 401/403/flip. `auditor_address` set via DB seed until P4 reads `AuditorAssigned` onchain (orgs must not self-assign auditors).
  - [x] P3.5 pytest: EXIF removed, ciphertext unreadable without key, hash = sanitized bytes, access matrix, Merkle vectors.
    - Evidence (2026-09-24): `tests/` (conftest con app aislada por test: SQLite `:memory:` + `StaticPool`, storage temporal, claves aleatorias; `pythonpath=["."]` + `tests/__init__.py`) — `test_auth` (7: challenge/verify/replay/expiry/logout), `test_claims` (12: guards + anchor ids + root), `test_evidence` (7: EXIF/GPS, hash=saneado, roundtrip/tamper, traversal), `test_access` (4: matriz + visibility), `test_merkle` (5: 6/6 vectores + e2e). **`uv run pytest`: 34 passed.** `create_app` acepta `engine` inyectado (solo tests).

  - [x] P3.6 Integration fixes (2026-09-24, found in review): (1) **privacy** — anonymous/unauthorized viewers get private files as fingerprint only (`PrivateFileFingerprint`, `extra="forbid"`), no name/type/size/uploader; (2) **bundles** — `evidence_files.root_index` (migration `bb34bf8da841`), one root per bundle matching onchain `evidenceRoots[i]`, no gaps, earlier bundles sealed; (3) **manifest endpoint** `GET /claims/{id}/bundles/{n}/manifest` in the `code/shared/manifest.schema.json` format; (4) **CORS** from `CORS_ORIGINS` (default `http://localhost:5173`, credentials, no `*`). API change: claim responses expose `bundles[]` instead of `evidence`/`evidence_root`. *Route: delegated (writer trigger).* Evidence: `uv run pytest` **54 passed** (34 + 20 new); SQLite migrate up/down/up OK, `alembic check` clean; live uvicorn: private name appears 0 times in public JSON, manifests validate against the schema and match bundle roots, CORS preflight allowed/denied as expected. **Not run:** Postgres migration (Docker daemon off).
  - [x] P3.7 Bug fixes (2026-09-24): migration `0001` defaults now `sa.func.now()` (Postgres `now()`, SQLite `CURRENT_TIMESTAMP`), so Alembic-built SQLite DBs accept inserts; uploads lock the claim row (`SELECT … FOR UPDATE`) before the seal/gap check, so concurrent uploads cannot both pass it. Evidence: 54 tests pass; SQLite migrate + insert OK; **throwaway Postgres 18** (scratch, port 55432, deleted afterwards): upgrade → downgrade → upgrade OK, `alembic check` clean, insert uses defaults, concurrent `FOR UPDATE` blocked (`LockNotAvailable`) until the first commits.
  - **Remaining (by design, not bugs):** chain-aware sealing (seal a bundle once its root is anchored) belongs to P4; a cross-site production frontend would need `SameSite=None; Secure` session cookies (same-site localhost dev works).

- [ ] **P4 — Indexer + public API (S2)** — F6 · *backend done 2026-09-24; frontend `ApiClaimSource` pending*
  - [x] P4.1 web3.py event indexer (poll from deploy block) → `claim_events` table; idempotent on (tx hash, log index). As built: `uv run python -m app.indexer [--once]`, tables `chain_events` (unique chain_id+tx_hash+log_index), `sync_state` cursor, projections `chain_participants` + `chain_claims` updated in the same transaction; RPC range halving; confirmations margin; migration 0003. **Chain-driven access control**: `ROLE_SOURCE=chain` makes decryption rights follow onchain roles and the claim's assigned auditor (revocations remove access; an auditor only gets access if the claim was anchored onchain by the organization that created it in the backend). *Route: delegated (writer trigger).*
  - [x] P4.2 Public endpoints: `GET /public/claims`, `GET /public/claims/{id}/timeline`, `GET /public/indexer/status` (no auth; status/roots must still be verified against the contract by the client). *Not done:* per-file Merkle proof endpoint (the browser computes proofs itself from the manifest).
  - [x] P4.3 pytest against Anvil for the indexer. Evidence (re-run by the orchestrator): backend suite **91 passed, 0 skipped**; the anvil test deploys + runs DemoLifecycle, indexes 22 events (16 txs: 2 creations emit none, 6 single-event calls, 8 claim actions × 2 incl. `StatusChanged`), demo claim projected Verified with both roots, second `--once` adds nothing. Alembic 0003 up/down on SQLite OK; **Postgres migration not yet run**.
  - [ ] P4.4 Frontend `ApiClaimSource` (timeline from the API when `VITE_API_URL` is set; status + roots still read from the contract).

- [ ] **P5 — Frontend (S2, UX)** · *owner: Guillermo*
  - [x] P5.1 Create `dbv-specs-ops/docs/DESIGN.md` (tokens, typography, components; status colours per `ClaimStatus`). Evidence: every text colour pair checked ≥ 4.5:1 (WCAG AA), light and dark. *Route: inline (single file).*
  - [x] P5.2 `code/frontend/` React + Vite + TS + wagmi/viem, modular (`components/ hooks/ context/ utils/`). React 19.3, wagmi 3.7 + viem 2.56, react-router 7.18, zod 4, Vite 8, TypeScript 6 (strict flags), Vitest, oxlint. Mock mode when contract addresses are empty; ABIs imported from `code/shared/abi`; DESIGN.md tokens as CSS variables; StatusBadge + HashDisplay; contract error → plain-English map covering every ABI error. *Route: delegated (writer trigger).* Evidence: typecheck 0 errors, 67 tests passed, oxlint 0 findings, build OK (~200 kB gzip total). Package manager switched to **pnpm 12.6.0** (lockfile imported from npm, same versions; all checks re-run green).
  - [ ] P5.3 Views: organization (create claim, upload, anchor, answer proof requests), internal verifier (attest / confirm proof), auditor (review, request proof, final attest), authority (accredit, assign, resolve disputes), admin (register org + verifiers).
  - [x] P5.4 Public claim page (no wallet): timeline read **directly from the contract** via viem (P4 API optional), attestations, **browser-side** re-hash of a public file / bundle vs onchain root → match / mismatch. Chain reads: `statusOf`/`getClaim`/`evidenceRoots` + raw `eth_getLogs` with `topics [null, claimId]` from `VITE_DEPLOY_BLOCK`, chunked (`VITE_LOG_CHUNK_SIZE`, halves on RPC range errors). Verification: per-file via an untrusted **manifest** (`code/shared/manifest.schema.json`) whose recomputed root must equal the onchain root, or bundle mode (drop all files, no manifest). Browser Merkle passes all `merkle-vectors.json` cases (third implementation). Demo evidence in `code/frontend/public/demo-evidence/` (test proves the mock root equals the files' real root). *Route: delegated (writer trigger).* Evidence: typecheck 0, **216 tests passed**, oxlint 0, build OK (~241 kB gzip); browser check in mock mode: 9 timeline entries, downloaded receipt → match, 1 char edited → mismatch, 360px OK, no console errors, no network request carries file contents. **Pending:** end-to-end against real P2 contracts (anvil) and live Arbitrum Sepolia `eth_getLogs` limits.

- [ ] **P6 — Prove it works (S3)**
  - [ ] P6.1 Seed script (7 test wallets, 1 org with 2 internal verifiers, 1 auditor, sample claim with EXIF-laden demo photo — no real personal data).
  - [ ] P6.2 `docs/RUNBOOK.md`: requirements, setup, `.env.example`, run, validate (`forge test`, `pytest`), demo table (anchor → verify → proof loop → verify → tamper file → mismatch), dependencies Real/Mock table.
  - [ ] P6.3 Dry-run the RUNBOOK from a fresh clone.

- [ ] **P7 — Final submission (S4, before Friday 14:00)**
  - [ ] P7.1 Complete `docs/SUBMISSION.md` (real boundary table, measured effort split, validation evidence: test output + Arbiscan tx links, limitations, next step, AI usage table).
  - [ ] P7.2 README "Before submitting" checklist; secret scan (`git grep` for keys) before push.
  - [ ] P7.3 **Team** merges `develop` into `main`, pushes `main` and sends Team ID + SHA through the final form.

**Cut line if time runs short (in order):** drop P5.3 admin/authority views (use Foundry scripts) → drop P4 indexer (frontend reads events directly via viem) → keep P2 + P3 + P5.4 + P6, which is the minimum end-to-end proof.

---

# (Framework history) Backlog - dbv-specs-ops v2.8.0 (AI-Native SDLC Loop Closure & Guardrails)

## Contexto del Proyecto (Context Snapshot)
* **Objetivo**: Integrar de forma curada el [AI-Native SDLC Playbook (Anthropic)](https://claude.com/blog/the-ai-native-sdlc-playbook) — cierre autónomo del loop (Fase 7 Maintain, opcional), revisión de código por pases con severidad, guardarraíles deterministas y trabajo paralelo formalizado — más un fix de usabilidad real (comandos de fase escuetos mal interpretados) y la división del README en dos ficheros de un solo idioma.
* **Estado actual**: ENTREGA COMPLETADA (v2.8.0 commiteada y pusheada a `origin/master`, commit `7c33e42`).
* **Última decisión técnica**: El pase "Cumplimiento" de `docs/REVIEW.md` audita ahora explícitamente los `<coding_standards>` de `MASTER_PROMPT.md` (no solo specs/arquitectura), porque se detectó código real con 5-6 `return` por función pese a que la regla ya estaba declarada "obligatoria" — la sola declaración advisory no bastaba.
* **Próximo paso**: Ninguno pendiente en el ciclo de esta versión. `task.md`, `memory.md` y `walkthrough.md` sincronizados en un commit de seguimiento tras el cierre.

## Checklist de Tareas

- [x] **Fase 1: Especificaciones (`/spec`, implícita)**
  - [x] Analizar el playbook de Anthropic y los 6 documentos generados en una sesión previa (`docs/novedades2.8/`, ya integrados y eliminados).
  - [x] Decidir alcance de integración con el usuario (curada completa, vs. núcleo, vs. todo-menos-Maintain) → elegido: curada completa.

- [x] **Fase 3: Construcción (`/build`)**
  - [x] **1. Documentos nuevos en `docs/`**: `MAINTAIN.md` (Fase 7 opcional), `REVIEW.md`, `GUARDRAILS.md`, `PARALLEL_WORK.md`, `SOURCE_OF_TRUTH.md`, `METRICS.md`.
  - [x] **2. Infraestructura opcional**: `evals/README.md`, `evals/example-spec-eval.json`, `scripts/run-evals.sh` (regresión de la configuración del agente, no del código de proyecto).
  - [x] **3. Fix de comandos de fase escuetos**: regla de cascada en `docs/MASTER_PROMPT.md` (`<workflow>`) + `.claude/commands/{spec,plan,build,test,code-simplify,ship,maintain}.md` (comandos nativos de Claude Code con autocompletado).
  - [x] **4. Enganches en `MASTER_PROMPT.md`**: `/plan` → `PARALLEL_WORK.md`; `/code-simplify` → los 3 pases de `REVIEW.md`; `/ship` → gate de hallazgos Crítico; `<boundaries>` → `GUARDRAILS.md`; `<context_management>` → `SOURCE_OF_TRUTH.md`; Fase 7 documentada al final de `<workflow>`.
  - [x] **5. Metadatos**: `project.config.md` (versión → `2.8.0`), `docs/UPGRADE_PROMPT.md` (manifest v2.8.0 completo, nuevas URLs de descarga, mensaje de cierre), `README.md`/`README.en.md`, `docs/README.md`.

- [x] **Fase 4: Pruebas y Verificación (`/test`)**
  - [x] `bash -n scripts/run-evals.sh` (sintaxis) y validación del JSON de ejemplo.
  - [x] Etiquetas XML de `MASTER_PROMPT.md` balanceadas tras las inserciones.
  - [x] Paridad manifest ↔ disco entre `docs/UPGRADE_PROMPT.md` y los ficheros nuevos.

- [x] **Fase 5: Simplificar (`/code-simplify`)**
  - [x] Extender el pase "Cumplimiento" de `docs/REVIEW.md` para auditar `<coding_standards>` (un solo `return` + guard clauses, patrón Result, tipado estricto) — gap detectado por el usuario tras ver código real con múltiples `return` por función.
  - [x] Añadir a `docs/GUARDRAILS.md` un ejemplo concreto de heurística pre-commit para esa regla.

- [x] **Fase 6: Entrega (`/ship`, manual — sin usar los comandos de fase sobre este propio repo)**
  - [x] Dividir `README.md` bilingüe en `README.md` (español, principal) y `README.en.md` (inglés), con enlace cruzado de idioma y diagramas `mermaid` actualizados (nodo opcional Maintain, pase de revisión en Simplify).
  - [x] Corregir el ancla rota `#adoption` en el índice del README (bug preexistente, no introducido en esta versión).
  - [x] Borrar `docs/novedades2.8/` (contenido ya integrado) y `docs/thenewsdlcwithvibecoding.pdf` (limpieza de espacio, sin referencias cruzadas).
  - [x] Actualizar el pie de comparación de `CHANGELOG.md` (`[Sin publicar]` → `v2.8.0...HEAD`, nuevo `[2.8.0]: v2.7.0...v2.8.0`).
  - [x] Commit `Version 2.8.0` (`7c33e42`) y push a `origin/master`.

---

## 🔄 Context Snapshot / Snapshot de Contexto

> **Last update / Última actualización:** 2026-09-01
> **Exact point / Punto exacto:** v2.8.0 publicada en `origin/master` (commit `7c33e42`). `task.md`, `memory.md` y `walkthrough.md` sincronizados en el commit de seguimiento inmediato.
> **Pending / Pendiente:** Ninguno para esta versión.
> **Next step / Próximo paso:** Retomar el backlog normal del framework en la próxima sesión.
