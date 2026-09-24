// =============================================================================
// Proof of Aid — Team 05 — Supported chains: Arbitrum Sepolia (demo) and local anvil (dev)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { anvil, arbitrumSepolia } from 'viem/chains';

export const SUPPORTED_CHAINS = { anvil, arbitrumSepolia } as const;

export type ChainKey = keyof typeof SUPPORTED_CHAINS;

/** Accepted values of `VITE_CHAIN`. */
export const CHAIN_KEYS = ['anvil', 'arbitrumSepolia'] as const satisfies readonly ChainKey[];
