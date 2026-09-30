// =============================================================================
// Proof of Aid — Team 05 — Site footer: quiet closing band with chain + project links
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import { useAppConfig } from '../hooks/useAppConfig';
import { CleartrustMark } from './CleartrustMark';

export function Footer() {
  const { chain, contracts } = useAppConfig();
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <CleartrustMark size={28} />
          <p className="site-footer__tagline">ClearTrust — check aid claims without exposing people.</p>
        </div>
        <nav className="site-footer__nav" aria-label="Footer">
          <Link to="/#how-it-works">How it works</Link>
          <Link to="/claims">Claims</Link>
          <Link to="/workspace">Workspace</Link>
        </nav>
        <p className="site-footer__note">
          {contracts.mode === 'mock'
            ? 'Demo data: sample records, not read from a blockchain.'
            : `Status and evidence fingerprints read directly from the blockchain (${chain.name}).`}
        </p>
      </div>
    </footer>
  );
}
