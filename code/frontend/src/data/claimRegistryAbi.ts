// =============================================================================
// Proof of Aid — Team 05 — Typed ClaimRegistry ABI subset for the public page (views + events)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { parseAbi, toEventSelector, type Hex } from 'viem';

// The JSON ABI in code/shared is typed with plain strings, so reads through it return `unknown`.
// Human-readable signatures parsed `as const` give viem literal types instead: decoded values
// arrive typed (addresses, bytes32, bigint). A test compares every line with the frozen ABI
// (name, parameter names, types, indexed flags, selectors), so this copy cannot drift from it.
export const claimRegistryReadAbi = parseAbi([
  'struct Claim { address organization; uint8 status; address internalVerifier; address auditor; uint64 anchoredAt; bytes32 metadataHash; }',
  'function statusOf(bytes32 claimId) view returns (uint8)',
  'function getClaim(bytes32 claimId) view returns (Claim)',
  'function evidenceRoots(bytes32 claimId) view returns (bytes32[])',
  'event StatusChanged(bytes32 indexed claimId, uint8 from, uint8 to)',
  'event ClaimAnchored(bytes32 indexed claimId, address indexed organization, bytes32 evidenceRoot, bytes32 metadataHash)',
  'event InternalAttestation(bytes32 indexed claimId, address indexed verifier, bool approved, bytes32 justificationHash)',
  'event AuditorAssigned(bytes32 indexed claimId, address indexed auditor, address indexed previousAuditor)',
  'event ProofRequested(bytes32 indexed claimId, address indexed auditor, bytes32 requestHash)',
  'event ProofSubmitted(bytes32 indexed claimId, address indexed organization, bytes32 supplementaryRoot, uint256 rootIndex)',
  'event ProofReviewed(bytes32 indexed claimId, address indexed verifier, bool accepted, bytes32 justificationHash)',
  'event FinalAttestation(bytes32 indexed claimId, address indexed auditor, bool approved, bytes32 justificationHash)',
  'event DisputeOpened(bytes32 indexed claimId, address indexed disputant, bytes32 counterEvidenceHash)',
  'event DisputeResolved(bytes32 indexed claimId, address indexed authority, bool upheld, bytes32 justificationHash)',
] as const);

export type ClaimRegistryEvent = Extract<(typeof claimRegistryReadAbi)[number], { type: 'event' }>;

export type ClaimRegistryEventName = ClaimRegistryEvent['name'];

/** topic0 of every timeline event; logs with any other signature are ignored, not decoded. */
export const CLAIM_EVENT_SELECTORS: ReadonlySet<Hex> = new Set(
  claimRegistryReadAbi
    .filter((item): item is ClaimRegistryEvent => item.type === 'event')
    .map((event) => toEventSelector(event)),
);
