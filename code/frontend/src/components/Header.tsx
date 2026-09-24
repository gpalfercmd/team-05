// =============================================================================
// Proof of Aid — Team 05 — Site header: brand, demo notice, theme toggle, wallet
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import { useAppConfig } from '../hooks/useAppConfig';
import { ConnectButton } from './ConnectButton';
import { DemoDataNotice } from './DemoDataNotice';
import { ShieldCheckIcon } from './icons';
import { ThemeToggle } from './ThemeToggle';
import './Header.css';

export function Header() {
  const { contracts } = useAppConfig();
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="site-header__brand">
          <ShieldCheckIcon size={22} />
          <span>Proof of Aid</span>
        </Link>
        <div className="site-header__actions">
          {contracts.mode === 'mock' && <DemoDataNotice />}
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
