# 🎨 Design System: Proof of Aid — Team 05

> **Phase:** P5.1 (moved from `/spec`, see `memory.md`)
> **Status:** Validated baseline — extend, don't replace
> **Last Review:** 2026-09-24
> **Applies to:** `code/frontend/` (React + Vite + TypeScript)

---

> 📐 Inspired by the **[design.md](https://github.com/google-labs-code/design.md)** format from Google Labs — an open format that describes visual identity to coding agents.

---

```yaml
# ────────────────────────────────────────────────
# DESIGN TOKENS — readable by people and machines
# ────────────────────────────────────────────────
version: alpha
name: "Proof of Aid"
description: "Calm, institutional and evidence-first. Looks like an audit record, not a crypto app: plain language, generous whitespace, one clear action per screen, and verification results that cannot be misread."

colors:
  primary:      "#1F3A5F"   # ink navy — brand, headers, navigation
  secondary:    "#4A6178"   # slate — borders, supporting UI
  accent:       "#0F766E"   # teal — the only colour for actions (buttons, links, focus)
  neutral:      "#F7F8FA"   # page background
  surface:      "#FFFFFF"   # cards, panels, modals
  on-primary:   "#FFFFFF"   # text on primary / accent
  on-surface:   "#1A2230"   # main text
  on-neutral:   "#5B6675"   # muted text, captions
  border:       "#D9DEE5"   # hairlines, input borders
  error:        "#B42318"
  success:      "#067647"
  warning:      "#B54708"

dark:
  primary:      "#8FB3E0"
  secondary:    "#9AA6B5"
  accent:       "#2DD4BF"
  neutral:      "#0F1620"
  surface:      "#17212D"
  on-primary:   "#0F1620"   # dark text on the bright dark-mode accent
  on-surface:   "#E6EAF0"
  on-neutral:   "#9AA6B5"
  border:       "#2A3645"
  error:        "#F97066"
  success:      "#47CD89"
  warning:      "#FDB022"

# One badge per IClaimRegistry.ClaimStatus (code/shared/abi/claim-status.json).
# Each pair passes WCAG AA for text. Colour is never the only signal: always icon + label.
status:
  Anchored:           { bg: "#EEF2F6", fg: "#364152", icon: "anchor",        label: "Anchored" }
  InternallyVerified: { bg: "#EFF4FF", fg: "#1849A9", icon: "user-check",    label: "Internally verified" }
  ProofRequested:     { bg: "#FFFAEB", fg: "#93370D", icon: "help-circle",   label: "Proof requested" }
  ProofSubmitted:     { bg: "#F4F3FF", fg: "#5925DC", icon: "file-plus",     label: "Proof submitted" }
  Verified:           { bg: "#ECFDF3", fg: "#067647", icon: "shield-check",  label: "Verified" }
  Rejected:           { bg: "#FEF3F2", fg: "#B42318", icon: "x-octagon",     label: "Rejected" }
  Disputed:           { bg: "#FFF4ED", fg: "#B93815", icon: "alert-triangle", label: "Disputed" }
status-dark:
  # Same hues, inverted: tinted text on a low-alpha background of the same hue.
  Anchored:           { bg: "rgba(154,166,181,0.16)", fg: "#C3CCD8" }
  InternallyVerified: { bg: "rgba(83,138,245,0.18)",  fg: "#A4C2FF" }
  ProofRequested:     { bg: "rgba(253,176,34,0.16)",  fg: "#FEC84B" }
  ProofSubmitted:     { bg: "rgba(155,138,251,0.18)", fg: "#BDB4FE" }
  Verified:           { bg: "rgba(71,205,137,0.16)",  fg: "#75E0A7" }
  Rejected:           { bg: "rgba(249,112,102,0.16)", fg: "#FDA29B" }
  Disputed:           { bg: "rgba(247,144,9,0.16)",   fg: "#FDB022" }

typography:
  heading:    { fontFamily: "Inter", fontSize: 1.75rem, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }
  subheading: { fontFamily: "Inter", fontSize: 1.25rem, fontWeight: 600, lineHeight: 1.3 }
  body:       { fontFamily: "Inter", fontSize: 1rem,    fontWeight: 400, lineHeight: 1.6 }
  label:      { fontFamily: "Inter", fontSize: 0.875rem, fontWeight: 500, letterSpacing: "0.01em" }
  caption:    { fontFamily: "Inter", fontSize: 0.75rem, fontWeight: 400 }
  mono:       { fontFamily: "JetBrains Mono", fontSize: 0.8125rem, fontWeight: 400 }  # hashes, addresses, tx ids

rounded: { none: 0px, sm: 4px, md: 8px, lg: 12px, full: 9999px }
spacing: { xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 48px, xxl: 96px }
shadow:
  card: "0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)"
layout:
  maxWidth: 1120px
  gutterMobile: 16px

components:
  button-primary:   { backgroundColor: "{colors.accent}", textColor: "{colors.on-primary}", typography: "{typography.label}", rounded: "{rounded.md}", padding: "10px 20px" }
  button-secondary: { backgroundColor: "transparent", textColor: "{colors.accent}", border: "1.5px solid {colors.accent}", rounded: "{rounded.md}", padding: "10px 20px" }
  button-danger:    { backgroundColor: "{colors.error}", textColor: "{colors.on-primary}", rounded: "{rounded.md}", padding: "10px 20px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", padding: "{spacing.lg}", shadow: "{shadow.card}" }
  input:            { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", border: "1px solid {colors.border}", rounded: "{rounded.md}", padding: "10px 12px" }
  input-focus:      { border: "2px solid {colors.accent}" }
  status-badge:     { typography: "{typography.label}", rounded: "{rounded.full}", padding: "2px 10px", gap: "6px" }
  hash:             { typography: "{typography.mono}", textColor: "{colors.on-neutral}" }
```

---

## Overview

The interface must feel like an **audit record**: calm, precise and trustworthy. Donors and auditors are not crypto users, so the UI talks about *evidence*, *checks* and *approvals*, never about gas or blocks unless asked. Two things must be impossible to misread: **a claim's status** and **the result of a verification**.

Plain-language rule: every blockchain concept gets a human label first and the technical value second (e.g. "Recorded on Arbitrum Sepolia · tx 0x3f2a…1b73").

---

## 🎨 Colours

- **Primary (`#1F3A5F`):** brand and navigation only. Never for buttons.
- **Accent (`#0F766E`):** the only colour for actions — buttons, links, focus rings. If it is teal, it is clickable.
- **Neutral / Surface:** off-white page, white cards; content sits on cards.
- **Error / Success / Warning:** system feedback only, never decoration. Success green is reserved for "Verified" and "Evidence matches".
- **Status colours:** one fixed pair per `ClaimStatus` (tokens above). Always shown with icon + text label, so they work for colour-blind users and in greyscale screenshots.

### Dark mode
Follows `prefers-color-scheme`, with a manual toggle. Deep blue-greys instead of pure black; accent becomes bright teal with dark text on it; status badges switch to tinted text on low-alpha backgrounds of the same hue.

---

## ✍️ Typography

- **Inter** for all UI text (Google Fonts, fallback `system-ui, -apple-system, Segoe UI, sans-serif`).
- **JetBrains Mono** only for machine values: hashes, addresses, transaction ids, claim ids.
- Headings use slight negative tracking; body uses line-height 1.6.
- **Do not:** mix more than these two families, or set hashes in a proportional font (characters must line up for visual comparison).

---

## 🧩 Key Components

### StatusBadge
Pill with icon + label from the `status` tokens. Used in lists, claim headers and timeline entries. Never recoloured locally.

### HashDisplay
Monospace, truncated in the middle (`0x3f2a…1b73`), with a copy button and full value in a tooltip / `title`. Links to Arbiscan when it is an address or tx. Never wraps mid-value on mobile; scrolls horizontally inside its own box instead.

### Timeline
Vertical list, newest at the bottom (a claim reads as a story). Each entry: StatusBadge of the new status, human sentence ("Auditor 0xab…12 requested more proof"), time, HashDisplay of the tx. Entries come from contract events; a small "read from the blockchain" note builds trust.

### VerificationResult (the jury-facing component)
Big, unmissable panel after re-hashing a file in the browser:
- **Match:** success colours, `shield-check` icon, "This file is exactly the one recorded on {date}."
- **Mismatch:** error colours, `x-octagon` icon, "This file does not match the recorded evidence. It was changed or is a different file."
- **Private file:** neutral colours, `lock` icon, "This file is private to protect beneficiaries. Only its fingerprint is public."
Always shows the computed hash vs the onchain root, both in HashDisplay.

### TxButton
Primary button that reflects the transaction lifecycle: *idle → Confirm in wallet… → Recording on blockchain… → Done ✓ / Failed (reason)*. Disabled while pending. Maps the contract's custom errors to plain sentences (e.g. `SameVerifierAsCheckpoint1` → "A different internal verifier must confirm this proof.").

### RoleBanner
Thin bar under the header showing the connected wallet's role (Organization, Internal verifier, Auditor, Accreditation Authority, Registry Admin, or "Public visitor"). Actions a role cannot take are hidden, not just disabled.

### Cards & forms
Cards: surface, radius lg, soft shadow, padding lg. Forms: one column, label above input, helper text in caption style, a single primary action at the bottom right.

---

## ✨ Motion & Interaction

- **Durations:** 150ms for hover/focus, 250ms for panels and the VerificationResult reveal.
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Principle:** motion only confirms state changes (a timeline entry appearing, a result revealed). No decorative animation.
- **Reduced motion:** respect `prefers-reduced-motion` — instant changes.

---

## ♿ Accessibility

- WCAG AA contrast for all text (tokens chosen for it; re-check any new colour).
- Visible focus ring (2px accent) on every interactive element; full keyboard use.
- Status and verification never rely on colour alone.
- Layout works from 360px wide: single column, 16px gutters, no horizontal page scroll.

---

## Design Decisions

- **2026-09-24 — Audit-record look, not crypto look:** the audience (donors, auditors, NGOs) must trust the page without web3 knowledge; hence plain language first, technical values second.
- **2026-09-24 — Danger button text uses `on-primary`:** white on the light error red (6.6:1) but dark text on the brighter dark-mode red (6.5:1); white on `#F97066` fails WCAG AA.
- **2026-09-24 — Private files are shown, not hidden:** the public page lists private files with a lock and their fingerprint, so visitors see that evidence exists even when they cannot see it.
- **2026-09-24 — FileDropZone (P5.4):** drag-and-drop area that is also a real file input (keyboard reachable, 2px accent focus ring). Copy states that files never leave the browser, because that is what makes a donor willing to drop evidence in.
- **2026-09-24 — Verification summary tiles (P5.4):** checkpoint 1, assigned auditor, final attestation and dispute as four small cards above the timeline, so the answer to "who checked this?" is visible before reading the story.
- **2026-09-24 — "File list altered" state (P5.4):** a fourth VerificationResult state in warning colours (`alert-triangle`) when a manifest's recomputed root differs from the onchain root. It is distinct from a file mismatch: the list, not the file, was tampered with.
- **2026-09-25 — Role screens (P5.3):** the dashboard's "Your wallet" card holds one action form per allowed action (label above input, caption hint, buttons bottom right; danger buttons for reject / revoke / uphold). A chosen claim opens in a neutral-background panel whose heading takes focus; the panel keeps a "Done ✓ … on {chain}" line with the transaction after the claim moves on and its form disappears. TxStatus is a live region under each form that takes focus when the transaction ends; errors are linked to inputs with `aria-describedby`. Multi-step evidence actions show a numbered step list ("Done ✓" / "In progress…", never colour alone).
- **2026-09-24 — Notices (P5.4):** "Read directly from the blockchain" / "Demo data" notes use caption text on the neutral surface with an icon; explorer links are hidden in demo mode because demo transaction hashes are not real.

---

**AI instruction:** Read and respect the tokens and decisions in this file. If you need a component that is not defined here, extrapolate from the existing tokens and record it under "Design Decisions" with date and rationale.
