// =============================================================================
// Proof of Aid — Team 05 — Call builders: one typed contract call per role action (UI and anvil test)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Abi, Address, Hex } from 'viem';
import { claimRegistryAbi, participantRegistryAbi } from '../config/contracts';

/**
 * Everything a wallet needs to send one contract call. The ABIs are the frozen JSON interfaces
 * (plus the AccessControl error), so a simulated revert decodes to the contract's error name.
 * The role screens and the anvil end-to-end test build their calls here, so what the test proves
 * is exactly what the screens send.
 */
export type ContractCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  /** Wei sent with the call; only payable actions set it, always from a contract parameter getter. */
  value?: bigint;
};

/** Where each registry lives on the configured chain. */
export type RegistryAddresses = { claimRegistry: Address; participantRegistry: Address };

const claimCall = (registry: RegistryAddresses, functionName: string, args: readonly unknown[]): ContractCall => ({
  address: registry.claimRegistry,
  abi: claimRegistryAbi,
  functionName,
  args,
});

const participantCall = (registry: RegistryAddresses, functionName: string, args: readonly unknown[]): ContractCall => ({
  address: registry.participantRegistry,
  abi: participantRegistryAbi,
  functionName,
  args,
});

// --- Organization -------------------------------------------------------------------------------

export type AnchorInput = { claimId: Hex; evidenceRoot: Hex; metadataHash: Hex };

/** `anchorClaim` locks `anchorDeposit()` (organization penalty + auditor reward). */
export const anchorClaimCall = (registry: RegistryAddresses, input: AnchorInput, anchorDeposit: bigint): ContractCall => ({
  ...claimCall(registry, 'anchorClaim', [input.claimId, input.evidenceRoot, input.metadataHash]),
  value: anchorDeposit,
});

export const submitProofCall = (registry: RegistryAddresses, claimId: Hex, supplementaryRoot: Hex): ContractCall =>
  claimCall(registry, 'submitProof', [claimId, supplementaryRoot]);

// --- Internal verifier --------------------------------------------------------------------------

export const attestInternalCall = (registry: RegistryAddresses, claimId: Hex, approve: boolean, justification: Hex): ContractCall =>
  claimCall(registry, 'attestInternal', [claimId, approve, justification]);

export const confirmProofCall = (registry: RegistryAddresses, claimId: Hex, accept: boolean, justification: Hex): ContractCall =>
  claimCall(registry, 'confirmProof', [claimId, accept, justification]);

// --- Auditor ------------------------------------------------------------------------------------

export const requestProofCall = (registry: RegistryAddresses, claimId: Hex, requestHash: Hex): ContractCall =>
  claimCall(registry, 'requestProof', [claimId, requestHash]);

/** Approving locks `auditorDeposit()`; rejecting sends nothing (the contract requires exactly 0). */
export const attestFinalCall = (
  registry: RegistryAddresses,
  claimId: Hex,
  approve: boolean,
  justification: Hex,
  auditorDeposit: bigint,
): ContractCall => ({
  ...claimCall(registry, 'attestFinal', [claimId, approve, justification]),
  value: approve ? auditorDeposit : 0n,
});

/** Any accredited participant but the claim's organization and approving auditor; locks `disputeBond()`. */
export const openDisputeCall = (registry: RegistryAddresses, claimId: Hex, counterEvidence: Hex, disputeBond: bigint): ContractCall => ({
  ...claimCall(registry, 'openDispute', [claimId, counterEvidence]),
  value: disputeBond,
});

// --- Accreditation Authority --------------------------------------------------------------------

export const assignAuditorCall = (registry: RegistryAddresses, claimId: Hex, auditor: Address): ContractCall =>
  claimCall(registry, 'assignAuditor', [claimId, auditor]);

export const resolveDisputeCall = (registry: RegistryAddresses, claimId: Hex, upheld: boolean, justification: Hex): ContractCall =>
  claimCall(registry, 'resolveDispute', [claimId, upheld, justification]);

export const accreditAuditorCall = (registry: RegistryAddresses, auditor: Address): ContractCall =>
  participantCall(registry, 'accreditAuditor', [auditor]);

export const revokeAuditorCall = (registry: RegistryAddresses, auditor: Address): ContractCall =>
  participantCall(registry, 'revokeAuditor', [auditor]);

// --- Registry Admin -----------------------------------------------------------------------------

export const registerOrganizationCall = (registry: RegistryAddresses, organization: Address): ContractCall =>
  participantCall(registry, 'registerOrganization', [organization]);

export const revokeOrganizationCall = (registry: RegistryAddresses, organization: Address): ContractCall =>
  participantCall(registry, 'revokeOrganization', [organization]);

export const registerInternalVerifierCall = (registry: RegistryAddresses, verifier: Address, organization: Address): ContractCall =>
  participantCall(registry, 'registerInternalVerifier', [verifier, organization]);

export const revokeInternalVerifierCall = (registry: RegistryAddresses, verifier: Address): ContractCall =>
  participantCall(registry, 'revokeInternalVerifier', [verifier]);

// --- Anyone -------------------------------------------------------------------------------------

/** Releases the deposits once the dispute window has closed; anyone may call it. */
export const settleCall = (registry: RegistryAddresses, claimId: Hex): ContractCall => claimCall(registry, 'settle', [claimId]);

/** Pays the caller everything credited to it (pull payments). */
export const withdrawCall = (registry: RegistryAddresses): ContractCall => claimCall(registry, 'withdraw', []);
