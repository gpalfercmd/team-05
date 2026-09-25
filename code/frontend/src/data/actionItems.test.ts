// =============================================================================
// Proof of Aid — Team 05 — Tests: "What needs your action" items per role, from the contract rules
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { ClaimActionState } from '../chain/reads';
import { CLAIM_ID, WALLETS } from '../test/stubRegistryNode';
import { actionCandidates, deriveActionItems } from './actionItems';

const base: ClaimActionState = {
  claimId: CLAIM_ID,
  status: 'Anchored',
  organization: WALLETS.organization,
  internalVerifier: undefined,
  auditor: undefined,
  rootCount: 1,
  organizationActive: true,
  viewerOrganization: undefined,
  disputeWindowClosesAt: 0n,
  settled: false,
  now: 1_000n,
};

const claim = (overrides: Partial<ClaimActionState>, id: Hex = CLAIM_ID): ClaimActionState => ({ ...base, claimId: id, ...overrides });
const OTHER: Hex = `0x${'cd'.repeat(32)}`;

describe('actionCandidates', () => {
  it('searches each role’s waiting statuses, plus verified claims to settle for everyone', () => {
    expect(actionCandidates('internalVerifier', WALLETS.verifier1, WALLETS.organization)).toEqual([
      { statuses: ['Anchored', 'ProofSubmitted'], organization: WALLETS.organization },
      { statuses: ['Verified'], organization: undefined },
    ]);
    expect(actionCandidates('auditor', WALLETS.auditor, undefined)[0]?.statuses).toEqual(['InternallyVerified']);
    expect(actionCandidates('accreditationAuthority', WALLETS.authority, undefined)[0]?.statuses).toEqual(['InternallyVerified', 'Disputed']);
    expect(actionCandidates('organization', WALLETS.organization, undefined)[0]).toEqual({
      statuses: ['ProofRequested'],
      organization: WALLETS.organization,
    });
    expect(actionCandidates('public', WALLETS.stranger, undefined)).toEqual([{ statuses: ['Verified'], organization: undefined }]);
  });
});

describe('deriveActionItems', () => {
  const mine = { viewerOrganization: WALLETS.organization };

  it('internal verifier: its organization’s anchored claims and proof to confirm', () => {
    const items = deriveActionItems('internalVerifier', WALLETS.verifier2, [
      claim(mine),
      claim({ ...mine, status: 'ProofSubmitted', internalVerifier: WALLETS.verifier1 }, OTHER),
    ]);
    expect(items).toEqual([
      { claimId: CLAIM_ID, status: 'Anchored', actions: ['Check this claim (checkpoint 1).'] },
      { claimId: OTHER, status: 'ProofSubmitted', actions: ['Confirm the supplementary proof.'] },
    ]);
  });

  it('internal verifier: never lists proof it may not confirm because it approved checkpoint 1', () => {
    const items = deriveActionItems('internalVerifier', WALLETS.verifier1, [
      claim({ ...mine, status: 'ProofSubmitted', internalVerifier: WALLETS.verifier1 }),
    ]);
    expect(items).toEqual([]);
  });

  it('internal verifier: skips another organization’s claims', () => {
    expect(deriveActionItems('internalVerifier', WALLETS.verifier1, [claim({ viewerOrganization: WALLETS.stranger })])).toEqual([]);
  });

  it('auditor: only the internally verified claims assigned to it', () => {
    const items = deriveActionItems('auditor', WALLETS.auditor, [
      claim({ status: 'InternallyVerified', auditor: WALLETS.auditor }),
      claim({ status: 'InternallyVerified', auditor: WALLETS.disputant }, OTHER),
    ]);
    expect(items.map((item) => item.claimId)).toEqual([CLAIM_ID]);
    expect(items[0]?.actions[0]).toMatch(/^Review it as the assigned auditor/);
  });

  it('auditor: says a revoked organization’s claim can only be rejected', () => {
    const items = deriveActionItems('auditor', WALLETS.auditor, [
      claim({ status: 'InternallyVerified', auditor: WALLETS.auditor, organizationActive: false }),
    ]);
    expect(items[0]?.actions).toEqual(['Review it as the assigned auditor: the organization was revoked, so it can only be rejected.']);
  });

  it('Authority: claims without an auditor and disputes, not claims already assigned', () => {
    const DISPUTED: Hex = `0x${'ef'.repeat(32)}`;
    const items = deriveActionItems('accreditationAuthority', WALLETS.authority, [
      claim({ status: 'InternallyVerified' }),
      claim({ status: 'InternallyVerified', auditor: WALLETS.auditor }, OTHER),
      claim({ status: 'Disputed', auditor: WALLETS.auditor }, DISPUTED),
    ]);
    expect(items).toEqual([
      { claimId: CLAIM_ID, status: 'InternallyVerified', actions: ['Assign an accredited auditor.'] },
      { claimId: DISPUTED, status: 'Disputed', actions: ['Resolve the dispute (uphold or dismiss).'] },
    ]);
  });

  it('organization: its own claims with a proof request', () => {
    const items = deriveActionItems('organization', WALLETS.organization, [
      claim({ status: 'ProofRequested' }),
      claim({ status: 'ProofRequested', organization: WALLETS.stranger }, OTHER),
    ]);
    expect(items).toEqual([{ claimId: CLAIM_ID, status: 'ProofRequested', actions: ['Submit the proof the auditor asked for.'] }]);
  });

  it('anyone: verified claims whose dispute window closed and that are not settled yet', () => {
    const closed = { status: 'Verified', auditor: WALLETS.auditor, disputeWindowClosesAt: 500n } as const;
    const items = deriveActionItems('public', WALLETS.stranger, [
      claim(closed),
      claim({ ...closed, settled: true }, OTHER),
      claim({ ...closed, disputeWindowClosesAt: 5_000n }, `0x${'12'.repeat(32)}`),
    ]);
    expect(items).toEqual([{ claimId: CLAIM_ID, status: 'Verified', actions: ['Settle the deposits: the dispute window has closed.'] }]);
  });

  it('does not treat the right to dispute as a task, and lists a claim once', () => {
    const open = claim({ status: 'Verified', auditor: WALLETS.auditor, disputeWindowClosesAt: 5_000n });
    expect(deriveActionItems('auditor', WALLETS.disputant, [open])).toEqual([]);
    expect(deriveActionItems('public', WALLETS.stranger, [claim({ status: 'Verified', disputeWindowClosesAt: 500n }), claim({ status: 'Verified', disputeWindowClosesAt: 500n })])).toHaveLength(1);
  });
});
