// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — ClaimRegistry tests: every transition, guard and event
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {IClaimRegistry, MIN_INTERNAL_VERIFIERS} from "../src/interfaces/IClaimRegistry.sol";
import {IParticipantRegistry} from "../src/interfaces/IParticipantRegistry.sol";
import {ProofOfAidFixture} from "./helpers/ProofOfAidFixture.sol";

contract ClaimRegistryTest is ProofOfAidFixture {
    // ------------------------------------------------------------- constructor

    function test_Constructor_StoresRegistry() public view {
        assertEq(address(claims.participantRegistry()), address(participants));
    }

    function test_Constructor_RevertsOnZeroRegistry() public {
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        new ClaimRegistry(
            IParticipantRegistry(address(0)),
            AUDITOR_REWARD,
            AUDITOR_DEPOSIT,
            ORGANIZATION_PENALTY,
            DISPUTE_BOND,
            DISPUTE_WINDOW
        );
    }

    // ---------------------------------------------------------------- anchorClaim

    function test_AnchorClaim_StoresClaimRootAndEmits() public {
        vm.warp(1_790_000_000);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ClaimAnchored(CLAIM_ID, org, ROOT, METADATA);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.None, IClaimRegistry.ClaimStatus.Anchored
        );
        _anchor(CLAIM_ID);

        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(claim.organization, org);
        assertEq(uint8(claim.status), uint8(IClaimRegistry.ClaimStatus.Anchored));
        assertEq(claim.internalVerifier, address(0));
        assertEq(claim.auditor, address(0));
        assertEq(claim.anchoredAt, 1_790_000_000);
        assertEq(claim.metadataHash, METADATA);
        bytes32[] memory roots = claims.evidenceRoots(CLAIM_ID);
        assertEq(roots.length, 1);
        assertEq(roots[0], ROOT);
    }

    function test_AnchorClaim_RevertsOnDuplicateClaimId() public {
        _anchor(CLAIM_ID);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.ClaimAlreadyExists.selector, CLAIM_ID));
        vm.prank(org2);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, SUPPLEMENTARY_ROOT, METADATA);

        // The original root is never overwritten.
        assertEq(claims.evidenceRoots(CLAIM_ID)[0], ROOT);
        assertEq(claims.getClaim(CLAIM_ID).organization, org);
    }

    function test_AnchorClaim_RevertsOnExistingClaimInEveryStatus() public {
        for (uint8 s = 1; s <= LAST_STATUS; s++) {
            bytes32 claimId = keccak256(abi.encode("existing", s));
            _driveTo(claimId, IClaimRegistry.ClaimStatus(s));
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.ClaimAlreadyExists.selector, claimId));
            _anchor(claimId);
        }
    }

    function test_AnchorClaim_OnlyActiveOrganization() public {
        address[7] memory notOrganizations =
            [verifier1, auditor, disputant, outsider, registryAdmin, authority, org2Verifier1];
        for (uint256 i = 0; i < notOrganizations.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, notOrganizations[i]));
            vm.prank(notOrganizations[i]);
            claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, ROOT, METADATA);
        }
    }

    function test_AnchorClaim_RevokedOrganizationCannotAnchor() public {
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        _anchor(CLAIM_ID);
    }

    function test_AnchorClaim_NeedsTwoActiveInternalVerifiers() public {
        address small = makeAddr("smallOrg");
        vm.deal(small, ACTOR_BALANCE);
        vm.prank(registryAdmin);
        participants.registerOrganization(small);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.InsufficientInternalVerifiers.selector, small, 0));
        vm.prank(small);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, ROOT, METADATA);

        vm.prank(registryAdmin);
        participants.registerInternalVerifier(makeAddr("smallVerifier1"), small);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.InsufficientInternalVerifiers.selector, small, 1));
        vm.prank(small);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, ROOT, METADATA);

        vm.prank(registryAdmin);
        participants.registerInternalVerifier(makeAddr("smallVerifier2"), small);
        vm.prank(small);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, ROOT, METADATA);
        assertEq(MIN_INTERNAL_VERIFIERS, 2);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Anchored));
    }

    function test_AnchorClaim_RevokedVerifierDropsOrganizationBelowMinimum() public {
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier2);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.InsufficientInternalVerifiers.selector, org, 1));
        _anchor(CLAIM_ID);
    }

    function test_AnchorClaim_RevertsOnZeroInputs() public {
        vm.startPrank(org);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(bytes32(0), ROOT, METADATA);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, bytes32(0), METADATA);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(CLAIM_ID, ROOT, bytes32(0));
        vm.stopPrank();
    }

    function test_AnchorClaim_AuthorizationIsCheckedBeforeInputs() public {
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, outsider));
        vm.prank(outsider);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(bytes32(0), bytes32(0), bytes32(0));
    }

    // ------------------------------------------------------------- attestInternal

    function test_AttestInternal_ApproveMovesToInternallyVerified() public {
        _anchor(CLAIM_ID);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.InternalAttestation(CLAIM_ID, verifier1, true, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.Anchored, IClaimRegistry.ClaimStatus.InternallyVerified
        );
        _attestInternal(CLAIM_ID, true);

        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(uint8(claim.status), uint8(IClaimRegistry.ClaimStatus.InternallyVerified));
        assertEq(claim.internalVerifier, verifier1);
    }

    function test_AttestInternal_RejectMovesToRejectedAndRecordsVerifier() public {
        _anchor(CLAIM_ID);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.InternalAttestation(CLAIM_ID, verifier2, false, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.Anchored, IClaimRegistry.ClaimStatus.Rejected
        );
        vm.prank(verifier2);
        claims.attestInternal(CLAIM_ID, false, JUSTIFICATION);

        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(uint8(claim.status), uint8(IClaimRegistry.ClaimStatus.Rejected));
        assertEq(claim.internalVerifier, verifier2);
    }

    function test_AttestInternal_OnlyVerifierOfTheClaimsOrganization() public {
        _anchor(CLAIM_ID);
        // Includes the submitter itself (Q7) and the other organization's verifiers.
        address[8] memory callers =
            [org, org2, org2Verifier1, org2Verifier2, auditor, outsider, registryAdmin, authority];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, callers[i]));
            vm.prank(callers[i]);
            claims.attestInternal(CLAIM_ID, true, JUSTIFICATION);
        }
    }

    function test_AttestInternal_RevokedVerifierCannotAttest() public {
        _anchor(CLAIM_ID);
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier1);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, verifier1));
        _attestInternal(CLAIM_ID, true);
    }

    function test_AttestInternal_VerifierOfRevokedOrganizationCannotAttest() public {
        _anchor(CLAIM_ID);
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, verifier1));
        _attestInternal(CLAIM_ID, true);
    }

    function test_AttestInternal_RevertsOnZeroJustification() public {
        _anchor(CLAIM_ID);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(verifier1);
        claims.attestInternal(CLAIM_ID, true, bytes32(0));
    }

    // -------------------------------------------------------------- assignAuditor

    function test_AssignAuditor_InEachAuditPhaseWithoutStatusChange() public {
        IClaimRegistry.ClaimStatus[3] memory phases = [
            IClaimRegistry.ClaimStatus.InternallyVerified,
            IClaimRegistry.ClaimStatus.ProofRequested,
            IClaimRegistry.ClaimStatus.ProofSubmitted
        ];
        for (uint256 i = 0; i < phases.length; i++) {
            bytes32 claimId = keccak256(abi.encode("assign", i));
            _driveTo(claimId, phases[i]);

            vm.recordLogs();
            _assign(claimId, disputant);

            Vm.Log[] memory logs = vm.getRecordedLogs();
            assertEq(logs.length, 1, "only AuditorAssigned, no StatusChanged");
            assertEq(logs[0].topics[0], IClaimRegistry.AuditorAssigned.selector);
            assertEq(logs[0].topics[1], claimId);
            assertEq(logs[0].topics[2], bytes32(uint256(uint160(disputant))), "new auditor");
            assertEq(logs[0].topics[3], bytes32(uint256(uint160(auditor))), "previous auditor");
            assertEq(claims.getClaim(claimId).auditor, disputant);
            assertEq(uint8(claims.statusOf(claimId)), uint8(phases[i]));
        }
    }

    function test_AssignAuditor_FirstAssignmentHasNoPreviousAuditor() public {
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.AuditorAssigned(CLAIM_ID, auditor, address(0));
        _assign(CLAIM_ID, auditor);
    }

    function test_AssignAuditor_OnlyAccreditationAuthority() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        address[5] memory callers = [registryAdmin, org, verifier1, auditor, outsider];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAccreditationAuthority.selector, callers[i]));
            vm.prank(callers[i]);
            claims.assignAuditor(CLAIM_ID, disputant);
        }
    }

    function test_AssignAuditor_OnlyActiveAuditors() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.prank(authority);
        participants.revokeAuditor(disputant);

        address[5] memory notAuditors = [address(0), outsider, verifier2, org, disputant];
        for (uint256 i = 0; i < notAuditors.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveAuditor.selector, notAuditors[i]));
            _assign(CLAIM_ID, notAuditors[i]);
        }
    }

    function test_AssignAuditor_ReassignmentLocksOutThePreviousAuditor() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.prank(authority);
        participants.revokeAuditor(auditor);
        _assign(CLAIM_ID, disputant);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, auditor));
        _attestFinal(CLAIM_ID, true);

        vm.prank(disputant);
        claims.attestFinal{value: AUDITOR_DEPOSIT}(CLAIM_ID, true, JUSTIFICATION);
        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(uint8(claim.status), uint8(IClaimRegistry.ClaimStatus.Verified));
        assertEq(claim.auditor, disputant);
    }

    /// @dev Revoking the organization does not block reassignment: the new auditor must still
    ///      be able to reject the claim.
    function test_AssignAuditor_StillWorksForRevokedOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();
        _assign(CLAIM_ID, disputant);
        assertEq(claims.getClaim(CLAIM_ID).auditor, disputant);
    }

    // --------------------------------------------------------------- requestProof

    function test_RequestProof_MovesToProofRequested() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ProofRequested(CLAIM_ID, auditor, REQUEST);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified, IClaimRegistry.ClaimStatus.ProofRequested
        );
        _requestProof(CLAIM_ID);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.ProofRequested));
    }

    function test_RequestProof_NeedsAnAssignedAuditor() public {
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, auditor));
        _requestProof(CLAIM_ID);
    }

    function test_RequestProof_OnlyTheAssignedAuditor() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        address[5] memory callers = [disputant, org, verifier1, authority, outsider];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, callers[i]));
            vm.prank(callers[i]);
            claims.requestProof(CLAIM_ID, REQUEST);
        }
    }

    function test_RequestProof_RevokedAssignedAuditorCannotAct() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.prank(authority);
        participants.revokeAuditor(auditor);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveAuditor.selector, auditor));
        _requestProof(CLAIM_ID);
    }

    function test_RequestProof_RevertsOnZeroRequestHash() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(auditor);
        claims.requestProof(CLAIM_ID, bytes32(0));
    }

    /// @dev The organization could never answer, so the auditor must reject instead.
    function test_RequestProof_RevokedOrganizationCannotBeAskedForProof() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        _requestProof(CLAIM_ID);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.InternallyVerified));
    }

    /// @dev Guard order: caller → organization active → non-zero inputs.
    function test_RequestProof_GuardOrderForRevokedOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, outsider));
        vm.prank(outsider);
        claims.requestProof(CLAIM_ID, bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        vm.prank(auditor);
        claims.requestProof(CLAIM_ID, bytes32(0));
    }

    // ---------------------------------------------------------------- submitProof

    function test_SubmitProof_AppendsRootAndMovesToProofSubmitted() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofRequested);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ProofSubmitted(CLAIM_ID, org, SUPPLEMENTARY_ROOT, 1);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.ProofRequested, IClaimRegistry.ClaimStatus.ProofSubmitted
        );
        _submitProof(CLAIM_ID);

        bytes32[] memory roots = claims.evidenceRoots(CLAIM_ID);
        assertEq(roots.length, 2);
        assertEq(roots[0], ROOT, "original root untouched");
        assertEq(roots[1], SUPPLEMENTARY_ROOT);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.ProofSubmitted));
    }

    function test_SubmitProof_OnlyTheClaimsOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofRequested);
        address[5] memory callers = [org2, verifier1, auditor, authority, outsider];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotClaimOrganization.selector, callers[i]));
            vm.prank(callers[i]);
            claims.submitProof(CLAIM_ID, SUPPLEMENTARY_ROOT);
        }
    }

    function test_SubmitProof_RevokedOrganizationCannotSubmit() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofRequested);
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        _submitProof(CLAIM_ID);
    }

    function test_SubmitProof_RevertsOnZeroRoot() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofRequested);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(org);
        claims.submitProof(CLAIM_ID, bytes32(0));
    }

    // --------------------------------------------------------------- confirmProof

    function test_ConfirmProof_AcceptReturnsToInternallyVerified() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ProofReviewed(CLAIM_ID, verifier2, true, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted, IClaimRegistry.ClaimStatus.InternallyVerified
        );
        _confirmProof(CLAIM_ID, true);

        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(uint8(claim.status), uint8(IClaimRegistry.ClaimStatus.InternallyVerified));
        assertEq(claim.internalVerifier, verifier1, "checkpoint-1 verifier is kept");
        assertEq(claim.auditor, auditor, "assignment survives the proof loop");
    }

    function test_ConfirmProof_ReturnGoesBackToProofRequested() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ProofReviewed(CLAIM_ID, verifier2, false, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted, IClaimRegistry.ClaimStatus.ProofRequested
        );
        _confirmProof(CLAIM_ID, false);

        // The organization answers again: the new root gets the next index.
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ProofSubmitted(CLAIM_ID, org, SUPPLEMENTARY_ROOT, 2);
        _submitProof(CLAIM_ID);
        assertEq(claims.evidenceRoots(CLAIM_ID).length, 3);
    }

    function test_ConfirmProof_CheckpointOneVerifierCannotConfirm() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.SameVerifierAsCheckpoint1.selector, verifier1));
        vm.prank(verifier1);
        claims.confirmProof(CLAIM_ID, true, JUSTIFICATION);
    }

    function test_ConfirmProof_OnlyVerifierOfTheClaimsOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        address[6] memory callers = [org, org2Verifier1, org2Verifier2, auditor, authority, outsider];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, callers[i]));
            vm.prank(callers[i]);
            claims.confirmProof(CLAIM_ID, true, JUSTIFICATION);
        }
    }

    function test_ConfirmProof_RevokedSecondVerifierCannotConfirm() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier2);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, verifier2));
        _confirmProof(CLAIM_ID, true);
    }

    function test_ConfirmProof_NewlyRegisteredVerifierCanConfirm() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        address verifier3 = makeAddr("verifier3");
        vm.prank(registryAdmin);
        participants.registerInternalVerifier(verifier3, org);

        vm.prank(verifier3);
        claims.confirmProof(CLAIM_ID, true, JUSTIFICATION);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.InternallyVerified));
    }

    function test_ConfirmProof_RevertsOnZeroJustification() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(verifier2);
        claims.confirmProof(CLAIM_ID, true, bytes32(0));
    }

    function test_ConfirmProof_VerifierOfRevokedOrganizationCannotConfirm() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, verifier2));
        _confirmProof(CLAIM_ID, true);
    }

    // ---------------------------------------------------------------- attestFinal

    function test_AttestFinal_ApproveMovesToVerified() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.FinalAttestation(CLAIM_ID, auditor, true, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified, IClaimRegistry.ClaimStatus.Verified
        );
        _attestFinal(CLAIM_ID, true);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Verified));
    }

    function test_AttestFinal_RejectMovesToRejected() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.FinalAttestation(CLAIM_ID, auditor, false, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified, IClaimRegistry.ClaimStatus.Rejected
        );
        _attestFinal(CLAIM_ID, false);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Rejected));
    }

    function test_AttestFinal_NeedsAnAssignedAuditor() public {
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, auditor));
        _attestFinal(CLAIM_ID, true);
    }

    function test_AttestFinal_OnlyTheAssignedAuditor() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        address[6] memory callers = [disputant, org, verifier1, verifier2, authority, outsider];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, callers[i]));
            vm.prank(callers[i]);
            claims.attestFinal{value: AUDITOR_DEPOSIT}(CLAIM_ID, true, JUSTIFICATION);
        }
    }

    function test_AttestFinal_RevokedAssignedAuditorCannotAct() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.prank(authority);
        participants.revokeAuditor(auditor);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveAuditor.selector, auditor));
        _attestFinal(CLAIM_ID, true);
    }

    function test_AttestFinal_RevertsOnZeroJustification() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(auditor);
        claims.attestFinal{value: AUDITOR_DEPOSIT}(CLAIM_ID, true, bytes32(0));
    }

    function test_AttestFinal_RevokedOrganizationCannotBeVerified() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        _attestFinal(CLAIM_ID, true);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.InternallyVerified));
    }

    function test_AttestFinal_RevokedOrganizationCanStillBeRejected() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();

        vm.expectEmit(address(claims));
        emit IClaimRegistry.FinalAttestation(CLAIM_ID, auditor, false, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified, IClaimRegistry.ClaimStatus.Rejected
        );
        _attestFinal(CLAIM_ID, false);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Rejected));
    }

    /// @dev Guard order: caller → organization active (approve only) → non-zero inputs.
    function test_AttestFinal_GuardOrderForRevokedOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAssignedAuditor.selector, outsider));
        vm.prank(outsider);
        claims.attestFinal{value: AUDITOR_DEPOSIT}(CLAIM_ID, true, bytes32(0));

        vm.startPrank(auditor);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        claims.attestFinal{value: AUDITOR_DEPOSIT}(CLAIM_ID, true, bytes32(0));
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        claims.attestFinal(CLAIM_ID, false, bytes32(0));
        vm.stopPrank();
    }

    /// @dev Only the claim's own organization matters: revoking another one changes nothing.
    function test_AttestFinal_OtherOrganizationRevokedDoesNotBlock() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.prank(registryAdmin);
        participants.revokeOrganization(org2);

        _attestFinal(CLAIM_ID, true);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Verified));
    }

    // ---------------------------------------------------------------- openDispute

    /// @dev Except the claim's own organization and approving auditor (see the incentives tests).
    function test_OpenDispute_AnyAccreditedParticipant() public {
        address[6] memory disputants = [verifier1, verifier2, disputant, org2, org2Verifier1, org2Verifier2];
        for (uint256 i = 0; i < disputants.length; i++) {
            bytes32 claimId = keccak256(abi.encode("dispute", i));
            _driveTo(claimId, IClaimRegistry.ClaimStatus.Verified);

            vm.expectEmit(address(claims));
            emit IClaimRegistry.DisputeOpened(claimId, disputants[i], COUNTER_EVIDENCE);
            vm.expectEmit(address(claims));
            emit IClaimRegistry.StatusChanged(
                claimId, IClaimRegistry.ClaimStatus.Verified, IClaimRegistry.ClaimStatus.Disputed
            );
            vm.prank(disputants[i]);
            claims.openDispute{value: DISPUTE_BOND}(claimId, COUNTER_EVIDENCE);
        }
    }

    function test_OpenDispute_NonAccreditedCannotDispute() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        address[3] memory callers = [outsider, registryAdmin, authority];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAccredited.selector, callers[i]));
            vm.prank(callers[i]);
            claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        }
    }

    function test_OpenDispute_RevokedParticipantCannotDispute() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.prank(authority);
        participants.revokeAuditor(disputant);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAccredited.selector, disputant));
        _openDispute(CLAIM_ID);
    }

    function test_OpenDispute_OnlyOneOpenDispute() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.expectRevert(
            abi.encodeWithSelector(IClaimRegistry.InvalidStatus.selector, CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed)
        );
        vm.prank(org2);
        claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
    }

    function test_OpenDispute_RevertsOnZeroCounterEvidence() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(disputant);
        claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, bytes32(0));
    }

    /// @dev A Verified claim whose organization is revoked can still be disputed (and then upheld).
    function test_OpenDispute_StillWorksForRevokedOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        _revokeOrg();

        _openDispute(CLAIM_ID);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Disputed));
    }

    // ------------------------------------------------------------- resolveDispute

    function test_ResolveDispute_UpheldMovesToRejected() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.DisputeResolved(CLAIM_ID, authority, true, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed, IClaimRegistry.ClaimStatus.Rejected
        );
        _resolveDispute(CLAIM_ID, true);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Rejected));
    }

    function test_ResolveDispute_DismissedReturnsToVerifiedAndCanBeDisputedAgain() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.DisputeResolved(CLAIM_ID, authority, false, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed, IClaimRegistry.ClaimStatus.Verified
        );
        _resolveDispute(CLAIM_ID, false);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Verified));

        vm.prank(org2);
        claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Disputed));
    }

    function test_ResolveDispute_OnlyAccreditationAuthority() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        address[5] memory callers = [registryAdmin, org, auditor, disputant, outsider];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAccreditationAuthority.selector, callers[i]));
            vm.prank(callers[i]);
            claims.resolveDispute(CLAIM_ID, true, JUSTIFICATION);
        }
    }

    function test_ResolveDispute_RevertsOnZeroJustification() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(authority);
        claims.resolveDispute(CLAIM_ID, true, bytes32(0));
    }

    function test_ResolveDispute_RevokedOrganizationCannotBeDismissed() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        _resolveDispute(CLAIM_ID, false);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Disputed));
    }

    function test_ResolveDispute_RevokedOrganizationCanStillBeUpheld() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        _revokeOrg();

        vm.expectEmit(address(claims));
        emit IClaimRegistry.DisputeResolved(CLAIM_ID, authority, true, JUSTIFICATION);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.StatusChanged(
            CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed, IClaimRegistry.ClaimStatus.Rejected
        );
        _resolveDispute(CLAIM_ID, true);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Rejected));
    }

    /// @dev Guard order: caller → organization active (dismiss only) → non-zero inputs.
    function test_ResolveDispute_GuardOrderForRevokedOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        _revokeOrg();

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotAccreditationAuthority.selector, outsider));
        vm.prank(outsider);
        claims.resolveDispute(CLAIM_ID, false, bytes32(0));

        vm.startPrank(authority);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        claims.resolveDispute(CLAIM_ID, false, bytes32(0));
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        claims.resolveDispute(CLAIM_ID, true, bytes32(0));
        vm.stopPrank();
    }

    // ----------------------------------------- separation of duties: role switching

    /// @dev Regression: a revoked checkpoint-1 verifier used to be accreditable as an auditor,
    ///      so one wallet could give both checkpoints of the same claim.
    function test_Regression_CheckpointVerifierCanNeverAuditTheSameClaim() public {
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier1);

        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, verifier1));
        vm.prank(authority);
        participants.accreditAuditor(verifier1);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveAuditor.selector, verifier1));
        _assign(CLAIM_ID, verifier1);
        assertEq(claims.getClaim(CLAIM_ID).auditor, address(0));
    }

    /// @dev Regression: a revoked organization used to be accreditable as its own claim's auditor.
    function test_Regression_OrganizationCanNeverAuditItsOwnClaim() public {
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);

        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, org));
        vm.prank(authority);
        participants.accreditAuditor(org);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveAuditor.selector, org));
        _assign(CLAIM_ID, org);
    }

    /// @dev The four-eyes proof verifier cannot become the claim's auditor either.
    function test_Regression_ProofVerifierCanNeverAuditTheSameClaim() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        _confirmProof(CLAIM_ID, true);
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier2);

        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, verifier2));
        vm.prank(authority);
        participants.accreditAuditor(verifier2);
    }

    /// @dev A revoked auditor cannot come back as a verifier of the organization it audited.
    function test_Regression_AuditorCanNeverBecomeTheOrganizationsVerifier() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.ProofSubmitted);
        vm.prank(authority);
        participants.revokeAuditor(auditor);

        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, auditor));
        vm.prank(registryAdmin);
        participants.registerInternalVerifier(auditor, org);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, auditor));
        vm.prank(auditor);
        claims.confirmProof(CLAIM_ID, true, JUSTIFICATION);
    }

    /// @dev Regression: the assigned auditor used to be able to verify a claim of an organization
    ///      the Registry Admin had already revoked (e.g. for fraud), because only the auditor was
    ///      checked. The claim can now only be rejected.
    function test_Regression_RevokedOrganizationCanNeverBeVerified() public {
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        _assign(CLAIM_ID, auditor);
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, org));
        _attestFinal(CLAIM_ID, true);

        _attestFinal(CLAIM_ID, false);
        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(uint8(claim.status), uint8(IClaimRegistry.ClaimStatus.Rejected));
        assertEq(claim.auditor, auditor);
    }

    // ------------------------------------------------ transition table, exhaustively

    /// @dev Each of the 10 (action, status) pairs of the transition table succeeds with its
    ///      designated caller and reaches the declared status.
    function test_EveryDeclaredTransitionSucceeds() public {
        uint256 checked;
        for (uint8 a = 0; a < ACTION_COUNT; a++) {
            for (uint8 s = 1; s <= LAST_STATUS; s++) {
                Action action = Action(a);
                IClaimRegistry.ClaimStatus status = IClaimRegistry.ClaimStatus(s);
                if (!_isValidStatus(action, status)) continue;

                bytes32 claimId = keccak256(abi.encode("valid", a, s));
                _driveTo(claimId, status);
                _act(action, claimId);
                assertEq(uint8(claims.statusOf(claimId)), uint8(_nextStatus(action, status)));
                checked++;
            }
        }
        assertEq(checked, 10, "transition table size");
    }

    /// @dev The other 46 (action, status) pairs revert with InvalidStatus, even for the
    ///      designated caller; Rejected is terminal for every action.
    function test_EveryOtherTransitionRevertsWithInvalidStatus() public {
        uint256 checked;
        for (uint8 a = 0; a < ACTION_COUNT; a++) {
            for (uint8 s = 1; s <= LAST_STATUS; s++) {
                Action action = Action(a);
                IClaimRegistry.ClaimStatus status = IClaimRegistry.ClaimStatus(s);
                if (_isValidStatus(action, status)) continue;

                bytes32 claimId = keccak256(abi.encode("invalid", a, s));
                _driveTo(claimId, status);
                vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.InvalidStatus.selector, claimId, status));
                _act(action, claimId);
                checked++;
            }
        }
        assertEq(checked, 46, "invalid pairs");
    }

    function test_EveryActionOnUnknownClaimRevertsWithClaimNotFound() public {
        for (uint8 a = 0; a < ACTION_COUNT; a++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.ClaimNotFound.selector, CLAIM_ID));
            _act(Action(a), CLAIM_ID);
        }
    }

    function test_UnknownClaimViews() public view {
        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.None));
        assertEq(claim.organization, address(0));
        assertEq(claim.anchoredAt, 0);
        assertEq(claims.evidenceRoots(CLAIM_ID).length, 0);
    }

    // ------------------------------------------------------------- whole stories

    /// @dev Walks all 12 declared transitions on one claim and checks the StatusChanged timeline.
    function test_FullLifecycle_StatusTimelineAndRoots() public {
        vm.recordLogs();
        _anchor(CLAIM_ID);
        _attestInternal(CLAIM_ID, true);
        _assign(CLAIM_ID, auditor);
        _requestProof(CLAIM_ID);
        _submitProof(CLAIM_ID);
        _confirmProof(CLAIM_ID, false);
        vm.prank(org);
        claims.submitProof(CLAIM_ID, keccak256("test:supplementary-root-2"));
        _confirmProof(CLAIM_ID, true);
        _attestFinal(CLAIM_ID, true);
        _openDispute(CLAIM_ID);
        _resolveDispute(CLAIM_ID, false);
        vm.prank(org2Verifier1);
        claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        _resolveDispute(CLAIM_ID, true);

        uint8[2][12] memory expected = [
            [0, 1], // None → Anchored
            [1, 2], // Anchored → InternallyVerified
            [2, 3], // InternallyVerified → ProofRequested
            [3, 4], // ProofRequested → ProofSubmitted
            [4, 3], // ProofSubmitted → ProofRequested (returned)
            [3, 4], // ProofRequested → ProofSubmitted
            [4, 2], // ProofSubmitted → InternallyVerified (accepted)
            [2, 5], // InternallyVerified → Verified
            [5, 7], // Verified → Disputed
            [7, 5], // Disputed → Verified (dismissed)
            [5, 7], // Verified → Disputed
            [7, 6] // Disputed → Rejected (upheld)
        ];
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 seen;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != IClaimRegistry.StatusChanged.selector) continue;
            assertEq(logs[i].topics[1], CLAIM_ID);
            (uint8 from, uint8 to) = abi.decode(logs[i].data, (uint8, uint8));
            assertEq(from, expected[seen][0], "from");
            assertEq(to, expected[seen][1], "to");
            seen++;
        }
        assertEq(seen, expected.length, "one StatusChanged per transition");

        bytes32[] memory roots = claims.evidenceRoots(CLAIM_ID);
        assertEq(roots.length, 3);
        assertEq(roots[0], ROOT);
        assertEq(roots[1], SUPPLEMENTARY_ROOT);
        assertEq(roots[2], keccak256("test:supplementary-root-2"));

        IClaimRegistry.Claim memory claim = claims.getClaim(CLAIM_ID);
        assertEq(claim.organization, org);
        assertEq(claim.internalVerifier, verifier1);
        assertEq(claim.auditor, auditor);
        assertEq(claim.metadataHash, METADATA);
    }

    function test_ClaimsAreIndependent() public {
        bytes32 other = keccak256("test:other-claim");
        _anchor(CLAIM_ID);
        vm.prank(org2);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(other, SUPPLEMENTARY_ROOT, METADATA);

        // org's verifier cannot attest org2's claim, and vice versa.
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotOrganizationVerifier.selector, verifier1));
        vm.prank(verifier1);
        claims.attestInternal(other, true, JUSTIFICATION);

        vm.prank(org2Verifier1);
        claims.attestInternal(other, false, JUSTIFICATION);
        assertEq(uint8(claims.statusOf(other)), uint8(IClaimRegistry.ClaimStatus.Rejected));
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Anchored));
    }

    // -------------------------------------------------------------------- fuzz

    function testFuzz_AnchorStoresArbitraryInputs(bytes32 claimId, bytes32 root, bytes32 metadata, uint64 timestamp)
        public
    {
        vm.assume(claimId != bytes32(0) && root != bytes32(0) && metadata != bytes32(0));
        vm.warp(timestamp);
        vm.prank(org2);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(claimId, root, metadata);

        IClaimRegistry.Claim memory claim = claims.getClaim(claimId);
        assertEq(claim.organization, org2);
        assertEq(claim.anchoredAt, timestamp);
        assertEq(claim.metadataHash, metadata);
        assertEq(claims.evidenceRoots(claimId)[0], root);
    }

    function testFuzz_UnknownClaimAlwaysReverts(bytes32 claimId, uint8 actionSeed) public {
        Action action = Action(bound(actionSeed, 0, ACTION_COUNT - 1));
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.ClaimNotFound.selector, claimId));
        _act(action, claimId);
    }

    /// @dev A wallet with no role can never act, whatever the action; it gets the action's
    ///      authorization error (the claim is in the status the action needs).
    function testFuzz_StrangerCannotAct(address stranger, uint8 actionSeed) public {
        vm.assume(!_isKnownActor(stranger) && stranger != address(vm));
        vm.deal(stranger, ACTOR_BALANCE);
        Action action = Action(bound(actionSeed, 0, ACTION_COUNT - 1));
        IClaimRegistry.ClaimStatus status = _firstValidStatus(action);
        _driveTo(CLAIM_ID, status);

        vm.expectRevert(abi.encodeWithSelector(_strangerError(action), stranger));
        _actAs(action, CLAIM_ID, stranger);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NotActiveOrganization.selector, stranger));
        vm.prank(stranger);
        claims.anchorClaim{value: ANCHOR_DEPOSIT}(keccak256("test:stranger-claim"), ROOT, METADATA);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(status));
    }

    /// @dev Property: an action by a known actor in a given status succeeds if and only if the
    ///      transition table allows the status and the actor is entitled to the action.
    function testFuzz_SucceedsOnlyForValidStatusAndEntitledCaller(uint8 actionSeed, uint8 statusSeed, uint8 actorSeed)
        public
    {
        Action action = Action(bound(actionSeed, 0, ACTION_COUNT - 1));
        IClaimRegistry.ClaimStatus status = IClaimRegistry.ClaimStatus(bound(statusSeed, 1, LAST_STATUS));
        address caller = _actors()[bound(actorSeed, 0, 10)];
        _driveTo(CLAIM_ID, status);

        bytes memory data = _calldata(action, CLAIM_ID);
        vm.prank(caller);
        (bool ok,) = address(claims).call{value: _valueFor(action)}(data);

        assertEq(ok, _isValidStatus(action, status) && _isEntitled(action, caller), "success iff allowed");
        IClaimRegistry.ClaimStatus expected = ok ? _nextStatus(action, status) : status;
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(expected));
    }

    function testFuzz_ProofLoopAppendsOneRootPerSubmission(uint8 rounds, uint256 returnMask) public {
        rounds = uint8(bound(rounds, 1, 12));
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _requestProof(CLAIM_ID);

        for (uint256 i = 0; i < rounds; i++) {
            bytes32 root = keccak256(abi.encode("round", i));
            vm.expectEmit(address(claims));
            emit IClaimRegistry.ProofSubmitted(CLAIM_ID, org, root, i + 1);
            vm.prank(org);
            claims.submitProof(CLAIM_ID, root);

            bool accept = ((returnMask >> i) & 1) == 0 || i == rounds - 1;
            _confirmProof(CLAIM_ID, accept);
            if (accept && i < rounds - 1) _requestProof(CLAIM_ID);
        }

        bytes32[] memory roots = claims.evidenceRoots(CLAIM_ID);
        assertEq(roots.length, uint256(rounds) + 1);
        assertEq(roots[0], ROOT);
        for (uint256 i = 0; i < rounds; i++) {
            assertEq(roots[i + 1], keccak256(abi.encode("round", i)));
        }
        _attestFinal(CLAIM_ID, true);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Verified));
    }

    /// @dev Exhaustive: once the claim's organization is revoked, no action by any known actor,
    ///      in any status, with either decision (approve / accept / upheld), moves the claim into
    ///      Verified; a call that reverts leaves the status unchanged.
    function test_RevokedOrganizationClaimNeverBecomesVerified_AllActionsActorsAndDecisions() public {
        address[11] memory actors = _actors();
        uint256 checked;
        for (uint8 s = 1; s <= LAST_STATUS; s++) {
            IClaimRegistry.ClaimStatus status = IClaimRegistry.ClaimStatus(s);
            bytes32 claimId = keccak256(abi.encode("revoked-org", s));
            uint256 fresh = vm.snapshotState();
            _driveTo(claimId, status);
            _revokeOrg();
            for (uint8 a = 0; a < ACTION_COUNT; a++) {
                for (uint256 i = 0; i < actors.length; i++) {
                    for (uint256 d = 0; d < 2; d++) {
                        uint256 snapshot = vm.snapshotState();
                        vm.prank(actors[i]);
                        (bool ok,) = address(claims).call{value: _decisionValue(Action(a), d == 1)}(
                            _decisionCalldata(Action(a), claimId, d == 1)
                        );
                        IClaimRegistry.ClaimStatus afterCall = claims.statusOf(claimId);
                        if (status != IClaimRegistry.ClaimStatus.Verified) {
                            assertTrue(afterCall != IClaimRegistry.ClaimStatus.Verified, "revoked org verified");
                        }
                        if (!ok) assertEq(uint8(afterCall), uint8(status), "revert changed status");
                        vm.revertToStateAndDelete(snapshot);
                        checked++;
                    }
                }
            }
            // Revocation is final, so each status starts again from the unrevoked fixture.
            vm.revertToStateAndDelete(fresh);
        }
        assertEq(checked, uint256(LAST_STATUS) * ACTION_COUNT * actors.length * 2);
    }

    // ----------------------------------------------------------------- helpers

    function _revokeOrg() internal {
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);
    }

    /// @dev `_calldata` with the action's boolean (approve / accept / upheld) set to `decision`.
    function _decisionCalldata(Action action, bytes32 claimId, bool decision)
        internal
        view
        returns (bytes memory data)
    {
        if (action == Action.AttestInternal) {
            data = abi.encodeCall(IClaimRegistry.attestInternal, (claimId, decision, JUSTIFICATION));
        } else if (action == Action.ConfirmProof) {
            data = abi.encodeCall(IClaimRegistry.confirmProof, (claimId, decision, JUSTIFICATION));
        } else if (action == Action.AttestFinal) {
            data = abi.encodeCall(IClaimRegistry.attestFinal, (claimId, decision, JUSTIFICATION));
        } else if (action == Action.ResolveDispute) {
            data = abi.encodeCall(IClaimRegistry.resolveDispute, (claimId, decision, JUSTIFICATION));
        } else {
            data = _calldata(action, claimId);
        }
    }

    /// @dev The exact deposit for `_decisionCalldata`: attestFinal takes one only when approving.
    function _decisionValue(Action action, bool decision) internal pure returns (uint256 value) {
        value = _valueFor(action);
        if (action == Action.AttestFinal && !decision) value = 0;
    }

    function _firstValidStatus(Action action) internal pure returns (IClaimRegistry.ClaimStatus status) {
        for (uint8 s = LAST_STATUS; s >= 1; s--) {
            if (_isValidStatus(action, IClaimRegistry.ClaimStatus(s))) status = IClaimRegistry.ClaimStatus(s);
        }
    }

    function _strangerError(Action action) internal pure returns (bytes4 selector) {
        if (action == Action.AttestInternal || action == Action.ConfirmProof) {
            selector = IClaimRegistry.NotOrganizationVerifier.selector;
        } else if (action == Action.AssignAuditor || action == Action.ResolveDispute) {
            selector = IClaimRegistry.NotAccreditationAuthority.selector;
        } else if (action == Action.RequestProof || action == Action.AttestFinal) {
            selector = IClaimRegistry.NotAssignedAuditor.selector;
        } else if (action == Action.SubmitProof) {
            selector = IClaimRegistry.NotClaimOrganization.selector;
        } else {
            selector = IClaimRegistry.NotAccredited.selector;
        }
    }

    /// @dev Who may perform `action` on a claim from `_driveTo` (org's claim, `verifier1` at
    ///      checkpoint 1, `auditor` assigned).
    function _isEntitled(Action action, address caller) internal view returns (bool entitled) {
        if (action == Action.AttestInternal) entitled = caller == verifier1 || caller == verifier2;
        else if (action == Action.AssignAuditor || action == Action.ResolveDispute) entitled = caller == authority;
        else if (action == Action.RequestProof || action == Action.AttestFinal) entitled = caller == auditor;
        else if (action == Action.SubmitProof) entitled = caller == org;
        else if (action == Action.ConfirmProof) entitled = caller == verifier2;
        else entitled = participants.isAccredited(caller) && caller != org && caller != auditor;
    }
}
