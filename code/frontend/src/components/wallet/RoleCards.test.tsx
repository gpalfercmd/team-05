// =============================================================================
// Proof of Aid — Team 05 — Tests: RoleCards, one card per participant role with the viewer's own marked
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROLE_LABELS } from '../../utils/roles';
import { RoleCards } from './RoleCards';

describe('RoleCards', () => {
  it('lists every role once, each with what it does', () => {
    render(<RoleCards current={undefined} />);
    const cards = screen.getAllByRole('listitem');
    expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual(Object.values(ROLE_LABELS));
    expect(screen.queryByText('Your role')).not.toBeInTheDocument();
  });

  it('marks the connected wallet’s role in text, not only by colour', () => {
    render(<RoleCards current="internalVerifier" />);
    const marked = screen.getByText('Your role').closest('li') as HTMLElement;
    expect(within(marked).getByRole('heading', { level: 3 })).toHaveTextContent('Internal verifier');
    expect(marked).toHaveAttribute('aria-current', 'true');
  });
});
