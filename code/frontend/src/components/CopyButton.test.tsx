// =============================================================================
// Proof of Aid — Team 05 — Tests: copy buttons (full value, visible and announced result, failures)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithConfig } from '../test/testEnv';
import { AddressText } from './AddressText';
import { CopyButton } from './CopyButton';

const CLAIM_ID = `0x${'ab'.repeat(32)}`;
const ADDRESS = '0x9A5055dde27365353c0a11168f9B5CF5d3E175b7';

describe('CopyButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('copies the full value and announces "Copied" in a live region', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithConfig(<CopyButton value={CLAIM_ID} label="claim ID" />);
    await user.click(screen.getByRole('button', { name: 'Copy claim ID' }));
    expect(writeText).toHaveBeenCalledWith(CLAIM_ID);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Copied');
  });

  it('says "Copy failed" when the browser refuses, without throwing', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    renderWithConfig(<CopyButton value={CLAIM_ID} label="claim ID" />);
    await user.click(screen.getByRole('button', { name: 'Copy claim ID' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copy failed');
  });

  it('also fails gracefully on an error that is not a DOMException', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new TypeError('Document is not focused'));
    renderWithConfig(<CopyButton value={CLAIM_ID} label="claim ID" />);
    await user.click(screen.getByRole('button', { name: 'Copy claim ID' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copy failed');
  });

  it('gives inline addresses a copy button for the full address', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithConfig(<AddressText address={ADDRESS} />);
    expect(screen.getByTitle(ADDRESS)).toHaveTextContent('0x9A50…75b7');
    await user.click(screen.getByRole('button', { name: 'Copy address 0x9A50…75b7' }));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });
});
