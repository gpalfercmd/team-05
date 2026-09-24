# Runbook

The shortest reproducible path from a fresh clone to a working demo of the **Trust, Evidence &
Privacy** prototype. Start from the repository root. After `cd code`, every command runs from
`code/` unless a block starts with its own `cd`.

There are three ways to see it work, from cheapest to most complete:

| Path | Needs | Shows |
| --- | --- | --- |
| **A. Live Sepolia page** (read-only) | Node + pnpm | The deployed contracts on Arbitrum Sepolia and the demo claim's full history; in-browser evidence checks (match / mismatch). No wallet, no keys, no backend. |
| **B. Local anvil demo** | + Foundry | The whole lifecycle executed on your machine by `DemoLifecycle.s.sol` (anchor → checkpoint 1 → proof loop → final approval → dispute with bond → dismissal), then the 60-day settlement of the deposits. |
| **C. Backend + indexer** | + Python/uv + PostgreSQL | The evidence API, database migrations, the chain indexer and the public timeline API that the page can use as a speed-up. |

## Requirements

| Tool | Version checked | Needed for |
| --- | --- | --- |
| Git | any | cloning |
| Node.js | 20.19+ or 22.12+ (Vite 8); checked with 26 | frontend (A, B, C) |
| pnpm | 12.6.0, pinned in `code/frontend/package.json` (`packageManager`); run `corepack enable` once | frontend. Do not use `npm install` (the lockfile is `pnpm-lock.yaml`). |
| Foundry (`forge`, `anvil`, `cast`) | 1.8.3 (`foundryup` or `brew install foundry`) | contracts, local chain (B, C), backend anvil test |
| Python + uv | Python ≥ 3.12, uv 0.11 (`curl -LsSf https://astral.sh/uv/install.sh \| sh`) | shared recipe, backend (C) |
| PostgreSQL | 16 (Docker, `code/backend/docker-compose.yml`) or a native 16+ server | backend API and indexer (C). The test suites do **not** need it (they use in-memory SQLite). |
| Browser | any recent one | the public page. MetaMask is **not** needed: the page never signs. |

No accounts, API keys or testnet ETH are needed to run anything below. Arbitrum Sepolia ETH and a
test-only mnemonic are needed only to redeploy the contracts (see
[`code/contracts/README.md`](../code/contracts/README.md#deploy--demo)).

## Setup

```bash
git clone https://github.com/proof-of-aid/team-05.git
cd team-05/code

(cd contracts && forge soldeer install && forge build)   # restores OpenZeppelin 5.7.0 + forge-std 1.16.2 from soldeer.lock; solc 0.8.30 downloads on first build
(cd shared && uv sync)                                    # Merkle/metadata recipe (own .venv)
(cd backend && uv sync)                                   # FastAPI app (own .venv, installs ../shared as editable)
corepack enable                                           # once per machine
(cd frontend && pnpm install)
```

If Corepack reports that a folder "is configured to use yarn", a `package.json` in a parent folder
(for example your home directory) declares another package manager. Inside `code/frontend/` the
frontend's own `packageManager` field wins, so run pnpm from there.

### Configuration (`.env.example` files)

Each layer has its own template. Copy it to `.env` in the same folder; `.env` files are
git-ignored. Never commit a `.env`, and never put a key or mnemonic that holds real funds in one.

| Template | When you need it | What to fill |
| --- | --- | --- |
| `code/frontend/.env.example` | Optional. Without `.env` the app runs on built-in demo data. | `VITE_CHAIN`, both contract addresses, `VITE_DEPLOY_BLOCK`, optional `VITE_API_URL`. Only `VITE_*` values reach the browser: no secrets here. |
| `code/frontend/.env.sepolia` | Committed on purpose (public addresses only); used by `pnpm dev:sepolia`. | Nothing. |
| `code/backend/.env.example` | Path C (API, migrations, indexer). | `DATABASE_URL`, and two secrets generated locally (commands below). The P4 values (`DEPLOYMENT_FILE`, `CHAIN_RPC_URL`, …) can stay commented and be passed on the command line as shown in path C. |
| `code/contracts/.env.example` | Only to deploy to Arbitrum Sepolia. The local anvil demo needs no `.env`. | `ARBITRUM_SEPOLIA_RPC_URL`, a **fresh test-only** `MNEMONIC`, optional `ARBISCAN_API_KEY`. |

Backend secrets (generate them on your machine, never share them):

```bash
cd backend
cp .env.example .env
python3 -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"   # → EVIDENCE_ENCRYPTION_KEY
python3 -c "import secrets;print(secrets.token_hex(32))"                          # → SESSION_SECRET
cd ..
```

## Run

### A. Public page against the live Arbitrum Sepolia deployment

```bash
cd frontend
pnpm dev:sepolia        # reads .env.sepolia; Ctrl+C to stop
```

**Expected result:** Vite prints `Local: http://localhost:5173/`. The home page offers **See the
demo claim**, which opens
`http://localhost:5173/claims/0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28`:
status **Verified**, the 9-step history read from the chain, both evidence bundles with their file
lists, and a **Deposits** card with 0.0111 ETH held and "Disputes open until …". Addresses and
deploy block come from `code/shared/deployments/arbitrum-sepolia.json`
(ParticipantRegistry `0x9c0599ca7ADF39648e62110A14ed29Ab0D994aA1`, ClaimRegistry
`0x658e3D60058a0B4f52AAbc4e536F4b2963bBc013`, deploy block 312397989). Loading the history takes a
few seconds (chunked `eth_getLogs` over the public RPC).

### B. Local anvil demo (full lifecycle on your machine)

Terminal 1:

```bash
anvil                   # local chain on http://127.0.0.1:8545, chain id 31337; Ctrl+C to stop
```

Terminal 2, from `code/contracts`. Anvil's well-known development accounts sign everything (public
test keys, never use them on a real network):

```bash
cd contracts
REGISTRY_ADMIN=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
ACCREDITATION_AUTHORITY=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
forge script script/Deploy.s.sol:Deploy --rpc-url anvil --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

MNEMONIC="test test test test test test test test test test test junk" USE_EXISTING=true \
forge script script/DemoLifecycle.s.sol:DemoLifecycle --rpc-url anvil --broadcast --slow
```

**Expected result:** the second script logs the nine steps (`1. organization anchors the evidence
root` … `9. authority dismisses the dispute`), `evidence roots onchain: 2` and
`escrow locked (wei): 11100000000000000` (0.0111 ETH), and ends with `ONCHAIN EXECUTION COMPLETE &
SUCCESSFUL`. The contracts are at the same addresses as in the committed
`code/shared/deployments/anvil.json` (ParticipantRegistry `0x5FbDB2315678afecb367f032d93F642f64180aa3`,
ClaimRegistry `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`). `Deploy.s.sol` rewrites that file
without the recorded transaction hashes, so `git status` shows it modified; the addresses are the
same, and `git checkout -- ../shared/deployments/anvil.json` restores the committed version.

Check the result and settle the deposits after the 60-day window (still in `code/contracts`):

```bash
CLAIMS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
CLAIM=0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28
cast call $CLAIMS "statusOf(bytes32)(uint8)" $CLAIM --rpc-url anvil      # 5 = Verified
cast call $CLAIMS "lockedOf(bytes32)(uint256)" $CLAIM --rpc-url anvil    # 11100000000000000

cast rpc evm_increaseTime 5184001 --rpc-url anvil && cast rpc evm_mine --rpc-url anvil   # jump past 60 days
cast send $CLAIMS "settle(bytes32)" $CLAIM --rpc-url anvil \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anyone may settle
cast call $CLAIMS "lockedOf(bytes32)(uint256)" $CLAIM --rpc-url anvil    # 0
cast call $CLAIMS "credits(address)(uint256)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --rpc-url anvil  # organization: 10500000000000000 (penalty + half the bond)
cast call $CLAIMS "credits(address)(uint256)" 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc --rpc-url anvil  # auditor: 1600000000000000 (deposit + reward + half the bond)
```

Settling is optional; once settled, the claim can never be disputed again. To see the local chain
in the browser (terminal 3, from `code/frontend`):

```bash
cd frontend
VITE_CHAIN=anvil \
VITE_CLAIM_REGISTRY_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
VITE_PARTICIPANT_REGISTRY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
VITE_DEPLOY_BLOCK=1 pnpm dev
```

**Expected result:** `http://localhost:5173` → **See the demo claim** shows the same claim as on
Sepolia, read from anvil (after settling: "Held by the contract 0 ETH" and "Settled: the deposits
were paid out."; the dispute-window line compares with your computer's clock, not anvil's, so it
may still say "Disputes open until …").

**Reset:** stop anvil (Ctrl+C) and start it again; the chain is empty and the commands above can be
repeated with the same addresses. On a chain that keeps running, the demo claim can be anchored
only once (`ClaimAlreadyExists`): replay with `DEMO_CLAIM_UUID=<any text>` added to the
`DemoLifecycle` command (the claim ID becomes `keccak256(bytes(uuid))`, shown in the script log).

### C. Backend API, migrations and indexer

Start PostgreSQL. Either Docker (from `code/backend`):

```bash
cd backend
docker compose up -d        # Postgres 16, role poa / db proof_of_aid, port 5432
```

If port 5432 is already taken (for example by a Homebrew PostgreSQL), add `POSTGRES_PORT=5433` to
`backend/.env` and use `:5433` in `DATABASE_URL`. Or use a native server: create a role and a
database once (`CREATE ROLE poa LOGIN PASSWORD '…'; CREATE DATABASE proof_of_aid OWNER poa;`) and
point `DATABASE_URL` at it. Then, from `code/backend` with `.env` filled as in *Configuration*:

```bash
uv run alembic upgrade head          # migrations 0001–0004
```

Index the local anvil chain from path B and start the API (anvil still running):

```bash
DEPLOYMENT_FILE=../shared/deployments/anvil.json CHAIN_RPC_URL=http://127.0.0.1:8545 \
INDEXER_CONFIRMATIONS=0 uv run python -m app.indexer --once

DEPLOYMENT_FILE=../shared/deployments/anvil.json \
uv run uvicorn app.main:create_app --factory --port 8000     # Ctrl+C to stop
```

Against Arbitrum Sepolia instead, use `DEPLOYMENT_FILE=../shared/deployments/arbitrum-sepolia.json`
and `CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc` (default confirmations), and drop
`--once` to keep polling.

**Expected result:**

```bash
curl -s localhost:8000/health                       # {"status":"ok"}
curl -s localhost:8000/public/indexer/status        # chainId, both registries, indexedToBlock, lag
curl -s localhost:8000/public/claims/0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28/timeline
                                                    # the demo claim's events, status "Verified", 2 evidence roots
```

The indexer's `--once` run exits 0; a second run adds no events (idempotent). To let the page use
the API, add `VITE_API_URL=http://localhost:8000` to the frontend command of path A or B; the page
then says "History from the indexer API" and still reads status and roots from the contract. The
backend's `CORS_ORIGINS` (default `http://localhost:5173`) must list the page's exact origin.

**After a redeploy or an anvil restart,** the database still holds the old chain's index and the
indexer cursor. Empty the chain tables before indexing again (the evidence tables are untouched):

```bash
psql "postgresql://poa:<password>@localhost:5432/proof_of_aid" \
  -c "TRUNCATE chain_events, chain_participants, chain_claims, sync_state;"
```

## Validate

Every suite, from `code/`:

```bash
(cd contracts && forge test)                     # 168 passed
(cd contracts && forge coverage --report summary)  # 100% lines/statements/branches/functions on the src/ rows (~20 s)
(cd contracts && forge fmt --check)              # no output = formatted
(cd shared && uv run pytest -q)                  # 30 passed
uv run --project backend pytest -c backend/pyproject.toml backend/tests -q   # 111 passed
(cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build)      # 317 passed; typecheck and lint silent; build OK
```

Run the backend tests **from `code/` with the command above**. Running `uv run pytest` inside
`code/backend` also works in a fresh clone, but it reads `code/backend/.env`: once that file sets
P4 values such as `DEPLOYMENT_FILE`, they leak into the tests' settings and dozens of tests fail. The backend suite
includes an end-to-end test that starts its own anvil (chain id 31338), runs `Deploy` and
`DemoLifecycle` and indexes the result; it is skipped automatically when Foundry is not on `PATH`
or `forge soldeer install` has not been run.

**Expected result:** every command exits 0 with the counts shown.

## Demo

**Entry point:** path A (`pnpm dev:sepolia`, live chain) or path B (`anvil` + `DemoLifecycle`,
local chain), then the demo claim page `/claims/0xfedebf75…a79b28`.

**Initial state:** on Arbitrum Sepolia the demo is already executed (claim `Verified`, 0.0111 ETH in
escrow, dispute window open until 60 days after the approval). Locally: a fresh `anvil`, then the
two scripts of path B. Seven test-only wallets play every role (index 0 Registry Admin, 1
Accreditation Authority, 2 Organization, 3–4 Internal Verifiers, 5 Auditor, 6 Disputant, itself a
second accredited auditor). The evidence files are made up (`code/frontend/public/demo-evidence/`:
receipts, an invoice, a delivery summary and a stock count), no real personal data.

| Step | Action (signed by) | Expected observable result |
| ---: | --- | --- |
| 1 | Accreditation: Registry Admin registers the organization and 2 internal verifiers; the Authority accredits 2 auditors | 5 `ParticipantRegistry` transactions; the organization has 2 active verifiers (script log `cast accredited; organization verifiers: 2`) |
| 2 | **Anchor** (Organization, pays 0.0101 ETH: penalty + auditor reward) | Claim `Anchored`; `evidenceRoots[0]` = Merkle root of `manifest.json`'s files |
| 3 | **Internal verify** (Internal Verifier 1) | `InternallyVerified` |
| 4 | Auditor assigned (Authority) | Timeline: auditor assigned; status unchanged |
| 5 | **Proof loop:** request proof (Auditor) → submit supplementary evidence (Organization) → confirm (Internal Verifier 2, not the checkpoint-1 verifier) | `ProofRequested` → `ProofSubmitted` → `InternallyVerified`; a second evidence root is appended |
| 6 | **Verify** (Auditor, pays its 0.001 ETH deposit) | `Verified`; the 60-day dispute window starts |
| 7 | **Dispute with bond** (Disputant, pays 0.001 ETH) | `Disputed` |
| 8 | **Dismissal** (Authority) | `Verified` again; the bond is credited half to the organization, half to the auditor; 0.0111 ETH still in escrow |
| 9 | **Deposits / settle** (anyone, after 60 days; local only, path B) | `lockedOf` = 0; organization credited its penalty, auditor its deposit + reward; page: "Settled" |
| 10 | Public check: on the claim page, download `receipt-001.txt` from the first bundle and drop it into **Verify it yourself** | **Match**: its fingerprint belongs to the root recorded onchain |
| 11 | **Tamper a file:** change one character of `receipt-001.txt` and drop it again | **No match** |
| 12 | Bundle mode: pick *Supplementary proof #1* and drop `delivery-summary.csv` + `stock-count.txt`; then flip one byte of `stock-count.txt` | **Match** (root `0x8e94…2370`), then **No match** |

Steps 1–8 are executed by `DemoLifecycle.s.sol` (on Sepolia they are the transactions linked in
[SUBMISSION.md](SUBMISSION.md#3-demo-and-validation)); each appears in the page's history.
Files are hashed in the browser and never uploaded.

## Dependencies and limitations

| Dependency | Real / Mock / Simulated / Manual | Setup or availability notes |
| --- | --- | --- |
| Arbitrum Sepolia (public RPC `https://sepolia-rollup.arbitrum.io/rpc`) | Real (testnet) | Used by path A and the Sepolia indexer; no key needed. Public RPCs can rate-limit `eth_getLogs`: the page and the indexer halve their block range automatically. |
| `ParticipantRegistry` / `ClaimRegistry` | Real | Deployed on Arbitrum Sepolia (addresses above); identical bytecode on local anvil. |
| Local chain (anvil) | Real (local) | Path B and the backend's end-to-end test. |
| Participants' wallets | Simulated | Seven test-only wallets from a mnemonic; accreditation is a manual admin action, not a real identity check. |
| Role actions (anchor, attest, assign, dispute, resolve, settle) | Simulated (scripts) | Signed by `DemoLifecycle.s.sol` and `cast`; role screens in the UI were cut, not built. |
| Deposits and bonds | Real (test ETH) | 1/100 of the reference amounts on Sepolia and in the scripts. |
| Evidence files | Mock | Made-up text/CSV files in `code/frontend/public/demo-evidence/`; the Sepolia demo claim anchors their real Merkle roots. The EXIF/GPS stripping is proven by a backend test with a synthetic JPEG. |
| Claim metadata (title, description) | Mock | The Sepolia demo claim anchors a stand-in `metadataHash` and has no backend record, so its page says there is nothing to check. |
| PostgreSQL | Real | Docker Compose or a native server; path C only. Tests use in-memory SQLite. |
| Evidence storage | Simulated | Local folder (`STORAGE_DIR`), files encrypted with AES-256-GCM, instead of S3/MinIO. |
| Backend indexer API | Real, optional | The public page works without it and falls back to the chain when it is unreachable or behind. |

Known setup limitations and recovery:

- A slow or rate-limited RPC makes the Sepolia history load slowly; lower `VITE_LOG_CHUNK_SIZE`
  (frontend) or `INDEXER_BLOCK_CHUNK` (indexer), or set your own `VITE_RPC_URL` / `CHAIN_RPC_URL`.
- `pnpm dev` stops with `Port 5173 is in use`: stop the other server or pass `--port 5174`, and add
  that origin to the backend's `CORS_ORIGINS` if the API is used.
- On the Sepolia demo claim the settle step cannot be shown before the dispute window closes
  (60 days after the approval); use path B, which moves anvil's clock.
- The API-served manifest of a claim anchored by the script (not through the backend) returns 404;
  the page then uses the committed demo manifests, which it accepts only because their roots match
  the chain.
