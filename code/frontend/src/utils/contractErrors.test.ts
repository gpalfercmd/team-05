// =============================================================================
// Proof of Aid — Team 05 — Tests: every contract custom error has a plain-English sentence
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import claimRegistryAbiJson from '@shared/abi/IClaimRegistry.json';
import participantRegistryAbiJson from '@shared/abi/IParticipantRegistry.json';
import { ContractFunctionRevertedError, encodeErrorResult, UserRejectedRequestError } from 'viem';
import { describe, expect, it } from 'vitest';
import { claimRegistryAbi, participantRegistryAbi } from '../config/contracts';
import {
  CONTRACT_ERROR_MESSAGES,
  contractErrorMessage,
  describeContractFailure,
  isContractErrorName,
} from './contractErrors';

const ACCOUNT = '0x9A5055dde27365353c0a11168f9B5CF5d3E175b7';
const FALLBACK = 'The blockchain rejected this action, so nothing was recorded.';

// Read straight from the exported ABIs so a new custom error fails this test until it is worded.
const abiErrorNames = [
  ...new Set(
    [...claimRegistryAbiJson, ...participantRegistryAbiJson]
      .filter((entry) => entry.type === 'error')
      .map((entry) => entry.name),
  ),
];

describe('contract error messages', () => {
  it('finds the custom errors of both ABIs', () => {
    expect(abiErrorNames.length).toBeGreaterThan(0);
    expect(abiErrorNames).toContain('SameVerifierAsCheckpoint1');
    expect(abiErrorNames).toContain('AlreadyAccredited');
  });

  it.each(abiErrorNames)('has a plain-English sentence for %s', (name) => {
    expect(isContractErrorName(name)).toBe(true);
    expect(contractErrorMessage(name)).not.toContain(FALLBACK);
  });

  it('uses the DESIGN.md sentence for SameVerifierAsCheckpoint1', () => {
    expect(contractErrorMessage('SameVerifierAsCheckpoint1')).toBe(
      'A different internal verifier must confirm this proof.',
    );
  });

  it('covers OpenZeppelin AccessControlUnauthorizedAccount', () => {
    expect(contractErrorMessage('AccessControlUnauthorizedAccount')).toBe(
      CONTRACT_ERROR_MESSAGES.AccessControlUnauthorizedAccount,
    );
  });

  it('falls back for unknown errors, keeping the technical name after the human text', () => {
    expect(contractErrorMessage('SomethingNew')).toBe(`${FALLBACK} Technical reason: SomethingNew.`);
    expect(contractErrorMessage('')).toBe(FALLBACK);
    expect(isContractErrorName('toString')).toBe(false);
  });
});

describe('describeContractFailure', () => {
  it('explains a custom error decoded by viem from a reverted call', () => {
    const data = encodeErrorResult({ abi: claimRegistryAbi, errorName: 'SameVerifierAsCheckpoint1', args: [ACCOUNT] });
    const error = new ContractFunctionRevertedError({ abi: claimRegistryAbi, data, functionName: 'confirmProof' });
    expect(describeContractFailure(error)).toBe(CONTRACT_ERROR_MESSAGES.SameVerifierAsCheckpoint1);
  });

  it('decodes the AccessControl revert added to the frozen ABIs', () => {
    const data = encodeErrorResult({
      abi: participantRegistryAbi,
      errorName: 'AccessControlUnauthorizedAccount',
      args: [ACCOUNT, `0x${'0'.repeat(64)}`],
    });
    const error = new ContractFunctionRevertedError({
      abi: participantRegistryAbi,
      data,
      functionName: 'registerOrganization',
    });
    expect(describeContractFailure(error)).toBe(CONTRACT_ERROR_MESSAGES.AccessControlUnauthorizedAccount);
  });

  it('explains the P9 escrow errors decoded from a reverted call', () => {
    const data = encodeErrorResult({ abi: claimRegistryAbi, errorName: 'WrongDepositAmount', args: [10_100n, 0n] });
    const error = new ContractFunctionRevertedError({ abi: claimRegistryAbi, data, functionName: 'anchorClaim' });
    expect(describeContractFailure(error)).toBe(CONTRACT_ERROR_MESSAGES.WrongDepositAmount);
    expect(contractErrorMessage('DisputeWindowClosed')).toBe(
      'The dispute window for this claim has closed, so it can no longer be disputed.',
    );
  });

  it('recognises the user cancelling in the wallet', () => {
    const error = new UserRejectedRequestError(new Error('User rejected the request.'));
    expect(describeContractFailure(error)).toBe('You cancelled the request in your wallet. Nothing was recorded.');
  });

  it('falls back for errors that are not contract reverts', () => {
    expect(describeContractFailure(new Error('network down'))).toBe(FALLBACK);
    expect(describeContractFailure('not an error')).toBe(FALLBACK);
  });
});
