// =============================================================================
// Proof of Aid — Team 05 — Tests: wallet panel states and role detection from the registry
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { arbitrumSepolia } from 'viem/chains';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleBanner } from '../RoleBanner';
import { demoChainState, stubRegistryClient, WALLETS } from '../../test/stubRegistryNode';
import { testEnv } from '../../test/testEnv';
import { connectWallet, renderWithProviders, wallet } from '../../test/wagmiMock';
import { DEMO_ACTIONS_NOTE, WalletPanel } from './WalletPanel';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../../test/wagmiMock')).wagmiHooks,
}));

const renderPanel = (demo = false) =>
  renderWithProviders(
    <>
      <RoleBanner />
      <WalletPanel />
    </>,
    demo ? testEnv() : undefined,
  );

describe('WalletPanel', () => {
  beforeEach(() => connectWallet(undefined, undefined));

  it('asks a visitor to connect, and says checking evidence needs no wallet', () => {
    renderPanel();
    expect(screen.getByText(/Connect your wallet to see the actions for your role/)).toBeInTheDocument();
    expect(screen.getByText('Public visitor')).toBeInTheDocument();
  });

  it('keeps demo mode read-only: actions need a real chain', () => {
    connectWallet(WALLETS.admin, undefined);
    renderPanel(true);
    expect(screen.getByText(DEMO_ACTIONS_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [WALLETS.admin, 'Registry Admin'],
    [WALLETS.authority, 'Accreditation Authority'],
    [WALLETS.organization, 'Organization'],
    [WALLETS.verifier1, 'Internal verifier'],
    [WALLETS.auditor, 'Auditor'],
  ] as const)('reads %s’s role from the ParticipantRegistry: %s', async (address, label) => {
    connectWallet(address, stubRegistryClient(demoChainState()).client);
    renderPanel();
    // Once in the RoleBanner, once in the panel ("Role: …").
    await waitFor(() => expect(screen.getAllByText(label, { selector: 'strong' })).toHaveLength(2));
  });

  it('tells a wallet without a role what it can still do', async () => {
    connectWallet(WALLETS.stranger, stubRegistryClient(demoChainState()).client);
    renderPanel();
    expect(await screen.findByText(/This wallet has no registered role/)).toBeInTheDocument();
  });

  it('explains a failed role read instead of guessing a role', async () => {
    connectWallet(WALLETS.admin, stubRegistryClient(demoChainState({ failReads: true })).client);
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role could not be read from the blockchain.');
  });

  it('blocks every action on the wrong network and offers to switch', async () => {
    connectWallet(WALLETS.admin, stubRegistryClient(demoChainState()).client, arbitrumSepolia.id);
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent(`Wrong network: your wallet is on chain ID ${arbitrumSepolia.id}`);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch to Anvil' }));
    expect(wallet.switched).toEqual([31337]);
  });
});
