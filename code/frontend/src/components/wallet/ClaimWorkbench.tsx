// =============================================================================
// Proof of Aid — Team 05 — Find a claim (indexer list or pasted ID) and act on it
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState, type ReactNode } from 'react';
import type { Address, Hex } from 'viem';
import type { RegistryAddresses } from '../../chain/calls';
import { useAppConfig } from '../../hooks/useAppConfig';
import type { Role } from '../../utils/roles';
import { ClaimLookup } from '../ClaimLookup';
import { ClaimActions } from './ClaimActions';
import { ClaimQueue } from './ClaimQueue';

type ClaimWorkbenchProps = {
  role: Role;
  viewer: Address;
  verifierOrganization: Address | undefined;
  registries: RegistryAddresses;
  /** The organization's submit-proof form (needs the evidence API); others never get that action. */
  renderSubmitProof?: (claimId: Hex, rootIndex: number) => ReactNode;
};

export const NO_API_QUEUE_NOTE =
  'Without the indexer API (VITE_API_URL) there is no claim list: paste a claim ID to see what your wallet can do with it.';

const noSubmitProof = (): ReactNode => null;

export function ClaimWorkbench({ role, viewer, verifierOrganization, registries, renderSubmitProof = noSubmitProof }: ClaimWorkbenchProps) {
  const { apiUrl } = useAppConfig();
  const [selected, setSelected] = useState<Hex | undefined>();
  return (
    <section className="wallet-stack" aria-labelledby="work-heading">
      <h3 id="work-heading">Claims to act on</h3>
      {apiUrl === undefined ? (
        <p className="caption">{NO_API_QUEUE_NOTE}</p>
      ) : (
        <ClaimQueue role={role} viewer={viewer} verifierOrganization={verifierOrganization} onSelect={setSelected} />
      )}
      <ClaimLookup label="Work on a claim by its ID" buttonLabel="Show actions" onSelect={setSelected} />
      {selected !== undefined && (
        <ClaimActions
          key={selected}
          claimId={selected}
          role={role}
          viewer={viewer}
          registries={registries}
          renderSubmitProof={(rootIndex) => renderSubmitProof(selected, rootIndex)}
        />
      )}
    </section>
  );
}
