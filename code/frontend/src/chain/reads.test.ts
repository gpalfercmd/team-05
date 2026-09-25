// =============================================================================
// Proof of Aid — Team 05 — Tests: validated registry reads (roles, deposits, credits, claim state)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { CLAIM_ID, demoChainState, REGISTRIES, stubRegistryClient, WALLETS } from '../test/stubRegistryNode';
import { resolveRole } from '../utils/roles';
import { readClaimActionState, readCredits, readEscrowParams, readRoleFlags } from './reads';

describe('readRoleFlags', () => {
  it.each([
    [WALLETS.admin, 'registryAdmin'],
    [WALLETS.authority, 'accreditationAuthority'],
    [WALLETS.organization, 'organization'],
    [WALLETS.verifier1, 'internalVerifier'],
    [WALLETS.auditor, 'auditor'],
    [WALLETS.stranger, 'public'],
  ] as const)('reads %s as %s', async (wallet, role) => {
    const { client } = stubRegistryClient(demoChainState());
    const flags = await readRoleFlags(client, REGISTRIES, wallet);
    expect(flags.ok && resolveRole(flags.value)).toBe(role);
  });

  it('treats a verifier of a revoked organization as having no role', async () => {
    const { client } = stubRegistryClient(demoChainState({ organizations: [] }));
    const flags = await readRoleFlags(client, REGISTRIES, WALLETS.verifier1);
    expect(flags.ok && flags.value.verifierOrganization).toBeUndefined();
  });

  it('returns an error instead of throwing when the node is down', async () => {
    const { client } = stubRegistryClient(demoChainState({ failReads: true }));
    const flags = await readRoleFlags(client, REGISTRIES, WALLETS.admin);
    expect(flags.ok).toBe(false);
    expect(!flags.ok && flags.error).toMatch(/could not be read/);
  });
});

describe('readEscrowParams and readCredits', () => {
  it('reads every payable amount from the contract getters', async () => {
    const { client } = stubRegistryClient(
      demoChainState({ params: { anchorDeposit: 11n, auditorDeposit: 22n, disputeBond: 33n, disputeWindow: 44n } }),
    );
    expect(await readEscrowParams(client, REGISTRIES)).toEqual({
      ok: true,
      value: { anchorDeposit: 11n, auditorDeposit: 22n, disputeBond: 33n, disputeWindow: 44n },
    });
  });

  it('reads the credits waiting for a wallet', async () => {
    const { client } = stubRegistryClient(demoChainState({ credits: { [WALLETS.organization]: 5n } }));
    expect(await readCredits(client, REGISTRIES, WALLETS.organization)).toEqual({ ok: true, value: 5n });
    expect(await readCredits(client, REGISTRIES, WALLETS.stranger)).toEqual({ ok: true, value: 0n });
  });
});

describe('readClaimActionState', () => {
  it('returns nothing for a claim that was never anchored', async () => {
    const { client } = stubRegistryClient(demoChainState());
    expect(await readClaimActionState(client, REGISTRIES, CLAIM_ID, WALLETS.verifier1)).toEqual({ ok: true, value: undefined });
  });

  it('reads the claim, its organization’s standing, the viewer’s organization and the chain clock', async () => {
    const { client } = stubRegistryClient(
      demoChainState({
        now: 1_900_000_000n,
        claims: {
          [CLAIM_ID]: {
            organization: WALLETS.organization,
            status: 'Verified',
            internalVerifier: WALLETS.verifier1,
            auditor: WALLETS.auditor,
            roots: [`0x${'01'.repeat(32)}`, `0x${'02'.repeat(32)}`],
            disputeWindowClosesAt: 1_950_000_000n,
          },
        },
      }),
    );
    const state = await readClaimActionState(client, REGISTRIES, CLAIM_ID, WALLETS.verifier2);
    expect(state).toEqual({
      ok: true,
      value: {
        claimId: CLAIM_ID,
        status: 'Verified',
        organization: WALLETS.organization,
        internalVerifier: WALLETS.verifier1,
        auditor: WALLETS.auditor,
        rootCount: 2,
        organizationActive: true,
        viewerOrganization: WALLETS.organization,
        disputeWindowClosesAt: 1_950_000_000n,
        settled: false,
        now: 1_900_000_000n,
      },
    });
  });

  it('fails as a value when the node is unreachable', async () => {
    const { client } = stubRegistryClient(demoChainState({ failReads: true }));
    const state = await readClaimActionState(client, REGISTRIES, CLAIM_ID, WALLETS.verifier1);
    expect(state.ok).toBe(false);
  });
});
