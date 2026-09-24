// =============================================================================
// Proof of Aid — Team 05 — Picks the claim data source for the configured mode (chain, API or demo)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { createPublicClient, http } from 'viem';
import type { AppEnv } from '../config/env';
import { ApiClaimSource } from './apiClaimSource';
import { ChainClaimSource } from './chainClaimSource';
import { MockClaimSource } from './mockClaimSource';
import { DEMO_STATIC_MANIFESTS, PublishedManifests } from './publishedManifests';
import type { ClaimDataSource } from './source';

/**
 * A plain viem public client built from the app config: reading needs no wallet, so a visitor
 * without MetaMask sees exactly what a connected participant sees.
 *
 * With `env.apiUrl` (P4) the history and the published file lists come from the indexer API, but
 * status and evidence roots are still read from the contract, so the integrity check never
 * depends on the backend. Without it everything is read from the chain.
 */
export function createClaimSource(env: AppEnv): ClaimDataSource {
  if (env.contracts.mode === 'mock') {
    return new MockClaimSource();
  }
  const manifests = new PublishedManifests({ apiUrl: env.apiUrl, staticManifests: DEMO_STATIC_MANIFESTS });
  const chain = new ChainClaimSource(createPublicClient({ chain: env.chain, transport: http(env.rpcUrl) }), {
    address: env.contracts.claimRegistry,
    fromBlock: env.contracts.deployBlock,
    chunkSize: env.logChunkSize,
    manifests,
  });
  const source: ClaimDataSource =
    env.apiUrl === undefined
      ? chain
      : new ApiClaimSource(chain, { apiUrl: env.apiUrl, chainId: env.chain.id, claimRegistry: env.contracts.claimRegistry });
  return source;
}
