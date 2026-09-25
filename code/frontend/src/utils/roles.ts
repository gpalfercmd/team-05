// =============================================================================
// Proof of Aid — Team 05 — Participant roles and their plain-language labels
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address } from 'viem';

/** One role per wallet (P1 decision); `public` is anyone without a registered role. */
export type Role =
  | 'public'
  | 'organization'
  | 'internalVerifier'
  | 'auditor'
  | 'accreditationAuthority'
  | 'registryAdmin';

/** Labels shown in the RoleBanner (DESIGN.md). */
export const ROLE_LABELS: Record<Role, string> = {
  public: 'Public visitor',
  organization: 'Organization',
  internalVerifier: 'Internal verifier',
  auditor: 'Auditor',
  accreditationAuthority: 'Accreditation Authority',
  registryAdmin: 'Registry Admin',
};

/** What the ParticipantRegistry says about one wallet. */
export type RoleFlags = {
  isRegistryAdmin: boolean;
  isAccreditationAuthority: boolean;
  isOrganization: boolean;
  /** `organizationOf(wallet)`: set only for an active verifier of a still-active organization. */
  verifierOrganization: Address | undefined;
  isAuditor: boolean;
};

/**
 * The registry gives every wallet at most one role (a wallet that ever held one can never get
 * another), so the order only matters for a registry that broke that rule; admin roles win.
 */
export function resolveRole(flags: RoleFlags): Role {
  let role: Role = 'public';
  if (flags.isRegistryAdmin) {
    role = 'registryAdmin';
  } else if (flags.isAccreditationAuthority) {
    role = 'accreditationAuthority';
  } else if (flags.isOrganization) {
    role = 'organization';
  } else if (flags.verifierOrganization !== undefined) {
    role = 'internalVerifier';
  } else if (flags.isAuditor) {
    role = 'auditor';
  }
  return role;
}
