---
name: ClearTrust
description: Check aid claims without exposing people.
colors:
  charcoal: "#1c1e20"
  stone: "#5f5e5b"
  verification-teal: "#0f766e"
  bone: "#f7f6f3"
  page-white: "#ffffff"
  ink: "#2f3437"
  margin-grey: "#6b6a67"
  hairline: "#eaeaea"
  rejection-red: "#9f2f2d"
  verified-green: "#346538"
  caution-amber: "#956400"
  brand-blue: "#2aa0fc"
  status-anchored-bg: "#efeeeb"
  status-anchored-fg: "#4a4946"
  status-internally-verified-bg: "#e1f3fe"
  status-internally-verified-fg: "#1f6c9f"
  status-proof-requested-bg: "#fbf3db"
  status-proof-requested-fg: "#956400"
  status-proof-submitted-bg: "#f0ebf8"
  status-proof-submitted-fg: "#5b3e96"
  status-verified-bg: "#edf3ec"
  status-verified-fg: "#346538"
  status-rejected-bg: "#fdebec"
  status-rejected-fg: "#9f2f2d"
  status-disputed-bg: "#fbece0"
  status-disputed-fg: "#9a4a12"
typography:
  hero:
    fontFamily: "'Newsreader Variable', 'Newsreader', 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(2.5rem, 1.4rem + 4.4vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.04em"
  heading:
    fontFamily: "'Newsreader Variable', 'Newsreader', 'Iowan Old Style', Georgia, serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  subheading:
    fontFamily: "'Newsreader Variable', 'Newsreader', 'Iowan Old Style', Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Geist Variable', 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Geist Variable', 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  caption:
    fontFamily: "'Geist Variable', 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  eyebrow:
    fontFamily: "'Geist Variable', 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.1em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
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
    backgroundColor: "{colors.page-white}"
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
    backgroundColor: "{colors.bone}"
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
    padding: "32px"
  status-badge:
    backgroundColor: "{colors.status-verified-bg}"
    textColor: "{colors.status-verified-fg}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  header:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.margin-grey}"
    height: "64px"
  nav-link-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "0"
    padding: "6px 2px"
  pill-tag:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.margin-grey}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
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
    textColor: "{colors.charcoal}"
    typography: "{typography.heading}"
---

# Design System: ClearTrust

## Overview

**Creative North Star: "The Quiet Register"**

ClearTrust reads like a printed register set in a good editorial typeface: a warm off-white page, white flat cells separated by hairlines, charcoal text, and one teal signal on what can be acted on. It never performs trust with gloss, shadow or color. It shows the record, the fingerprint of the record, and the verdict, in that order. This is the minimalist editorial restyle of 2026-10-02 (the `minimalist-ui` skill, "Minimal, keep teal"); it replaces the raised, navy-tinted bold refresh.

The component philosophy is flat and typographic. Structure comes from whitespace and a 1px hairline, never from a resting shadow. Headings are an editorial serif with tight tracking; everything you read or click is a clean sans; everything you compare character by character is mono. Density is relaxed on the public surfaces (large section whitespace, a container of about 1024px, bento grids) and audit-like inside the workspace. Motion is quiet and structural: blocks rise 12px as they scroll into view, and everything is off under reduced motion.

The brand commitments carry over unchanged: the ClearTrust name in camel case, the mark in `code/frontend/src/components/CleartrustMark.tsx` (its brand blue stays the mark's own), and the tagline "check aid claims without exposing people". Light and dark are both first class; dark uses warm charcoal, not blue-black.

**Key Characteristics:**
- Flat, not glossy: 1px hairline borders, no resting shadow, no gradients.
- One interactive color (Verification Teal) on a warm monochrome field; pastels only mark status.
- Serif headings, sans body, mono fingerprints.
- Status is always icon plus label, never color alone.
- Hashes and addresses are monospaced, exact and copyable.
- Bento grids on the home page and the workspace roles; wide margins between sections.
- Motion: 12px, 600ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 80ms stagger; none under reduced motion.

## Colors

A warm, low-chroma monochrome with a single teal accent. Reds, greens, ambers and blues appear only as small status pastels or to state a verdict.

### Primary
- **Charcoal** (`primary` role, `charcoal`, `#1c1e20`): titles, stat values and the strongest text. It is never a button fill (buttons are teal).

### Secondary
- **Stone** (`stone`, `#5f5e5b`): quiet outlines, such as the timeline marker.

### Tertiary
- **Verification Teal** (`verification-teal`, `#0f766e`): the only interactive color. Primary button fill, links, the focus ring, icon buttons, the current-page underline in the nav, the latest timeline marker, the "needs your action" border and the file-check accent.

### Neutral
- **Bone** (`bone`, `#f7f6f3`): the page canvas, the header, the footer, drop zone and inset panels.
- **Page White** (`page-white`, `#ffffff`): every card, tile, input and alternate band.
- **Ink** (`ink`, `#2f3437`): body text. Never pure black.
- **Margin Grey** (`margin-grey`, `#6b6a67`): secondary text, captions, eyebrows, nav links, hashes. Chosen to hold 5.0:1 on the canvas (the skill's `#787774` is 4.0:1 there).
- **Hairline** (`hairline`, `#eaeaea`): every 1px border and divider.

### Semantic
- **Rejection Red** (`#9f2f2d`): errors, invalid fields, the danger button, mismatch verdicts.
- **Verified Green** (`#346538`): success notes and match verdicts.
- **Caution Amber** (`#956400`): warning notices, the demo-data tag and manifest-mismatch verdicts.

### Status pairs
Seven claim states each own a washed-out pastel background and a matching foreground (`status-*`): Anchored (stone), InternallyVerified (pale blue), ProofRequested (pale yellow), ProofSubmitted (pale violet), Verified (pale green), Rejected (pale red), Disputed (pale orange). Each is shown as a small uppercase tag with an icon and the state's name.

### Brand-only
- **Brand Blue** (`brand-blue`, with the mark gradient `#20c0f9`, `#28a6fd`, `#235fed`): only in the logo mark and the "trust" half of the wordmark.

### Dark theme
Dark mode applies through `prefers-color-scheme` unless `data-theme="light"` is set, or by `data-theme="dark"`. Warm equivalents, defined in `code/frontend/src/styles/tokens.css`: primary `#f2f0eb`, accent `#2dd4bf`, canvas `#191918`, surface `#202020`, on-surface `#e6e4df`, on-neutral `#a3a19b`, border `#2f2f2d`, error `#f0928d`, success `#86c98f`, warning `#e3b655`. Status backgrounds become 16 to 17% alpha tints with lighter foregrounds.

Measured contrast (WCAG 2.1, text on its background): the lowest pairs are 4.62:1 (light, Proof requested tag), 4.74:1 (warning text on the canvas), 4.98:1 (light, Internally verified tag) and 5.00:1 (secondary text on the canvas). Dark theme's lowest is 6.22:1 (Rejected tag). All are AA.

### Named Rules
**The One Accent Rule.** Verification Teal is the only interactive color. Charcoal and ink read; they never fill a button.
**The Brand-Blue-Is-The-Mark Rule.** Brand Blue and its gradient belong to the logo mark and the "trust" half of the wordmark.
**The Never Color-Only Rule.** A status or verdict always pairs its color with an icon and a text label.
**The Scarce Color Rule.** Outside status tags, the page is monochrome plus teal. No colored sections.

## Typography

**Heading Font:** Newsreader Variable (400 and 500, plus italic), self-hosted with `@fontsource-variable/newsreader`.
**Body Font:** Geist Variable (400 to 600), self-hosted with `@fontsource-variable/geist`.
**Mono Font:** JetBrains Mono (400), self-hosted with `@fontsource/jetbrains-mono`. No font is loaded from a third party.

**Character:** the serif carries the voice, the sans carries the interface, the mono carries what must be compared character by character.

### Hierarchy
- **Hero** (serif 400, `clamp(2.5rem, 1.4rem + 4.4vw, 4.5rem)`, 1.04, -0.04em): the landing headline only; the key phrase is set in italic with a teal underline.
- **Heading** (serif 400, 2rem, 1.1, -0.03em): section titles. Inner-page titles scale up to 3.5rem.
- **Subheading** (serif 500, 1.375rem, 1.2, -0.02em): card titles, verdict labels. The claim verdict sentence is serif 1.625rem.
- **Body** (sans 400, 1rem, 1.6, ink): running text; keep leads near 40 to 44rem.
- **Label** (sans 500, 0.875rem): buttons, nav, field labels.
- **Caption** (0.75rem): hints, footers, step text.
- **Eyebrow and tag** (sans 500 to 600, 0.75rem, 0.06 to 0.1em, uppercase): section kickers, status tags, the demo-data tag.
- **Mono** (0.8125rem): hashes, transaction ids, addresses, step numbers.

### Named Rules
**The Hash Is Mono Rule.** Hashes and addresses are always JetBrains Mono, middle-truncated where space is short, never wrapped mid-value, and always copyable.
**The Plain Language Rule.** Say it plainly, first. No hype words (elevate, seamless, unleash, next-gen, game-changer, delve).

## Layout

A single container of 1024px maximum width with a 16px gutter, becoming 24px from 768px. Breakpoints at 480, 768 and 960px.

The spacing scale is 4, 8, 16, 24, 48 and 96px. Bands hold generous vertical padding (`--space-section`, `clamp(64px, 9vw, 120px)`) and alternate Bone and Page White; their background bleeds to the viewport edge while the content keeps the container width. Inner pages open with an eyebrow, a large serif title and a lead above a hairline, no panel. Grids are bento: the home how-it-works row is three flat cells (the first wider), the workspace role cards tile a six-column grid in alternating 4/2, 2/4 and 3/3 spans.

## Elevation & Depth

Depth comes from hairlines and whitespace. Surfaces are flat.

### Shadow Vocabulary
- **None at rest** (`--shadow-raised`, `--shadow-card`: `none`).
- **Hover lift** (`--shadow-lift`: `0 2px 8px rgba(0,0,0,0.04)`): the only shadow in the system, on cards that lead somewhere, with the border warming to a teal tint.

### Named Rules
**The Flat Rule.** No resting shadow, no gradient, no glass. The sticky header's backdrop blur is the only blur.
**The Earned-Lift Rule.** Only surfaces that lead somewhere (claim cards, role cards, action items, the workspace teaser) take the hover shadow; static cards do nothing.
**The Hairline Rule.** Structure is a 1px hairline. The one teal border marks "What needs your action".

## Motion

Tokens: `--duration-fast` 150ms, `--duration-panel` 200ms, `--duration-enter` 600ms, `--duration-draw` 800ms, `--ease-out` and `--ease-standard` both `cubic-bezier(0.16, 1, 0.3, 1)`, `--stagger` 80ms. No bounce or elastic easing.
- **Reveal:** `<Reveal>` fades a block up 12px over 600ms the first time it scrolls into view (IntersectionObserver, once), staggered by 80ms per `delay` step. It starts revealed when there is no observer or under reduced motion.
- **Feedback:** buttons change color and press to `scale(0.98)`; no lift. Interactive cards take the hover shadow.
- **Drawn progress:** the claim stepper's rail, the card stage bars and the home bridge line draw in after the block is revealed.
- **File check result:** a short fade and a small icon settle; the label, icon and sentence carry the verdict, never motion.
- Every moving rule sits inside `@media (prefers-reduced-motion: no-preference)`; the global reduce rule also collapses any remaining animation and transition.

## Shapes

Crisp: 4px (sm) for icon buttons, notices, small tags and the match tag, 6px (md) for buttons, inputs and inset panels, 12px (lg) for cards, tiles and the drop zone. Pills (9999px) are for small status tags, the demo tag and dots only, never for large containers or buttons. Borders are 1px hairlines everywhere; the drop zone's is dashed.

## Components

### Buttons
- **Shape:** 6px radius, padding 10px 20px, 1px border, label type.
- **Primary:** Verification Teal fill, white text, no shadow; hover mixes 15% ink into the fill; press `scale(0.98)`.
- **Secondary:** Page White with a hairline border and teal text; hover adds a 7% teal tint and a teal-tinted border.
- **Danger:** Rejection Red fill, white text.
- **Touch:** minimum height 44px on coarse pointers. Disabled drops to 60% opacity.
- **Icon button:** 32px minimum square, 4px radius, teal glyph.

### Inputs and the drop zone
- **Field:** Page White, 1px hairline, 6px radius, 10px 12px padding, label above at 600 weight.
- **Focus:** the global 2px teal ring with a 2px offset.
- **Invalid:** border turns Rejection Red with the message below.
- **Drop zone:** Bone, 1px dashed hairline, 12px radius; hover warms the border to teal.

### Cards and tiles
- **Card:** Page White, 1px hairline, 12px radius, 24px padding (32px from 768px), flat. `.card--interactive` adds the hover shadow.
- **Claim card:** the same surface, with a status tag, a four-segment progress bar (count also as text), the claim ID and one action whose link stretches over the whole card.
- **Inner-page header:** open, no box: eyebrow, serif title, lead, a hairline below. Shared by claim, claims and workspace.
- **Hero:** split on wide screens: serif headline with an italic, teal-underlined key phrase, the one-line Valencia case, a primary "Look up a claim" action, and a flat illustration card (labelled Illustration) of a file check with real demo values.
- **Progress stepper (claim page):** five steps, each a 40px square marker with a mono number or check, its label, its state written out, and a date only where the claim's own events give one.
- **Role card:** one per role in the workspace; the connected wallet's is marked "Your role" in text.

### Status tag
Small uppercase pill (0.75rem, 600, 0.06em), 2px 10px padding, icon plus label on a pastel background. Never color alone.

### Header and navigation
Sticky, Bone with a 12px backdrop blur, 1px bottom hairline, 64px tall (56px on phones), brand left, actions right. Below 960px the nav wraps to its own row, so its real height is published as `--header-h`. Nav links are margin-grey text; hover goes to ink; the current page is ink with a 1px teal underline. No pills.

### Hash display
Mono value in Margin Grey followed by a copy icon button, never wrapping; an overlong value scrolls inside its own box.

### Verification result
A tinted panel: 8% result-color wash and a 55% result-color 1px border (green for match, red for mismatch, amber for manifest mismatch, neutral by default). Icon in the result color, all text in ink so contrast holds in both themes. The two fingerprints are compared like with like. A 600ms fade and a small icon settle.

### Verdict line
One serif sentence under the claim title, built only from facts the page already holds, followed by the primary "Check a file" button.

### Numbered timeline
An ordered list on a 1px hairline rule. Each entry has a 28px circle marker with the step number; the latest step fills teal.

### Stat row
A hairline-topped grid, two columns (four from 768px): value in serif 1.75rem, label below in uppercase caption at 0.06em in Margin Grey.

### Skeleton
4px blocks pulsing between full and 45% opacity (no gradient sweep), sized to the final content so nothing jumps.

## Do's and Don'ts

### Do:
- **Do** use Verification Teal as the only interactive color (buttons, links, focus ring, the current-page underline).
- **Do** pair every status and verdict with an icon and a label.
- **Do** show hashes and addresses in JetBrains Mono, copyable, never wrapped mid-value.
- **Do** separate content with 1px hairlines and whitespace; give the hover shadow only to surfaces that lead somewhere.
- **Do** use the 2px teal focus outline with a 2px offset on every interactive element.
- **Do** keep real data: no invented organizations, numbers, testimonials or photos. Use line patterns and SVG primitives.
- **Do** honor `prefers-reduced-motion`: every moving rule lives inside `no-preference`, and content is fully visible without motion.
- **Do** keep 44px minimum touch height for buttons on coarse pointers.

### Don't:
- **Don't** use gradients, colored sections, glass or resting shadows.
- **Don't** use pill shapes for large containers, cards or buttons.
- **Don't** use Brand Blue or the mark gradient for UI chrome, text or states.
- **Don't** convey status by color alone.
- **Don't** use emojis or the words elevate, seamless, unleash, next-gen, game-changer or delve.
- **Don't** use bounce or elastic easing, or let motion carry a verdict on its own.
- **Don't** use Inter, or load any font from a third party.
- **Don't** use Charcoal or Ink as a button fill.
