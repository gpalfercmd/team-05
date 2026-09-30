// =============================================================================
// Proof of Aid — Team 05 — The one-line verdict and the headline of a claim page, from facts already known
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ClaimView } from '../types/claim';
import { STATUS_META } from '../utils/claimStatus';
import { truncateMiddle } from '../utils/format';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What the claim page is called: its checked title, else the shortened claim ID (never an unchecked title). */
export function claimHeadline(claim: ClaimView): string {
  const headline =
    claim.metadata.state === 'verified' ? claim.metadata.metadata.title : `Claim ${truncateMiddle(claim.claimId)}`;
  return headline;
}

function checkedBy(claim: ClaimView): string | undefined {
  const reviewers = new Set<string>();
  const auditors = new Set<string>();
  for (const { action } of claim.timeline) {
    if (action.kind === 'internal-attestation' || action.kind === 'proof-reviewed') {
      reviewers.add(action.verifier.toLowerCase());
    } else if (action.kind === 'final-attestation') {
      auditors.add(action.auditor.toLowerCase());
    }
  }
  const parts = [
    ...(reviewers.size > 0 ? [`${plural(reviewers.size, 'internal reviewer')}`] : []),
    ...(auditors.size > 0 ? [`${plural(auditors.size, 'independent auditor')}`] : []),
  ];
  const text = parts.length === 0 ? undefined : `checked by ${parts.join(' and ')}`;
  return text;
}

function disputes(claim: ClaimView): string | undefined {
  let opened = 0;
  let latest: 'open' | 'dismissed' | 'upheld' = 'open';
  for (const { action } of claim.timeline) {
    if (action.kind === 'dispute-opened') {
      opened += 1;
      latest = 'open';
    } else if (action.kind === 'dispute-resolved') {
      latest = action.upheld ? 'upheld' : 'dismissed';
    }
  }
  const text = opened === 0 ? undefined : `${plural(opened, 'dispute')}, ${latest}`;
  return text;
}

/** "Verified · checked by 2 internal reviewers and 1 independent auditor · 1 dispute, dismissed": only known facts. */
export function verdictLine(claim: ClaimView): string {
  const parts = [STATUS_META[claim.status].label, checkedBy(claim), disputes(claim)].filter(
    (part): part is string => part !== undefined,
  );
  return parts.join(' · ');
}
