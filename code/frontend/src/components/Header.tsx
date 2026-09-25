// =============================================================================
// Proof of Aid — Team 05 — Site header: cleartrust brand left, section links + workspace, demo notice, theme toggle and wallet right
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link, NavLink } from 'react-router';
import { useAppConfig } from '../hooks/useAppConfig';
import { CleartrustMark } from './CleartrustMark';
import { ConnectButton } from './ConnectButton';
import { DemoDataNotice } from './DemoDataNotice';
import { ThemeToggle } from './ThemeToggle';
import './Header.css';

// Home sections vs. standalone pages: "How it works" scrolls on the dashboard, while the
// claims index and the workspace are their own pages (NavLinks mark the current page).
const SECTION_LINKS = [{ to: '/#how-it-works', label: 'How it works' }] as const;
const PAGE_LINKS = [
  { to: '/claims', label: 'Claims' },
  { to: '/workspace', label: 'Workspace' },
] as const;

export function Header() {
  const { contracts } = useAppConfig();
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="cleartrust home">
          <CleartrustMark size={26} />
          <span className="brand__word" aria-hidden="true">
            clear<span className="brand__trust">trust</span>
          </span>
        </Link>
        <nav className="site-header__nav" aria-label="Main">
          {SECTION_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
          {PAGE_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
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
