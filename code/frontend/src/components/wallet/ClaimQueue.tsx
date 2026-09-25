// =============================================================================
// Proof of Aid — Team 05 — Claims waiting for the connected role, from the indexer API
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';
import { fetchClaimQueue, queueSpec } from '../../data/claimQueue';
import { browserFetch } from '../../data/httpJson';
import { useAppConfig } from '../../hooks/useAppConfig';
import type { Role } from '../../utils/roles';
import { truncateMiddle } from '../../utils/format';
import { StatusBadge } from '../StatusBadge';

type ClaimQueueProps = {
  role: Role;
  viewer: Address;
  verifierOrganization: Address | undefined;
  onSelect: (claimId: Hex) => void;
};

export function ClaimQueue({ role, viewer, verifierOrganization, onSelect }: ClaimQueueProps) {
  const { apiUrl } = useAppConfig();
  const spec = queueSpec(role, viewer, verifierOrganization);
  const query = useQuery({
    queryKey: ['claim-queue', apiUrl, role, viewer, verifierOrganization],
    queryFn: apiUrl === undefined ? skipToken : () => fetchClaimQueue(browserFetch, apiUrl, spec),
  });

  let body;
  if (query.data === undefined) {
    body = <p role="status">Loading the claim list…</p>;
  } else if (!query.data.ok) {
    body = (
      <p className="field-error" role="alert">
        The claim list could not be loaded ({query.data.error}). Paste a claim ID below instead.
      </p>
    );
  } else if (query.data.value.length === 0) {
    body = <p className="muted">{spec.empty}</p>;
  } else {
    body = (
      <ul className="claim-queue">
        {query.data.value.map((item) => (
          <li key={item.claimId} className="claim-queue__item">
            <StatusBadge status={item.status} />
            <code title={item.claimId}>{truncateMiddle(item.claimId)}</code>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={`Show actions for claim ${truncateMiddle(item.claimId)}`}
              onClick={() => onSelect(item.claimId)}
            >
              Show actions
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="wallet-stack">
      <p>
        <strong>{spec.heading}</strong> <span className="caption">(from the indexer; each claim is re-read from the contract)</span>
      </p>
      {body}
    </div>
  );
}
