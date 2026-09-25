// =============================================================================
// Proof of Aid — Team 05 — Which claim actions a wallet may take now: the contract's rules, mirrored
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address } from 'viem';
import { formatTimestamp } from '../utils/format';
import type { Role } from '../utils/roles';
import type { ClaimActionState } from './reads';

// Each rule below mirrors a check in ClaimRegistry.sol, so the screens only offer actions the
// contract would accept. The contract stays the authority: every action is simulated before it
// is signed, and a rule that changed in between is reported with the contract's own error.

export type ClaimAction =
  | { kind: 'submitProof'; rootIndex: number }
  | { kind: 'attestInternal' }
  | { kind: 'confirmProof' }
  | { kind: 'requestProof' }
  /** `canApprove` is false once the organization was revoked: the auditor may then only reject. */
  | { kind: 'attestFinal'; canApprove: boolean }
  | { kind: 'openDispute' }
  | { kind: 'assignAuditor'; currentAuditor: Address | undefined }
  /** `canDismiss` is false once the organization was revoked: the dispute can then only be upheld. */
  | { kind: 'resolveDispute'; canDismiss: boolean }
  | { kind: 'settle' };

export type ClaimActionKind = ClaimAction['kind'];

export type ClaimActionPlan = {
  actions: ClaimAction[];
  /** Plain sentences: the claim's stage first, then why an expected action is not offered. */
  notes: string[];
};

const ACCREDITED_ROLES: readonly Role[] = ['organization', 'internalVerifier', 'auditor'];
const ASSIGNABLE: readonly ClaimActionState['status'][] = ['InternallyVerified', 'ProofRequested', 'ProofSubmitted'];

const date = (seconds: bigint): string => formatTimestamp(Number(seconds));

/** `openDispute` and `settle` both depend on the window that opens with the auditor's approval. */
function disputeWindow(claim: ClaimActionState): 'none' | 'open' | 'closed' {
  let window: 'none' | 'open' | 'closed' = 'none';
  if (claim.status === 'Verified' && claim.disputeWindowClosesAt !== 0n) {
    window = claim.now < claim.disputeWindowClosesAt ? 'open' : 'closed';
  }
  return window;
}

function stageNote(claim: ClaimActionState): string {
  const window = disputeWindow(claim);
  const notes: Record<ClaimActionState['status'], string> = {
    Anchored: 'Recorded. Waiting for an internal verifier of the organization (checkpoint 1).',
    InternallyVerified:
      claim.auditor === undefined
        ? 'Internally verified. Waiting for the Accreditation Authority to assign an auditor.'
        : 'Internally verified. Waiting for the assigned auditor’s review.',
    ProofRequested: 'The auditor asked for more proof. Waiting for the organization to submit it.',
    ProofSubmitted: 'Supplementary proof submitted. Waiting for a second internal verifier to confirm it.',
    Verified:
      window === 'open'
        ? `Verified. Open to disputes until ${date(claim.disputeWindowClosesAt)}.`
        : claim.settled
          ? 'Verified and settled: the deposits were paid out.'
          : 'Verified. The dispute window has closed, so the deposits can be settled.',
    Rejected: 'Rejected. No further actions are possible.',
    Disputed: 'Disputed. Waiting for the Accreditation Authority to resolve it.',
  };
  return notes[claim.status];
}

function organizationActions(viewer: Address, claim: ClaimActionState, plan: ClaimActionPlan): void {
  if (claim.status !== 'ProofRequested') {
    return;
  }
  if (viewer === claim.organization) {
    plan.actions.push({ kind: 'submitProof', rootIndex: claim.rootCount });
  } else {
    plan.notes.push('Only the organization that recorded this claim can submit proof.');
  }
}

function verifierActions(viewer: Address, claim: ClaimActionState, plan: ClaimActionPlan): void {
  if (claim.status !== 'Anchored' && claim.status !== 'ProofSubmitted') {
    return;
  }
  if (claim.viewerOrganization !== claim.organization) {
    plan.notes.push('Only internal verifiers of this claim’s organization can check it.');
  } else if (claim.status === 'Anchored') {
    plan.actions.push({ kind: 'attestInternal' });
  } else if (viewer === claim.internalVerifier) {
    plan.notes.push('You approved checkpoint 1, so a different internal verifier must confirm this proof.');
  } else {
    plan.actions.push({ kind: 'confirmProof' });
  }
}

function auditorActions(viewer: Address, claim: ClaimActionState, plan: ClaimActionPlan): void {
  if (claim.status !== 'InternallyVerified') {
    return;
  }
  if (viewer !== claim.auditor) {
    plan.notes.push('Only the auditor assigned to this claim can review it.');
  } else if (claim.organizationActive) {
    plan.actions.push({ kind: 'requestProof' }, { kind: 'attestFinal', canApprove: true });
  } else {
    plan.notes.push('The organization’s registration was revoked, so this claim can no longer be approved, only rejected.');
    plan.actions.push({ kind: 'attestFinal', canApprove: false });
  }
}

function authorityActions(claim: ClaimActionState, plan: ClaimActionPlan): void {
  if (ASSIGNABLE.includes(claim.status)) {
    plan.actions.push({ kind: 'assignAuditor', currentAuditor: claim.auditor });
  }
  if (claim.status === 'Disputed') {
    plan.actions.push({ kind: 'resolveDispute', canDismiss: claim.organizationActive });
    if (!claim.organizationActive) {
      plan.notes.push('The organization’s registration was revoked, so the dispute can only be upheld.');
    }
  }
}

function disputeActions(role: Role, viewer: Address, claim: ClaimActionState, plan: ClaimActionPlan): void {
  if (!ACCREDITED_ROLES.includes(role) || disputeWindow(claim) !== 'open') {
    return;
  }
  if (viewer === claim.organization || viewer === claim.auditor) {
    plan.notes.push('The organization and the approving auditor cannot dispute their own claim.');
  } else {
    plan.actions.push({ kind: 'openDispute' });
  }
}

function settleActions(claim: ClaimActionState, plan: ClaimActionPlan): void {
  if (disputeWindow(claim) === 'closed' && !claim.settled) {
    plan.actions.push({ kind: 'settle' });
  }
}

/** The actions `viewer` (with `role`) may take on `claim` right now, and why others are missing. */
export function planClaimActions(role: Role, viewer: Address, claim: ClaimActionState): ClaimActionPlan {
  const plan: ClaimActionPlan = { actions: [], notes: [stageNote(claim)] };
  if (role === 'organization') {
    organizationActions(viewer, claim, plan);
  } else if (role === 'internalVerifier') {
    verifierActions(viewer, claim, plan);
  } else if (role === 'auditor') {
    auditorActions(viewer, claim, plan);
  } else if (role === 'accreditationAuthority') {
    authorityActions(claim, plan);
  }
  disputeActions(role, viewer, claim, plan);
  settleActions(claim, plan);
  return plan;
}
