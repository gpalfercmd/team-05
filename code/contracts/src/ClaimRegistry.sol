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
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClaimRegistry
/// @notice Anchors each claim's evidence root, enforces the two-stage verification
///         lifecycle declared in `IClaimRegistry` (spec F4, F5a, F5b, F7) and escrows the
///         per-claim deposits, rewards and penalties that make fraud expensive (P9).
/// @dev    Every action checks, in this order: the claim exists → its status allows the
///         action → the caller is authorized → the claim's organization is still active (only
///         on paths into Verified, and `requestProof`) → hash inputs are non-zero
///         → `msg.value` is exact (payable paths only). Rights are read
///         from the ParticipantRegistry at call time, so revocations take effect immediately:
///         a revoked organization's claim can still be rejected, but never (re)verified.
///         Effects come next, then the action-specific event and finally `StatusChanged`.
///         Money moves by pull only: every payout is a `credits` entry, and `withdraw` (the
///         only call that sends ETH, checks-effects-interactions plus `nonReentrant`) pays it.
///         No function loops over claims. Other external calls are view calls to the trusted
///         ParticipantRegistry.
///         Known limitation: a claim parked in ProofRequested/ProofSubmitted when its
///         organization is revoked can never move on, so its deposit stays locked.
contract ClaimRegistry is IClaimRegistry, ReentrancyGuard {
    /// @dev Per-claim escrow bookkeeping, one storage slot. The amounts locked follow from the
    ///      status and the immutable parameters, so they are not stored (see `lockedOf`).
    struct Escrow {
        uint64 verifiedAt;
        bool settled;
        /// @dev Opener of the currently open dispute; paid if the dispute is upheld.
        address disputant;
    }

    IParticipantRegistry private immutable _participants;

    uint256 private immutable _auditorReward;
    uint256 private immutable _auditorDeposit;
    uint256 private immutable _organizationPenalty;
    uint256 private immutable _disputeBond;
    uint256 private immutable _disputeWindow;

    mapping(bytes32 claimId => Claim) private _claims;

    /// @dev Index 0 is the original bundle; supplementary proofs are appended, never replaced.
    mapping(bytes32 claimId => bytes32[] roots) private _evidenceRoots;

    mapping(bytes32 claimId => Escrow) private _escrows;

    mapping(address account => uint256 amount) private _credits;

    /// @param registry            The ParticipantRegistry that holds every role.
    /// @param auditorReward_       Wei the auditor earns once its approval survives the window.
    /// @param auditorDeposit_      Wei the auditor locks when approving.
    /// @param organizationPenalty_ Wei the organization loses if a dispute is upheld.
    /// @param disputeBond_         Wei a disputant locks to open a dispute.
    /// @param disputeWindow_       Seconds after verification during which disputes are accepted.
    constructor(
        IParticipantRegistry registry,
        uint256 auditorReward_,
        uint256 auditorDeposit_,
        uint256 organizationPenalty_,
        uint256 disputeBond_,
        uint256 disputeWindow_
    ) {
        bool anyZero = address(registry) == address(0) || auditorReward_ == 0 || auditorDeposit_ == 0
            || organizationPenalty_ == 0 || disputeBond_ == 0 || disputeWindow_ == 0;
        if (anyZero) revert ZeroValue();

        _participants = registry;
        _auditorReward = auditorReward_;
        _auditorDeposit = auditorDeposit_;
        _organizationPenalty = organizationPenalty_;
        _disputeBond = disputeBond_;
        _disputeWindow = disputeWindow_;
    }

    // --------------------------------------------------- organization actions

    /// @inheritdoc IClaimRegistry
    /// @dev The organization prepays the auditor's reward, so an honest auditor is always paid.
    function anchorClaim(bytes32 claimId, bytes32 evidenceRoot, bytes32 metadataHash) external payable {
        if (_claims[claimId].status != ClaimStatus.None) revert ClaimAlreadyExists(claimId);
        if (!_participants.isOrganization(msg.sender)) revert NotActiveOrganization(msg.sender);
        uint256 verifiers = _participants.activeVerifierCount(msg.sender);
        if (verifiers < MIN_INTERNAL_VERIFIERS) revert InsufficientInternalVerifiers(msg.sender, verifiers);
        _requireNonZero(claimId);
        _requireNonZero(evidenceRoot);
        _requireNonZero(metadataHash);
        _requireValue(_anchorDeposit());

        Claim storage claim = _claims[claimId];
        claim.organization = msg.sender;
        // casting to 'uint64' is safe because Unix seconds exceed 64 bits only after year 5e11.
        // forge-lint: disable-next-line(unsafe-typecast)
        claim.anchoredAt = uint64(block.timestamp);
        claim.metadataHash = metadataHash;
        _evidenceRoots[claimId].push(evidenceRoot);
        emit ClaimAnchored(claimId, msg.sender, evidenceRoot, metadataHash);
        emit DepositLocked(claimId, msg.sender, msg.value);
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
    ///      No money is involved at checkpoint 1; a reject refunds the organization's deposit.
    function attestInternal(bytes32 claimId, bool approve, bytes32 justificationHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Anchored);
        _requireOrganizationVerifier(claim);
        _requireNonZero(justificationHash);

        claim.internalVerifier = msg.sender;
        emit InternalAttestation(claimId, msg.sender, approve, justificationHash);
        if (!approve) _credit(claimId, claim.organization, _anchorDeposit());
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
    /// @dev A revoked organization can never answer (`submitProof` needs an active one), so the
    ///      request would only park the claim; the auditor must reject it with `attestFinal`.
    function requestProof(bytes32 claimId, bytes32 requestHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.InternallyVerified);
        _requireAssignedAuditor(claim);
        _requireActiveOrganization(claim);
        _requireNonZero(requestHash);

        emit ProofRequested(claimId, msg.sender, requestHash);
        _setStatus(claimId, claim, ClaimStatus.ProofRequested);
    }

    /// @inheritdoc IClaimRegistry
    /// @dev Approval needs the claim's organization to be active: once the Registry Admin revokes
    ///      it (e.g. for fraud), its pending claims can only be rejected, never verified.
    ///      Approve locks the auditor's deposit and starts the dispute window (`verifiedAt` is
    ///      written only here, so a dismissed dispute never extends the window); reject takes
    ///      no value and refunds the organization's deposit.
    function attestFinal(bytes32 claimId, bool approve, bytes32 justificationHash) external payable {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.InternallyVerified);
        _requireAssignedAuditor(claim);
        if (approve) _requireActiveOrganization(claim);
        _requireNonZero(justificationHash);
        _requireValue(approve ? _auditorDeposit : 0);

        emit FinalAttestation(claimId, msg.sender, approve, justificationHash);
        if (approve) {
            // casting to 'uint64' is safe because Unix seconds exceed 64 bits only after year 5e11.
            // forge-lint: disable-next-line(unsafe-typecast)
            _escrows[claimId].verifiedAt = uint64(block.timestamp);
            emit DepositLocked(claimId, msg.sender, msg.value);
        } else {
            _credit(claimId, claim.organization, _anchorDeposit());
        }
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
    /// @dev Dismissing returns the claim to Verified, so it needs the claim's organization to be
    ///      active; a dispute against a revoked organization's claim can only be upheld.
    ///      Upheld: the disputant takes the bond, the organization's penalty, the auditor's deposit
    ///      and the escrowed reward (the organization committed fraud, so its prepaid reward goes
    ///      to whoever exposed it). Dismissed: the bond compensates the organization and the
    ///      approving auditor (`claim.auditor`, which cannot change after approval); the odd wei,
    ///      if any, goes to the organization. A dispute opened in time can be resolved any time.
    function resolveDispute(bytes32 claimId, bool upheld, bytes32 justificationHash) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Disputed);
        _requireAuthority();
        if (!upheld) _requireActiveOrganization(claim);
        _requireNonZero(justificationHash);

        Escrow storage escrow = _escrows[claimId];
        address disputant = escrow.disputant;
        escrow.disputant = address(0);
        emit DisputeResolved(claimId, msg.sender, upheld, justificationHash);
        if (upheld) {
            _credit(claimId, disputant, _disputeBond + _organizationPenalty + _auditorDeposit + _auditorReward);
        } else {
            uint256 auditorShare = _disputeBond / 2;
            _credit(claimId, claim.organization, _disputeBond - auditorShare);
            _credit(claimId, claim.auditor, auditorShare);
        }
        _setStatus(claimId, claim, upheld ? ClaimStatus.Rejected : ClaimStatus.Verified);
    }

    // ------------------------------------------------ any accredited participant

    /// @inheritdoc IClaimRegistry
    /// @dev The organization and the approving auditor cannot dispute their own claim: a
    ///      self-dispute upheld would hand the forfeited deposits back to the wrongdoer.
    ///      A settled claim is always past its window, so it fails the window check.
    function openDispute(bytes32 claimId, bytes32 counterEvidenceHash) external payable {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Verified);
        if (!_participants.isAccredited(msg.sender)) revert NotAccredited(msg.sender);
        if (msg.sender == claim.organization || msg.sender == claim.auditor) revert CannotDisputeOwnClaim(msg.sender);
        uint256 closesAt = _windowClosesAt(_escrows[claimId]);
        // A validator can skew the timestamp by seconds; the window lasts weeks.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= closesAt) revert DisputeWindowClosed(claimId, closesAt);
        _requireNonZero(counterEvidenceHash);
        _requireValue(_disputeBond);

        _escrows[claimId].disputant = msg.sender;
        emit DisputeOpened(claimId, msg.sender, counterEvidenceHash);
        emit DepositLocked(claimId, msg.sender, msg.value);
        _setStatus(claimId, claim, ClaimStatus.Disputed);
    }

    // ----------------------------------------------------------------- anyone

    /// @inheritdoc IClaimRegistry
    /// @dev A dispute opened before the window closed must be resolved first (status Disputed).
    function settle(bytes32 claimId) external {
        Claim storage claim = _loadExisting(claimId);
        _requireStatus(claimId, claim, ClaimStatus.Verified);
        Escrow storage escrow = _escrows[claimId];
        if (escrow.settled) revert AlreadySettled(claimId);
        uint256 closesAt = _windowClosesAt(escrow);
        // A validator can skew the timestamp by seconds; the window lasts weeks.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < closesAt) revert DisputeWindowOpen(claimId, closesAt);

        escrow.settled = true;
        _credit(claimId, claim.organization, _organizationPenalty);
        _credit(claimId, claim.auditor, _auditorDeposit + _auditorReward);
        emit ClaimSettled(claimId, msg.sender);
    }

    /// @inheritdoc IClaimRegistry
    /// @dev Checks-effects-interactions: the credit is zeroed before the transfer, and
    ///      `nonReentrant` blocks any re-entry from the receiver.
    function withdraw() external nonReentrant {
        uint256 amount = _credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw(msg.sender);

        _credits[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert WithdrawFailed(msg.sender);
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

    /// @inheritdoc IClaimRegistry
    function auditorReward() external view returns (uint256) {
        return _auditorReward;
    }

    /// @inheritdoc IClaimRegistry
    function auditorDeposit() external view returns (uint256) {
        return _auditorDeposit;
    }

    /// @inheritdoc IClaimRegistry
    function organizationPenalty() external view returns (uint256) {
        return _organizationPenalty;
    }

    /// @inheritdoc IClaimRegistry
    function disputeBond() external view returns (uint256) {
        return _disputeBond;
    }

    /// @inheritdoc IClaimRegistry
    function disputeWindow() external view returns (uint256) {
        return _disputeWindow;
    }

    /// @inheritdoc IClaimRegistry
    function anchorDeposit() external view returns (uint256) {
        return _anchorDeposit();
    }

    /// @inheritdoc IClaimRegistry
    function credits(address account) external view returns (uint256) {
        return _credits[account];
    }

    /// @inheritdoc IClaimRegistry
    function verifiedAt(bytes32 claimId) external view returns (uint64) {
        return _escrows[claimId].verifiedAt;
    }

    /// @inheritdoc IClaimRegistry
    function disputeWindowClosesAt(bytes32 claimId) external view returns (uint256) {
        return _windowClosesAt(_escrows[claimId]);
    }

    /// @inheritdoc IClaimRegistry
    function settled(bytes32 claimId) external view returns (bool) {
        return _escrows[claimId].settled;
    }

    /// @inheritdoc IClaimRegistry
    /// @dev Derived from the status: before a decision the organization's deposit; Verified adds
    ///      the auditor's deposit (until settled); Disputed adds the bond; Rejected and unknown
    ///      claims hold nothing (everything was credited).
    function lockedOf(bytes32 claimId) external view returns (uint256 locked) {
        ClaimStatus status = _claims[claimId].status;
        if (status == ClaimStatus.Verified) {
            if (!_escrows[claimId].settled) locked = _anchorDeposit() + _auditorDeposit;
        } else if (status == ClaimStatus.Disputed) {
            locked = _anchorDeposit() + _auditorDeposit + _disputeBond;
        } else if (status != ClaimStatus.None && status != ClaimStatus.Rejected) {
            locked = _anchorDeposit();
        }
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

    /// @dev Guards every path into Verified (and the proof request only the organization could
    ///      answer). Revocation is final, so a revoked organization's claim can be rejected but
    ///      never (re)verified. Anchoring and `submitProof` check the caller instead.
    function _requireActiveOrganization(Claim storage claim) private view {
        if (!_participants.isOrganization(claim.organization)) revert NotActiveOrganization(claim.organization);
    }

    function _requireAuthority() private view {
        if (!_participants.isAccreditationAuthority(msg.sender)) revert NotAccreditationAuthority(msg.sender);
    }

    /// @dev The backend always hashes some text, so a zero hash signals a client bug.
    function _requireNonZero(bytes32 value) private pure {
        if (value == bytes32(0)) revert ZeroValue();
    }

    /// @dev Reverts unless `msg.value` is exactly `expected`; payable paths call it last.
    function _requireValue(uint256 expected) private view {
        if (msg.value != expected) revert WrongDepositAmount(expected, msg.value);
    }

    function _anchorDeposit() private view returns (uint256) {
        return _organizationPenalty + _auditorReward;
    }

    /// @dev 0 for a claim that was never Verified.
    function _windowClosesAt(Escrow storage escrow) private view returns (uint256 closesAt) {
        if (escrow.verifiedAt != 0) closesAt = uint256(escrow.verifiedAt) + _disputeWindow;
    }

    function _credit(bytes32 claimId, address account, uint256 amount) private {
        _credits[account] += amount;
        emit Credited(claimId, account, amount);
    }

    function _setStatus(bytes32 claimId, Claim storage claim, ClaimStatus to) private {
        ClaimStatus from = claim.status;
        claim.status = to;
        emit StatusChanged(claimId, from, to);
    }
}
