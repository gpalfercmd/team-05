// =============================================================================
// Proof of Aid — Team 05 — One claim as the contract sees it, for the connected wallet's actions
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { readClaimActionState, type ClaimActionState } from '../chain/reads';
import type { Result } from '../utils/result';
import { useAppConfig } from './useAppConfig';
import { useReadClient, useRegistries, useWallet } from './useWallet';

export type ClaimActionLookup =
  | { state: 'loading' }
  | { state: 'not-found' }
  | { state: 'error'; message: string; retry: () => void }
  | { state: 'found'; claim: ClaimActionState };

export function useClaimActionState(claimId: Hex): ClaimActionLookup {
  const { chain } = useAppConfig();
  const registries = useRegistries();
  const client = useReadClient();
  const wallet = useWallet();
  const viewer = wallet.status === 'connected' ? wallet.address : undefined;
  const query = useQuery({
    queryKey: ['claim-actions', chain.id, registries?.claimRegistry, claimId, viewer],
    queryFn:
      registries === undefined || client === undefined || viewer === undefined
        ? skipToken
        : (): Promise<Result<ClaimActionState | undefined, string>> => readClaimActionState(client, registries, claimId, viewer),
  });
  const retry = () => void query.refetch();

  let lookup: ClaimActionLookup;
  if (query.data === undefined) {
    lookup = query.isError ? { state: 'error', message: query.error.message, retry } : { state: 'loading' };
  } else if (!query.data.ok) {
    lookup = { state: 'error', message: query.data.error, retry };
  } else if (query.data.value === undefined) {
    lookup = { state: 'not-found' };
  } else {
    lookup = { state: 'found', claim: query.data.value };
  }
  return lookup;
}
