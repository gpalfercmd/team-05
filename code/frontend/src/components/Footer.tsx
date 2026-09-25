// =============================================================================
// Proof of Aid — Team 05 — Site footer: quiet closing band with chain + project links
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import { useAppConfig } from '../hooks/useAppConfig';

export function Footer() {
  const { chain } = useAppConfig();
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span>Proof of Aid — check aid claims without exposing people.</span>
        <span>
          Status and evidence fingerprints read directly from the blockchain ({chain.name}).{' '}
          <Link to="/claims">Browse claims</Link> · <Link to="/workspace">Workspace</Link>
        </span>
      </div>
    </footer>
  );
}
