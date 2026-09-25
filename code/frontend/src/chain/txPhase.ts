// =============================================================================
// Proof of Aid — Team 05 — Transaction lifecycle: check → wallet → recording → done / failed
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hash } from 'viem';
import { describeContractFailure } from '../utils/contractErrors';

/** What the TxButton and TxStatus show (DESIGN.md: idle → Confirm in wallet… → Recording… → Done / Failed). */
export type TxPhase =
  | { kind: 'idle' }
  /** The call is simulated first, so a contract rule that would fail is explained before signing. */
  | { kind: 'checking' }
  | { kind: 'wallet' }
  | { kind: 'confirming'; hash: Hash }
  | { kind: 'confirmed'; hash: Hash }
  | { kind: 'failed'; message: string; hash: Hash | undefined };

export type Preflight = { kind: 'idle' } | { kind: 'checking' } | { kind: 'failed'; message: string };

/** Raw state from the simulation, `useWriteContract` and `useWaitForTransactionReceipt`. */
export type TxSignals = {
  preflight: Preflight;
  writePending: boolean;
  /** `null` when the wallet step did not fail. */
  writeError: Error | null;
  hash: Hash | undefined;
  receiptStatus: 'success' | 'reverted' | undefined;
  receiptError: Error | null;
};

export const REVERTED_MESSAGE = 'The blockchain included the transaction but the contract refused it, so nothing changed.';
export const RECEIPT_ERROR_MESSAGE =
  'The transaction was sent, but its result could not be read. Check it on the block explorer before trying again.';

export function deriveTxPhase(signals: TxSignals): TxPhase {
  let phase: TxPhase = { kind: 'idle' };
  if (signals.preflight.kind === 'failed') {
    phase = { kind: 'failed', message: signals.preflight.message, hash: undefined };
  } else if (signals.preflight.kind === 'checking') {
    phase = { kind: 'checking' };
  } else if (signals.writeError !== null) {
    phase = { kind: 'failed', message: describeContractFailure(signals.writeError), hash: undefined };
  } else if (signals.writePending) {
    phase = { kind: 'wallet' };
  } else if (signals.hash !== undefined && signals.receiptStatus === 'success') {
    phase = { kind: 'confirmed', hash: signals.hash };
  } else if (signals.hash !== undefined && signals.receiptStatus === 'reverted') {
    phase = { kind: 'failed', message: REVERTED_MESSAGE, hash: signals.hash };
  } else if (signals.hash !== undefined && signals.receiptError !== null) {
    phase = { kind: 'failed', message: RECEIPT_ERROR_MESSAGE, hash: signals.hash };
  } else if (signals.hash !== undefined) {
    phase = { kind: 'confirming', hash: signals.hash };
  }
  return phase;
}

/** While true, every button that could send another transaction stays disabled. */
export const isTxBusy = (phase: TxPhase): boolean =>
  phase.kind === 'checking' || phase.kind === 'wallet' || phase.kind === 'confirming';

/** Short label for the button that started the transaction. */
export function busyLabel(phase: TxPhase): string | undefined {
  const labels: Partial<Record<TxPhase['kind'], string>> = {
    checking: 'Checking…',
    wallet: 'Confirm in wallet…',
    confirming: 'Recording on blockchain…',
  };
  const label = labels[phase.kind];
  return label;
}
