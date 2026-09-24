// =============================================================================
// Proof of Aid — Team 05 — Test helper: a stub JSON-RPC node serving demo claims to the chain sources
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
  numberToHex,
  zeroAddress,
  type Abi,
  type AbiEvent,
  type Hex,
} from 'viem';
import { anvil } from 'viem/chains';
import type { ClaimSnapshot } from '../data/assembleClaimView';
import { claimRegistryReadAbi } from '../data/claimRegistryAbi';
import type { ClaimEventLog } from '../data/timeline';
import { MOCK_CLAIMS } from '../mocks/claims';
import { statusIndexFromName } from '../utils/claimStatus';

// Shared by the chain and API source tests, so both read the demo claims through a real viem
// client and the same raw logs a node would return.

export const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const UNKNOWN_CLAIM = `0x${'99'.repeat(32)}` as Hex;

function firstDemoClaim(): ClaimSnapshot {
  const [claim] = MOCK_CLAIMS;
  if (claim === undefined) {
    throw new Error('The demo data must start with the full-story claim.');
  }
  return claim;
}

export const fullStory = firstDemoClaim();

export type RpcLog = { address: string; topics: Hex[]; data: Hex; blockNumber: Hex; logIndex: Hex; transactionHash: Hex; removed: boolean };

/** Encodes a decoded demo event back into the raw log a node would return. */
export function toRawLog(log: ClaimEventLog): RpcLog {
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

export type NodeOptions = {
  claims?: readonly ClaimSnapshot[];
  extraLogs?: readonly RpcLog[];
  latestBlock?: bigint;
  /** Largest block range the node accepts; bigger ranges fail like Infura (-32005). */
  maxRange?: bigint;
  failCalls?: boolean;
};

type RequestArgs = { method: string; params?: unknown };

/** A tiny JSON-RPC node serving the given claims, recording every eth_getLogs range. */
export function stubNode(options: NodeOptions = {}) {
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
      case 'lockedOf':
        result = encodeFunctionResult({ abi: claimRegistryReadAbi, functionName, result: claim?.escrow?.lockedWei ?? 0n });
        break;
      case 'disputeWindowClosesAt':
        result = encodeFunctionResult({
          abi: claimRegistryReadAbi,
          functionName,
          result: BigInt(claim?.escrow?.disputeWindowClosesAt ?? 0),
        });
        break;
      case 'settled':
        result = encodeFunctionResult({ abi: claimRegistryReadAbi, functionName, result: claim?.escrow?.settled ?? false });
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

/** First block of the full-story demo claim's history. */
export const FIRST_BLOCK = 8_120_000n;
