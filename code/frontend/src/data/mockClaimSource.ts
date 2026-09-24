// =============================================================================
// Proof of Aid — Team 05 — Demo claim source (no chain needed): same ClaimView shape as the chain
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { MOCK_CLAIMS } from '../mocks/claims';
import type { ClaimView } from '../types/claim';
import { err, type Result } from '../utils/result';
import { assembleClaimView, type ClaimSnapshot } from './assembleClaimView';
import type { ClaimDataSource, DataError } from './source';

export class MockClaimSource implements ClaimDataSource {
  readonly kind = 'demo';
  readonly #claims: readonly ClaimSnapshot[];

  constructor(claims: readonly ClaimSnapshot[] = MOCK_CLAIMS) {
    this.#claims = claims;
  }

  getClaim(claimId: Hex): Promise<Result<ClaimView, DataError>> {
    const snapshot = this.#claims.find((claim) => claim.claimId.toLowerCase() === claimId.toLowerCase());
    const view = snapshot === undefined ? err<DataError>({ kind: 'not-found' }) : assembleClaimView(snapshot, 'demo');
    return Promise.resolve(view);
  }
}
