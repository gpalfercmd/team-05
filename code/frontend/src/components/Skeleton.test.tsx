// =============================================================================
// Proof of Aid — Team 05 — Tests: skeleton loading states (busy, labelled, shaped like the content)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/renderRoute';
import { chainEnv, demoChainState, stubRegistryClient, WALLETS } from '../test/stubRegistryNode';
import { connectWallet } from '../test/wagmiMock';
import { Skeleton } from './Skeleton';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../test/wagmiMock')).wagmiHooks,
}));

// The claim page reads through this source; a pending promise keeps it loading.
vi.mock('../data/createClaimSource', () => ({
  createClaimSource: () => ({ kind: 'chain', getClaim: () => new Promise(() => undefined) }),
}));

describe('Skeleton', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a labelled busy status whose lines are hidden from assistive technology', () => {
    const { container } = render(<Skeleton label="Loading the claim list" rows={2} title={false} variant="row" />);
    const status = screen.getByRole('status', { name: 'Loading the claim list' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading the claim list…');
    const lines = container.querySelectorAll('.skeleton__block--row');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('draws the claim page as its cards while the claim loads', async () => {
    connectWallet(undefined, undefined);
    renderRoute(`/claims/0x${'42'.repeat(32)}`, chainEnv());
    const status = await screen.findByRole('status', { name: 'Reading this claim' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelectorAll('.card')).toHaveLength(3);
  });

  it('shows skeletons for the to-do list and the claim queue while the indexer answers', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    connectWallet(WALLETS.verifier1, stubRegistryClient(demoChainState()).client);
    renderRoute('/workspace', chainEnv({ apiUrl: 'http://api.test' }));
    const todo = await screen.findByRole('status', { name: 'Finding the claims that wait for you' });
    expect(todo).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('status', { name: 'Loading the claim list' })).toHaveAttribute('aria-busy', 'true');
  });
});
