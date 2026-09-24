// =============================================================================
// Proof of Aid — Team 05 — Claim lookup for the public page (demo data until P5.4)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isHash, type Hex } from 'viem';
import { z } from 'zod';
import { findMockClaim } from '../mocks/claims';
import type { ClaimSummary } from '../types/claim';
import { useAppConfig } from './useAppConfig';

export type ClaimLookup =
  | { state: 'invalid-id' }
  | { state: 'not-found' }
  | { state: 'found'; claim: ClaimSummary; source: 'demo' | 'chain' }
  | { state: 'unavailable'; reason: string };

// The claim ID arrives from the URL, so it is validated as a bytes32 before any lookup.
const claimIdSchema = z.custom<Hex>((value) => typeof value === 'string' && isHash(value));

export function useClaimStatus(rawClaimId: string | undefined): ClaimLookup {
  const { contracts } = useAppConfig();
  const parsedId = claimIdSchema.safeParse(rawClaimId);
  let lookup: ClaimLookup;
  if (!parsedId.success) {
    lookup = { state: 'invalid-id' };
  } else if (contracts.mode === 'mock') {
    const claim = findMockClaim(parsedId.data);
    lookup = claim === undefined ? { state: 'not-found' } : { state: 'found', claim, source: 'demo' };
  } else {
    // TODO(P5.4): read statusOf, getClaim, evidenceRoots and the StatusChanged logs with viem.
    lookup = { state: 'unavailable', reason: 'Reading claims from the blockchain is not available yet.' };
  }
  return lookup;
}
