// =============================================================================
// Proof of Aid — Team 05 — Tests: a wallet's role from the ParticipantRegistry flags
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { resolveRole, type RoleFlags } from './roles';

const none: RoleFlags = {
  isRegistryAdmin: false,
  isAccreditationAuthority: false,
  isOrganization: false,
  verifierOrganization: undefined,
  isAuditor: false,
};

describe('resolveRole', () => {
  it('is public without any registry role', () => {
    expect(resolveRole(none)).toBe('public');
  });

  it.each([
    [{ isRegistryAdmin: true }, 'registryAdmin'],
    [{ isAccreditationAuthority: true }, 'accreditationAuthority'],
    [{ isOrganization: true }, 'organization'],
    [{ verifierOrganization: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }, 'internalVerifier'],
    [{ isAuditor: true }, 'auditor'],
  ] as const)('maps %o to %s', (flags, role) => {
    expect(resolveRole({ ...none, ...flags })).toBe(role);
  });

  it('lets an admin role win if a registry ever broke the one-role rule', () => {
    expect(resolveRole({ ...none, isRegistryAdmin: true, isAuditor: true })).toBe('registryAdmin');
  });
});
