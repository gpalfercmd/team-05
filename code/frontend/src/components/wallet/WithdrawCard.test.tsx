// =============================================================================
// Proof of Aid — Team 05 — Tests: withdraw button for wallets with credits
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderAs } from '../../test/roleScreens';
import { demoChainState, REGISTRIES, WALLETS } from '../../test/stubRegistryNode';
import { wallet } from '../../test/wagmiMock';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../../test/wagmiMock')).wagmiHooks,
}));

describe('WithdrawCard', () => {
  it('shows the credited amount and withdraws it', async () => {
    const { user } = renderAs(WALLETS.organization, demoChainState({ credits: { [WALLETS.organization]: 10_500_000_000_000_000n } }));
    const card = (await screen.findByRole('heading', { name: 'Funds waiting for you' })).closest('section') as HTMLElement;
    expect(card).toHaveTextContent('The contract holds 0.0105 ETH for this wallet');
    await user.click(within(card).getByRole('button', { name: 'Withdraw 0.0105 ETH' }));
    await within(card).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ address: REGISTRIES.claimRegistry, functionName: 'withdraw', args: [] });
  });

  it('is shown to any wallet with credits, even without a role', async () => {
    renderAs(WALLETS.stranger, demoChainState({ credits: { [WALLETS.stranger]: 1_000_000_000_000_000n } }));
    expect(await screen.findByRole('button', { name: 'Withdraw 0.001 ETH' })).toBeInTheDocument();
  });

  it('stays hidden when nothing is owed', async () => {
    renderAs(WALLETS.auditor, demoChainState());
    await screen.findByText(/Role:/);
    expect(screen.queryByRole('heading', { name: 'Funds waiting for you' })).not.toBeInTheDocument();
  });

  it('decodes a refused withdrawal', async () => {
    const { user } = renderAs(
      WALLETS.organization,
      demoChainState({ credits: { [WALLETS.organization]: 5n }, reverts: { withdraw: { errorName: 'NothingToWithdraw', args: [WALLETS.organization] } } }),
    );
    await user.click(await screen.findByRole('button', { name: /^Withdraw/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This wallet has no funds waiting to be withdrawn.');
  });
});
