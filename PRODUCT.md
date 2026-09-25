# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: public verifiers.** Donors, journalists and members of the public who open a claim's public page to understand what was claimed, who checked it, and whether the evidence is unchanged. They have no wallet and no login, and they may re-check public files in their browser. When design decisions conflict, this user wins.
- **Operators:** the roles who sign actions with a wallet on `/workspace`: the organization, two internal verifiers, the accredited auditor, the Accreditation Authority and the Registry Admin.
- **Evaluators:** the Proof of Aid hackathon jury, who see the product through a demo.

## Product Purpose

ClearTrust records aid evidence, has it checked in two stages, and lets anyone confirm it was not changed, without exposing the people it protects. Evidence stays encrypted offchain; only fingerprints (Merkle roots) and lifecycle events are anchored on Arbitrum. Success means a public verifier can open a claim and understand, in seconds and without trusting the backend, whether the claim is verified and whether a file matches.

## Positioning

ClearTrust proves integrity, not truth. It shows that the evidence reviewed is the evidence that was submitted, who reviewed it, which controls ran, and how the decision evolved, including disputes. It does this without publishing any beneficiary's personal data. It does not claim that a photograph or document is inherently truthful.

## Operating Context

- **Framing case:** 500 food kits delivered to 500 families after the Valencia floods (see `docs/ARCHITECTURE.md` A.1). The actors are fictional: Alimentos del Levante Foundation (organization), Laura and Miguel (internal verifiers), AuditAid Iberia (auditor), and the Regional Aid Oversight Authority.
- **Claim lifecycle, enforced onchain:** anchor → internal review → auditor assigned → optional proof loop → final approval → Verified.
  - Within 60 days of the first Verified, a claim can be disputed with a bond; after that it is settled.
  - Deposits, rewards and penalties move in native ETH through pull payments.
- **Surfaces:**
  - `/`: the public story and the claims
  - `/claims/:id`: the public claim record and in-browser file check
  - `/workspace`: the role screens and "What needs your action"
- **Runs on:** Arbitrum Sepolia (testnet), a local anvil chain, or a demo/mock mode with no chain.

## Capabilities and Constraints

- **Hackathon prototype:** testnet only; no real funds, users or beneficiaries.
- **Status and fingerprints** always come from the contract, never from the backend alone.
- **Private files** are shown to outsiders as fingerprints only. Salted commitments stop anyone from confirming a guessed private file; public files publish their salt.
- **Identity is permanent:** a wallet holds one participant role for life.
- **Out of scope** (designed, not implemented): automatic funding release on Verified, beneficiary confirmation of receipt, and Kleros arbitration.
- **Terminology:** claim, evidence bundle, fingerprint, anchor, internal verifier, auditor, Accreditation Authority, Registry Admin, dispute, bond, settle, withdraw.

## Brand Commitments

- **Name:** the product is **ClearTrust**, written in camel case. "Proof of Aid" is the hackathon and protocol name only.
- **Brand mark:** the brand mark lives in `code/frontend/src/components/CleartrustMark.tsx`.
- **Tagline:** "check aid claims without exposing people".

## Evidence on Hand

- **Live claim:** a live demo claim on Arbitrum Sepolia, `0xfedebf75…a79b28`, which is Verified with 0.0111 ETH held in escrow.
- **Demo evidence:** the demo evidence files are in `code/frontend/public/demo-evidence/`. They are made-up text and CSV, not real documents.
- **Video:** a mock video of the web app is at `docs/Mock video of the web app.mp4`.
- **Not available:** real NGOs, testimonials, customers, usage numbers or press. Do not fabricate them.

## Product Principles

1. Verify, don't trust: every public statement must be checkable against the chain.
2. Private by design: nothing that identifies a beneficiary is ever shown publicly.
3. Honest states: show disputes, rejections and missing data openly instead of hiding them.
4. The public verifier comes first: plain language before technical detail, with the technical detail one link away.
5. Claim only what is built: designed-but-unimplemented features are labeled as such.

## Accessibility & Inclusion

WCAG 2.1 AA is the working standard. It covers contrast in light and dark themes, full keyboard use, labelled form fields with linked error text, announced status changes (`aria-live`), and no horizontal scroll at 375px. No wallet or login is needed to read a claim or check a file.
