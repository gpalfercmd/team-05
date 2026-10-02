// =============================================================================
// Proof of Aid — Team 05 — Home (`/`): the public story, project context, sample claims (demo), workspace link
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { ClaimCard } from '../components/ClaimCard';
import { AnchorIcon, LockIcon, ShieldCheckIcon, UserCheckIcon } from '../components/icons';
import { Reveal } from '../components/Reveal';
import { useAppConfig } from '../hooks/useAppConfig';
import { DEMO_MANIFESTS, FULL_STORY_CLAIM_ID, MOCK_CLAIMS } from '../mocks/claims';
import { truncateMiddle } from '../utils/format';
import './Dashboard.css';

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
  {
    icon: AnchorIcon,
    title: 'Anchor the fingerprint',
    text: 'An organization records the fingerprint of its evidence on the blockchain. The files themselves stay offchain.',
  },
  {
    icon: UserCheckIcon,
    title: 'Two-stage review',
    text: 'An internal verifier checks it first, then an independent accredited auditor gives the final decision.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Anyone verifies',
    text: 'Open a claim, drop a file, and your browser compares its fingerprint with the recorded one. No account needed.',
  },
] as const;

// The demo evidence's first public file and its listed fingerprint, so the illustration shows real values.
const ILLUSTRATION_FILE = DEMO_MANIFESTS['manifest.json'].files[0];

/** Header links point at `/#section`; a client-side navigation does not scroll there by itself. */
function useScrollToHash() {
  // `key` changes on every navigation, so clicking the same section link again scrolls again.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (hash.length > 1) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }, [hash, key]);
}

/** A file check drawn as a picture: the file, its fingerprint, the recorded one, and the match. */
function ProofIllustration() {
  const fingerprint = truncateMiddle(ILLUSTRATION_FILE.sha256);
  return (
    <figure className="proof-card">
      <figcaption className="proof-card__caption">
        <span className="dot" aria-hidden="true" /> Illustration · a file check, done in your browser
      </figcaption>
      <div className="proof-card__file">
        <LockIcon size={16} aria-hidden="true" />
        <span className="proof-card__name">{ILLUSTRATION_FILE.name}</span>
        <span className="caption">stays on your device</span>
      </div>
      <div className="proof-card__flow" aria-hidden="true">
        <span className="proof-card__pulse" />
        <span className="caption">SHA-256, computed locally</span>
      </div>
      <dl className="proof-card__hashes">
        <div>
          <dt>Fingerprint of your file</dt>
          <dd>
            <code>{fingerprint}</code>
          </dd>
        </div>
        <div>
          <dt>Recorded on the blockchain</dt>
          <dd>
            <code>{fingerprint}</code>
          </dd>
        </div>
      </dl>
      <p className="proof-card__match">
        <ShieldCheckIcon size={20} aria-hidden="true" />
        <span>Match</span>
      </p>
    </figure>
  );
}

export function DashboardPage() {
  const { contracts } = useAppConfig();
  const featuredClaim = MOCK_CLAIMS[0];
  useScrollToHash();
  return (
    <div className="page page--bands">
      <div className="band hero">
        <div className="hero__grid">
          <div className="hero__copy">
            <p className="pill-tag">
              <span className="dot" aria-hidden="true" />
              Open verification · No login needed
            </p>
            <h1>
              Check aid claims <span className="hero__mark">without exposing people</span>
            </h1>
            <p className="hero__case">
              A foundation reports 500 food kits after the Valencia floods. Anyone can check that its proof was never changed.
            </p>
            <p className="page__lead">
              Record aid evidence, have it checked, and let anyone confirm it was not changed — without exposing the people it
              protects.
            </p>
            <div className="hero__actions">
              <Link className="btn btn-primary btn--lg" to="/claims">
                Look up a claim
              </Link>
              {contracts.mode === 'mock' && featuredClaim !== undefined && (
                <Link className="btn btn-secondary btn--lg" to={`/claims/${featuredClaim.claimId}`}>
                  See a sample claim
                </Link>
              )}
              {/* The deploy script anchors the demo claim with the committed demo evidence on every chain. */}
              {contracts.mode === 'chain' && (
                <Link className="btn btn-secondary btn--lg" to={`/claims/${FULL_STORY_CLAIM_ID}`}>
                  See the demo claim
                </Link>
              )}
              <a className="btn-link" href="#how-it-works">
                How tracking works
              </a>
            </div>
          </div>
          <ProofIllustration />
        </div>
        <ul className="stats">
          {HERO_STATS.map((stat, index) => (
            <Reveal as="li" key={stat.label} delay={index}>
              <span className="stats__value">{stat.value}</span>
              <span className="stats__label">{stat.label}</span>
            </Reveal>
          ))}
        </ul>
      </div>

      {/* Band colour follows its neighbours so sections alternate: in demo mode the sample
          claims below are on neutral, so About takes surface; on a real chain How-it-works
          below needs surface for its step cards, so About stays neutral. */}
      <section
        className={contracts.mode === 'mock' ? 'band band--compact band--alt' : 'band band--compact'}
        aria-labelledby="about-heading"
      >
        <div className="about-layout">
          <Reveal>
            <div className="section-head">
              <p className="eyebrow">The project</p>
              <h2 id="about-heading">What is ClearTrust?</h2>
            </div>
            <div className="about-grid">
              <p>
                ClearTrust lets anyone check that an aid claim is backed by real evidence — without seeing the private data
                inside that evidence. No account, no special access: the checks run in your browser against fingerprints
                recorded on the Arbitrum blockchain.
              </p>
              <p>
                For example, a foundation reports delivering 500 food kits after the Valencia floods. Its strongest proof —
                signed delivery lists, photos of families — cannot be published, so the files stay offchain, encrypted, while
                their fingerprints are anchored onchain and every verification step is signed by independent, accredited
                reviewers.
              </p>
              <p>
                <a href="#how-it-works">See how tracking works</a>
              </p>
            </div>
          </Reveal>
          <Reveal className="split" delay={2}>
            <div className="split__side split__side--private">
              <LockIcon size={20} aria-hidden="true" />
              <p className="split__title">Stays offchain, encrypted</p>
              <p className="caption">Signed delivery lists, photos of families.</p>
            </div>
            <div className="split__bridge" aria-hidden="true">
              <span>fingerprint</span>
            </div>
            <div className="split__side split__side--public">
              <AnchorIcon size={20} aria-hidden="true" />
              <p className="split__title">Anchored onchain, public</p>
              <p className="caption">Only the fingerprints of the files.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {contracts.mode === 'mock' && (
        <section className="band" id="claims" aria-labelledby="demo-claims-heading">
          <Reveal className="section-head">
            <p className="eyebrow">Public records</p>
            <h2 id="demo-claims-heading">Sample claims</h2>
            <p className="muted">
              Real claim shapes with made-up evidence. Open one and try the check yourself.{' '}
              <Link to="/claims">Browse all claims</Link>.
            </p>
          </Reveal>
          <ul className="claim-cards">
            {MOCK_CLAIMS.map((claim, index) => (
              <ClaimCard key={claim.claimId} claim={claim} index={index} />
            ))}
          </ul>
        </section>
      )}

      <section className="band band--alt" id="how-it-works" aria-labelledby="how-heading">
        <Reveal className="section-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading">How tracking works</h2>
        </Reveal>
        <ol className="track">
          {HOW_IT_WORKS.map((step, index) => (
            <Reveal as="li" key={step.title} className="track__step" delay={index}>
              <span className="track__node" aria-hidden="true">
                <step.icon size={22} />
                <span className="track__number">{String(index + 1).padStart(2, '0')}</span>
              </span>
              <h3 className="track__title">{step.title}</h3>
              <p className="track__text">{step.text}</p>
            </Reveal>
          ))}
        </ol>
        <ul className="principles" aria-label="What ClearTrust guarantees">
          {HERO_BADGES.map((badge, index) => (
            <Reveal as="li" key={badge.title} className="principles__item" delay={index}>
              <badge.icon size={20} className="principles__icon" aria-hidden="true" />
              <p className="principles__title">{badge.title}</p>
              <p className="principles__text">{badge.text}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* The role screens live on their own page; home keeps only the public story. */}
      <section className="band band--compact" aria-labelledby="workspace-heading">
        <Reveal className="card card--interactive workspace-teaser">
          <div>
            <h2 id="workspace-heading">Working on claims?</h2>
            <p className="muted">Organizations, verifiers, auditors and the Authority act on claims from their workspace.</p>
          </div>
          <Link className="btn btn-secondary" to="/workspace">
            Open your workspace
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
