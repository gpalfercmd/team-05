// =============================================================================
// Proof of Aid — Team 05 — Plain-English sentences for the contracts' custom errors
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

// Every custom error in IClaimRegistry and IParticipantRegistry names the rule that was broken
// (P1 decision), so each one gets a sentence a donor or NGO operator can act on. Errors shared by
// both contracts are worded to fit either context. A test checks this map against the ABIs.
export const CONTRACT_ERROR_MESSAGES = {
  // IClaimRegistry
  ZeroValue: 'A required value is empty. Check that every field has been filled in.',
  ClaimAlreadyExists: 'This claim has already been recorded on the blockchain.',
  ClaimNotFound: 'No claim with this ID has been recorded on the blockchain.',
  InvalidStatus: 'This action is not allowed at the claim’s current stage.',
  NotClaimOrganization: 'Only the organization that recorded this claim can do this.',
  InsufficientInternalVerifiers:
    'The organization needs at least two active internal verifiers before it can record a claim.',
  NotOrganizationVerifier: 'Only an active internal verifier of this claim’s organization can do this.',
  SameVerifierAsCheckpoint1: 'A different internal verifier must confirm this proof.',
  NotAssignedAuditor: 'Only the auditor assigned to this claim can do this.',
  NotAccreditationAuthority: 'Only the Accreditation Authority can do this.',
  NotAccredited: 'Only accredited participants (organizations, internal verifiers and auditors) can do this.',
  // Both contracts
  NotActiveOrganization: 'This wallet is not an active, registered organization.',
  NotActiveAuditor: 'This wallet is not an active, accredited auditor.',
  // IParticipantRegistry
  AlreadyAccredited: 'This wallet already has a role. Each wallet can hold only one role.',
  NotActiveInternalVerifier: 'This wallet is not an active internal verifier.',
  ZeroAddress: 'A wallet address is missing.',
  // OpenZeppelin AccessControl, used for the Registry Admin and Accreditation Authority roles
  AccessControlUnauthorizedAccount: 'Your wallet does not have permission for this action.',
} as const satisfies Record<string, string>;

export type ContractErrorName = keyof typeof CONTRACT_ERROR_MESSAGES;

const FALLBACK_MESSAGE = 'The blockchain rejected this action, so nothing was recorded.';
const USER_REJECTED_MESSAGE = 'You cancelled the request in your wallet. Nothing was recorded.';

export const isContractErrorName = (name: string): name is ContractErrorName =>
  Object.hasOwn(CONTRACT_ERROR_MESSAGES, name);

/** Sentence for a decoded error name; unknown names keep the technical value after the human text. */
export function contractErrorMessage(errorName: string): string {
  const message = isContractErrorName(errorName)
    ? CONTRACT_ERROR_MESSAGES[errorName]
    : `${FALLBACK_MESSAGE}${errorName === '' ? '' : ` Technical reason: ${errorName}.`}`;
  return message;
}

/** True when the failure is the user declining the request in their wallet. */
export function isUserRejection(error: unknown): boolean {
  const rejected = error instanceof BaseError && error.walk((cause) => cause instanceof UserRejectedRequestError) !== null;
  return rejected;
}

/** Turns any failure from a viem/wagmi contract call into the sentence shown to the user. */
export function describeContractFailure(error: unknown): string {
  if (isUserRejection(error)) {
    return USER_REJECTED_MESSAGE;
  }
  const reverted =
    error instanceof BaseError ? error.walk((cause) => cause instanceof ContractFunctionRevertedError) : null;
  const errorName = reverted instanceof ContractFunctionRevertedError ? (reverted.data?.errorName ?? '') : '';
  const message = contractErrorMessage(errorName);
  return message;
}
