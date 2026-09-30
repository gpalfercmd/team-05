// =============================================================================
// Proof of Aid — Team 05 — ClaimCard: a sample claim as a scannable card (status, progress, evidence count, one action)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import type { ClaimSnapshot } from '../data/assembleClaimView';
import { HashDisplay } from './HashDisplay';
import { Reveal } from './Reveal';
import { StageDots } from './StageDots';
import { StatusBadge } from './StatusBadge';

/** The whole card is one target (the action's link stretches over it); the copy button stays on top. */
export function ClaimCard({ claim, index }: { claim: ClaimSnapshot; index: number }) {
  const bundles = claim.evidenceRoots.length;
  return (
    <Reveal as="li" className="claim-card" delay={index}>
      <StatusBadge status={claim.status} />
      <StageDots status={claim.status} />
      <p className="claim-card__id">
        Claim <HashDisplay value={claim.claimId} label="claim ID" />
      </p>
      <p className="caption">
        {bundles} evidence bundle{bundles === 1 ? '' : 's'}
      </p>
      <Link className="btn btn-secondary claim-card__open" to={`/claims/${claim.claimId}`}>
        Open and verify
      </Link>
    </Reveal>
  );
}
