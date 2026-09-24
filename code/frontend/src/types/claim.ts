// =============================================================================
// Proof of Aid — Team 05 — Public view of a claim, as read from the contract or demo data
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address, Hex } from 'viem';
import type { MetadataCheck } from '../data/claimMetadata';
import type { RecordedClaimStatus } from '../utils/claimStatus';

/** What a timeline entry says happened, from the action event of the transaction. */
export type TimelineAction =
  | { kind: 'anchored'; organization: Address; evidenceRoot: Hex }
  | { kind: 'internal-attestation'; verifier: Address; approved: boolean }
  | { kind: 'auditor-assigned'; auditor: Address; previousAuditor: Address | undefined }
  | { kind: 'proof-requested'; auditor: Address }
  | { kind: 'proof-submitted'; organization: Address; root: Hex; rootIndex: number }
  | { kind: 'proof-reviewed'; verifier: Address; accepted: boolean }
  | { kind: 'final-attestation'; auditor: Address; approved: boolean }
  | { kind: 'dispute-opened'; disputant: Address }
  | { kind: 'dispute-resolved'; authority: Address; upheld: boolean }
  /** A StatusChanged without an action event in the same transaction (not expected from P2). */
  | { kind: 'status-changed' };

/** One transaction of the claim's history: its action plus the status it moved the claim to. */
export type TimelineEntry = {
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  /** Block timestamp, seconds since the epoch. */
  timestamp: number;
  /** From the StatusChanged of the same transaction; `undefined` when the status did not change. */
  newStatus: RecordedClaimStatus | undefined;
  action: TimelineAction;
};

export type PublicFileLink = { name: string; href: string };

/** One onchain evidence root: index 0 is the original bundle, then one per supplementary proof. */
export type EvidenceBundle = {
  rootIndex: number;
  root: Hex;
  /** When the transaction that recorded this root was mined, if its event was found. */
  recordedAt: number | undefined;
  txHash: Hex | undefined;
  /**
   * File list published for this bundle (demo files now, the P4 API later), exactly as received.
   * It is untrusted: the page only uses it after proving it hashes to `root`.
   */
  publishedManifest: unknown;
  manifestHref: string | undefined;
  /** Public files the visitor can download to check them. */
  downloads: readonly PublicFileLink[];
};

/**
 * Where the page read a claim from:
 * - `chain`: everything from the contract (views for status and roots, event logs for the history).
 * - `indexer`: status, record and roots from the contract views, the history from the P4 indexer API.
 * - `demo`: built-in sample data.
 */
export type ClaimSource = 'chain' | 'indexer' | 'demo';

/** Only public, onchain values (plus public demo files): no personal data ever reaches this type. */
export type ClaimView = {
  /** keccak256 of the backend's claim UUID (bytes32). */
  claimId: Hex;
  status: RecordedClaimStatus;
  organization: Address;
  /** Checkpoint-1 verifier; `undefined` until the internal check happened. */
  internalVerifier: Address | undefined;
  /** Current auditor; `undefined` until the Accreditation Authority assigns one. */
  auditor: Address | undefined;
  /** `anchoredAt` from the contract: seconds since the epoch. */
  anchoredAt: number;
  metadataHash: Hex;
  /** Title and description from the API, shown only if they hash to `metadataHash` (P8.4). */
  metadata: MetadataCheck;
  evidence: readonly EvidenceBundle[];
  /** Oldest first. */
  timeline: readonly TimelineEntry[];
  source: ClaimSource;
};
