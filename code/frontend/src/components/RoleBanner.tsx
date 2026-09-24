// =============================================================================
// Proof of Aid — Team 05 — RoleBanner: thin bar showing the viewer's role and network
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useAppConfig } from '../hooks/useAppConfig';
import { useRole } from '../hooks/useRole';

// Styles live in Header.css: the banner is the header's second row.
export function RoleBanner() {
  const { label } = useRole();
  const { chain } = useAppConfig();
  return (
    <section className="role-banner" aria-label="Current role">
      <div className="container role-banner__inner">
        <span>
          Viewing as <strong>{label}</strong>
        </span>
        <span>
          Network <strong>{chain.name}</strong>
        </span>
      </div>
    </section>
  );
}
