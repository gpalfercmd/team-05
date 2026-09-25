// =============================================================================
// Proof of Aid — Team 05 — The chain's clock: timestamp of the latest block
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import { useAppConfig } from './useAppConfig';
import { useReadClient } from './useWallet';

/**
 * Seconds since the epoch of the latest block, or `undefined` while unknown (or when `enabled`
 * is false). The dispute window is measured on this clock, which on anvil can run ahead of the
 * visitor's (`evm_increaseTime`).
 */
export function useChainTime(enabled: boolean): bigint | undefined {
  const { chain } = useAppConfig();
  const client = useReadClient();
  const query = useQuery({
    queryKey: ['chain-time', chain.id],
    queryFn: !enabled || client === undefined ? skipToken : async () => (await client.getBlock()).timestamp,
    staleTime: 15_000,
    retry: false,
  });
  return query.data;
}
