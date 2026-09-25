// =============================================================================
// Proof of Aid — Team 05 — "What needs your action": which claims wait for the connected role
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address, Hex } from 'viem';
import { planClaimActions, type ClaimAction } from '../chain/claimActions';
import type { ClaimActionState } from '../chain/reads';
import type { RecordedClaimStatus } from '../utils/claimStatus';
import type { Role } from '../utils/roles';
import type { QueueSpec } from './claimQueue';

// The indexer only narrows the search; each candidate is then re-read from the contract and run
// through planClaimActions, the same rules the role screens use. So an item appears only when the
// contract would accept the action now (for example, the verifier who approved checkpoint 1 never
// sees "Confirm the proof" for that claim).

/** Candidates re-read from the chain at most; enough for a hackathon deployment. */
export const ACTION_CANDIDATE_LIMIT = 30;

export type ActionItem = {
  claimId: Hex;
  status: RecordedClaimStatus;
  /** Plain sentences, one per action this wallet may take now. */
  actions: string[];
};

type Candidates = Pick<QueueSpec, 'statuses' | 'organization'>;

/** The indexer searches for one role's candidates (settlement is searched for every role). */
export function actionCandidates(role: Role, viewer: Address, verifierOrganization: Address | undefined): Candidates[] {
  const byRole: Record<Role, Candidates[]> = {
    internalVerifier: [{ statuses: ['Anchored', 'ProofSubmitted'], organization: verifierOrganization }],
    auditor: [{ statuses: ['InternallyVerified'], organization: undefined }],
    accreditationAuthority: [{ statuses: ['InternallyVerified', 'Disputed'], organization: undefined }],
    organization: [{ statuses: ['ProofRequested'], organization: viewer }],
    registryAdmin: [],
    public: [],
  };
  // Anyone may settle a verified claim whose dispute window closed.
  return [...byRole[role], { statuses: ['Verified'], organization: undefined }];
}

/** The to-do sentence for one planned action; `undefined` for actions that are optional, not waiting. */
function describeAction(action: ClaimAction): string | undefined {
  let text: string | undefined;
  switch (action.kind) {
    case 'attestInternal':
      text = 'Check this claim (checkpoint 1).';
      break;
    case 'confirmProof':
      text = 'Confirm the supplementary proof.';
      break;
    case 'requestProof':
      text = 'Review it as the assigned auditor: approve, reject or ask for more proof.';
      break;
    case 'attestFinal':
      // With a revoked organization only the final verdict is possible (requestProof is missing).
      text = action.canApprove ? undefined : 'Review it as the assigned auditor: the organization was revoked, so it can only be rejected.';
      break;
    case 'assignAuditor':
      // A claim that already has an auditor is waiting for that auditor, not for the Authority.
      text = action.currentAuditor === undefined ? 'Assign an accredited auditor.' : undefined;
      break;
    case 'resolveDispute':
      text = 'Resolve the dispute (uphold or dismiss).';
      break;
    case 'submitProof':
      text = 'Submit the proof the auditor asked for.';
      break;
    case 'settle':
      text = 'Settle the deposits: the dispute window has closed.';
      break;
    case 'openDispute':
      // Disputing is a right during the window, never a task.
      text = undefined;
      break;
  }
  return text;
}

/** One item per claim on which `viewer` has something to do right now, in the given order. */
export function deriveActionItems(role: Role, viewer: Address, claims: readonly ClaimActionState[]): ActionItem[] {
  const items: ActionItem[] = [];
  const seen = new Set<Hex>();
  for (const claim of claims) {
    if (seen.has(claim.claimId)) {
      continue;
    }
    seen.add(claim.claimId);
    const actions = planClaimActions(role, viewer, claim)
      .actions.map(describeAction)
      .filter((text): text is string => text !== undefined);
    if (actions.length > 0) {
      items.push({ claimId: claim.claimId, status: claim.status, actions });
    }
  }
  return items;
}
