// =============================================================================
// Proof of Aid — Team 05 — Wrong-network state: explain it and offer to switch the wallet
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useSwitchChain } from 'wagmi';
import { useAppConfig } from '../../hooks/useAppConfig';
import { isUserRejection } from '../../utils/contractErrors';
import { AlertTriangleIcon } from '../icons';

type WrongNetworkNoticeProps = { walletChainId: number | undefined };

export function WrongNetworkNotice({ walletChainId }: WrongNetworkNoticeProps) {
  const { chain } = useAppConfig();
  const switchChain = useSwitchChain();
  const failure =
    switchChain.error === null
      ? undefined
      : isUserRejection(switchChain.error)
        ? 'You cancelled the network switch in your wallet.'
        : `Your wallet could not switch. Add or select ${chain.name} (chain ID ${chain.id}) in your wallet yourself.`;
  return (
    <div className="wallet-stack">
      <p className="notice" role="alert">
        <AlertTriangleIcon size={16} className="notice__icon" />
        <span>
          Wrong network: your wallet is on chain ID {walletChainId ?? 'unknown'}, but this app records on{' '}
          <strong>{chain.name}</strong> (chain ID {chain.id}). Nothing can be signed until you switch.
        </span>
      </p>
      <p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={switchChain.isPending}
          onClick={() => switchChain.mutate({ chainId: chain.id })}
        >
          {switchChain.isPending ? 'Confirm in wallet…' : `Switch to ${chain.name}`}
        </button>
      </p>
      {failure !== undefined && (
        <p className="field-error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
