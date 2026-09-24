// =============================================================================
// Proof of Aid — Team 05 — Tests: ApiClaimSource (indexer history, contract status, chain fallback)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { anvil } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { DEMO_EVIDENCE_PATH } from '../config/demoEvidence';
import { toIndexedEvent } from '../test/indexedFixture';
import { json, stubFetch, type StubAnswer } from '../test/stubFetch';
import { FIRST_BLOCK, fullStory, REGISTRY, stubNode, UNKNOWN_CLAIM } from '../test/stubChainNode';
import type { ClaimEventLog } from './timeline';
import { ApiClaimSource } from './apiClaimSource';
import { ChainClaimSource } from './chainClaimSource';
import { DEMO_STATIC_MANIFESTS, PublishedManifests } from './publishedManifests';

const API = 'http://localhost:8000';
const LATEST_BLOCK = 9_000_000n;
const INDEXED_TO = LATEST_BLOCK - 10n;
const timelineUrl = (claimId: Hex = fullStory.claimId): string => `${API}/public/claims/${claimId}/timeline`;
const OTHER_ROOT = `0x${'77'.repeat(32)}`;

/** A `ClaimTimeline` answer as app/api/public.py builds it, from the given demo logs. */
const timelineBody = (logs: readonly ClaimEventLog[] = fullStory.logs, overrides: Record<string, unknown> = {}) => ({
  claimId: fullStory.claimId,
  chainId: anvil.id,
  claimRegistry: REGISTRY.toLowerCase(),
  status: fullStory.status,
  evidenceRoots: [...fullStory.evidenceRoots],
  events: logs.map(toIndexedEvent),
  indexedToBlock: Number(INDEXED_TO),
  ...overrides,
});

function sources(routes: Readonly<Record<string, StubAnswer>>) {
  const node = stubNode({ latestBlock: LATEST_BLOCK });
  const http = stubFetch(routes);
  const manifests = new PublishedManifests({ apiUrl: API, staticManifests: DEMO_STATIC_MANIFESTS, fetch: http.fetch });
  const chain = new ChainClaimSource(node.client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 1_000_000n, manifests });
  const api = new ApiClaimSource(chain, { apiUrl: API, chainId: anvil.id, claimRegistry: REGISTRY, fetch: http.fetch });
  return { api, chain, ranges: node.ranges, requested: http.requested };
}

/** The page as the chain-only source builds it: what the API source must never fall below. */
async function chainView() {
  const { chain } = sources({});
  const view = await chain.getClaim(fullStory.claimId);
  if (!view.ok) {
    throw new Error('The stub node must serve the demo claim.');
  }
  return view.value;
}

describe('ApiClaimSource', () => {
  it('takes a complete history from the API and renders it exactly like the chain history', async () => {
    const { api, ranges, requested } = sources({ [timelineUrl()]: json(timelineBody()) });
    const result = await api.getClaim(fullStory.claimId);
    expect(result).toEqual({ ok: true, value: { ...(await chainView()), source: 'indexer' } });
    // Only the short tail after the indexer's cursor is read from the chain, not the whole history.
    expect(ranges).toEqual([[INDEXED_TO + 1n, LATEST_BLOCK]]);
    expect(requested[0]).toBe(timelineUrl());
  });

  it('still publishes the verified demo file lists when the API has none (404)', async () => {
    const { api } = sources({ [timelineUrl()]: json(timelineBody()) });
    const result = await api.getClaim(fullStory.claimId);
    expect(result.ok && result.value.evidence.map((bundle) => bundle.manifestHref)).toEqual([
      `${DEMO_EVIDENCE_PATH}manifest.json`,
      `${DEMO_EVIDENCE_PATH}manifest-proof-1.json`,
    ]);
  });

  it('takes status and evidence roots from the contract, whatever the API claims', async () => {
    const body = timelineBody(fullStory.logs, { status: 'Rejected', evidenceRoots: [OTHER_ROOT] });
    const { api } = sources({ [timelineUrl()]: json(body) });
    const result = await api.getClaim(fullStory.claimId);
    expect(result.ok && result.value.source).toBe('indexer');
    expect(result.ok && result.value.status).toBe('Verified');
    expect(result.ok && result.value.evidence.map((bundle) => bundle.root)).toEqual(fullStory.evidenceRoots);
  });

  it.each<[string, StubAnswer]>([
    ['unreachable', { networkError: 'Failed to fetch' }],
    ['a server error', json({ detail: 'boom' }, 500)],
    ['a claim it has not indexed (404)', json({ detail: 'claim not indexed' }, 404)],
    ['malformed data', json({ ...timelineBody(), events: [{ event: 'ClaimAnchored' }] })],
  ])('falls back to the chain history when the API is %s', async (_, answer) => {
    const { api, ranges } = sources({ [timelineUrl()]: answer });
    const result = await api.getClaim(fullStory.claimId);
    expect(result).toEqual({ ok: true, value: await chainView() });
    expect(ranges.at(-1)?.[0]).toBe(FIRST_BLOCK);
  });

  it('falls back when the index is behind: the chain has events after its cursor', async () => {
    // Indexed up to the final attestation; the dispute (opened and dismissed) came later. Status
    // and roots are the same before and after, so only the chain tail can reveal the gap.
    const finalAttestation = fullStory.logs.find((log) => log.eventName === 'FinalAttestation');
    const cursor = finalAttestation?.blockNumber ?? 0n;
    const indexed = fullStory.logs.filter((log) => log.blockNumber <= cursor);
    const { api, ranges } = sources({ [timelineUrl()]: json(timelineBody(indexed, { indexedToBlock: Number(cursor) })) });
    const result = await api.getClaim(fullStory.claimId);
    expect(result).toEqual({ ok: true, value: await chainView() });
    expect(result.ok && result.value.timeline).toHaveLength(9);
    expect(ranges).toEqual([
      [cursor + 1n, LATEST_BLOCK],
      [FIRST_BLOCK, LATEST_BLOCK],
    ]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['has no cursor yet', { indexedToBlock: null }],
    ['follows another chain', { chainId: 421614 }],
    ['follows another registry', { claimRegistry: `0x${'ab'.repeat(20)}` }],
    ['answers for another claim', { claimId: UNKNOWN_CLAIM }],
  ])('falls back when the API %s', async (_, overrides) => {
    const { api } = sources({ [timelineUrl()]: json(timelineBody(fullStory.logs, overrides)) });
    expect(await api.getClaim(fullStory.claimId)).toEqual({ ok: true, value: await chainView() });
  });

  it('falls back when the indexed history does not end in the contract status or roots', async () => {
    const withoutProof = fullStory.logs.filter((log) => log.eventName !== 'ProofSubmitted');
    const withoutLastStatus = fullStory.logs.slice(0, -1);
    for (const logs of [withoutProof, withoutLastStatus]) {
      const { api } = sources({ [timelineUrl()]: json(timelineBody(logs)) });
      const result = await api.getClaim(fullStory.claimId);
      expect(result.ok && result.value.source).toBe('chain');
    }
  });

  it('reports not-found from the contract, even if the API knows the claim ID', async () => {
    const { api } = sources({ [timelineUrl(UNKNOWN_CLAIM)]: json(timelineBody(fullStory.logs, { claimId: UNKNOWN_CLAIM })) });
    expect(await api.getClaim(UNKNOWN_CLAIM)).toEqual({ ok: false, error: { kind: 'not-found' } });
  });
});
