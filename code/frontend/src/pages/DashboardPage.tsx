// =============================================================================
// Proof of Aid — Team 05 — Dashboard (`/`): wallet area and, in demo mode, sample claims
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { Link } from 'react-router';
import { useConnection } from 'wagmi';
import { HashDisplay } from '../components/HashDisplay';
import { StatusBadge } from '../components/StatusBadge';
import { useAppConfig } from '../hooks/useAppConfig';
import { MOCK_CLAIMS } from '../mocks/claims';
import { truncateMiddle } from '../utils/format';

export function DashboardPage() {
  const connection = useConnection();
  const { contracts } = useAppConfig();
  return (
    <div className="page">
      <div>
        <h1>Dashboard</h1>
        <p className="page__lead">
          Record aid evidence, have it checked, and let anyone confirm it was not changed — without
          exposing the people it protects.
        </p>
      </div>

      <section className="card" aria-labelledby="wallet-heading">
        <h2 id="wallet-heading">Your wallet</h2>
        {/* TODO(P5.3): replace with the role views (organization, verifier, auditor, authority, admin). */}
        {connection.status === 'connected' ? (
          <>
            <p>
              Connected as <HashDisplay value={connection.address} label="wallet address" explorer="address" />
            </p>
            <p className="muted">The actions available to your role will appear here.</p>
          </>
        ) : (
          <p className="muted">
            Connect your wallet to see the actions for your role. You do not need a wallet to check a
            claim’s evidence.
          </p>
        )}
      </section>

      {contracts.mode === 'mock' && (
        <section className="card" aria-labelledby="demo-claims-heading">
          <h2 id="demo-claims-heading">Sample claims</h2>
          <ul className="plain-list">
            {MOCK_CLAIMS.map((claim) => (
              <li key={claim.claimId}>
                <StatusBadge status={claim.status} />{' '}
                <Link to={`/claims/${claim.claimId}`}>
                  Claim <code>{truncateMiddle(claim.claimId)}</code>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
