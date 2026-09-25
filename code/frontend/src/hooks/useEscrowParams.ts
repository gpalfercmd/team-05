// =============================================================================
// Proof of Aid — Team 05 — Payable amounts and the wallet's withdrawable credits, from the contract
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import { readCredits, readEscrowParams, type EscrowParams } from '../chain/reads';
import type { Result } from '../utils/result';
import { useAppConfig } from './useAppConfig';
import { useReadClient, useRegistries, useWallet } from './useWallet';

/** `undefined` while loading or in demo mode; an `err` explains a failed read. */
export function useEscrowParams(): Result<EscrowParams, string> | undefined {
  const { chain } = useAppConfig();
  const registries = useRegistries();
  const client = useReadClient();
  const query = useQuery({
    queryKey: ['escrow-params', chain.id, registries?.claimRegistry],
    queryFn: registries === undefined || client === undefined ? skipToken : () => readEscrowParams(client, registries),
    // Immutable in the contract: read once per page load.
    staleTime: Number.POSITIVE_INFINITY,
  });
  return query.data;
}

/** `credits(wallet)`: wei waiting to be withdrawn by the connected wallet. */
export function useCredits(): Result<bigint, string> | undefined {
  const { chain } = useAppConfig();
  const registries = useRegistries();
  const client = useReadClient();
  const wallet = useWallet();
  const address = wallet.status === 'connected' ? wallet.address : undefined;
  const query = useQuery({
    queryKey: ['credits', chain.id, registries?.claimRegistry, address],
    queryFn:
      registries === undefined || client === undefined || address === undefined
        ? skipToken
        : () => readCredits(client, registries, address),
  });
  return query.data;
}
