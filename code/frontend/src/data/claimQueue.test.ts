// =============================================================================
// Proof of Aid — Team 05 — Tests: per-role claim lists from the indexer API
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { json, stubFetch } from '../test/stubFetch';
import { WALLETS } from '../test/stubRegistryNode';
import { fetchClaimQueue, queueSpec } from './claimQueue';

const API = 'http://api.test';
const ID_A = `0x${'aa'.repeat(32)}`;
const ID_B = `0x${'bb'.repeat(32)}`;
const item = (claimId: string, status: string, organization: string = WALLETS.organization.toLowerCase()) => ({
  claimId,
  organization,
  status,
  anchoredBlock: 1,
  anchoredAt: '2026-09-25T00:00:00Z',
  lastStatusBlock: 1,
  lastStatusAt: '2026-09-25T00:00:00Z',
});
const page = (...items: unknown[]) => json({ items, total: items.length, limit: 100, offset: 0, indexedToBlock: 10 });

describe('fetchClaimQueue', () => {
  it('lists only the organization’s own claims, whatever their status', async () => {
    const { fetch, requested } = stubFetch({
      [`${API}/public/claims?limit=100`]: page(item(ID_A, 'Anchored'), item(ID_B, 'Verified', WALLETS.stranger.toLowerCase())),
    });
    const queue = await fetchClaimQueue(fetch, API, queueSpec('organization', WALLETS.organization, undefined));
    expect(queue).toEqual({ ok: true, value: [{ claimId: ID_A, organization: WALLETS.organization, status: 'Anchored' }] });
    expect(requested).toEqual([`${API}/public/claims?limit=100`]);
  });

  it('asks for the statuses a verifier acts on, for its own organization', async () => {
    const { fetch, requested } = stubFetch({
      [`${API}/public/claims?status=Anchored&limit=100`]: page(item(ID_A, 'Anchored')),
      [`${API}/public/claims?status=ProofSubmitted&limit=100`]: page(item(ID_B, 'ProofSubmitted', WALLETS.stranger)),
    });
    const queue = await fetchClaimQueue(fetch, API, queueSpec('internalVerifier', WALLETS.verifier1, WALLETS.organization));
    expect(queue.ok && queue.value.map((entry) => entry.claimId)).toEqual([ID_A]);
    expect(requested).toHaveLength(2);
  });

  it('gives the Authority every claim needing an auditor or a dispute decision', () => {
    expect(queueSpec('accreditationAuthority', WALLETS.authority, undefined).statuses).toEqual([
      'InternallyVerified',
      'ProofRequested',
      'ProofSubmitted',
      'Disputed',
    ]);
  });

  it('fails as a value when the API is down or answers nonsense', async () => {
    const down = stubFetch({ [`${API}/public/claims?status=Verified&limit=100`]: { networkError: 'refused' } });
    expect((await fetchClaimQueue(down.fetch, API, queueSpec('public', WALLETS.stranger, undefined))).ok).toBe(false);
    const odd = stubFetch({ [`${API}/public/claims?status=Verified&limit=100`]: json({ items: [{ claimId: 'x' }] }) });
    expect(await fetchClaimQueue(odd.fetch, API, queueSpec('public', WALLETS.stranger, undefined))).toEqual({
      ok: false,
      error: 'The indexer API answered with an unexpected claim list.',
    });
  });
});
