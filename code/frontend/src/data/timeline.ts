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

/**
 * The public indexer API does not publish the wei `amount` of the escrow events (P9), so the
 * timeline treats it as optional: it is present when decoded from the chain, absent from the API,
 * and no timeline sentence depends on it (the amount held is read from `lockedOf` instead).
 */
type AmountOptional<E> = E extends { args: infer A }
  ? Omit<E, 'args'> & { args: Omit<A, 'amount'> & Partial<Pick<A, Extract<keyof A, 'amount'>>> }
  : never;

/** A claim event as the timeline needs it, from either source. */
export type TimelineEvent = AmountOptional<DecodedClaimEvent>;

/** A decoded event with its position in the chain and the timestamp of its block. */
export type ClaimEventLog = TimelineEvent & {
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

/** Oldest first: by block, then by position inside the block. */
export const byChainPosition = (a: ClaimEventLog, b: ClaimEventLog): number =>
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

function mapEvent(event: TimelineEvent): Result<MappedEvent, string> {
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
    case 'DepositLocked':
      mapped = action({ kind: 'deposit-locked', depositor: event.args.depositor });
      break;
    case 'Credited':
      mapped = action({ kind: 'credited', account: event.args.account });
      break;
    case 'ClaimSettled':
      mapped = action({ kind: 'settled', settler: event.args.settler });
      break;
  }
  return mapped;
}

/** The note fingerprint an action event carries (justification, request, counter-evidence), if any. */
function noteHashOf(event: TimelineEvent): Hex | undefined {
  let noteHash: Hex | undefined;
  switch (event.eventName) {
    case 'InternalAttestation':
    case 'ProofReviewed':
    case 'FinalAttestation':
    case 'DisputeResolved':
      noteHash = event.args.justificationHash;
      break;
    case 'ProofRequested':
      noteHash = event.args.requestHash;
      break;
    case 'DisputeOpened':
      noteHash = event.args.counterEvidenceHash;
      break;
    default:
      noteHash = undefined;
  }
  return noteHash;
}

const toEntry = (log: ClaimEventLog, entryAction: TimelineAction, newStatus: RecordedClaimStatus | undefined): TimelineEntry => {
  const noteHash = noteHashOf(log);
  const entry: TimelineEntry = {
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: log.timestamp,
    newStatus,
    action: entryAction,
    ...(noteHash === undefined ? {} : { noteHash: noteHash.toLowerCase() as Hex }),
  };
  return entry;
};

/** Actions whose transaction may carry no StatusChanged of their own. */
const KEEPS_STATUS: ReadonlySet<TimelineAction['kind']> = new Set(['auditor-assigned', 'deposit-locked', 'credited', 'settled']);

/**
 * StatusChanged gives the badge and the action event gives the sentence, so both merge into one
 * entry. Pairing is by order inside the transaction, which also stays correct if a future batch
 * transaction carries several actions. AuditorAssigned and the escrow events (deposits, credits,
 * settlement) never change the status: they sit beside the action that did.
 */
function mergeTransaction(
  actions: readonly Located<{ action: TimelineAction }>[],
  statuses: readonly Located<{ status: RecordedClaimStatus }>[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let nextStatus = 0;
  for (const { log, action: entryAction } of actions) {
    const changesStatus = !KEEPS_STATUS.has(entryAction.kind);
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
