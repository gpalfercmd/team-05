// =============================================================================
// Proof of Aid — Team 05 — Picks the claim data source for the configured mode (chain or demo)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { createPublicClient, http } from 'viem';
import type { AppEnv } from '../config/env';
import { ChainClaimSource } from './chainClaimSource';
import { MockClaimSource } from './mockClaimSource';
import type { ClaimDataSource } from './source';

/**
 * A plain viem public client built from the app config: reading needs no wallet, so a visitor
 * without MetaMask sees exactly what a connected participant sees.
 *
 * P4 seam: once the indexer lands, `env.apiUrl` can select an `ApiClaimSource` here for the
 * timeline and published file lists. It must keep reading status and evidence roots from the
 * contract, so the integrity check never depends on the backend.
 */
export function createClaimSource(env: AppEnv): ClaimDataSource {
  const source: ClaimDataSource =
    env.contracts.mode === 'mock'
      ? new MockClaimSource()
      : new ChainClaimSource(createPublicClient({ chain: env.chain, transport: http(env.rpcUrl) }), {
          address: env.contracts.claimRegistry,
          fromBlock: env.contracts.deployBlock,
          chunkSize: env.logChunkSize,
        });
  return source;
}
