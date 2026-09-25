// =============================================================================
// Proof of Aid — Team 05 — Tests: simulate → sign → receipt lifecycle, revert decoding, focus
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { arbitrumSepolia } from 'viem/chains';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settleCall } from '../chain/calls';
import { TxButton } from '../components/wallet/TxButton';
import { TxStatus } from '../components/wallet/TxStatus';
import { CLAIM_ID, demoChainState, REGISTRIES, stubRegistryClient, WALLETS, type StubChainState } from '../test/stubRegistryNode';
import { connectWallet, renderWithProviders, TX_HASH, wallet } from '../test/wagmiMock';
import { useContractAction } from './useContractAction';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../test/wagmiMock')).wagmiHooks,
}));

function Harness() {
  const action = useContractAction();
  return (
    <>
      <TxButton label="Settle" phase={action.phase} active busy={action.busy} onClick={() => void action.run(settleCall(REGISTRIES, CLAIM_ID))} />
      <TxStatus phase={action.phase} />
    </>
  );
}

function setup(state: StubChainState = demoChainState()) {
  const stub = stubRegistryClient(state);
  connectWallet(WALLETS.stranger, stub.client);
  renderWithProviders(<Harness />);
  return { ...stub, user: userEvent.setup() };
}

describe('useContractAction', () => {
  beforeEach(() => connectWallet(undefined, undefined));

  it('simulates first, then signs with the connected wallet on the configured chain and confirms', async () => {
    const { user, simulated } = setup();
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    expect(await screen.findByText(/Done ✓ Recorded on Anvil\./)).toBeInTheDocument();
    expect(simulated).toEqual([expect.objectContaining({ functionName: 'settle', from: WALLETS.stranger, args: [CLAIM_ID] })]);
    expect(wallet.written).toEqual([expect.objectContaining({ functionName: 'settle', account: WALLETS.stranger, chainId: 31337 })]);
    expect(screen.getByTitle(TX_HASH)).toHaveTextContent('0x7a7a');
  });

  it('moves focus to the outcome once the transaction ends', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    await screen.findByText(/Done ✓/);
    await waitFor(() => expect(document.activeElement).toHaveClass('tx-status--confirmed'));
  });

  it('keeps the button disabled with the lifecycle label while waiting for the wallet', async () => {
    const { user } = setup();
    wallet.write = 'pending';
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    const button = await screen.findByRole('button', { name: 'Confirm in wallet…' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Confirm the transaction in your wallet…')).toBeInTheDocument();
  });

  it('shows the recording state with the transaction while the receipt is pending', async () => {
    const { user } = setup();
    wallet.receipt = 'pending';
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    expect(await screen.findByRole('button', { name: 'Recording on blockchain…' })).toBeDisabled();
    expect(screen.getByText('Recording on Anvil…')).toBeInTheDocument();
  });

  it('decodes a contract revert into plain English and never asks the wallet to sign', async () => {
    const { user } = setup(demoChainState({ reverts: { settle: { errorName: 'DisputeWindowOpen', args: [CLAIM_ID, 5n] } } }));
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This claim can only be settled once its dispute window has closed.');
    expect(wallet.written).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Settle' })).toBeEnabled();
  });

  it('explains a request cancelled in the wallet', async () => {
    const { user } = setup();
    wallet.write = 'rejected';
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You cancelled the request in your wallet. Nothing was recorded.');
  });

  it('reports a mined transaction that reverted', async () => {
    const { user } = setup();
    wallet.receipt = 'reverted';
    await user.click(screen.getByRole('button', { name: 'Settle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('the contract refused it');
  });

  it('refuses to sign on the wrong network', async () => {
    const stub = stubRegistryClient(demoChainState());
    connectWallet(WALLETS.stranger, stub.client, arbitrumSepolia.id);
    renderWithProviders(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Settle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your wallet is on another network.');
    expect(stub.simulated).toHaveLength(0);
    expect(wallet.written).toHaveLength(0);
  });
});
