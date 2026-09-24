// =============================================================================
// Proof of Aid — Team 05 — Tests: the indexer's ClaimTimeline JSON becomes the chain source's logs
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { toIndexedEvent } from '../test/indexedFixture';
import { fullStory } from '../test/stubChainNode';
import { parseIndexedTimeline } from './indexedTimeline';

const CLAIM = '0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28';
const ORG = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const TX = '0x1111111111111111111111111111111111111111111111111111111111111111';
const ROOT = '0x515344752095a24904ad32a660a1d15ddbf9c49e90f43d58323d76e398548707';
const META = '0x2222222222222222222222222222222222222222222222222222222222222222';

// Written by hand in the exact shape of GET /public/claims/{id}/timeline (app/schemas.py).
const backendSample = {
  claimId: CLAIM,
  chainId: 421614,
  claimRegistry: '0x44780bed68bdd0f9b9a74d82de81b4c069234bfe',
  status: 'Anchored',
  evidenceRoots: [ROOT],
  events: [
    {
      blockNumber: 312262200,
      txHash: TX,
      logIndex: 0,
      timestamp: '2026-09-24T10:00:05Z',
      event: 'ClaimAnchored',
      args: { claimId: CLAIM, organization: ORG, evidenceRoot: ROOT, metadataHash: META },
    },
    {
      blockNumber: 312262200,
      txHash: TX,
      logIndex: 1,
      timestamp: '2026-09-24T10:00:05Z',
      event: 'StatusChanged',
      args: { claimId: CLAIM, from: 'None', to: 'Anchored' },
    },
  ],
  indexedToBlock: 312262300,
};

describe('parseIndexedTimeline', () => {
  it('maps backend events to exactly what viem decodes from the raw logs', () => {
    const parsed = parseIndexedTimeline(backendSample);
    expect(parsed).toEqual({
      ok: true,
      value: {
        claimId: CLAIM,
        chainId: 421614,
        claimRegistry: getAddress('0x44780bed68bdd0f9b9a74d82de81b4c069234bfe'),
        indexedToBlock: 312262300n,
        logs: [
          {
            eventName: 'ClaimAnchored',
            args: { claimId: CLAIM, organization: getAddress(ORG), evidenceRoot: ROOT, metadataHash: META },
            blockNumber: 312262200n,
            logIndex: 0,
            transactionHash: TX,
            timestamp: Date.parse('2026-09-24T10:00:05Z') / 1000,
          },
          {
            eventName: 'StatusChanged',
            args: { claimId: CLAIM, from: 0, to: 1 },
            blockNumber: 312262200n,
            logIndex: 1,
            transactionHash: TX,
            timestamp: Date.parse('2026-09-24T10:00:05Z') / 1000,
          },
        ],
      },
    });
  });

  it('round-trips every event kind of the demo story', () => {
    const parsed = parseIndexedTimeline({ ...backendSample, claimId: fullStory.claimId, events: fullStory.logs.map(toIndexedEvent) });
    expect(parsed.ok && parsed.value.logs).toEqual(fullStory.logs);
  });

  it('refuses unknown events, unknown statuses, missing arguments and foreign claims', () => {
    const [anchored, changed] = backendSample.events;
    const variants = [
      { ...backendSample, events: [{ ...anchored, event: 'RoleGranted' }] },
      { ...backendSample, events: [{ ...changed, args: { claimId: CLAIM, from: 'None', to: 'Approved' } }] },
      { ...backendSample, events: [{ ...anchored, args: { claimId: CLAIM, organization: ORG } }] },
      { ...backendSample, events: [{ ...changed, args: { claimId: META, from: 'None', to: 'Anchored' } }] },
      { ...backendSample, indexedToBlock: 'latest' },
      { detail: 'claim not indexed' },
    ];
    for (const variant of variants) {
      expect(parseIndexedTimeline(variant).ok).toBe(false);
    }
  });

  it('reads a missing cursor as "not indexed yet"', () => {
    const parsed = parseIndexedTimeline({ ...backendSample, indexedToBlock: null });
    expect(parsed.ok && parsed.value.indexedToBlock).toBeUndefined();
  });
});
