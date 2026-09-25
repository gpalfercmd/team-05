// =============================================================================
// Proof of Aid — Team 05 — Role screens (workspace page): role read from the chain, then that role's actions
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import type { Address, Hex } from 'viem';
import type { RegistryAddresses } from '../../chain/calls';
import { useRole, type RoleState } from '../../hooks/useRole';
import { useRegistries, useWallet } from '../../hooks/useWallet';
import { HashDisplay } from '../HashDisplay';
import { AlertTriangleIcon } from '../icons';
import { AnchorClaimSection } from './AnchorClaimForm';
import { AuditorAccreditationPanel } from './AuditorAccreditationPanel';
import { ClaimWorkbench } from './ClaimWorkbench';
import { RegistryAdminPanel } from './RegistryAdminPanel';
import { SubmitProofForm } from './SubmitProofForm';
import { WithdrawCard } from './WithdrawCard';
import { WrongNetworkNotice } from './WrongNetworkNotice';
import './wallet.css';

type RoleActionsProps = { role: RoleState; viewer: Address; registries: RegistryAddresses; initialClaim: Hex | undefined };

function RoleActions({ role, viewer, registries, initialClaim }: RoleActionsProps) {
  // Each role sees only the actions the contracts let it take (DESIGN.md: hidden, not disabled).
  const workbench = (
    <ClaimWorkbench
      role={role.role}
      viewer={viewer}
      verifierOrganization={role.verifierOrganization}
      registries={registries}
      initialClaim={initialClaim}
      renderSubmitProof={(claimId, rootIndex, onConfirmed) => (
        <SubmitProofForm registries={registries} claimId={claimId} rootIndex={rootIndex} onConfirmed={onConfirmed} />
      )}
    />
  );
  const screens: Record<RoleState['role'], ReactNode> = {
    registryAdmin: <RegistryAdminPanel registries={registries} />,
    accreditationAuthority: <AuditorAccreditationPanel registries={registries} />,
    organization: <AnchorClaimSection registries={registries} organization={viewer} />,
    internalVerifier: null,
    auditor: null,
    public: (
      <p className="muted">
        This wallet has no registered role. Anyone can still settle a claim whose dispute window has closed.
      </p>
    ),
  };
  return (
    <>
      <WithdrawCard registries={registries} />
      {screens[role.role]}
      {workbench}
    </>
  );
}

export const DEMO_ACTIONS_NOTE =
  'Demo data: role actions need a real chain. Configure the contract addresses (see the runbook) to sign actions with your wallet.';

type WalletPanelProps = {
  /** A claim to open in the workbench straight away (the workspace's `?claim=` link). */
  initialClaim?: Hex | undefined;
};

export function WalletPanel({ initialClaim }: WalletPanelProps = {}) {
  const wallet = useWallet();
  const role = useRole();
  const registries = useRegistries();

  let content: ReactNode;
  if (registries === undefined) {
    content = <p className="muted">{DEMO_ACTIONS_NOTE}</p>;
  } else if (wallet.status === 'disconnected') {
    content = (
      <p className="muted">
        Connect your wallet to see the actions for your role. You do not need a wallet to check a claim’s evidence.
      </p>
    );
  } else {
    let body: ReactNode;
    if (wallet.wrongNetwork) {
      body = <WrongNetworkNotice walletChainId={wallet.chainId} />;
    } else if (role.status === 'error') {
      body = (
        <p className="notice" role="alert">
          <AlertTriangleIcon size={16} className="notice__icon" />
          <span>Your role could not be read from the blockchain. {role.error}</span>
        </p>
      );
    } else if (role.status === 'ready') {
      body = <RoleActions role={role} viewer={wallet.address} registries={registries} initialClaim={initialClaim} />;
    } else {
      body = (
        <p className="muted" role="status">
          Reading your role from the blockchain…
        </p>
      );
    }
    content = (
      <div className="wallet-stack">
        <p>
          Connected as <HashDisplay value={wallet.address} label="wallet address" explorer="address" />
          {role.status === 'ready' && (
            <>
              {' '}
              · Role: <strong>{role.label}</strong>
            </>
          )}
        </p>
        {body}
      </div>
    );
  }
  return content;
}
