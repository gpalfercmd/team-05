// =============================================================================
// Proof of Aid — Team 05 — ClaimStatus enum (index ↔ name) and its DESIGN.md label and icon
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import claimStatusJson from '@shared/abi/claim-status.json';
import { z } from 'zod';
import type { IconName } from '../components/icons';
import { err, ok, type Result } from './result';

// The contract returns the status as a uint8 whose meaning is fixed by the enum order in
// IClaimRegistry.sol, exported to claim-status.json. Parsing the JSON against this literal
// tuple derives the TypeScript type from the shared file and turns any drift into a startup
// failure (and a failing test) instead of a badge that silently shows the wrong status.
const claimStatusNamesSchema = z.tuple([
  z.literal('None'),
  z.literal('Anchored'),
  z.literal('InternallyVerified'),
  z.literal('ProofRequested'),
  z.literal('ProofSubmitted'),
  z.literal('Verified'),
  z.literal('Rejected'),
  z.literal('Disputed'),
]);

export const CLAIM_STATUS_NAMES = claimStatusNamesSchema.parse(claimStatusJson.values);

export type ClaimStatusName = (typeof CLAIM_STATUS_NAMES)[number];

/** Statuses a recorded claim can have. `None` only means "no claim with this ID exists". */
export type RecordedClaimStatus = Exclude<ClaimStatusName, 'None'>;

export type StatusMeta = { label: string; icon: IconName };

/** DESIGN.md `status` tokens: every badge pairs its colour with an icon and a text label. */
export const STATUS_META: Record<RecordedClaimStatus, StatusMeta> = {
  Anchored: { label: 'Anchored', icon: 'anchor' },
  InternallyVerified: { label: 'Internally verified', icon: 'user-check' },
  ProofRequested: { label: 'Proof requested', icon: 'help-circle' },
  ProofSubmitted: { label: 'Proof submitted', icon: 'file-plus' },
  Verified: { label: 'Verified', icon: 'shield-check' },
  Rejected: { label: 'Rejected', icon: 'x-octagon' },
  Disputed: { label: 'Disputed', icon: 'alert-triangle' },
};

export const isRecordedStatus = (name: ClaimStatusName): name is RecordedClaimStatus => name !== 'None';

export const RECORDED_CLAIM_STATUSES: readonly RecordedClaimStatus[] = CLAIM_STATUS_NAMES.filter(isRecordedStatus);

/** Maps the contract's uint8 status to its name; out-of-range values mean ABI drift. */
export function statusNameFromIndex(index: number): Result<ClaimStatusName, string> {
  const name = Number.isInteger(index) ? CLAIM_STATUS_NAMES[index] : undefined;
  const result: Result<ClaimStatusName, string> =
    name === undefined ? err(`Unknown claim status index: ${index}`) : ok(name);
  return result;
}

export const statusIndexFromName = (name: ClaimStatusName): number => CLAIM_STATUS_NAMES.indexOf(name);
