// =============================================================================
// Proof of Aid — Team 05 — Tests for VITE_* validation and demo (mock) mode
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { anvil, arbitrumSepolia } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

// Deterministic first anvil deployment addresses: valid, checksummed, and not tied to anyone.
const CLAIM_REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const PARTICIPANT_REGISTRY = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

describe('parseEnv', () => {
  it('uses demo data on anvil when nothing is configured', () => {
    expect(parseEnv({})).toEqual({
      ok: true,
      value: {
        chainKey: 'anvil',
        chain: anvil,
        rpcUrl: undefined,
        apiUrl: undefined,
        logChunkSize: 50_000n,
        contracts: { mode: 'mock' },
      },
    });
  });

  it('treats empty values from a copied .env.example as not set', () => {
    const result = parseEnv({
      VITE_CHAIN: '',
      VITE_RPC_URL: '',
      VITE_CLAIM_REGISTRY_ADDRESS: '',
      VITE_PARTICIPANT_REGISTRY_ADDRESS: '',
      VITE_API_URL: '',
    });
    expect(result).toMatchObject({ ok: true, value: { chainKey: 'anvil', contracts: { mode: 'mock' } } });
  });

  it('reads real contracts on Arbitrum Sepolia when both addresses are set', () => {
    const result = parseEnv({
      VITE_CHAIN: 'arbitrumSepolia',
      VITE_RPC_URL: 'https://sepolia-rollup.arbitrum.io/rpc',
      VITE_CLAIM_REGISTRY_ADDRESS: CLAIM_REGISTRY,
      VITE_PARTICIPANT_REGISTRY_ADDRESS: PARTICIPANT_REGISTRY,
      VITE_API_URL: 'http://localhost:8000',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        chainKey: 'arbitrumSepolia',
        chain: arbitrumSepolia,
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
        apiUrl: 'http://localhost:8000',
        logChunkSize: 50_000n,
        contracts: {
          mode: 'chain',
          claimRegistry: CLAIM_REGISTRY,
          participantRegistry: PARTICIPANT_REGISTRY,
          deployBlock: 0n,
        },
      },
    });
  });

  it('normalises lowercase addresses to their checksummed form', () => {
    const result = parseEnv({
      VITE_CLAIM_REGISTRY_ADDRESS: CLAIM_REGISTRY.toLowerCase(),
      VITE_PARTICIPANT_REGISTRY_ADDRESS: ` ${PARTICIPANT_REGISTRY.toLowerCase()} `,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { contracts: { claimRegistry: CLAIM_REGISTRY, participantRegistry: PARTICIPANT_REGISTRY } },
    });
  });

  it('rejects a malformed address and names the variable', () => {
    const result = parseEnv({
      VITE_CLAIM_REGISTRY_ADDRESS: '0x1234',
      VITE_PARTICIPANT_REGISTRY_ADDRESS: PARTICIPANT_REGISTRY,
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('VITE_CLAIM_REGISTRY_ADDRESS') });
  });

  it('rejects a mixed-case address whose checksum is wrong (likely a typo)', () => {
    const typo = CLAIM_REGISTRY.replace('F', 'f');
    const result = parseEnv({ VITE_CLAIM_REGISTRY_ADDRESS: typo, VITE_PARTICIPANT_REGISTRY_ADDRESS: PARTICIPANT_REGISTRY });
    expect(result.ok).toBe(false);
  });

  it('rejects a half-configured deployment instead of mixing real and demo data', () => {
    const result = parseEnv({ VITE_CLAIM_REGISTRY_ADDRESS: CLAIM_REGISTRY });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('VITE_PARTICIPANT_REGISTRY_ADDRESS') });
  });

  it('rejects an unknown chain', () => {
    expect(parseEnv({ VITE_CHAIN: 'mainnet' })).toMatchObject({ ok: false, error: expect.stringContaining('VITE_CHAIN') });
  });

  it('rejects RPC and API URLs that are not http(s)', () => {
    expect(parseEnv({ VITE_RPC_URL: 'ftp://example.org' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('VITE_RPC_URL'),
    });
    expect(parseEnv({ VITE_API_URL: 'not a url' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('VITE_API_URL'),
    });
  });

  it('reads the deploy block and the log chunk size used for the claim history', () => {
    const result = parseEnv({
      VITE_CLAIM_REGISTRY_ADDRESS: CLAIM_REGISTRY,
      VITE_PARTICIPANT_REGISTRY_ADDRESS: PARTICIPANT_REGISTRY,
      VITE_DEPLOY_BLOCK: ' 187654321 ',
      VITE_LOG_CHUNK_SIZE: '10000',
    });
    expect(result).toMatchObject({ ok: true, value: { logChunkSize: 10_000n, contracts: { deployBlock: 187_654_321n } } });
  });

  it('rejects a deploy block or chunk size that is not a whole number of blocks', () => {
    expect(parseEnv({ VITE_DEPLOY_BLOCK: '-1' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('VITE_DEPLOY_BLOCK'),
    });
    expect(parseEnv({ VITE_DEPLOY_BLOCK: '12.5' }).ok).toBe(false);
    expect(parseEnv({ VITE_LOG_CHUNK_SIZE: '0' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('VITE_LOG_CHUNK_SIZE'),
    });
  });

  it('rejects input that is not an object', () => {
    expect(parseEnv(undefined).ok).toBe(false);
  });
});
