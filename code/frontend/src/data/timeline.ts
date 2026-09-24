// =============================================================================
// Proof of Aid — Team 05 — Claim events → timeline (one entry per transaction, oldest first)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isAddressEqual, zeroAddress, type Address, type DecodeEventLogReturnType, type Hex } from 'viem';
import type { TimelineAction, TimelineEntry } from '../types/claim';
import { isRecordedStatus, statusNameFromIndex, type RecordedClaimStatus } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import type { claimRegistryReadAbi } from './claimRegistryAbi';

/** A ClaimRegistry event decoded against the typed ABI subset. */
export type DecodedClaimEvent = DecodeEventLogReturnType<typeof claimRegistryReadAbi>;

/** A decoded event with its position in the chain and the timestamp of its block. */
export type ClaimEventLog = DecodedClaimEvent & {
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  timestamp: number;
};

type MappedEvent = { kind: 'status'; status: RecordedClaimStatus } | { kind: 'action'; action: TimelineAction };

type Located<T> = T & { log: ClaimEventLog };

/** `address(0)` means "none" in the contract (e.g. no previous auditor). */
const unlessZero = (address: Address): Address | undefined =>
  isAddressEqual(address, zeroAddress) ? undefined : address;

const byChainPosition = (a: ClaimEventLog, b: ClaimEventLog): number =>
  a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1;

function statusChange(index: number): Result<MappedEvent, string> {
  const name = statusNameFromIndex(index);
  const mapped: Result<MappedEvent, string> = !name.ok
    ? name
    : isRecordedStatus(name.value)
      ? ok({ kind: 'status', status: name.value })
      : err('The contract reported a change to a status that does not exist.');
  return mapped;
}

function rootIndexOf(value: bigint): Result<number, string> {
  const result: Result<number, string> =
    value <= BigInt(Number.MAX_SAFE_INTEGER) ? ok(Number(value)) : err('The contract reported an impossible proof bundle number.');
  return result;
}

const action = (value: TimelineAction): Result<MappedEvent, string> => ok({ kind: 'action', action: value });

function mapEvent(event: DecodedClaimEvent): Result<MappedEvent, string> {
  let mapped: Result<MappedEvent, string>;
  switch (event.eventName) {
    case 'StatusChanged':
      mapped = statusChange(event.args.to);
      break;
    case 'ClaimAnchored':
      mapped = action({ kind: 'anchored', organization: event.args.organization, evidenceRoot: event.args.evidenceRoot });
      break;
    case 'InternalAttestation':
      mapped = action({ kind: 'internal-attestation', verifier: event.args.verifier, approved: event.args.approved });
      break;
    case 'AuditorAssigned':
      mapped = action({
        kind: 'auditor-assigned',
        auditor: event.args.auditor,
        previousAuditor: unlessZero(event.args.previousAuditor),
      });
      break;
    case 'ProofRequested':
      mapped = action({ kind: 'proof-requested', auditor: event.args.auditor });
      break;
    case 'ProofSubmitted': {
      const { organization, supplementaryRoot, rootIndex } = event.args;
      const index = rootIndexOf(rootIndex);
      mapped = index.ok
        ? action({ kind: 'proof-submitted', organization, root: supplementaryRoot, rootIndex: index.value })
        : index;
      break;
    }
    case 'ProofReviewed':
      mapped = action({ kind: 'proof-reviewed', verifier: event.args.verifier, accepted: event.args.accepted });
      break;
    case 'FinalAttestation':
      mapped = action({ kind: 'final-attestation', auditor: event.args.auditor, approved: event.args.approved });
      break;
    case 'DisputeOpened':
      mapped = action({ kind: 'dispute-opened', disputant: event.args.disputant });
      break;
    case 'DisputeResolved':
      mapped = action({ kind: 'dispute-resolved', authority: event.args.authority, upheld: event.args.upheld });
      break;
  }
  return mapped;
}

const toEntry = (log: ClaimEventLog, entryAction: TimelineAction, newStatus: RecordedClaimStatus | undefined): TimelineEntry => ({
  txHash: log.transactionHash,
  blockNumber: log.blockNumber,
  logIndex: log.logIndex,
  timestamp: log.timestamp,
  newStatus,
  action: entryAction,
});

/**
 * StatusChanged gives the badge and the action event gives the sentence, so both merge into one
 * entry. Pairing is by order inside the transaction, which also stays correct if a future batch
 * transaction carries several actions. AuditorAssigned never changes the status.
 */
function mergeTransaction(
  actions: readonly Located<{ action: TimelineAction }>[],
  statuses: readonly Located<{ status: RecordedClaimStatus }>[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let nextStatus = 0;
  for (const { log, action: entryAction } of actions) {
    const changesStatus = entryAction.kind !== 'auditor-assigned';
    entries.push(toEntry(log, entryAction, changesStatus ? statuses[nextStatus]?.status : undefined));
    nextStatus += changesStatus ? 1 : 0;
  }
  const orphans = statuses.slice(nextStatus).map(({ log, status }) => toEntry(log, { kind: 'status-changed' }, status));
  const merged = [...entries, ...orphans].toSorted((a, b) => a.logIndex - b.logIndex);
  return merged;
}

function entriesForTransaction(logs: readonly ClaimEventLog[]): Result<TimelineEntry[], string> {
  const actions: Located<{ action: TimelineAction }>[] = [];
  const statuses: Located<{ status: RecordedClaimStatus }>[] = [];
  let failure: string | undefined;
  for (const log of logs) {
    const mapped = mapEvent(log);
    if (!mapped.ok) {
      failure ??= mapped.error;
    } else if (mapped.value.kind === 'status') {
      statuses.push({ log, status: mapped.value.status });
    } else {
      actions.push({ log, action: mapped.value.action });
    }
  }
  const result: Result<TimelineEntry[], string> =
    failure === undefined ? ok(mergeTransaction(actions, statuses)) : err(failure);
  return result;
}

/** Builds the claim's story, oldest first, with one entry per transaction. */
export function buildTimeline(logs: readonly ClaimEventLog[]): Result<TimelineEntry[], string> {
  const byTransaction = new Map<string, ClaimEventLog[]>();
  for (const log of logs.toSorted(byChainPosition)) {
    const key = log.transactionHash.toLowerCase();
    byTransaction.set(key, [...(byTransaction.get(key) ?? []), log]);
  }
  const entries: TimelineEntry[] = [];
  let failure: string | undefined;
  for (const transactionLogs of byTransaction.values()) {
    const transactionEntries = entriesForTransaction(transactionLogs);
    if (transactionEntries.ok) {
      entries.push(...transactionEntries.value);
    } else {
      failure ??= transactionEntries.error;
    }
  }
  const result: Result<TimelineEntry[], string> = failure === undefined ? ok(entries) : err(failure);
  return result;
}
