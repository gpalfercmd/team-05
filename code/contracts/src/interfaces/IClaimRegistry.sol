// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Claim lifecycle interface (frozen in P1, incentives added in P9)
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
///         Incentives (P9), native ETH escrowed per claim by the registry, paid out by pull only:
///           anchorClaim           organization locks organizationPenalty + auditorReward
///           attestFinal(approve)  auditor locks auditorDeposit (reject takes no value)
///           openDispute           disputant locks disputeBond, only while
///                                 block.timestamp < verifiedAt + disputeWindow
///           Rejected (checkpoint 1 or auditor)  → organization credited its whole deposit back
///           dispute dismissed     → bond split: half to the approving auditor, the rest (with any
///                                   odd wei) to the organization; the claim is Verified again
///           dispute upheld        → disputant credited bond + penalty + auditor deposit + reward
///           settle (anyone, once the window closed and no dispute is open)
///                                 → organization credited its penalty, auditor its deposit + reward
///         `settle` changes no status: a settled claim stays Verified and can never be disputed.
///         `verifiedAt` is set once, by the approval, and a dismissed dispute does not reset it.
///         Credits are withdrawn with `withdraw`.
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
    /// @notice `depositor` locked `amount` wei in the claim's escrow (anchor, approval or dispute bond).
    event DepositLocked(bytes32 indexed claimId, address indexed depositor, uint256 amount);
    /// @notice `amount` wei of the claim's escrow became withdrawable by `account`.
    event Credited(bytes32 indexed claimId, address indexed account, uint256 amount);
    /// @notice `account` withdrew all of its credits.
    event Withdrawn(address indexed account, uint256 amount);
    /// @notice The dispute window closed undisputed and the deposits were released.
    event ClaimSettled(bytes32 indexed claimId, address indexed settler);

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
    error WrongDepositAmount(uint256 expected, uint256 sent);
    error CannotDisputeOwnClaim(address account);
    error DisputeWindowClosed(bytes32 claimId, uint256 closedAt);
    error DisputeWindowOpen(bytes32 claimId, uint256 closesAt);
    error AlreadySettled(bytes32 claimId);
    error NothingToWithdraw(address account);
    error WithdrawFailed(address account);

    // --------------------------------------------------- organization actions

    /// @notice Anchors a new claim. Caller: active organization with at least
    ///         MIN_INTERNAL_VERIFIERS active internal verifiers. → Anchored
    /// @dev    `msg.value` must equal `anchorDeposit()` (organizationPenalty + auditorReward).
    function anchorClaim(bytes32 claimId, bytes32 evidenceRoot, bytes32 metadataHash) external payable;

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
    /// @dev    Approve needs `msg.value == auditorDeposit()`; reject needs no value.
    function attestFinal(bytes32 claimId, bool approve, bytes32 justificationHash) external payable;

    // ------------------------------------------- Accreditation Authority actions

    /// @notice Assigns or reassigns an active auditor while the claim is
    ///         InternallyVerified, ProofRequested or ProofSubmitted. No status change.
    function assignAuditor(bytes32 claimId, address auditor) external;

    /// @notice Disputed → Rejected (upheld) | Verified (dismissed)
    function resolveDispute(bytes32 claimId, bool upheld, bytes32 justificationHash) external;

    // ------------------------------------------------ any accredited participant

    /// @notice Caller: any active organization, internal verifier or auditor, except the claim's
    ///         own organization and approving auditor, while the dispute window is open.
    ///         Verified → Disputed (at most one open dispute, enforced by the status).
    /// @dev    `msg.value` must equal `disputeBond()`.
    function openDispute(bytes32 claimId, bytes32 counterEvidenceHash) external payable;

    // ----------------------------------------------------------------- anyone

    /// @notice Releases an undisputed Verified claim's deposits once its dispute window closed.
    ///         No status change; afterwards the claim can never be disputed.
    function settle(bytes32 claimId) external;

    /// @notice Sends the caller all of its credits (pull payment).
    function withdraw() external;

    // ------------------------------------------------------------------ views

    function participantRegistry() external view returns (IParticipantRegistry);

    function getClaim(bytes32 claimId) external view returns (Claim memory);

    function statusOf(bytes32 claimId) external view returns (ClaimStatus);

    /// @notice All evidence roots of a claim: index 0 is the original bundle, then one per
    ///         supplementary proof, in submission order. The public page verifies files
    ///         against these values read directly from the contract.
    function evidenceRoots(bytes32 claimId) external view returns (bytes32[] memory);

    /// @notice Wei the auditor earns for an approval that survives the dispute window.
    function auditorReward() external view returns (uint256);

    /// @notice Wei the auditor locks when approving; lost if a dispute is upheld.
    function auditorDeposit() external view returns (uint256);

    /// @notice Wei the organization loses if a dispute against its claim is upheld.
    function organizationPenalty() external view returns (uint256);

    /// @notice Wei a disputant locks to open a dispute; lost if the dispute is dismissed.
    function disputeBond() external view returns (uint256);

    /// @notice Seconds after `verifiedAt` during which a Verified claim can be disputed.
    function disputeWindow() external view returns (uint256);

    /// @notice Exact `msg.value` of `anchorClaim`: organizationPenalty + auditorReward.
    function anchorDeposit() external view returns (uint256);

    /// @notice Wei `account` can withdraw.
    function credits(address account) external view returns (uint256);

    /// @notice When the claim first became Verified (0 if never).
    function verifiedAt(bytes32 claimId) external view returns (uint64);

    /// @notice `verifiedAt + disputeWindow`, the first second no dispute is accepted (0 if never Verified).
    function disputeWindowClosesAt(bytes32 claimId) external view returns (uint256);

    /// @notice Whether the claim's deposits were released by `settle`.
    function settled(bytes32 claimId) external view returns (bool);

    /// @notice Wei currently held in escrow for the claim (credits already paid out excluded).
    function lockedOf(bytes32 claimId) external view returns (uint256);
}
