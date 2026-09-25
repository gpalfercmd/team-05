// =============================================================================
// Proof of Aid — Team 05 — Tests: header navigation (home sections and the workspace page)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/renderRoute';

const nav = async () => screen.findByRole('navigation', { name: 'Main' });

describe('Header', () => {
  it('links to the home sections and to the workspace page, no longer to a wallet section', async () => {
    renderRoute('/');
    const links = within(await nav()).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['How it works', '/#how-it-works'],
      ['Claims', '/#claims'],
      ['Workspace', '/workspace'],
    ]);
    expect(screen.queryByRole('link', { name: 'Your wallet' })).not.toBeInTheDocument();
  });

  it('marks Workspace as the current page on /workspace only', async () => {
    renderRoute('/workspace');
    expect(within(await nav()).getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark Workspace on the home page', async () => {
    renderRoute('/');
    expect(within(await nav()).getByRole('link', { name: 'Workspace' })).not.toHaveAttribute('aria-current');
  });
});
