// =============================================================================
// Proof of Aid — Team 05 — Fallback page for unknown routes
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="page__header">
        <p className="eyebrow">Error 404</p>
        <h1>Page not found</h1>
        <p className="page__lead">This address does not match any page.</p>
      </div>
      <p>
        <Link className="btn btn-primary" to="/">
          Go to the dashboard
        </Link>
      </p>
    </div>
  );
}
