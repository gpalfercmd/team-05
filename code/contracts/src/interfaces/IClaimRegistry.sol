// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Claim lifecycle interface (frozen in P1)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity ^0.8.24;

import {IParticipantRegistry} from "./IParticipantRegistry.sol";

/// @dev An organization needs this many active internal verifiers to anchor a claim:
///      checkpoint 1 and the supplementary-proof confirmation must be different people.
uint256 constant MIN_INTERNAL_VERIFIERS = 2;

/// @title IClaimRegistry
/// @notice Evidence anchoring and the two-stage verification state machine (spec F4, F5a, F5b, F7).
///
///         Transitions (any other call reverts with InvalidStatus):
///           None               → Anchored            anchorClaim     (organization)
///           Anchored           → InternallyVerified  attestInternal  (internal verifier, approve)
///           Anchored           → Rejected            attestInternal  (internal verifier, reject)
///           InternallyVerified → ProofRequested      requestProof    (assigned auditor)
///           ProofRequested     → ProofSubmitted      submitProof     (organization)
///           ProofSubmitted     → InternallyVerified  confirmProof    (2nd internal verifier, accept)
///           ProofSubmitted     → ProofRequested      confirmProof    (2nd internal verifier, return)
///           InternallyVerified → Verified            attestFinal     (assigned auditor, approve)
///           InternallyVerified → Rejected            attestFinal     (assigned auditor, reject)
///           Verified           → Disputed            openDispute     (any accredited participant)
///           Disputed           → Rejected            resolveDispute  (Accreditation Authority, upheld)
///           Disputed           → Verified            resolveDispute  (Accreditation Authority, dismissed)
///
///         Only hashes go onchain: evidence roots, metadata, justifications, proof requests
///         and counter-evidence stay offchain. `claimId` = keccak256 of the backend's UUID.
interface IClaimRegistry {
    enum ClaimStatus {
        None, // claim does not exist
        Anchored,
        InternallyVerified,
        ProofRequested,
        ProofSubmitted,
        Verified,
        Rejected,
        Disputed
    }

    struct Claim {
        address organization;
        ClaimStatus status;
        /// @dev Wallet that gave the checkpoint-1 approval; cannot confirm supplementary proof.
        address internalVerifier;
        /// @dev Auditor assigned by the Accreditation Authority; address(0) until assigned.
        address auditor;
        uint64 anchoredAt;
        bytes32 metadataHash;
    }

    // ---------------------------------------------------------------- events
    // `StatusChanged` is emitted on every transition so the indexer can build the
    // timeline from one event; the specific events carry the action's details.

    event StatusChanged(bytes32 indexed claimId, ClaimStatus from, ClaimStatus to);
    event ClaimAnchored(
        bytes32 indexed claimId, address indexed organization, bytes32 evidenceRoot, bytes32 metadataHash
    );
    event InternalAttestation(
        bytes32 indexed claimId, address indexed verifier, bool approved, bytes32 justificationHash
    );
    event AuditorAssigned(bytes32 indexed claimId, address indexed auditor, address indexed previousAuditor);
    event ProofRequested(bytes32 indexed claimId, address indexed auditor, bytes32 requestHash);
    /// @param rootIndex Position of `supplementaryRoot` in `evidenceRoots(claimId)` (0 is the original).
    event ProofSubmitted(
        bytes32 indexed claimId, address indexed organization, bytes32 supplementaryRoot, uint256 rootIndex
    );
    event ProofReviewed(bytes32 indexed claimId, address indexed verifier, bool accepted, bytes32 justificationHash);
    event FinalAttestation(bytes32 indexed claimId, address indexed auditor, bool approved, bytes32 justificationHash);
    event DisputeOpened(bytes32 indexed claimId, address indexed disputant, bytes32 counterEvidenceHash);
    event DisputeResolved(bytes32 indexed claimId, address indexed authority, bool upheld, bytes32 justificationHash);

    // ---------------------------------------------------------------- errors

    error ZeroValue();
    error ClaimAlreadyExists(bytes32 claimId);
    error ClaimNotFound(bytes32 claimId);
    error InvalidStatus(bytes32 claimId, ClaimStatus current);
    error NotActiveOrganization(address account);
    error NotClaimOrganization(address account);
    error InsufficientInternalVerifiers(address organization, uint256 activeVerifiers);
    error NotOrganizationVerifier(address account);
    error SameVerifierAsCheckpoint1(address account);
    error NotActiveAuditor(address account);
    error NotAssignedAuditor(address account);
    error NotAccreditationAuthority(address account);
    error NotAccredited(address account);

    // --------------------------------------------------- organization actions

    /// @notice Anchors a new claim. Caller: active organization with at least
    ///         MIN_INTERNAL_VERIFIERS active internal verifiers. → Anchored
    function anchorClaim(bytes32 claimId, bytes32 evidenceRoot, bytes32 metadataHash) external;

    /// @notice Answers a proof request with the Merkle root of the supplementary files.
    ///         Caller: the claim's organization. ProofRequested → ProofSubmitted
    function submitProof(bytes32 claimId, bytes32 supplementaryRoot) external;

    // ----------------------------------------------- internal verifier actions

    /// @notice Checkpoint 1. Caller: active internal verifier of the claim's organization.
    ///         Anchored → InternallyVerified (approve) | Rejected (reject)
    function attestInternal(bytes32 claimId, bool approve, bytes32 justificationHash) external;

    /// @notice Confirms supplementary proof. Caller: active internal verifier of the claim's
    ///         organization, different from the checkpoint-1 verifier.
    ///         ProofSubmitted → InternallyVerified (accept) | ProofRequested (return)
    function confirmProof(bytes32 claimId, bool accept, bytes32 justificationHash) external;

    // ---------------------------------------------------------- auditor actions

    /// @notice Caller: the assigned auditor. InternallyVerified → ProofRequested
    function requestProof(bytes32 claimId, bytes32 requestHash) external;

    /// @notice Checkpoint 2, final. Caller: the assigned auditor.
    ///         InternallyVerified → Verified (approve) | Rejected (reject)
    function attestFinal(bytes32 claimId, bool approve, bytes32 justificationHash) external;

    // ------------------------------------------- Accreditation Authority actions

    /// @notice Assigns or reassigns an active auditor while the claim is
    ///         InternallyVerified, ProofRequested or ProofSubmitted. No status change.
    function assignAuditor(bytes32 claimId, address auditor) external;

    /// @notice Disputed → Rejected (upheld) | Verified (dismissed)
    function resolveDispute(bytes32 claimId, bool upheld, bytes32 justificationHash) external;

    // ------------------------------------------------ any accredited participant

    /// @notice Caller: any active organization, internal verifier or auditor.
    ///         Verified → Disputed (at most one open dispute, enforced by the status).
    function openDispute(bytes32 claimId, bytes32 counterEvidenceHash) external;

    // ------------------------------------------------------------------ views

    function participantRegistry() external view returns (IParticipantRegistry);

    function getClaim(bytes32 claimId) external view returns (Claim memory);

    function statusOf(bytes32 claimId) external view returns (ClaimStatus);

    /// @notice All evidence roots of a claim: index 0 is the original bundle, then one per
    ///         supplementary proof, in submission order. The public page verifies files
    ///         against these values read directly from the contract.
    function evidenceRoots(bytes32 claimId) external view returns (bytes32[] memory);
}
