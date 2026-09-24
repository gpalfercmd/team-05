// =============================================================================
// Proof of Aid — Team 05 — Tests: ChainClaimSource over a stubbed JSON-RPC node (chunks, halving)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  hexToBigInt,
  InvalidInputRpcError,
  LimitExceededRpcError,
  numberToHex,
  RpcError,
  TimeoutError,
  zeroAddress,
  type Abi,
  type AbiEvent,
  type Hex,
} from 'viem';
import { anvil } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { MOCK_CLAIMS } from '../mocks/claims';
import { statusIndexFromName } from '../utils/claimStatus';
import type { ClaimSnapshot } from './assembleClaimView';
import { ChainClaimSource, isLogRangeError } from './chainClaimSource';
import { claimRegistryReadAbi } from './claimRegistryAbi';
import { MockClaimSource } from './mockClaimSource';
import type { ClaimEventLog } from './timeline';

const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const UNKNOWN_CLAIM = `0x${'99'.repeat(32)}` as Hex;

function firstDemoClaim(): ClaimSnapshot {
  const [claim] = MOCK_CLAIMS;
  if (claim === undefined) {
    throw new Error('The demo data must start with the full-story claim.');
  }
  return claim;
}

const fullStory = firstDemoClaim();

type RpcLog = { address: string; topics: Hex[]; data: Hex; blockNumber: Hex; logIndex: Hex; transactionHash: Hex; removed: boolean };

/** Encodes a decoded demo event back into the raw log a node would return. */
function toRawLog(log: ClaimEventLog): RpcLog {
  const abi = claimRegistryReadAbi as Abi;
  const event = abi.find((item): item is AbiEvent => item.type === 'event' && item.name === log.eventName);
  const args = log.args as Record<string, unknown>;
  const dataInputs = event?.inputs.filter((input) => input.indexed !== true) ?? [];
  const raw: RpcLog = {
    address: REGISTRY,
    topics: encodeEventTopics({ abi, eventName: log.eventName, args }) as Hex[],
    data: encodeAbiParameters(dataInputs, dataInputs.map((input) => args[input.name ?? ''])),
    blockNumber: numberToHex(log.blockNumber),
    logIndex: numberToHex(log.logIndex),
    transactionHash: log.transactionHash,
    removed: false,
  };
  return raw;
}

type NodeOptions = {
  claims?: readonly ClaimSnapshot[];
  extraLogs?: readonly RpcLog[];
  latestBlock?: bigint;
  /** Largest block range the node accepts; bigger ranges fail like Infura (-32005). */
  maxRange?: bigint;
  failCalls?: boolean;
};

type RequestArgs = { method: string; params?: unknown };

/** A tiny JSON-RPC node serving the given claims, recording every eth_getLogs range. */
function stubNode(options: NodeOptions = {}) {
  const claims = options.claims ?? [fullStory];
  const logs = [...claims.flatMap((claim) => claim.logs.map(toRawLog)), ...(options.extraLogs ?? [])];
  const timestamps = new Map(claims.flatMap((claim) => claim.logs.map((log) => [log.blockNumber, log.timestamp] as const)));
  const ranges: [bigint, bigint][] = [];
  const latest = options.latestBlock ?? 9_000_000n;

  function call(data: Hex): Hex {
    const { functionName, args } = decodeFunctionData({ abi: claimRegistryReadAbi, data });
    const claim = claims.find((candidate) => candidate.claimId === args[0]);
    let result: Hex;
    switch (functionName) {
      case 'statusOf':
        result = encodeFunctionResult({
          abi: claimRegistryReadAbi,
          functionName,
          result: claim === undefined ? 0 : statusIndexFromName(claim.status),
        });
        break;
      case 'getClaim':
        result = encodeFunctionResult({
          abi: claimRegistryReadAbi,
          functionName,
          result: {
            organization: claim?.record.organization ?? zeroAddress,
            status: claim === undefined ? 0 : statusIndexFromName(claim.status),
            internalVerifier: claim?.record.internalVerifier ?? zeroAddress,
            auditor: claim?.record.auditor ?? zeroAddress,
            anchoredAt: claim?.record.anchoredAt ?? 0n,
            metadataHash: claim?.record.metadataHash ?? `0x${'00'.repeat(32)}`,
          },
        });
        break;
      case 'evidenceRoots':
        result = encodeFunctionResult({ abi: claimRegistryReadAbi, functionName, result: claim?.evidenceRoots ?? [] });
        break;
    }
    return result;
  }

  function getLogs(filter: { fromBlock: Hex; toBlock: Hex; topics: (Hex | null)[] }): RpcLog[] {
    const from = hexToBigInt(filter.fromBlock);
    const to = hexToBigInt(filter.toBlock);
    ranges.push([from, to]);
    if (options.maxRange !== undefined && to - from + 1n > options.maxRange) {
      throw { code: -32005, message: 'query returned more than 10000 results' };
    }
    const inRange = logs.filter((log) => {
      const block = hexToBigInt(log.blockNumber);
      return block >= from && block <= to && log.topics[1] === filter.topics[1];
    });
    return inRange;
  }

  async function request({ method, params }: RequestArgs): Promise<unknown> {
    const list = Array.isArray(params) ? params : [];
    if (options.failCalls === true && method === 'eth_call') {
      throw { code: -32603, message: 'internal error: upstream unavailable' };
    }
    const handlers: Record<string, () => unknown> = {
      eth_chainId: () => numberToHex(anvil.id),
      eth_blockNumber: () => numberToHex(latest),
      eth_call: () => call((list[0] as { data: Hex }).data),
      eth_getLogs: () => getLogs(list[0] as { fromBlock: Hex; toBlock: Hex; topics: (Hex | null)[] }),
      eth_getBlockByNumber: () => {
        const number = hexToBigInt(list[0] as Hex);
        return { number: list[0], hash: numberToHex(number, { size: 32 }), timestamp: numberToHex(timestamps.get(number) ?? 0), transactions: [] };
      },
    };
    const handler = handlers[method];
    if (handler === undefined) {
      throw { code: -32601, message: `method ${method} not stubbed` };
    }
    return Promise.resolve(handler());
  }

  const client = createPublicClient({ chain: anvil, transport: custom({ request }, { retryCount: 0 }) });
  return { client, ranges };
}

const FIRST_BLOCK = 8_120_000n;

describe('ChainClaimSource', () => {
  it('reads the same claim view from the contract as the demo source builds from its snapshot', async () => {
    const { client } = stubNode();
    const source = new ChainClaimSource(client, { address: REGISTRY, fromBlock: FIRST_BLOCK, chunkSize: 1_000_000n });
    const fromChain = await source.getClaim(fullStory.claimId);
    const fromDemo = await new MockClaimSource([{ ...fullStory, published: new Map() }]).getClaim(fullStory.claimId);
    expect(fromChain.ok).toBe(true);
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
