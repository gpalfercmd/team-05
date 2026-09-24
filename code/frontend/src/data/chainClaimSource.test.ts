// =============================================================================
// Proof of Aid — Team 05 — Tests: ChainClaimSource over a stubbed JSON-RPC node (chunks, halving)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import {
  InvalidInputRpcError,
  LimitExceededRpcError,
  numberToHex,
  RpcError,
  TimeoutError,
  type Hex,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { FIRST_BLOCK, fullStory, REGISTRY, stubNode, toRawLog, UNKNOWN_CLAIM } from '../test/stubChainNode';
import { stubFetch } from '../test/stubFetch';
import { ChainClaimSource, isLogRangeError } from './chainClaimSource';
import { MockClaimSource } from './mockClaimSource';
import { DEMO_STATIC_MANIFESTS, PublishedManifests } from './publishedManifests';

describe('ChainClaimSource', () => {
  it('reads the same claim view from the contract as the demo source builds from its snapshot', async () => {
    const { client } = stubNode();
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 1_000_000n });
    const fromChain = await source.getClaim(fullStory.claimId);
    const fromDemo = await new MockClaimSource([{ ...fullStory, published: new Map() }]).getClaim(fullStory.claimId);
    expect(fromChain.ok).toBe(true);
    expect(fromChain).toEqual(fromDemo.ok ? { ok: true, value: { ...fromDemo.value, source: 'chain' } } : fromDemo);
  });

  it('shows the same verified file lists and downloads as demo mode when the demo files are served', async () => {
    const { client } = stubNode();
    const manifests = new PublishedManifests({ apiUrl: undefined, staticManifests: DEMO_STATIC_MANIFESTS, fetch: stubFetch().fetch });
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 1_000_000n, manifests });
    const fromChain = await source.getClaim(fullStory.claimId);
    const fromDemo = await new MockClaimSource([fullStory]).getClaim(fullStory.claimId);
    expect(fromChain).toEqual(fromDemo.ok ? { ok: true, value: { ...fromDemo.value, source: 'chain' } } : fromDemo);
  });

  it('reports not-found when statusOf is None, without scanning the history', async () => {
    const { client, ranges } = stubNode();
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: 0n });
    expect(await source.getClaim(UNKNOWN_CLAIM)).toEqual({ ok: false, error: { kind: 'not-found' } });
    expect(ranges).toEqual([]);
  });

  it('reads the history in chunks from the deploy block to the latest block', async () => {
    const { client, ranges } = stubNode({ latestBlock: FIRST_BLOCK + 9n });
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 4n });
    await source.getClaim(fullStory.claimId);
    expect(ranges).toEqual([
      [FIRST_BLOCK, FIRST_BLOCK + 3n],
      [FIRST_BLOCK + 4n, FIRST_BLOCK + 7n],
      [FIRST_BLOCK + 8n, FIRST_BLOCK + 9n],
    ]);
  });

  it('halves the range when the node refuses it, then keeps the smaller range', async () => {
    const { client, ranges } = stubNode({ latestBlock: FIRST_BLOCK + 3n, maxRange: 2n });
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 8n });
    const result = await source.getClaim(fullStory.claimId);
    expect(result.ok).toBe(true);
    expect(ranges).toEqual([
      [FIRST_BLOCK, FIRST_BLOCK + 3n],
      [FIRST_BLOCK, FIRST_BLOCK + 3n],
      [FIRST_BLOCK, FIRST_BLOCK + 1n],
      [FIRST_BLOCK + 2n, FIRST_BLOCK + 3n],
    ]);
  });

  it('gives up with a clear error after a few halvings', async () => {
    const { client, ranges } = stubNode({ latestBlock: FIRST_BLOCK + 100n, maxRange: 1n });
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 64n, maxHalvings: 2 });
    const result = await source.getClaim(fullStory.claimId);
    expect(result).toMatchObject({ ok: false, error: { kind: 'history-too-large', detail: expect.stringContaining('16 blocks') } });
    expect(ranges.map(([from, to]) => to - from + 1n)).toEqual([64n, 32n, 16n]);
  });

  it('reports the node as unavailable when a contract read fails', async () => {
    const { client } = stubNode({ failCalls: true });
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: 0n });
    expect(await source.getClaim(fullStory.claimId)).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });

  it('ignores logs of other events or other claims that share the topic filter', async () => {
    const [firstLog] = fullStory.logs;
    const stray = firstLog === undefined ? [] : [toRawLog(firstLog)].map((log) => ({ ...log, topics: [`0x${'12'.repeat(32)}` as Hex, ...log.topics.slice(1)] }));
    const removed = firstLog === undefined ? [] : [{ ...toRawLog(firstLog), logIndex: numberToHex(9), removed: true }];
    const { client } = stubNode({ extraLogs: [...stray, ...removed] });
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 1_000_000n });
    const result = await source.getClaim(fullStory.claimId);
    expect(result.ok && result.value.timeline).toHaveLength(9);
  });
});

describe('isLogRangeError', () => {
  const rpcFailure = (error: RpcError) => new RpcError(error, { code: error.code, shortMessage: error.shortMessage });

  it('recognises the usual "range too large" answers', () => {
    expect(isLogRangeError(new LimitExceededRpcError(new Error('query returned more than 10000 results')))).toBe(true);
    expect(isLogRangeError(new InvalidInputRpcError(new Error('block range too large')))).toBe(true);
    expect(isLogRangeError(new TimeoutError({ body: {}, url: 'http://localhost:8545' }))).toBe(true);
    expect(isLogRangeError(rpcFailure(new RpcError(new Error('Log response size exceeded.'), { code: -32602, shortMessage: 'bad' })))).toBe(true);
  });

  it('does not mistake other failures for a range problem', () => {
    expect(isLogRangeError(new InvalidInputRpcError(new Error('invalid address')))).toBe(false);
    expect(isLogRangeError(new Error('network down'))).toBe(false);
  });
});
