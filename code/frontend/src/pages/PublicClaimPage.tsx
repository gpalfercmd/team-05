// =============================================================================
// Proof of Aid — Team 05 — Public claim page (`/claims/:claimId`), no wallet needed
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { HashDisplay } from '../components/HashDisplay';
import { StatusBadge } from '../components/StatusBadge';
import { useAppConfig } from '../hooks/useAppConfig';
import { useClaimStatus } from '../hooks/useClaimStatus';
import type { ClaimSummary } from '../types/claim';
import { formatTimestamp } from '../utils/format';

type ClaimRecordProps = { claim: ClaimSummary; source: 'demo' | 'chain' };

function ClaimRecord({ claim, source }: ClaimRecordProps) {
  const { chain } = useAppConfig();
  return (
    <section className="card" aria-labelledby="claim-heading">
      <h2 id="claim-heading">Current status</h2>
      <p>
        <StatusBadge status={claim.status} />
      </p>
      <dl className="detail-list">
        <div>
          <dt>Claim ID</dt>
          <dd>
            <HashDisplay value={claim.claimId} label="claim ID" />
          </dd>
        </div>
        <div>
          <dt>Organization</dt>
          <dd>
            <HashDisplay value={claim.organization} label="organization address" explorer="address" />
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>
            {formatTimestamp(claim.anchoredAt)} on {chain.name} · tx{' '}
            <HashDisplay value={claim.anchorTxHash} label="transaction" explorer="tx" />
          </dd>
        </div>
        <div>
          <dt>Evidence fingerprints</dt>
          <dd>
            <ul className="plain-list">
              {claim.evidenceRoots.map((root, index) => (
                <li key={root}>
                  <span className="muted">{index === 0 ? 'Original evidence' : `Supplementary proof ${index}`}</span>{' '}
                  <HashDisplay value={root} label="evidence fingerprint" />
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <p className="caption">
        {source === 'demo' ? 'Sample record for the demo.' : 'Read directly from the blockchain.'}
      </p>
    </section>
  );
}

export function PublicClaimPage() {
  const { claimId } = useParams();
  const lookup = useClaimStatus(claimId);

  // TODO(P5.4): timeline from StatusChanged events, attestations, and in-browser re-hash of a
  // public file against evidenceRoots (VerificationResult).
  let content: ReactNode;
  switch (lookup.state) {
    case 'found':
      content = <ClaimRecord claim={lookup.claim} source={lookup.source} />;
      break;
    case 'not-found':
      content = <p className="card">No claim with this ID has been recorded.</p>;
      break;
    case 'invalid-id':
      content = <p className="card">This link does not contain a valid claim ID.</p>;
      break;
    case 'unavailable':
      content = <p className="card">{lookup.reason}</p>;
      break;
  }

  return (
    <div className="page">
      <div>
        <h1>Claim record</h1>
        <p className="page__lead">
          Anyone can check this claim. Its evidence stays private; only its fingerprints are public.
        </p>
      </div>
      {content}
      <p>
        <Link to="/">Back to the dashboard</Link>
      </p>
    </div>
  );
}
