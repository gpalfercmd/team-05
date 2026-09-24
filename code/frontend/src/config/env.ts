// =============================================================================
// Proof of Aid — Team 05 — Startup validation of VITE_* variables into a typed config
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, isAddress, type Address, type Chain } from 'viem';
import { z } from 'zod';
import { err, ok, type Result } from '../utils/result';
import { CHAIN_KEYS, SUPPORTED_CHAINS, type ChainKey } from './chains';

/** Without contract addresses the app runs on demo data, so the UI can be built before P2 deploys. */
export type ContractsConfig =
  | { mode: 'mock' }
  | { mode: 'chain'; claimRegistry: Address; participantRegistry: Address };

export type AppEnv = {
  chainKey: ChainKey;
  chain: Chain;
  /** Custom RPC endpoint; `undefined` falls back to the chain's public RPC. */
  rpcUrl: string | undefined;
  /** Optional P4 indexer API; the public page must work without it. */
  apiUrl: string | undefined;
  contracts: ContractsConfig;
};

// `KEY=` in a .env file reaches the app as an empty string; it means "not set", not "invalid".
const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const httpUrlSchema = z.preprocess(emptyToUndefined, z.url({ protocol: /^https?$/ }).optional());

const addressSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .refine((value) => isAddress(value), {
      message: 'Expected a 0x-prefixed 20-byte address (mixed-case addresses must have a valid checksum)',
    })
    .transform((value) => getAddress(value))
    .optional(),
);

const rawEnvSchema = z.object({
  VITE_CHAIN: z.preprocess(emptyToUndefined, z.enum(CHAIN_KEYS).default('anvil')),
  VITE_RPC_URL: httpUrlSchema,
  VITE_CLAIM_REGISTRY_ADDRESS: addressSchema,
  VITE_PARTICIPANT_REGISTRY_ADDRESS: addressSchema,
  VITE_API_URL: httpUrlSchema,
});

/** Validates raw environment values; pure so tests can feed it any object. */
export function parseEnv(raw: unknown): Result<AppEnv, string> {
  const parsed = rawEnvSchema.safeParse(raw);
  if (!parsed.success) {
    return err(z.prettifyError(parsed.error));
  }
  const { VITE_CLAIM_REGISTRY_ADDRESS: claimRegistry, VITE_PARTICIPANT_REGISTRY_ADDRESS: participantRegistry } =
    parsed.data;
  // Half a deployment is a mistake, not a demo: fail loudly rather than mix real and mock data.
  if ((claimRegistry === undefined) !== (participantRegistry === undefined)) {
    return err(
      'Set both VITE_CLAIM_REGISTRY_ADDRESS and VITE_PARTICIPANT_REGISTRY_ADDRESS, or leave both empty to use demo data.',
    );
  }
  const contracts: ContractsConfig =
    claimRegistry !== undefined && participantRegistry !== undefined
      ? { mode: 'chain', claimRegistry, participantRegistry }
      : { mode: 'mock' };
  const result = ok({
    chainKey: parsed.data.VITE_CHAIN,
    chain: SUPPORTED_CHAINS[parsed.data.VITE_CHAIN],
    rpcUrl: parsed.data.VITE_RPC_URL,
    apiUrl: parsed.data.VITE_API_URL,
    contracts,
  });
  return result;
}

/** Reads the variables Vite injected at build time. */
export const loadEnv = (): Result<AppEnv, string> => parseEnv(import.meta.env);
