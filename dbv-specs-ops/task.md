# Backlog - Proof of Aid — Team 05

## Context Snapshot
* **Goal**: Trust, Evidence & Privacy — offchain encrypted evidence, Merkle root anchored onchain, two-stage verification (internal verifier → Authority-assigned external auditor with proof requests; supplementary proof confirmed by a 2nd internal verifier), public verification, disputes by accredited participants resolved by the Accreditation Authority.
* **Current state**: `/plan` done (2026-09-24). Stack fixed: Foundry + OpenZeppelin on Arbitrum Sepolia, FastAPI + PostgreSQL, React + Vite + viem/wagmi, local encrypted volume.
* **Concrete problem (README Start here §2)**: Trust, Evidence & Privacy — letting a third party trust an aid claim whose evidence cannot be published because it contains beneficiaries' personal data. Scope statement in `docs/ARCHITECTURE.md#implementation-focus`; reuse it verbatim in `SUBMISSION.md` (P0.2). Every task must serve this problem; Funding and Delivery & Impact stay designed-only.
* **Build order**: contracts → backend → frontend (option 1). `DESIGN.md` is written at the start of P5, not in `/spec` (logged in `memory.md`).
* **Structure rule**: all implementation lives under `code/` (README "Start here" §2), which overrides MASTER_PROMPT's "venv/pyproject/package.json at the project root": each toolchain root is inside `code/`.
* **Branching**: all work happens on `develop`; nothing is merged or pushed to `main` until the team decides. Evaluation only reads `main`, so `develop` must be merged into `main` before the checkpoint/final SHA is submitted (team decision, not automatic).
* **Deadlines**: Thursday checkpoint (today, time set by organizers) · **Final: Friday 25, 14:00**.
* **Next step**: continue on `develop` with `/build` P1 (freeze the contract interface) → P2.

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
  - [ ] P1.1 `code/contracts/` Foundry project with OpenZeppelin (pinned version).
  - [ ] P1.2 `IParticipantRegistry` / `IClaimRegistry`: roles, `ClaimStatus` enum (`Anchored, InternallyVerified, ProofRequested, ProofSubmitted, Verified, Rejected, Disputed`), function signatures and **all events**. Exported ABI = contract between lanes.
  - [ ] P1.3 Merkle spec + shared test vectors (`code/shared/merkle-vectors.json`): leaf = SHA-256(file bytes); tree = OpenZeppelin standard (keccak256, sorted pairs); odd leaf promoted.

- [ ] **P2 — Smart contracts (S2, Blockchain)** — F1, F4, F5a, F5b, F7
  - [ ] P2.1 `ParticipantRegistry`: `ORGANIZATION`, `INTERNAL_VERIFIER`(→org), `AUDITOR`; Registry Admin vs Accreditation Authority as separate role admins; revocation.
  - [ ] P2.2 `ClaimRegistry` state machine: anchor (org must have ≥2 active internal verifiers), internal attest, auditor assignment/reassignment by Authority, proof request, supplementary anchor, 2nd-verifier confirm/return, final attest, dispute (one open at a time), resolve.
  - [ ] P2.3 Foundry tests: every valid transition, every invalid one reverts, separation-of-duties checks, revoked wallets, role-admin isolation, fuzz on transition function.
  - [ ] P2.4 `script/Deploy.s.sol` + `script/DemoLifecycle.s.sol` (full lifecycle with 7 test wallets); deploy to Arbitrum Sepolia; record addresses + tx hashes.

- [ ] **P3 — Evidence pipeline (S2, Real-world connection)** — F2, F3
  - [ ] P3.1 `code/backend/` FastAPI app (own venv + `pyproject.toml`), settings from `.env`, PostgreSQL via SQLAlchemy + Alembic, docker-compose for Postgres.
  - [ ] P3.2 Upload: EXIF/GPS strip → SHA-256 on sanitized bytes → AES-GCM encryption to the local volume; `public` flag per file; no personal data in logs.
  - [ ] P3.3 Merkle root builder in Python, passing P1.3 vectors.
  - [ ] P3.4 Wallet login (EIP-191 signed nonce → session) and role-based decryption: org, its internal verifiers, and the claim's assigned auditor only.
  - [ ] P3.5 pytest: EXIF removed, ciphertext unreadable without key, hash = sanitized bytes, access matrix, Merkle vectors.

- [ ] **P4 — Indexer + public API (S2)** — F6
  - [ ] P4.1 web3.py event indexer (poll from deploy block) → `claim_events` table; idempotent on (tx hash, log index).
  - [ ] P4.2 Public endpoints: claim, timeline, attestations, public files, Merkle proof per file. Status is also read live from the contract.
  - [ ] P4.3 pytest against Anvil for the indexer.

- [ ] **P5 — Frontend (S2, UX)**
  - [ ] P5.1 Create `dbv-specs-ops/docs/DESIGN.md` (tokens, typography, components; status colours per `ClaimStatus`).
  - [ ] P5.2 `code/frontend/` React + Vite + TS + wagmi/viem, modular (`components/ hooks/ context/ utils/`).
  - [ ] P5.3 Views: organization (create claim, upload, anchor, answer proof requests), internal verifier (attest / confirm proof), auditor (review, request proof, final attest), authority (accredit, assign, resolve disputes), admin (register org + verifiers).
  - [ ] P5.4 Public claim page (no wallet): timeline, attestations, **browser-side** re-hash of a public file / bundle vs onchain root → match / mismatch.

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
