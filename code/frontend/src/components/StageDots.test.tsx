// =============================================================================
// Proof of Aid — Team 05 — Tests: StageDots, the four-segment progress of a claim card
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageDots } from './StageDots';

describe('StageDots', () => {
  it('reads as text: how many of the four steps are done', () => {
    render(<StageDots status="InternallyVerified" />);
    const bar = screen.getByRole('img', { name: '2 of 4 steps done' });
    expect(bar.querySelectorAll('[data-done="true"]')).toHaveLength(2);
    expect(bar.querySelectorAll('[data-done="false"]')).toHaveLength(2);
  });
});
