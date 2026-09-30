---
name: ClearTrust
description: Check aid claims without exposing people.
colors:
  ledger-navy: "#1f3a5f"
  register-slate: "#4a6178"
  verification-teal: "#0f766e"
  ledger-paper: "#f7f8fa"
  page-white: "#ffffff"
  ink: "#1a2230"
  margin-grey: "#5b6675"
  hairline: "#d9dee5"
  rejection-red: "#b42318"
  verified-green: "#067647"
  caution-amber: "#b54708"
  brand-blue: "#2aa0fc"
  status-anchored-bg: "#eef2f6"
  status-anchored-fg: "#364152"
  status-internally-verified-bg: "#eff4ff"
  status-internally-verified-fg: "#1849a9"
  status-proof-requested-bg: "#fffaeb"
  status-proof-requested-fg: "#93370d"
  status-proof-submitted-bg: "#f4f3ff"
  status-proof-submitted-fg: "#5925dc"
  status-verified-bg: "#ecfdf3"
  status-verified-fg: "#067647"
  status-rejected-bg: "#fef3f2"
  status-rejected-fg: "#b42318"
  status-disputed-bg: "#fff4ed"
  status-disputed-fg: "#b93815"
typography:
  hero:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 1.25rem + 2.8vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  subheading:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    letterSpacing: "0.01em"
  caption:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  eyebrow:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
  xxl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.verification-teal}"
    textColor: "{colors.page-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.verification-teal}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.rejection-red}"
    textColor: "{colors.page-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.verification-teal}"
    rounded: "{rounded.sm}"
    padding: "4px"
    size: "32px"
  input:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  drop-zone:
    backgroundColor: "{colors.ledger-paper}"
    textColor: "{colors.margin-grey}"
    rounded: "{rounded.lg}"
    padding: "24px 16px"
  card:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  tile:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  status-badge:
    backgroundColor: "{colors.status-verified-bg}"
    textColor: "{colors.status-verified-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  header:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ledger-navy}"
    height: "64px"
  nav-link-active:
    backgroundColor: "{colors.ledger-paper}"
    textColor: "{colors.ledger-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  pill-tag:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.margin-grey}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  hash-display:
    textColor: "{colors.margin-grey}"
    typography: "{typography.mono}"
  verification-result:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  timeline-marker:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.margin-grey}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    size: "28px"
  timeline-marker-latest:
    backgroundColor: "{colors.verification-teal}"
    textColor: "{colors.page-white}"
  stat-value:
    textColor: "{colors.ledger-navy}"
    typography: "{typography.subheading}"
---

# Design System: ClearTrust

## Overview

**Creative North Star: "The Public Ledger"**

ClearTrust looks like a well-kept public register: calm, factual, record-like, with every line checkable and nothing decorative. The interface never performs trust with gloss or emphasis. It shows the record, the fingerprint of the record, and the verdict, in that order. Surfaces are near-white and near-grey, ink is navy-tinted, and one restrained teal marks what can be acted on.

The component philosophy is "quiet and precise": hairline borders, soft 8 to 12px corners, almost no shadow, like entries in a ledger. Density is moderate and record-like: label above value, one column, wide bands with generous vertical rhythm on marketing surfaces, tight audit-style lists inside the workspace. Motion only confirms a state change.

The brand commitment carried over from the product is the ClearTrust name in camel case, the mark in `code/frontend/src/components/CleartrustMark.tsx`, and the tagline "check aid claims without exposing people". Both light and dark themes are first class.

**Key Characteristics:**
- Flat by default: 1px hairlines carry structure, shadow is nearly absent.
- One interactive color (Verification Teal) on a navy and slate neutral field.
- Status is always icon plus label, never color alone.
- Hashes and addresses are monospaced, exact and copyable.
- Full-bleed bands alternate neutral and surface backgrounds.
- Motion is 150ms to 250ms, and fully removed under reduced-motion.

## Colors

A cool, low-chroma navy and slate field with a single teal accent; semantic reds, greens and ambers appear only to state a verdict.

### Primary
- **Ledger Navy** (`primary` role, `ledger-navy`): page titles (h1), navigation link text, stat values and the claim subnav links. It is the navigation and headline color, never a button fill.

### Secondary
- **Register Slate** (`register-slate`): quiet iconography (drop zone icon), the default border and tint of a neutral verification panel, and the outline of timeline markers.

### Tertiary
- **Verification Teal** (`verification-teal`): the only interactive color. Primary button fill, secondary button outline and text, links, the eyebrow, the focus ring, icon buttons, the active timeline marker, step numbers and the dot in a pill tag.

### Neutral
- **Ledger Paper** (`ledger-paper`): page background and the alternate band, step tiles, drop zone and the active nav pill.
- **Page White** (`page-white`): surface of cards, tiles, the header, inputs and alternate bands.
- **Ink** (`ink`): body text and wordmark base.
- **Margin Grey** (`margin-grey`): secondary text, leads, captions, hashes, labels.
- **Hairline** (`hairline`): every 1px border and divider, the dashed drop zone border and the timeline rule.

### Semantic
- **Rejection Red** (`rejection-red`): errors, invalid fields, the danger button, mismatch verdicts.
- **Verified Green** (`verified-green`): success notes and match verdicts.
- **Caution Amber** (`caution-amber`): warning notices, the demo-data pill and manifest-mismatch verdicts.

### Status pairs
Seven claim states each own a tinted background and a matching foreground, defined as the `status-*` colors: Anchored, InternallyVerified, ProofRequested, ProofSubmitted, Verified, Rejected, Disputed. Verified reuses the success hue and Rejected the error hue; the others are distinct hues so no two adjacent states blur together.

### Brand-only
- **Brand Blue** (`brand-blue`, with the mark gradient `#20c0f9`, `#28a6fd`, `#235fed`): appears only in the logo mark and the "trust" half of the wordmark.

### Dark theme
Dark mode applies through `prefers-color-scheme` unless `data-theme="light"` is set, or by `data-theme="dark"`. Roles keep the same names with lighter values, defined in `code/frontend/src/styles/tokens.css`: primary `#8fb3e0`, secondary `#9aa6b5`, accent `#2dd4bf`, neutral `#0f1620`, surface `#17212d`, on-surface `#e6eaf0`, on-neutral `#9aa6b5`, border `#2a3645`, error `#f97066`, success `#47cd89`, warning `#fdb022`. Status backgrounds become 16 to 18% alpha tints with lighter foregrounds.

### Named Rules
**The One Accent Rule.** Verification Teal is the only interactive color. Navy navigates and titles; it never fills a button.
**The Brand-Blue-Is-The-Mark Rule.** Brand Blue and its gradient belong to the logo mark and the "trust" half of the wordmark. Never use them for UI chrome, text or states.
**The Never Color-Only Rule.** A status or verdict always pairs its color with an icon and a text label.

## Typography

**Display and Body Font:** Inter (400, 500, 600, 700), with system-ui fallbacks
**Mono Font:** JetBrains Mono (400), with ui-monospace fallbacks. Both load from Google Fonts.

**Character:** Inter carries everything human; JetBrains Mono carries everything that must be compared character by character. The pairing reads as a form filled in beside a printout.

### Hierarchy
- **Hero** (700, `clamp(1.75rem, 1.25rem + 2.8vw, 3rem)`, 1.1, -0.02em): the landing headline only; it grows with width here and nowhere else.
- **Heading** (700, 1.75rem, 1.2, -0.02em): page and section titles.
- **Subheading** (600, 1.25rem, 1.3): card titles, stat values, verdict labels.
- **Body** (400, 1rem, 1.6): running text; keep leads near 40 to 44rem.
- **Label** (500, 0.875rem, 0.01em): buttons, badges, nav, field labels.
- **Caption** (0.75rem): hints, footers, step text.
- **Eyebrow** (500, 0.75rem, 0.08em, uppercase, teal): the small kicker above a section title.
- **Mono** (0.8125rem): hashes, transaction ids, addresses.

### Named Rules
**The Hash Is Mono Rule.** Hashes and addresses are always JetBrains Mono, middle-truncated where space is short, never wrapped mid-value, and always copyable.
**The One Voice Rule.** Only the hero scales fluidly; every other size is a fixed step of the scale.

## Layout

A single container of 1120px maximum width with a 16px gutter, becoming 24px from 768px. Breakpoints at 480, 768 and 960px: phones (480 and below) tighten bands, cards and grids; 768 lifts gutters and band padding; 960 places two-column screens side by side and the nav inline with the brand.

The spacing scale is 4, 8, 16, 24, 48 and 96px. Full-bleed bands hold 48px vertical padding (80px from 768px) and alternate Ledger Paper and Page White; their background bleeds to the viewport edge while the content keeps container width. Inner pages open with an eyebrow, title and lead above a hairline. Data reads as label above value in one column, like an audit record, on any width.

## Elevation & Depth

The system is flat. Depth is conveyed by 1px hairlines and by alternating band backgrounds, not by shadow. There is a single shadow token.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)`): used on `.card` and on the sticky claim subnav only.

### Named Rules
**The Flat-By-Default Rule.** Shadow appears only on `.card` and the claim subnav. Bordered tiles carry no shadow, and no element gains one on hover.
**The Hairline Rule.** Structure is a 1px Hairline border. Never a heavier stroke, except the dashed 2px drop zone and the 6px verdict edge.

## Shapes

Soft but disciplined: 4px (sm) for icon buttons, notices and skeleton blocks, 8px (md) for buttons, inputs, nav and panels, 12px (lg) for cards, tiles, principle grids and the drop zone, and full (9999px) for pills, badges, nav links and timeline markers. Borders are 1px hairlines everywhere; buttons use a 1.5px border so the outlined variant holds its line. The drop zone is the only dashed border (2px). A verdict panel is the only shape with a thick edge: a 6px left border in the result color.

## Components

Quiet and precise: every component is a bordered plain surface with a single teal signal.

### Buttons
- **Shape:** medium radius (8px), padding 10px 20px, 1.5px border, label type (0.875rem, 500).
- **Primary:** Verification Teal fill, white text; hover mixes 15% ink into the fill.
- **Secondary:** transparent, teal text and 1.5px teal outline; hover adds a 10% teal tint.
- **Danger:** Rejection Red fill, white text, same hover mix.
- **Touch:** minimum height 44px on coarse pointers. Disabled drops to 60% opacity.
- **Icon button:** 32px minimum square, 4px padding, 4px radius, teal glyph, 10% teal tint on hover (24px in-sentence variant).

### Inputs and the drop zone
- **Field:** Page White, 1px Hairline border, 8px radius, 10px 12px padding, label above at 600 weight; hint and error text in caption size.
- **Focus:** the global focus ring only; inputs have no separate focus border.
- **Invalid:** border turns Rejection Red, with the message below.
- **Drop zone:** Ledger Paper, 2px dashed Hairline border, 12px radius, centered icon, hint and button. While dragging, border turns teal with an 8% teal tint.

### Cards and tiles
- **Card:** Page White, 12px radius, 24px padding, the one card shadow, no border.
- **Bordered tile:** Page White, 1px Hairline, 12px radius, 24px padding, no shadow (claim cards, principles cells).

### Status badge
Pill (9999px), 2px 10px padding, label type, icon plus label inside a tinted background from the seven status pairs. Never color alone.

### Header and navigation
Sticky, Page White, 1px bottom hairline, 64px tall (56px on phones), brand left, actions right. Below 960px the nav wraps to its own row, so its real height is published as the `--header-h` custom property; every sticky offset and jump-target `scroll-margin-top` is built from it. Nav links are Ledger Navy with a 6px 14px pill; hover and the current page share the same treatment: Ledger Paper fill with an inset 1px Hairline. No underlines.

### Eyebrow and pill tag
The eyebrow is a caption-size, 500, 0.08em uppercase teal kicker. The pill tag is a Page White capsule with a 1px hairline, 4px 12px padding and a 6px teal dot.

### Hash display
Mono value in Margin Grey followed by a copy icon button, never wrapping; an overlong value scrolls inside its own box.

### Verification result
A tinted panel: 8% result-color wash and a 55% result-color 1px border, no thick side edge (green for match, red for mismatch, amber for manifest mismatch, slate by default and for the neutral "Incomplete" state). Icon in the result color, all text in Ink so contrast holds in both themes. Two fingerprints are compared like with like (the value computed from the visitor's file, then the fingerprint listed for it); the anchored bundle root sits apart as a caption, the link in the chain. It reveals with a 250ms fade and 4px rise.

### Verdict line
One subheading-size line under the claim title (`Verified · checked by 2 internal reviewers and 1 independent auditor · 1 dispute, dismissed`), built only from facts the page already holds and omitting any that is unknown, followed by the primary "Check a file" button.

### Numbered timeline
An ordered list on a 2px Hairline rule. Each entry has a 28px circle marker with the step number; the latest step fills teal. Entries fade in over 250ms.

### Stat row
A hairline-topped grid, two columns (four from 768px): value in Ledger Navy at subheading size and 700, label below in uppercase caption at 0.06em in Margin Grey.

### Skeleton
Rounded 4px blocks with a 12 to 22% grey shimmer sweeping in 1.2s, sized to the final content so nothing jumps.

## Do's and Don'ts

### Do:
- **Do** use Verification Teal as the only interactive color (buttons, links, focus ring, eyebrow).
- **Do** pair every status and verdict with an icon and a label.
- **Do** show hashes and addresses in JetBrains Mono, copyable, never wrapped mid-value.
- **Do** separate content with 1px Hairline borders, and keep shadow to `.card` and the claim subnav.
- **Do** use the 2px teal focus outline with a 2px offset on every interactive element.
- **Do** alternate full-bleed bands between Ledger Paper and Page White.
- **Do** honor `prefers-reduced-motion` and keep motion to 150ms or 250ms on `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Do** keep 44px minimum touch height for buttons on coarse pointers.

### Don't:
- **Don't** use Brand Blue or the mark gradient for UI chrome, text or states.
- **Don't** convey status by color alone.
- **Don't** underline navigation links; the current page is a neutral pill with an inset border.
- **Don't** add shadows to bordered tiles or to hover states.
- **Don't** add decoration that is not part of the record.
- **Don't** give inputs a separate focus border; the global ring is the focus treatment.
- **Don't** use Ledger Navy as a button fill.
