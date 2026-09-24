// =============================================================================
// Proof of Aid — Team 05 — Tests: "What was claimed" card for match, mismatch and nothing to check
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MetadataCheck } from '../data/claimMetadata';
import { MockClaimSource } from '../data/mockClaimSource';
import { FULL_STORY_CLAIM_ID } from '../mocks/claims';
import type { ClaimView } from '../types/claim';
import { renderWithConfig } from '../test/testEnv';
import { ClaimMetadata } from './ClaimMetadata';

async function fullStory(): Promise<ClaimView> {
  const view = await new MockClaimSource().getClaim(FULL_STORY_CLAIM_ID);
  if (!view.ok) {
    throw new Error('The demo data must contain the full-story claim.');
  }
  return view.value;
}

async function renderWith(metadata?: MetadataCheck) {
  const claim = await fullStory();
  renderWithConfig(<ClaimMetadata claim={metadata === undefined ? claim : { ...claim, metadata }} />);
  const card = screen.getByRole('heading', { level: 2, name: 'What was claimed' }).closest('section');
  if (card === null) {
    throw new Error('No card');
  }
  return card;
}

describe('ClaimMetadata (P8.4)', () => {
  it('shows the checked title, description, region and date with a match note', async () => {
    const card = await renderWith();
    expect(within(card).getByRole('heading', { level: 3, name: '500 food kits delivered in district X' })).toBeInTheDocument();
    expect(card).toHaveTextContent(/Food kits \(rice, oil, lentils\) for 500 households/);
    expect(card).toHaveTextContent('RegionDistrict X');
    expect(card).toHaveTextContent('Date of the aid2026-09-12');
    expect(within(card).getByText('Title and description match the blockchain record.')).toBeInTheDocument();
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the served text and warns when it does not match the blockchain record', async () => {
    const computedHash = `0x${'ab'.repeat(32)}` as const;
    const card = await renderWith({ state: 'mismatch', computedHash, detail: 'The fingerprint of the served text differs from the recorded one.' });
    expect(within(card).getByRole('alert')).toHaveTextContent(
      /Warning: the title and description sent by the server do not match the blockchain record, so they are not shown\./,
    );
    expect(within(card).queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent('food kits delivered');
    expect(card).toHaveTextContent('Fingerprint of the text sent by the server');
    expect(within(card).queryByText('Title and description match the blockchain record.')).not.toBeInTheDocument();
  });

  it('warns without a computed fingerprint when the served text cannot even be encoded', async () => {
    const card = await renderWith({ state: 'mismatch', computedHash: undefined, detail: 'The title and the region must be a single line.' });
    expect(within(card).getByRole('alert')).toHaveTextContent(/single line/);
    expect(card).not.toHaveTextContent('Fingerprint of the text sent by the server');
  });

  it('says when the server has nothing to check', async () => {
    const card = await renderWith({ state: 'not-published', detail: 'HTTP 404' });
    expect(card).toHaveTextContent('The server has no title or description for this claim, so there is nothing to check.');
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says honestly that chain-only mode has no text to show', async () => {
    const card = await renderWith({ state: 'not-configured' });
    expect(card).toHaveTextContent(/This page reads only the blockchain, which keeps a fingerprint of the claim’s title and description/);
    expect(card).toHaveTextContent('Recorded fingerprint of the title and description');
  });
});
