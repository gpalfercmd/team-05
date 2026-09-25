// =============================================================================
// Proof of Aid — Team 05 — Tests: reviewer view of private evidence files (P10.2)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Hex } from 'viem';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../data/httpJson';
import { API, LOGIN_MESSAGE, stubEvidenceApi, type EvidenceApiScript, type Recorded } from '../test/stubEvidenceApi';
import { CLAIM_ID, chainEnv, WALLETS } from '../test/stubRegistryNode';
import { connectWallet, renderWithProviders, wallet } from '../test/wagmiMock';
import type { ClaimView } from '../types/claim';
import { buildRoot, saltedSha256Hex } from '../utils/merkle';
import { AuthorizedEvidence, DEMO_NOTE, NO_ACCESS_NOTE, NO_API_NOTE, NO_WALLET_NOTE, NOT_STORED_NOTE, SIGNED_OUT_NOTE } from './AuthorizedEvidence';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../test/wagmiMock')).wagmiHooks,
}));

const SALT_A: Hex = `0x${'a1'.repeat(32)}`;
const SALT_B: Hex = `0x${'b2'.repeat(32)}`;
const PHOTO = 'delivery photo bytes';
const RECEIPT = 'signed receipt bytes';
const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

let photoHash: Hex;
let receiptHash: Hex;
let root: Hex;

beforeAll(async () => {
  const photo = await saltedSha256Hex(SALT_A, encode(PHOTO));
  const receipt = await saltedSha256Hex(SALT_B, encode(RECEIPT));
  if (!photo.ok || !receipt.ok) throw new Error('fixture');
  photoHash = photo.value;
  receiptHash = receipt.value;
  const built = buildRoot([photoHash, receiptHash]);
  if (!built.ok) throw new Error('fixture');
  root = built.value;
});

function claimView(source: ClaimView['source'] = 'chain'): ClaimView {
  return {
    claimId: CLAIM_ID,
    status: 'Anchored',
    organization: WALLETS.organization,
    internalVerifier: undefined,
    auditor: undefined,
    anchoredAt: 1_790_000_000,
    metadataHash: `0x${'cd'.repeat(32)}`,
    metadata: { state: 'not-configured' },
    evidence: [
      { rootIndex: 0, root, recordedAt: 1_790_000_000, txHash: undefined, publishedManifest: undefined, manifestHref: undefined, downloads: [] },
    ],
    timeline: [],
    source,
  };
}

const file = (id: string, sha: Hex, salt: Hex, name: string) => ({
  id,
  sha256_hex: sha,
  salt,
  original_name: name,
  mime_type: 'application/octet-stream',
  size_bytes: 20,
  is_public: false,
  root_index: 0,
  uploaded_by: WALLETS.organization.toLowerCase(),
  uploaded_at: '2026-09-25T08:00:00Z',
});

const authorizedClaim = () => ({
  viewer_access: 'authorized',
  bundles: [
    {
      root_index: 0,
      evidence_root: root,
      files: [file('file-photo', photoHash, SALT_A, 'delivery photo.jpg'), file('file-receipt', receiptHash, SALT_B, 'receipt.txt')],
    },
  ],
});

/** The stub evidence service plus binary downloads (`GET /files/{id}`). */
function withApi(script: Partial<EvidenceApiScript>, files: Record<string, string> = { 'file-photo': PHOTO, 'file-receipt': RECEIPT }) {
  const api = stubEvidenceApi({ session: undefined, replies: {}, ...script });
  const downloads: Recorded[] = [];
  const fetch: FetchLike = (input, init) => {
    const match = /\/files\/([^/?]+)$/.exec(input);
    if (match?.[1] !== undefined) {
      downloads.push({ url: input, method: init.method ?? 'GET', credentials: init.credentials, body: undefined });
      const content = files[match[1]];
      return Promise.resolve(content === undefined ? new Response('', { status: 404 }) : new Response(content));
    }
    return api.fetch(input, init);
  };
  vi.stubGlobal('fetch', fetch);
  return { requests: api.requests, downloads };
}

const authorizedReplies = () => ({ [`GET /claims/${CLAIM_ID}`]: { status: 200, body: authorizedClaim() } });

beforeEach(() => {
  connectWallet(WALLETS.auditor, undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Evidence files (authorized)', () => {
  it('in demo mode only explains that sample claims have no private files', () => {
    renderWithProviders(<AuthorizedEvidence claim={claimView('demo')} />, chainEnv({ apiUrl: API }));
    expect(screen.getByText(DEMO_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('explains that it needs the evidence service when no API is configured', () => {
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv());
    expect(screen.getByText(NO_API_NOTE)).toBeInTheDocument();
  });

  it('asks to connect a wallet first', () => {
    connectWallet(undefined, undefined);
    withApi({});
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    expect(screen.getByText(NO_WALLET_NOTE)).toBeInTheDocument();
  });

  it('offers a wallet sign-in, then lists the files the backend allows', async () => {
    const user = userEvent.setup();
    const { requests } = withApi({ replies: authorizedReplies() });
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    expect(await screen.findByText(SIGNED_OUT_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in with your wallet' }));
    expect(await screen.findAllByRole('button', { name: /^Download/ })).toHaveLength(2);
    expect(wallet.signed).toEqual([LOGIN_MESSAGE]);
    expect(requests.every((request) => request.credentials === 'include')).toBe(true);
    expect(screen.getByText(/matches the fingerprint recorded on the blockchain/)).toBeInTheDocument();
    expect(screen.getByText('(bundle #0)')).toBeInTheDocument();
  });

  it('hides the files and explains why when the backend says this wallet has no access', async () => {
    withApi({ session: WALLETS.stranger.toLowerCase(), replies: { [`GET /claims/${CLAIM_ID}`]: { status: 200, body: { viewer_access: 'public', bundles: [] } } } });
    connectWallet(WALLETS.stranger, undefined);
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    expect(await screen.findByText(NO_ACCESS_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('says so when the backend has no record of the claim', async () => {
    withApi({ session: WALLETS.auditor.toLowerCase() });
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    expect(await screen.findByText(NOT_STORED_NOTE)).toBeInTheDocument();
  });

  it('downloads a private file through the authenticated endpoint under a safe name', async () => {
    const user = userEvent.setup();
    const { downloads } = withApi({ session: WALLETS.auditor.toLowerCase(), replies: authorizedReplies() });
    const createObjectURL = vi.fn(() => 'blob:evidence');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('delivery_photo.jpg');
    });
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    const row = (await screen.findByRole('button', { name: /^Download\s+delivery_photo\.jpg$/ })).closest('li');
    if (row === null) throw new Error('row');
    await user.click(within(row).getByRole('button', { name: /^Download/ }));
    expect(await within(row).findByText('Saved as “delivery_photo.jpg”.')).toBeInTheDocument();
    expect(downloads).toEqual([{ url: `${API}/files/file-photo`, method: 'GET', credentials: 'include', body: undefined }]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('confirms a downloaded file against its salted fingerprint and the onchain root', async () => {
    const user = userEvent.setup();
    withApi({ session: WALLETS.auditor.toLowerCase(), replies: authorizedReplies() });
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    const row = (await screen.findByRole('button', { name: /^Download\s+receipt\.txt$/ })).closest('li');
    if (row === null) throw new Error('row');
    await user.click(within(row).getByRole('button', { name: /^Check this file/ }));
    expect(await within(row).findByText('Match')).toBeInTheDocument();
    expect(within(row).getByText(/exactly the one recorded/)).toBeInTheDocument();
  });

  it('reports a mismatch when the service hands out different bytes', async () => {
    const user = userEvent.setup();
    withApi({ session: WALLETS.auditor.toLowerCase(), replies: authorizedReplies() }, { 'file-photo': 'tampered bytes', 'file-receipt': RECEIPT });
    renderWithProviders(<AuthorizedEvidence claim={claimView()} />, chainEnv({ apiUrl: API }));
    const row = (await screen.findByRole('button', { name: /^Download\s+delivery_photo\.jpg$/ })).closest('li');
    if (row === null) throw new Error('row');
    await user.click(within(row).getByRole('button', { name: /^Check this file/ }));
    expect(await within(row).findByText('No match')).toBeInTheDocument();
  });

  it('warns when the service’s file list does not match the onchain root', async () => {
    withApi({ session: WALLETS.auditor.toLowerCase(), replies: authorizedReplies() });
    const claim = claimView();
    const altered: ClaimView = { ...claim, evidence: [{ ...claim.evidence[0]!, root: `0x${'00'.repeat(32)}` }] };
    renderWithProviders(<AuthorizedEvidence claim={altered} />, chainEnv({ apiUrl: API }));
    expect(await screen.findByText('File list altered')).toBeInTheDocument();
  });
});
