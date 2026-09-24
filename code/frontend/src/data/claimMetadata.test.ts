// =============================================================================
// Proof of Aid — Team 05 — Tests: served claim text is checked against the onchain metadataHash
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import vectors from '@shared/metadata-vectors.json';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { json, stubFetch } from '../test/stubFetch';
import { ApiClaimMetadata, checkMetadata, type MetadataLookup } from './claimMetadata';

const API = 'http://localhost:8000';

function firstVector() {
  const [first] = vectors.cases;
  if (first === undefined) {
    throw new Error('The shared metadata vectors must have a case.');
  }
  return first;
}

const vector = firstVector();
const CLAIM_ID = vector.claim_id as Hex;
const ONCHAIN_HASH = vector.metadata_hash as Hex;

/** A `PublicClaimResponse` as app/api/claims.py serves it (extra fields are ignored). */
const claimView = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  claim_id_hex: CLAIM_ID,
  title: vector.title,
  description: vector.description,
  location_region: vector.location_region,
  claim_date: vector.claim_date,
  metadata_hash_hex: ONCHAIN_HASH,
  created_by: '0x0000000000000000000000000000000000000001',
  auditor_address: null,
  created_at: '2026-09-14T09:00:00Z',
  bundles: [],
  ...overrides,
});

const served = (overrides: Record<string, unknown> = {}): MetadataLookup => ({ kind: 'served', raw: claimView(overrides) });

describe('checkMetadata', () => {
  it('shows the served text when it hashes to the onchain metadataHash', () => {
    expect(checkMetadata(served(), CLAIM_ID, ONCHAIN_HASH)).toEqual({
      state: 'verified',
      metadata: {
        title: vector.title,
        description: vector.description,
        locationRegion: vector.location_region,
        claimDate: vector.claim_date,
      },
    });
  });

  it('flags a changed title and never hands out the text', () => {
    const check = checkMetadata(served({ title: `${vector.title}!` }), CLAIM_ID, ONCHAIN_HASH);
    expect(check.state).toBe('mismatch');
    expect(check).not.toHaveProperty('metadata');
    expect(check.state === 'mismatch' && check.computedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(check.state === 'mismatch' && check.computedHash).not.toBe(ONCHAIN_HASH);
  });

  it('flags another claim’s text, because the hash is recomputed over the ID of the claim shown', () => {
    // Claim 1's text and its onchain hash, replayed on claim 2's page (same_text_other_claim).
    const [, , , otherClaim] = vectors.cases;
    const check = checkMetadata(served(), (otherClaim?.claim_id ?? '0x') as Hex, ONCHAIN_HASH);
    expect(check.state).toBe('mismatch');
    expect(check.state === 'mismatch' && check.computedHash).toBe(otherClaim?.metadata_hash);
  });

  it('ignores what the server claims the hash is: only the onchain value counts', () => {
    const check = checkMetadata(served({ title: 'Other', metadata_hash_hex: ONCHAIN_HASH }), CLAIM_ID, ONCHAIN_HASH);
    expect(check.state).toBe('mismatch');
  });

  it('flags text moved between title and description (a multi-line title cannot be encoded)', () => {
    const check = checkMetadata(served({ title: 'A\nB', description: 'C' }), CLAIM_ID, ONCHAIN_HASH);
    expect(check).toEqual({ state: 'mismatch', computedHash: undefined, detail: 'The title and the region must be a single line.' });
  });

  it('reports nothing to check when the server has no readable text', () => {
    expect(checkMetadata({ kind: 'not-published', detail: 'HTTP 404' }, CLAIM_ID, ONCHAIN_HASH)).toEqual({
      state: 'not-published',
      detail: 'HTTP 404',
    });
    expect(checkMetadata({ kind: 'served', raw: { title: 42 } }, CLAIM_ID, ONCHAIN_HASH).state).toBe('not-published');
  });

  it('says honestly that there is no API to ask in chain-only mode', () => {
    expect(checkMetadata({ kind: 'not-configured' }, CLAIM_ID, ONCHAIN_HASH)).toEqual({ state: 'not-configured' });
  });
});

describe('ApiClaimMetadata', () => {
  it('reads the public claim view by lower-case claim ID', async () => {
    const http = stubFetch({ [`${API}/claims/${CLAIM_ID}`]: json(claimView()) });
    const lookup = await new ApiClaimMetadata({ apiUrl: `${API}/`, fetch: http.fetch }).lookup(CLAIM_ID.toUpperCase().replace('0X', '0x') as Hex);
    expect(http.requested).toEqual([`${API}/claims/${CLAIM_ID}`]);
    expect(lookup).toEqual({ kind: 'served', raw: claimView() });
  });

  it('turns a 404, a network error or bad JSON into "not published"', async () => {
    const url = `${API}/claims/${CLAIM_ID}`;
    for (const answer of [json({ detail: 'claim not found' }, 404), { networkError: 'offline' }, { status: 200, text: 'not json' }]) {
      const lookup = await new ApiClaimMetadata({ apiUrl: API, fetch: stubFetch({ [url]: answer }).fetch }).lookup(CLAIM_ID);
      expect(lookup.kind).toBe('not-published');
    }
  });
});
