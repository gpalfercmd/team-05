// =============================================================================
// Proof of Aid — Team 05 — Tests: the configured mode picks the demo, chain or API source
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { ContractsConfig } from '../config/env';
import { testEnv } from '../test/testEnv';
import { createClaimSource } from './createClaimSource';

const contracts: ContractsConfig = {
  mode: 'chain',
  claimRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  participantRegistry: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  deployBlock: 0n,
};

describe('createClaimSource', () => {
  it('uses demo data without contracts, even when an API is configured', () => {
    expect(createClaimSource(testEnv({ apiUrl: 'http://localhost:8000' })).kind).toBe('demo');
  });

  it('reads everything from the chain without an API', () => {
    expect(createClaimSource(testEnv({ contracts })).kind).toBe('chain');
  });

  it('takes the history from the indexer API when VITE_API_URL is set', () => {
    expect(createClaimSource(testEnv({ contracts, apiUrl: 'http://localhost:8000' })).kind).toBe('indexer');
  });
});
