// =============================================================================
// Proof of Aid — Team 05 — Verification summary (checkpoints, auditor, dispute) from the timeline
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address } from 'viem';
import type { TimelineEntry } from '../types/claim';

/** Who did something and when (block timestamp, seconds). */
export type SummaryEvent = { by: Address; at: number };

export type DisputeSummary =
  | { state: 'none' }
  | { state: 'open'; opened: SummaryEvent }
  | { state: 'resolved'; opened: SummaryEvent; resolved: SummaryEvent & { upheld: boolean } };

export type VerificationSummary = {
  checkpoint1: (SummaryEvent & { approved: boolean }) | undefined;
  /** The auditor assigned most recently (reassignments replace earlier ones). */
  auditor: SummaryEvent | undefined;
  finalAttestation: (SummaryEvent & { approved: boolean }) | undefined;
  /** The most recent dispute; the contract allows at most one open at a time. */
  dispute: DisputeSummary;
  proofRequests: number;
};

const EMPTY_SUMMARY: VerificationSummary = {
  checkpoint1: undefined,
  auditor: undefined,
  finalAttestation: undefined,
  dispute: { state: 'none' },
  proofRequests: 0,
};

function applyEntry(summary: VerificationSummary, entry: TimelineEntry): VerificationSummary {
  const at = entry.timestamp;
  const { action } = entry;
  let next = summary;
  switch (action.kind) {
    case 'internal-attestation':
      next = { ...summary, checkpoint1: { by: action.verifier, at, approved: action.approved } };
      break;
    case 'auditor-assigned':
      next = { ...summary, auditor: { by: action.auditor, at } };
      break;
    case 'proof-requested':
      next = { ...summary, proofRequests: summary.proofRequests + 1 };
      break;
    case 'final-attestation':
      next = { ...summary, finalAttestation: { by: action.auditor, at, approved: action.approved } };
      break;
    case 'dispute-opened':
      next = { ...summary, dispute: { state: 'open', opened: { by: action.disputant, at } } };
      break;
    case 'dispute-resolved':
      next =
        summary.dispute.state === 'open'
          ? {
              ...summary,
              dispute: {
                state: 'resolved',
                opened: summary.dispute.opened,
                resolved: { by: action.authority, at, upheld: action.upheld },
              },
            }
          : summary;
      break;
    case 'anchored':
    case 'proof-submitted':
    case 'proof-reviewed':
    case 'status-changed':
    case 'deposit-locked':
    case 'credited':
    case 'settled':
      break;
  }
  return next;
}

/** Folds the timeline (oldest first) into the four facts a visitor looks for first. */
export const summarizeVerification = (timeline: readonly TimelineEntry[]): VerificationSummary =>
  timeline.reduce(applyEntry, EMPTY_SUMMARY);
