# 🧠 Memory & Context

> **Frontera de uso (Memory vs. Tasks):**
> - `task.md` → progreso **operativo**: checklist de tareas, Snapshot de Contexto (el paso exacto siguiente), y estado de la sesión.
> - `memory.md` → contexto **cualitativo y temático**: conocimiento persistente, decisiones técnicas profundas, lecciones, y el área del producto en foco (no el paso específico).
> Si hay info que sirva para los dos, prioriza: datos con fecha/paso exacto → `task.md`; razonamiento/por-qué/lecciones → `memory.md`.
>
> *Instrucción para la IA: Consulta este archivo al inicio de cada sesión para recuperar el hilo técnico. Actualiza las secciones correspondientes cuando el workflow lo indique (triggers en `/plan`, `/build`, `/test` y gate en `/ship`).*

## 🎯 Active Context — Proof of Aid Team 05
- **Focus:** Trust, Evidence & Privacy. Plan approved 2026-09-24; build order contracts → backend → frontend.
- **State (2026-09-24):** interfaces frozen in P1; next are P2 (contract logic), P3 (evidence pipeline) and P5 (frontend), which can run in parallel. Work on `develop`; `main` only receives merges decided by the team.

## 🏗️ Decisions (Team 05)
- **2026-09-24 - Contracts first, DESIGN.md deferred:** The contract state machine is the dependency of every other layer and the hardest to change once deployed, so it is built and frozen first. `DESIGN.md` (required by MASTER_PROMPT in `/spec` for UI projects) is written at the start of the frontend task (P5.1) instead. Conscious deviation, approved by the team.
- **2026-09-24 - Implementation under `code/`:** README "Start here" requires the implementation under `code/`; it overrides MASTER_PROMPT's rule of placing `venv/`, `pyproject.toml` and `package.json` at the project root. Each toolchain root lives in `code/<layer>/`.
- **2026-09-24 - Merkle construction (frozen P1):** fileHash = SHA-256(sanitized bytes); leaf = keccak256(fileHash) (double hashing so an internal node can never pass as a file); leaves sorted so upload order does not matter; duplicates rejected; nodes = keccak256 of the sorted pair; an odd node is promoted unchanged. Verifies with OpenZeppelin `MerkleProof.verify`. Python (`poa_shared.merkle`), TypeScript and Solidity must pass `code/shared/merkle-vectors.json`, otherwise public verification gives false mismatches.
- **2026-09-24 - Accepted risk (adversarial review): ≥2 internal verifiers per organization.** The proof-confirmation rule (2nd verifier ≠ checkpoint-1 verifier ≠ submitter) deadlocks an organization with only one verifier, so anchoring requires ≥2 active internal verifiers. Small organizations cannot use the system alone; accepted for the prototype.
- **2026-09-24 - Accepted risk: auditor revoked mid-audit.** The Accreditation Authority can reassign the auditor while the claim is `InternallyVerified`, `ProofRequested` or `ProofSubmitted`; the previous auditor's attestations stay in history.
- **2026-09-24 - Claim ID:** the backend generates a UUID; onchain `claimId = keccak256(uuid)` (bytes32). Not a counter, so it does not reveal how many claims exist or their order, and the backend can name a claim before it is anchored. The hash gives a fixed format, not secrecy.
- **2026-09-24 - Soldeer instead of git submodules:** dependencies are pinned with checksums in `soldeer.lock` and restored with one command (`forge soldeer install`), so a fresh clone cannot build with missing or different libraries. `dependencies/` is git-ignored.
- **2026-09-24 - Interface design (P1):** one participant role per wallet (an auditor can never be an organization's verifier); role ids are file-level constants in `IParticipantRegistry.sol`; `ClaimStatus.None = 0` means "does not exist"; `evidenceRoots(claimId)` returns the original root plus one per supplementary proof, so the public page verifies against the contract, not the DB; a generic `StatusChanged` event on every transition feeds the timeline; custom errors name the broken rule. Changing an interface after P1 needs whole-team agreement plus `script/export-abi.sh`.
- **2026-09-24 - Python environments:** each Python package (`code/shared`, `code/backend`) has its own uv-managed `.venv/` + `uv.lock`, instead of MASTER_PROMPT's single root `venv/` (implementation lives under `code/`).
- **2026-09-24 - Lanes and P4 timing:** Guillermo owns the frontend (P5); P4 is done jointly after P3, since it shares the P3 backend app. Because P4 may land late (deadline Friday 14:00), the public page reads events and status directly from the contract with viem; the indexer API is an optional speed-up. The integrity proof shown to the jury must not depend on the backend DB.
- **2026-09-24 - pnpm for the frontend:** team preference. Pinned via `packageManager: pnpm@12.6.0` so Corepack gives everyone the same version; `pnpm-lock.yaml` is the only lockfile. pnpm's strict `node_modules` also catches imports of undeclared packages that npm would silently allow.
- **2026-09-24 - P3 backend decisions (lane B):** tests run against in-memory SQLite while models stay Postgres-compatible (`sqlalchemy.Uuid` renders native UUID on Postgres, CHAR(32) on SQLite); roles resolve through a local `participants` table (org / verifier→org link / auditor) until P4 reads accreditation onchain; evidence encryption is AES-256-GCM with per-claim `HKDF(EVIDENCE_ENCRYPTION_KEY, salt=claim_id)` keys + random nonce per file; login nonces are single-use with expiry (anti-replay).
- **2026-09-24 - P3 done (lane B):** `uv run pytest` 34 passed (`test_auth` 7, `test_claims` 12, `test_evidence` 7, `test_access` 4, `test_merkle` 5). Test infra: in-memory SQLite + `StaticPool`, `create_app` accepts an injected engine (prod builds its own); expiry filtered in Python (`_as_aware`) because SQLite returns naive datetimes. No endpoint sets `auditor_address` (orgs must not self-assign auditors) — DB seed until P4 reads `AuditorAssigned`; denied private reads return 404 (no existence oracle).
- **2026-09-24 - Accepted risk: dispute spam.** Only accredited wallets can dispute, and a claim holds at most one open dispute. No stake/bond mechanism in the prototype.

## 🗺️ Code Map (Team 05)
- `code/contracts/src/interfaces/` — frozen interfaces: `IParticipantRegistry` (accreditation) and `IClaimRegistry` (lifecycle). P2 implementations go in `code/contracts/src/`.
- `code/shared/abi/` — exported ABIs + `claim-status.json` (enum names). Backend and frontend import these, never the Solidity source.
- `code/shared/poa_shared/` — Python Merkle reference + `Result` type (Ok/Err); the backend installs it as an editable dependency.
- `code/shared/merkle-vectors.json` — cross-language test vectors, checked by `code/contracts/test/MerkleVectors.t.sol` and `code/shared/tests/`.
- Planned: `code/backend/` (FastAPI: evidence pipeline P3 + indexer/public API P4), `code/frontend/` (React + Vite, P5), `code/shared/deployments/` (addresses per network, P2).

---

# (Framework history)

## 🎯 Contexto Activo
- **Estado actual del desarrollo:** Release v2.8.0 publicado en `origin/master` (commit `7c33e42`). Integración curada del AI-Native SDLC Playbook (Anthropic) completa y verificada.
- **Foco inmediato:** Ninguno pendiente de esta versión. Próxima sesión retoma backlog normal.

## 🏗️ Log de Decisiones Técnicas (ADR Ligero)
*Registro de por qué se tomaron ciertas rutas (ej. cambios en librerías, arquitectura o patrones).*

- **2026-06-15 - Transición a dbv-specs-ops v2.0.0 (Agentic Engineering):** Implementación de los principios del libro blanco de Google. Se unificaron los Evals no deterministas de IA en la fase `/test` para simplificar el flujo, y se añadió la auditoría de seguridad en `/code-simplify` para evitar la fuga de credenciales o de paquetes alucinados (*slopsquatting*). Se transicionó la sección MCP en la arquitectura a una definición explícita de Arnés (Harness) del Agente.
- **2026-07-29 - Integración de Enriquecimiento de Diseño (v2.3.0):** Adición opcional de Impeccable y SkillUI. Para mantener la subcarpeta como única fuente de verdad sin romper compatibilidad con herramientas de raíz, `dbv-specs-ops/docs/DESIGN.md` sigue siendo la fuente de verdad, y se copia a la raíz como un archivo derivado. Se automatizó la sincronización del archivo de la raíz en la fase `/ship` para evitar desajustes o ediciones inconsistentes.
- **2026-08-07 - Adopción de Agent Plugins 1.0.0 (v2.4.0):** Integración completa del estándar universal de empaquetado para herramientas MCP y Agent Skills. Se unificaron los directorios de autodescubrimiento web bajo `.well-known/agent-plugin/` y se implementó un asistente de migración en `UPGRADE_PROMPT.md` para trasladar automáticamente proyectos antiguos con configuraciones ad-hoc a esta estructura portable, traduciendo rutas locales absolutas a los placeholders `${PLUGIN_ROOT}` y `${PLUGIN_DATA}`.
- **2026-08-13 - Integración de Apps de Escritorio Nativas, CI Multiplataforma y Marketplaces (v2.5.0):** Incorporación de guías operativas (`NATIVE_DESKTOP_APPS.md`, `NATIVE_APPS_RELEASE_CI.md`, `MARKETPLACE_PUBLISHING.md`) basadas en la experiencia real con Tauri v2, GitHub Actions y Microsoft Store / Uptodown. Se añadieron opciones de stack de escritorio nativo en el Bootstrap §7 de `MASTER_PROMPT.md` y dos Phase Gates (verificación de CI multiplataforma en `/plan` y checklist de publicación pre-envío en `/ship`) manteniendo el framework 100% modular y no invasivo para proyectos web.
- **2026-08-21 - Endurecimiento de Desktop Apps y Plantillas de CI Completas (v2.5.1):** Generalización de lecciones aprendidas reales en producción: 9 gotchas concretos de Tauri v2 (permisos `allow-destroy`/`allow-print`, `confirm` asíncrono, caché WebView2, glob en `capabilities`, reentrancia `run_on_main_thread`, `RunEvent::Opened` en macOS), guía de personalización de instaladores NSIS vs. forkeo de plantillas, requisitos de identidad MSIX, y adición de 3 plantillas YAML completas y operativas para GitHub Actions (`release-{windows,linux,macos}.yml`).
- **2026-08-22 - Estrategia de Migración Web → Desktop y Phase Gates (v2.6.0):** Creación de `WEB_TO_DESKTOP_MIGRATION.md` para sistematizar las decisiones previas a envolver aplicaciones web existentes con Tauri v2: clasificación en 4 arquetipos (estática, SPA con bundler, backend ligero, backend pesado/ML), dirección de adopción hacia el repo existente, modo dual con capa de adaptación única (`runningInTauri`), regla de decisión Rust vs. sidecar por función, prevención del embebido recursivo de `frontendDist` y dos Phase Gates en `MASTER_PROMPT.md` (Bootstrap §7 y `/plan` Paso 3).
- **2026-08-28 - Cosecha de Lecciones de Producción y DoD de Escritorio (v2.7.0):** Consolidación de conocimiento práctico derivado de múltiples aplicaciones nativas publicadas en tiendas oficiales: Definición de Hecho (DoD) de escritorio nativo con 6 criterios de aceptación obligatorios (diálogos de archivo nativos, iconografía desde `app-icon.svg`, atajos universales en inputs, menú nativo macOS, layout fluido y tooltips), 4 trampas adicionales de Tauri v2 (`zoomHotkeysEnabled`, caché de assets embebidos y de Cargo en `.ico`, sondas inline válidas frente a `document.title`), obligatoriedad de trackear la carpeta de empaquetado `gen/windows/`, generación segura de claves de firma por el usuario, orquestación `spawnSync` en CI local y verificación de inputs en Actions de terceros.
- **2026-09-01 - Cierre Autónomo del Loop, Revisión por Capas y Guardarraíles (v2.8.0):** Integración curada del [AI-Native SDLC Playbook (Anthropic)](https://claude.com/blog/the-ai-native-sdlc-playbook), agnóstica de proveedor: `docs/MAINTAIN.md` (Fase 7 opcional — detector determinista + diagnóstico IA solo lectura que redacta un hallazgo `[Detectado]` en `SPECIFICATIONS.md`, nunca despliega ni hace merge), `docs/REVIEW.md` (3 pases con severidad — Bugs/Seguridad/Cumplimiento — enganchados a `/code-simplify`, lo Crítico bloquea `/ship`), `docs/GUARDRAILS.md` (guardarraíles deterministas git/CI que respaldan las reglas advisory), `docs/PARALLEL_WORK.md` (formaliza el Modo Orquestador con `git worktree`), `docs/SOURCE_OF_TRUTH.md` y `docs/METRICS.md`. Se corrigió además un bug de usabilidad real: un comando de fase escueto (`/build` sin más texto) se interpretaba de forma inconsistente — se añadió una regla de cascada explícita en `<workflow>` de `MASTER_PROMPT.md` más `.claude/commands/` (comandos nativos de Claude Code por fase). El `README.md` bilingüe se dividió en `README.md` (ES) + `README.en.md` (EN), cada uno autocontenido.

## ⚠️ Lecciones Aprendidas / Errores Evitados
*Notas sobre bugs específicos, configuraciones que fallaron o refactors intentados para no repetirlos.*

- **[Feedback de Usabilidad]**: Es mejor integrar los conceptos nuevos (como Evals) en las fases existentes (`/test`) y delegar los modos de ejecución (Conductor/Orquestador) de forma implícita, en lugar de sobrecargar al desarrollador final con configuraciones complejas o preguntas confusas.
- **[Estructura de Onboarding]**: En proyectos existentes con archivos raíz consolidados (como `README.md` y `CHANGELOG.md`), es preferible descargar el framework completo en una subcarpeta dedicada (`dbv-specs-ops/`) e indicar al agente su ubicación a través de un archivo de activación ligero (`CLAUDE.md`, `GEMINI.md`). Esto evita colisiones de archivos y mantiene limpio el código de producción.
- **[Preferencia de Commit]**: Para los mensajes de git commit en este proyecto, usar siempre el formato conciso "Version v.X.Y.Z" (ejemplo: `Version v.2.7.0`) en lugar de mensajes largos de Conventional Commits.
- **[Declarar una regla no basta]**: `<coding_standards>` de `MASTER_PROMPT.md` llevaba la regla "un solo `return` + guard clauses" marcada como obligatoria desde v2.0.0, y aun así aparecía código real con 5-6 `return` por función. Una instrucción *advisory* sin un paso de revisión que la audite explícitamente, o un guardarraíl determinista que la haga imposible de saltar, no garantiza cumplimiento — de ahí que `docs/REVIEW.md` ahora la comprueba función por función en el pase "Cumplimiento", y `docs/GUARDRAILS.md` documenta una heurística pre-commit de respaldo.
- **[Este repo no se auto-aplica el ciclo de fases]**: `dbv-specs-ops` es el repositorio que *define* el framework, no un proyecto consumidor. Aunque `.claude/commands/` esté presente aquí (para poder probarlo), no se deben invocar `/spec /plan /build ...` sobre este propio repo para cerrar sus propias versiones — mezclaría contenido meta del framework con lo que se distribuye como plantilla genérica. El cierre de versión de este repo (`task.md`, `memory.md`, `walkthrough.md`, commit y tag) se hace manualmente, imitando la estructura que la Fase Ship generaría en un proyecto consumidor.


## 🗺️ Mapa de Relaciones
*Breve descripción de cómo interactúan los módulos actuales para ayudar a la IA a navegar el código.*

- **[Módulo/Componente]:** [Responsabilidad y Dependencias]
- *Ejemplo: `auth_service.js` gestiona el JWT y depende de `api_client.js`. (Borra esta línea de ejemplo al crear la primera entrada real).*

---

## 🧹 Política de Mantenimiento

*Aplicar en cada `/ship` de tipo Major, o cuando este fichero supere las 200 líneas activas:*

- **Consolida** decisiones relacionadas en una sola entrada.
- **Archiva** lecciones ya internalizadas en el código: muévelas a `memory.archive.md` (créalo si no existe).
- **Elimina** entradas que describan decisiones revertidas o ya obsoletas.
- **Objetivo:** mantener `memory.md` por debajo de ~200 líneas activas para que la IA pueda leerlo íntegramente en cada sesión sin pérdida de atención.
