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
