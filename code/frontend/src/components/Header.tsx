// =============================================================================
// Proof of Aid — Team 05 — Site header: brand left, section links, demo notice, theme toggle and wallet right
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

// Every link points at a section of the dashboard; the dashboard scrolls to the hash on arrival.
const NAV_LINKS = [
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#claims', label: 'Claims' },
  { to: '/#wallet', label: 'Your wallet' },
] as const;

export function Header() {
  const { contracts } = useAppConfig();
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="site-header__brand">
          <ShieldCheckIcon size={22} />
          <span>Proof of Aid</span>
        </Link>
        <nav className="site-header__nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="site-header__actions">
          {contracts.mode === 'mock' && <DemoDataNotice />}
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
