// =============================================================================
// Proof of Aid — Team 05 — Public claim page (`/claims/:claimId`), no wallet and no login needed
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EvidenceSection } from '../components/EvidenceSection';
import { EvidenceVerifier } from '../components/EvidenceVerifier';
import { HashDisplay } from '../components/HashDisplay';
import { StatusBadge } from '../components/StatusBadge';
import { Timeline } from '../components/Timeline';
import { VerificationSummary } from '../components/VerificationSummary';
import { examineManifest, type ManifestState } from '../evidence/verification';
import { useAppConfig } from '../hooks/useAppConfig';
import { useClaim, type ClaimLoadError } from '../hooks/useClaim';
import type { ClaimView } from '../types/claim';
import { formatTimestamp } from '../utils/format';

function ClaimRecord({ claim }: { claim: ClaimView }) {
  const { chain } = useAppConfig();
  const onChain = claim.source === 'chain';
  const anchorTx = claim.evidence[0]?.txHash;
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
            <HashDisplay value={claim.organization} label="organization address" explorer={onChain ? 'address' : undefined} />
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>
            {formatTimestamp(claim.anchoredAt)}
            {onChain ? ` on ${chain.name}` : ' (demo data)'}
            {anchorTx !== undefined && (
              <>
                {' '}
                · Transaction <HashDisplay value={anchorTx} label="transaction" explorer={onChain ? 'tx' : undefined} />
              </>
            )}
          </dd>
        </div>
      </dl>
      <p className="caption">
        <a href="#verify">Check a file of this claim yourself</a>
      </p>
    </section>
  );
}

function ClaimDetails({ claim }: { claim: ClaimView }) {
  // Published file lists are untrusted: each one is proven against its onchain root here, once.
  const manifests = useMemo(() => {
    const roots = claim.evidence.map((bundle) => bundle.root);
    return new Map<number, ManifestState>(
      claim.evidence.map((bundle) => [bundle.rootIndex, examineManifest(bundle.publishedManifest, claim.claimId, roots)]),
    );
  }, [claim]);
  return (
    <>
      <ClaimRecord claim={claim} />
      <VerificationSummary claim={claim} />
      <Timeline entries={claim.timeline} source={claim.source} />
      <EvidenceSection claim={claim} manifests={manifests} />
      <EvidenceVerifier claim={claim} manifests={manifests} />
    </>
  );
}

const LOAD_ERROR_MESSAGES: Record<ClaimLoadError['kind'], string> = {
  unavailable: 'We could not read this claim from the blockchain right now. Check your connection and try again.',
  'history-too-large':
    'The blockchain service refused to return this claim’s history, even in small parts. Try again later; if it keeps happening, the site needs another blockchain endpoint.',
  'invalid-data': 'The blockchain returned data this page cannot read, so nothing is shown rather than something wrong.',
};

function LoadError({ error, retry }: { error: ClaimLoadError; retry: () => void }) {
  return (
    <section className="card" role="alert">
      <p>{LOAD_ERROR_MESSAGES[error.kind]}</p>
      <details>
        <summary className="caption">Technical details</summary>
        <p className="caption">{error.detail}</p>
      </details>
      <button type="button" className="btn btn-secondary" onClick={retry}>
        Try again
      </button>
    </section>
  );
}

export function PublicClaimPage() {
  const { claimId } = useParams();
  const lookup = useClaim(claimId);

  let content: ReactNode;
  switch (lookup.state) {
    case 'found':
      content = <ClaimDetails claim={lookup.claim} />;
      break;
    case 'loading':
      content = (
        <p className="card" role="status">
          Reading this claim…
        </p>
      );
      break;
    case 'not-found':
      content = <p className="card">No claim with this ID has been recorded.</p>;
      break;
    case 'invalid-id':
      content = <p className="card">This link does not contain a valid claim ID.</p>;
      break;
    case 'error':
      content = <LoadError error={lookup.error} retry={lookup.retry} />;
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
