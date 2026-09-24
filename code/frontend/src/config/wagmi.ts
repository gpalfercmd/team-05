// =============================================================================
// Proof of Aid — Team 05 — wagmi configuration: one chain, injected wallet (MetaMask)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { createConfig, http, injected, type Config } from 'wagmi';
import type { AppEnv } from './env';

/**
 * Only the configured chain is registered, so every read and write targets the deployment the
 * addresses belong to. Wallet auto-discovery (EIP-6963) is off to keep a single, predictable
 * "Connect wallet" button for the demo wallets in MetaMask.
 */
export function createWagmiConfig(env: AppEnv): Config {
  const config = createConfig({
    chains: [env.chain],
    connectors: [injected()],
    multiInjectedProviderDiscovery: false,
    transports: { [env.chain.id]: http(env.rpcUrl) },
  });
  return config;
}
