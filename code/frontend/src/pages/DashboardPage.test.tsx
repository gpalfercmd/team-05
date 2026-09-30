// =============================================================================
// Proof of Aid — Team 05 — Tests: the redesigned home page (hero, sample claim cards, three-step explainer)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MOCK_CLAIMS } from '../mocks/claims';
import { renderRoute } from '../test/renderRoute';

const HEADLINE = 'Check aid claims without exposing people';

describe('DashboardPage', () => {
  it('states the Valencia case in one line and leads with looking up a claim', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: HEADLINE });
    expect(screen.getByText(/Anyone can check that its proof was never changed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Look up a claim' })).toHaveAttribute('href', '/claims');
  });

  it('labels the hero picture as an illustration, not as a live record', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: HEADLINE });
    const figure = screen.getByRole('figure');
    expect(within(figure).getByText(/Illustration/)).toBeInTheDocument();
    expect(within(figure).getByText('Match')).toBeInTheDocument();
  });

  it('shows how far each sample claim got, in text as well as in the bar', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: HEADLINE });
    const progress = screen.getAllByRole('img', { name: /of 4 steps done/ });
    expect(progress).toHaveLength(MOCK_CLAIMS.length);
    expect(progress.map((node) => node.getAttribute('aria-label'))).toContain('4 of 4 steps done');
    expect(progress.map((node) => node.getAttribute('aria-label'))).toContain('1 of 4 steps done');
  });

  it('explains the path in three steps: anchor, two-stage review, anyone verifies', async () => {
    renderRoute('/');
    const list = (await screen.findByRole('heading', { level: 2, name: 'How tracking works' })).closest('section')?.querySelector('ol');
    expect(list).not.toBeNull();
    const steps = within(list as HTMLElement).getAllByRole('listitem');
    expect(steps.map((step) => within(step).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Anchor the fingerprint',
      'Two-stage review',
      'Anyone verifies',
    ]);
  });
});
