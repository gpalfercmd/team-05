# Project Submission

> **State:** final submission, 2026-09-25. Contracts (with deposits, rewards and penalties) deployed and exercised on Arbitrum Sepolia; evidence backend, chain indexer and public verification page implemented and tested; setup and demo dry-run from a fresh clone ([RUNBOOK.md](RUNBOOK.md)).

## 1. Project snapshot

| | |
| --- | --- |
| **Project name** | Proof of Aid — Team 05 |
| **Team ID & members** | Team 05 *(TODO (team): confirm the exact Team ID the organizers assigned; it is also what goes in the final form)* · Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez |
| **System vision** | Anyone, without special access, can check that an aid claim is backed by unaltered evidence reviewed by independent, accredited verifiers, without seeing beneficiaries' personal data. |
| **Implementation focus** | **Trust, Evidence & Privacy:** trusting aid claims whose evidence cannot be published, through encrypted offchain evidence anchored onchain by Merkle root and a contract-enforced two-stage verification. |
| **What we built** | Two smart contracts on Arbitrum Sepolia that enforce accreditation, evidence anchoring, two-stage verification with proof requests and disputes; a Python backend that strips metadata, hashes and encrypts evidence and serves privacy-safe views; and a public page where anyone re-checks evidence against the chain in their own browser. |
| **Code & run instructions** | [code/](../code/) · [Setup and demo](RUNBOOK.md) |
| **Complete system design** | [ARCHITECTURE.md](ARCHITECTURE.md) |

## 2. Implemented contribution

### Problem and approach

> Within our complete Proof of Aid design, we focus on **Trust, Evidence & Privacy**, addressing **how a third party can trust an aid claim whose evidence contains beneficiaries' personal data and therefore cannot be published** through **offchain encrypted evidence whose Merkle root is anchored onchain, a contract-enforced two-stage verification (internal verifier → independent, officially accredited auditor with proof requests), accredited disputes, and a public page that re-verifies evidence integrity without revealing personal data**.

**Why it matters.** The strongest evidence of delivery (photos of recipients, signed delivery lists) is exactly what cannot be shown to donors. Today donors either trust the organization blindly or the organization leaks personal data. We separate *what is proven* (integrity, who approved, when) from *what is shown* (nothing personal).

**Where it fits.** It covers the *Verification* step of `Need → Verification → Funding → Delivery → Outcome → Transparent history`, and feeds *Transparent history* directly from contract events. *Funding* (escrow released on `Verified`) and *Delivery & Impact* (beneficiary confirmation) are designed in [ARCHITECTURE.md](ARCHITECTURE.md) but not implemented.

### What works and how

1. **Accreditation (`ParticipantRegistry`).** The Registry Admin registers organizations and their internal verifiers; a separate Accreditation Authority accredits auditors. Neither admin can do the other's job. A wallet holds one participant role **for life**: while building we found that "one role at a time" let a revoked verifier be re-accredited as auditor and sign both checkpoints of the same claim, so re-registration is now impossible.
2. **Verification state machine (`ClaimRegistry`).** `Anchored → InternallyVerified → (ProofRequested ⇄ ProofSubmitted) → Verified | Rejected`, then `Verified → Disputed → Verified | Rejected`. The contract enforces separation of duties (submitter ≠ checkpoint-1 verifier ≠ proof confirmer), that only the auditor assigned by the Authority can act, that organizations need two active verifiers, and that each proof request adds a new, append-only evidence root. Every step emits an event.
3. **Evidence pipeline (FastAPI backend).** Uploads have EXIF/GPS stripped, are fingerprinted **after** cleaning with a salted commitment SHA-256(salt ‖ bytes) (random 32-byte salt, encrypted at rest; public files publish it), so nobody can confirm a guessed private file from its public fingerprint, grouped into bundles (original evidence, then one per proof request) and encrypted with AES-GCM using a per-claim key. Only the organization, its internal verifiers and the assigned auditor can download private files; everyone else sees private files as fingerprints only (no name, type or size). Each bundle's Merkle root equals the root anchored onchain, and a public manifest endpoint lists the fingerprints of a bundle.
4. **Public verification (React page, no wallet, no login).** The page reads the claim's status, evidence roots and full history **directly from the contract** (event logs filtered by claim ID), with no server in between. A visitor drops a file: the browser computes its fingerprint and checks it against the onchain root, either through the bundle's manifest (itself accepted only if its root matches the chain) or by dropping the whole bundle. Files never leave the browser.
5. **Fraud costs money (P9).** `ClaimRegistry` escrows ETH per claim: the organization deposits a penalty plus the auditor's reward when anchoring, the auditor deposits when approving, and a disputant posts a bond. A dismissed dispute pays the bond to the organization and the auditor; an upheld one pays the disputant everything at stake; after a 60-day window anyone settles the claim and the honest parties get their money back plus the reward. See *Incentives* below.
6. **Chain indexer (optional speed-up).** A web3.py indexer copies the registries' events into PostgreSQL. The backend uses it to decide who may decrypt private files from the onchain roles and auditor assignment, and serves a public timeline API; the page uses that API only when its history ends in the contract's current status and roots, otherwise it reads the chain itself.
7. **One recipe, three implementations.** The Merkle recipe (SHA-256 leaves hashed with keccak256, sorted pairs) is implemented in Solidity, Python and TypeScript, and all three pass the same shared test vectors byte for byte.

### Implementation boundary

- **Implemented:** working code or another demonstrable technical artifact exists.
- **Simulated / mocked:** a real component is replaced or simplified.
- **Designed only:** part of the proposed system, but not implemented.
- **Out of scope:** deliberately excluded from the proposed Hackathon scope.

| Capability | Status | What exists in the prototype |
| --- | --- | --- |
| Participant accreditation (org, internal verifiers, auditors) | Implemented | `ParticipantRegistry` on Arbitrum Sepolia: separate Registry Admin and Accreditation Authority, one lifetime role per wallet (revocation is permanent) |
| Evidence anchoring (Merkle root onchain) | Implemented | `ClaimRegistry.anchorClaim` + append-only supplementary roots |
| Two-stage verification + proof requests | Implemented | Onchain state machine: checkpoint 1, Authority-assigned auditor, proof loop with four-eyes confirmation, final attestation; full lifecycle executed on Arbitrum Sepolia |
| Disputes | Implemented | Any accredited wallet except the claim's own organization and approving auditor disputes a `Verified` claim within 60 days; the Authority upholds or dismisses it onchain (demo: dismissed) |
| Deposits, rewards, penalties, settlement (P9) | Implemented | Per-claim ETH escrow in `ClaimRegistry`, pull payments, 60-day dispute window; tested and run end to end on a local anvil chain. Live on Arbitrum Sepolia: the demo claim holds 0.0111 ETH in escrow. |
| Privacy pipeline (EXIF strip, hashing, encryption, role-based access) | Implemented | FastAPI evidence service; private files exposed to outsiders as fingerprints only |
| Evidence bundles and manifests | Implemented | Per-bundle roots matching `evidenceRoots[i]`; manifest endpoint in the shared JSON Schema |
| Public verification page | Implemented | Reads the deployed contract directly; single-file and whole-bundle checks in the browser; the claim's title and description from the API are shown only after their hash is recomputed in the browser and matches the onchain `metadataHash` (otherwise hidden with a warning) |
| Event indexer and public timeline API | Implemented | web3.py indexer into PostgreSQL (idempotent, restart-safe), `GET /public/claims`, `/public/claims/{id}/timeline`, `/public/indexer/status`; the public page uses it only as a speed-up and falls back to the chain when it is missing or behind |
| Evidence access follows the chain | Implemented | With `ROLE_SOURCE=chain` (default when a deployment file is configured) the backend decides who may decrypt from the indexed registries: onchain accreditation, revocation and auditor assignment take effect automatically. A hand-seeded `participants` table remains as a development fallback (`ROLE_SOURCE=local`). |
| Signing actions from the UI (role screens) | Simulated | Cut, not built: every signed action is performed by Foundry scripts (`DemoLifecycle.s.sol`) and `cast` with test-only wallets |
| Bundle sealing by onchain anchoring | Simulated | The backend seals a bundle when the next one is started (upload order), not when its root is anchored onchain |
| Real-world identity of participants | Simulated | Accreditation is a manual admin action on test wallets |
| File storage | Simulated | Local encrypted volume instead of S3/MinIO |
| Demo evidence | Mocked | Made-up receipts, invoices and counts; no real personal data. EXIF/GPS stripping is shown by a backend test on a synthetic JPEG, not by the demo claim. |
| Funding escrow released on `Verified` | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| Beneficiary confirmation of receipt | Designed only | [ARCHITECTURE.md](ARCHITECTURE.md#components) |
| Decentralized arbitration (Kleros) | Designed only | Section 4, *Next step* |
| KYC / verifiable credentials, mainnet | Out of scope | — |

### Effort split

> **TODO (team):** these percentages are the team's estimate from the checkpoint phase (the plan
> said Blockchain 50% · Real-world connection 30% · UX 20%). Replace them with the measured split
> before submitting; only the team knows it.

| Dimension | Effort | Work implemented |
| --- | ---: | --- |
| UX | 30% | Public verification page (timeline, verification summary, in-browser checks), design system, plain-language contract errors |
| Real-world connection | 30% | Evidence privacy pipeline (EXIF strip, hashing of cleaned files, encryption, access control), bundles and manifests, accreditation of real-world entities |
| Blockchain | 40% | Accreditation registry, claim state machine, disputes, events, 100%-coverage test suite with invariants, deployment and full lifecycle on Arbitrum Sepolia |

### Incentives: who pays whom

Amounts: reference values, and in brackets the 1/100 values of the testnet deployment. The dispute window is 60 days in both.

| Moment | Organization | Auditor | Disputant |
| --- | --- | --- | --- |
| Anchors the claim | pays penalty 1 ETH + auditor reward 0.01 ETH (0.0101) | — | — |
| Auditor approves | — | pays deposit 0.1 ETH (0.001) | — |
| Dispute opened (before `verifiedAt + 60 days`) | — | — | pays bond 0.1 ETH (0.001) |
| Rejected at checkpoint 1 or by the auditor | gets its whole deposit back | — | — |
| Dispute dismissed | gets half the bond (+ odd wei) | gets half the bond | loses the bond |
| Dispute upheld | loses penalty and reward | loses its deposit | gets bond + penalty + auditor deposit + reward |
| `settle` after the window (anyone) | gets its penalty back | gets its deposit + the reward | — |

The prepaid reward goes to the disputant, not back to the organization, when fraud is proven: the organization caused it. The window starts once at the approval and a dismissal does not restart it, so each repeat dispute costs a bond and all disputes end after 60 days. The organization and the approving auditor cannot dispute their own claim. Money leaves the contract only through `withdraw()` (pull payments, reentrancy-guarded). Checkpoint 1 by the internal verifiers involves no money.

## 3. Demo and validation

**What the demo proves:** a claim that went through the full two-stage verification on Arbitrum Sepolia can be checked by anyone in a browser: a genuine evidence file matches the root recorded onchain, a one-character change is detected, and no private file name or content is ever exposed.

**Reproduce the demo:** Follow [RUNBOOK.md](RUNBOOK.md) for setup, initial state, scenario, and expected results: the live Sepolia page needs only Node and pnpm; the whole lifecycle, including the 60-day settlement, also runs on a local anvil chain.

**Validation evidence:**

- **Contracts:** `cd code/contracts && forge test` → 168 tests pass (45 ParticipantRegistry, 82 ClaimRegistry incl. fuzz, 37 incentives, 3 Merkle vectors, 9 invariants over 8,192 random calls, including `balance == credits owed + escrow locked`); `forge coverage` → 100% lines, statements, branches and functions on both contracts. Removing the four-eyes check or the permanent-identity rule makes tests fail. The P9 deploy + demo lifecycle runs on a local anvil chain and ends `Verified` with 0.0111 ETH escrowed.
- **Backend:** `cd code && uv run --project backend pytest -c backend/pyproject.toml backend/tests` → 111 tests pass (login, claims, evidence, EXIF/GPS stripping, salted commitments, access matrix, privacy of public views, bundles, CORS, Merkle and metadata vectors, P4 indexer and chain-driven access, public API, plus an anvil end-to-end indexer run). Migrations verified on SQLite, a disposable PostgreSQL 18 and the Docker PostgreSQL 16 (0001–0003), and 0001–0004 on a throwaway PostgreSQL 18.6 database during the final dry run. Before the P9 redeploy, the indexer on PostgreSQL indexed the 22 registry events of the previous Sepolia deployment in ~7 s and a second run added 0; in the dry run it indexed the 30 events of the local anvil demo (including settlement) and a second run added 0.
- **Shared recipe:** `cd code/shared && uv run pytest` → 30 tests pass.
- **Frontend:** `cd code/frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → 317 tests pass, including the browser Merkle and metadata recipes against every shared vector; typecheck and lint clean; build OK.
- **Fresh-clone dry run (2026-09-25):** the [RUNBOOK](RUNBOOK.md) was followed from a `git clone` on macOS: every suite above green, `forge coverage` 100% on `src/`, the anvil demo ended `Verified` with 0.0111 ETH escrowed, `settle` after a 60-day clock jump credited the organization 0.0105 ETH and the auditor 0.0016 ETH and left 0 locked, the backend API served the indexed timeline, and the page showed **Match** for `receipt-001.txt` and **No match** after one character was changed, both on anvil and on the live Sepolia deployment (bundle mode: supplementary proof #1 → **Match**, one byte flipped → **No match**).
- **Live on Arbitrum Sepolia** (`code/shared/deployments/arbitrum-sepolia.json`): [`ParticipantRegistry`](https://sepolia.arbiscan.io/address/0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1) · [`ClaimRegistry`](https://sepolia.arbiscan.io/address/0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013). Full demo lifecycle of claim `0xfedebf75…a79b28`, whose evidence roots are the real Merkle roots of the files in `code/frontend/public/demo-evidence/`: [anchor](https://sepolia.arbiscan.io/tx/0x93f49b2514e4a7ae2d7e15619ebd37de3bdd7d8928d870a37548a60602630a6e) → [internal approval](https://sepolia.arbiscan.io/tx/0x0aabdfeff004ef228b3ca5d84ca723edd5fe2d542423a00b0359f795dfacfa89) → [auditor assigned](https://sepolia.arbiscan.io/tx/0x3971213bb081bd5836e90ad5afcb6b17ba5da05f2b57d0ab979cd0393719e22b) → [proof requested](https://sepolia.arbiscan.io/tx/0x74b91ba021ae078d442981f844592ed7313c4b27dcefd834fd48471cf670ea4b) → [proof submitted](https://sepolia.arbiscan.io/tx/0xebf382b5434e1aa8b975dfca9b1d02b74f3505eecf06b56595f4415d0bdc3be2) → [second verifier confirms](https://sepolia.arbiscan.io/tx/0x0d76c7561f4dd7326e4ffef6b1689c1de4fae4dc46907d97c6c3ab53ecd6190a) → [final approval](https://sepolia.arbiscan.io/tx/0xaa4ef572c6616cd5e7cda66caf7f6d3da84f04e300c7f200a7748d1af812c76b) → [dispute](https://sepolia.arbiscan.io/tx/0x508bd4de097e0f5aa3969e07aea2e8200f29a1d80d08d0479fac24ac5cccd88f) → [dispute dismissed](https://sepolia.arbiscan.io/tx/0xbaaa25c4c3be25806d465879650bb45296cb24d1c3e1f26dd6262c6035641de6). The claim ends `Verified`.
- **End-to-end check against the live chain:** the public page pointed at the deployed contract shows the 9-step history of the demo claim; the published manifest is accepted because its root matches `evidenceRoots[0]` onchain, and `receipt-001.txt` verifies as **Match**. The two files of supplementary proof #1 checked as a complete bundle → **Match** (root `0x8e94…2370`); the same files with one bit flipped in `stock-count.txt` → **No match** (computed `0x7f22…99ef`). No browser console errors.

## 4. Limitations and next step

- **Identity and Sybil resistance.** A wallet proves key control, not a person. Accreditation is a manual admin action, not backed by KYC or verifiable credentials, so one person holding several accredited wallets (for example both internal verifiers of an organization) would defeat the four-eyes rule. The contract makes identities permanent and roles exclusive, but it cannot tell whether two wallets belong to the same human; the Registry Admin and the Accreditation Authority are trusted to check that.
- **Claim-ID squatting.** A claim ID is `keccak256(uuid)` chosen offchain and not bound to the organization: any accredited organization that learns an ID before it is anchored can anchor it first (`ClaimAlreadyExists` for the rightful one), which then has to use a new ID. The backend only gives an auditor access when the claim was anchored by the organization that created it, so squatting cannot open private evidence. Fix: derive the ID onchain from (organization, uuid).
- **The Accreditation Authority is a single point of trust:** it assigns auditors and judges every dispute, and since P9 its ruling also moves the deposits. The designed next step is Kleros arbitration (below); accreditation would stay with the Authority.
- The internal checks are not independent by themselves; independence rests on a single assigned auditor, who could still collude.
- **Unsalted legacy claims.** Claims recorded before salted fingerprints (P8.2), including the demo claim on Arbitrum Sepolia, keep unsalted SHA-256 fingerprints: a guessed private file of those claims can still be confirmed. Claims created since then are salted.
- **Deposits locked on revocation mid-proof.** A claim left in `ProofRequested`/`ProofSubmitted` when its organization is revoked can never move on, so its deposit stays locked forever. Deposits also need ETH up front, and the amounts are fixed at deployment.
- Integrity is proven, not truth: evidence can still be staged before it is anchored.
- The backend operator is trusted for confidentiality (not for integrity, which is checked onchain); its view of roles lags the chain by the indexer's confirmation margin.
- Each organization needs at least two internal verifiers, and a revoked participant needs a new wallet (identity is permanent by design).
- Bundles are sealed in the backend by upload order rather than by their onchain anchoring.
- There are no role screens: every signed action of the demo is executed with Foundry scripts and `cast`.

**Next steps**, in order of value:

1. Decentralized dispute resolution with Kleros (designed below), removing the Authority as judge.
2. Role screens so organizations, verifiers, auditors and the Authority sign from the browser with MetaMask (the public page and the contract error messages already exist).
3. Bind claim IDs to the anchoring organization and seal backend bundles when the indexer sees their root anchored.
4. Verifiable credentials for accreditation, then beneficiary confirmation of receipt (Delivery & Impact) and the funding escrow released on `Verified`, both designed in [ARCHITECTURE.md](ARCHITECTURE.md#components).

### Next step: Kleros arbitration (designed, not implemented)

The Authority stays the judge in code today. The designed replacement is decentralized arbitration by Kleros, which removes the single point of trust from dispute resolution (accreditation stays with the Authority).

**What is current (checked 2026-09-25):**

- The arbitration interface was standardized by Kleros as **ERC-792** (`IArbitrator` / `IArbitrable`) with the **ERC-1497** evidence standard (`MetaEvidence`, `Evidence`, `Dispute` events); this is what Kleros v1 on Ethereum mainnet uses. Sources: [kleros/erc-792](https://github.com/kleros/erc-792), [ERC-792 docs](https://docs.kleros.io/developer/arbitration-development/erc-792-arbitration-standard), [ERC-1497 docs](https://docs.kleros.io/developer/arbitration-development/erc-1497-evidence-standard).
- **Kleros 2.0 runs on Arbitrum One**, announced as a beta running in parallel with v1, with the stated plan to move all court activity to Arbitrum One once it is secure enough ([Arbitrum forum, Jan 2025](https://forum.arbitrum.foundation/t/introducing-kleros-2-0-beta-decentralized-justice-built-on-arbitrum-one/28136), [Kleros blog](https://blog.kleros.io/kleros-2-0-beta-is-here-get-started/)). Its interfaces are `IArbitratorV2` / `IArbitrableV2`: `createDispute(uint256 numberOfChoices, bytes extraData) payable`, `arbitrationCost(bytes extraData)`, and the callback `rule(uint256 disputeID, uint256 ruling)`, with ruling 0 reserved for "refuse to arbitrate" ([arbitrator spec](https://github.com/kleros/kleros-v2/blob/dev/contracts/specifications/arbitrator.md), [IArbitrableV2.sol](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/interfaces/IArbitrableV2.sol)). **V2 replaces ERC-1497 `MetaEvidence` with dispute templates** (a `DisputeRequest` event carrying a template id) and a separate `EvidenceModule`.
- **Not verified:** whether Kleros 2.0 left beta by today, its current mainnet `KlerosCore` address and court fees, and whether a Kleros v2 arbitrator is available on Arbitrum **Sepolia** for testing. A search result quoted `KlerosCore` at `0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002` on Arbitrum One; we did not confirm it against an official deployment list.

**Design.** Because our contracts already live on Arbitrum, Kleros 2.0 on Arbitrum One is the natural target (no cross-chain bridge).

1. `ClaimRegistry` implements `IArbitrable` (ERC-792; `IArbitrableV2` on Kleros 2.0) and stores the arbitrator address and its `extraData` (court id and number of jurors) as immutables.
2. `openDispute` stays payable: the disputant sends `disputeBond + arbitrator.arbitrationCost(extraData)`. The contract forwards the fee with `arbitrator.createDispute{value: fee}(2, extraData)` (two choices), stores `arbitratorDisputeId → claimId`, and keeps the bond in escrow as today. The Authority's `resolveDispute` is removed.
3. Evidence: the counter-evidence hash we already anchor becomes the `Evidence` URI of ERC-1497 (v1), with a `MetaEvidence` describing the claim and the two rulings; on Kleros 2.0 the same content is published as a dispute template plus `EvidenceModule` submissions. The encrypted files stay offchain; jurors get access through the backend like an auditor would.
4. `rule(disputeID, ruling)` (callable only by the arbitrator) maps 1 = uphold → today's upheld payout and `Rejected`, 2 = dismiss → today's bond split and `Verified`. Ruling 0 (refused) would return the bond to the disputant and the claim to `Verified` (to be decided by the team).
5. Appeals are handled inside Kleros (crowdfunded appeal fees), so our contract needs no appeal logic; the settlement rule (wait until the dispute is resolved) stays the same.

Trade-offs: arbitration fees make disputes more expensive than today's bond alone, rulings take days to weeks, and the revoked-organization rule (a revoked organization can never be dismissed back to `Verified`) must be re-checked inside `rule()`.

## 5. AI usage

| Tool | Used for / assisted work | How we reviewed or validated it |
| --- | --- | --- |
| Claude Code (Claude Opus 5.5) with the `dbv-specs-ops` spec-driven workflow | Specifications, architecture and plan from the team's decisions; adversarial and logic reviews of the verification flow (source of the P8 fixes and the P9 incentives); implementation of contracts, backend, indexer, frontend and tests, partly through delegated sub-agents | Every design decision was taken by the team through explicit questions. All test suites were re-run independently after each delegated task; contract tests were mutation-checked (removing a security rule must break them) and reach 100% coverage; the public page was verified against the live Arbitrum Sepolia deployment in a browser. |
| Claude Code (Claude Opus 5.5) | Documentation: RUNBOOK, this submission, READMEs; the final fresh-clone dry run and secret scan | The RUNBOOK was executed step by step from a fresh clone and corrected where a step was unclear; every number quoted here comes from a re-run; the team reviewed and edited all documents. |
| Claude Code, web research | The Kleros arbitration design (section 4) | Sources linked; items we could not confirm are marked *Not verified*. |

> **TODO (team):** add any other AI tool a teammate used (for example an editor assistant) and how its output was checked; only the team knows this.

We confirm that the team can explain and technically defend the submitted work.
