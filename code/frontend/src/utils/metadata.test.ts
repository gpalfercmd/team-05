// =============================================================================
// Proof of Aid — Team 05 — Tests: browser metadata hash reproduces the shared Python vectors
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import vectors from '@shared/metadata-vectors.json';
import { toHex, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { canonicalMetadata, computeMetadataHash, type ClaimMetadataFields } from './metadata';

type VectorCase = { name: string; title: string; description: string; location_region: string; claim_date: string; claim_id: string };

const fieldsOf = (entry: VectorCase): ClaimMetadataFields => ({
  title: entry.title,
  description: entry.description,
  locationRegion: entry.location_region,
  claimDate: entry.claim_date,
});

describe('claim metadata hash (code/shared/metadata-vectors.json)', () => {
  it.each(vectors.cases.map((entry) => [entry.name, entry] as const))('reproduces the %s case byte for byte', (_name, entry) => {
    const claimId = entry.claim_id as Hex;
    const preimage = canonicalMetadata(fieldsOf(entry), claimId);
    expect(preimage.ok && toHex(preimage.value)).toBe(entry.preimage_hex);
    expect(computeMetadataHash(fieldsOf(entry), claimId)).toEqual({ ok: true, value: entry.metadata_hash });
  });

  it.each(vectors.invalid.map((entry) => [entry.name, entry] as const))('rejects the %s case', (_name, entry) => {
    expect(computeMetadataHash(fieldsOf(entry), entry.claim_id as Hex).ok).toBe(false);
  });

  it('accepts the claim ID in upper-case hex, as a URL may carry it', () => {
    const [first] = vectors.cases;
    const upper = `0x${(first?.claim_id ?? '').slice(2).toUpperCase()}` as Hex;
    expect(first && computeMetadataHash(fieldsOf(first), upper)).toEqual({ ok: true, value: first?.metadata_hash });
  });

  it('changes when a single character of the served text changes', () => {
    const [first] = vectors.cases;
    const fields = first === undefined ? undefined : fieldsOf(first);
    const edited = fields === undefined ? undefined : computeMetadataHash({ ...fields, description: `${fields.description} ` }, first?.claim_id as Hex);
    expect(edited?.ok).toBe(true);
    expect(edited?.ok && edited.value).not.toBe(first?.metadata_hash);
  });
});
