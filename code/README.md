# Code

Developer guide to the implementation of the **Trust, Evidence & Privacy** contribution described in
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#implementation-focus): what each folder holds, how to
install, build, test, run, deploy and regenerate everything, and the traps we hit.

> **Status:** final submission (2026-09-25). Contracts live on Arbitrum Sepolia
> ([`shared/deployments/arbitrum-sepolia.json`](shared/deployments/arbitrum-sepolia.json)); every layer
> below is implemented and tested. Unless a block starts with its own `cd`, commands run from `code/`.

| Folder | Purpose | Stack | Tests (2026-09-25) |
| --- | --- | --- | --- |
| [`contracts/`](contracts/README.md) | `ParticipantRegistry` (accreditation) and `ClaimRegistry` (evidence anchoring, two-stage verification, proof requests, disputes, deposits/rewards/penalties with settlement); deployment and demo scripts | Solidity 0.8.30, Foundry 1.8.3, OpenZeppelin 5.7.0 (Soldeer) | 168 passed, 100% coverage of `src/` |
| [`shared/`](shared/) | The cross-layer contract: exported ABIs, deployment files per network, evidence manifest JSON Schema, Merkle, metadata and note test vectors, and the Python reference recipe `poa_shared` | JSON, Python ≥ 3.12 | 34 passed |
| [`backend/`](backend/README.md) | Evidence pipeline (image and PDF metadata strip, salted SHA-256, AES-256-GCM at rest, role-based access), sealed reviewer notes, wallet-signature login, chain indexer and public API | Python ≥ 3.12, FastAPI, SQLAlchemy/Alembic, PostgreSQL, web3.py, pypdf | 128 passed (incl. an anvil end-to-end test) |
| [`frontend/`](frontend/README.md) | Public claim page that re-verifies evidence in the browser against the chain (with a reviewer view of private files and notes), and role screens where each accredited wallet signs its actions | React 19, Vite 8, TypeScript 6, wagmi 3 + viem 2, pnpm 12.6 | 511 passed, 8 skipped (opt-in anvil test) |

Related documents: [ARCHITECTURE.md](../docs/ARCHITECTURE.md) (design, state machine, data model,
recipes), [RUNBOOK.md](../docs/RUNBOOK.md) (reproducible setup and demo, step by step with expected
results), [SUBMISSION.md](../docs/SUBMISSION.md) (scope, evidence, limitations).

## Directory map

```text
code/
├── contracts/                     Foundry project (own foundry.toml, soldeer.lock)
│   ├── src/interfaces/            IParticipantRegistry.sol, IClaimRegistry.sol: roles, enum, events, errors
│   ├── src/ParticipantRegistry.sol  AccessControl roles, permanent participant identity
│   ├── src/ClaimRegistry.sol      state machine, evidence roots, escrow, settle, withdraw
│   ├── test/                      ParticipantRegistry.t.sol, ClaimRegistry.t.sol, ClaimRegistryIncentives.t.sol,
│   │                              MerkleVectors.t.sol, invariant/ClaimRegistry.invariant.t.sol, helpers/ fixture
│   ├── script/Deploy.s.sol        deploy both registries (REGISTRY_ADMIN, ACCREDITATION_AUTHORITY)
│   ├── script/DemoLifecycle.s.sol accredit 7 test wallets and run the full demo claim (9 steps)
│   ├── script/DeploymentFile.sol  shared deploy helper; 1/100 incentive amounts; writes ../shared/deployments/*.json
│   ├── script/record_transactions.py  add tx hashes and the real deployBlock from Foundry's broadcast log
│   ├── script/export-abi.sh       regenerate ../shared/abi/*.json from the interfaces
│   └── .env.example               RPC, test-only mnemonic, admins, demo switches, Arbiscan key
├── shared/                        uv project `proof-of-aid-shared`
│   ├── abi/                       IParticipantRegistry.json, IClaimRegistry.json, claim-status.json (enum order)
│   ├── deployments/               anvil.json (31337), arbitrum-sepolia.json (421614): addresses, deployBlock, tx hashes
│   ├── manifest.schema.json       per-bundle file list (versions 1 and 2)
│   ├── merkle-vectors.json        Merkle cases, tamper case, salted cases (every layer must pass them)
│   ├── metadata-vectors.json      metadataHash cases and invalid inputs
│   ├── note-vectors.json          salted note fingerprints keccak256(salt ‖ text), legacy hashes, invalid inputs
│   ├── poa_shared/                merkle.py, metadata.py, notes.py, result.py, gen_vectors.py, gen_metadata_vectors.py,
│   │                              gen_note_vectors.py
│   └── tests/                     test_merkle.py, test_metadata.py, test_notes.py
├── backend/                       uv project (installs ../shared as editable)
│   ├── app/main.py                create_app factory: settings, CORS, sessions, routers, /health
│   ├── app/settings.py            every environment variable, validated at startup
│   ├── app/models.py              claims, evidence_files, claim_notes, participants, challenges + chain_* index tables
│   ├── app/api/                   auth.py, claims.py, files.py, notes.py, public.py, views.py (per-viewer responses)
│   ├── app/services/              evidence.py (image/PDF sanitize, salt, store), crypto.py (HKDF, AES-GCM, HMAC),
│   │                              bundles.py, claims.py (claim ID, metadataHash, roots), notes.py, access.py, auth.py
│   ├── app/indexer/               __main__.py (CLI), sync.py, projection.py, rpc.py, abi.py, deployment.py
│   ├── alembic/versions/          0001 initial tables, 0002 bundles, 0003 chain index, 0004 salted commitments,
│   │                              0005 claim notes
│   ├── tests/                     pytest suite (in-memory SQLite; anvil end-to-end test when Foundry is present)
│   ├── docker-compose.yml         PostgreSQL 16 (role poa, db proof_of_aid, host port ${POSTGRES_PORT:-5432})
│   └── .env.example               database, secrets, CORS, chain settings
└── frontend/                      Vite app, pnpm
    ├── src/pages/                 DashboardPage (/), WorkspacePage (/workspace), PublicClaimPage (/claims/:claimId), NotFoundPage (*)
    ├── src/data/                  claim sources: ChainClaimSource, ApiClaimSource, MockClaimSource; manifests;
    │                              typed ABI subset; evidence service client (login, create claim, upload)
    ├── src/evidence/              manifest schema (zod) and verification logic
    ├── src/chain/                 role screens' logic: call builders, registry reads, action planner,
    │                              transaction phases; roleActions.anvil.test.ts (opt-in end-to-end test)
    ├── src/components/            page components; wallet/ holds the per-role forms, TxButton, TxStatus
    ├── src/hooks/                 useClaim, useRole, useContractAction, useChainTime, useEvidenceService, …
    ├── src/utils/                 merkle.ts, metadata.ts, contractErrors.ts, …
    ├── src/config/                env.ts (zod validation of VITE_*), chains, wagmi, contracts, demo evidence
    ├── src/styles/                tokens.css (DESIGN.md tokens, light + dark), global.css (layout)
    ├── public/demo-evidence/      made-up evidence files and their manifests (roots anchored on Sepolia)
    ├── .env.example               template for .env
    └── .env.sepolia               committed: public Sepolia addresses and deployBlock, used by dev:sepolia
```

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Git | any | cloning |
| Foundry (`forge`, `cast`, `anvil`) | 1.8.3 (`foundryup` or `brew install foundry`) | contracts, local chain, the backend's anvil test |
| Python + uv | Python ≥ 3.12 (checked with 3.14), uv 0.11 (`curl -LsSf https://astral.sh/uv/install.sh \| sh`) | shared, backend |
| PostgreSQL | 16 via Docker (`backend/docker-compose.yml`) or a native 16+ server (18.6 checked) | running the backend and indexer; **not** the tests (in-memory SQLite) |
| Node.js | 20.19+ or 22.12+ (Vite 8); checked with 26 | frontend |
| pnpm | 12.6.0, pinned in `frontend/package.json` (`packageManager`); `corepack enable` once | frontend; never `npm install` (the lockfile is `pnpm-lock.yaml`) |
| MetaMask | any recent, in a separate browser profile | only the role screens; the public page never signs |

No account, API key or testnet ETH is needed to build, test or run locally. Redeploying to Arbitrum
Sepolia needs a funded test-only mnemonic (about 0.05 ETH).

## Install

```bash
(cd contracts && forge soldeer install --config-location foundry && forge build)  # OpenZeppelin 5.7.0 + forge-std 1.16.2; solc 0.8.30 downloads on first build
(cd shared && uv sync)                                                            # own .venv
(cd backend && uv sync)                                                           # own .venv, ../shared as editable
corepack enable                                                                   # once per machine
(cd frontend && pnpm install)
```

## Environment files

`.env` files are git-ignored; copy each template next to it. Never commit a `.env`, and never put a
key or mnemonic that holds real funds in one.

| File | Needed for | Variables |
| --- | --- | --- |
| `backend/.env` (from `.env.example`) | running the API, migrations and the indexer | `DATABASE_URL` (required; `postgresql+psycopg://poa:poa_dev_password@localhost:5432/proof_of_aid` in the template), `EVIDENCE_ENCRYPTION_KEY` (required; base64 of 32 random bytes: `python3 -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"`), `STORAGE_DIR` (required; `./storage`, encrypted files), `SESSION_SECRET` (required, ≥ 16 chars: `python3 -c "import secrets;print(secrets.token_hex(32))"`), `CORS_ORIGINS` (default `http://localhost:5173`; comma-separated exact origins, no `*`), `DEPLOYMENT_FILE` (a `../shared/deployments/*.json`; enables `/public/*`, the indexer and chain roles), `CHAIN_RPC_URL` (indexer only), `ROLE_SOURCE` (`chain` by default when `DEPLOYMENT_FILE` is set, else `local`), `INDEXER_CONFIRMATIONS` (5), `INDEXER_BLOCK_CHUNK` (2000), `INDEXER_POLL_SECONDS` (5); for Docker Compose also `POSTGRES_PASSWORD` (default `poa_dev_password`) and `POSTGRES_PORT` (default 5432) |
| `frontend/.env` (from `.env.example`) | optional; without it the app runs on built-in demo data | `VITE_CHAIN` (`anvil` default, or `arbitrumSepolia`), `VITE_RPC_URL` (empty = the chain's public RPC), `VITE_CLAIM_REGISTRY_ADDRESS` + `VITE_PARTICIPANT_REGISTRY_ADDRESS` (both or neither; empty = demo data), `VITE_DEPLOY_BLOCK` (history starts here; default 0), `VITE_LOG_CHUNK_SIZE` (blocks per `eth_getLogs`, default 50000), `VITE_API_URL` (backend base URL). Only `VITE_*` values reach the browser; all are validated at startup |
| `frontend/.env.sepolia` | committed, used by `pnpm dev:sepolia` | the Sepolia addresses and `deployBlock` 312397989; nothing to fill |
| `contracts/.env` (from `.env.example`) | only deploying to Arbitrum Sepolia; forge loads it automatically | `ARBITRUM_SEPOLIA_RPC_URL`, `MNEMONIC` (fresh test-only; wallets 0–6 of the demo), `REGISTRY_ADMIN` + `ACCREDITATION_AUTHORITY` (two different wallets, for `Deploy.s.sol`), `USE_EXISTING` (`true` reuses the deployment file), `DEMO_CLAIM_UUID` (replay the demo with another claim ID), `ARBISCAN_API_KEY` (optional `--verify`) |

Opt-in test variables: `ANVIL_E2E_RPC` and `ANVIL_E2E_API` enable the frontend's anvil end-to-end test.

## Build, test, lint

```bash
(cd contracts && forge build)
(cd contracts && forge test)                          # 168 passed
(cd contracts && forge coverage --report summary)     # 100% lines/statements/branches/functions on src/ (~20 s)
(cd contracts && forge fmt --check)                   # no output = formatted
(cd shared && uv run pytest -q)                       # 34 passed
uv run --project backend pytest -c backend/pyproject.toml backend/tests -q   # 128 passed; run from code/, see Gotchas
(cd frontend && pnpm typecheck)                       # tsc -b --noEmit, silent
(cd frontend && pnpm lint)                            # oxlint, silent
(cd frontend && pnpm test)                            # 511 passed, 8 skipped
(cd frontend && pnpm build)                           # tsc -b && vite build → frontend/dist/
```

Frontend scripts (`frontend/package.json`): `dev` (Vite on 5173), `dev:sepolia` (`vite --mode
sepolia`), `build`, `typecheck`, `test` (`vitest run`), `lint` (`oxlint`), `preview` (serve `dist/`).
The backend's anvil end-to-end test starts its own anvil on chain ID 31338 and is skipped when
Foundry is not on `PATH` or `forge soldeer install` has not been run.

## Run locally

### Frontend modes

| Mode | Command (from `code/frontend`) | Data |
| --- | --- | --- |
| Demo data | `pnpm dev` with no `.env` (or both addresses empty) | three built-in sample claims, "Demo data" label; no chain, no wallet actions |
| Live Arbitrum Sepolia | `pnpm dev:sepolia` | the deployed contracts; the demo claim at `/claims/0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28` |
| Local anvil | `VITE_CHAIN=anvil VITE_CLAIM_REGISTRY_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 VITE_PARTICIPANT_REGISTRY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 VITE_DEPLOY_BLOCK=1 pnpm dev` | the local demo below |
| With the backend | add `VITE_API_URL=http://localhost:8000` to either chain mode | indexer history, API file lists, claim text check, claim list, recording claims and proof |

The repository's `.claude/launch.json` defines two preview servers: `frontend` (`pnpm dev` on port
5173, reading `frontend/.env` if present) and `frontend-sepolia` (the Sepolia addresses passed inline,
port 5174; add that origin to `CORS_ORIGINS` if it uses the API).

### Local anvil demo

```bash
anvil                                              # terminal 1: http://127.0.0.1:8545, chain ID 31337

cd contracts                                       # terminal 2
REGISTRY_ADMIN=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
ACCREDITATION_AUTHORITY=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
forge script script/Deploy.s.sol:Deploy --rpc-url anvil --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
MNEMONIC="test test test test test test test test test test test junk" USE_EXISTING=true \
forge script script/DemoLifecycle.s.sol:DemoLifecycle --rpc-url anvil --broadcast --slow
```

These are anvil's public development keys; never use them on a real network. The demo ends
`Verified` with 0.0111 ETH locked (`lockedOf`). To settle it, jump 60 days and call `settle` (anyone):

```bash
CLAIMS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
CLAIM=0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28
cast call $CLAIMS "statusOf(bytes32)(uint8)" $CLAIM --rpc-url anvil        # 5 = Verified
cast rpc evm_increaseTime 5184001 --rpc-url anvil && cast rpc evm_mine --rpc-url anvil
cast send $CLAIMS "settle(bytes32)" $CLAIM --rpc-url anvil \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
cast call $CLAIMS "lockedOf(bytes32)(uint256)" $CLAIM --rpc-url anvil      # 0
```

### Backend and indexer

```bash
cd backend
cp .env.example .env                               # then fill EVIDENCE_ENCRYPTION_KEY and SESSION_SECRET
docker compose up -d                               # PostgreSQL 16 (or point DATABASE_URL at a native server)
uv run alembic upgrade head                        # migrations 0001–0005 (0005 = claim_notes, P10.3)

DEPLOYMENT_FILE=../shared/deployments/anvil.json CHAIN_RPC_URL=http://127.0.0.1:8545 \
INDEXER_CONFIRMATIONS=0 uv run python -m app.indexer --once          # drop --once to keep polling

DEPLOYMENT_FILE=../shared/deployments/anvil.json \
uv run uvicorn app.main:create_app --factory --port 8000             # add --reload while developing

curl -s localhost:8000/health                                        # {"status":"ok"}
curl -s localhost:8000/public/indexer/status
```

Against Arbitrum Sepolia use `DEPLOYMENT_FILE=../shared/deployments/arbitrum-sepolia.json` and
`CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc` (default confirmations). Indexer exit codes:
0 ok, 1 sync failed, 2 configuration error. To record claims from the role screens, keep the indexer
running (without `--once`) so the backend learns new roles.

**Updating an existing checkout (P10):** run `(cd backend && uv sync)` once (new dependency `pypdf`)
and `uv run alembic upgrade head` (adds migration 0005, the `claim_notes` table). No contract change
and no redeploy.

### Reviewer view of private files and notes

With the backend and `VITE_API_URL` configured, open a claim's public page (`/claims/<claimId>`)
with the wallet of the claim's organization, one of its internal verifiers or its assigned auditor
connected. In **Evidence files (authorized)**, press *Sign in with your wallet* (a signature, not a
transaction); the section then lists every file with its fingerprint and bundle, a **Download**
button (decrypted by the backend) and **Check this file** (re-hashed in the browser with the file's
salt and proven against the onchain root). **Notes (authorized)** shows each justification, proof
request, counter-evidence and dispute decision next to its history event, checked against the
recorded fingerprint. Other signed-in wallets see an explanation and only the notes they wrote.

### Role screens and their end-to-end test

With anvil, the demo, the backend and the frontend with `VITE_API_URL` running, import anvil accounts
0–7 into MetaMask (network `http://127.0.0.1:8545`, chain ID 31337) and follow
[RUNBOOK path D](../docs/RUNBOOK.md#d-role-screens-sign-each-roles-actions-from-the-browser). The same
calls run without MetaMask (moves anvil's clock 60 days per run):

```bash
cd frontend
ANVIL_E2E_RPC=http://127.0.0.1:8545 ANVIL_E2E_API=http://localhost:8000 \
  pnpm vitest run src/chain/roleActions.anvil.test.ts                 # 8 passed; without ANVIL_E2E_API the backend step is skipped
```

## Deploy to Arbitrum Sepolia

```bash
cd contracts
cp .env.example .env            # ARBITRUM_SEPOLIA_RPC_URL and a fresh test-only MNEMONIC (deployer = index 0)
forge script script/DemoLifecycle.s.sol:DemoLifecycle --rpc-url arbitrum_sepolia --broadcast --slow
python3 script/record_transactions.py DemoLifecycle.s.sol --chain-id 421614
# optional: --verify on the forge command (needs ARBISCAN_API_KEY)
```

`DemoLifecycle` deploys (unless `USE_EXISTING=true`), writes `../shared/deployments/arbitrum-sepolia.json`,
funds the six other wallets from the deployer and runs the demo. `record_transactions.py` then adds
every deployment and lifecycle transaction and sets `deployBlock` from the first deployment receipt
(always run it). To deploy without the demo: `Deploy.s.sol` with `REGISTRY_ADMIN`,
`ACCREDITATION_AUTHORITY` and `--account <keystore>` or `--private-key`, then
`python3 script/record_transactions.py Deploy.s.sol --chain-id 421614`. After a redeploy, update
`frontend/.env.sepolia`, `.claude/launch.json` and the Arbiscan links in `docs/SUBMISSION.md`, commit
the deployment file, and empty the backend's chain tables (Gotchas).

## Regenerate generated files

| What | Command | When |
| --- | --- | --- |
| ABIs in `shared/abi/` | `(cd contracts && bash script/export-abi.sh)` | after changing an interface (then rebuild the frontend: its typed ABI subset has a drift test) |
| Merkle vectors | `(cd shared && uv run python -m poa_shared.gen_vectors)` | after changing the Merkle recipe (never for existing claims) |
| Metadata vectors | `(cd shared && uv run python -m poa_shared.gen_metadata_vectors)` | after changing the metadata recipe |
| Note vectors | `(cd shared && uv run python -m poa_shared.gen_note_vectors)` | after changing the note recipe |
| Deployment files | `python3 contracts/script/record_transactions.py <Script>.s.sol --chain-id <id>` | after every broadcast |
| Demo roots | recompute with `poa_shared.merkle.build_root` and update `EVIDENCE_ROOT` / `SUPPLEMENTARY_ROOT` in `contracts/script/DemoLifecycle.s.sol` and `frontend/src/mocks/claims.ts` | after editing `frontend/public/demo-evidence/` |

On 2026-09-25 all four generators reproduced the committed files byte for byte.

## Gotchas

- **Backend tests: run them from `code/`** with `uv run --project backend pytest -c
  backend/pyproject.toml backend/tests`. Inside `code/backend`, `uv run pytest` loads
  `backend/.env`; once it sets `DEPLOYMENT_FILE` or other chain values, they leak into the tests'
  settings and dozens of tests fail.
- **`localhost`, not `127.0.0.1`, for the page and the API.** The login cookie travels only between
  same-site origins and `CORS_ORIGINS` compares exact origins: open `http://localhost:5173` and use
  `VITE_API_URL=http://localhost:8000`. (anvil's RPC stays `http://127.0.0.1:8545`.) Another port,
  such as 5174, must be added to `CORS_ORIGINS`.
- **After a redeploy or an anvil restart, empty the chain tables** (evidence tables are untouched):
  `psql "postgresql://poa:<password>@localhost:5432/proof_of_aid" -c "TRUNCATE chain_events,
  chain_participants, chain_claims, sync_state;"` (your `DATABASE_URL` without `+psycopg`).
  Otherwise the indexer resumes from the old cursor and the old chain's roles and claims remain.
- **MetaMask after an anvil restart** keeps old nonces ("nonce too high"): Settings → Advanced →
  Clear activity tab data, for each imported account.
- **Soldeer:** `forge soldeer install` may ask where to keep its configuration when it cannot detect
  it; `--config-location foundry` answers without a prompt (the config stays in `foundry.toml`, which
  is not modified).
- **Uvicorn needs the factory flag:** `uvicorn app.main:create_app --factory`; `app.main:app` does not
  exist.
- **Port 5432 taken** (for example by a Homebrew PostgreSQL): set `POSTGRES_PORT=5433` in
  `backend/.env` before `docker compose up -d` and use `:5433` in `DATABASE_URL` (and in the
  `TRUNCATE` command). The container's own port stays 5432.
- **`Deploy.s.sol` on anvil rewrites `shared/deployments/anvil.json`** without its recorded
  transaction hashes; the addresses are the same. `git checkout -- shared/deployments/anvil.json`
  restores it (or run `record_transactions.py`).
- **The demo claim can be anchored once per chain** (`ClaimAlreadyExists`): restart anvil, or add
  `DEMO_CLAIM_UUID=<any text>` to the `DemoLifecycle` command.
- **Corepack says a folder "is configured to use yarn":** a `package.json` in a parent folder (for
  example your home directory) declares another package manager; run pnpm from `code/frontend`,
  whose own `packageManager` field wins.
- **The API's manifest for a script-anchored claim is 404** (it has no backend record); the page then
  uses the committed demo manifests, accepted only because their roots match the chain.
- **Slow Sepolia history:** the public RPC rate-limits `eth_getLogs`; lower `VITE_LOG_CHUNK_SIZE` or
  `INDEXER_BLOCK_CHUNK`, or set your own `VITE_RPC_URL` / `CHAIN_RPC_URL`.

## Test counts

Re-run on 2026-09-25 on `main`: contracts **168 passed** (ClaimRegistry 82, ParticipantRegistry 45,
incentives 37, Merkle vectors 3, invariant suite 1 entry holding 9 invariants over 8,192 random
calls), `forge coverage` 100% lines, statements, branches and functions on `ClaimRegistry.sol` and
`ParticipantRegistry.sol`; shared **34 passed**; backend **128 passed**; frontend **511 passed, 8
skipped**, typecheck, lint and build clean (shared, backend and frontend re-run after the P10 fixes). Details and what each suite covers:
[SUBMISSION.md §3](../docs/SUBMISSION.md#3-demo-and-validation).

## Runbook explanations

The explanations below were moved here unchanged from [RUNBOOK.md](../docs/RUNBOOK.md), which now
keeps only the commands and their expected results. Each note replaces one "This section is
technically explained at …" line in the RUNBOOK, in the same order. Words such as "above",
"below" or "the commands below" refer to the RUNBOOK section named in the heading; only relative
link paths were adjusted to this file's location.

### Runbook: introduction

#### Introduction, note 1

The shortest reproducible path from a fresh clone to a working demo of the **Trust, Evidence &
Privacy** prototype. Start from the repository root. After `cd code`, every command runs from
`code/` unless a block starts with its own `cd`.

There are four ways to see it work, from cheapest to most complete:

### Runbook: Setup

#### Setup, note 1

If Corepack reports that a folder "is configured to use yarn", a `package.json` in a parent folder
(for example your home directory) declares another package manager. Inside `code/frontend/` the
frontend's own `packageManager` field wins, so run pnpm from there.

### Runbook: Configuration

#### Configuration, note 1

Each layer has its own template. Copy it to `.env` in the same folder; `.env` files are
git-ignored. Never commit a `.env`, and never put a key or mnemonic that holds real funds in one.

| Template | When you need it | What to fill |
| --- | --- | --- |
| `code/frontend/.env.example` | Optional. Without `.env` the app runs on built-in demo data. | `VITE_CHAIN`, both contract addresses, `VITE_DEPLOY_BLOCK`, optional `VITE_API_URL`. Only `VITE_*` values reach the browser: no secrets here. |
| `code/frontend/.env.sepolia` | Committed on purpose (public addresses only); used by `pnpm dev:sepolia`. | Nothing. |
| `code/backend/.env.example` | Path C (API, migrations, indexer). | `DATABASE_URL`, and two secrets generated locally (commands below). The P4 values (`DEPLOYMENT_FILE`, `CHAIN_RPC_URL`, …) can stay commented and be passed on the command line as shown in path C. |
| `code/contracts/.env.example` | Only to deploy to Arbitrum Sepolia. The local anvil demo needs no `.env`. | `ARBITRUM_SEPOLIA_RPC_URL`, a **fresh test-only** `MNEMONIC`, optional `ARBISCAN_API_KEY`. |

Backend secrets (generate them on your machine, never share them):

### Runbook: B. Local anvil demo

#### B. Local anvil demo, note 1

Terminal 1:

#### B. Local anvil demo, note 2

Terminal 2, from `code/contracts`. Anvil's well-known development accounts sign everything (public
test keys, never use them on a real network):

#### B. Local anvil demo, note 3

Check the result and settle the deposits after the 60-day window (still in `code/contracts`):

#### B. Local anvil demo, note 4

Settling is optional; once settled, the claim can never be disputed again. To see the local chain
in the browser (terminal 3, from `code/frontend`):

#### B. Local anvil demo, note 5

**Reset:** stop anvil (Ctrl+C) and start it again; the chain is empty and the commands above can be
repeated with the same addresses. On a chain that keeps running, the demo claim can be anchored
only once (`ClaimAlreadyExists`): replay with `DEMO_CLAIM_UUID=<any text>` added to the
`DemoLifecycle` command (the claim ID becomes `keccak256(bytes(uuid))`, shown in the script log).

### Runbook: C. Backend API, migrations and indexer

#### C. Backend and indexer, note 1

Start PostgreSQL. Either Docker (from `code/backend`):

#### C. Backend and indexer, note 2

If port 5432 is already taken (for example by a Homebrew PostgreSQL), add `POSTGRES_PORT=5433` to
`backend/.env` and use `:5433` in `DATABASE_URL`. Or use a native server: create a role and a
database once (`CREATE ROLE poa LOGIN PASSWORD '…'; CREATE DATABASE proof_of_aid OWNER poa;`) and
point `DATABASE_URL` at it. Then, from `code/backend` with `.env` filled as in *Configuration*:

#### C. Backend and indexer, note 3

Index the local anvil chain from path B and start the API (anvil still running):

#### C. Backend and indexer, note 4

Against Arbitrum Sepolia instead, use `DEPLOYMENT_FILE=../shared/deployments/arbitrum-sepolia.json`
and `CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc` (default confirmations), and drop
`--once` to keep polling.

#### C. Backend and indexer, note 5

An existing database from before P10 needs `uv sync` (new dependency `pypdf`) and
`uv run alembic upgrade head` once more: it applies only 0005. No contract change, no redeploy.

#### C. Backend and indexer, note 6

**After a redeploy or an anvil restart,** the database still holds the old chain's index and the
indexer cursor. Empty the chain tables before indexing again (the evidence tables are untouched):

### Runbook: D. Role screens

#### D. Role screens, note 1

The workspace page (`/workspace`, header link **Workspace**) reads the connected wallet's role from the `ParticipantRegistry`
(the chain is the source of truth) and shows only the actions the contracts allow that role on
each claim. Every action is first simulated against the contract, so a rule it would break is
explained in plain English before the wallet asks for a signature; then MetaMask signs it and the
card shows *Confirm in wallet… → Recording… → Done ✓* with the transaction. Payable amounts
(anchor deposit, auditor deposit, dispute bond) are read from the contract, never typed in.

| Role | What it can do in the workspace |
| --- | --- |
| Registry Admin | Register / revoke organizations and internal verifiers |
| Accreditation Authority | Accredit / revoke auditors; assign an auditor to an internally verified claim; uphold or dismiss a dispute |
| Organization | Record a claim (details + evidence through the backend, then `anchorClaim` paying `anchorDeposit()`); answer a proof request (upload bundle *n*, then `submitProof`); see its claims (with the API) |
| Internal verifier | Checkpoint 1 (approve / reject) and confirm submitted proof, on its organization's claims; a different verifier than checkpoint 1 must confirm |
| Auditor | On claims assigned to it: request proof, approve (locks `auditorDeposit()`) or reject (pays nothing); dispute *another* auditor's verified claim inside the window (locks `disputeBond()`) |
| Any wallet | **Withdraw** when the contract owes it (`credits > 0`); **Settle** a verified claim once its dispute window has closed (workspace or claim page) |

Organizations and internal verifiers may also dispute a claim that is not their own. Without
`VITE_API_URL` there is no claim list and no evidence storage: paste a claim ID to act on it, and
the **Record a claim** / **Submit proof** forms say that they need the backend. In demo mode (no
contract addresses) the card only says that actions need a real chain.

**On local anvil.**

1. Run path B (anvil + `Deploy` + `DemoLifecycle`). To record claims and proof from the UI, also
   run path C against anvil, keeping the indexer running so the backend learns new roles:
   `DEPLOYMENT_FILE=../shared/deployments/anvil.json CHAIN_RPC_URL=http://127.0.0.1:8545
   INDEXER_CONFIRMATIONS=0 uv run python -m app.indexer` (without `--once`). The backend only
   accepts a claim from an organization the indexer has seen registered.
2. Start the page with the API (from `code/frontend`):

#### D. Role screens, note 2

   Open `http://localhost:5173` (use `localhost`, not `127.0.0.1`, for both the page and the API:
   the backend's login cookie is only sent between same-site origins, and `CORS_ORIGINS` must list
   the page's exact origin).
3. In MetaMask (a separate browser profile, used only for tests): **Add a network manually** →
   name `Anvil`, RPC URL `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`. Then **Import
   account** with the private keys anvil prints at startup (they are anvil's public development
   keys, derived from `test test … junk`: never send real funds to them or use them on a real
   network):

#### D. Role screens, note 3

4. **Connect wallet**, then switch accounts in MetaMask to change role (the banner and the card
   follow). If the wallet is on another network the card says so and offers **Switch to Anvil**.
5. A full claim from the browser: account 2 **Record a claim** (sign the login message, then the
   anchor transaction; the page links the new claim) → account 3, paste the claim ID (or pick it
   from the list), **Approve evidence** → account 1, **Assign auditor** `0x9965…A4dc` → account 5,
   **Request proof** → account 2, **Submit proof** with a new file → account 4, **Accept proof**
   (account 3 is refused: it did checkpoint 1) → account 5, **Approve and lock 0.001 ETH** →
   optionally account 6 disputes and account 1 resolves → jump the clock
   (`cast rpc evm_increaseTime 5184001 --rpc-url anvil && cast rpc evm_mine --rpc-url anvil`) →
   any account **Settle deposits** on the claim page → accounts 2 and 5 **Withdraw**.

**Notes (P10.3).** Every justification, proof request, counter-evidence and dispute decision gets a
random salt in the browser; the transaction anchors keccak256(salt ‖ note). With `VITE_API_URL` the
page first signs in and stores the note (encrypted) with the backend; if that fails, no transaction
is sent. Without the backend, the form shows the note and its salt with **Copy note and salt**:
nothing else keeps them.

#### D. Role screens, note 4

After an anvil restart MetaMask may keep old nonces ("nonce too high"): **Settings → Advanced →
Clear activity tab data** for each imported account.

**Automated check without MetaMask.** With path B running (and optionally path C), this test signs
the same calls the screens build, with the same anvil accounts, and checks roles, the action
planner, payable amounts, decoded reverts, the proof loop, settle and withdraw on the real
contracts (it moves anvil's clock forward 60 days per run):

#### D. Role screens, note 5

**On Arbitrum Sepolia.** `pnpm dev:sepolia` (add `VITE_API_URL` pointing at a backend that indexes
Sepolia to record claims and proof), select Arbitrum Sepolia (chain ID 421614) in MetaMask, and
connect a wallet that holds Sepolia ETH and a role in that deployment: the Registry Admin is
`0x92718b20EeBbbd2e228878D64bBCCCF951f779cf` and the Accreditation Authority
`0x0e53FF46bcAB90c2CEd3BADfafF453ef40a58e68` (the team's test-only deploy wallets, see
`code/shared/deployments/arbitrum-sepolia.json`); they register any new participant wallets
first. Transaction links go to Arbiscan. The demo claim's dispute window only closes 60 days after
its approval, so **Settle** appears there only after that date.

### Runbook: Validate

#### Validate, note 1

Every suite, from `code/`:

#### Validate, note 2

Run the backend tests **from `code/` with the command above**. Running `uv run pytest` inside
`code/backend` also works in a fresh clone, but it reads `code/backend/.env`: once that file sets
P4 values such as `DEPLOYMENT_FILE`, they leak into the tests' settings and dozens of tests fail. The backend suite
includes an end-to-end test that starts its own anvil (chain id 31338), runs `Deploy` and
`DemoLifecycle` and indexes the result; it is skipped automatically when Foundry is not on `PATH`
or `forge soldeer install` has not been run.

### Runbook: Demo

#### Demo, note 1

Steps 1–8 are executed by `DemoLifecycle.s.sol` (on Sepolia they are the transactions linked in
[SUBMISSION.md](../docs/SUBMISSION.md#3-demo-and-validation)); each appears in the page's history.
Files are hashed in the browser and never uploaded.

## Dependencies and limitations

| Dependency | Real / Mock / Simulated / Manual | Setup or availability notes |
| --- | --- | --- |
| Arbitrum Sepolia (public RPC `https://sepolia-rollup.arbitrum.io/rpc`) | Real (testnet) | Used by path A and the Sepolia indexer; no key needed. Public RPCs can rate-limit `eth_getLogs`: the page and the indexer halve their block range automatically. |
| `ParticipantRegistry` / `ClaimRegistry` | Real | Deployed on Arbitrum Sepolia (addresses above); identical bytecode on local anvil. |
| Local chain (anvil) | Real (local) | Path B and the backend's end-to-end test. |
| Participants' wallets | Simulated | Seven test-only wallets from a mnemonic; accreditation is a manual admin action, not a real identity check. |
| Role actions (register, anchor, attest, assign, proof loop, dispute, resolve, settle, withdraw) | Real | Signed in the browser by each role's wallet (path D), or by `DemoLifecycle.s.sol` and `cast` for the scripted demo. Recording a claim or proof from the UI needs the backend (path C). |
| Deposits and bonds | Real (test ETH) | 1/100 of the reference amounts on Sepolia and in the scripts. |
| Evidence files | Mock | Made-up text/CSV files in `code/frontend/public/demo-evidence/`; the Sepolia demo claim anchors their real Merkle roots. The EXIF/GPS stripping is proven by a backend test with a synthetic JPEG, the PDF metadata stripping by one with a generated PDF. |
| Claim metadata (title, description) | Mock | The Sepolia demo claim anchors a stand-in `metadataHash` and has no backend record, so its page says there is nothing to check. |
| PostgreSQL | Real | Docker Compose or a native server; path C only. Tests use in-memory SQLite. |
| Evidence storage | Simulated | Local folder (`STORAGE_DIR`), files encrypted with AES-256-GCM, instead of S3/MinIO. |
| Backend indexer API | Real, optional | The public page works without it and falls back to the chain when it is unreachable or behind. |
| Reviewer notes (P10.3) | Real with the backend | Stored encrypted by the backend before anchoring; without it, only the author's copy exists. Notes of the Sepolia demo (anchored by the script before P10.3) are unsalted and not stored. |

