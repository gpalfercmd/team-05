// =============================================================================
// Proof of Aid — Team 05 — Connected wallet's participant role (placeholder until P5.3)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { ROLE_LABELS, type Role } from '../utils/roles';

export type RoleState = {
  role: Role;
  label: string;
  /** True while the role is not yet read from the ParticipantRegistry. */
  isPlaceholder: boolean;
};

export function useRole(): RoleState {
  // TODO(P5.3): resolve the role from ParticipantRegistry (isRegistryAdmin, isAccreditationAuthority,
  // isOrganization, organizationOf, isAuditor) for the connected wallet; demo mode stays "public".
  const role: Role = 'public';
  const state: RoleState = { role, label: ROLE_LABELS[role], isPlaceholder: true };
  return state;
}
