// =============================================================================
// Proof of Aid — Team 05 — Connected wallet's participant role, read from the ParticipantRegistry
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { readRoleFlags } from '../chain/reads';
import { ROLE_LABELS, resolveRole, type Role } from '../utils/roles';
import { useAppConfig } from './useAppConfig';
import { useReadClient, useRegistries, useWallet } from './useWallet';

export type RoleStatus = 'demo' | 'disconnected' | 'loading' | 'ready' | 'error';

export type RoleState = {
  role: Role;
  label: string;
  /** `ready` only once the registry answered; every other status shows the public view. */
  status: RoleStatus;
  /** The verifier's organization (`organizationOf`), when the role is internal verifier. */
  verifierOrganization: Address | undefined;
  error: string | undefined;
};

/** Registry roles change rarely; a confirmed transaction refreshes them anyway. */
const ROLE_STALE_MS = 30_000;

const publicState = (status: RoleStatus, error: string | undefined = undefined): RoleState => ({
  role: 'public',
  label: ROLE_LABELS.public,
  status,
  verifierOrganization: undefined,
  error,
});

export function useRole(): RoleState {
  const { chain } = useAppConfig();
  const wallet = useWallet();
  const registries = useRegistries();
  const client = useReadClient();
  const address = wallet.status === 'connected' ? wallet.address : undefined;
  const query = useQuery({
    queryKey: ['role', chain.id, registries?.participantRegistry, address],
    queryFn:
      registries === undefined || client === undefined || address === undefined
        ? skipToken
        : () => readRoleFlags(client, registries, address),
    staleTime: ROLE_STALE_MS,
  });

  let state: RoleState;
  if (registries === undefined) {
    state = publicState('demo');
  } else if (address === undefined) {
    state = publicState('disconnected');
  } else if (query.data === undefined) {
    state = query.isError ? publicState('error', query.error.message) : publicState('loading');
  } else if (!query.data.ok) {
    state = publicState('error', query.data.error);
  } else {
    const role = resolveRole(query.data.value);
    state = {
      role,
      label: ROLE_LABELS[role],
      status: 'ready',
      verifierOrganization: query.data.value.verifierOrganization,
      error: undefined,
    };
  }
  return state;
}
