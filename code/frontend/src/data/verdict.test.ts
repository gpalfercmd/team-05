// =============================================================================
// Proof of Aid — Team 05 — Tests: the one-line verdict and the page title of a claim
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address, Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { ClaimView, TimelineAction, TimelineEntry } from '../types/claim';
import { claimHeadline, verdictLine } from './verdict';

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const CLAIM_ID = `0xfedebf75${'0'.repeat(48)}a79b28` as Hex;

const entry = (action: TimelineAction, index: number): TimelineEntry => ({
  txHash: `0x${index.toString(16).padStart(64, '0')}` as Hex,
  blockNumber: BigInt(index),
  logIndex: 0,
  timestamp: 1_789_000_000 + index,
  newStatus: undefined,
  action,
});

function claim(status: ClaimView['status'], actions: TimelineAction[], metadata: ClaimView['metadata']): ClaimView {
  return {
    claimId: CLAIM_ID,
    status,
    timeline: actions.map(entry),
    metadata,
  } as unknown as ClaimView;
}

const NOT_PUBLISHED = { state: 'not-published' } as ClaimView['metadata'];
const verified = (title: string) =>
  ({ state: 'verified', metadata: { title, description: 'd', locationRegion: 'r', claimDate: '2026-09-12' } }) as ClaimView['metadata'];

describe('verdictLine', () => {
  it('joins the status, who checked the claim and how disputes ended', () => {
    const line = verdictLine(
      claim(
        'Verified',
        [
          { kind: 'internal-attestation', verifier: addr(1), approved: true },
          { kind: 'proof-reviewed', verifier: addr(2), accepted: true },
          { kind: 'final-attestation', auditor: addr(3), approved: true },
          { kind: 'dispute-opened', disputant: addr(4) },
          { kind: 'dispute-resolved', authority: addr(5), upheld: false },
        ],
        NOT_PUBLISHED,
      ),
    );
    expect(line).toBe('Verified · checked by 2 internal reviewers and 1 independent auditor · 1 dispute, dismissed');
  });

  it('counts each reviewer once and uses the singular', () => {
    const line = verdictLine(
      claim(
        'Verified',
        [
          { kind: 'internal-attestation', verifier: addr(1), approved: true },
          { kind: 'proof-reviewed', verifier: addr(1), accepted: true },
          { kind: 'final-attestation', auditor: addr(3), approved: true },
        ],
        NOT_PUBLISHED,
      ),
    );
    expect(line).toBe('Verified · checked by 1 internal reviewer and 1 independent auditor');
  });

  it('omits what is unknown or has not happened', () => {
    expect(verdictLine(claim('Anchored', [], NOT_PUBLISHED))).toBe('Anchored');
    expect(
      verdictLine(claim('InternallyVerified', [{ kind: 'internal-attestation', verifier: addr(1), approved: true }], NOT_PUBLISHED)),
    ).toBe('Internally verified · checked by 1 internal reviewer');
  });

  it('says when a dispute is still open, or was upheld', () => {
    const opened: TimelineAction = { kind: 'dispute-opened', disputant: addr(4) };
    expect(verdictLine(claim('Disputed', [opened], NOT_PUBLISHED))).toBe('Disputed · 1 dispute, open');
    expect(
      verdictLine(claim('Rejected', [opened, { kind: 'dispute-resolved', authority: addr(5), upheld: true }], NOT_PUBLISHED)),
    ).toBe('Rejected · 1 dispute, upheld');
  });
});

describe('claimHeadline', () => {
  it('uses the claim title only when the metadata matched the chain', () => {
    expect(claimHeadline(claim('Verified', [], verified('500 food kits')))).toBe('500 food kits');
  });

  it('falls back to the shortened claim ID otherwise', () => {
    expect(claimHeadline(claim('Verified', [], NOT_PUBLISHED))).toBe('Claim 0xfede…9b28');
    expect(claimHeadline(claim('Verified', [], { state: 'mismatch', computedHash: undefined, detail: 'x' } as ClaimView['metadata']))).toBe(
      'Claim 0xfede…9b28',
    );
  });
});
