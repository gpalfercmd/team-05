// =============================================================================
// Proof of Aid — Team 05 — Participant roles and their plain-language labels
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

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
