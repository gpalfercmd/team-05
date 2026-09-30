// =============================================================================
// Proof of Aid — Team 05 — The claim's five-step path (anchored to dispute window), from existing claim data only
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { EscrowState } from '../types/claim';
import type { RecordedClaimStatus } from '../utils/claimStatus';
import type { VerificationSummary } from './summary';

export type StageId = 'anchored' | 'internal' | 'auditor' | 'verified' | 'window';

/** done: happened; current: waiting here; pending: not reached; stopped: the claim ended here; skipped: never reached. */
export type StageState = 'done' | 'current' | 'pending' | 'stopped' | 'skipped';

export type Stage = { id: StageId; label: string; state: StageState };

const PAST_INTERNAL: readonly RecordedClaimStatus[] = ['InternallyVerified', 'ProofRequested', 'ProofSubmitted', 'Verified', 'Disputed'];
const PAST_VERIFIED: readonly RecordedClaimStatus[] = ['Verified', 'Disputed'];

/** How many of the first four steps a status has reached: enough for a card that holds no history. */
export function stageProgress(status: RecordedClaimStatus): number {
  let progress = 1;
  if (PAST_VERIFIED.includes(status)) {
    progress = 4;
  } else if (PAST_INTERNAL.includes(status)) {
    progress = 2;
  }
  return progress;
}

/**
 * The path a claim follows: recorded, internal review, auditor, final decision (Verified), then the dispute
 * window until it settles. Everything comes from the status, the verification summary and the escrow the page
 * already reads; nothing is guessed. A rejection stops the path where it happened and skips the rest.
 */
export function claimStages(status: RecordedClaimStatus, summary: VerificationSummary, escrow: EscrowState | undefined): Stage[] {
  const internalRejected = summary.checkpoint1?.approved === false;
  const internalDone = summary.checkpoint1?.approved === true || PAST_INTERNAL.includes(status);
  const auditorDone = summary.auditor !== undefined || summary.finalAttestation !== undefined || PAST_VERIFIED.includes(status);
  const finalRejected =
    !internalRejected && (summary.finalAttestation?.approved === false || (status === 'Rejected' && internalDone && summary.dispute.state !== 'resolved'));
  const verifiedDone = !finalRejected && (summary.finalAttestation?.approved === true || PAST_VERIFIED.includes(status) || (status === 'Rejected' && summary.dispute.state === 'resolved'));
  const upheld = summary.dispute.state === 'resolved' && summary.dispute.resolved.upheld;

  const states: StageState[] = ['done', 'pending', 'pending', 'pending', 'pending'];
  if (internalRejected) {
    states.fill('skipped', 2);
    states[1] = 'stopped';
    states[4] = 'skipped';
  } else {
    states[1] = internalDone ? 'done' : 'current';
    states[2] = auditorDone ? 'done' : internalDone ? 'current' : 'pending';
    if (finalRejected) {
      states[3] = 'stopped';
      states[4] = 'skipped';
    } else {
      states[3] = verifiedDone ? 'done' : auditorDone ? 'current' : 'pending';
      if (verifiedDone) {
        states[4] = escrow?.settled === true ? 'done' : upheld ? 'stopped' : 'current';
      }
    }
  }
  const settled = escrow?.settled === true;
  const ids: StageId[] = ['anchored', 'internal', 'auditor', 'verified', 'window'];
  const labels = ['Anchored', 'Internal review', 'Auditor', 'Verified', settled ? 'Settled' : 'Dispute window'];
  return ids.map((id, index) => ({ id, label: labels[index] ?? id, state: states[index] ?? 'pending' }));
}
