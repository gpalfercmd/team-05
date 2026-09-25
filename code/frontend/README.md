# Proof of Aid — Frontend

React + Vite + TypeScript app for the **Trust, Evidence & Privacy** prototype: a public claim page
where anyone can check a claim's evidence without a wallet and without seeing personal data (P5.4),
on top of the shell (P5.2: tooling, design tokens from
[`DESIGN.md`](../../dbv-specs-ops/docs/DESIGN.md), routing, wallet connection, `StatusBadge`,
`HashDisplay`), and the role screens (P5.3): with a wallet connected, the workspace page (`/workspace`) reads its role
from the `ParticipantRegistry` and offers only that role's actions, signed with MetaMask (how to
use them on anvil or Sepolia: [`docs/RUNBOOK.md`](../../docs/RUNBOOK.md#d-role-screens-sign-each-roles-actions-from-the-browser)).

Stack: React 19, React Router 7, wagmi 3 + viem 2 (injected wallet, e.g. MetaMask), TanStack
Query, zod, plain CSS with custom properties. Tests: Vitest + Testing Library (jsdom).

## Run

Requires Node.js 20.19+ or 22.12+ (Vite 8) and **pnpm** (version pinned in `package.json` → `packageManager`). Enable it once with `corepack enable`; Corepack then runs the pinned pnpm automatically. Do not use `npm install` here: the lockfile is `pnpm-lock.yaml`.

```bash
cd code/frontend
pnpm install
cp .env.example .env   # optional: without it the app runs on demo data
pnpm dev:sepolia        # same app, reading the real Arbitrum Sepolia deployment (.env.sepolia)
pnpm dev                # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `pnpm dev` | Dev server with hot reload (demo data, or whatever `.env` configures) |
| `pnpm dev:sepolia` | Dev server reading the live Arbitrum Sepolia deployment from the committed `.env.sepolia` |
| `pnpm test` | Unit and component tests (`vitest run`) |
| `pnpm typecheck` | Strict TypeScript check (`tsc -b --noEmit`) |
| `pnpm lint` | oxlint (no `any`, rules of hooks, no `console`) |
| `pnpm build` | Typecheck, then production build into `dist/` |

## Demo data vs. a real chain

- **Demo data (default):** with `VITE_CLAIM_REGISTRY_ADDRESS` and
  `VITE_PARTICIPANT_REGISTRY_ADDRESS` empty, the app shows three sample claims (made-up hashes, no
  personal data) and a **Demo data** label in the header. Useful before the contracts are deployed
  and for an offline demo.
- **Real chain:** set `VITE_CHAIN` (`anvil` or `arbitrumSepolia`), both contract addresses,
  `VITE_DEPLOY_BLOCK` (the `deployBlock` of `code/shared/deployments/*.json`) and optionally
  `VITE_RPC_URL` / `VITE_LOG_CHUNK_SIZE`. Setting only one address is rejected.

Every `VITE_*` value is validated with zod at startup (`src/config/env.ts`). An invalid value shows
a configuration error page instead of the app. Only `VITE_*` values reach the browser, so never put
secrets in `.env`.

## Public claim page (`/claims/:claimId`)

No wallet, no login, no backend needed. The page reads everything it shows from the contract (or
from the demo data), and lets a visitor check evidence files against the fingerprint recorded
onchain. The optional P4 indexer API only speeds up the history (see *P4 API mode* below).

- **Data sources** (`src/data/`): `ClaimDataSource` has three implementations behind the same
  `ClaimView` shape. `ChainClaimSource` uses a viem public client built from the app config:
  status and evidence roots always come from the views `statusOf`, `getClaim` and
  `evidenceRoots`, never from logs. The history comes from raw `eth_getLogs` filtered by the
  registry address and `topics: [any event, claimId]` (every event has `claimId` as its first
  indexed parameter), from `VITE_DEPLOY_BLOCK` to the latest block in chunks of
  `VITE_LOG_CHUNK_SIZE` blocks; when the RPC refuses a range the chunk is halved (up to 6 times)
  before a clear error is shown. `MockClaimSource` serves the demo claims through the same
  timeline code. `ApiClaimSource` (P4, selected when `VITE_API_URL` is set) is described below.
- **Published file lists** (`src/data/publishedManifests.ts`): for each onchain root, the chain
  sources look for the bundle's file list first at the API
  (`GET /claims/{id}/bundles/{n}/manifest`, when `VITE_API_URL` is set), then among the static
  lists served with the app (`public/demo-evidence/manifest*.json`, see
  `src/config/demoEvidence.ts`). A list is kept only if it passes the zod schema and its Merkle root
  equals the onchain root of that bundle; a 404, a network error or a mismatch just means "no file
  list". So on the live deployment the demo claim shows its file lists and download links, and a
  single file such as `receipt-001.txt` can be checked without uploading a manifest.
- **Typed ABI subset** (`src/data/claimRegistryAbi.ts`): the six views the page reads (`statusOf`,
  `getClaim`, `evidenceRoots`, `lockedOf`, `disputeWindowClosesAt`, `settled`) and the 13 events that carry a claim ID (all but `Withdrawn`) as
  human-readable signatures, so decoded values arrive typed. A test fails if any of them drifts from
  `code/shared/abi/IClaimRegistry.json` (names, types, indexed flags, selectors).
- **Timeline and summary:** one entry per transaction, oldest first; `StatusChanged` gives the
  badge and the action event of the same transaction gives the sentence (`AuditorAssigned` changes
  no status). The summary card (checkpoint 1, auditor, final decision, dispute) is derived from the
  same entries.
- **Deposits** (`EscrowStatus`, P9): ETH still held for the claim (`lockedOf`), "Disputes open
  until …" or "Dispute window closed" (`disputeWindowClosesAt`, compared with the visitor's clock)
  and "Settled" (`settled`); timeline entries for deposits locked, payouts credited and settlement.
- **Claim title and description** (`src/utils/metadata.ts`, `src/data/claimMetadata.ts`,
  `ClaimMetadata`): the text lives only in the backend, the contract keeps its `metadataHash`. With
  `VITE_API_URL` the page reads the public claim view (`GET /claims/{id}`), recomputes the hash in
  the browser over the claim ID read from the chain (recipe and vectors in
  `code/shared/metadata-vectors.json`) and shows the text only on a match ("Title and description
  match the blockchain record"). On a mismatch the text is hidden behind a warning with both
  fingerprints; with no answer from the server, or in chain-only mode, the card says there is
  nothing to check. Demo claims carry made-up text with its real hash.
- **Browser-side Merkle** (`src/utils/merkle.ts`): the frozen P1 recipe — SHA-256 with WebCrypto,
  keccak256 leaves, sorted leaves and pairs, odd node promoted. It passes every case of
  `code/shared/merkle-vectors.json`, like the Solidity and Python implementations. Since P8.2 the
  leaf input of a newly uploaded file is the salted commitment SHA-256(salt ‖ bytes)
  (`saltedSha256Hex`, checked against the `salted` vectors); claims recorded earlier, including
  the demo claim, use the plain SHA-256.
- **Evidence manifest** (`src/evidence/`): the per-bundle file list defined by
  [`code/shared/manifest.schema.json`](../shared/manifest.schema.json), mirrored in zod (a test runs
  both schemas over the same samples). A manifest is untrusted until the Merkle root of its
  fingerprints equals `evidenceRoots[rootIndex]`; otherwise the page shows "File list altered".
  Private entries carry no name and no salt. Version 2 lists give public entries their salt: a
  dropped file matches when its SHA-256 or SHA-256(salt ‖ file) equals the fingerprint, so a
  private salted file cannot be confirmed from a guessed copy. Visitors can check single files
  against a verified list, or a complete bundle (salted bundles need their verified list). Files are hashed locally and never sent anywhere.

### P4 API mode (`VITE_API_URL`)

With `VITE_API_URL` set (and contract addresses configured), `ApiClaimSource` takes the claim's
history from the indexer (`GET /public/claims/{id}/timeline`, validated with zod and mapped to the
same decoded events the chain source produces, so the page renders identically). Status, the
claim record and the evidence roots are **always** read from the contract views; the API's own
`status` / `evidenceRoots` projection is ignored. The history note on the page says which part came
from where.

Staleness rule: the API history is used only if it indexes the configured chain and registry, has
an `indexedToBlock`, ends in the contract's current status and roots, **and** one `eth_getLogs`
over the blocks after `indexedToBlock` finds no event of this claim (every state change emits an
event, so that proves nothing is missing). Otherwise — API unreachable, non-2xx, malformed or
behind — the page reads the whole history from the chain exactly as without the API.

```bash
# backend (code/backend, .env filled, `alembic upgrade head` done): index the chain, then serve the API
DEPLOYMENT_FILE=../shared/deployments/arbitrum-sepolia.json CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc \
  uv run python -m app.indexer --once
DEPLOYMENT_FILE=../shared/deployments/arbitrum-sepolia.json CORS_ORIGINS=http://localhost:5173,http://localhost:5174 \
  uv run uvicorn app.main:create_app --factory --port 8000
# frontend
VITE_API_URL=http://localhost:8000 pnpm dev:sepolia
```

Without `DEPLOYMENT_FILE` the public endpoints answer 503 and the page falls back to the chain.

The backend's `CORS_ORIGINS` must list the exact origin the page is served from
(`http://localhost:5173` for `pnpm dev`, `http://localhost:5174` for the `frontend-sepolia` launch
configuration, or whatever `--port` you pass). Without it the browser blocks the API answers and the
page silently falls back to the chain. Public reads are sent without cookies.

### Demo flow for the jury

In demo mode, open the first sample claim from the dashboard (full lifecycle with a single
verifier and a dismissed dispute). Its evidence files live in `public/demo-evidence/` (made-up, no
personal data; one private entry is listed by fingerprint only). Download `receipt-001.txt`, drop
it into **Verify it yourself** → *Match*; change one character, drop it again → *No match*.
A test recomputes the demo root from these files, so the demo cannot silently
drift: if you edit a demo file, update its manifest and the root in `src/mocks/claims.ts`.

## Role screens (P5.3)

With contract addresses configured and a wallet connected, the workspace page (`/workspace`, header link **Workspace**) opens with **What needs your action** (the claims waiting for this wallet's role, from the indexer and re-read from the contract) and then the role screens card, which:

- reads the wallet's role from the `ParticipantRegistry` (`useRole`); nothing is inferred locally;
- lists claims to act on from the indexer (`GET /public/claims`, with `VITE_API_URL`) or takes a
  pasted claim ID, re-reads that claim from the contract and offers only the actions
  `planClaimActions` (`src/chain/claimActions.ts`, a mirror of `ClaimRegistry`'s rules) allows;
- simulates each call first, so a rule it breaks is shown in plain English
  (`utils/contractErrors.ts`), then signs it with `useWriteContract` on the configured chain and
  waits for the receipt (`useContractAction`); every query refreshes on confirmation;
- reads payable amounts from the contract (`anchorDeposit`, `auditorDeposit`, `disputeBond`);
- records claims and proof through the backend (wallet-signed login, `POST /claims`, evidence
  upload), then anchors the returned root; without `VITE_API_URL` those two forms say so;
- blocks signing on the wrong network (with a **Switch** button), and in demo mode only says that
  actions need a real chain. The public claim page adds **Settle** for any connected wallet once a
  claim's dispute window has closed on the chain's clock.

`src/chain/roleActions.anvil.test.ts` runs the same call builders against real contracts on anvil
(opt-in, see the RUNBOOK's path D).

## Folder map

```
src/
  main.tsx, App.tsx   entry point (env validation) and providers + router
  routes.tsx          route table: /, /claims/:claimId, *
  config/             chains, env (zod), wagmi, contracts (ABIs from ../shared/abi via @shared),
                      demo evidence location
  context/            AppConfigContext (validated env)
  data/               claim sources (chain, API, demo), published file lists, typed ABI subset,
                      events → timeline, indexer timeline parser, summary
  evidence/           manifest schema (zod), verification logic, plain-language labels
  chain/              role screens' logic: call builders, validated registry reads, action planner
                      (contract rules per role and status), form inputs, transaction phases, and
                      the opt-in anvil end-to-end test
  hooks/              useAppConfig, useClaim, useEvidenceVerifier, useRole (from the registry),
                      useWallet, useContractAction (simulate → sign → receipt), useClaimActionState,
                      useEscrowParams / useCredits, useEvidenceService (backend login), useChainTime,
                      useTheme
  components/         AppLayout, Header, RoleBanner, ConnectButton, ThemeToggle, ConfigError,
                      DemoDataNotice, StatusBadge, HashDisplay, AddressText, ClaimLookup,
                      ClaimMetadata, EscrowStatus, Timeline, VerificationSummary, EvidenceSection,
                      EvidenceVerifier, VerificationResult, FileDropZone, SettlePanel, icons/,
                      wallet/ (WalletPanel and the per-role forms, TxButton, TxStatus)
  pages/              DashboardPage, WorkspacePage, PublicClaimPage, NotFoundPage
  mocks/              demo claims (contract state + events) and demo manifests
  types/              ClaimView (public, onchain-only view of a claim)
  utils/              merkle, claimStatus, contractErrors, format, explorer, clipboard, result, roles,
                      timelineText
  styles/             tokens.css (DESIGN.md tokens, light + dark), global.css
  test/               Vitest setup and helpers
public/demo-evidence/ made-up evidence files and their manifests (demo mode, and the live demo claim)
```

The ABIs and the `ClaimStatus` enum order come from `code/shared/abi/`, never from the Solidity
source. Tests fail if the frontend drifts from them (enum order, a custom error without a message,
the typed ABI subset).
