// =============================================================================
// Proof of Aid — Team 05 — Tests: HashDisplay truncation, full value, copy and explorer links
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { arbitrumSepolia } from 'viem/chains';
import { describe, expect, it, vi } from 'vitest';
import { renderWithConfig, testEnv } from '../test/testEnv';
import { copyText } from '../utils/clipboard';
import { HashDisplay } from './HashDisplay';

const TX_HASH = `0x3f2a${'0'.repeat(56)}1b73`;
const ADDRESS = '0x9A5055dde27365353c0a11168f9B5CF5d3E175b7';
const sepoliaEnv = testEnv({ chainKey: 'arbitrumSepolia', chain: arbitrumSepolia });

describe('HashDisplay', () => {
  it('shows the middle-truncated value in monospace', () => {
    renderWithConfig(<HashDisplay value={TX_HASH} label="transaction" />);
    const value = screen.getByText('0x3f2a…1b73');
    expect(value.tagName).toBe('CODE');
  });

  it('exposes the full value in the title', () => {
    renderWithConfig(<HashDisplay value={TX_HASH} label="transaction" />);
    expect(screen.getByTitle(TX_HASH)).toHaveTextContent('0x3f2a…1b73');
  });

  it('copies the full value, not the truncated one, and confirms it', async () => {
    const user = userEvent.setup();
    renderWithConfig(<HashDisplay value={TX_HASH} label="transaction" />);
    await user.click(screen.getByRole('button', { name: 'Copy transaction' }));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe(TX_HASH);
  });

  it('says the copy failed when the browser denies clipboard access', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    renderWithConfig(<HashDisplay value={TX_HASH} label="transaction" />);
    await user.click(screen.getByRole('button', { name: 'Copy transaction' }));
    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
  });

  it('links addresses and transactions to Arbiscan on Arbitrum Sepolia', () => {
    renderWithConfig(
      <>
        <HashDisplay value={ADDRESS} label="organization address" explorer="address" />
        <HashDisplay value={TX_HASH} label="transaction" explorer="tx" />
      </>,
      sepoliaEnv,
    );
    expect(screen.getByRole('link', { name: 'View organization address on Arbiscan' })).toHaveAttribute(
      'href',
      `https://sepolia.arbiscan.io/address/${ADDRESS}`,
    );
    expect(screen.getByRole('link', { name: 'View transaction on Arbiscan' })).toHaveAttribute(
      'href',
      `https://sepolia.arbiscan.io/tx/${TX_HASH}`,
    );
  });

  it('shows no explorer link on local anvil or for a value of the wrong kind', () => {
    renderWithConfig(<HashDisplay value={ADDRESS} label="organization address" explorer="address" />);
    renderWithConfig(<HashDisplay value={ADDRESS} label="transaction" explorer="tx" />, sepoliaEnv);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('copyText', () => {
  it('returns an error instead of throwing when the Clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyText('0x1')).resolves.toMatchObject({ ok: false });
  });
});
