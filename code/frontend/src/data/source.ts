// =============================================================================
// Proof of Aid — Team 05 — Claim data source seam: one interface, chain / API / demo behind it
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import type { ClaimSource, ClaimView } from '../types/claim';
import type { Result } from '../utils/result';

/** Why a claim could not be shown; every case has a plain-language message on the page. */
export type DataError =
  /** `statusOf(claimId) == None`: nothing was ever anchored under this ID. */
  | { kind: 'not-found' }
  /** The RPC endpoint could not be reached or failed. */
  | { kind: 'unavailable'; detail: string }
  /** The RPC endpoint kept refusing the history query even with small block ranges. */
  | { kind: 'history-too-large'; detail: string }
  /** The chain answered with values this page cannot interpret (e.g. ABI drift). */
  | { kind: 'invalid-data'; detail: string };

/**
 * Where the public page reads a claim from. Implementations:
 * - `ChainClaimSource`: the contract itself through a viem public client (no wallet, no backend).
 * - `MockClaimSource`: demo data, until P2 deploys and for the offline demo.
 * - `ApiClaimSource` (P4, `VITE_API_URL`): takes the timeline and the published file lists from the
 *   indexer as a speed-up, but still reads status and evidence roots from the contract, because the
 *   integrity proof shown to visitors must never depend on the backend. It falls back to the chain
 *   history whenever the API is unreachable, invalid or behind.
 */
export type ClaimDataSource = {
  readonly kind: ClaimSource;
  getClaim(claimId: Hex): Promise<Result<ClaimView, DataError>>;
};
