// =============================================================================
// Proof of Aid — Team 05 — One claim's panel: stage, why, and only the actions the wallet may take
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Hex } from 'viem';
import { planClaimActions } from '../../chain/claimActions';
import type { RegistryAddresses } from '../../chain/calls';
import { useClaimActionState } from '../../hooks/useClaimActionState';
import { useEscrowParams } from '../../hooks/useEscrowParams';
import type { Role } from '../../utils/roles';
import { truncateMiddle } from '../../utils/format';
import { HashDisplay } from '../HashDisplay';
import { StatusBadge } from '../StatusBadge';
import { ClaimActionForm, type ClaimActionFormProps } from './ClaimActionForm';

type ClaimActionsProps = {
  claimId: Hex;
  role: Role;
  viewer: `0x${string}`;
  registries: RegistryAddresses;
  renderSubmitProof: ClaimActionFormProps['renderSubmitProof'];
};

export function ClaimActions({ claimId, role, viewer, registries, renderSubmitProof }: ClaimActionsProps) {
  const lookup = useClaimActionState(claimId);
  const params = useEscrowParams();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Choosing a claim moves focus to its panel, so keyboard and screen-reader users follow along.
  useEffect(() => {
    headingRef.current?.focus();
  }, [claimId]);

  let body: ReactNode;
  switch (lookup.state) {
    case 'loading':
      body = <p role="status">Reading this claim from the blockchain…</p>;
      break;
    case 'not-found':
      body = <p role="status">No claim with this ID has been recorded on the blockchain.</p>;
      break;
    case 'error':
      body = (
        <div role="alert" className="wallet-stack">
          <p>This claim could not be read from the blockchain. {lookup.message}</p>
          <p>
            <button type="button" className="btn btn-secondary" onClick={lookup.retry}>
              Try again
            </button>
          </p>
        </div>
      );
      break;
    case 'found': {
      const plan = planClaimActions(role, viewer, lookup.claim);
      body = (
        <>
          <p>
            <StatusBadge status={lookup.claim.status} /> · Organization{' '}
            <HashDisplay value={lookup.claim.organization} label="organization address" explorer="address" />
          </p>
          <ul className="plain-list">
            {plan.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {plan.actions.length === 0 && <p className="muted">There is nothing for your wallet to do on this claim right now.</p>}
          {params?.ok === false && (
            <p className="field-error" role="alert">
              The deposit amounts could not be read from the contract, so payable actions are disabled. {params.error}
            </p>
          )}
          {plan.actions.map((action) => (
            <ClaimActionForm
              key={action.kind}
              action={action}
              claim={lookup.claim}
              registries={registries}
              params={params}
              renderSubmitProof={renderSubmitProof}
            />
          ))}
          <p className="caption">
            <Link to={`/claims/${claimId}`}>Open the public claim page</Link> to see its evidence and full history.
          </p>
        </>
      );
      break;
    }
  }

  return (
    <section className="claim-panel" aria-labelledby={headingId}>
      <h4 id={headingId} ref={headingRef} tabIndex={-1}>
        Claim <code title={claimId}>{truncateMiddle(claimId)}</code>
      </h4>
      {body}
    </section>
  );
}
