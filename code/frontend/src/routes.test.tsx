// =============================================================================
// Proof of Aid — Team 05 — Smoke tests: routes render inside the real provider stack
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { WagmiProvider } from 'wagmi';
import type { AppEnv } from './config/env';
import { createWagmiConfig } from './config/wagmi';
import { AppConfigContext } from './context/appConfigContext';
import { MOCK_CLAIMS } from './mocks/claims';
import { routes } from './routes';
import { testEnv } from './test/testEnv';

const verifiedClaim = MOCK_CLAIMS.find((claim) => claim.status === 'Verified');
if (verifiedClaim === undefined) {
  throw new Error('The demo data must include a Verified claim.');
}

const chainEnv = testEnv({
  contracts: {
    mode: 'chain',
    claimRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    participantRegistry: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    deployBlock: 0n,
  },
});

function renderRoute(path: string, env: AppEnv = testEnv()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppConfigContext value={env}>
      <WagmiProvider config={createWagmiConfig(env)}>
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </WagmiProvider>
    </AppConfigContext>,
  );
}

describe('routes', () => {
  it('renders the dashboard with the shell, the demo notice and sample claims', async () => {
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Check aid claims without exposing people' })).toBeInTheDocument();
    expect(screen.getByText('Public visitor')).toBeInTheDocument();
    expect(screen.getByText('Demo data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open and verify' })).toHaveLength(MOCK_CLAIMS.length);
  });

  it('keeps the role screens off the home page and links to the workspace instead', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: 'Check aid claims without exposing people' });
    expect(screen.queryByRole('heading', { name: 'Your wallet' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo data: role actions need a real chain/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open your workspace' })).toHaveAttribute('href', '/workspace');
  });

  it('renders the workspace page with the role screens', async () => {
    renderRoute('/workspace');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your workspace' })).toBeInTheDocument();
    expect(screen.getByText(/Demo data: role actions need a real chain/)).toBeInTheDocument();
  });

  it('shows a demo claim on its public page with its status and fingerprints', async () => {
    renderRoute(`/claims/${verifiedClaim.claimId}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Claim record' })).toBeInTheDocument();
    // The claim loads through the data source (react-query), so wait for it.
    const status = await screen.findByRole('heading', { level: 2, name: 'Current status' });
    expect(status.closest('section')).toHaveTextContent('Verified');
    expect(screen.getByTitle(verifiedClaim.claimId)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Original evidence' })).toBeInTheDocument();
  });

  it('explains a malformed claim ID instead of looking it up', async () => {
    renderRoute('/claims/not-a-claim');
    expect(await screen.findByText('This link does not contain a valid claim ID.')).toBeInTheDocument();
  });

  it('says so when a well-formed claim ID is not in the demo data', async () => {
    renderRoute(`/claims/0x${'1'.repeat(64)}`);
    expect(await screen.findByText('No claim with this ID has been recorded.')).toBeInTheDocument();
  });

  it('hides the demo notice and demo claims once contract addresses are configured', async () => {
    renderRoute('/', chainEnv);
    expect(await screen.findByRole('heading', { level: 1, name: 'Check aid claims without exposing people' })).toBeInTheDocument();
    expect(screen.queryByText('Demo data')).not.toBeInTheDocument();
    expect(screen.queryByText('Sample claims')).not.toBeInTheDocument();
  });

  it('offers the demo claim and a claim lookup on a real chain', async () => {
    renderRoute('/', chainEnv);
    const demoLinks = await screen.findAllByRole('link', { name: /demo claim/i });
    expect(demoLinks.length).toBeGreaterThan(0);
    for (const link of demoLinks) {
      expect(link).toHaveAttribute('href', '/claims/0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28');
    }
    expect(screen.getByRole('textbox', { name: 'Look up a claim by its ID' })).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', async () => {
    renderRoute('/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});
