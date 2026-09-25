// =============================================================================
// Proof of Aid — Team 05 — Tests: organization screens (record a claim, answer a proof request)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { openClaim, renderAs } from '../../test/roleScreens';
import { API, LOGIN_MESSAGE, NEW_CLAIM_ID, NEW_METADATA_HASH, NEW_ROOT, stubEvidenceApi, type EvidenceApiScript } from '../../test/stubEvidenceApi';
import { CLAIM_ID, chainEnv, demoChainState, WALLETS, type StubChainState } from '../../test/stubRegistryNode';
import { wallet } from '../../test/wagmiMock';
import { NO_API_ANCHOR_NOTE } from './AnchorClaimForm';
import { NO_API_PROOF_NOTE } from './SubmitProofForm';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../../test/wagmiMock')).wagmiHooks,
}));

const params = { anchorDeposit: 10_100_000_000_000_000n, auditorDeposit: 1n, disputeBond: 1n, disputeWindow: 1n };
const receipt = new File(['receipt 001'], 'receipt-001.txt', { type: 'text/plain' });

function withApi(state: StubChainState, script: Partial<EvidenceApiScript> = {}) {
  const api = stubEvidenceApi({ session: undefined, replies: {}, ...script });
  // The indexer list is not under test here: an empty page keeps the workbench quiet.
  const fetch: typeof api.fetch = (input, init) =>
    input.includes('/public/claims') ? Promise.resolve(new Response(JSON.stringify({ items: [] }))) : api.fetch(input, init);
  vi.stubGlobal('fetch', fetch);
  const screenApi = renderAs(WALLETS.organization, state, chainEnv({ apiUrl: API }));
  return { ...screenApi, requests: api.requests };
}

async function fillClaim(user: UserEvent) {
  const form = await screen.findByRole('form', { name: 'Record a new claim' });
  await user.type(within(form).getByLabelText('Title'), '500 food kits delivered');
  await user.type(within(form).getByLabelText('Description'), 'Kits handed out at the community centre.');
  await user.type(within(form).getByLabelText('Region'), 'District X');
  await user.type(within(form).getByLabelText('Delivery date'), '2026-09-20');
  await user.upload(within(form).getByLabelText('Evidence files'), receipt);
  return form;
}

describe('organization: record a claim', () => {
  it('says honestly that recording needs the evidence service when no API is configured', async () => {
    renderAs(WALLETS.organization, demoChainState());
    expect(await screen.findByText(NO_API_ANCHOR_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Record a new claim' })).not.toBeInTheDocument();
  });

  it('signs in, saves the details, uploads the evidence, then anchors paying the contract’s deposit', async () => {
    const { user, requests } = withApi(demoChainState({ params }));
    const form = await fillClaim(user);
    await user.click(within(form).getByRole('button', { name: 'Record claim and lock 0.0101 ETH' }));
    const link = await within(form).findByRole('link', { name: 'Open its public page' });
    expect(link.closest('p')).toHaveTextContent('Claim 0xc1c1…c1c1 recorded.');
    expect(wallet.signed).toEqual([LOGIN_MESSAGE]);
    expect(requests.map((request) => `${request.method} ${request.url.replace(API, '')}`)).toEqual([
      'GET /auth/me',
      'POST /auth/challenge',
      'POST /auth/verify',
      'POST /claims',
      'GET /auth/me',
      `POST /claims/${NEW_CLAIM_ID}/evidence`,
    ]);
    expect(requests[5]?.body).toMatchObject({ public: 'false', root_index: '0' });
    expect(wallet.written[0]).toMatchObject({
      functionName: 'anchorClaim',
      args: [NEW_CLAIM_ID, NEW_ROOT, NEW_METADATA_HASH],
      value: 10_100_000_000_000_000n,
    });
    expect(link).toHaveAttribute('href', `/claims/${NEW_CLAIM_ID}`);
  });

  it('reuses an open session instead of asking for another signature', async () => {
    const { user } = withApi(demoChainState({ params }), { session: WALLETS.organization.toLowerCase() });
    const form = await fillClaim(user);
    await user.click(within(form).getByRole('button', { name: /Record claim/ }));
    await within(form).findByText(/recorded\./);
    expect(wallet.signed).toEqual([]);
  });

  it('validates every field before contacting anything', async () => {
    const { user, requests } = withApi(demoChainState({ params }));
    const form = await screen.findByRole('form', { name: 'Record a new claim' });
    await user.click(within(form).getByRole('button', { name: /Record claim/ }));
    expect(within(form).getByLabelText('Title')).toHaveAccessibleDescription('Give the claim a title.');
    expect(within(form).getByLabelText('Evidence files')).toHaveAccessibleDescription(/Add at least one evidence file\./);
    expect(requests.filter((request) => request.url.includes('/auth'))).toHaveLength(0);
  });

  it('keeps finished steps after a failed upload, and retries without creating a second claim', async () => {
    const script: Partial<EvidenceApiScript> = {
      session: WALLETS.organization.toLowerCase(),
      replies: { [`POST /claims/${NEW_CLAIM_ID}/evidence`]: { status: 413, body: { detail: 'file exceeds 25 MiB' } } },
    };
    const { user, requests } = withApi(demoChainState({ params }), script);
    const form = await fillClaim(user);
    await user.click(within(form).getByRole('button', { name: /Record claim/ }));
    const alert = await within(form).findByText(/HTTP 413: file exceeds 25 MiB/);
    expect(alert).toHaveFocus();
    expect(within(form).getByLabelText('Title')).toBeDisabled();
    delete script.replies?.[`POST /claims/${NEW_CLAIM_ID}/evidence`];
    await user.click(within(form).getByRole('button', { name: 'Retry' }));
    await within(form).findByText(/recorded\./);
    expect(requests.filter((request) => request.method === 'POST' && request.url === `${API}/claims`)).toHaveLength(1);
  });

  it('warns and blocks recording while the organization has no active internal verifier', async () => {
    withApi(demoChainState({ params, verifiers: {} }));
    const form = await screen.findByRole('form', { name: 'Record a new claim' });
    expect(await within(form).findByText(/no active internal verifier/)).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: /Record claim/ })).toBeDisabled();
  });

  it('lets a single-verifier organization record (one active verifier is enough to anchor)', async () => {
    withApi(demoChainState({ params, verifiers: { [WALLETS.verifier1]: WALLETS.organization } }));
    // The button names the deposit once the contract reads resolve; only then is the
    // verifier check meaningful.
    const button = await screen.findByRole('button', { name: /Record claim and lock/ });
    expect(button).not.toBeDisabled();
    const form = await screen.findByRole('form', { name: 'Record a new claim' });
    expect(within(form).queryByText(/no active internal verifier/)).not.toBeInTheDocument();
  });

  it('lists its own claims from the indexer', async () => {
    const own = { claimId: CLAIM_ID, organization: WALLETS.organization.toLowerCase(), status: 'Anchored' };
    const other = { claimId: NEW_CLAIM_ID, organization: WALLETS.stranger.toLowerCase(), status: 'Anchored' };
    vi.stubGlobal('fetch', (input: string) =>
      Promise.resolve(input.includes('/public/claims') ? new Response(JSON.stringify({ items: [own, other] })) : new Response('', { status: 401 })),
    );
    renderAs(WALLETS.organization, demoChainState(), chainEnv({ apiUrl: API }));
    expect(await screen.findByRole('button', { name: 'Show actions for claim 0xabab…abab' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show actions for claim 0xc1c1…c1c1' })).not.toBeInTheDocument();
  });
});

describe('organization: answer a proof request', () => {
  const requested = () =>
    demoChainState({
      claims: {
        [CLAIM_ID]: {
          organization: WALLETS.organization,
          status: 'ProofRequested',
          internalVerifier: WALLETS.verifier1,
          auditor: WALLETS.auditor,
          roots: [NEW_ROOT],
        },
      },
    });

  it('uploads the supplementary bundle at the next index and submits its root', async () => {
    const { user, requests } = withApi(requested(), { session: WALLETS.organization.toLowerCase() });
    const panel = await openClaim(user, CLAIM_ID);
    const form = within(panel).getByRole('form', { name: 'Submit supplementary proof' });
    await user.upload(within(form).getByLabelText('Evidence files'), receipt);
    await user.click(within(form).getByLabelText(/Make these files public/));
    await user.click(within(form).getByRole('button', { name: 'Submit proof' }));
    await within(panel).findByText('Done ✓ Supplementary proof submitted on Anvil.');
    expect(requests.at(-1)?.body).toMatchObject({ public: 'true', root_index: '1' });
    expect(wallet.written[0]).toMatchObject({ functionName: 'submitProof', args: [CLAIM_ID, NEW_ROOT] });
  });

  it('explains that submitting proof needs the evidence service without an API', async () => {
    const { user } = renderAs(WALLETS.organization, requested());
    const panel = await openClaim(user, CLAIM_ID);
    expect(panel).toHaveTextContent(NO_API_PROOF_NOTE);
  });
});
