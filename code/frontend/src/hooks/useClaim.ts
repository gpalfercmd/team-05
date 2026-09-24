// =============================================================================
// Proof of Aid — Team 05 — Loads one claim for the public page through the configured source
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isHash, type Hex } from 'viem';
import { z } from 'zod';
import { createClaimSource } from '../data/createClaimSource';
import type { DataError } from '../data/source';
import type { ClaimView } from '../types/claim';
import { useAppConfig } from './useAppConfig';

export type ClaimLoadError = Exclude<DataError, { kind: 'not-found' }>;

export type ClaimLookup =
  | { state: 'invalid-id' }
  | { state: 'loading' }
  | { state: 'not-found' }
  | { state: 'error'; error: ClaimLoadError; retry: () => void }
  | { state: 'found'; claim: ClaimView };

// The claim ID arrives from the URL, so it is validated as a bytes32 before any lookup.
const claimIdSchema = z.custom<Hex>((value) => typeof value === 'string' && isHash(value));

/** Onchain history only grows, so a short cache avoids re-reading the chain on every visit. */
const CLAIM_STALE_MS = 15_000;

export function useClaim(rawClaimId: string | undefined): ClaimLookup {
  const env = useAppConfig();
  const source = useMemo(() => createClaimSource(env), [env]);
  const parsedId = claimIdSchema.safeParse(rawClaimId);
  const claimId = parsedId.success ? (parsedId.data.toLowerCase() as Hex) : undefined;
  const registry = env.contracts.mode === 'chain' ? env.contracts.claimRegistry : 'demo';
  const query = useQuery({
    queryKey: ['claim', env.chain.id, registry, claimId],
    // The source returns a Result and never throws, so failures arrive as data, not as retries.
    queryFn: claimId === undefined ? skipToken : () => source.getClaim(claimId),
    staleTime: CLAIM_STALE_MS,
  });
  const retry = () => void query.refetch();

  let lookup: ClaimLookup;
  if (claimId === undefined) {
    lookup = { state: 'invalid-id' };
  } else if (query.data === undefined) {
    lookup = query.isError
      ? { state: 'error', error: { kind: 'unavailable', detail: query.error.message }, retry }
      : { state: 'loading' };
  } else if (query.data.ok) {
    lookup = { state: 'found', claim: query.data.value };
  } else if (query.data.error.kind === 'not-found') {
    lookup = { state: 'not-found' };
  } else {
    lookup = { state: 'error', error: query.data.error, retry };
  }
  return lookup;
}
