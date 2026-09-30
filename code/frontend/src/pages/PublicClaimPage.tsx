// =============================================================================
// Proof of Aid — Team 05 — Public claim page (`/claims/:claimId`), no wallet and no login needed
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { AuthorizedEvidence } from '../components/AuthorizedEvidence';
import { ClaimMetadata } from '../components/ClaimMetadata';
import { ClaimProgress } from '../components/ClaimProgress';
import { EscrowStatus } from '../components/EscrowStatus';
import { EvidenceSection } from '../components/EvidenceSection';
import { EvidenceVerifier } from '../components/EvidenceVerifier';
import { HashDisplay } from '../components/HashDisplay';
import { Reveal } from '../components/Reveal';
import { SettlePanel } from '../components/SettlePanel';
import { SkeletonBlocks } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { Timeline } from '../components/Timeline';
import { VerificationSummary } from '../components/VerificationSummary';
import { claimHeadline, verdictLine } from '../data/verdict';
import { examineManifest, type ManifestState } from '../evidence/verification';
import { useAppConfig } from '../hooks/useAppConfig';
import { useChainTime } from '../hooks/useChainTime';
import { useClaim, type ClaimLoadError } from '../hooks/useClaim';
import type { ClaimView } from '../types/claim';
import { formatTimestamp } from '../utils/format';
import './ClaimPage.css';

function ClaimRecord({ claim }: { claim: ClaimView }) {
  const { chain } = useAppConfig();
  const onChain = claim.source !== 'demo';
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
    </section>
  );
}

const CLAIM_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'verify', label: 'Verify' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'history', label: 'History' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'reviewer', label: 'Reviewer' },
] as const;

function ClaimSubnav() {
  return (
    <nav className="claim-subnav" aria-label="Claim sections">
      {CLAIM_SECTIONS.map((item) => (
        <a key={item.id} href={`#${item.id}`}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function DepositsSection({ claim, chainNow }: { claim: ClaimView; chainNow: number | undefined }) {
  return (
    <div id="deposits" className="deposits-stack">
      <EscrowStatus escrow={claim.escrow} now={chainNow} />
      <SettlePanel claim={claim} />
    </div>
  );
}

function ClaimDetails({ claim }: { claim: ClaimView }) {
  // The dispute window is judged on the chain's clock when it can be read (anvil can run ahead).
  const chainNow = useChainTime(claim.source !== 'demo' && claim.escrow?.disputeWindowClosesAt !== undefined);
  // Published file lists are untrusted: each one is proven against its onchain root here, once.
  const manifests = useMemo(() => {
    const roots = claim.evidence.map((bundle) => bundle.root);
    return new Map<number, ManifestState>(
      claim.evidence.map((bundle) => [bundle.rootIndex, examineManifest(bundle.publishedManifest, claim.claimId, roots)]),
    );
  }, [claim]);
  return (
    <>
      <ClaimProgress claim={claim} />
      <ClaimSubnav />
      <div id="overview" className="claim-overview">
        <ClaimRecord claim={claim} />
        <ClaimMetadata claim={claim} />
      </div>
      <Reveal>
        <VerificationSummary claim={claim} />
      </Reveal>
      <section className="claim-group" aria-labelledby="check-heading">
        <Reveal className="section-head claim-group__head">
          <p className="eyebrow">Check it yourself</p>
          <h2 id="check-heading">Check the evidence</h2>
          <p className="muted">Add a file to compare it with the recorded fingerprint, and see the evidence that was recorded.</p>
        </Reveal>
        <Reveal className="claim-group__grid" delay={1}>
          <EvidenceVerifier claim={claim} manifests={manifests} />
          <div id="evidence" className="claim-anchor">
            <EvidenceSection claim={claim} manifests={manifests} />
          </div>
        </Reveal>
      </section>
      <div id="history" className="claim-anchor">
        <Reveal>
          <Timeline entries={claim.timeline} source={claim.source} />
        </Reveal>
      </div>
      <Reveal>
        <DepositsSection claim={claim} chainNow={chainNow === undefined ? undefined : Number(chainNow)} />
      </Reveal>
      <div id="reviewer" className="claim-anchor">
        <Reveal>
          <AuthorizedEvidence claim={claim} />
        </Reveal>
      </div>
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

/** Title, one verdict line and the way in to the file check: what a visitor needs before scrolling. */
function ClaimHeader({ claim }: { claim: ClaimView | undefined }) {
  return (
    <div className="page__header page__header--panel claim-hero">
      <p className="caption claim-crumb">
        <Link to="/">Dashboard</Link> · <Link to="/claims">Claims</Link> · Claim record
      </p>
      {claim !== undefined && (
        <p className="claim-hero__status">
          <StatusBadge status={claim.status} />
        </p>
      )}
      <h1>{claim === undefined ? 'Claim record' : claimHeadline(claim)}</h1>
      {claim !== undefined && (
        <>
          <p className="claim-verdict">{verdictLine(claim)}</p>
          <p className="claim-header__action">
            <a className="btn btn-primary" href="#verify">
              Check a file
            </a>
          </p>
        </>
      )}
    </div>
  );
}

export function PublicClaimPage() {
  const { claimId } = useParams();
  const lookup = useClaim(claimId);
  const claim = lookup.state === 'found' ? lookup.claim : undefined;
  const tabTitle = claim === undefined ? undefined : `${claimHeadline(claim)} · ClearTrust`;

  // Tabs of different claims must be told apart; the previous title comes back when leaving.
  useEffect(() => {
    if (tabTitle === undefined) {
      return undefined;
    }
    const previous = document.title;
    document.title = tabTitle;
    return () => {
      document.title = previous;
    };
  }, [tabTitle]);

  let content: ReactNode;
  switch (lookup.state) {
    case 'found':
      content = <ClaimDetails claim={lookup.claim} />;
      break;
    case 'loading':
      // Shaped like the loaded page (record + what was claimed, then the deposits card), so the
      // cards do not jump when the history arrives.
      content = (
        <div className="page skeleton" role="status" aria-busy="true" aria-label="Reading this claim">
          <p className="skeleton__text">Reading this claim…</p>
          <div className="claim-overview">
            <div className="card">
              <SkeletonBlocks rows={4} />
            </div>
            <div className="card">
              <SkeletonBlocks rows={4} />
            </div>
          </div>
          <div className="card">
            <SkeletonBlocks rows={2} />
          </div>
        </div>
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
      <ClaimHeader claim={claim} />
      {content}
      <p>
        <Link to="/">Back to the dashboard</Link>
      </p>
    </div>
  );
}
