// =============================================================================
// Proof of Aid — Team 05 — Tests: StatusBadge shows the DESIGN.md label and icon per status
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RECORDED_CLAIM_STATUSES, type RecordedClaimStatus } from '../utils/claimStatus';
import { StatusBadge } from './StatusBadge';

// Copied from the DESIGN.md `status` tokens on purpose: the test checks the code against the
// design document, not against the map it is trying to verify.
const DESIGN_STATUS: ReadonlyArray<[RecordedClaimStatus, string, string]> = [
  ['Anchored', 'Anchored', 'anchor'],
  ['InternallyVerified', 'Internally verified', 'user-check'],
  ['ProofRequested', 'Proof requested', 'help-circle'],
  ['ProofSubmitted', 'Proof submitted', 'file-plus'],
  ['Verified', 'Verified', 'shield-check'],
  ['Rejected', 'Rejected', 'x-octagon'],
  ['Disputed', 'Disputed', 'alert-triangle'],
];

describe('StatusBadge', () => {
  it('has a DESIGN.md entry for every status a claim can have', () => {
    expect(DESIGN_STATUS.map(([status]) => status)).toEqual([...RECORDED_CLAIM_STATUSES]);
  });

  it.each(DESIGN_STATUS)('renders %s as "%s" with the %s icon', (status, label, icon) => {
    render(<StatusBadge status={status} />);
    const text = screen.getByText(label);
    const badge = text.closest('.status-badge');
    expect(badge).toHaveAttribute('data-status', status);
    // The icon is decorative: the label carries the meaning, so colour is never the only signal.
    const svg = badge?.querySelector('svg');
    expect(svg).toHaveAttribute('data-icon', icon);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
