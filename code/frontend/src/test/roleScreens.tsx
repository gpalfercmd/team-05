// =============================================================================
// Proof of Aid — Team 05 — Test helper: render the wallet panel as a role and open a claim in it
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { Address, Hex } from 'viem';
import { expect } from 'vitest';
import { WalletPanel } from '../components/wallet/WalletPanel';
import type { AppEnv } from '../config/env';
import { chainEnv, stubRegistryClient, type StubChainState } from './stubRegistryNode';
import { connectWallet, renderWithProviders } from './wagmiMock';

/** Connects `address` against a stub node holding `state` and renders the dashboard's wallet panel. */
export function renderAs(address: Address, state: StubChainState, env: AppEnv = chainEnv()) {
  const stub = stubRegistryClient(state);
  connectWallet(address, stub.client);
  const view = renderWithProviders(<WalletPanel />, env);
  return { ...stub, view, user: userEvent.setup() };
}

/** Pastes a claim ID into the workbench and returns the claim's panel once it has loaded. */
export async function openClaim(user: UserEvent, claimId: Hex): Promise<HTMLElement> {
  await user.type(await screen.findByLabelText('Work on a claim by its ID'), claimId);
  await user.click(screen.getByRole('button', { name: 'Show actions' }));
  const heading = await screen.findByRole('heading', { level: 4, name: /^Claim 0x/ });
  const panel = heading.closest('section');
  if (panel === null) {
    throw new Error('The claim heading must sit in its panel.');
  }
  await waitFor(() => expect(within(panel).queryByText('Reading this claim from the blockchain…')).not.toBeInTheDocument());
  return panel;
}
