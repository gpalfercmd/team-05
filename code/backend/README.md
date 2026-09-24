# Backend

FastAPI app for Proof of Aid Team 05: evidence pipeline (EXIF strip, salted SHA-256 commitment,
AES-256-GCM at rest), wallet-signature login, access matrix for private evidence, and the P4 chain
indexer with its public API.

```bash
uv sync                       # Python >= 3.12, uv-managed .venv
cp .env.example .env          # fill the secrets locally, never commit .env
uv run alembic upgrade head   # create/upgrade the schema
uv run uvicorn app.main:create_app --factory --reload
uv run pytest -q              # whole suite (the anvil test runs when Foundry is on PATH)
```

## Claim metadata hash (P8.4)

`POST /claims` trims the title, description, region and date, stores them exactly as trimmed and
returns `metadata_hash_hex` for `anchorClaim`: keccak256 of the UTF-8 fields joined by `"\n"`
(title, description, location_region, claim_date `YYYY-MM-DD`, claim ID as 64 lowercase hex
characters). The recipe is `poa_shared.metadata`, frozen by `../shared/metadata-vectors.json`, which
the public page also runs. Only the description may span lines: a line break in the title or the
region is rejected with `422`, so text can never move between fields under the same hash. The
public claim view (`GET /claims/{id}`) serves the hashed strings unchanged, so anyone can recompute
the hash (`tests/test_metadata.py`).

## Indexer (P4)

The indexer reads the `ParticipantRegistry` and `ClaimRegistry` events over JSON-RPC, decodes
them with the frozen ABIs in `../shared/abi/` and stores them in the same database as the API:

| Table | Content |
| --- | --- |
| `chain_events` | Every interface event (block, tx hash, log index, time, name, decoded args). Unique on `(chain_id, tx_hash, log_index)`, so re-reading a range stores nothing twice. |
| `sync_state` | Cursor per chain and contract pair: last fully indexed block, latest head seen. |
| `chain_participants` | Roles from the accreditation events: organization / internal verifier (with its organization) / auditor, and whether still active. |
| `chain_claims` | Claim state from the lifecycle events: organization, status, checkpoint-1 verifier, assigned auditor, evidence roots, anchor and last-change block/time. |

Events, projections and cursor are written in one transaction per block chunk, so a crash never
leaves them out of step; the next run resumes after the last committed chunk. Only blocks at least
`INDEXER_CONFIRMATIONS` below the head are indexed (reorg margin).

### Configuration

All optional: without them the API still starts, roles come from the local table and the public
endpoints answer 503.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEPLOYMENT_FILE` | unset | A `../shared/deployments/*.json`. Contract addresses, chain id and `deployBlock` come from it. |
| `CHAIN_RPC_URL` | unset | JSON-RPC endpoint (indexer process only). May contain an API key: keep it in `.env`. |
| `ROLE_SOURCE` | `chain` if `DEPLOYMENT_FILE` is set, else `local` | Who decides access to private evidence (see below). `chain` requires `DEPLOYMENT_FILE`. |
| `INDEXER_CONFIRMATIONS` | `5` | Blocks to stay behind the head. Use `0` on anvil. |
| `INDEXER_BLOCK_CHUNK` | `2000` | Blocks per `eth_getLogs`. Halved automatically when the provider refuses the range, down to 1 block, then the run fails. |
| `INDEXER_POLL_SECONDS` | `5` | Pause between polls in loop mode. |

### Commands

```bash
uv run python -m app.indexer          # poll forever (Ctrl+C to stop)
uv run python -m app.indexer --once   # catch up to head - confirmations and exit (tests, demo)
```

Exit codes: `0` ok, `1` sync failed (RPC or database error; the cursor stays at the last committed
chunk), `2` configuration error. Logs carry block numbers and counts only: no addresses, and no
RPC URL (hosted URLs often embed an API key).

**Local anvil** (after running `Deploy` + `DemoLifecycle` as in `../contracts/README.md`):

```bash
DEPLOYMENT_FILE=../shared/deployments/anvil.json CHAIN_RPC_URL=http://127.0.0.1:8545 \
INDEXER_CONFIRMATIONS=0 uv run python -m app.indexer --once
```

**Arbitrum Sepolia** (put your own RPC URL in `.env`):

```bash
DEPLOYMENT_FILE=../shared/deployments/arbitrum-sepolia.json uv run python -m app.indexer
```

The first run starts at `deployBlock` (an L2 block taken from the deployment receipt) and walks
forward in `INDEXER_BLOCK_CHUNK` steps. If the provider limits `eth_getLogs` ranges, lower
`INDEXER_BLOCK_CHUNK` to skip the halving retries.

Restarting anvil resets the chain but not the database: use a fresh database (or drop the
`chain_*` and `sync_state` rows for chain 31337) before indexing a new anvil run.

### Chain-driven access control

With `ROLE_SOURCE=chain`, private evidence is readable only by:

- the organization that created the claim, while it is an active organization onchain;
- that organization's active internal verifiers, while the organization itself is active
  (revoking an organization cuts off its verifiers, like `organizationOf()` returning zero);
- the auditor currently assigned onchain (`AuditorAssigned`), while accredited, and only if the
  claim was anchored onchain by the organization that created it here.

Revocation events remove access as soon as they are indexed. Creating claims, uploading evidence
and changing file visibility also require an active organization. `ROLE_SOURCE=local` keeps the
P3 behaviour (the `participants` table plus `claims.auditor_address`), for development only.

### Public API (no login)

| Endpoint | Returns |
| --- | --- |
| `GET /public/claims?status=&limit=&offset=` | Indexed claims, newest anchor first: `claimId`, `organization`, `status`, `anchoredBlock`/`anchoredAt`, `lastStatusBlock`/`lastStatusAt`; `total`, `indexedToBlock`. `status` is a `ClaimStatus` name; `limit` 1–100 (default 20). |
| `GET /public/claims/{claimId}/timeline` | The claim's events in chain order (`blockNumber`, `txHash`, `logIndex`, `timestamp`, `event`, `args`), plus `status`, `evidenceRoots`, `chainId`, `claimRegistry`, `indexedToBlock`. `422` for a malformed id, `404` when the claim was never indexed. |
| `GET /public/indexer/status` | `chainId`, both registry addresses, `deployBlock`, `indexedToBlock`, `headBlock` (latest head seen), `lag`, `updatedAt`. |

Only public chain data is served (addresses, hashes, booleans, status names, block numbers);
nothing comes from the evidence tables. The index is a speed-up, not the source of truth:
status and evidence roots shown to users must still be verified against the contract
(`statusOf`, `evidenceRoots`), which the public claim page does itself.

### Tests

`tests/test_indexer.py` (decoder, projections, idempotency, restart, confirmations, chunk halving),
`tests/test_chain_access.py` (access matrix in chain mode), `tests/test_public_api.py` use
synthetic logs ABI-encoded from `../shared/abi/` — no network. `tests/test_indexer_anvil.py`
starts anvil (chain id 31338, so the committed `anvil.json` is never overwritten), runs the
Foundry `Deploy` and `DemoLifecycle` scripts, migrates a temporary SQLite database and runs
`python -m app.indexer --once` twice; it is skipped automatically when `anvil`/`forge` are not on
PATH or the contract dependencies are not installed.
