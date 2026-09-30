// =============================================================================
// Proof of Aid — Team 05 — Tests: the claim page's progress stepper, headline verdict and evidence grouping
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MOCK_CLAIMS } from '../mocks/claims';
import { renderRoute } from '../test/renderRoute';

const anchored = MOCK_CLAIMS.find((claim) => claim.status === 'Anchored');
const verified = MOCK_CLAIMS.find((claim) => claim.status === 'Verified');
if (anchored === undefined || verified === undefined) {
  throw new Error('The demo data must include an Anchored and a Verified claim.');
}

async function openClaim(claimId: string) {
  renderRoute(`/claims/${claimId}`);
  return screen.findByRole('list', { name: 'Claim progress' });
}

const steps = (list: HTMLElement) => within(list).getAllByRole('listitem');

describe('claim progress stepper', () => {
  it('walks a verified claim through all five steps, with the state written out', async () => {
    const list = await openClaim(verified.claimId);
    const items = steps(list);
    expect(items.map((item) => item.querySelector('.stepper__label')?.textContent)).toEqual([
      'Anchored',
      'Internal review',
      'Auditor',
      'Verified',
      expect.stringMatching(/Dispute window|Settled/),
    ]);
    for (const item of items.slice(0, 4)) {
      expect(item).toHaveTextContent('Done');
    }
  });

  it('marks where an anchored claim is waiting, for assistive technology too', async () => {
    const list = await openClaim(anchored.claimId);
    const items = steps(list);
    expect(items[0]).toHaveTextContent('Done');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('Waiting here');
    expect(items[3]).toHaveTextContent('Not reached yet');
  });

  it('puts the status badge next to the verdict, above the fold', async () => {
    await openClaim(verified.claimId);
    const header = screen.getByRole('heading', { level: 1 }).closest('.page__header') as HTMLElement;
    expect(within(header).getByText('Verified', { selector: '.status-badge span' })).toBeInTheDocument();
  });

  it('groups the file check and the evidence under one heading', async () => {
    await openClaim(verified.claimId);
    const group = screen.getByRole('heading', { level: 2, name: 'Check the evidence' }).closest('section') as HTMLElement;
    expect(within(group).getByRole('heading', { level: 2, name: 'Verify it yourself' })).toBeInTheDocument();
    expect(within(group).getByRole('heading', { level: 2, name: 'Evidence' })).toBeInTheDocument();
  });
});
