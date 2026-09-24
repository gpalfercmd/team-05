# Contracts

Onchain part of the **Trust, Evidence & Privacy** contribution: accreditation and the claim
verification state machine, deployed to Arbitrum Sepolia.

| Path | Purpose |
| --- | --- |
| `src/interfaces/IParticipantRegistry.sol` | Accreditation: Registry Admin registers organizations and internal verifiers; the Accreditation Authority accredits auditors. **Frozen in P1.** |
| `src/interfaces/IClaimRegistry.sol` | Claim lifecycle: anchoring, checkpoint 1, auditor assignment, proof requests, final attestation, disputes. **Frozen in P1; extended in P9** with the payable deposits, `settle`, `withdraw` and escrow views (team decision). |
| `src/ParticipantRegistry.sol` | P2 implementation of `IParticipantRegistry` (OpenZeppelin `AccessControl`). |
| `src/ClaimRegistry.sol` | P2 implementation of `IClaimRegistry` (the state machine). |
| `test/` | Foundry unit, fuzz and invariant tests (`test/invariant/`), shared fixture in `test/helpers/`; Merkle vectors shared with the backend and frontend in `../shared/`. |
| `script/Deploy.s.sol`, `script/DemoLifecycle.s.sol` | Deployment and the scripted demo story (see [Deploy & demo](#deploy--demo)). |
| `script/export-abi.sh` | Regenerates `../shared/abi/*.json`, the only contract artifact other layers import. |

Dependencies are managed with [Soldeer](https://soldeer.xyz) and pinned in `soldeer.lock`
(OpenZeppelin Contracts 5.7.0, forge-std 1.16.2); they are not committed.

```bash
forge soldeer install   # restore pinned dependencies
forge build
forge test
```

Changing an interface after P1 requires the whole team's agreement, then `script/export-abi.sh`.

## P2 implementation contract

P2 implements both frozen interfaces without changing their public API:

- `ParticipantRegistry` uses OpenZeppelin `AccessControl` and enforces one participant role per wallet. The Registry Admin manages organizations and their internal verifiers; the Accreditation Authority manages auditors. Active verifier-to-organization links and counts are required for claim anchoring.
- `ClaimRegistry` stores each claim, its original evidence root, and append-only supplementary roots. It enforces the exact `ClaimStatus` transitions declared in `IClaimRegistry`, including the two internal-verifier checkpoints, assigned-auditor checks, proof-request loop, and dispute resolution.
- Every state transition emits `StatusChanged` as well as its action-specific event. Evidence roots, metadata, request, justification, and counter-evidence values are hashes only; evidence files remain offchain.

### Required invariants

1. Only active organizations with at least two active internal verifiers can anchor claims.
2. The checkpoint-1 verifier and supplementary-proof verifier are different wallets, and neither is the organization submitter.
3. Only the Accreditation Authority can assign or reassign an active auditor, and only the assigned auditor can request proof or give the final attestation.
4. Only active accredited participants can open a dispute, never the claim's own organization or approving auditor, and only within the dispute window; the `Verified` to `Disputed` status permits at most one open dispute.
5. Only the Accreditation Authority can resolve a dispute. Any other call or invalid status transition reverts with the interface's custom errors.

### P2 validation and deployment artifacts

Tests cover every valid transition, every invalid transition (the full action × status matrix),
role-admin isolation, revoked wallets, separation of duties (including role-switch regressions),
revoked organizations (never `Verified` again: every action × status × actor × decision, and an
invariant counting transitions into `Verified`), event payloads, stored roots, fuzzed callers and
inputs, and invariants over random call sequences (`[invariant]` in `foundry.toml`). The
deployment/demo scripts use seven test-only wallets and produce:

```text
.env.example                          # variable names only
script/Deploy.s.sol                   # registry deployment
script/DemoLifecycle.s.sol            # accreditation + complete lifecycle and dispute flow
script/record_transactions.py         # adds tx hashes from Foundry's broadcast log
../shared/deployments/anvil.json             # chain 31337
../shared/deployments/arbitrum-sepolia.json  # chain 421614
```

Implementation choices the interfaces left open:

- **Participant identity is permanent.** A wallet that was ever an organization, internal verifier
  or auditor can never be registered again in any participant role, nor receive an admin role
  (`AlreadyAccredited`). Revocation is final; a replacement needs a new wallet. Otherwise a revoked
  checkpoint-1 verifier or organization could be accredited as an auditor and approve the same claim.
- Participant roles change only through the dedicated functions: `grantRole`, `revokeRole` and
  `renounceRole` revert with `AccessControlBadConfirmation()` for `ORGANIZATION_ROLE`,
  `INTERNAL_VERIFIER_ROLE` and `AUDITOR_ROLE` (they still work for the two admin roles, for hand-over).
  Nobody holds `DEFAULT_ADMIN_ROLE`.
- Revoking an organization leaves its verifiers linked but inactive (`organizationOf` returns
  `address(0)`, `activeVerifierCount` returns 0), so its open claims can no longer be attested.
- **A revoked organization's claim can be rejected, but never (re)verified.** When
  `isOrganization(claim.organization)` is false, `attestFinal(…, approve = true, …)`,
  `requestProof` (the organization could never answer; the auditor rejects instead) and
  `resolveDispute(…, upheld = false, …)` revert with `NotActiveOrganization(claim.organization)`.
  `attestFinal` reject, `resolveDispute` upheld, `openDispute`, `assignAuditor` and the views are
  unchanged. Otherwise the assigned auditor could still verify, or the Authority keep verified, a
  claim of an organization revoked for fraud. A claim already in `ProofRequested` or
  `ProofSubmitted` when its organization is revoked stays there: nobody can move it on.
- Guard order in every `ClaimRegistry` action: claim exists → status → caller → claim's
  organization still active (only where the action can lead to `Verified`, plus `requestProof`)
  → non-zero hashes. The action-specific event is emitted before `StatusChanged`.

## Incentives (P9)

`ClaimRegistry` escrows native ETH per claim so that fraud and frivolous disputes cost money. The
amounts are `immutable` constructor parameters (all must be non-zero, `ZeroValue` otherwise), with
getters of the same name:

| Parameter | Reference value | Deploy scripts (1/100, testnet) |
| --- | --- | --- |
| `auditorReward` | 0.01 ETH | 0.0001 ETH |
| `auditorDeposit` | 0.1 ETH | 0.001 ETH |
| `organizationPenalty` | 1 ETH | 0.01 ETH |
| `disputeBond` | 0.1 ETH | 0.001 ETH |
| `disputeWindow` | 60 days | 60 days |

Rules (the exact `msg.value` is checked last in each payable action, `WrongDepositAmount(expected, sent)`):

- `anchorClaim` is payable: `msg.value == anchorDeposit() == organizationPenalty + auditorReward`
  (the organization prepays the auditor's reward). Emits `DepositLocked`.
- `attestFinal` is payable: approve needs `msg.value == auditorDeposit` and records `verifiedAt`
  (once; never reset); reject needs `msg.value == 0`. Every other action is non-payable and reverts
  on value; the contract has no `receive`.
- Rejected at checkpoint 1 or by the auditor → the organization is credited its whole deposit.
- `openDispute` is payable (`msg.value == disputeBond`) and needs `block.timestamp < verifiedAt +
  disputeWindow` (`DisputeWindowClosed`). The claim's organization and approving auditor get
  `CannotDisputeOwnClaim`.
- Dismissed → the bond is credited half to the approving auditor and the rest (with the odd wei) to
  the organization; the claim is `Verified` again, with the same window.
- Upheld → the disputant is credited bond + organizationPenalty + auditorDeposit + auditorReward
  (the fraudulent organization's prepaid reward goes to whoever exposed it).
- `settle(claimId)`: anyone, once the window closed (`DisputeWindowOpen` before), for a `Verified`
  claim not yet settled (`AlreadySettled`); an open dispute blocks it (`InvalidStatus`). Credits the
  organization its penalty and the auditor its deposit + reward, emits `ClaimSettled`; the status
  stays `Verified` and the claim can never be disputed again.
- `withdraw()` pays the caller all of its `credits` (`NothingToWithdraw` when zero, `WithdrawFailed`
  if the transfer fails): checks-effects-interactions plus OpenZeppelin `ReentrancyGuard`. It is the
  only function that sends ETH; nothing loops over claims.
- Views: `credits(account)`, `verifiedAt(claimId)`, `disputeWindowClosesAt(claimId)` (0 if never
  verified), `settled(claimId)`, `lockedOf(claimId)` (escrow still held for the claim).
- Events: `DepositLocked`, `Credited`, `Withdrawn` (the only event without `claimId`), `ClaimSettled`.
- Known edge case, not fixed: a claim left in `ProofRequested`/`ProofSubmitted` when its organization
  is revoked can never move on (see above), so its deposit stays locked.

Tests: `test/ClaimRegistryIncentives.t.sol` (every path above, window boundary with `vm.warp`, odd
bond, reentrant and rejecting receivers) and the invariant
`balance == Σ credits + Σ escrow still locked == Σ accepted − Σ withdrawn`, tracked by the handler.

## Deploy & demo

The deployment file is how the backend and the frontend find the contracts:
`../shared/deployments/anvil.json` (31337) or `arbitrum-sepolia.json` (421614). Every deployment
of the Solidity scripts writes it from scratch with `chainId`, `participantRegistry`,
`claimRegistry`, `deployBlock`, `registryAdmin` and `accreditationAuthority`, and only when the
transactions are really sent (`--broadcast`). The script's `deployBlock` is only a first guess:
on Arbitrum, `block.number` inside the EVM is the **L1** block, far below the chain's own block
numbers. `record_transactions.py` therefore overwrites `deployBlock` with the block of the first
deployment receipt, which is what `eth_getLogs` needs. Always run it after a deployment.

A Solidity script cannot know its own transaction hashes, so each `forge script` is followed by
`script/record_transactions.py` (Python 3, standard library only). It reads
`broadcast/<Script>.s.sol/<chainId>/run-latest.json`, checks that the broadcast belongs to this
deployment and that every receipt succeeded, and merges:

- `deploymentTransactions`: `{ contract, address, txHash, blockNumber }` per contract creation;
- `lifecycleTransactions`: `{ step, txHash, blockNumber, from, claimId? }` per registry call,
  where `step` is the called function (`registerOrganization`, …, `anchorClaim`, …,
  `resolveDispute`) and `claimId` is set for ClaimRegistry calls.

Entries are deduplicated by `txHash`, so running it twice is harmless and demo replays accumulate.
Wallet top-ups are not lifecycle steps and are skipped.

`DemoLifecycle.s.sol` derives seven **test-only** wallets from `MNEMONIC` (index 0 deployer and
Registry Admin, 1 Accreditation Authority, 2 Organization, 3–4 Internal Verifiers, 5 Auditor,
6 Disputant, a second accredited auditor), tops up each wallet from the deployer when it holds
less than its deposit (organization `anchorDeposit`, auditor `auditorDeposit`, disputant
`disputeBond`, others nothing) plus 0.001 ETH for gas (top-up: deposit + 0.002 ETH),
deploys (or reuses the deployment file with `USE_EXISTING=true`), accredits the cast (skipping
wallets already accredited) and runs: anchor → attestInternal → assignAuditor → requestProof →
submitProof → confirmProof (verifier 2) → attestFinal → openDispute → resolveDispute (dismissed),
sending the exact deposits read from the deployed registry. The claim ends `Verified`, with
`anchorDeposit + auditorDeposit` still locked until it is settled 60 days later, and the bond
credited half to the organization and half to the auditor.

The demo claim is the frontend's demo claim, so the public page shows a genuine match:
claimId `0xfedebf75…a79b28` (`FULL_STORY_CLAIM_ID`), original root `0x51534475…548707` (Merkle root
of `code/frontend/public/demo-evidence/manifest.json`) and supplementary root `0x8e94bc6a…612370`
(root of `manifest-proof-1.json`). If the demo files change, recompute both roots with
`poa_shared.merkle.build_root` and update the constants in `DemoLifecycle.s.sol`.

**Initial state and reset.** After the demo, the chain holds the accredited cast and one `Verified`
claim with two evidence roots and a dismissed dispute in its history. The demo claim can be
anchored only once per chain (`ClaimAlreadyExists` afterwards). To run the story again, either
restart anvil and repeat the commands below (same addresses, `deployBlock` 1), or keep the chain
and set `DEMO_CLAIM_UUID=<any uuid>` (claimId = `keccak256(bytes(uuid))`) with `USE_EXISTING=true`.
On Arbitrum Sepolia, replays need `DEMO_CLAIM_UUID`, or a fresh deployment (`USE_EXISTING` unset),
which rewrites `arbitrum-sepolia.json`.

Local run (anvil's default accounts; this is what P2 was checked with):

```bash
anvil   # in another terminal
REGISTRY_ADMIN=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
ACCREDITATION_AUTHORITY=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
forge script script/Deploy.s.sol:Deploy --rpc-url anvil --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
python3 script/record_transactions.py Deploy.s.sol --chain-id 31337

MNEMONIC="test test test test test test test test test test test junk" USE_EXISTING=true \
forge script script/DemoLifecycle.s.sol:DemoLifecycle --rpc-url anvil --broadcast --slow
python3 script/record_transactions.py DemoLifecycle.s.sol --chain-id 31337

cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 "statusOf(bytes32)(uint8)" \
  0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28 --rpc-url anvil   # 5 = Verified
```

Arbitrum Sepolia (run it yourself; needs a funded **test-only** deployer, about 0.05 ETH: the
top-ups at 1/100 scale are 0.0121 ETH for the organization, 0.003 ETH each for the auditor and the
disputant, and 0.002 ETH each for the authority and the two verifiers):

```bash
cp .env.example .env   # fill ARBITRUM_SEPOLIA_RPC_URL and a fresh test-only MNEMONIC
forge script script/DemoLifecycle.s.sol:DemoLifecycle --rpc-url arbitrum_sepolia --broadcast --slow
python3 script/record_transactions.py DemoLifecycle.s.sol --chain-id 421614
# optional: add --verify to the forge command (needs ARBISCAN_API_KEY)
```

`DemoLifecycle` deploys and writes `arbitrum-sepolia.json` itself; the helper then adds both the
deployment and the lifecycle transactions. To deploy without the demo, use `Deploy.s.sol` with
`REGISTRY_ADMIN`, `ACCREDITATION_AUTHORITY` and a key from the CLI (`--account <keystore>` or
`--private-key`), followed by `record_transactions.py Deploy.s.sol --chain-id 421614`. Commit the
deployment file so the other layers can use it. After changing an interface, also run
`script/export-abi.sh`.
