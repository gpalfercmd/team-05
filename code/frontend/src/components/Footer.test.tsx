// =============================================================================
// Proof of Aid — Team 05 — Tests: site footer (brand, page links and the honest data-source line)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/renderRoute';

describe('Footer', () => {
  it('offers the pages as a labelled navigation, not only as loose links in a sentence', async () => {
    renderRoute('/');
    const nav = await screen.findByRole('navigation', { name: 'Footer' });
    expect(within(nav).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['How it works', '/#how-it-works'],
      ['Claims', '/claims'],
      ['Workspace', '/workspace'],
    ]);
  });

  it('says demo data in demo mode and keeps the tagline', async () => {
    renderRoute('/');
    const footer = (await screen.findByText(/check aid claims without exposing people\./i, { selector: 'footer *' })).closest('footer');
    expect(footer).toHaveTextContent('Demo data: sample records, not read from a blockchain.');
  });
});
