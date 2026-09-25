# Runbook

The shortest reproducible path from a fresh clone to a working demo of the **Trust, Evidence &
Privacy** prototype. Start from the repository root. After `cd code`, every command runs from
`code/` unless a block starts with its own `cd`.

There are four ways to see it work, from cheapest to most complete:

| Path | Needs | Shows |
| --- | --- | --- |
| **A. Live Sepolia page** (read-only) | Node + pnpm | The deployed contracts on Arbitrum Sepolia and the demo claim's full history; in-browser evidence checks (match / mismatch). No wallet, no keys, no backend. |
| **B. Local anvil demo** | + Foundry | The whole lifecycle executed on your machine by `DemoLifecycle.s.sol` (anchor → checkpoint 1 → proof loop → final approval → dispute with bond → dismissal), then the 60-day settlement of the deposits. |
| **C. Backend + indexer** | + Python/uv + PostgreSQL | The evidence API, database migrations, the chain indexer and the public timeline API that the page can use as a speed-up. |
| **D. Role screens** (sign from the browser) | + MetaMask (B; C to record claims and proof) | Each role signs its own actions in the dashboard: register participants, record a claim with its evidence, checkpoint 1, assign an auditor, proof loop, final decision, dispute, settle, withdraw. |

## Requirements

| Tool | Version checked | Needed for |
| --- | --- | --- |
| Git | any | cloning |
| Node.js | 20.19+ or 22.12+ (Vite 8); checked with 26 | frontend (A, B, C) |
| pnpm | 12.6.0, pinned in `code/frontend/package.json` (`packageManager`); run `corepack enable` once | frontend. Do not use `npm install` (the lockfile is `pnpm-lock.yaml`). |
| Foundry (`forge`, `anvil`, `cast`) | 1.8.3 (`foundryup` or `brew install foundry`) | contracts, local chain (B, C), backend anvil test |
| Python + uv | Python ≥ 3.12, uv 0.11 (`curl -LsSf https://astral.sh/uv/install.sh \| sh`) | shared recipe, backend (C) |
| PostgreSQL | 16 (Docker, `code/backend/docker-compose.yml`) or a native 16+ server | backend API and indexer (C). The test suites do **not** need it (they use in-memory SQLite). |
| Browser | any recent one | the public page. MetaMask is **not** needed to check claims: the public page never signs. |
| MetaMask | any recent version, in a separate browser profile | only path D (role screens) |

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
were paid out."). The dispute window is judged on the chain's clock (latest block), so after the
clock jump the page says "Dispute window closed" and, until someone settles, shows a **Settle the
deposits** card (path D).

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

### D. Role screens: sign each role's actions from the browser

The dashboard's **Your wallet** card reads the connected wallet's role from the `ParticipantRegistry`
(the chain is the source of truth) and shows only the actions the contracts allow that role on
each claim. Every action is first simulated against the contract, so a rule it would break is
explained in plain English before the wallet asks for a signature; then MetaMask signs it and the
card shows *Confirm in wallet… → Recording… → Done ✓* with the transaction. Payable amounts
(anchor deposit, auditor deposit, dispute bond) are read from the contract, never typed in.

| Role | What it can do in the dashboard |
| --- | --- |
| Registry Admin | Register / revoke organizations and internal verifiers |
| Accreditation Authority | Accredit / revoke auditors; assign an auditor to an internally verified claim; uphold or dismiss a dispute |
| Organization | Record a claim (details + evidence through the backend, then `anchorClaim` paying `anchorDeposit()`); answer a proof request (upload bundle *n*, then `submitProof`); see its claims (with the API) |
| Internal verifier | Checkpoint 1 (approve / reject) and confirm submitted proof, on its organization's claims; a different verifier than checkpoint 1 must confirm |
| Auditor | On claims assigned to it: request proof, approve (locks `auditorDeposit()`) or reject (pays nothing); dispute *another* auditor's verified claim inside the window (locks `disputeBond()`) |
| Any wallet | **Withdraw** when the contract owes it (`credits > 0`); **Settle** a verified claim once its dispute window has closed (dashboard or claim page) |

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

   ```bash
   VITE_CHAIN=anvil \
   VITE_CLAIM_REGISTRY_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
   VITE_PARTICIPANT_REGISTRY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
   VITE_DEPLOY_BLOCK=1 VITE_API_URL=http://localhost:8000 pnpm dev
   ```

   Open `http://localhost:5173` (use `localhost`, not `127.0.0.1`, for both the page and the API:
   the backend's login cookie is only sent between same-site origins, and `CORS_ORIGINS` must list
   the page's exact origin).
3. In MetaMask (a separate browser profile, used only for tests): **Add a network manually** →
   name `Anvil`, RPC URL `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`. Then **Import
   account** with the private keys anvil prints at startup (they are anvil's public development
   keys, derived from `test test … junk`: never send real funds to them or use them on a real
   network):

   | anvil index | Address | Role after `DemoLifecycle` |
   | ---: | --- | --- |
   | 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Registry Admin |
   | 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Accreditation Authority |
   | 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Organization |
   | 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Internal verifier 1 |
   | 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Internal verifier 2 |
   | 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | Auditor |
   | 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` | Second auditor (the demo's disputant) |
   | 7 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` | No role (settle, withdraw) |

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

After an anvil restart MetaMask may keep old nonces ("nonce too high"): **Settings → Advanced →
Clear activity tab data** for each imported account.

**Automated check without MetaMask.** With path B running (and optionally path C), this test signs
the same calls the screens build, with the same anvil accounts, and checks roles, the action
planner, payable amounts, decoded reverts, the proof loop, settle and withdraw on the real
contracts (it moves anvil's clock forward 60 days per run):

```bash
cd frontend
ANVIL_E2E_RPC=http://127.0.0.1:8545 ANVIL_E2E_API=http://localhost:8000 \
  pnpm vitest run src/chain/roleActions.anvil.test.ts     # 8 passed; without ANVIL_E2E_API the backend step is skipped
```

**On Arbitrum Sepolia.** `pnpm dev:sepolia` (add `VITE_API_URL` pointing at a backend that indexes
Sepolia to record claims and proof), select Arbitrum Sepolia (chain ID 421614) in MetaMask, and
connect a wallet that holds Sepolia ETH and a role in that deployment: the Registry Admin is
`0x92718b20EeBbbd2e228878D64bBCCCF951f779cf` and the Accreditation Authority
`0x0e53FF46bcAB90c2CEd3BADfafF453ef40a58e68` (the team's test-only deploy wallets, see
`code/shared/deployments/arbitrum-sepolia.json`); they register any new participant wallets
first. Transaction links go to Arbiscan. The demo claim's dispute window only closes 60 days after
its approval, so **Settle** appears there only after that date.

## Validate

Every suite, from `code/`:

```bash
(cd contracts && forge test)                     # 168 passed
(cd contracts && forge coverage --report summary)  # 100% lines/statements/branches/functions on the src/ rows (~20 s)
(cd contracts && forge fmt --check)              # no output = formatted
(cd shared && uv run pytest -q)                  # 30 passed
uv run --project backend pytest -c backend/pyproject.toml backend/tests -q   # 111 passed
(cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build)      # 442 passed, 8 skipped (the opt-in anvil test); typecheck and lint silent; build OK
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
| Role actions (register, anchor, attest, assign, proof loop, dispute, resolve, settle, withdraw) | Real | Signed in the browser by each role's wallet (path D), or by `DemoLifecycle.s.sol` and `cast` for the scripted demo. Recording a claim or proof from the UI needs the backend (path C). |
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
