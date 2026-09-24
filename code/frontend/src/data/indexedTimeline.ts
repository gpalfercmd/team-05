// =============================================================================
// Proof of Aid — Team 05 — P4 indexer timeline JSON (`ClaimTimeline`) → the chain source's event logs
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { CLAIM_STATUS_NAMES, statusIndexFromName } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import type { ClaimRegistryEventName } from './claimRegistryAbi';
import type { ClaimEventLog } from './timeline';

// Mirrors `ClaimTimeline` in code/backend/app/schemas.py (GET /public/claims/{id}/timeline). The
// indexer stores each event with lowercase hex values and status names instead of enum numbers;
// this file turns them back into exactly what viem decodes from the raw log, so the API history
// runs through the same timeline code as the chain history and the page renders identically.
// The API's own `status` and `evidenceRoots` projection is deliberately not exposed: the page
// reads both from the contract, because the integrity proof must never depend on the backend.

const bytes32Schema = z.custom<Hex>((value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value));

// Checksummed like viem's decoder, so an address reads the same whichever source served it.
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value): Address => getAddress(value));

const statusSchema = z.enum(CLAIM_STATUS_NAMES).transform(statusIndexFromName);

const positionSchema = z.object({
  blockNumber: z.int().nonnegative(),
  txHash: bytes32Schema,
  logIndex: z.int().nonnegative(),
  timestamp: z.iso.datetime({ offset: true }),
});

/** One indexed event of `name`, with its arguments typed as viem decodes them. */
const indexedEvent = <const N extends ClaimRegistryEventName, S extends z.ZodRawShape>(name: N, args: S) =>
  positionSchema.extend({ event: z.literal(name), args: z.object(args) }).transform((entry) => ({
    eventName: name,
    args: entry.args,
    blockNumber: BigInt(entry.blockNumber),
    logIndex: entry.logIndex,
    transactionHash: entry.txHash,
    timestamp: Math.floor(Date.parse(entry.timestamp) / 1000),
  }));

const claimId = bytes32Schema;

// Annotated with the chain source's type, so any drift from the typed ABI fails to compile.
const indexedEventSchema: z.ZodType<ClaimEventLog> = z.union([
  indexedEvent('StatusChanged', { claimId, from: statusSchema, to: statusSchema }),
  indexedEvent('ClaimAnchored', { claimId, organization: addressSchema, evidenceRoot: bytes32Schema, metadataHash: bytes32Schema }),
  indexedEvent('InternalAttestation', { claimId, verifier: addressSchema, approved: z.boolean(), justificationHash: bytes32Schema }),
  indexedEvent('AuditorAssigned', { claimId, auditor: addressSchema, previousAuditor: addressSchema }),
  indexedEvent('ProofRequested', { claimId, auditor: addressSchema, requestHash: bytes32Schema }),
  indexedEvent('ProofSubmitted', {
    claimId,
    organization: addressSchema,
    supplementaryRoot: bytes32Schema,
    rootIndex: z.int().nonnegative().transform((value) => BigInt(value)),
  }),
  indexedEvent('ProofReviewed', { claimId, verifier: addressSchema, accepted: z.boolean(), justificationHash: bytes32Schema }),
  indexedEvent('FinalAttestation', { claimId, auditor: addressSchema, approved: z.boolean(), justificationHash: bytes32Schema }),
  indexedEvent('DisputeOpened', { claimId, disputant: addressSchema, counterEvidenceHash: bytes32Schema }),
  indexedEvent('DisputeResolved', { claimId, authority: addressSchema, upheld: z.boolean(), justificationHash: bytes32Schema }),
]);

const claimTimelineSchema = z.object({
  claimId: bytes32Schema,
  chainId: z.int().positive(),
  claimRegistry: addressSchema,
  events: z.array(indexedEventSchema),
  indexedToBlock: z.int().nonnegative().nullable(),
});

/** What the page may take from the indexer: the history, and how far the index reaches. */
export type IndexedTimeline = {
  claimId: Hex;
  chainId: number;
  claimRegistry: Address;
  logs: readonly ClaimEventLog[];
  /** Last block the indexer has fully processed; `undefined` before its first run. */
  indexedToBlock: bigint | undefined;
};

export function parseIndexedTimeline(raw: unknown): Result<IndexedTimeline, string> {
  const parsed = claimTimelineSchema.safeParse(raw);
  if (!parsed.success) {
    return err(`The indexer timeline has an unexpected shape. ${z.prettifyError(parsed.error)}`);
  }
  const { claimId: id, chainId, claimRegistry, events, indexedToBlock } = parsed.data;
  // The chain source keeps only events whose claimId topic is this claim; the API must match that.
  const foreign = events.some((log) => log.args.claimId.toLowerCase() !== id.toLowerCase());
  const timeline: Result<IndexedTimeline, string> = foreign
    ? err('The indexer timeline mixes events of another claim.')
    : ok({
        claimId: id,
        chainId,
        claimRegistry,
        logs: events,
        indexedToBlock: indexedToBlock === null ? undefined : BigInt(indexedToBlock),
      });
  return timeline;
}
