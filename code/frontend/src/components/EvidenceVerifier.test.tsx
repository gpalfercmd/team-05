// =============================================================================
// Proof of Aid — Team 05 — Tests: verifier modes for bundles with and without private files
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { examineManifest } from '../evidence/verification';
import { renderWithConfig } from '../test/testEnv';
import type { ClaimView } from '../types/claim';
import { buildRoot } from '../utils/merkle';
import { EvidenceVerifier } from './EvidenceVerifier';

const CLAIM_ID = `0x${'ab'.repeat(32)}` as Hex;
const HASHES = [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`, `0x${'33'.repeat(32)}`] as Hex[];

function claimWith(files: { public: boolean }[]): { claim: ClaimView; manifests: Map<number, ReturnType<typeof examineManifest>> } {
  const listed = files.map((file, index) => ({
    sha256: HASHES[index] as Hex,
    public: file.public,
    ...(file.public ? { name: `file-${index}.txt` } : {}),
  }));
  const root = buildRoot(listed.map((file) => file.sha256));
  if (!root.ok) {
    throw new Error('The sample hashes must build a root.');
  }
  const raw = { version: 1, claimId: CLAIM_ID, rootIndex: 0, files: listed };
  const claim = {
    claimId: CLAIM_ID,
    evidence: [{ rootIndex: 0, root: root.value, recordedAt: undefined, txHash: undefined, publishedManifest: raw, manifestHref: undefined, downloads: [] }],
    source: 'chain',
  } as unknown as ClaimView;
  return { claim, manifests: new Map([[0, examineManifest(raw, CLAIM_ID, [root.value])]]) };
}

const bundleOption = () => screen.getByRole('radio', { name: /A complete bundle/ });

describe('EvidenceVerifier modes', () => {
  it('turns the complete-bundle option off, with the reason, when the list holds private files', () => {
    const { claim, manifests } = claimWith([{ public: true }, { public: false }, { public: false }]);
    renderWithConfig(<EvidenceVerifier claim={claim} manifests={manifests} />);
    expect(bundleOption()).toBeDisabled();
    expect(screen.getByText('Needs 2 private files only reviewers hold')).toBeInTheDocument();
  });

  it('uses the singular for one private file', () => {
    const { claim, manifests } = claimWith([{ public: true }, { public: false }]);
    renderWithConfig(<EvidenceVerifier claim={claim} manifests={manifests} />);
    expect(screen.getByText('Needs 1 private file only reviewers hold')).toBeInTheDocument();
  });

  it('keeps the complete-bundle option when every listed file is public', () => {
    const { claim, manifests } = claimWith([{ public: true }, { public: true }]);
    renderWithConfig(<EvidenceVerifier claim={claim} manifests={manifests} />);
    expect(bundleOption()).toBeEnabled();
    expect(screen.queryByText(/only reviewers hold/)).not.toBeInTheDocument();
  });

  it('reports fewer files than listed as incomplete, in neutral words, not as a mismatch', async () => {
    const user = userEvent.setup();
    const { claim, manifests } = claimWith([{ public: true }, { public: true }]);
    renderWithConfig(<EvidenceVerifier claim={claim} manifests={manifests} />);
    await user.click(bundleOption());
    await user.upload(screen.getByLabelText('Choose files to check'), new File(['one'], 'one.txt'));
    expect(await screen.findByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('Incomplete: 1 of 2 files')).toBeInTheDocument();
    expect(screen.queryByText('No match')).not.toBeInTheDocument();
  });
});
