// =============================================================================
// Proof of Aid — Team 05 — Tests: claim actions offered per role and status mirror the contract rules
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { CLAIM_ID, WALLETS } from '../test/stubRegistryNode';
import type { Role } from '../utils/roles';
import { planClaimActions } from './claimActions';
import type { ClaimActionState } from './reads';

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

const kinds = (role: Role, viewer: `0x${string}`, claim: Partial<ClaimActionState>) =>
  planClaimActions(role, viewer, { ...base, ...claim }).actions.map((action) => action.kind);

const notes = (role: Role, viewer: `0x${string}`, claim: Partial<ClaimActionState>) =>
  planClaimActions(role, viewer, { ...base, ...claim }).notes.join(' ');

const verified = { status: 'Verified', auditor: WALLETS.auditor, internalVerifier: WALLETS.verifier1, disputeWindowClosesAt: 5_000n } as const;

describe('planClaimActions', () => {
  it('always starts with the claim’s stage in plain words', () => {
    expect(notes('public', WALLETS.stranger, {})).toMatch(/^Recorded\. Waiting for an internal verifier/);
    expect(notes('public', WALLETS.stranger, { status: 'Rejected' })).toBe('Rejected. No further actions are possible.');
  });

  describe('internal verifier', () => {
    const mine = { viewerOrganization: WALLETS.organization };

    it('attests checkpoint 1 on its own organization’s anchored claim', () => {
      expect(kinds('internalVerifier', WALLETS.verifier1, mine)).toEqual(['attestInternal']);
    });

    it('cannot check another organization’s claim', () => {
      expect(kinds('internalVerifier', WALLETS.verifier1, { viewerOrganization: WALLETS.stranger })).toEqual([]);
      expect(notes('internalVerifier', WALLETS.verifier1, { viewerOrganization: WALLETS.stranger })).toMatch(/Only internal verifiers of this claim’s organization/);
    });

    it('confirms submitted proof only when it did not approve checkpoint 1', () => {
      const submitted = { ...mine, status: 'ProofSubmitted', internalVerifier: WALLETS.verifier1 } as const;
      expect(kinds('internalVerifier', WALLETS.verifier2, submitted)).toEqual(['confirmProof']);
      expect(kinds('internalVerifier', WALLETS.verifier1, submitted)).toEqual([]);
      expect(notes('internalVerifier', WALLETS.verifier1, submitted)).toMatch(/a different internal verifier must confirm/);
    });
  });

  describe('organization', () => {
    it('submits proof on its own claim when proof was requested, into the next bundle', () => {
      const plan = planClaimActions('organization', WALLETS.organization, { ...base, status: 'ProofRequested', rootCount: 1 });
      expect(plan.actions).toEqual([{ kind: 'submitProof', rootIndex: 1 }]);
    });

    it('cannot answer another organization’s proof request', () => {
      expect(kinds('organization', WALLETS.stranger, { status: 'ProofRequested' })).toEqual([]);
    });

    it('cannot dispute its own claim, but can dispute another one while the window is open', () => {
      expect(kinds('organization', WALLETS.organization, verified)).toEqual([]);
      expect(notes('organization', WALLETS.organization, verified)).toMatch(/cannot dispute their own claim/);
      expect(kinds('organization', WALLETS.stranger, verified)).toEqual(['openDispute']);
    });
  });

  describe('auditor', () => {
    const assigned = { status: 'InternallyVerified', auditor: WALLETS.auditor } as const;

    it('requests proof or attests when assigned', () => {
      const plan = planClaimActions('auditor', WALLETS.auditor, { ...base, ...assigned });
      expect(plan.actions).toEqual([{ kind: 'requestProof' }, { kind: 'attestFinal', canApprove: true }]);
    });

    it('may only reject once the organization was revoked', () => {
      const plan = planClaimActions('auditor', WALLETS.auditor, { ...base, ...assigned, organizationActive: false });
      expect(plan.actions).toEqual([{ kind: 'attestFinal', canApprove: false }]);
      expect(plan.notes.join(' ')).toMatch(/can no longer be approved, only rejected/);
    });

    it('cannot review a claim assigned to someone else', () => {
      expect(kinds('auditor', WALLETS.disputant, assigned)).toEqual([]);
      expect(notes('auditor', WALLETS.disputant, assigned)).toMatch(/Only the auditor assigned to this claim/);
    });

    it('cannot dispute a claim it approved, but another auditor can, only inside the window', () => {
      expect(kinds('auditor', WALLETS.auditor, verified)).toEqual([]);
      expect(kinds('auditor', WALLETS.disputant, verified)).toEqual(['openDispute']);
      expect(kinds('auditor', WALLETS.disputant, { ...verified, now: 5_000n })).toEqual(['settle']);
    });
  });

  describe('Accreditation Authority', () => {
    it.each(['InternallyVerified', 'ProofRequested', 'ProofSubmitted'] as const)('assigns an auditor while %s', (status) => {
      const plan = planClaimActions('accreditationAuthority', WALLETS.authority, { ...base, status, auditor: WALLETS.auditor });
      expect(plan.actions).toEqual([{ kind: 'assignAuditor', currentAuditor: WALLETS.auditor }]);
    });

    it('does not assign an auditor before checkpoint 1', () => {
      expect(kinds('accreditationAuthority', WALLETS.authority, {})).toEqual([]);
    });

    it('resolves a dispute, and may only uphold it once the organization was revoked', () => {
      const disputed = { ...base, status: 'Disputed' } as const;
      expect(planClaimActions('accreditationAuthority', WALLETS.authority, disputed).actions).toEqual([
        { kind: 'resolveDispute', canDismiss: true },
      ]);
      const revoked = planClaimActions('accreditationAuthority', WALLETS.authority, { ...disputed, organizationActive: false });
      expect(revoked.actions).toEqual([{ kind: 'resolveDispute', canDismiss: false }]);
      expect(revoked.notes.join(' ')).toMatch(/can only be upheld/);
    });

    it('is not accredited, so it never disputes', () => {
      expect(kinds('accreditationAuthority', WALLETS.authority, verified)).toEqual([]);
    });
  });

  describe('settle (anyone)', () => {
    it('is offered once the dispute window has closed and the claim is not settled', () => {
      expect(kinds('public', WALLETS.stranger, { ...verified, now: 5_000n })).toEqual(['settle']);
      expect(kinds('registryAdmin', WALLETS.admin, { ...verified, now: 6_000n })).toEqual(['settle']);
    });

    it('is not offered while the window is open or after settling', () => {
      expect(kinds('public', WALLETS.stranger, verified)).toEqual([]);
      expect(notes('public', WALLETS.stranger, verified)).toMatch(/Open to disputes until/);
      expect(kinds('public', WALLETS.stranger, { ...verified, now: 5_000n, settled: true })).toEqual([]);
    });

    it('is not offered on a disputed claim', () => {
      expect(kinds('public', WALLETS.stranger, { ...verified, status: 'Disputed', now: 9_000n })).toEqual([]);
    });
  });
});
