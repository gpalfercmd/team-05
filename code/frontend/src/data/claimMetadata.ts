// =============================================================================
// Proof of Aid — Team 05 — Claim title/description from the API, checked against the onchain hash
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { z } from 'zod';
import { computeMetadataHash, type ClaimMetadataFields } from '../utils/metadata';
import { apiEndpoint, browserFetch, DEFAULT_TIMEOUT_MS, getJson, type FetchLike } from './httpJson';

// The title and description live offchain, in the backend; the contract keeps only their
// `metadataHash` (P8.4). Like a file list, the served text is untrusted: the page shows it only
// after recomputing the hash in the browser, over the claim ID it read from the chain.

/** What the page could get for a claim's text, before any check. */
export type MetadataLookup =
  /** No API configured: the page reads only the chain, which holds just the hash. */
  | { kind: 'not-configured' }
  /** The API answered nothing usable (404, unreachable, malformed): nothing to check. */
  | { kind: 'not-published'; detail: string }
  /** The API's claim view, exactly as received. */
  | { kind: 'served'; raw: unknown };

/** The verdict shown on the page. Text is only ever handed out when it matched. */
export type MetadataCheck =
  | { state: 'verified'; metadata: ClaimMetadataFields }
  /** `computedHash` is undefined when the served fields cannot even be encoded (e.g. a multi-line title). */
  | { state: 'mismatch'; computedHash: Hex | undefined; detail: string }
  | { state: 'not-published'; detail: string }
  | { state: 'not-configured' };

export type MetadataResolver = { lookup(claimId: Hex): Promise<MetadataLookup> };

/** The claim view carries bundles too; a few hundred kilobytes is already far more than normal. */
const MAX_CLAIM_VIEW_BYTES = 1024 * 1024;

// Only the four hashed fields are read; everything else in `ClaimFields` is ignored.
const servedMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  location_region: z.string(),
  claim_date: z.string(),
});

/** Decides whether the served text is the text the organization anchored. */
export function checkMetadata(lookup: MetadataLookup, claimId: Hex, onchainHash: Hex): MetadataCheck {
  if (lookup.kind === 'not-configured') {
    return { state: 'not-configured' };
  }
  if (lookup.kind === 'not-published') {
    return { state: 'not-published', detail: lookup.detail };
  }
  const parsed = servedMetadataSchema.safeParse(lookup.raw);
  if (!parsed.success) {
    return { state: 'not-published', detail: 'The server’s answer has no readable title and description.' };
  }
  const metadata: ClaimMetadataFields = {
    title: parsed.data.title,
    description: parsed.data.description,
    locationRegion: parsed.data.location_region,
    claimDate: parsed.data.claim_date,
  };
  const computed = computeMetadataHash(metadata, claimId);
  const check: MetadataCheck = !computed.ok
    ? { state: 'mismatch', computedHash: undefined, detail: computed.error }
    : computed.value.toLowerCase() === onchainHash.toLowerCase()
      ? { state: 'verified', metadata }
      : { state: 'mismatch', computedHash: computed.value, detail: 'The fingerprint of the served text differs from the recorded one.' };
  return check;
}

export type ApiClaimMetadataOptions = { apiUrl: string; fetch?: FetchLike | undefined };

/** Reads `GET /claims/{id}` (public, no login): the claim view the backend serves to anyone. */
export class ApiClaimMetadata implements MetadataResolver {
  readonly #apiUrl: string;
  readonly #fetch: FetchLike;

  constructor(options: ApiClaimMetadataOptions) {
    this.#apiUrl = options.apiUrl;
    this.#fetch = options.fetch ?? browserFetch;
  }

  async lookup(claimId: Hex): Promise<MetadataLookup> {
    const url = apiEndpoint(this.#apiUrl, `/claims/${claimId.toLowerCase()}`);
    const raw = await getJson(this.#fetch, url, { timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: MAX_CLAIM_VIEW_BYTES });
    const lookup: MetadataLookup = raw.ok ? { kind: 'served', raw: raw.value } : { kind: 'not-published', detail: raw.error };
    return lookup;
  }
}
