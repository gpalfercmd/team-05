// =============================================================================
// Proof of Aid — Team 05 — Tests: VerificationResult wording, icons and both fingerprints
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen } from '@testing-library/react';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { renderWithConfig } from '../test/testEnv';
import { MISMATCH_MEANING, MISMATCH_NEXT_STEPS } from '../evidence/labels';
import { VerificationResult, type VerificationState } from './VerificationResult';

const COMPUTED = `0x${'1a'.repeat(32)}` as Hex;
const EXPECTED = `0x${'2b'.repeat(32)}` as Hex;

function renderResult(state: VerificationState, plural = false, recordedAt: number | undefined = undefined) {
  return renderWithConfig(
    <VerificationResult
      state={state}
      subject="receipt-001.txt"
      plural={plural}
      recordedAt={recordedAt}
      computed={{ label: 'Fingerprint of your file', value: COMPUTED }}
      expected={{ label: 'Recorded fingerprint', value: EXPECTED }}
    />,
  );
}

describe('VerificationResult', () => {
  it.each([
    ['match', 'Match', 'shield-check'],
    ['mismatch', 'No match', 'x-octagon'],
    ['private', 'Private file', 'lock'],
    ['manifest-mismatch', 'File list altered', 'alert-triangle'],
  ] as const)('gives the %s state its own text label and icon, not just a colour', (state, label, icon) => {
    const { container } = renderResult(state);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(`[data-state="${state}"] svg[data-icon="${icon}"]`)).not.toBeNull();
  });

  it('dates a match with the time the root was recorded', () => {
    renderResult('match', false, 1_789_376_400);
    expect(screen.getByText(/^This file is exactly the one recorded on 14 Sept? 2026, 09:00 UTC\.$/)).toBeInTheDocument();
  });

  it('words a bundle result in the plural', () => {
    renderResult('mismatch', true);
    expect(
      screen.getByText('These files do not match the recorded evidence. A file was changed, added or left out.'),
    ).toBeInTheDocument();
  });

  it('always shows the computed fingerprint next to the recorded one', () => {
    renderResult('mismatch');
    expect(screen.getByTitle(COMPUTED)).toBeInTheDocument();
    expect(screen.getByTitle(EXPECTED)).toBeInTheDocument();
    expect(screen.getByText('Fingerprint of your file')).toBeInTheDocument();
    expect(screen.getByText('Recorded fingerprint')).toBeInTheDocument();
  });

  it('explains a "No match" in plain words and says what to try next', () => {
    renderResult('mismatch');
    expect(screen.getByText(MISMATCH_MEANING.single)).toBeInTheDocument();
    expect(screen.getByText('What to try next')).toBeInTheDocument();
    for (const step of MISMATCH_NEXT_STEPS) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText(/right evidence bundle/)).toBeInTheDocument();
    expect(screen.getByText(/original file/)).toBeInTheDocument();
    expect(screen.getByText(/Private files cannot be checked publicly/)).toBeInTheDocument();
  });

  it('explains a bundle "No match" as a changed, added or missing file', () => {
    renderResult('mismatch', true);
    expect(screen.getByText(MISMATCH_MEANING.plural)).toBeInTheDocument();
  });

  it('adds no mismatch help to the other verdicts', () => {
    renderResult('match');
    expect(screen.queryByText('What to try next')).not.toBeInTheDocument();
  });
});
