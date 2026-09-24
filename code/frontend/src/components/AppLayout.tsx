// =============================================================================
// Proof of Aid — Team 05 — Page shell: header, role banner and the routed page
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Outlet } from 'react-router';
import { Header } from './Header';
import { RoleBanner } from './RoleBanner';

export function AppLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <RoleBanner />
      <main id="main" className="container app-main">
        <Outlet />
      </main>
    </>
  );
}
