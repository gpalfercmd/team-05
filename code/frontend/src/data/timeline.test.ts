// =============================================================================
// Proof of Aid — Team 05 — Tests: events → timeline merging, ordering, summary and sentences
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { zeroAddress, type Address, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../types/claim';
import { statusIndexFromName, type ClaimStatusName } from '../utils/claimStatus';
import { describeAction, sentenceText } from '../utils/timelineText';
import { summarizeVerification } from './summary';
import { buildTimeline, type ClaimEventLog, type DecodedClaimEvent } from './timeline';

const CLAIM_ID = `0x${'ab'.repeat(32)}` as Hex;
const ORGANIZATION: Address = '0x1111111111111111111111111111111111111111';
const VERIFIER: Address = '0x2222222222222222222222222222222222222222';
const AUDITOR: Address = '0x3333333333333333333333333333333333333333';
const NEW_AUDITOR: Address = '0x4444444444444444444444444444444444444444';
const AUTHORITY: Address = '0x5555555555555555555555555555555555555555';
const ROOT = `0x${'cd'.repeat(32)}` as Hex;
const JUSTIFICATION = `0x${'ef'.repeat(32)}` as Hex;

const tx = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

function log(event: DecodedClaimEvent, block: number, logIndex: number, transaction = tx(block)): ClaimEventLog {
  const located: ClaimEventLog = { ...event, blockNumber: BigInt(block), logIndex, transactionHash: transaction, timestamp: block * 100 };
  return located;
}

const changed = (from: ClaimStatusName, to: ClaimStatusName | number): DecodedClaimEvent => ({
  eventName: 'StatusChanged',
  args: { claimId: CLAIM_ID, from: statusIndexFromName(from), to: typeof to === 'number' ? to : statusIndexFromName(to) },
});

const anchored: DecodedClaimEvent = {
  eventName: 'ClaimAnchored',
  args: { claimId: CLAIM_ID, organization: ORGANIZATION, evidenceRoot: ROOT, metadataHash: JUSTIFICATION },
};
const attested: DecodedClaimEvent = {
  eventName: 'InternalAttestation',
  args: { claimId: CLAIM_ID, verifier: VERIFIER, approved: true, justificationHash: JUSTIFICATION },
};
const assigned = (auditor: Address, previousAuditor: Address): DecodedClaimEvent => ({
  eventName: 'AuditorAssigned',
  args: { claimId: CLAIM_ID, auditor, previousAuditor },
});

function timelineOf(logs: readonly ClaimEventLog[]): TimelineEntry[] {
  const timeline = buildTimeline(logs);
  if (!timeline.ok) {
    throw new Error(timeline.error);
  }
  return timeline.value;
}

describe('buildTimeline', () => {
  it('merges StatusChanged with the action event of the same transaction, in either log order', () => {
    const timeline = timelineOf([
      log(anchored, 10, 0),
      log(changed('None', 'Anchored'), 10, 1),
      log(changed('Anchored', 'InternallyVerified'), 11, 4),
      log(attested, 11, 5),
    ]);
    expect(timeline).toEqual([
      {
        txHash: tx(10),
        blockNumber: 10n,
        logIndex: 0,
        timestamp: 1000,
        newStatus: 'Anchored',
        action: { kind: 'anchored', organization: ORGANIZATION, evidenceRoot: ROOT },
      },
      {
        txHash: tx(11),
        blockNumber: 11n,
        logIndex: 5,
        timestamp: 1100,
        newStatus: 'InternallyVerified',
        action: { kind: 'internal-attestation', verifier: VERIFIER, approved: true },
      },
    ]);
  });

  it('gives AuditorAssigned its own entry without a status change', () => {
    const [entry] = timelineOf([log(assigned(AUDITOR, zeroAddress), 12, 0)]);
    expect(entry).toMatchObject({
      newStatus: undefined,
      action: { kind: 'auditor-assigned', auditor: AUDITOR, previousAuditor: undefined },
    });
  });

  it('keeps the previous auditor of a reassignment', () => {
    const [entry] = timelineOf([log(assigned(NEW_AUDITOR, AUDITOR), 12, 0)]);
    expect(entry?.action).toEqual({ kind: 'auditor-assigned', auditor: NEW_AUDITOR, previousAuditor: AUDITOR });
  });

  it('orders entries by block, then log index, whatever order the logs arrive in', () => {
    const timeline = timelineOf([
      log(changed('Anchored', 'InternallyVerified'), 20, 3),
      log(assigned(AUDITOR, zeroAddress), 20, 7, tx(99)),
      log(changed('None', 'Anchored'), 15, 1),
      log(attested, 20, 2),
      log(anchored, 15, 0),
    ]);
    expect(timeline.map((entry) => [entry.action.kind, entry.newStatus])).toEqual([
      ['anchored', 'Anchored'],
      ['internal-attestation', 'InternallyVerified'],
      ['auditor-assigned', undefined],
    ]);
  });

  it('converts the proof bundle number from uint256', () => {
    const [entry] = timelineOf([
      log({ eventName: 'ProofSubmitted', args: { claimId: CLAIM_ID, organization: ORGANIZATION, supplementaryRoot: ROOT, rootIndex: 2n } }, 30, 0),
      log(changed('ProofRequested', 'ProofSubmitted'), 30, 1),
    ]);
    expect(entry).toMatchObject({ newStatus: 'ProofSubmitted', action: { kind: 'proof-submitted', root: ROOT, rootIndex: 2 } });
  });

  it('still shows a status change that has no action event', () => {
    const [entry] = timelineOf([log(changed('Verified', 'Disputed'), 40, 0)]);
    expect(entry).toMatchObject({ newStatus: 'Disputed', action: { kind: 'status-changed' } });
  });

  it('refuses a status index outside the frozen enum (ABI drift) instead of guessing', () => {
    expect(buildTimeline([log(changed('None', 42), 50, 0)])).toMatchObject({ ok: false });
    expect(buildTimeline([log(changed('Anchored', 'None'), 50, 0)])).toMatchObject({ ok: false });
  });
});

describe('summarizeVerification', () => {
  const at = (block: number, event: DecodedClaimEvent, extra: DecodedClaimEvent[] = []) => [
    log(event, block, 0),
    ...extra.map((item, index) => log(item, block, index + 1)),
  ];

  it('is empty for a claim that was only anchored', () => {
    expect(summarizeVerification(timelineOf(at(1, anchored, [changed('None', 'Anchored')])))).toEqual({
      checkpoint1: undefined,
      auditor: undefined,
      finalAttestation: undefined,
      dispute: { state: 'none' },
      proofRequests: 0,
    });
  });

  it('reports checkpoint 1, the latest auditor, the final decision and a resolved dispute', () => {
    const timeline = timelineOf([
      ...at(1, anchored),
      ...at(2, attested),
      ...at(3, assigned(AUDITOR, zeroAddress)),
      ...at(4, assigned(NEW_AUDITOR, AUDITOR)),
      ...at(5, { eventName: 'ProofRequested', args: { claimId: CLAIM_ID, auditor: NEW_AUDITOR, requestHash: JUSTIFICATION } }),
      ...at(6, { eventName: 'FinalAttestation', args: { claimId: CLAIM_ID, auditor: NEW_AUDITOR, approved: true, justificationHash: JUSTIFICATION } }),
      ...at(7, { eventName: 'DisputeOpened', args: { claimId: CLAIM_ID, disputant: AUDITOR, counterEvidenceHash: JUSTIFICATION } }),
      ...at(8, { eventName: 'DisputeResolved', args: { claimId: CLAIM_ID, authority: AUTHORITY, upheld: true, justificationHash: JUSTIFICATION } }),
    ]);
    expect(summarizeVerification(timeline)).toEqual({
      checkpoint1: { by: VERIFIER, at: 200, approved: true },
      auditor: { by: NEW_AUDITOR, at: 400 },
      finalAttestation: { by: NEW_AUDITOR, at: 600, approved: true },
      dispute: {
        state: 'resolved',
        opened: { by: AUDITOR, at: 700 },
        resolved: { by: AUTHORITY, at: 800, upheld: true },
      },
      proofRequests: 1,
    });
  });

  it('reports an open dispute', () => {
    const timeline = timelineOf(
      at(9, { eventName: 'DisputeOpened', args: { claimId: CLAIM_ID, disputant: AUDITOR, counterEvidenceHash: JUSTIFICATION } }),
    );
    expect(summarizeVerification(timeline).dispute).toEqual({ state: 'open', opened: { by: AUDITOR, at: 900 } });
  });
});

describe('timeline sentences', () => {
  it.each([
    [{ kind: 'internal-attestation', verifier: VERIFIER, approved: true }, 'Internal verifier 0x2222…2222 approved the evidence (checkpoint 1).'],
    [{ kind: 'auditor-assigned', auditor: AUDITOR, previousAuditor: undefined }, 'The Accreditation Authority assigned auditor 0x3333…3333.'],
    [{ kind: 'proof-requested', auditor: AUDITOR }, 'Auditor 0x3333…3333 requested more proof.'],
    [
      { kind: 'proof-submitted', organization: ORGANIZATION, root: ROOT, rootIndex: 1 },
      'The organization submitted supplementary proof (bundle #1).',
    ],
    [{ kind: 'proof-reviewed', verifier: VERIFIER, accepted: true }, 'A second internal verifier (0x2222…2222) confirmed the proof.'],
    [{ kind: 'final-attestation', auditor: AUDITOR, approved: true }, 'Auditor 0x3333…3333 gave the final approval.'],
    [{ kind: 'dispute-opened', disputant: AUDITOR }, '0x3333…3333 opened a dispute.'],
    [
      { kind: 'dispute-resolved', authority: AUTHORITY, upheld: false },
      'The Accreditation Authority dismissed the dispute: the claim stays verified.',
    ],
  ] as const)('describes %o', (action, sentence) => {
    expect(sentenceText(describeAction(action))).toBe(sentence);
  });
});
