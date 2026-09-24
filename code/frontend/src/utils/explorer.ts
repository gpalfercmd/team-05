// =============================================================================
// Proof of Aid — Team 05 — Block-explorer links (Arbiscan) for addresses and transactions
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isAddress, isHash, type Chain } from 'viem';

export type ExplorerKind = 'address' | 'tx';

/**
 * Link to the chain's default block explorer, or `undefined` when the chain has none (local
 * anvil) or the value is not a well-formed address / transaction hash, so no broken link is shown.
 */
export function explorerUrl(chain: Chain, kind: ExplorerKind, value: string): string | undefined {
  const baseUrl = chain.blockExplorers?.default.url;
  const wellFormed = kind === 'address' ? isAddress(value, { strict: false }) : isHash(value);
  const url = baseUrl !== undefined && wellFormed ? `${baseUrl}/${kind}/${value}` : undefined;
  return url;
}
