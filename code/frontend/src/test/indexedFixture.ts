// =============================================================================
// Proof of Aid — Team 05 — Test helper: demo event logs as the P4 API serves them (`ClaimTimeline`)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ClaimEventLog } from '../data/timeline';
import { CLAIM_STATUS_NAMES } from '../utils/claimStatus';

// Follows code/backend/app/api/public.py `_safe_args` and app/indexer/abi.py `_normalize`:
// addresses and bytes32 as lowercase hex, StatusChanged `from`/`to` as status names, `rootIndex`
// as a JSON integer, block times as UTC ISO strings (pydantic writes them with a trailing "Z").

type IndexedArg = string | boolean | number;

function indexedArg(eventName: ClaimEventLog['eventName'], name: string, value: unknown): IndexedArg {
  let arg: IndexedArg;
  if (eventName === 'StatusChanged' && (name === 'from' || name === 'to') && typeof value === 'number') {
    arg = CLAIM_STATUS_NAMES[value] ?? 'unknown';
  } else if (typeof value === 'bigint') {
    arg = Number(value);
  } else if (typeof value === 'boolean') {
    arg = value;
  } else {
    arg = String(value).toLowerCase();
  }
  return arg;
}

export type IndexedEventJson = {
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timestamp: string;
  event: string;
  args: Record<string, IndexedArg>;
};

export const toIndexedEvent = (log: ClaimEventLog): IndexedEventJson => ({
  blockNumber: Number(log.blockNumber),
  txHash: log.transactionHash.toLowerCase(),
  logIndex: log.logIndex,
  timestamp: new Date(log.timestamp * 1000).toISOString().replace('.000Z', 'Z'),
  event: log.eventName,
  // The public API drops the escrow events' wei `amount` (P9), like `_safe_args` does.
  args: Object.fromEntries(
    Object.entries(log.args)
      .filter(([name]) => name !== 'amount')
      .map(([name, value]) => [name, indexedArg(log.eventName, name, value)]),
  ),
});

/** What the API history holds for these logs: the same events without the escrow amounts. */
export const withoutAmounts = (logs: readonly ClaimEventLog[]): ClaimEventLog[] =>
  logs.map((log): ClaimEventLog => {
    const { amount: _amount, ...args } = log.args as Record<string, unknown>;
    return { ...log, args } as ClaimEventLog;
  });
