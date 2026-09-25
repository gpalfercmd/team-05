// =============================================================================
// Proof of Aid — Team 05 — Tests: evidence service client (login, claim creation, uploads)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { API, LOGIN_MESSAGE, NEW_CLAIM_ID, NEW_METADATA_HASH, NEW_ROOT, stubEvidenceApi } from '../test/stubEvidenceApi';
import { WALLETS } from '../test/stubRegistryNode';
import { createClaim, downloadEvidenceFile, readClaimAccess, readNotes, readSession, requestChallenge, storeNote, uploadEvidence, verifyLogin } from './evidenceApi';

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

  it('reads the claim as this session sees it: authorized, fingerprints only, or not stored', async () => {
    const sha = `0x${'aa'.repeat(32)}`;
    const authorized = stubEvidenceApi({
      session: 'x',
      replies: {
        [`GET /claims/${NEW_CLAIM_ID}`]: {
          status: 200,
          body: {
            viewer_access: 'authorized',
            bundles: [{ root_index: 0, files: [{ id: 'f1', sha256_hex: sha, salt: null, original_name: 'a.txt', mime_type: 'text/plain', size_bytes: 3, is_public: false, root_index: 0 }] }],
          },
        },
      },
    });
    const access = await readClaimAccess(authorized.fetch, API, NEW_CLAIM_ID);
    expect(access).toEqual({
      ok: true,
      value: {
        kind: 'authorized',
        bundles: [{ rootIndex: 0, files: [{ id: 'f1', fingerprint: sha, salt: undefined, name: 'a.txt', mimeType: 'text/plain', sizeBytes: 3, isPublic: false, rootIndex: 0 }] }],
      },
    });
    expect(authorized.requests[0]?.credentials).toBe('include');
    const denied = stubEvidenceApi({ session: 'x', replies: { [`GET /claims/${NEW_CLAIM_ID}`]: { status: 200, body: { viewer_access: 'public', bundles: [] } } } });
    expect(await readClaimAccess(denied.fetch, API, NEW_CLAIM_ID)).toEqual({ ok: true, value: { kind: 'denied' } });
    const missing = stubEvidenceApi({ session: 'x', replies: {} });
    expect(await readClaimAccess(missing.fetch, API, NEW_CLAIM_ID)).toEqual({ ok: true, value: { kind: 'not-stored' } });
  });

  it('downloads file bytes with the session and explains a refused download', async () => {
    const served = await downloadEvidenceFile(() => Promise.resolve(new Response('bytes')), API, 'f1');
    expect(served.ok && new TextDecoder().decode(served.value)).toBe('bytes');
    const refused = await downloadEvidenceFile(() => Promise.resolve(new Response('', { status: 404 })), API, 'f1');
    expect(!refused.ok && refused.error).toMatch(/did not hand out this file/);
  });

  it('stores a note with the backend field names, and says when the claim is unknown there', async () => {
    const hash = `0x${'aa'.repeat(32)}` as const;
    const salt = `0x${'bb'.repeat(32)}` as const;
    const reply = { id: 'n1', claim_id: NEW_CLAIM_ID, kind: 'proof_request', author: WALLETS.auditor.toLowerCase(), note_hash: hash, text: 'x', salt, created_at: '2026-09-25T08:00:00Z' };
    const api = stubEvidenceApi({ session: 'x', replies: { [`POST /claims/${NEW_CLAIM_ID}/notes`]: { status: 201, body: reply }, [`GET /claims/${NEW_CLAIM_ID}/notes`]: { status: 200, body: { notes: [reply] } } } });
    const note = { kind: 'proof_request' as const, text: 'x', salt, noteHash: hash };
    expect(await storeNote(api.fetch, API, NEW_CLAIM_ID, note)).toEqual({ ok: true, value: 'stored' });
    expect(api.requests[0]).toMatchObject({ method: 'POST', credentials: 'include', body: { kind: 'proof_request', text: 'x', salt, note_hash: hash } });
    const notes = await readNotes(api.fetch, API, NEW_CLAIM_ID);
    expect(notes.ok && notes.value[0]).toMatchObject({ kind: 'proof_request', author: WALLETS.auditor, noteHash: hash, salt, text: 'x' });
    const unknown = stubEvidenceApi({ session: 'x', replies: {} });
    expect(await storeNote(unknown.fetch, API, NEW_CLAIM_ID, note)).toEqual({ ok: true, value: 'not-stored' });
  });
});
