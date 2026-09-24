// =============================================================================
// Proof of Aid — Team 05 — Tests: escrow card (deposits held, dispute window, settlement)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, screen } from '@testing-library/react';
import { parseEther } from 'viem';
import { describe, expect, it } from 'vitest';
import type { EscrowState } from '../types/claim';
import { formatTimestamp } from '../utils/format';
import { EscrowStatus } from './EscrowStatus';

const CLOSES_AT = Date.parse('2026-11-17T16:20:00Z') / 1000;

const escrow = (overrides: Partial<EscrowState> = {}): EscrowState => ({
  lockedWei: parseEther('0.0111'),
  disputeWindowClosesAt: CLOSES_AT,
  settled: false,
  ...overrides,
});

describe('EscrowStatus', () => {
  it('shows the deposits the contract holds, in ETH', () => {
    render(<EscrowStatus escrow={escrow()} now={CLOSES_AT - 1} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Deposits' })).toBeInTheDocument();
    expect(screen.getByText('0.0111 ETH')).toBeInTheDocument();
  });

  it('says until when disputes can be opened while the window is open', () => {
    render(<EscrowStatus escrow={escrow()} now={CLOSES_AT - 1} />);
    expect(screen.getByText(`Disputes open until ${formatTimestamp(CLOSES_AT)}`)).toBeInTheDocument();
    expect(screen.queryByText(/Dispute window closed/)).not.toBeInTheDocument();
  });

  it('says the dispute window is closed from its closing second on', () => {
    render(<EscrowStatus escrow={escrow()} now={CLOSES_AT} />);
    expect(screen.getByText(/^Dispute window closed/)).toBeInTheDocument();
    expect(screen.queryByText(/Disputes open until/)).not.toBeInTheDocument();
  });

  it('shows a settled claim, whose deposits were paid out', () => {
    render(<EscrowStatus escrow={escrow({ lockedWei: 0n, settled: true })} now={CLOSES_AT + 10} />);
    expect(screen.getByText('0 ETH')).toBeInTheDocument();
    expect(screen.getByText('Settled: the deposits were paid out.')).toBeInTheDocument();
  });

  it('leaves out the dispute window and settlement of a claim that was never verified', () => {
    render(<EscrowStatus escrow={escrow({ disputeWindowClosesAt: undefined })} />);
    expect(screen.getByText('0.0111 ETH')).toBeInTheDocument();
    expect(screen.queryByText(/Dispute/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Settled/)).not.toBeInTheDocument();
  });

  it('renders nothing when the escrow could not be read', () => {
    const { container } = render(<EscrowStatus escrow={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
