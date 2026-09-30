// =============================================================================
// Proof of Aid — Team 05 — Tests: the /workspace route, its states and "What needs your action"
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { arbitrumSepolia } from 'viem/chains';
import type { Address } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_API_ACTIONS_NOTE, NOTHING_TO_DO } from '../components/wallet/ActionList';
import { DEMO_ACTIONS_NOTE } from '../components/wallet/WalletPanel';
import { renderRoute } from '../test/renderRoute';
import { CLAIM_ID, chainEnv, demoChainState, stubRegistryClient, WALLETS, type StubChainState } from '../test/stubRegistryNode';
import { testEnv } from '../test/testEnv';
import { connectWallet } from '../test/wagmiMock';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../test/wagmiMock')).wagmiHooks,
}));

const API = 'http://api.test';

/** The indexer lists every claim of `state` under its status; the claim itself is re-read from the stub node. */
function stubIndexer(state: StubChainState) {
  vi.stubGlobal('fetch', (input: string) => {
    const status = new URL(input).searchParams.get('status');
    const items = Object.entries(state.claims)
      .filter(([, claim]) => status === null || claim.status === status)
      .map(([claimId, claim]) => ({ claimId, organization: claim.organization.toLowerCase(), status: claim.status }));
    return Promise.resolve(new Response(JSON.stringify({ items })));
  });
}

function openWorkspace(address: Address | undefined, state: StubChainState, withApi: boolean, path = '/workspace') {
  if (withApi) {
    stubIndexer(state);
  }
  connectWallet(address, address === undefined ? undefined : stubRegistryClient(state).client);
  renderRoute(path, chainEnv(withApi ? { apiUrl: API } : {}));
}

const proofSubmitted = (): StubChainState =>
  demoChainState({
    claims: { [CLAIM_ID]: { organization: WALLETS.organization, status: 'ProofSubmitted', internalVerifier: WALLETS.verifier1, roots: [CLAIM_ID, CLAIM_ID] } },
  });

describe('/workspace', () => {
  beforeEach(() => connectWallet(undefined, undefined));
  afterEach(() => vi.unstubAllGlobals());

  it('is its own page with the role screens, read-only on demo data', async () => {
    renderRoute('/workspace', testEnv());
    expect(await screen.findByRole('heading', { level: 1, name: 'Your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Role screens' })).toBeInTheDocument();
    expect(screen.getByText(DEMO_ACTIONS_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What needs your action' })).not.toBeInTheDocument();
  });

  it('explains who does what before anyone connects a wallet', async () => {
    renderRoute('/workspace', testEnv());
    expect(await screen.findByRole('heading', { level: 2, name: 'Who does what' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3, name: 'Auditor' })).toHaveLength(1);
  });

  it('asks a visitor to connect, with a connect button on the page', async () => {
    openWorkspace(undefined, demoChainState(), false);
    expect(await screen.findByText(/Connect your wallet to see the actions for your role/)).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Role screens' });
    expect(within(section).getByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();
  });

  it('shows no to-do list on the wrong network, only the switch', async () => {
    stubIndexer(demoChainState());
    connectWallet(WALLETS.verifier1, stubRegistryClient(demoChainState()).client, arbitrumSepolia.id);
    renderRoute('/workspace', chainEnv({ apiUrl: API }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong network');
    expect(screen.queryByRole('heading', { name: 'What needs your action' })).not.toBeInTheDocument();
  });

  it('says the list needs the indexer when no API is configured', async () => {
    openWorkspace(WALLETS.verifier2, proofSubmitted(), false);
    expect(await screen.findByRole('heading', { level: 2, name: 'What needs your action' })).toBeInTheDocument();
    expect(screen.getByText(NO_API_ACTIONS_NOTE)).toBeInTheDocument();
  });

  it('lists the proof a second verifier may confirm, linking to its actions', async () => {
    openWorkspace(WALLETS.verifier2, proofSubmitted(), true);
    const list = await screen.findByRole('region', { name: 'What needs your action' });
    expect(await within(list).findByText('Confirm the supplementary proof.')).toBeInTheDocument();
    expect(within(list).getByText('1 waiting')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open actions for claim 0xabab…abab' })).toHaveAttribute('href', `/workspace?claim=${CLAIM_ID}`);
    expect(within(list).getByRole('link', { name: 'Public page of claim 0xabab…abab' })).toHaveAttribute('href', `/claims/${CLAIM_ID}`);
  });

  it('does not list that proof for the verifier who approved checkpoint 1', async () => {
    openWorkspace(WALLETS.verifier1, proofSubmitted(), true);
    const list = await screen.findByRole('region', { name: 'What needs your action' });
    expect(await within(list).findByText(NOTHING_TO_DO)).toBeInTheDocument();
  });

  it('gives a wallet without a role the public view, with funds to withdraw', async () => {
    openWorkspace(WALLETS.stranger, demoChainState({ credits: { [WALLETS.stranger]: 10n ** 16n } }), true);
    expect(await screen.findByText(/This wallet has no registered role/)).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'What needs your action' });
    expect(await within(list).findByText('0.01 ETH')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Withdraw' })).toHaveAttribute('href', '#withdraw-heading');
    expect(within(list).queryByText(NOTHING_TO_DO)).not.toBeInTheDocument();
  });

  it('opens the claim from ?claim= in the role screens', async () => {
    openWorkspace(WALLETS.verifier2, proofSubmitted(), false, `/workspace?claim=${CLAIM_ID}`);
    const heading = await screen.findByRole('heading', { level: 4, name: /^Claim 0xabab/ });
    const panel = heading.closest('section');
    expect(panel).not.toBeNull();
    expect(await within(panel as HTMLElement).findByRole('button', { name: 'Accept proof' })).toBeInTheDocument();
  });
});
