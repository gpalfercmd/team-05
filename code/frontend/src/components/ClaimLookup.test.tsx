// =============================================================================
// Proof of Aid — Team 05 — Tests: claim lookup validates the ID before navigating
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ClaimLookup } from './ClaimLookup';

const CLAIM_ID = `0x${'AB'.repeat(32)}`;

function renderLookup() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <ClaimLookup /> },
      { path: '/claims/:claimId', element: <p>claim page</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ClaimLookup', () => {
  it('explains the format and stays on the page for a malformed ID', async () => {
    const router = renderLookup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Look up a claim by its ID' }), '0x1234');
    await userEvent.click(screen.getByRole('button', { name: 'Open claim' }));
    expect(screen.getByText(/That is not a claim ID/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('opens the claim page for a valid ID, trimmed and lower-cased', async () => {
    const router = renderLookup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Look up a claim by its ID' }), `  ${CLAIM_ID} `);
    await userEvent.click(screen.getByRole('button', { name: 'Open claim' }));
    expect(await screen.findByText('claim page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/claims/${CLAIM_ID.toLowerCase()}`);
  });
});
