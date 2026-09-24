// =============================================================================
// Proof of Aid — Team 05 — Builds the page's ClaimView from contract state + decoded events
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isAddressEqual, zeroAddress, type Address, type Hex } from 'viem';
import type { ClaimSource, ClaimView, EscrowState, EvidenceBundle, PublicFileLink, TimelineEntry } from '../types/claim';
import type { RecordedClaimStatus } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import { checkMetadata, type MetadataLookup } from './claimMetadata';
import type { DataError } from './source';
import { buildTimeline, type ClaimEventLog } from './timeline';

/** `getClaim(claimId)` as the typed ABI decodes it (the status comes from `statusOf`). */
export type ClaimRecord = {
  organization: Address;
  internalVerifier: Address;
  auditor: Address;
  anchoredAt: bigint;
  metadataHash: Hex;
};

/** Offchain material published for one evidence root (demo files today, the P4 API later). */
export type PublishedEvidence = {
  manifest: unknown;
  manifestHref: string | undefined;
  downloads: readonly PublicFileLink[];
};

/**
 * Everything a source knows about a claim. Both sources produce this and share the assembly
 * below, so demo data goes through exactly the same event-to-timeline code as chain data.
 */
export type ClaimSnapshot = {
  claimId: Hex;
  /** From `statusOf`: the contract view, never inferred from logs. */
  status: RecordedClaimStatus;
  record: ClaimRecord;
  /** From `evidenceRoots`: the contract view, never inferred from logs. */
  evidenceRoots: readonly Hex[];
  logs: readonly ClaimEventLog[];
  published: ReadonlyMap<number, PublishedEvidence>;
  /** The claim's title and description as served offchain; checked against `metadataHash` here. */
  metadata: MetadataLookup;
  /** P9 escrow from the contract views; `undefined` when they could not be read. */
  escrow?: EscrowState | undefined;
};

const unlessZero = (address: Address): Address | undefined =>
  isAddressEqual(address, zeroAddress) ? undefined : address;

/** The transaction that put root `rootIndex` onchain: the anchor for 0, a proof submission after. */
function recordingEntry(timeline: readonly TimelineEntry[], rootIndex: number): TimelineEntry | undefined {
  const entry = timeline.find(({ action }) =>
    rootIndex === 0 ? action.kind === 'anchored' : action.kind === 'proof-submitted' && action.rootIndex === rootIndex,
  );
  return entry;
}

function evidenceBundles(snapshot: ClaimSnapshot, timeline: readonly TimelineEntry[], anchoredAt: number): EvidenceBundle[] {
  const bundles = snapshot.evidenceRoots.map((root, rootIndex): EvidenceBundle => {
    const recording = recordingEntry(timeline, rootIndex);
    const published = snapshot.published.get(rootIndex);
    const bundle: EvidenceBundle = {
      rootIndex,
      root,
      recordedAt: recording?.timestamp ?? (rootIndex === 0 ? anchoredAt : undefined),
      txHash: recording?.txHash,
      publishedManifest: published?.manifest,
      manifestHref: published?.manifestHref,
      downloads: published?.downloads ?? [],
    };
    return bundle;
  });
  return bundles;
}

export function assembleClaimView(snapshot: ClaimSnapshot, source: ClaimSource): Result<ClaimView, DataError> {
  const timeline = buildTimeline(snapshot.logs);
  if (!timeline.ok) {
    return err({ kind: 'invalid-data', detail: timeline.error });
  }
  const anchoredAt = Number(snapshot.record.anchoredAt);
  const view = ok<ClaimView>({
    claimId: snapshot.claimId,
    status: snapshot.status,
    organization: snapshot.record.organization,
    internalVerifier: unlessZero(snapshot.record.internalVerifier),
    auditor: unlessZero(snapshot.record.auditor),
    anchoredAt,
    metadataHash: snapshot.record.metadataHash,
    metadata: checkMetadata(snapshot.metadata, snapshot.claimId, snapshot.record.metadataHash),
    evidence: evidenceBundles(snapshot, timeline.value, anchoredAt),
    timeline: timeline.value,
    escrow: snapshot.escrow,
    source,
  });
  return view;
}
