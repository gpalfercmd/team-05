// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Evidence anchoring and the claim verification state machine
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {IClaimRegistry, MIN_INTERNAL_VERIFIERS} from "./interfaces/IClaimRegistry.sol";
import {IParticipantRegistry} from "./interfaces/IParticipantRegistry.sol";

/// @title ClaimRegistry
/// @notice Anchors each claim's evidence root and enforces the two-stage verification
///         lifecycle declared in `IClaimRegistry` (spec F4, F5a, F5b, F7).
/// @dev    Every action checks, in this order: the claim exists → its status allows the
///         action → the caller is authorized → hash inputs are non-zero. Rights are read from
///         the ParticipantRegistry at call time, so revocations take effect immediately.
///         Effects come next, then the action-specific event and finally `StatusChanged`.
///         The only external calls are view calls to the trusted ParticipantRegistry.
contract ClaimRegistry is IClaimRegistry {
    IParticipantRegistry private immutable _participants;

    mapping(bytes32 claimId => Claim) private _claims;

    /// @dev Index 0 is the original bundle; supplementary proofs are appended, never replaced.
    mapping(bytes32 claimId => bytes32[] roots) private _evidenceRoots;

    constructor(IParticipantRegistry registry) {
        if (address(registry) == address(0)) revert ZeroValue();

        _participants = registry;
    }

    // --------------------------------------------------- organization actions

    /// @inheritdoc IClaimRegistry
    function anchorClaim(bytes32 claimId, bytes32 evidenceRoot, bytes32 metadataHash) external {
        if (_claims[claimId].status != ClaimStatus.None) revert ClaimAlreadyExists(claimId);
        if (!_participants.isOrganization(msg.sender)) revert NotActiveOrganization(msg.sender);
        uint256 verifiers = _participants.activeVerifierCount(msg.sender);
        if (verifiers < MIN_INTERNAL_VERIFIERS) revert InsufficientInternalVerifiers(msg.sender, verifiers);
        _requireNonZero(claimId);
        _requireNonZero(evidenceRoot);
        _requireNonZero(metadataHash);

        Claim storage claim = _claims[claimId];
        claim.organization = msg.sender;
        // casting to 'uint64' is safe because Unix seconds exceed 64 bits only after year 5e11.
        // forge-lint: disable-next-line(unsafe-typecast)
        claim.anchoredAt = uint64(block.timestamp);
        claim.metadataHash = metadataHash;
        _evidenceRoots[claimId].push(evidenceRoot);
        emit ClaimAnchored(claimId, msg.sender, evidenceRoot, metadataHash);
        _setStatus(claimId, claim, ClaimStatus.Anchored);
    }

    /// @inheritdoc IClaimRegistry
    function submitProof(bytes32 claimId, bytes32 supplementaryRoot) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.ProofRequested);
        if (msg.sender != claim.organization) revert NotClaimOrganization(msg.sender);
        if (!_participants.isOrganization(msg.sender)) revert NotActiveOrganization(msg.sender);
        _requireNonZero(supplementaryRoot);

        bytes32[] storage roots = _evidenceRoots[claimId];
        roots.push(supplementaryRoot);
        emit ProofSubmitted(claimId, msg.sender, supplementaryRoot, roots.length - 1);
        _setStatus(claimId, claim, ClaimStatus.ProofSubmitted);
    }

    // ----------------------------------------------- internal verifier actions

    /// @inheritdoc IClaimRegistry
    /// @dev The verifier is recorded on reject too, so the history names who stopped the claim.
    function attestInternal(bytes32 claimId, bool approve, bytes32 justificationHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Anchored);
        _requireOrganizationVerifier(claim);
        _requireNonZero(justificationHash);

        claim.internalVerifier = msg.sender;
        emit InternalAttestation(claimId, msg.sender, approve, justificationHash);
        _setStatus(claimId, claim, approve ? ClaimStatus.InternallyVerified : ClaimStatus.Rejected);
    }

    /// @inheritdoc IClaimRegistry
    /// @dev Four-eyes rule: the checkpoint-1 verifier cannot confirm proof for its own approval.
    ///      The organization wallet can never pass `_requireOrganizationVerifier`, because the
    ///      ParticipantRegistry gives each wallet a single role.
    function confirmProof(bytes32 claimId, bool accept, bytes32 justificationHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.ProofSubmitted);
        _requireOrganizationVerifier(claim);
        if (msg.sender == claim.internalVerifier) revert SameVerifierAsCheckpoint1(msg.sender);
        _requireNonZero(justificationHash);

        emit ProofReviewed(claimId, msg.sender, accept, justificationHash);
        _setStatus(claimId, claim, accept ? ClaimStatus.InternallyVerified : ClaimStatus.ProofRequested);
    }

    // ---------------------------------------------------------- auditor actions

    /// @inheritdoc IClaimRegistry
    function requestProof(bytes32 claimId, bytes32 requestHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.InternallyVerified);
        _requireAssignedAuditor(claim);
        _requireNonZero(requestHash);

        emit ProofRequested(claimId, msg.sender, requestHash);
        _setStatus(claimId, claim, ClaimStatus.ProofRequested);
    }

    /// @inheritdoc IClaimRegistry
    function attestFinal(bytes32 claimId, bool approve, bytes32 justificationHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.InternallyVerified);
        _requireAssignedAuditor(claim);
        _requireNonZero(justificationHash);

        emit FinalAttestation(claimId, msg.sender, approve, justificationHash);
        _setStatus(claimId, claim, approve ? ClaimStatus.Verified : ClaimStatus.Rejected);
    }

    // ------------------------------------------- Accreditation Authority actions

    /// @inheritdoc IClaimRegistry
    /// @dev `auditor == address(0)` is not an active auditor, so it reverts with NotActiveAuditor.
    ///      Reassigning the same auditor is allowed and only re-emits the event.
    function assignAuditor(bytes32 claimId, address auditor) external {
        Claim storage claim = _loadExisting(claimId);
        ClaimStatus current = claim.status;
        if (
            current != ClaimStatus.InternallyVerified && current != ClaimStatus.ProofRequested
                && current != ClaimStatus.ProofSubmitted
        ) revert InvalidStatus(claimId, current);
        _requireAuthority();
        if (!_participants.isAuditor(auditor)) revert NotActiveAuditor(auditor);

        address previousAuditor = claim.auditor;
        claim.auditor = auditor;
        emit AuditorAssigned(claimId, auditor, previousAuditor);
    }

    /// @inheritdoc IClaimRegistry
    function resolveDispute(bytes32 claimId, bool upheld, bytes32 justificationHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Disputed);
        _requireAuthority();
        _requireNonZero(justificationHash);

        emit DisputeResolved(claimId, msg.sender, upheld, justificationHash);
        _setStatus(claimId, claim, upheld ? ClaimStatus.Rejected : ClaimStatus.Verified);
    }

    // ------------------------------------------------ any accredited participant

    /// @inheritdoc IClaimRegistry
    function openDispute(bytes32 claimId, bytes32 counterEvidenceHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Verified);
        if (!_participants.isAccredited(msg.sender)) revert NotAccredited(msg.sender);
        _requireNonZero(counterEvidenceHash);

        emit DisputeOpened(claimId, msg.sender, counterEvidenceHash);
        _setStatus(claimId, claim, ClaimStatus.Disputed);
    }

    // ------------------------------------------------------------------ views

    /// @inheritdoc IClaimRegistry
    function participantRegistry() external view returns (IParticipantRegistry) {
        return _participants;
    }

    /// @inheritdoc IClaimRegistry
    /// @dev Unknown ids return the empty struct (status None); callers check `status`.
    function getClaim(bytes32 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }

    /// @inheritdoc IClaimRegistry
    function statusOf(bytes32 claimId) external view returns (ClaimStatus) {
        return _claims[claimId].status;
    }

    /// @inheritdoc IClaimRegistry
    function evidenceRoots(bytes32 claimId) external view returns (bytes32[] memory) {
        return _evidenceRoots[claimId];
    }

    // --------------------------------------------------------------- internals

    function _loadExisting(bytes32 claimId) private view returns (Claim storage claim) {
        claim = _claims[claimId];
        if (claim.status == ClaimStatus.None) revert ClaimNotFound(claimId);
    }

    function _requireStatus(bytes32 claimId, Claim storage claim, ClaimStatus expected) private view {
        if (claim.status != expected) revert InvalidStatus(claimId, claim.status);
    }

    /// @dev `organizationOf` is address(0) for revoked verifiers and for verifiers of a revoked
    ///      organization; a claim's organization is never address(0), so both are rejected.
    function _requireOrganizationVerifier(Claim storage claim) private view {
        if (_participants.organizationOf(msg.sender) != claim.organization) {
            revert NotOrganizationVerifier(msg.sender);
        }
    }

    /// @dev Assignment is checked first so a stranger learns "not assigned", while the assigned
    ///      wallet learns that its accreditation was revoked (the Authority must reassign).
    ///      An unassigned claim has `auditor == address(0)`, which never equals `msg.sender`.
    function _requireAssignedAuditor(Claim storage claim) private view {
        if (msg.sender != claim.auditor) revert NotAssignedAuditor(msg.sender);
        if (!_participants.isAuditor(msg.sender)) revert NotActiveAuditor(msg.sender);
    }

    function _requireAuthority() private view {
        if (!_participants.isAccreditationAuthority(msg.sender)) revert NotAccreditationAuthority(msg.sender);
    }

    /// @dev The backend always hashes some text, so a zero hash signals a client bug.
    function _requireNonZero(bytes32 value) private pure {
        if (value == bytes32(0)) revert ZeroValue();
    }

    function _setStatus(bytes32 claimId, Claim storage claim, ClaimStatus to) private {
        ClaimStatus from = claim.status;
        claim.status = to;
        emit StatusChanged(claimId, from, to);
    }
}
