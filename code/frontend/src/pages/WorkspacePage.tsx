// =============================================================================
// Proof of Aid — Team 05 — Workspace (`/workspace`): what needs this wallet's action, then its role screens
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useSearchParams } from 'react-router';
import { isHex, type Hex } from 'viem';
import { ConnectButton } from '../components/ConnectButton';
import { ActionList } from '../components/wallet/ActionList';
import { WalletPanel } from '../components/wallet/WalletPanel';
import { useRole } from '../hooks/useRole';
import { useRegistries, useWallet } from '../hooks/useWallet';

const CLAIM_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** `?claim=0x…` opens that claim in the workbench; anything else is ignored. */
function useLinkedClaim(): Hex | undefined {
  const [params] = useSearchParams();
  const value = params.get('claim') ?? '';
  return isHex(value) && CLAIM_ID_PATTERN.test(value) ? (value.toLowerCase() as Hex) : undefined;
}

export function WorkspacePage() {
  const wallet = useWallet();
  const role = useRole();
  const registries = useRegistries();
  const linkedClaim = useLinkedClaim();
  // The to-do list needs a readable role on the right network; every other state (demo data,
  // not connected, wrong network, role not read yet) is explained by the role screens below.
  const ready = registries !== undefined && wallet.status === 'connected' && !wallet.wrongNetwork && role.status === 'ready';

  return (
    <div className="page">
      <div className="page__header">
        <p className="eyebrow">Workspace</p>
        <h1>Your workspace</h1>
        <p className="page__lead">
          The claims waiting for your role and the actions your wallet may take. Every action is checked against the contract
          before you sign it.
        </p>
      </div>

      {ready && wallet.status === 'connected' && (
        <section className="card" aria-labelledby="needs-action-heading">
          <ActionList role={role.role} viewer={wallet.address} verifierOrganization={role.verifierOrganization} />
        </section>
      )}

      <section className="card wallet-stack" aria-labelledby="role-screens-heading">
        <h2 id="role-screens-heading">Role screens</h2>
        <WalletPanel initialClaim={linkedClaim} />
        {registries !== undefined && wallet.status === 'disconnected' && (
          <div>
            <ConnectButton />
          </div>
        )}
      </section>
    </div>
  );
}
