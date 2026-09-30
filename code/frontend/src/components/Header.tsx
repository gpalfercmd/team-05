// =============================================================================
// Proof of Aid — Team 05 — Site header: cleartrust brand left, section links + workspace, demo notice, theme toggle and wallet right
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useLayoutEffect, useRef, type RefObject } from 'react';
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

/**
 * Publishes the sticky header's real height as `--header-h` on the root: on a phone the header wraps
 * to several rows, so the sticky section nav and every jump target must clear its measured height.
 */
function useHeaderHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (header === null) {
      return undefined;
    }
    const publish = () => {
      document.documentElement.style.setProperty('--header-h', `${header.getBoundingClientRect().height}px`);
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(publish);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
    };
  }, [ref]);
}

export function Header() {
  const { contracts } = useAppConfig();
  const headerRef = useRef<HTMLElement>(null);
  useHeaderHeight(headerRef);
  return (
    <header className="site-header" ref={headerRef}>
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
