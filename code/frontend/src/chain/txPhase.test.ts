// =============================================================================
// Proof of Aid — Team 05 — Tests: transaction lifecycle derived from simulation, wallet and receipt
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hash } from 'viem';
import { describe, expect, it } from 'vitest';
import { busyLabel, deriveTxPhase, isTxBusy, RECEIPT_ERROR_MESSAGE, REVERTED_MESSAGE, type TxSignals } from './txPhase';

const HASH: Hash = `0x${'12'.repeat(32)}`;
const idle: TxSignals = {
  preflight: { kind: 'idle' },
  writePending: false,
  writeError: null,
  hash: undefined,
  receiptStatus: undefined,
  receiptError: null,
};

describe('deriveTxPhase', () => {
  it('walks idle → checking → wallet → confirming → confirmed', () => {
    expect(deriveTxPhase(idle)).toEqual({ kind: 'idle' });
    expect(deriveTxPhase({ ...idle, preflight: { kind: 'checking' } })).toEqual({ kind: 'checking' });
    expect(deriveTxPhase({ ...idle, writePending: true })).toEqual({ kind: 'wallet' });
    expect(deriveTxPhase({ ...idle, hash: HASH })).toEqual({ kind: 'confirming', hash: HASH });
    expect(deriveTxPhase({ ...idle, hash: HASH, receiptStatus: 'success' })).toEqual({ kind: 'confirmed', hash: HASH });
  });

  it('reports a failed simulation with its plain-English message', () => {
    expect(deriveTxPhase({ ...idle, preflight: { kind: 'failed', message: 'Nope.' } })).toEqual({
      kind: 'failed',
      message: 'Nope.',
      hash: undefined,
    });
  });

  it('explains a request the user cancelled in the wallet', () => {
    const error = new BaseError('rejected', { cause: new UserRejectedRequestError(new Error('User rejected')) });
    const phase = deriveTxPhase({ ...idle, writeError: error });
    expect(phase).toMatchObject({ kind: 'failed', message: 'You cancelled the request in your wallet. Nothing was recorded.' });
  });

  it('decodes a revert reported by the wallet', () => {
    const reverted = new ContractFunctionRevertedError({ abi: [], functionName: 'settle' });
    Object.assign(reverted, { data: { errorName: 'AlreadySettled', args: [] } });
    const phase = deriveTxPhase({ ...idle, writeError: new BaseError('failed', { cause: reverted }) });
    expect(phase).toMatchObject({ kind: 'failed', message: 'This claim’s deposits have already been paid out.' });
  });

  it('fails a mined but reverted transaction and keeps its hash for the explorer link', () => {
    expect(deriveTxPhase({ ...idle, hash: HASH, receiptStatus: 'reverted' })).toEqual({
      kind: 'failed',
      message: REVERTED_MESSAGE,
      hash: HASH,
    });
    expect(deriveTxPhase({ ...idle, hash: HASH, receiptError: new Error('timeout') })).toEqual({
      kind: 'failed',
      message: RECEIPT_ERROR_MESSAGE,
      hash: HASH,
    });
  });

  it('marks only in-flight phases as busy and labels them for the button', () => {
    expect(isTxBusy({ kind: 'checking' })).toBe(true);
    expect(isTxBusy({ kind: 'wallet' })).toBe(true);
    expect(isTxBusy({ kind: 'confirming', hash: HASH })).toBe(true);
    expect(isTxBusy({ kind: 'confirmed', hash: HASH })).toBe(false);
    expect(isTxBusy({ kind: 'idle' })).toBe(false);
    expect(busyLabel({ kind: 'wallet' })).toBe('Confirm in wallet…');
    expect(busyLabel({ kind: 'confirming', hash: HASH })).toBe('Recording on blockchain…');
    expect(busyLabel({ kind: 'idle' })).toBeUndefined();
  });
});
