// =============================================================================
// Proof of Aid — Team 05 — Tests: call builders target the right registry, args and payment
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { encodeFunctionData, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { REGISTRIES, WALLETS } from '../test/stubRegistryNode';
import {
  accreditAuditorCall,
  anchorClaimCall,
  assignAuditorCall,
  attestFinalCall,
  attestInternalCall,
  confirmProofCall,
  openDisputeCall,
  registerInternalVerifierCall,
  registerOrganizationCall,
  requestProofCall,
  resolveDisputeCall,
  revokeAuditorCall,
  revokeInternalVerifierCall,
  revokeOrganizationCall,
  settleCall,
  submitProofCall,
  withdrawCall,
  type ContractCall,
} from './calls';

const ID: Hex = `0x${'01'.repeat(32)}`;
const ROOT: Hex = `0x${'02'.repeat(32)}`;
const NOTE: Hex = `0x${'03'.repeat(32)}`;

// Encoding proves the function exists in the frozen ABI with these argument types.
const encodes = (call: ContractCall) => encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args });

describe('call builders', () => {
  it('pays the anchor deposit read from the contract when anchoring', () => {
    const call = anchorClaimCall(REGISTRIES, { claimId: ID, evidenceRoot: ROOT, metadataHash: NOTE }, 123n);
    expect(call).toMatchObject({ address: REGISTRIES.claimRegistry, functionName: 'anchorClaim', args: [ID, ROOT, NOTE], value: 123n });
    expect(encodes(call)).toMatch(/^0x/);
  });

  it('pays the auditor deposit only when approving, and nothing when rejecting', () => {
    expect(attestFinalCall(REGISTRIES, ID, true, NOTE, 7n).value).toBe(7n);
    expect(attestFinalCall(REGISTRIES, ID, false, NOTE, 7n).value).toBe(0n);
  });

  it('pays the dispute bond when opening a dispute', () => {
    expect(openDisputeCall(REGISTRIES, ID, NOTE, 9n)).toMatchObject({ functionName: 'openDispute', value: 9n });
  });

  it('sends no value with any other action', () => {
    const calls = [
      submitProofCall(REGISTRIES, ID, ROOT),
      attestInternalCall(REGISTRIES, ID, true, NOTE),
      confirmProofCall(REGISTRIES, ID, false, NOTE),
      requestProofCall(REGISTRIES, ID, NOTE),
      assignAuditorCall(REGISTRIES, ID, WALLETS.auditor),
      resolveDisputeCall(REGISTRIES, ID, false, NOTE),
      settleCall(REGISTRIES, ID),
      withdrawCall(REGISTRIES),
    ];
    for (const call of calls) {
      expect(call.address).toBe(REGISTRIES.claimRegistry);
      expect(call.value).toBeUndefined();
      expect(encodes(call)).toMatch(/^0x/);
    }
  });

  it('sends participant management to the ParticipantRegistry', () => {
    const calls = [
      registerOrganizationCall(REGISTRIES, WALLETS.organization),
      revokeOrganizationCall(REGISTRIES, WALLETS.organization),
      registerInternalVerifierCall(REGISTRIES, WALLETS.verifier1, WALLETS.organization),
      revokeInternalVerifierCall(REGISTRIES, WALLETS.verifier1),
      accreditAuditorCall(REGISTRIES, WALLETS.auditor),
      revokeAuditorCall(REGISTRIES, WALLETS.auditor),
    ];
    for (const call of calls) {
      expect(call.address).toBe(REGISTRIES.participantRegistry);
      expect(encodes(call)).toMatch(/^0x/);
    }
    expect(registerInternalVerifierCall(REGISTRIES, WALLETS.verifier1, WALLETS.organization).args).toEqual([
      WALLETS.verifier1,
      WALLETS.organization,
    ]);
  });
});
