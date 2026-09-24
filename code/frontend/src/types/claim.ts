// =============================================================================
// Proof of Aid — Team 05 — Public view of a claim, as read from the contract or demo data
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address, Hex } from 'viem';
import type { RecordedClaimStatus } from '../utils/claimStatus';

/** Only public, onchain values: no personal data ever reaches this type. */
export type ClaimSummary = {
  /** keccak256 of the backend's claim UUID (bytes32). */
  claimId: Hex;
  status: RecordedClaimStatus;
  organization: Address;
  /** `anchoredAt` from the contract: seconds since the epoch. */
  anchoredAt: number;
  anchorTxHash: Hex;
  /** Index 0 is the original evidence bundle, then one root per supplementary proof. */
  evidenceRoots: readonly Hex[];
};
