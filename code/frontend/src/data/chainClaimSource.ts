// =============================================================================
// Proof of Aid — Team 05 — Reads a claim straight from ClaimRegistry with viem (no wallet, no API)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import {
  BaseError,
  decodeEventLog,
  LimitExceededRpcError,
  numberToHex,
  RpcError,
  TimeoutError,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { z } from 'zod';
import type { ClaimView } from '../types/claim';
import { isRecordedStatus, statusNameFromIndex, type RecordedClaimStatus } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import { assembleClaimView, type ClaimRecord } from './assembleClaimView';
import { CLAIM_EVENT_SELECTORS, claimRegistryReadAbi } from './claimRegistryAbi';
import type { ClaimDataSource, DataError } from './source';
import type { ClaimEventLog, DecodedClaimEvent } from './timeline';

/** The only client capabilities this source needs; any viem public client provides them. */
export type ChainReadClient = Pick<PublicClient, 'readContract' | 'getBlock' | 'getBlockNumber' | 'request'>;

export type ChainClaimSourceOptions = {
  address: Address;
  /** Block the registry was deployed in (`VITE_DEPLOY_BLOCK`); earlier blocks cannot hold its events. */
  fromBlock: bigint;
  /** Blocks per eth_getLogs call. Public RPCs cap the range, so the history is read in chunks. */
  chunkSize?: bigint | undefined;
  /** How many times a refused range is halved before giving up. */
  maxHalvings?: number | undefined;
};

export const DEFAULT_LOG_CHUNK_SIZE = 50_000n;
export const DEFAULT_MAX_HALVINGS = 6;

// Raw JSON-RPC logs are not checked by viem, so they are validated here before decoding.
const bytes32Schema = z.custom<Hex>((value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value));
const hexDataSchema = z.custom<Hex>((value) => typeof value === 'string' && /^0x([0-9a-fA-F]{2})*$/.test(value));
const quantitySchema = z
  .custom<Hex>((value) => typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value))
  .transform((value) => BigInt(value));
const rpcLogsSchema = z.array(
  z.object({
    topics: z.tuple([bytes32Schema], bytes32Schema),
    data: hexDataSchema,
    blockNumber: quantitySchema,
    logIndex: quantitySchema,
    transactionHash: bytes32Schema,
    removed: z.boolean().optional(),
  }),
);
type RpcClaimLog = z.infer<typeof rpcLogsSchema>[number];

type DecodedLog = RpcClaimLog & { event: DecodedClaimEvent };

type PageError = { kind: 'rpc'; error: unknown } | { kind: 'malformed' };

async function attempt<T>(run: () => Promise<T>): Promise<Result<T, unknown>> {
  let result: Result<T, unknown>;
  try {
    result = ok(await run());
  } catch (error: unknown) {
    result = err(error);
  }
  return result;
}

const describeError = (error: unknown): string =>
  error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : 'Unknown error';

const unavailable = (error: unknown): DataError => ({ kind: 'unavailable', detail: describeError(error) });

// Providers word "your block range is too large" differently (Infura -32005, Alchemy -32602,
// Nitro/geth -32000 "block range too large", some just time out), so both code and text count.
const RANGE_ERROR_CODES: ReadonlySet<number> = new Set([-32000, -32005, -32600, -32602]);
const RANGE_ERROR_TEXT = /range|too many|more than|limit|exceed|too large|response size|timed? ?out/i;

/** True when an eth_getLogs failure means "ask for fewer blocks", not "the node is down". */
export function isLogRangeError(error: unknown): boolean {
  if (!(error instanceof BaseError)) {
    return false;
  }
  const cause = error.walk((inner) => inner instanceof RpcError || inner instanceof TimeoutError);
  const isRangeError =
    cause instanceof TimeoutError ||
    (cause instanceof RpcError &&
      (cause.code === LimitExceededRpcError.code ||
        (RANGE_ERROR_CODES.has(cause.code) && RANGE_ERROR_TEXT.test(`${cause.shortMessage} ${cause.details}`))));
  return isRangeError;
}

function logPageFailure(error: PageError, chunk: bigint): DataError {
  const failure: DataError =
    error.kind === 'malformed'
      ? { kind: 'invalid-data', detail: 'The blockchain node returned malformed event logs.' }
      : isLogRangeError(error.error)
        ? { kind: 'history-too-large', detail: `${describeError(error.error)} (smallest range tried: ${chunk} blocks)` }
        : unavailable(error.error);
  return failure;
}

function decodeLog(log: RpcClaimLog): Result<DecodedClaimEvent, string> {
  let decoded: Result<DecodedClaimEvent, string>;
  try {
    decoded = ok(decodeEventLog({ abi: claimRegistryReadAbi, data: log.data, topics: log.topics, strict: true }));
  } catch (error: unknown) {
    decoded = err(`An event of this claim could not be decoded (${describeError(error)}).`);
  }
  return decoded;
}

export class ChainClaimSource implements ClaimDataSource {
  readonly kind = 'chain';
  readonly #client: ChainReadClient;
  readonly #address: Address;
  readonly #fromBlock: bigint;
  readonly #chunkSize: bigint;
  readonly #maxHalvings: number;

  constructor(client: ChainReadClient, options: ChainClaimSourceOptions) {
    this.#client = client;
    this.#address = options.address;
    this.#fromBlock = options.fromBlock;
    this.#chunkSize = options.chunkSize ?? DEFAULT_LOG_CHUNK_SIZE;
    this.#maxHalvings = options.maxHalvings ?? DEFAULT_MAX_HALVINGS;
  }

  async getClaim(claimId: Hex): Promise<Result<ClaimView, DataError>> {
    const status = await this.#readStatus(claimId);
    if (!status.ok) {
      return status;
    }
    const [record, roots, logs] = await Promise.all([
      this.#readRecord(claimId),
      this.#readRoots(claimId),
      this.#readHistory(claimId),
    ]);
    if (!record.ok) {
      return record;
    }
    if (!roots.ok) {
      return roots;
    }
    if (!logs.ok) {
      return logs;
    }
    const view = assembleClaimView(
      {
        claimId,
        status: status.value,
        record: record.value,
        evidenceRoots: roots.value,
        logs: logs.value,
        published: new Map(),
      },
      'chain',
    );
    return view;
  }

  /** `statusOf` decides existence: `None` means no claim, whatever the logs say. */
  async #readStatus(claimId: Hex): Promise<Result<RecordedClaimStatus, DataError>> {
    const read = await attempt(() =>
      this.#client.readContract({ address: this.#address, abi: claimRegistryReadAbi, functionName: 'statusOf', args: [claimId] }),
    );
    if (!read.ok) {
      return err(unavailable(read.error));
    }
    const name = statusNameFromIndex(read.value);
    const status: Result<RecordedClaimStatus, DataError> = !name.ok
      ? err({ kind: 'invalid-data', detail: name.error })
      : isRecordedStatus(name.value)
        ? ok(name.value)
        : err({ kind: 'not-found' });
    return status;
  }

  async #readRecord(claimId: Hex): Promise<Result<ClaimRecord, DataError>> {
    const read = await attempt(() =>
      this.#client.readContract({ address: this.#address, abi: claimRegistryReadAbi, functionName: 'getClaim', args: [claimId] }),
    );
    const record: Result<ClaimRecord, DataError> = read.ok ? ok(read.value) : err(unavailable(read.error));
    return record;
  }

  async #readRoots(claimId: Hex): Promise<Result<readonly Hex[], DataError>> {
    const read = await attempt(() =>
      this.#client.readContract({ address: this.#address, abi: claimRegistryReadAbi, functionName: 'evidenceRoots', args: [claimId] }),
    );
    const roots: Result<readonly Hex[], DataError> = read.ok ? ok(read.value) : err(unavailable(read.error));
    return roots;
  }

  async #readHistory(claimId: Hex): Promise<Result<ClaimEventLog[], DataError>> {
    const latest = await attempt(() => this.#client.getBlockNumber({ cacheTime: 0 }));
    if (!latest.ok) {
      return err(unavailable(latest.error));
    }
    const raw = await this.#fetchLogs(claimId, latest.value);
    if (!raw.ok) {
      return raw;
    }
    const decoded = this.#decodeClaimLogs(claimId, raw.value);
    const history = decoded.ok ? await this.#withTimestamps(decoded.value) : decoded;
    return history;
  }

  /**
   * Every IClaimRegistry event has `claimId` as its first indexed parameter, so one topic filter
   * (`[any event, claimId]`) returns the whole story. Ranges are chunked and a refused range is
   * halved and retried, up to `maxHalvings` times.
   */
  async #fetchLogs(claimId: Hex, toBlock: bigint): Promise<Result<RpcClaimLog[], DataError>> {
    const logs: RpcClaimLog[] = [];
    let from = this.#fromBlock;
    let chunk = this.#chunkSize;
    let halvings = 0;
    let failure: DataError | undefined;
    while (failure === undefined && from <= toBlock) {
      const to = from + chunk - 1n < toBlock ? from + chunk - 1n : toBlock;
      const page = await this.#fetchLogPage(claimId, from, to);
      const refusedRange = !page.ok && page.error.kind === 'rpc' && isLogRangeError(page.error.error);
      if (page.ok) {
        logs.push(...page.value);
        from = to + 1n;
      } else if (refusedRange && halvings < this.#maxHalvings && chunk > 1n) {
        chunk /= 2n;
        halvings += 1;
      } else {
        failure = logPageFailure(page.error, chunk);
      }
    }
    const result: Result<RpcClaimLog[], DataError> = failure === undefined ? ok(logs) : err(failure);
    return result;
  }

  async #fetchLogPage(claimId: Hex, from: bigint, to: bigint): Promise<Result<RpcClaimLog[], PageError>> {
    const filter = { address: this.#address, topics: [null, claimId], fromBlock: numberToHex(from), toBlock: numberToHex(to) };
    const page = await attempt(() => this.#client.request({ method: 'eth_getLogs', params: [filter] }));
    if (!page.ok) {
      return err({ kind: 'rpc', error: page.error });
    }
    const parsed = rpcLogsSchema.safeParse(page.value);
    const result: Result<RpcClaimLog[], PageError> = parsed.success ? ok(parsed.data) : err({ kind: 'malformed' });
    return result;
  }

  #decodeClaimLogs(claimId: Hex, logs: readonly RpcClaimLog[]): Result<DecodedLog[], DataError> {
    // Another event of the registry could share a topic value by coincidence; only the ten
    // timeline events with this exact claimId are kept. Removed logs belong to reorged blocks.
    const relevant = logs.filter(
      (log) =>
        log.removed !== true &&
        CLAIM_EVENT_SELECTORS.has(log.topics[0].toLowerCase() as Hex) &&
        log.topics[1]?.toLowerCase() === claimId.toLowerCase(),
    );
    const decoded: DecodedLog[] = [];
    let failure: string | undefined;
    for (const log of relevant) {
      const event = decodeLog(log);
      if (event.ok) {
        decoded.push({ ...log, event: event.value });
      } else {
        failure ??= event.error;
      }
    }
    const result: Result<DecodedLog[], DataError> =
      failure === undefined ? ok(decoded) : err({ kind: 'invalid-data', detail: failure });
    return result;
  }

  /** One `eth_getBlockByNumber` per distinct block: several actions often share a block. */
  async #withTimestamps(logs: readonly DecodedLog[]): Promise<Result<ClaimEventLog[], DataError>> {
    const blockNumbers = [...new Set(logs.map((log) => log.blockNumber))];
    const blocks = await attempt(() =>
      Promise.all(
        blockNumbers.map(async (blockNumber) => {
          const block = await this.#client.getBlock({ blockNumber });
          return [blockNumber, Number(block.timestamp)] as const;
        }),
      ),
    );
    if (!blocks.ok) {
      return err(unavailable(blocks.error));
    }
    const timestamps = new Map(blocks.value);
    const history = ok(
      logs.map(
        (log): ClaimEventLog => ({
          ...log.event,
          blockNumber: log.blockNumber,
          logIndex: Number(log.logIndex),
          transactionHash: log.transactionHash,
          timestamp: timestamps.get(log.blockNumber) ?? 0,
        }),
      ),
    );
    return history;
  }
}
