// =============================================================================
// Proof of Aid — Team 05 — Dashboard (`/`): wallet area and, in demo mode, sample claims
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import { useConnection } from 'wagmi';
import { HashDisplay } from '../components/HashDisplay';
import { LockIcon, ShieldCheckIcon, UserCheckIcon } from '../components/icons';
import { StatusBadge } from '../components/StatusBadge';
import { useAppConfig } from '../hooks/useAppConfig';
import { MOCK_CLAIMS } from '../mocks/claims';
import { truncateMiddle } from '../utils/format';

const HERO_BADGES = [
  { icon: LockIcon, title: 'Private by design', text: 'Evidence stays offchain, encrypted. Only fingerprints are public.' },
  { icon: UserCheckIcon, title: 'Two-stage check', text: 'Internal verifier first, independent accredited auditor last.' },
  { icon: ShieldCheckIcon, title: 'Re-verify yourself', text: 'Drop a file in your browser. Nothing leaves your device.' },
] as const;

const HOW_IT_WORKS = [
  { title: 'Open a sample claim', text: 'See its status, checks and full history read from the blockchain.' },
  { title: 'Download a receipt', text: 'Public evidence files are free to download from the Evidence section.' },
  { title: 'Drop it to verify', text: 'Your browser re-hashes it and compares it with the onchain fingerprint.' },
] as const;

export function DashboardPage() {
  const connection = useConnection();
  const { contracts } = useAppConfig();
  const featuredClaim = MOCK_CLAIMS[0];
  return (
    <div className="page">
      <div className="hero">
        <p className="hero__eyebrow">Open verification · No login needed</p>
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
          <a className="btn btn-secondary" href="#how-it-works">
            How tracking works
          </a>
        </div>
        <ul className="hero__badges">
          {HERO_BADGES.map((badge) => (
            <li key={badge.title} className="hero__badge">
              <badge.icon size={20} className="hero__badge-icon" aria-hidden="true" />
              <p className="hero__badge-title">{badge.title}</p>
              <p className="hero__badge-text">{badge.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <section className="card" id="how-it-works" aria-labelledby="how-heading">
        <h2 id="how-heading">How tracking works</h2>
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
      </section>

      <section className="card" aria-labelledby="wallet-heading">
        <h2 id="wallet-heading">Your wallet</h2>
        {/* TODO(P5.3): replace with the role views (organization, verifier, auditor, authority, admin). */}
        {connection.status === 'connected' ? (
          <>
            <p>
              Connected as <HashDisplay value={connection.address} label="wallet address" explorer="address" />
            </p>
            <p className="muted">The actions available to your role will appear here.</p>
          </>
        ) : (
          <p className="muted">
            Connect your wallet to see the actions for your role. You do not need a wallet to check a
            claim’s evidence.
          </p>
        )}
      </section>

      {contracts.mode === 'mock' && (
        <section className="card" aria-labelledby="demo-claims-heading">
          <h2 id="demo-claims-heading">Sample claims</h2>
          <p className="muted">Real claim shapes with made-up evidence. Open one and try the check yourself.</p>
          <ul className="claim-cards">
            {MOCK_CLAIMS.map((claim) => (
              <li key={claim.claimId} className="claim-card">
                <StatusBadge status={claim.status} />
                <p className="claim-card__id">
                  Claim <code>{truncateMiddle(claim.claimId)}</code>
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
