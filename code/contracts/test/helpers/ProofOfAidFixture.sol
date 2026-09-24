// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Shared Foundry fixture: registries, actors and claim drivers
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ParticipantRegistry} from "../../src/ParticipantRegistry.sol";
import {ClaimRegistry} from "../../src/ClaimRegistry.sol";
import {IClaimRegistry} from "../../src/interfaces/IClaimRegistry.sol";

/// @notice Deploys both registries and accredits a realistic cast:
///         `org` and `org2` each with two internal verifiers, two auditors (`auditor` and
///         `disputant`, the latter used as the second auditor and as a dispute opener) and an
///         unaccredited `outsider`. Drivers move a claim to any status through valid calls only,
///         sending the exact deposits; every actor starts with `ACTOR_BALANCE` wei. The registry
///         uses the production reference amounts (P9).
abstract contract ProofOfAidFixture is Test {
    /// @dev Every claim action except `anchorClaim`, which has no prior status.
    enum Action {
        AttestInternal,
        AssignAuditor,
        RequestProof,
        SubmitProof,
        ConfirmProof,
        AttestFinal,
        OpenDispute,
        ResolveDispute
    }

    uint8 internal constant ACTION_COUNT = 8;
    uint8 internal constant LAST_STATUS = uint8(IClaimRegistry.ClaimStatus.Disputed);

    bytes32 internal constant CLAIM_ID = keccak256("test:claim-uuid");
    bytes32 internal constant ROOT = keccak256("test:evidence-root");
    bytes32 internal constant METADATA = keccak256("test:metadata");
    bytes32 internal constant JUSTIFICATION = keccak256("test:justification");
    bytes32 internal constant REQUEST = keccak256("test:proof-request");
    bytes32 internal constant SUPPLEMENTARY_ROOT = keccak256("test:supplementary-root");
    bytes32 internal constant COUNTER_EVIDENCE = keccak256("test:counter-evidence");

    uint256 internal constant AUDITOR_REWARD = 0.01 ether;
    uint256 internal constant AUDITOR_DEPOSIT = 0.1 ether;
    uint256 internal constant ORGANIZATION_PENALTY = 1 ether;
    uint256 internal constant DISPUTE_BOND = 0.1 ether;
    uint256 internal constant DISPUTE_WINDOW = 60 days;
    uint256 internal constant ANCHOR_DEPOSIT = ORGANIZATION_PENALTY + AUDITOR_REWARD;
    uint256 internal constant ACTOR_BALANCE = 1000 ether;

    ParticipantRegistry internal participants;
    ClaimRegistry internal claims;

    address internal registryAdmin = makeAddr("registryAdmin");
    address internal authority = makeAddr("authority");
    address internal org = makeAddr("org");
    address internal verifier1 = makeAddr("verifier1");
    address internal verifier2 = makeAddr("verifier2");
    address internal auditor = makeAddr("auditor");
    address internal disputant = makeAddr("disputant");
    address internal outsider = makeAddr("outsider");
    address internal org2 = makeAddr("org2");
    address internal org2Verifier1 = makeAddr("org2Verifier1");
    address internal org2Verifier2 = makeAddr("org2Verifier2");

    function setUp() public virtual {
        participants = new ParticipantRegistry(registryAdmin, authority);
        claims = _newClaimRegistry(DISPUTE_BOND);

        vm.startPrank(registryAdmin);
        participants.registerOrganization(org);
        participants.registerInternalVerifier(verifier1, org);
        participants.registerInternalVerifier(verifier2, org);
        participants.registerOrganization(org2);
        participants.registerInternalVerifier(org2Verifier1, org2);
        participants.registerInternalVerifier(org2Verifier2, org2);
        vm.stopPrank();

        vm.startPrank(authority);
        participants.accreditAuditor(auditor);
        participants.accreditAuditor(disputant);
        vm.stopPrank();

        address[11] memory actors = _actors();
        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], ACTOR_BALANCE);
        }
    }

    /// @dev A registry on the fixture's participants with the reference amounts and `bond`.
    function _newClaimRegistry(uint256 bond) internal returns (ClaimRegistry registry) {
        registry = new ClaimRegistry(
            participants, AUDITOR_REWARD, AUDITOR_DEPOSIT, ORGANIZATION_PENALTY, bond, DISPUTE_WINDOW
        );
    }

    // ------------------------------------------------------------- claim drivers

    function _anchor(bytes32 claimId) internal {
        vm.prank(org);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(claimId, ROOT, METADATA);
    }

    function _attestInternal(bytes32 claimId, bool approve) internal {
        vm.prank(verifier1);
        claims.attestInternal(claimId, approve, JUSTIFICATION);
    }

    function _assign(bytes32 claimId, address newAuditor) internal {
        vm.prank(authority);
        claims.assignAuditor(claimId, newAuditor);
    }

    function _requestProof(bytes32 claimId) internal {
        vm.prank(auditor);
        claims.requestProof(claimId, REQUEST);
    }

    function _submitProof(bytes32 claimId) internal {
        vm.prank(org);
        claims.submitProof(claimId, SUPPLEMENTARY_ROOT);
    }

    function _confirmProof(bytes32 claimId, bool accept) internal {
        vm.prank(verifier2);
        claims.confirmProof(claimId, accept, JUSTIFICATION);
    }

    function _attestFinal(bytes32 claimId, bool approve) internal {
        vm.prank(auditor);
        claims.attestFinal{value: approve ? AUDITOR_DEPOSIT : 0}(claimId, approve, JUSTIFICATION);
    }

    function _openDispute(bytes32 claimId) internal {
        vm.prank(disputant);
        claims.openDispute{value: DISPUTE_BOND}(claimId, COUNTER_EVIDENCE);
    }

    function _resolveDispute(bytes32 claimId, bool upheld) internal {
        vm.prank(authority);
        claims.resolveDispute(claimId, upheld, JUSTIFICATION);
    }

    /// @dev Reaches `target` through valid calls. From InternallyVerified on, `auditor` is
    ///      assigned and `verifier1` is the checkpoint-1 verifier.
    function _driveTo(bytes32 claimId, IClaimRegistry.ClaimStatus target) internal {
        _anchor(claimId);
        if (target == IClaimRegistry.ClaimStatus.Rejected) _attestInternal(claimId, false);
        if (_isAfterCheckpoint1(target)) {
            _attestInternal(claimId, true);
            _assign(claimId, auditor);
        }
        if (target == IClaimRegistry.ClaimStatus.ProofRequested || target == IClaimRegistry.ClaimStatus.ProofSubmitted)
        {
            _requestProof(claimId);
        }
        if (target == IClaimRegistry.ClaimStatus.ProofSubmitted) _submitProof(claimId);
        if (target == IClaimRegistry.ClaimStatus.Verified || target == IClaimRegistry.ClaimStatus.Disputed) {
            _attestFinal(claimId, true);
        }
        if (target == IClaimRegistry.ClaimStatus.Disputed) _openDispute(claimId);
        assertEq(uint8(claims.statusOf(claimId)), uint8(target), "driver missed its target status");
    }

    function _isAfterCheckpoint1(IClaimRegistry.ClaimStatus status) internal pure returns (bool) {
        return status == IClaimRegistry.ClaimStatus.InternallyVerified
            || status == IClaimRegistry.ClaimStatus.ProofRequested
            || status == IClaimRegistry.ClaimStatus.ProofSubmitted || status == IClaimRegistry.ClaimStatus.Verified
            || status == IClaimRegistry.ClaimStatus.Disputed;
    }

    // ------------------------------------------------------ generic action calls

    /// @dev Calldata with valid, non-zero inputs; approvals are `true`, disputes are dismissed.
    function _calldata(Action action, bytes32 claimId) internal view returns (bytes memory data) {
        if (action == Action.AttestInternal) {
            data = abi.encodeCall(IClaimRegistry.attestInternal, (claimId, true, JUSTIFICATION));
        } else if (action == Action.AssignAuditor) {
            data = abi.encodeCall(IClaimRegistry.assignAuditor, (claimId, auditor));
        } else if (action == Action.RequestProof) {
            data = abi.encodeCall(IClaimRegistry.requestProof, (claimId, REQUEST));
        } else if (action == Action.SubmitProof) {
            data = abi.encodeCall(IClaimRegistry.submitProof, (claimId, SUPPLEMENTARY_ROOT));
        } else if (action == Action.ConfirmProof) {
            data = abi.encodeCall(IClaimRegistry.confirmProof, (claimId, true, JUSTIFICATION));
        } else if (action == Action.AttestFinal) {
            data = abi.encodeCall(IClaimRegistry.attestFinal, (claimId, true, JUSTIFICATION));
        } else if (action == Action.OpenDispute) {
            data = abi.encodeCall(IClaimRegistry.openDispute, (claimId, COUNTER_EVIDENCE));
        } else {
            data = abi.encodeCall(IClaimRegistry.resolveDispute, (claimId, false, JUSTIFICATION));
        }
    }

    /// @dev The exact `msg.value` of `_calldata(action, …)`: the approval deposit or the bond.
    function _valueFor(Action action) internal pure returns (uint256 value) {
        if (action == Action.AttestFinal) value = AUDITOR_DEPOSIT;
        else if (action == Action.OpenDispute) value = DISPUTE_BOND;
    }

    /// @dev Calls `action` as `caller`, with its deposit, and bubbles any revert, so
    ///      `vm.expectRevert` works. The caller must hold the deposit.
    function _actAs(Action action, bytes32 claimId, address caller) internal {
        bytes memory data = _calldata(action, claimId);
        vm.prank(caller);
        (bool ok, bytes memory returned) = address(claims).call{value: _valueFor(action)}(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(returned, 32), mload(returned))
            }
        }
    }

    function _act(Action action, bytes32 claimId) internal {
        _actAs(action, claimId, _authorizedCaller(action));
    }

    /// @dev The actor each action is designed for, given a claim driven by `_driveTo`.
    function _authorizedCaller(Action action) internal view returns (address caller) {
        if (action == Action.AttestInternal) caller = verifier1;
        else if (action == Action.AssignAuditor || action == Action.ResolveDispute) caller = authority;
        else if (action == Action.RequestProof || action == Action.AttestFinal) caller = auditor;
        else if (action == Action.SubmitProof) caller = org;
        else if (action == Action.ConfirmProof) caller = verifier2;
        else caller = disputant;
    }

    /// @dev The declared transition table: the statuses in which each action is allowed.
    function _isValidStatus(Action action, IClaimRegistry.ClaimStatus status) internal pure returns (bool valid) {
        if (action == Action.AttestInternal) {
            valid = status == IClaimRegistry.ClaimStatus.Anchored;
        } else if (action == Action.AssignAuditor) {
            valid = _isAuditPhase(status);
        } else if (action == Action.RequestProof || action == Action.AttestFinal) {
            valid = status == IClaimRegistry.ClaimStatus.InternallyVerified;
        } else if (action == Action.SubmitProof) {
            valid = status == IClaimRegistry.ClaimStatus.ProofRequested;
        } else if (action == Action.ConfirmProof) {
            valid = status == IClaimRegistry.ClaimStatus.ProofSubmitted;
        } else if (action == Action.OpenDispute) {
            valid = status == IClaimRegistry.ClaimStatus.Verified;
        } else {
            valid = status == IClaimRegistry.ClaimStatus.Disputed;
        }
    }

    /// @dev Status reached by a successful `_calldata` call from `from`.
    function _nextStatus(Action action, IClaimRegistry.ClaimStatus from)
        internal
        pure
        returns (IClaimRegistry.ClaimStatus to)
    {
        to = from;
        if (action == Action.AttestInternal || action == Action.ConfirmProof) {
            to = IClaimRegistry.ClaimStatus.InternallyVerified;
        } else if (action == Action.RequestProof) {
            to = IClaimRegistry.ClaimStatus.ProofRequested;
        } else if (action == Action.SubmitProof) {
            to = IClaimRegistry.ClaimStatus.ProofSubmitted;
        } else if (action == Action.AttestFinal || action == Action.ResolveDispute) {
            to = IClaimRegistry.ClaimStatus.Verified;
        } else if (action == Action.OpenDispute) {
            to = IClaimRegistry.ClaimStatus.Disputed;
        }
    }

    function _isAuditPhase(IClaimRegistry.ClaimStatus status) internal pure returns (bool) {
        return status == IClaimRegistry.ClaimStatus.InternallyVerified
            || status == IClaimRegistry.ClaimStatus.ProofRequested
            || status == IClaimRegistry.ClaimStatus.ProofSubmitted;
    }

    function _actors() internal view returns (address[11] memory actors) {
        actors = [
            registryAdmin,
            authority,
            org,
            verifier1,
            verifier2,
            auditor,
            disputant,
            outsider,
            org2,
            org2Verifier1,
            org2Verifier2
        ];
    }

    function _isKnownActor(address account) internal view returns (bool known) {
        address[11] memory actors = _actors();
        for (uint256 i = 0; i < actors.length; i++) {
            known = known || actors[i] == account;
        }
    }
}
