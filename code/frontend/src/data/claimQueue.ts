// =============================================================================
// Proof of Aid — Team 05 — Claims a role may act on, listed by the P4 indexer API (optional)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { RECORDED_CLAIM_STATUSES, type RecordedClaimStatus } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import type { Role } from '../utils/roles';
import { apiEndpoint, DEFAULT_TIMEOUT_MS, getJson, type FetchLike } from './httpJson';

// The list is only a shortcut to find claims: every action still reads the claim from the
// contract (readClaimActionState) before it is offered, so a stale index can hide a claim but
// never enable a wrong action.

export type QueueItem = { claimId: Hex; organization: Address; status: RecordedClaimStatus };

/** Enough for a hackathon deployment; the backend caps a page at 100. */
export const QUEUE_PAGE_SIZE = 100;
const MAX_QUEUE_BYTES = 512 * 1024;

const recordedStatusSchema = z.string().refine((value): value is RecordedClaimStatus =>
  (RECORDED_CLAIM_STATUSES as readonly string[]).includes(value),
);

const pageSchema = z.object({
  items: z.array(
    z.object({
      claimId: z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hex),
      organization: z.string().refine((value) => isAddress(value, { strict: false })).transform((value) => getAddress(value)),
      status: recordedStatusSchema,
    }),
  ),
});

export type QueueSpec = {
  heading: string;
  empty: string;
  /** `undefined`: every status. */
  statuses: readonly RecordedClaimStatus[] | undefined;
  /** Narrows the list to the viewer (its own claims, its organization's claims). */
  organization: Address | undefined;
};

/** What each role is shown; the claim panel then decides what it may actually do. */
export function queueSpec(role: Role, viewer: Address, verifierOrganization: Address | undefined): QueueSpec {
  const specs: Record<Role, QueueSpec> = {
    organization: {
      heading: 'Your claims',
      empty: 'Your organization has not recorded any claims yet.',
      statuses: undefined,
      organization: viewer,
    },
    internalVerifier: {
      heading: 'Your organization’s claims waiting for a check',
      empty: 'No claims of your organization are waiting for an internal check.',
      statuses: ['Anchored', 'ProofSubmitted'],
      organization: verifierOrganization,
    },
    auditor: {
      heading: 'Claims at the auditor stage or open to disputes',
      empty: 'No claims are at the auditor stage or open to disputes.',
      statuses: ['InternallyVerified', 'Verified'],
      organization: undefined,
    },
    accreditationAuthority: {
      heading: 'Claims that need an auditor or a dispute decision',
      empty: 'No claims need an auditor or a dispute decision.',
      statuses: ['InternallyVerified', 'ProofRequested', 'ProofSubmitted', 'Disputed'],
      organization: undefined,
    },
    registryAdmin: {
      heading: 'Verified claims (deposits can be settled after the dispute window)',
      empty: 'No verified claims yet.',
      statuses: ['Verified'],
      organization: undefined,
    },
    public: {
      heading: 'Verified claims (deposits can be settled after the dispute window)',
      empty: 'No verified claims yet.',
      statuses: ['Verified'],
      organization: undefined,
    },
  };
  return specs[role];
}

async function fetchPage(fetchFn: FetchLike, url: string): Promise<Result<QueueItem[], string>> {
  const body = await getJson(fetchFn, url, { timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: MAX_QUEUE_BYTES });
  const parsed = body.ok ? pageSchema.safeParse(body.value) : undefined;
  let page: Result<QueueItem[], string>;
  if (!body.ok) {
    page = body;
  } else if (parsed === undefined || !parsed.success) {
    page = err('The indexer API answered with an unexpected claim list.');
  } else {
    page = ok(parsed.data.items);
  }
  return page;
}

/** The claims matching `spec`, newest first, one request per status. */
export async function fetchClaimQueue(fetchFn: FetchLike, apiUrl: string, spec: QueueSpec): Promise<Result<QueueItem[], string>> {
  const urls =
    spec.statuses === undefined
      ? [apiEndpoint(apiUrl, `/public/claims?limit=${QUEUE_PAGE_SIZE}`)]
      : spec.statuses.map((status) => apiEndpoint(apiUrl, `/public/claims?status=${status}&limit=${QUEUE_PAGE_SIZE}`));
  const pages = await Promise.all(urls.map((url) => fetchPage(fetchFn, url)));
  const failed = pages.find((page) => !page.ok);
  const items = pages.flatMap((page) => (page.ok ? page.value : []));
  const queue: Result<QueueItem[], string> =
    failed !== undefined && !failed.ok
      ? err(failed.error)
      : ok(items.filter((item) => spec.organization === undefined || item.organization === spec.organization));
  return queue;
}
