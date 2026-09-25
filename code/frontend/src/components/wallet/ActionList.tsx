// =============================================================================
// Proof of Aid — Team 05 — "What needs your action": the claims and funds waiting for this wallet
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatEther, type Address } from 'viem';
import { useActionItems } from '../../hooks/useActionItems';
import { useCredits } from '../../hooks/useEscrowParams';
import { truncateMiddle } from '../../utils/format';
import type { Role } from '../../utils/roles';
import { HashDisplay } from '../HashDisplay';
import { Skeleton } from '../Skeleton';
import { StatusBadge } from '../StatusBadge';

type ActionListProps = {
  role: Role;
  viewer: Address;
  verifierOrganization: Address | undefined;
};

export const NOTHING_TO_DO = 'Nothing needs your action right now.';
export const NO_API_ACTIONS_NOTE =
  'This list needs the indexer API (VITE_API_URL), which is not configured here. You can still paste a claim ID in the role screens below to see what your wallet can do with it.';

export function ActionList({ role, viewer, verifierOrganization }: ActionListProps) {
  const lookup = useActionItems(role, viewer, verifierOrganization);
  const credits = useCredits();
  const owed = credits?.ok === true ? credits.value : 0n;

  const funds =
    owed > 0n ? (
      <li className="action-list__item">
        <span>
          The contract holds <strong>{formatEther(owed)} ETH</strong> for this wallet.
        </span>
        <a className="btn btn-secondary" href="#withdraw-heading">
          Withdraw
        </a>
      </li>
    ) : null;

  let claims: ReactNode = null;
  let empty = false;
  switch (lookup.state) {
    case 'no-api':
      claims = <p className="caption">{NO_API_ACTIONS_NOTE}</p>;
      break;
    case 'loading':
      claims = <Skeleton label="Finding the claims that wait for you" rows={2} title={false} variant="row" />;
      break;
    case 'error':
      claims = (
        <p className="field-error" role="alert">
          The list could not be loaded ({lookup.message}). Paste a claim ID in the role screens below instead.
        </p>
      );
      break;
    case 'ready':
      empty = lookup.items.length === 0;
      claims = lookup.items.map((item) => (
        <li key={item.claimId} className="action-list__item">
          <StatusBadge status={item.status} />
          <HashDisplay value={item.claimId} label="claim ID" />
          <span className="action-list__text">{item.actions.join(' ')}</span>
          <span className="action-list__links">
            <Link
              className="btn btn-secondary"
              to={`/workspace?claim=${item.claimId}`}
              aria-label={`Open actions for claim ${truncateMiddle(item.claimId)}`}
            >
              Open actions
            </Link>
            <Link to={`/claims/${item.claimId}`} aria-label={`Public page of claim ${truncateMiddle(item.claimId)}`}>
              Public page
            </Link>
          </span>
        </li>
      ));
      break;
  }

  const listed = lookup.state === 'ready' && !empty;
  return (
    <div className="wallet-stack">
      <h2 id="needs-action-heading">What needs your action</h2>
      {(funds !== null || listed) && (
        <ul className="action-list">
          {funds}
          {listed && claims}
        </ul>
      )}
      {!listed && lookup.state !== 'ready' && claims}
      {empty && funds === null && <p className="muted">{NOTHING_TO_DO}</p>}
    </div>
  );
}
