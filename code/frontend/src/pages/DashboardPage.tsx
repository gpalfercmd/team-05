// =============================================================================
// Proof of Aid — Team 05 — Home (`/`): the public story, sample claims (demo) or demo claim + lookup (chain), workspace link
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { ClaimLookup } from '../components/ClaimLookup';
import { HashDisplay } from '../components/HashDisplay';
import { LockIcon, ShieldCheckIcon, UserCheckIcon } from '../components/icons';
import { StatusBadge } from '../components/StatusBadge';
import { useAppConfig } from '../hooks/useAppConfig';
import { FULL_STORY_CLAIM_ID, MOCK_CLAIMS } from '../mocks/claims';

const HERO_BADGES = [
  { icon: LockIcon, title: 'Private by design', text: 'Evidence stays offchain, encrypted. Only fingerprints are public.' },
  { icon: UserCheckIcon, title: 'Two-stage check', text: 'Internal verifier first, independent accredited auditor last.' },
  { icon: ShieldCheckIcon, title: 'Re-verify yourself', text: 'Drop a file in your browser. Nothing leaves your device.' },
] as const;

// Facts about how the system works, not usage numbers: every value must stay true.
const HERO_STATS = [
  { value: 'Onchain', label: 'Evidence fingerprints' },
  { value: '0', label: 'Personal data onchain' },
  { value: '2-stage', label: 'Verification' },
  { value: 'Arbitrum', label: 'Ethereum layer 2' },
] as const;

const HOW_IT_WORKS = [
  { title: 'Open a sample claim', text: 'See its status, checks and full history read from the blockchain.' },
  { title: 'Download a receipt', text: 'Public evidence files are free to download from the Evidence section.' },
  { title: 'Drop it to verify', text: 'Your browser re-hashes it and compares it with the onchain fingerprint.' },
] as const;

/** Header links point at `/#section`; a client-side navigation does not scroll there by itself. */
function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash.length > 1) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }, [hash]);
}

export function DashboardPage() {
  const { contracts } = useAppConfig();
  const featuredClaim = MOCK_CLAIMS[0];
  useScrollToHash();
  return (
    <div className="page page--bands">
      <div className="band hero">
        <p className="pill-tag">
          <span className="dot" aria-hidden="true" />
          Open verification · No login needed
        </p>
        <h1>Check aid claims without exposing people</h1>
        <p className="page__lead">
          Record aid evidence, have it checked, and let anyone confirm it was not changed — without
          exposing the people it protects.
        </p>
        <div className="hero__actions">
          {contracts.mode === 'mock' && featuredClaim !== undefined && (
            <Link className="btn btn-primary" to={`/claims/${featuredClaim.claimId}`}>
              See a sample claim
            </Link>
          )}
          {/* The deploy script anchors the demo claim with the committed demo evidence on every chain. */}
          {contracts.mode === 'chain' && (
            <Link className="btn btn-primary" to={`/claims/${FULL_STORY_CLAIM_ID}`}>
              See the demo claim
            </Link>
          )}
          <a className="btn btn-secondary" href="#how-it-works">
            How tracking works
          </a>
        </div>
        <ul className="stats">
          {HERO_STATS.map((stat) => (
            <li key={stat.label}>
              <span className="stats__value">{stat.value}</span>
              <span className="stats__label">{stat.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className="band band--alt" id="how-it-works" aria-labelledby="how-heading">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading">How tracking works</h2>
        </div>
        <ol className="steps">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="steps__item">
              <span className="steps__number" aria-hidden="true">
                {index + 1}
              </span>
              <p className="steps__title">{step.title}</p>
              <p className="steps__text">{step.text}</p>
            </li>
          ))}
        </ol>
        <ul className="principles">
          {HERO_BADGES.map((badge) => (
            <li key={badge.title} className="principles__item">
              <badge.icon size={20} className="principles__icon" aria-hidden="true" />
              <p className="principles__title">{badge.title}</p>
              <p className="principles__text">{badge.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* The role screens live on their own page; home keeps only the public story. */}
      <section className="band band--compact" aria-labelledby="workspace-heading">
        <div className="card workspace-teaser">
          <div>
            <h2 id="workspace-heading">Working on claims?</h2>
            <p className="muted">Organizations, verifiers, auditors and the Authority act on claims from their workspace.</p>
          </div>
          <Link className="btn btn-secondary" to="/workspace">
            Open your workspace
          </Link>
        </div>
      </section>

      {contracts.mode === 'chain' && (
        <section className="band band--alt" id="claims" aria-labelledby="find-claim-heading">
          <div className="section-head">
            <p className="eyebrow">Public records</p>
            <h2 id="find-claim-heading">Find a claim</h2>
            <p className="muted">
              Open the demo claim recorded on the blockchain, or paste the ID of any other claim.
            </p>
          </div>
          <div className="card">
            <p>
              <Link to={`/claims/${FULL_STORY_CLAIM_ID}`}>Demo claim</Link>{' '}
              <HashDisplay value={FULL_STORY_CLAIM_ID} label="demo claim ID" />: verified after a proof request and a
              dismissed dispute.
            </p>
            <ClaimLookup />
          </div>
        </section>
      )}

      {contracts.mode === 'mock' && (
        <section className="band band--alt" id="claims" aria-labelledby="demo-claims-heading">
          <div className="section-head">
            <p className="eyebrow">Public records</p>
            <h2 id="demo-claims-heading">Sample claims</h2>
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
