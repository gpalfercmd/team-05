// =============================================================================
// Proof of Aid — Team 05 — Loads "What needs your action": indexer candidates, re-read from the chain
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import type { Address, PublicClient } from 'viem';
import type { RegistryAddresses } from '../chain/calls';
import { readClaimActionState, type ClaimActionState } from '../chain/reads';
import { ACTION_CANDIDATE_LIMIT, actionCandidates, deriveActionItems, type ActionItem } from '../data/actionItems';
import { fetchClaimQueue } from '../data/claimQueue';
import { browserFetch } from '../data/httpJson';
import { err, ok, type Result } from '../utils/result';
import type { Role } from '../utils/roles';
import { useAppConfig } from './useAppConfig';
import { useReadClient, useRegistries } from './useWallet';

export type ActionItemsLookup =
  | { state: 'no-api' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; items: ActionItem[] };

type LoadArgs = {
  apiUrl: string;
  client: PublicClient;
  registries: RegistryAddresses;
  role: Role;
  viewer: Address;
  verifierOrganization: Address | undefined;
};

async function loadActionItems({ apiUrl, client, registries, role, viewer, verifierOrganization }: LoadArgs): Promise<Result<ActionItem[], string>> {
  const searches = actionCandidates(role, viewer, verifierOrganization).map((candidates) =>
    fetchClaimQueue(browserFetch, apiUrl, { heading: '', empty: '', ...candidates }),
  );
  const pages = await Promise.all(searches);
  const failed = pages.find((page) => !page.ok);
  if (failed !== undefined && !failed.ok) {
    return err(failed.error);
  }
  const ids = [...new Set(pages.flatMap((page) => (page.ok ? page.value.map((item) => item.claimId) : [])))].slice(
    0,
    ACTION_CANDIDATE_LIMIT,
  );
  const reads = await Promise.all(ids.map((claimId) => readClaimActionState(client, registries, claimId, viewer)));
  const unreadable = reads.find((read) => !read.ok);
  if (unreadable !== undefined && !unreadable.ok) {
    return err(unreadable.error);
  }
  const claims = reads.flatMap((read): ClaimActionState[] => (read.ok && read.value !== undefined ? [read.value] : []));
  return ok(deriveActionItems(role, viewer, claims));
}

export function useActionItems(role: Role, viewer: Address, verifierOrganization: Address | undefined): ActionItemsLookup {
  const { apiUrl, chain } = useAppConfig();
  const registries = useRegistries();
  const client = useReadClient();
  const query = useQuery({
    // A confirmed transaction invalidates every query, so the list follows the claims it changed.
    queryKey: ['action-items', chain.id, apiUrl, registries?.claimRegistry, role, viewer, verifierOrganization],
    queryFn:
      apiUrl === undefined || registries === undefined || client === undefined
        ? skipToken
        : () => loadActionItems({ apiUrl, client, registries, role, viewer, verifierOrganization }),
  });

  let lookup: ActionItemsLookup;
  if (apiUrl === undefined) {
    lookup = { state: 'no-api' };
  } else if (query.data === undefined) {
    lookup = query.isError ? { state: 'error', message: query.error.message } : { state: 'loading' };
  } else if (!query.data.ok) {
    lookup = { state: 'error', message: query.data.error };
  } else {
    lookup = { state: 'ready', items: query.data.value };
  }
  return lookup;
}
