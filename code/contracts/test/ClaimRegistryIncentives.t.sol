// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — ClaimRegistry incentives: deposits, rewards, penalties, payouts
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {IClaimRegistry} from "../src/interfaces/IClaimRegistry.sol";
import {ProofOfAidFixture} from "./helpers/ProofOfAidFixture.sol";

/// @notice An accredited auditor contract that opens a dispute and, when paid, tries to withdraw
///         again from its `receive` hook. The re-entry must fail; the error is recorded.
contract ReentrantReceiver {
    ClaimRegistry internal immutable claims;
    bytes public reentryError;
    uint256 public receivedTotal;
    uint256 public receiveCount;

    constructor(ClaimRegistry claims_) {
        claims = claims_;
    }

    function dispute(bytes32 claimId, bytes32 counterEvidenceHash) external payable {
        claims.openDispute{value: msg.value}(claimId, counterEvidenceHash);
    }

    function withdraw() external {
        claims.withdraw();
    }

    receive() external payable {
        receivedTotal += msg.value;
        receiveCount += 1;
        try claims.withdraw() {}
        catch (bytes memory reason) {
            reentryError = reason;
        }
    }
}

/// @notice An accredited auditor contract that cannot receive ETH, so its withdrawal fails.
contract RejectingReceiver {
    ClaimRegistry internal immutable claims;

    constructor(ClaimRegistry claims_) {
        claims = claims_;
    }

    function dispute(bytes32 claimId, bytes32 counterEvidenceHash) external payable {
        claims.openDispute{value: msg.value}(claimId, counterEvidenceHash);
    }

    function withdraw() external {
        claims.withdraw();
    }
}

contract ClaimRegistryIncentivesTest is ProofOfAidFixture {
    uint256 internal constant UPHELD_PAYOUT = DISPUTE_BOND + ORGANIZATION_PENALTY + AUDITOR_DEPOSIT + AUDITOR_REWARD;

    // ------------------------------------------------------------- constructor

    function test_Constructor_StoresParameters() public view {
        assertEq(claims.auditorReward(), AUDITOR_REWARD);
        assertEq(claims.auditorDeposit(), AUDITOR_DEPOSIT);
        assertEq(claims.organizationPenalty(), ORGANIZATION_PENALTY);
        assertEq(claims.disputeBond(), DISPUTE_BOND);
        assertEq(claims.disputeWindow(), DISPUTE_WINDOW);
        assertEq(claims.anchorDeposit(), ORGANIZATION_PENALTY + AUDITOR_REWARD);
    }

    function test_Constructor_RevertsOnEachZeroParameter() public {
        uint256[5] memory values = [AUDITOR_REWARD, AUDITOR_DEPOSIT, ORGANIZATION_PENALTY, DISPUTE_BOND, DISPUTE_WINDOW];
        for (uint256 i = 0; i < values.length; i++) {
            uint256[5] memory params = values;
            params[i] = 0;
            vm.expectRevert(IClaimRegistry.ZeroValue.selector);
            new ClaimRegistry(participants, params[0], params[1], params[2], params[3], params[4]);
        }
    }

    // ---------------------------------------------------------------- anchoring

    function test_Anchor_LocksTheOrganizationDeposit() public {
        vm.expectEmit(address(claims));
        emit IClaimRegistry.DepositLocked(CLAIM_ID, org, ANCHOR_DEPOSIT);
        _anchor(CLAIM_ID);

        assertEq(address(claims).balance, ANCHOR_DEPOSIT);
        assertEq(org.balance, ACTOR_BALANCE - ANCHOR_DEPOSIT);
        assertEq(claims.lockedOf(CLAIM_ID), ANCHOR_DEPOSIT);
        assertEq(claims.credits(org), 0);
    }

    function test_Anchor_RevertsOnWrongAmount() public {
        uint256[3] memory wrong = [uint256(0), ANCHOR_DEPOSIT - 1, ANCHOR_DEPOSIT + 1];
        for (uint256 i = 0; i < wrong.length; i++) {
            vm.expectRevert(
                abi.encodeWithSelector(IClaimRegistry.WrongDepositAmount.selector, ANCHOR_DEPOSIT, wrong[i])
            );
            vm.prank(org);
            claims.anchorClaim{value: wrong[i]}(CLAIM_ID, ROOT, METADATA);
        }
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.None));
    }

    /// @dev Guard order: inputs are checked before the amount.
    function test_Anchor_InputsAreCheckedBeforeTheAmount() public {
        vm.expectRevert(IClaimRegistry.ZeroValue.selector);
        vm.prank(org);
        claims.anchorClaim(CLAIM_ID, ROOT, bytes32(0));
    }

    // --------------------------------------------------------- non-payable paths

    /// @dev Every non-payable entry point rejects ETH, as does a plain transfer.
    function test_NonPayablePathsRejectValue() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        bytes[8] memory calls = [
            abi.encodeCall(IClaimRegistry.attestInternal, (CLAIM_ID, true, JUSTIFICATION)),
            abi.encodeCall(IClaimRegistry.assignAuditor, (CLAIM_ID, auditor)),
            abi.encodeCall(IClaimRegistry.requestProof, (CLAIM_ID, REQUEST)),
            abi.encodeCall(IClaimRegistry.submitProof, (CLAIM_ID, SUPPLEMENTARY_ROOT)),
            abi.encodeCall(IClaimRegistry.confirmProof, (CLAIM_ID, true, JUSTIFICATION)),
            abi.encodeCall(IClaimRegistry.resolveDispute, (CLAIM_ID, true, JUSTIFICATION)),
            abi.encodeCall(IClaimRegistry.settle, (CLAIM_ID)),
            abi.encodeCall(IClaimRegistry.withdraw, ())
        ];
        for (uint256 i = 0; i < calls.length; i++) {
            vm.deal(authority, 1 ether);
            vm.prank(authority);
            (bool ok,) = address(claims).call{value: 1}(calls[i]);
            assertFalse(ok, "non-payable call accepted value");
        }
        vm.prank(outsider);
        (bool sent,) = address(claims).call{value: 1}("");
        assertFalse(sent, "plain transfer accepted");
        assertEq(address(claims).balance, ANCHOR_DEPOSIT);
    }

    // ------------------------------------------------------------ final attestation

    function test_AttestFinal_ApproveLocksDepositAndStartsTheWindow() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.warp(1_800_000_000);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.DepositLocked(CLAIM_ID, auditor, AUDITOR_DEPOSIT);
        _attestFinal(CLAIM_ID, true);

        assertEq(claims.verifiedAt(CLAIM_ID), 1_800_000_000);
        assertEq(claims.disputeWindowClosesAt(CLAIM_ID), 1_800_000_000 + DISPUTE_WINDOW);
        assertEq(claims.lockedOf(CLAIM_ID), ANCHOR_DEPOSIT + AUDITOR_DEPOSIT);
        assertEq(address(claims).balance, ANCHOR_DEPOSIT + AUDITOR_DEPOSIT);
        assertFalse(claims.settled(CLAIM_ID));
    }

    function test_AttestFinal_ApproveRevertsOnWrongAmount() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        uint256[3] memory wrong = [uint256(0), AUDITOR_DEPOSIT - 1, AUDITOR_DEPOSIT + 1];
        for (uint256 i = 0; i < wrong.length; i++) {
            vm.expectRevert(
                abi.encodeWithSelector(IClaimRegistry.WrongDepositAmount.selector, AUDITOR_DEPOSIT, wrong[i])
            );
            vm.prank(auditor);
            claims.attestFinal{value: wrong[i]}(CLAIM_ID, true, JUSTIFICATION);
        }
    }

    function test_AttestFinal_RejectWithValueReverts() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.WrongDepositAmount.selector, 0, AUDITOR_DEPOSIT));
        vm.prank(auditor);
        claims.attestFinal{value: AUDITOR_DEPOSIT}(CLAIM_ID, false, JUSTIFICATION);
    }

    function test_UnverifiedClaimHasNoWindow() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        assertEq(claims.verifiedAt(CLAIM_ID), 0);
        assertEq(claims.disputeWindowClosesAt(CLAIM_ID), 0);
    }

    // ------------------------------------------------------------------- refunds

    function test_Reject_AtCheckpoint1RefundsTheOrganization() public {
        _anchor(CLAIM_ID);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, org, ANCHOR_DEPOSIT);
        _attestInternal(CLAIM_ID, false);

        assertEq(claims.credits(org), ANCHOR_DEPOSIT);
        assertEq(claims.lockedOf(CLAIM_ID), 0);
    }

    function test_Reject_ByTheAuditorRefundsTheOrganization() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, org, ANCHOR_DEPOSIT);
        _attestFinal(CLAIM_ID, false);

        assertEq(claims.credits(org), ANCHOR_DEPOSIT);
        assertEq(claims.credits(auditor), 0);
        assertEq(claims.lockedOf(CLAIM_ID), 0);
        assertEq(address(claims).balance, ANCHOR_DEPOSIT);
    }

    /// @dev Revocation does not confiscate: the organization still gets its deposit back.
    function test_Reject_OfARevokedOrganizationStillRefundsIt() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.InternallyVerified);
        _revokeOrg();
        _attestFinal(CLAIM_ID, false);
        assertEq(claims.credits(org), ANCHOR_DEPOSIT);
    }

    // ------------------------------------------------------------------ disputes

    function test_OpenDispute_LocksTheBond() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.DepositLocked(CLAIM_ID, disputant, DISPUTE_BOND);
        _openDispute(CLAIM_ID);
        assertEq(claims.lockedOf(CLAIM_ID), ANCHOR_DEPOSIT + AUDITOR_DEPOSIT + DISPUTE_BOND);
    }

    function test_OpenDispute_RevertsOnWrongAmount() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        uint256[3] memory wrong = [uint256(0), DISPUTE_BOND - 1, DISPUTE_BOND + 1];
        for (uint256 i = 0; i < wrong.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.WrongDepositAmount.selector, DISPUTE_BOND, wrong[i]));
            vm.prank(disputant);
            claims.openDispute{value: wrong[i]}(CLAIM_ID, COUNTER_EVIDENCE);
        }
    }

    function test_OpenDispute_OwnOrganizationAndApprovingAuditorCannotDispute() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        address[2] memory insiders = [org, auditor];
        for (uint256 i = 0; i < insiders.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.CannotDisputeOwnClaim.selector, insiders[i]));
            vm.prank(insiders[i]);
            claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        }
    }

    function test_OpenDispute_WindowBoundary() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        uint256 closesAt = claims.disputeWindowClosesAt(CLAIM_ID);
        uint256 snapshot = vm.snapshotState();

        // Last second inside the window.
        vm.warp(closesAt - 1);
        _openDispute(CLAIM_ID);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Disputed));
        vm.revertToState(snapshot);

        // Exactly at the close, and after it.
        uint256[2] memory late = [closesAt, closesAt + 1 days];
        for (uint256 i = 0; i < late.length; i++) {
            vm.warp(late[i]);
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.DisputeWindowClosed.selector, CLAIM_ID, closesAt));
            _openDispute(CLAIM_ID);
        }
    }

    function test_DismissedDispute_DoesNotResetTheWindow() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        uint64 verified = claims.verifiedAt(CLAIM_ID);
        uint256 closesAt = claims.disputeWindowClosesAt(CLAIM_ID);

        vm.warp(closesAt - 10 days);
        _openDispute(CLAIM_ID);
        vm.warp(closesAt - 1 days);
        _resolveDispute(CLAIM_ID, false);

        assertEq(claims.verifiedAt(CLAIM_ID), verified, "verifiedAt reset");
        assertEq(claims.disputeWindowClosesAt(CLAIM_ID), closesAt, "window extended");
        vm.warp(closesAt);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.DisputeWindowClosed.selector, CLAIM_ID, closesAt));
        vm.prank(org2);
        claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
    }

    function test_DismissedDispute_SplitsTheBond() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, org, DISPUTE_BOND / 2);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, auditor, DISPUTE_BOND / 2);
        _resolveDispute(CLAIM_ID, false);

        assertEq(claims.credits(org), DISPUTE_BOND / 2);
        assertEq(claims.credits(auditor), DISPUTE_BOND / 2);
        assertEq(claims.credits(disputant), 0);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Verified));
        assertEq(claims.lockedOf(CLAIM_ID), ANCHOR_DEPOSIT + AUDITOR_DEPOSIT);
    }

    /// @dev The rounding remainder of an odd bond goes to the organization.
    function test_DismissedDispute_OddBondRemainderGoesToTheOrganization() public {
        uint256 oddBond = DISPUTE_BOND + 1;
        claims = _newClaimRegistry(oddBond);
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.prank(disputant);
        claims.openDispute{value: oddBond}(CLAIM_ID, COUNTER_EVIDENCE);
        _resolveDispute(CLAIM_ID, false);

        assertEq(claims.credits(auditor), oddBond / 2);
        assertEq(claims.credits(org), oddBond / 2 + 1);
        assertEq(claims.credits(org) + claims.credits(auditor), oddBond);
    }

    function test_UpheldDispute_PaysTheDisputantEverything() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, disputant, UPHELD_PAYOUT);
        _resolveDispute(CLAIM_ID, true);

        assertEq(claims.credits(disputant), UPHELD_PAYOUT);
        assertEq(claims.credits(org), 0);
        assertEq(claims.credits(auditor), 0);
        assertEq(claims.lockedOf(CLAIM_ID), 0);
        assertEq(address(claims).balance, UPHELD_PAYOUT);
    }

    /// @dev After a dismissal, a second disputant's upheld dispute pays that second disputant.
    function test_UpheldDispute_PaysTheCurrentDisputant() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        _resolveDispute(CLAIM_ID, false);
        vm.prank(org2);
        claims.openDispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        _resolveDispute(CLAIM_ID, true);

        assertEq(claims.credits(org2), UPHELD_PAYOUT);
        assertEq(claims.credits(disputant), 0);
    }

    /// @dev A dispute opened inside the window can still be resolved after the window closed.
    function test_DisputeOpenedInTimeCanBeResolvedAfterTheWindow() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        uint256 closesAt = claims.disputeWindowClosesAt(CLAIM_ID);
        vm.warp(closesAt + 30 days);

        vm.expectRevert(
            abi.encodeWithSelector(IClaimRegistry.InvalidStatus.selector, CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed)
        );
        claims.settle(CLAIM_ID);

        _resolveDispute(CLAIM_ID, false);
        claims.settle(CLAIM_ID);
        assertTrue(claims.settled(CLAIM_ID));
    }

    // ------------------------------------------------------------------ settlement

    function test_Settle_PaysOrganizationAndAuditorAfterTheWindow() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));

        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, org, ORGANIZATION_PENALTY);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.Credited(CLAIM_ID, auditor, AUDITOR_DEPOSIT + AUDITOR_REWARD);
        vm.expectEmit(address(claims));
        emit IClaimRegistry.ClaimSettled(CLAIM_ID, outsider);
        vm.prank(outsider);
        claims.settle(CLAIM_ID);

        assertTrue(claims.settled(CLAIM_ID));
        assertEq(claims.credits(org), ORGANIZATION_PENALTY);
        assertEq(claims.credits(auditor), AUDITOR_DEPOSIT + AUDITOR_REWARD);
        assertEq(claims.lockedOf(CLAIM_ID), 0);
        assertEq(uint8(claims.statusOf(CLAIM_ID)), uint8(IClaimRegistry.ClaimStatus.Verified), "status unchanged");
    }

    function test_Settle_TooEarlyReverts() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        uint256 closesAt = claims.disputeWindowClosesAt(CLAIM_ID);
        vm.warp(closesAt - 1);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.DisputeWindowOpen.selector, CLAIM_ID, closesAt));
        claims.settle(CLAIM_ID);
    }

    function test_Settle_TwiceReverts() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));
        claims.settle(CLAIM_ID);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.AlreadySettled.selector, CLAIM_ID));
        claims.settle(CLAIM_ID);
    }

    function test_Settle_WithAnOpenDisputeReverts() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));
        vm.expectRevert(
            abi.encodeWithSelector(IClaimRegistry.InvalidStatus.selector, CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed)
        );
        claims.settle(CLAIM_ID);
    }

    function test_Settle_OnlyVerifiedClaims() public {
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.ClaimNotFound.selector, CLAIM_ID));
        claims.settle(CLAIM_ID);

        IClaimRegistry.ClaimStatus[5] memory notVerified = [
            IClaimRegistry.ClaimStatus.Anchored,
            IClaimRegistry.ClaimStatus.InternallyVerified,
            IClaimRegistry.ClaimStatus.ProofRequested,
            IClaimRegistry.ClaimStatus.ProofSubmitted,
            IClaimRegistry.ClaimStatus.Rejected
        ];
        for (uint256 i = 0; i < notVerified.length; i++) {
            bytes32 claimId = keccak256(abi.encode("settle", i));
            _driveTo(claimId, notVerified[i]);
            vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.InvalidStatus.selector, claimId, notVerified[i]));
            claims.settle(claimId);
        }
    }

    function test_Settle_UpheldClaimCannotBeSettled() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        _resolveDispute(CLAIM_ID, true);
        vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));
        vm.expectRevert(
            abi.encodeWithSelector(IClaimRegistry.InvalidStatus.selector, CLAIM_ID, IClaimRegistry.ClaimStatus.Rejected)
        );
        claims.settle(CLAIM_ID);
    }

    function test_Settle_SettledClaimCanNeverBeDisputed() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        uint256 closesAt = claims.disputeWindowClosesAt(CLAIM_ID);
        vm.warp(closesAt);
        claims.settle(CLAIM_ID);
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.DisputeWindowClosed.selector, CLAIM_ID, closesAt));
        _openDispute(CLAIM_ID);
    }

    // ------------------------------------------------------------------- withdraw

    function test_Withdraw_PaysAllCreditsOnce() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));
        claims.settle(CLAIM_ID);
        uint256 before = auditor.balance;

        vm.expectEmit(address(claims));
        emit IClaimRegistry.Withdrawn(auditor, AUDITOR_DEPOSIT + AUDITOR_REWARD);
        vm.prank(auditor);
        claims.withdraw();

        assertEq(auditor.balance, before + AUDITOR_DEPOSIT + AUDITOR_REWARD);
        assertEq(claims.credits(auditor), 0);
        assertEq(address(claims).balance, ORGANIZATION_PENALTY, "the organization's credit stays");

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NothingToWithdraw.selector, auditor));
        vm.prank(auditor);
        claims.withdraw();
    }

    function test_Withdraw_NothingToWithdraw() public {
        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.NothingToWithdraw.selector, outsider));
        vm.prank(outsider);
        claims.withdraw();
    }

    /// @dev The honest round trip: every wei deposited comes back to someone.
    function test_Withdraw_HonestLifecycleReturnsEveryWei() public {
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Disputed);
        _resolveDispute(CLAIM_ID, false);
        vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));
        claims.settle(CLAIM_ID);
        vm.prank(org);
        claims.withdraw();
        vm.prank(auditor);
        claims.withdraw();

        assertEq(address(claims).balance, 0);
        assertEq(org.balance, ACTOR_BALANCE - AUDITOR_REWARD + DISPUTE_BOND / 2, "organization paid the reward");
        assertEq(auditor.balance, ACTOR_BALANCE + AUDITOR_REWARD + DISPUTE_BOND / 2, "auditor earned it");
        assertEq(disputant.balance, ACTOR_BALANCE - DISPUTE_BOND, "disputant lost the bond");
    }

    function test_Withdraw_ReentrancyIsBlocked() public {
        ReentrantReceiver attacker = new ReentrantReceiver(claims);
        vm.prank(authority);
        participants.accreditAuditor(address(attacker));
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        attacker.dispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        _resolveDispute(CLAIM_ID, true);
        // A second credit, so a successful re-entry would have something to steal.
        vm.deal(address(claims), address(claims).balance + 1 ether);

        attacker.withdraw();

        assertEq(attacker.receivedTotal(), UPHELD_PAYOUT, "paid exactly once");
        assertEq(attacker.receiveCount(), 1);
        assertEq(attacker.reentryError(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(claims.credits(address(attacker)), 0);
        assertEq(address(claims).balance, 1 ether);
    }

    function test_Withdraw_FailedTransferRevertsAndKeepsTheCredit() public {
        RejectingReceiver receiver = new RejectingReceiver(claims);
        vm.prank(authority);
        participants.accreditAuditor(address(receiver));
        _driveTo(CLAIM_ID, IClaimRegistry.ClaimStatus.Verified);
        receiver.dispute{value: DISPUTE_BOND}(CLAIM_ID, COUNTER_EVIDENCE);
        _resolveDispute(CLAIM_ID, true);

        vm.expectRevert(abi.encodeWithSelector(IClaimRegistry.WithdrawFailed.selector, address(receiver)));
        receiver.withdraw();
        assertEq(claims.credits(address(receiver)), UPHELD_PAYOUT);
    }

    // --------------------------------------------------------------- lockedOf

    function test_LockedOf_FollowsTheStatus() public {
        assertEq(claims.lockedOf(CLAIM_ID), 0, "unknown claim");
        IClaimRegistry.ClaimStatus[3] memory pending = [
            IClaimRegistry.ClaimStatus.InternallyVerified,
            IClaimRegistry.ClaimStatus.ProofRequested,
            IClaimRegistry.ClaimStatus.ProofSubmitted
        ];
        for (uint256 i = 0; i < pending.length; i++) {
            bytes32 claimId = keccak256(abi.encode("locked", i));
            _driveTo(claimId, pending[i]);
            assertEq(claims.lockedOf(claimId), ANCHOR_DEPOSIT);
        }
    }

    /// @dev The registry's balance is always the credits owed plus the escrow still locked.
    function testFuzz_BalanceEqualsCreditsPlusLocked(uint8 statusSeed, bool upheld, bool settleIt) public {
        IClaimRegistry.ClaimStatus status = IClaimRegistry.ClaimStatus(bound(statusSeed, 1, LAST_STATUS));
        _driveTo(CLAIM_ID, status);
        if (status == IClaimRegistry.ClaimStatus.Disputed) _resolveDispute(CLAIM_ID, upheld);
        if (settleIt && claims.statusOf(CLAIM_ID) == IClaimRegistry.ClaimStatus.Verified) {
            vm.warp(claims.disputeWindowClosesAt(CLAIM_ID));
            claims.settle(CLAIM_ID);
        }
        uint256 owed = claims.credits(org) + claims.credits(auditor) + claims.credits(disputant);
        assertEq(address(claims).balance, owed + claims.lockedOf(CLAIM_ID));
    }

    // ----------------------------------------------------------------- helpers

    function _revokeOrg() internal {
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);
    }
}
