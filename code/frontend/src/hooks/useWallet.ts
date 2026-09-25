// =============================================================================
// Proof of Aid — Team 05 — Connected wallet, the configured registries and a read client for them
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address, PublicClient } from 'viem';
import { useConnection, usePublicClient } from 'wagmi';
import type { RegistryAddresses } from '../chain/calls';
import { useAppConfig } from './useAppConfig';

export type WalletState =
  | { status: 'disconnected' }
  /** `wrongNetwork`: the wallet is on another chain, so nothing may be signed until it switches. */
  | { status: 'connected'; address: Address; chainId: number | undefined; wrongNetwork: boolean };

export function useWallet(): WalletState {
  const { chain } = useAppConfig();
  const connection = useConnection();
  const wallet: WalletState =
    connection.status === 'connected'
      ? {
          status: 'connected',
          address: connection.address,
          chainId: connection.chainId,
          wrongNetwork: connection.chainId !== chain.id,
        }
      : { status: 'disconnected' };
  return wallet;
}

/** The deployed registries, or `undefined` in demo mode (nothing to read or sign). */
export function useRegistries(): RegistryAddresses | undefined {
  const { contracts } = useAppConfig();
  const registries =
    contracts.mode === 'chain'
      ? { claimRegistry: contracts.claimRegistry, participantRegistry: contracts.participantRegistry }
      : undefined;
  return registries;
}

/** Reads always go through the app's own RPC, never the wallet, so they work on the wrong network too. */
export function useReadClient(): PublicClient | undefined {
  const { chain } = useAppConfig();
  const client = usePublicClient({ chainId: chain.id });
  return client;
}
