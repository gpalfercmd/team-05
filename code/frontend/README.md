# Proof of Aid — Frontend

React + Vite + TypeScript app for the **Trust, Evidence & Privacy** prototype: role views for the
participants (P5.3) and a public claim page where anyone can check a claim's evidence without a
wallet and without seeing personal data (P5.4). This folder currently holds the working shell
(P5.2): tooling, design tokens from [`DESIGN.md`](../../dbv-specs-ops/docs/DESIGN.md), routing,
wallet connection, `StatusBadge`, `HashDisplay`, and tests.

Stack: React 19, React Router 7, wagmi 3 + viem 2 (injected wallet, e.g. MetaMask), TanStack
Query, zod, plain CSS with custom properties. Tests: Vitest + Testing Library (jsdom).

## Run

Requires Node.js 20.19+ or 22.12+ (Vite 8).

```bash
cd code/frontend
npm install
cp .env.example .env   # optional: without it the app runs on demo data
npm run dev            # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit and component tests (`vitest run`) |
| `npm run typecheck` | Strict TypeScript check (`tsc -b --noEmit`) |
| `npm run lint` | oxlint (no `any`, rules of hooks, no `console`) |
| `npm run build` | Typecheck, then production build into `dist/` |

## Demo data vs. a real chain

- **Demo data (default):** with `VITE_CLAIM_REGISTRY_ADDRESS` and
  `VITE_PARTICIPANT_REGISTRY_ADDRESS` empty, the app shows three sample claims (made-up hashes, no
  personal data) and a **Demo data** label in the header. Useful before the contracts are deployed.
- **Real chain:** set `VITE_CHAIN` (`anvil` or `arbitrumSepolia`), both contract addresses, and
  optionally `VITE_RPC_URL`. Addresses come from `code/shared/deployments/` once P2 deploys.
  Setting only one address is rejected. Reading claims from the contract arrives in P5.4.

Every `VITE_*` value is validated with zod at startup (`src/config/env.ts`). An invalid value shows
a configuration error page instead of the app. Only `VITE_*` values reach the browser, so never put
secrets in `.env`.

## Folder map

```
src/
  main.tsx, App.tsx   entry point (env validation) and providers + router
  routes.tsx          route table: /, /claims/:claimId, *
  config/             chains, env (zod), wagmi, contracts (ABIs from ../shared/abi via @shared)
  context/            AppConfigContext (validated env)
  hooks/              useAppConfig, useClaimStatus, useRole (stubs until P5.3/P5.4), useTheme
  components/         Header, RoleBanner, ConnectButton, ThemeToggle, StatusBadge, HashDisplay, icons/
  pages/              DashboardPage, PublicClaimPage, NotFoundPage
  mocks/              demo claims
  types/              ClaimSummary (public, onchain-only view of a claim)
  utils/              claimStatus, contractErrors, format, explorer, clipboard, result, roles
  styles/             tokens.css (DESIGN.md tokens, light + dark), global.css
  test/               Vitest setup and helpers
```

The ABIs and the `ClaimStatus` enum order come from `code/shared/abi/`, never from the Solidity
source. Tests fail if the frontend drifts from them (enum order, a custom error without a message).
