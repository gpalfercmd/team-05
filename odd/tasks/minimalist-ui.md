# Feature: minimalist-ui

**Objective:** restyle the whole web app in the minimalist editorial style (the `minimalist-ui` skill), keeping ClearTrust's teal as the action color and the logo unchanged.

**Problem:** after the bold refresh (`odd/tasks/bold-refresh.md`, merged to `main`), the user invoked `/minimalist-ui` and chose "Minimal, keep teal" on 2026-10-02.

**Scope:**
- All pages: the home page `/`, `/claims`, `/claims/:id`, `/workspace` and not-found.
- The shell, the tokens, DESIGN.md and `.impeccable/design.json`.

**Out of scope:** contracts, backend, data, copy meaning, the logo mark, and teal as the interactive accent.

**Decisions:**
- **Canvas:** warm off-white (`#F7F6F3` / `#FBFBFA`) with white surfaces.
- **Cards:** flat, with a 1px `#EAEAEA` border, a radius of 12px or less, and generous padding. Shadows go, except a hover shadow of 0.04 alpha or less.
- **Type:**
  - Inter is replaced by a non-banned sans (Geist or Switzer).
  - Headings use an editorial serif (Newsreader or Instrument Serif) with tracking of -0.02 to -0.04em and a line-height of 1.1.
  - JetBrains Mono stays.
  - Body text uses `#2F3437` at a line-height of 1.6, and secondary text uses `#787774`.
- **Status tags:** small uppercase pills with wide tracking on pastel backgrounds. They keep an icon or text, so status is never shown by color alone.
- **Teal:** stays as the action color for primary buttons and links. Primary buttons get a 4–6px radius, no shadow, and `scale(0.98)` on press.
- **Banned:** gradients, large colored sections, pill-shaped large containers or buttons, emojis, and the banned words.
- **Layout:** large section whitespace, content width about `max-w-5xl`, and a bento grid where it helps (home page, workspace).
- **Motion:** reveals use 12px, 600ms and `cubic-bezier(0.16,1,0.3,1)`, staggered by 80ms. No bounce, and everything is off under reduced motion.
- **Dark mode:** must keep working, with warm dark equivalents and AA contrast.

**TDD:** strict TDD is on (set in the global CLAUDE.md). The runner is `pnpm vitest run` in `code/frontend`. Markup and behavior changes need a RED test first. Visual-only changes are checked in the browser.

**Delivery:** `ask-on-risk`, with about 800 authored lines forecast. The agent opens no PRs; the user merges and pushes.

## Tasks

- [x] **T1 Foundations:**
  - fonts (self-hosted packages)
  - tokens: canvas, ink, borders, pastel tags, radius and motion
  - flat surfaces
  - the shell (header and footer)
  - DESIGN.md
  - Route: delegated (writer).
- [x] **T2 Home page and claims index:**
  - an editorial serif hero
  - a bento about/how-it-works section
  - flat claim cards with pastel tags
  - Route: delegated (writer).
- [x] **T3 Claim page:** a flat verdict panel, a stepper, the file check and evidence in the new style. Route: delegated (writer).
- [x] **T4 Workspace and not-found:** a bento role grid and a flat action block. Route: delegated (writer).

## Acceptance

- Before and after screenshots of every page at 1280 and 375, light and dark, show the new style.
- `pnpm test`, `typecheck`, `lint` and `build` pass.
- No horizontal scroll at 375px.
- The Impeccable detector shows no new findings.

## Progress and evidence

Route for all tasks: delegated (writer). Detector run clean (0 findings) after one fix.

- T1 `f52a3bc` foundations (Geist, Newsreader, self-hosted JetBrains Mono; flat tokens; shell; DESIGN.md and design.json).
- T2 `ce8bea6` home and claims (RED: step numbers "01" and a named guarantees list failed with `['1','2','3']`; GREEN 5/5).
- T3 `ac0b1a8` claim page. T4 `053252b` workspace (via `6697ae6`, then a fix replacing a side stripe).
- Checks: `pnpm test` 565 passed, 8 skipped; `typecheck`, `lint`, `build` clean. No horizontal scroll at 375 or 1280; reduced motion leaves 0 hidden reveals.
- Lowest contrast: 4.62 (light Proof requested tag), 4.74, 4.98, 5.00; dark minimum 6.22. All AA.
- Screenshots: scratchpad `minimalist-ui/` (before-*, after-*, -dark, -reduced).
