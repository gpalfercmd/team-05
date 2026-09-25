// =============================================================================
// Proof of Aid — Team 05 — Tests: Registry Admin screen (register / revoke participants)
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

const form = (name: string) => screen.getByRole('form', { name });

describe('Registry Admin screen', () => {
  it('offers exactly the ParticipantRegistry functions the admin may call', async () => {
    renderAs(WALLETS.admin, demoChainState());
    await screen.findByRole('heading', { name: 'Registry Admin' });
    for (const name of ['Register an organization', 'Register an internal verifier', 'Revoke an organization', 'Revoke an internal verifier']) {
      expect(form(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole('form', { name: 'Accredit an auditor' })).not.toBeInTheDocument();
  });

  it('registers an internal verifier for an organization and clears the form once confirmed', async () => {
    const { user, simulated } = renderAs(WALLETS.admin, demoChainState());
    const register = await screen.findByRole('form', { name: 'Register an internal verifier' });
    await user.type(within(register).getByLabelText('Internal verifier wallet'), WALLETS.stranger.toLowerCase());
    await user.type(within(register).getByLabelText('Organization wallet'), WALLETS.organization);
    await user.click(within(register).getByRole('button', { name: 'Register internal verifier' }));
    expect(await within(register).findByText(/Done ✓/)).toBeInTheDocument();
    expect(simulated[0]).toMatchObject({ to: REGISTRIES.participantRegistry, from: WALLETS.admin, functionName: 'registerInternalVerifier' });
    expect(wallet.written[0]).toMatchObject({ functionName: 'registerInternalVerifier', args: [WALLETS.stranger, WALLETS.organization] });
    expect(within(register).getByLabelText('Internal verifier wallet')).toHaveValue('');
  });

  it('links an invalid address error to its input and sends nothing', async () => {
    const { user } = renderAs(WALLETS.admin, demoChainState());
    const register = await screen.findByRole('form', { name: 'Register an organization' });
    await user.type(within(register).getByLabelText('Organization wallet'), '0x1234');
    await user.click(within(register).getByRole('button', { name: 'Register organization' }));
    const input = within(register).getByLabelText('Organization wallet');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/That is not a wallet address/);
    expect(wallet.written).toHaveLength(0);
  });

  it('explains the one-role rule when the registry refuses a wallet', async () => {
    const { user } = renderAs(WALLETS.admin, demoChainState({ reverts: { registerOrganization: { errorName: 'AlreadyAccredited', args: [WALLETS.auditor] } } }));
    const register = await screen.findByRole('form', { name: 'Register an organization' });
    await user.type(within(register).getByLabelText('Organization wallet'), WALLETS.auditor);
    await user.click(within(register).getByRole('button', { name: 'Register organization' }));
    expect(await within(register).findByRole('alert')).toHaveTextContent('This wallet already has a role. Each wallet can hold only one role.');
  });
});
