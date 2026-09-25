// =============================================================================
// Proof of Aid — Team 05 — The form for one planned claim action (verifier, auditor, authority, anyone)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { formatEther, type Hash } from 'viem';
import type { ClaimAction } from '../../chain/claimActions';
import {
  assignAuditorCall,
  attestFinalCall,
  attestInternalCall,
  confirmProofCall,
  openDisputeCall,
  requestProofCall,
  resolveDisputeCall,
  settleCall,
  type RegistryAddresses,
} from '../../chain/calls';
import { addressAt } from '../../chain/inputs';
import type { ClaimActionState, EscrowParams } from '../../chain/reads';
import type { Result } from '../../utils/result';
import { truncateMiddle } from '../../utils/format';
import { ActionForm } from './ActionForm';
import { AddressActionForm } from './AddressActionForm';

export type ClaimActionFormProps = {
  action: ClaimAction;
  claim: ClaimActionState;
  registries: RegistryAddresses;
  /** Payable amounts from the contract; `undefined` while they are read. */
  params: Result<EscrowParams, string> | undefined;
  /** Forms for actions that need the backend (submit proof) are supplied by the caller. */
  renderSubmitProof: (rootIndex: number, onConfirmed: (hash: Hash) => void) => ReactNode;
  /** Reports a confirmed transaction with the form's title. */
  onConfirmed: (title: string, hash: Hash) => void;
};

const eth = (wei: bigint): string => `${formatEther(wei)} ETH`;

/** A payable button's label, or a disabled one while the amount is unknown. */
function payable(params: ClaimActionFormProps['params'], pick: (value: EscrowParams) => bigint, label: (amount: string) => string) {
  const amount = params?.ok === true ? pick(params.value) : undefined;
  const option = amount === undefined ? { label: label('the deposit'), disabled: true } : { label: label(eth(amount)), disabled: false };
  return option;
}

export function ClaimActionForm({ action, claim, registries, params, renderSubmitProof, onConfirmed }: ClaimActionFormProps) {
  const id = claim.claimId;
  const report = (title: string) => (hash: Hash) => onConfirmed(title, hash);
  let form: ReactNode;
  switch (action.kind) {
    case 'submitProof':
      form = renderSubmitProof(action.rootIndex, report('Supplementary proof submitted'));
      break;
    case 'attestInternal':
      form = (
        <ActionForm
          level={5}
          title="Checkpoint 1: internal check"
          onConfirmed={report('Checkpoint 1 recorded')}
          description="Approve if the evidence supports the claim. Rejecting ends the claim and returns the organization’s deposit."
          noteLabel="Justification"
          options={[
            { label: 'Approve evidence', decision: true },
            { label: 'Reject claim', decision: false, variant: 'danger' },
          ]}
          buildCall={(approve, note) => attestInternalCall(registries, id, approve, note)}
        />
      );
      break;
    case 'confirmProof':
      form = (
        <ActionForm
          level={5}
          title="Confirm the supplementary proof"
          onConfirmed={report('Proof review recorded')}
          description="As a second internal verifier, confirm the proof the organization submitted. Sending it back asks the organization for new proof."
          noteLabel="Justification"
          options={[
            { label: 'Accept proof', decision: true },
            { label: 'Send back to the organization', decision: false, variant: 'secondary' },
          ]}
          buildCall={(accept, note) => confirmProofCall(registries, id, accept, note)}
        />
      );
      break;
    case 'requestProof':
      form = (
        <ActionForm
          level={5}
          title="Request more proof"
          onConfirmed={report('Proof requested')}
          description="The organization must submit supplementary evidence, which a second internal verifier then confirms."
          noteLabel="What proof is missing?"
          options={[{ label: 'Request proof', decision: true, variant: 'secondary' }]}
          buildCall={(_, note) => requestProofCall(registries, id, note)}
        />
      );
      break;
    case 'attestFinal': {
      const approve = payable(params, (value) => value.auditorDeposit, (amount) => `Approve and lock ${amount}`);
      form = (
        <ActionForm
          level={5}
          title="Final decision (checkpoint 2)"
          onConfirmed={report('Final decision recorded')}
          description="Approving locks your auditor deposit until the dispute window closes; you lose it if a dispute is upheld. Rejecting costs nothing and returns the organization’s deposit."
          noteLabel="Justification"
          options={[
            ...(action.canApprove ? [{ ...approve, decision: true }] : []),
            { label: 'Reject claim', decision: false, variant: 'danger' as const },
          ]}
          buildCall={(decision, note) =>
            attestFinalCall(registries, id, decision, note, params?.ok === true ? params.value.auditorDeposit : 0n)
          }
        />
      );
      break;
    }
    case 'openDispute': {
      const open = payable(params, (value) => value.disputeBond, (amount) => `Open dispute and lock ${amount}`);
      form = (
        <ActionForm
          level={5}
          title="Dispute this verified claim"
          onConfirmed={report('Dispute opened')}
          description="If the Accreditation Authority upholds the dispute you receive your bond back plus the organization’s and auditor’s deposits; if it is dismissed you lose the bond."
          noteLabel="Counter-evidence"
          options={[{ ...open, decision: true, variant: 'danger' }]}
          buildCall={(_, note) => openDisputeCall(registries, id, note, params?.ok === true ? params.value.disputeBond : 0n)}
        />
      );
      break;
    }
    case 'assignAuditor':
      form = (
        <AddressActionForm
          level={5}
          title={action.currentAuditor === undefined ? 'Assign an auditor' : 'Reassign the auditor'}
          onConfirmed={report('Auditor assigned')}
          description={
            action.currentAuditor === undefined
              ? 'Choose an accredited auditor to review this claim.'
              : `Currently assigned: ${truncateMiddle(action.currentAuditor)}. Reassigning hands the review to another accredited auditor.`
          }
          inputs={[{ label: 'Auditor wallet', hint: 'Must be an active, accredited auditor.' }]}
          submitLabel="Assign auditor"
          buildCall={(addresses) => assignAuditorCall(registries, id, addressAt(addresses, 0))}
        />
      );
      break;
    case 'resolveDispute':
      form = (
        <ActionForm
          level={5}
          title="Resolve the dispute"
          onConfirmed={report('Dispute resolved')}
          description="Upholding rejects the claim and pays the disputant its bond plus the organization’s and auditor’s deposits. Dismissing keeps the claim verified and splits the bond between the organization and the auditor."
          noteLabel="Decision note"
          options={[
            { label: 'Uphold dispute', decision: true, variant: 'danger' },
            ...(action.canDismiss ? [{ label: 'Dismiss dispute', decision: false }] : []),
          ]}
          buildCall={(upheld, note) => resolveDisputeCall(registries, id, upheld, note)}
        />
      );
      break;
    case 'settle':
      form = (
        <ActionForm
          level={5}
          title="Settle the deposits"
          onConfirmed={report('Deposits settled')}
          description="The dispute window has closed. Settling credits the organization its penalty deposit and the auditor its deposit and reward; each then withdraws. Anyone may do this."
          options={[{ label: 'Settle deposits', decision: true }]}
          buildCall={() => settleCall(registries, id)}
        />
      );
      break;
  }
  return form;
}
