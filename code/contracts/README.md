# Contracts

Onchain part of the **Trust, Evidence & Privacy** contribution: accreditation and the claim
verification state machine, deployed to Arbitrum Sepolia.

| Path | Purpose |
| --- | --- |
| `src/interfaces/IParticipantRegistry.sol` | Accreditation: Registry Admin registers organizations and internal verifiers; the Accreditation Authority accredits auditors. **Frozen in P1.** |
| `src/interfaces/IClaimRegistry.sol` | Claim lifecycle: anchoring, checkpoint 1, auditor assignment, proof requests, final attestation, disputes. **Frozen in P1.** |
| `test/` | Foundry tests (Merkle vectors shared with the backend and frontend in `../shared/`). |
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
4. Only active accredited participants can open a dispute; the `Verified` to `Disputed` status permits at most one open dispute.
5. Only the Accreditation Authority can resolve a dispute. Any other call or invalid status transition reverts with the interface's custom errors.

### P2 validation and deployment artifacts

Foundry tests must cover every valid transition, every invalid transition, role-admin isolation, revoked wallets, separation of duties, event payloads, stored roots, and fuzzed transition inputs. The deployment/demo scripts use seven test-only wallets and produce:

```text
.env.example                         # variable names only
script/Deploy.s.sol                  # registry deployment and bootstrap
script/DemoLifecycle.s.sol           # complete lifecycle and dispute flow
../shared/deployments/arbitrum-sepolia.json
```

The deployment JSON records `chainId`, `participantRegistry`, `claimRegistry`, `deployBlock`, and deployment/lifecycle transaction hashes. Run `forge build`, `forge test`, and `script/export-abi.sh` after implementation so backend and frontend consume the resulting artifacts from `code/shared/abi/`.
