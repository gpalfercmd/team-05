// =============================================================================
// Proof of Aid — Team 05 — Tests: evidence service client (login, claim creation, uploads)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { API, LOGIN_MESSAGE, NEW_CLAIM_ID, NEW_METADATA_HASH, NEW_ROOT, stubEvidenceApi } from '../test/stubEvidenceApi';
import { WALLETS } from '../test/stubRegistryNode';
import { createClaim, readSession, requestChallenge, uploadEvidence, verifyLogin } from './evidenceApi';

describe('evidence service client', () => {
  it('reads the session: signed out on 401, else the checksummed wallet', async () => {
    const script = { session: undefined as string | undefined, replies: {} };
    const { fetch, requests } = stubEvidenceApi(script);
    expect(await readSession(fetch, API)).toEqual({ ok: true, value: undefined });
    script.session = WALLETS.organization.toLowerCase();
    expect(await readSession(fetch, API)).toEqual({ ok: true, value: WALLETS.organization });
    expect(requests.every((request) => request.credentials === 'include')).toBe(true);
  });

  it('logs in with a challenge and a signature', async () => {
    const { fetch, requests } = stubEvidenceApi({ session: undefined, replies: {} });
    expect(await requestChallenge(fetch, API, WALLETS.organization)).toEqual({ ok: true, value: LOGIN_MESSAGE });
    const signature = `0x${'11'.repeat(65)}` as const;
    expect(await verifyLogin(fetch, API, WALLETS.organization, signature)).toEqual({ ok: true, value: WALLETS.organization });
    expect(requests[1]).toMatchObject({ method: 'POST', url: `${API}/auth/verify`, body: { address: WALLETS.organization, signature } });
  });

  it('creates a claim with the backend field names and returns what anchoring needs', async () => {
    const { fetch, requests } = stubEvidenceApi({ session: 'x', replies: {} });
    const created = await createClaim(fetch, API, { title: 'Kits', description: 'Food kits', locationRegion: 'District X', claimDate: '2026-09-20' });
    expect(created).toEqual({ ok: true, value: { claimId: NEW_CLAIM_ID, metadataHash: NEW_METADATA_HASH } });
    expect(requests[0]?.body).toEqual({ title: 'Kits', description: 'Food kits', location_region: 'District X', claim_date: '2026-09-20' });
  });

  it('uploads files into the requested bundle as multipart form data', async () => {
    const { fetch, requests } = stubEvidenceApi({ session: 'x', replies: {} });
    const file = new File(['receipt'], 'receipt.txt', { type: 'text/plain' });
    const bundle = await uploadEvidence(fetch, API, NEW_CLAIM_ID, { files: [file], isPublic: true, rootIndex: 1 });
    expect(bundle).toEqual({ ok: true, value: { rootIndex: 1, evidenceRoot: NEW_ROOT, fileCount: 1 } });
    expect(requests[0]).toMatchObject({ url: `${API}/claims/${NEW_CLAIM_ID}/evidence`, body: { public: 'true', root_index: '1' } });
  });

  it('reports refusals with the backend’s reason, and network failures, as values', async () => {
    const refused = stubEvidenceApi({ session: 'x', replies: { 'POST /claims': { status: 403, body: { detail: 'only an accredited organization can perform this action' } } } });
    expect(await createClaim(refused.fetch, API, { title: 't', description: 'd', locationRegion: 'r', claimDate: '2026-09-20' })).toEqual({
      ok: false,
      error: 'The evidence service refused the request (HTTP 403: only an accredited organization can perform this action).',
    });
    const down = stubEvidenceApi({ session: undefined, replies: { 'GET /auth/me': 'network-error' } });
    const session = await readSession(down.fetch, API);
    expect(!session.ok && session.error).toMatch(/could not be reached/);
  });
});
