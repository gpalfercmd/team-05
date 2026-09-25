// =============================================================================
// Proof of Aid — Team 05 — Tests: salted notes are stored before the transaction, or handed to the author
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openClaim, renderAs } from '../../test/roleScreens';
import { API, stubEvidenceApi, type EvidenceApiScript } from '../../test/stubEvidenceApi';
import { CLAIM_ID, chainEnv, demoChainState, WALLETS } from '../../test/stubRegistryNode';
import { wallet } from '../../test/wagmiMock';
import { computeNoteHash, legacyNoteHash } from '../../utils/noteHash';
import { NOTE_KEPT_MESSAGE, NOTE_NOT_KEPT_MESSAGE } from './NoteReceipt';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../../test/wagmiMock')).wagmiHooks,
}));

const NOTE = 'Receipts match the delivery list.';
const NOTES_PATH = `POST /claims/${CLAIM_ID}/notes`;
const anchored = () =>
  demoChainState({ claims: { [CLAIM_ID]: { organization: WALLETS.organization, status: 'Anchored', roots: [CLAIM_ID] } } });

const storedReply = {
  status: 201,
  body: {
    id: 'n1',
    claim_id: CLAIM_ID,
    kind: 'justification',
    author: WALLETS.verifier1.toLowerCase(),
    note_hash: `0x${'aa'.repeat(32)}`,
    text: NOTE,
    salt: `0x${'bb'.repeat(32)}`,
    created_at: '2026-09-25T08:00:00Z',
  },
};

function withApi(script: Partial<EvidenceApiScript>) {
  const api = stubEvidenceApi({ session: WALLETS.verifier1.toLowerCase(), replies: {}, ...script });
  const fetch: typeof api.fetch = (input, init) =>
    input.includes('/public/claims') ? Promise.resolve(new Response(JSON.stringify({ items: [] }))) : api.fetch(input, init);
  vi.stubGlobal('fetch', fetch);
  const rendered = renderAs(WALLETS.verifier1, anchored(), chainEnv({ apiUrl: API }));
  return { ...rendered, requests: api.requests };
}

async function approve(user: ReturnType<typeof renderAs>['user']) {
  const panel = await openClaim(user, CLAIM_ID);
  await user.type(within(panel).getByLabelText('Justification'), `  ${NOTE}  `);
  await user.click(within(panel).getByRole('button', { name: 'Approve evidence' }));
  return panel;
}

const sentNoteHash = (): unknown => (wallet.written[0]?.args as unknown[] | undefined)?.[2];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('salted notes with the evidence service', () => {
  it('stores text and salt before the transaction and anchors the same salted fingerprint', async () => {
    const { user, requests } = withApi({ replies: { [NOTES_PATH]: storedReply } });
    const panel = await approve(user);
    expect(await within(panel).findByText(NOTE_KEPT_MESSAGE)).toBeInTheDocument();
    const stored = requests.find((request) => request.method === 'POST' && request.url.endsWith('/notes'));
    const body = stored?.body as { kind: string; text: string; salt: string; note_hash: string };
    expect(body.kind).toBe('justification');
    expect(body.text).toBe(NOTE);
    expect(computeNoteHash(body.salt, body.text)).toEqual({ ok: true, value: body.note_hash });
    expect(body.note_hash).not.toBe(legacyNoteHash(NOTE));
    expect(sentNoteHash()).toBe(body.note_hash);
    expect(stored?.credentials).toBe('include');
  });

  it('sends nothing when the note cannot be stored', async () => {
    const { user } = withApi({ replies: { [NOTES_PATH]: { status: 500, body: { detail: 'boom' } } } });
    const panel = await approve(user);
    expect(await within(panel).findByText(/The note could not be stored, so nothing was sent/)).toBeInTheDocument();
    expect(wallet.written).toEqual([]);
  });

  it('reuses the stored note when a rejected transaction is retried', async () => {
    const { user, requests } = withApi({ replies: { [NOTES_PATH]: storedReply } });
    wallet.write = 'rejected';
    const panel = await approve(user);
    await within(panel).findByText(/cancelled|rejected/i);
    wallet.write = 'sent';
    await user.click(within(panel).getByRole('button', { name: 'Approve evidence' }));
    await within(panel).findByText(NOTE_KEPT_MESSAGE);
    expect(requests.filter((request) => request.url.endsWith('/notes'))).toHaveLength(1);
    expect(wallet.written).toHaveLength(2);
    const noteArg = (index: number): unknown => (wallet.written[index]?.args as unknown[] | undefined)?.[2];
    expect(noteArg(1)).toBe(noteArg(0));
  });

  it('hands the note and salt to the author when the service has no record of the claim', async () => {
    const { user } = withApi({});
    const panel = await approve(user);
    expect(await within(panel).findByText(NOTE_NOT_KEPT_MESSAGE)).toBeInTheDocument();
    expect(wallet.written).toHaveLength(1);
  });
});

describe('salted notes without the evidence service', () => {
  it('still salts the fingerprint and shows the author the note and salt to keep', async () => {
    const { user } = renderAs(WALLETS.verifier1, anchored());
    const panel = await approve(user);
    expect(await within(panel).findByText(NOTE_NOT_KEPT_MESSAGE)).toBeInTheDocument();
    expect(within(panel).getByText(NOTE)).toBeInTheDocument();
    const salt = within(panel).getByRole('button', { name: /Copy note salt/ });
    expect(salt).toBeInTheDocument();
    expect(sentNoteHash()).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sentNoteHash()).not.toBe(legacyNoteHash(NOTE));
    expect(screen.getByRole('button', { name: 'Copy note and salt' })).toBeInTheDocument();
  });
});
