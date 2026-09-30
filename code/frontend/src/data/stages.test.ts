// =============================================================================
// Proof of Aid — Team 05 — Claim stage tests: the five-step path derived from existing claim data only
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { claimStages, stageProgress } from './stages';
import type { VerificationSummary } from './summary';

const none: VerificationSummary = {
  checkpoint1: undefined,
  auditor: undefined,
  finalAttestation: undefined,
  dispute: { state: 'none' },
  proofRequests: 0,
};
const by = '0x0000000000000000000000000000000000000001' as const;
const event = { by, at: 1 };
const states = (list: ReturnType<typeof claimStages>) => list.map((stage) => stage.state);

describe('claimStages', () => {
  it('names the five steps in order', () => {
    expect(claimStages('Anchored', none, undefined).map((s) => s.id)).toEqual([
      'anchored',
      'internal',
      'auditor',
      'verified',
      'window',
    ]);
  });

  it('an anchored claim is done at step one and waiting at the internal review', () => {
    expect(states(claimStages('Anchored', none, undefined))).toEqual(['done', 'current', 'pending', 'pending', 'pending']);
  });

  it('an internally verified claim waits for the auditor', () => {
    const summary = { ...none, checkpoint1: { ...event, approved: true } };
    expect(states(claimStages('InternallyVerified', summary, undefined))).toEqual(['done', 'done', 'current', 'pending', 'pending']);
  });

  it('a verified claim with an open window is on the last step', () => {
    const summary = { ...none, checkpoint1: { ...event, approved: true }, auditor: event, finalAttestation: { ...event, approved: true } };
    const escrow = { lockedWei: 1n, disputeWindowClosesAt: 10, settled: false };
    expect(states(claimStages('Verified', summary, escrow))).toEqual(['done', 'done', 'done', 'done', 'current']);
  });

  it('a settled escrow completes every step', () => {
    const summary = { ...none, checkpoint1: { ...event, approved: true }, auditor: event, finalAttestation: { ...event, approved: true } };
    const escrow = { lockedWei: 0n, disputeWindowClosesAt: 10, settled: true };
    expect(states(claimStages('Verified', summary, escrow)).every((state) => state === 'done')).toBe(true);
  });

  it('a claim rejected at the internal check stops there and skips the rest', () => {
    const summary = { ...none, checkpoint1: { ...event, approved: false } };
    expect(states(claimStages('Rejected', summary, undefined))).toEqual(['done', 'stopped', 'skipped', 'skipped', 'skipped']);
  });

  it('a claim rejected by the auditor stops at the final decision', () => {
    const summary = { ...none, checkpoint1: { ...event, approved: true }, auditor: event, finalAttestation: { ...event, approved: false } };
    expect(states(claimStages('Rejected', summary, undefined))).toEqual(['done', 'done', 'done', 'stopped', 'skipped']);
  });

  it('a dispute flags the last step', () => {
    const summary = {
      ...none,
      checkpoint1: { ...event, approved: true },
      auditor: event,
      finalAttestation: { ...event, approved: true },
      dispute: { state: 'open' as const, opened: event },
    };
    expect(states(claimStages('Disputed', summary, undefined))).toEqual(['done', 'done', 'done', 'done', 'current']);
  });
});

describe('stageProgress', () => {
  it('counts the steps reached from the status alone, for cards that hold no history', () => {
    expect(stageProgress('Anchored')).toBe(1);
    expect(stageProgress('InternallyVerified')).toBe(2);
    expect(stageProgress('ProofRequested')).toBe(2);
    expect(stageProgress('Verified')).toBe(4);
    expect(stageProgress('Rejected')).toBe(1);
  });
});
