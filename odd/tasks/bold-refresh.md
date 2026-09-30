# Feature: bold-refresh

**Objective:** make the web app visibly more intuitive and more attractive, keeping the ClearTrust brand and palette.

**Problem:** the frontend is correct but reads as flat and document-like. The user asked for "physical changes to the web, more intuitive and more aesthetic" and chose a **bold refresh**: same colors and brand, visibly new layouts. They also asked that it **not be static**: motion and interaction are part of the scope.

**Scope (authorized 2026-09-30):** the home page (`/`), the public claim page (`/claims/:id`), the workspace (`/workspace`) and the shared shell (header and footer).
**Out of scope:** the palette, fonts, brand mark, contracts, backend, and copy meaning (wording may be tightened).

**Constraints:**
- Follow `PRODUCT.md` and `DESIGN.md`. Update DESIGN.md where a pattern or token changes.
- WCAG 2.1 AA in light and dark; no horizontal scroll at 375px; `prefers-reduced-motion` respected.
- Invent no data (no organizations, numbers or testimonials).
- Branch `feat/bold-refresh`; Conventional Commits with no attribution; no push.

**TDD:** Strict TDD, enabled (source: global CLAUDE.md). Runner: `pnpm vitest run` in `code/frontend`. Markup and behavior changes need a failing test first (RED). Pure CSS is verified in the browser at 1280 and 375, light and dark, with screenshots.

**Delivery:** `ask-on-risk`. The forecast is about 1,200 authored lines, above 400, so a chain strategy is due before the second commit's PR (the user pushes; no PRs are opened by the agent).

## Tasks

- [x] **T1 Shared shell and rhythm:** header and footer, a section spacing scale, and a card and surface treatment reused by T2 to T4. Route: delegated (writer), since 2+ non-trivial files.
- [x] **T2 Home page:** a stronger hero (the Valencia case in one line, a primary "Look up a claim" action), the claims as scannable cards with status, and a three-step "how it works" visual. Route: delegated (writer).
- [x] **T3 Claim page:** a visual status timeline (anchored → internal review → auditor → Verified → dispute window), clearer grouping of the evidence and file check, and a more prominent verdict. Route: delegated (writer).
- [x] **T1b Motion foundation:** motion tokens (durations, easing), entrance reveals on scroll, hover and press feedback on cards and buttons, all disabled under `prefers-reduced-motion`. Reused by T2 to T4. Route: delegated (writer).
- [x] **T4 Workspace:** the role screens as cards, with "What needs your action" as a clear first block. Route: delegated (writer).

## Acceptance

- Each page is visibly different in before and after screenshots at 1280 and 375.
- `pnpm test`, `typecheck`, `lint` and `build` pass.
- The Impeccable detector finds no new issues.
- Every page has purposeful motion (reveals, an animated timeline, live hover and press states, animated state changes in the file check), and none of it runs with reduced motion on.

## Progress and evidence

Route: delegated (writer) for all tasks; trigger evidence: 2+ non-trivial files per task. Strict TDD, runner `pnpm vitest run`.

- T1 118d74d shell (tokens, raised card, blurred header, footer nav). RED: Footer.test (nav "Footer" missing), GREEN after Footer.tsx. CSS verified in browser.
- T1b 2c6b458 motion (Reveal, motion.css). RED: Reveal.test import failed, GREEN 4 tests. Hover/press CSS browser-only.
- T2 a2006fa home (hero + illustration, ClaimCard/StageDots, track). RED: DashboardPage.test 4 failing, StageDots import failed, stages.test import failed; GREEN after implementation.
- T3 4613ed9 claim page (ClaimProgress stepper, verdict panel, evidence group). RED: ClaimProgress.test 4 failing; GREEN. Match ring/shake animations are CSS only (browser-verified).
- T4 e6ccf64 workspace (needs-action first with count, RoleCards, panel header). RED: RoleCards import failed, 2 workspace tests failing; GREEN.
- 924c18c fix: detector findings (bounce easing, side-tab) plus DESIGN.md and .impeccable/design.json updated.
- Existing tests: none changed in meaning; added tests only (WorkspacePage.test gained 1 test and 1 assertion).
- Final checks in code/frontend: pnpm test 564 passed | 8 skipped (61 files); typecheck clean; lint clean; build ok.
- Browser: dev server on 5196 (demo data), no horizontal scroll at 1280 or 375 on any page; reduced motion emulated: reveals 0 hidden, animations none, transitions ~0.
- Screenshots: /private/tmp/claude-501/-Users-gpalfer-proof-for-aid-team-05/1531911e-dba4-4b15-a4e0-56a819b61154/scratchpad/bold-refresh/ (before-*, after-*, after-*-dark, after-*-reduced).
- Detector: only the pre-existing side-tab in global.css .notice (border-left 4px warning).
