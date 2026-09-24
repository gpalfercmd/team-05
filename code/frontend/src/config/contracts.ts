// =============================================================================
// Proof of Aid — Team 05 — Contract ABIs (from code/shared/abi) and deployed addresses
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import claimRegistryAbiJson from '@shared/abi/IClaimRegistry.json';
import participantRegistryAbiJson from '@shared/abi/IParticipantRegistry.json';
import { parseAbi, type Abi, type Address } from 'viem';
import type { ContractsConfig } from './env';

// The implementations inherit OpenZeppelin AccessControl, whose revert is not part of the frozen
// interfaces. Adding it to the ABIs lets viem decode that error so it can be explained in words.
const accessControlErrors = parseAbi([
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
]);

// JSON imports are typed with plain strings, not ABI literals, so contract reads return `unknown`
// and must be validated at the boundary (zod) before use.
export const claimRegistryAbi: Abi = [...(claimRegistryAbiJson as Abi), ...accessControlErrors];

export const participantRegistryAbi: Abi = [...(participantRegistryAbiJson as Abi), ...accessControlErrors];

export type ContractRef = { address: Address; abi: Abi };

export type DeployedContracts = { claimRegistry: ContractRef; participantRegistry: ContractRef };

/** Contract handles for wagmi/viem calls; only callable once env parsing proved we are on chain. */
export function deployedContracts(contracts: Extract<ContractsConfig, { mode: 'chain' }>): DeployedContracts {
  const deployed = {
    claimRegistry: { address: contracts.claimRegistry, abi: claimRegistryAbi },
    participantRegistry: { address: contracts.participantRegistry, abi: participantRegistryAbi },
  };
  return deployed;
}
