// =============================================================================
// Proof of Aid — Team 05 — Claims index (`/claims`): browse sample/demo claims or look one up
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import { ClaimLookup } from '../components/ClaimLookup';
import { HashDisplay } from '../components/HashDisplay';
import { StatusBadge } from '../components/StatusBadge';
import { useAppConfig } from '../hooks/useAppConfig';
import { FULL_STORY_CLAIM_ID, MOCK_CLAIMS } from '../mocks/claims';

export function ClaimsIndexPage() {
  const { contracts } = useAppConfig();
  return (
    <div className="page">
      <div className="page__header">
        <p className="caption claim-crumb">
          <Link to="/">Dashboard</Link> · Claims
        </p>
        <p className="eyebrow">Public records</p>
        <h1>Claims</h1>
        <p className="page__lead">Open a claim and check its evidence in your browser. No wallet needed.</p>
      </div>

      {contracts.mode === 'chain' && (
        <section className="card" aria-labelledby="claims-lookup-heading">
          <h2 id="claims-lookup-heading">Find a claim</h2>
          <p>
            <Link to={`/claims/${FULL_STORY_CLAIM_ID}`}>Demo claim</Link>{' '}
            <HashDisplay value={FULL_STORY_CLAIM_ID} label="demo claim ID" />: verified after an internal check and a
            dismissed dispute.
          </p>
          <ClaimLookup />
        </section>
      )}

      {contracts.mode === 'mock' && (
        <section aria-labelledby="claims-list-heading">
          <div className="section-head">
            <p className="eyebrow">Public records</p>
            <h2 id="claims-list-heading">Sample claims</h2>
            <p className="muted">Real claim shapes with made-up evidence. Open one and try the check yourself.</p>
          </div>
          <ul className="claim-cards">
            {MOCK_CLAIMS.map((claim) => (
              <li key={claim.claimId} className="claim-card">
                <StatusBadge status={claim.status} />
                <p className="claim-card__id">
                  Claim <HashDisplay value={claim.claimId} label="claim ID" />
                </p>
                <p className="caption">
                  {claim.evidenceRoots.length} evidence bundle{claim.evidenceRoots.length === 1 ? '' : 's'}
                </p>
                <Link className="btn btn-secondary claim-card__open" to={`/claims/${claim.claimId}`}>
                  Open and verify
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
