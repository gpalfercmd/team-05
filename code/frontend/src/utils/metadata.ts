// =============================================================================
// Proof of Aid — Team 05 — Browser-side claim metadata hash (the onchain `metadataHash`, P8.4)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isHex, keccak256, size, stringToBytes, type Hex } from 'viem';
import { err, ok, type Result } from './result';

// The shared recipe of `code/shared/poa_shared/metadata.py`, frozen by
// `code/shared/metadata-vectors.json` (a test runs every case here too):
//   metadataHash = keccak256(utf8(title \n description \n location_region \n claim_date \n claim_id_hex))
// with the strings exactly as the API serves them (no trimming, no Unicode normalization),
// claim_date as YYYY-MM-DD and claim_id_hex as 64 lowercase hex characters without 0x. Only the
// description may contain a line feed, so the preimage has a single reading.

/** The claim text the backend hashed before the organization anchored it. */
export type ClaimMetadataFields = {
  title: string;
  description: string;
  locationRegion: string;
  /** YYYY-MM-DD. */
  claimDate: string;
};

const SEPARATOR = '\n';
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
function isIsoDate(value: string): boolean {
  const parts = ISO_DATE.exec(value);
  const [, year, month, day] = parts ?? [];
  const parsed = parts === null ? Number.NaN : Date.UTC(Number(year), Number(month) - 1, Number(day));
  const valid = !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
  return valid;
}

function fieldProblem(fields: ClaimMetadataFields): string | undefined {
  let problem: string | undefined;
  if (fields.title === '' || fields.description === '' || fields.locationRegion === '') {
    problem = 'The title, description and region must not be empty.';
  } else if (fields.title.includes(SEPARATOR) || fields.locationRegion.includes(SEPARATOR)) {
    problem = 'The title and the region must be a single line.';
  } else if (!isIsoDate(fields.claimDate)) {
    problem = 'The claim date must be a YYYY-MM-DD date.';
  }
  return problem;
}

/** The UTF-8 preimage of `metadataHash` for this claim, or why the fields cannot be encoded. */
export function canonicalMetadata(fields: ClaimMetadataFields, claimId: Hex): Result<Uint8Array, string> {
  const problem = fieldProblem(fields);
  if (problem !== undefined) {
    return err(problem);
  }
  if (!isHex(claimId, { strict: true }) || size(claimId) !== 32) {
    return err('The claim ID must be 32 bytes.');
  }
  const text = [fields.title, fields.description, fields.locationRegion, fields.claimDate, claimId.slice(2).toLowerCase()].join(SEPARATOR);
  const preimage = ok(stringToBytes(text));
  return preimage;
}

/** keccak256 of the canonical metadata: what `anchorClaim` recorded as `metadataHash`. */
export function computeMetadataHash(fields: ClaimMetadataFields, claimId: Hex): Result<Hex, string> {
  const preimage = canonicalMetadata(fields, claimId);
  const hashed: Result<Hex, string> = preimage.ok ? ok(keccak256(preimage.value)) : preimage;
  return hashed;
}
