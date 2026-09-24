// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — ParticipantRegistry tests: role admins, accreditation, revocation
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";
import {
    IParticipantRegistry,
    REGISTRY_ADMIN_ROLE,
    ACCREDITATION_AUTHORITY_ROLE,
    ORGANIZATION_ROLE,
    INTERNAL_VERIFIER_ROLE,
    AUDITOR_ROLE
} from "../src/interfaces/IParticipantRegistry.sol";
import {ProofOfAidFixture} from "./helpers/ProofOfAidFixture.sol";

contract ParticipantRegistryTest is ProofOfAidFixture {
    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;

    address internal newcomer = makeAddr("newcomer");

    // ------------------------------------------------------------- constructor

    function test_Constructor_GrantsOnlyTheTwoAdminRoles() public view {
        assertTrue(participants.isRegistryAdmin(registryAdmin));
        assertTrue(participants.isAccreditationAuthority(authority));
        assertFalse(participants.isRegistryAdmin(authority));
        assertFalse(participants.isAccreditationAuthority(registryAdmin));
        assertFalse(participants.hasRole(DEFAULT_ADMIN_ROLE, registryAdmin));
        assertFalse(participants.hasRole(DEFAULT_ADMIN_ROLE, authority));
        assertFalse(participants.hasRole(DEFAULT_ADMIN_ROLE, address(this)));
    }

    function test_Constructor_SetsSeparateRoleAdmins() public view {
        assertEq(participants.getRoleAdmin(REGISTRY_ADMIN_ROLE), REGISTRY_ADMIN_ROLE);
        assertEq(participants.getRoleAdmin(ACCREDITATION_AUTHORITY_ROLE), ACCREDITATION_AUTHORITY_ROLE);
        assertEq(participants.getRoleAdmin(ORGANIZATION_ROLE), REGISTRY_ADMIN_ROLE);
        assertEq(participants.getRoleAdmin(INTERNAL_VERIFIER_ROLE), REGISTRY_ADMIN_ROLE);
        assertEq(participants.getRoleAdmin(AUDITOR_ROLE), ACCREDITATION_AUTHORITY_ROLE);
    }

    function test_Constructor_RevertsOnZeroAddresses() public {
        vm.expectRevert(IParticipantRegistry.ZeroAddress.selector);
        new ParticipantRegistry(address(0), authority);

        vm.expectRevert(IParticipantRegistry.ZeroAddress.selector);
        new ParticipantRegistry(registryAdmin, address(0));
    }

    function test_Constructor_RevertsWhenBothAdminsAreTheSameWallet() public {
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, registryAdmin));
        new ParticipantRegistry(registryAdmin, registryAdmin);
    }

    // ------------------------------------------------------------- organizations

    function test_RegisterOrganization_GrantsRoleAndEmits() public {
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.OrganizationRegistered(newcomer, registryAdmin);
        vm.prank(registryAdmin);
        participants.registerOrganization(newcomer);

        assertTrue(participants.isOrganization(newcomer));
        assertTrue(participants.hasRole(ORGANIZATION_ROLE, newcomer));
        assertTrue(participants.isAccredited(newcomer));
        assertEq(participants.activeVerifierCount(newcomer), 0);
    }

    function test_RegisterOrganization_OnlyRegistryAdmin() public {
        _expectUnauthorized(authority, REGISTRY_ADMIN_ROLE);
        vm.prank(authority);
        participants.registerOrganization(newcomer);

        _expectUnauthorized(org, REGISTRY_ADMIN_ROLE);
        vm.prank(org);
        participants.registerOrganization(newcomer);
    }

    function test_RegisterOrganization_RevertsOnZeroAddress() public {
        vm.expectRevert(IParticipantRegistry.ZeroAddress.selector);
        vm.prank(registryAdmin);
        participants.registerOrganization(address(0));
    }

    function test_RegisterOrganization_OneRolePerWallet() public {
        address[6] memory taken = [org, verifier1, auditor, registryAdmin, authority, org2Verifier2];
        for (uint256 i = 0; i < taken.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, taken[i]));
            vm.prank(registryAdmin);
            participants.registerOrganization(taken[i]);
        }
    }

    function test_RevokeOrganization_DeactivatesItAndItsVerifiers() public {
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.OrganizationRevoked(org, registryAdmin);
        vm.prank(registryAdmin);
        participants.revokeOrganization(org);

        assertFalse(participants.isOrganization(org));
        assertFalse(participants.isAccredited(org));
        assertEq(participants.activeVerifierCount(org), 0);
        assertEq(participants.organizationOf(verifier1), address(0));
        assertFalse(participants.isAccredited(verifier1));
        // The verifier keeps its (now inactive) role and link until the admin revokes it.
        assertTrue(participants.hasRole(INTERNAL_VERIFIER_ROLE, verifier1));
        // Other organizations are unaffected.
        assertEq(participants.activeVerifierCount(org2), 2);
    }

    function test_RevokeOrganization_RevertsIfNotActive() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveOrganization.selector, outsider));
        participants.revokeOrganization(outsider);

        participants.revokeOrganization(org);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveOrganization.selector, org));
        participants.revokeOrganization(org);
        vm.stopPrank();
    }

    function test_RevokeOrganization_OnlyRegistryAdmin() public {
        _expectUnauthorized(authority, REGISTRY_ADMIN_ROLE);
        vm.prank(authority);
        participants.revokeOrganization(org);
    }

    // -------------------------------------------------------- internal verifiers

    function test_RegisterInternalVerifier_LinksCountsAndEmits() public {
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.InternalVerifierRegistered(newcomer, org, registryAdmin);
        vm.prank(registryAdmin);
        participants.registerInternalVerifier(newcomer, org);

        assertEq(participants.organizationOf(newcomer), org);
        assertEq(participants.activeVerifierCount(org), 3);
        assertTrue(participants.hasRole(INTERNAL_VERIFIER_ROLE, newcomer));
        assertTrue(participants.isAccredited(newcomer));
    }

    function test_RegisterInternalVerifier_RequiresActiveOrganization() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveOrganization.selector, outsider));
        participants.registerInternalVerifier(newcomer, outsider);

        // An auditor is not an organization either.
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveOrganization.selector, auditor));
        participants.registerInternalVerifier(newcomer, auditor);

        participants.revokeOrganization(org);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveOrganization.selector, org));
        participants.registerInternalVerifier(newcomer, org);
        vm.stopPrank();
    }

    function test_RegisterInternalVerifier_RevertsOnZeroAddresses() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(IParticipantRegistry.ZeroAddress.selector);
        participants.registerInternalVerifier(address(0), org);

        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveOrganization.selector, address(0)));
        participants.registerInternalVerifier(newcomer, address(0));
        vm.stopPrank();
    }

    function test_RegisterInternalVerifier_OneRolePerWallet() public {
        address[6] memory taken = [org, verifier1, org2Verifier1, auditor, registryAdmin, authority];
        vm.startPrank(registryAdmin);
        for (uint256 i = 0; i < taken.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, taken[i]));
            participants.registerInternalVerifier(taken[i], org);
        }
        vm.stopPrank();
    }

    function test_RegisterInternalVerifier_OnlyRegistryAdmin() public {
        _expectUnauthorized(authority, REGISTRY_ADMIN_ROLE);
        vm.prank(authority);
        participants.registerInternalVerifier(newcomer, org);

        // An organization cannot add verifiers to itself.
        _expectUnauthorized(org, REGISTRY_ADMIN_ROLE);
        vm.prank(org);
        participants.registerInternalVerifier(newcomer, org);
    }

    function test_RevokeInternalVerifier_UnlinksDecrementsAndEmits() public {
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.InternalVerifierRevoked(verifier1, org, registryAdmin);
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier1);

        assertEq(participants.organizationOf(verifier1), address(0));
        assertEq(participants.activeVerifierCount(org), 1);
        assertFalse(participants.hasRole(INTERNAL_VERIFIER_ROLE, verifier1));
        assertFalse(participants.isAccredited(verifier1));
    }

    function test_RevokeInternalVerifier_RevertsIfNotActive() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveInternalVerifier.selector, auditor));
        participants.revokeInternalVerifier(auditor);

        participants.revokeInternalVerifier(verifier1);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveInternalVerifier.selector, verifier1));
        participants.revokeInternalVerifier(verifier1);
        vm.stopPrank();
    }

    function test_RevokeInternalVerifier_WorksWhileItsOrganizationIsRevoked() public {
        vm.startPrank(registryAdmin);
        participants.revokeOrganization(org);
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.InternalVerifierRevoked(verifier1, org, registryAdmin);
        participants.revokeInternalVerifier(verifier1);
        vm.stopPrank();

        assertFalse(participants.hasRole(INTERNAL_VERIFIER_ROLE, verifier1));
        assertEq(participants.activeVerifierCount(org), 0, "a revoked organization has no active verifiers");
    }

    function test_RevokeInternalVerifier_OnlyRegistryAdmin() public {
        _expectUnauthorized(authority, REGISTRY_ADMIN_ROLE);
        vm.prank(authority);
        participants.revokeInternalVerifier(verifier1);
    }

    // ------------------------------------------ permanent participant identity

    function test_RevokedVerifierCanNeverBeRegisteredAgain() public {
        vm.startPrank(registryAdmin);
        participants.revokeInternalVerifier(verifier1);

        _expectAlreadyAccredited(verifier1);
        participants.registerInternalVerifier(verifier1, org);
        _expectAlreadyAccredited(verifier1);
        participants.registerInternalVerifier(verifier1, org2);
        _expectAlreadyAccredited(verifier1);
        participants.registerOrganization(verifier1);
        vm.stopPrank();

        _expectAlreadyAccredited(verifier1);
        vm.prank(authority);
        participants.accreditAuditor(verifier1);

        assertEq(participants.activeVerifierCount(org), 1, "a replacement needs a new wallet");
    }

    function test_RevokedOrganizationCanNeverComeBack() public {
        vm.startPrank(registryAdmin);
        participants.revokeOrganization(org);

        _expectAlreadyAccredited(org);
        participants.registerOrganization(org);
        _expectAlreadyAccredited(org);
        participants.registerInternalVerifier(org, org2);
        vm.stopPrank();

        _expectAlreadyAccredited(org);
        vm.prank(authority);
        participants.accreditAuditor(org);

        assertEq(participants.organizationOf(verifier1), address(0), "its verifiers stay inactive");
    }

    // ------------------------------------------------------------------ auditors

    function test_AccreditAuditor_GrantsRoleAndEmits() public {
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.AuditorAccredited(newcomer, authority);
        vm.prank(authority);
        participants.accreditAuditor(newcomer);

        assertTrue(participants.isAuditor(newcomer));
        assertTrue(participants.isAccredited(newcomer));
    }

    function test_AccreditAuditor_OnlyAccreditationAuthority() public {
        // Spec F1: the Registry Admin cannot approve auditors.
        _expectUnauthorized(registryAdmin, ACCREDITATION_AUTHORITY_ROLE);
        vm.prank(registryAdmin);
        participants.accreditAuditor(newcomer);

        _expectUnauthorized(auditor, ACCREDITATION_AUTHORITY_ROLE);
        vm.prank(auditor);
        participants.accreditAuditor(newcomer);
    }

    function test_AccreditAuditor_RevertsOnZeroAndTakenWallets() public {
        vm.startPrank(authority);
        vm.expectRevert(IParticipantRegistry.ZeroAddress.selector);
        participants.accreditAuditor(address(0));

        // An organization's verifier can never also be an auditor.
        address[5] memory taken = [verifier1, org, disputant, registryAdmin, authority];
        for (uint256 i = 0; i < taken.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, taken[i]));
            participants.accreditAuditor(taken[i]);
        }
        vm.stopPrank();
    }

    function test_RevokeAuditor_RemovesRoleAndEmits() public {
        vm.expectEmit(address(participants));
        emit IParticipantRegistry.AuditorRevoked(auditor, authority);
        vm.prank(authority);
        participants.revokeAuditor(auditor);

        assertFalse(participants.isAuditor(auditor));
        assertFalse(participants.isAccredited(auditor));
    }

    function test_RevokeAuditor_RevertsIfNotActive() public {
        vm.startPrank(authority);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveAuditor.selector, verifier1));
        participants.revokeAuditor(verifier1);

        participants.revokeAuditor(auditor);
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.NotActiveAuditor.selector, auditor));
        participants.revokeAuditor(auditor);
        vm.stopPrank();
    }

    function test_RevokeAuditor_OnlyAccreditationAuthority() public {
        _expectUnauthorized(registryAdmin, ACCREDITATION_AUTHORITY_ROLE);
        vm.prank(registryAdmin);
        participants.revokeAuditor(auditor);
    }

    function test_RevokedAuditorCanNeverBeAccreditedAgain() public {
        vm.prank(authority);
        participants.revokeAuditor(auditor);

        _expectAlreadyAccredited(auditor);
        vm.prank(authority);
        participants.accreditAuditor(auditor);

        vm.startPrank(registryAdmin);
        _expectAlreadyAccredited(auditor);
        participants.registerInternalVerifier(auditor, org);
        _expectAlreadyAccredited(auditor);
        participants.registerOrganization(auditor);
        vm.stopPrank();

        assertFalse(participants.isAuditor(auditor));
    }

    function test_FormerParticipantsCanNeverBecomeAdmins() public {
        vm.prank(registryAdmin);
        participants.revokeInternalVerifier(verifier1);
        vm.prank(authority);
        participants.revokeAuditor(auditor);

        _expectAlreadyAccredited(verifier1);
        vm.prank(registryAdmin);
        participants.grantRole(REGISTRY_ADMIN_ROLE, verifier1);

        _expectAlreadyAccredited(auditor);
        vm.prank(authority);
        participants.grantRole(ACCREDITATION_AUTHORITY_ROLE, auditor);
    }

    // ------------------------------------------- generic AccessControl entry points

    function test_GrantRole_BlockedForParticipantRoles() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        participants.grantRole(ORGANIZATION_ROLE, newcomer);
        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        participants.grantRole(INTERNAL_VERIFIER_ROLE, newcomer);
        vm.stopPrank();

        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        vm.prank(authority);
        participants.grantRole(AUDITOR_ROLE, newcomer);
    }

    function test_RevokeRole_BlockedForParticipantRoles() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        participants.revokeRole(ORGANIZATION_ROLE, org);
        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        participants.revokeRole(INTERNAL_VERIFIER_ROLE, verifier1);
        vm.stopPrank();

        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        vm.prank(authority);
        participants.revokeRole(AUDITOR_ROLE, auditor);

        assertEq(participants.activeVerifierCount(org), 2, "count untouched");
    }

    function test_RenounceRole_BlockedForParticipantRoles() public {
        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        vm.prank(org);
        participants.renounceRole(ORGANIZATION_ROLE, org);

        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        vm.prank(verifier1);
        participants.renounceRole(INTERNAL_VERIFIER_ROLE, verifier1);

        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        vm.prank(auditor);
        participants.renounceRole(AUDITOR_ROLE, auditor);

        assertEq(participants.organizationOf(verifier1), org);
        assertTrue(participants.isAuditor(auditor));
    }

    function test_AdminHandover_RegistryAdmin() public {
        vm.startPrank(registryAdmin);
        participants.grantRole(REGISTRY_ADMIN_ROLE, newcomer);
        participants.renounceRole(REGISTRY_ADMIN_ROLE, registryAdmin);
        vm.stopPrank();

        assertTrue(participants.isRegistryAdmin(newcomer));
        assertFalse(participants.isRegistryAdmin(registryAdmin));

        vm.prank(newcomer);
        participants.registerOrganization(outsider);
        assertTrue(participants.isOrganization(outsider));

        _expectUnauthorized(registryAdmin, REGISTRY_ADMIN_ROLE);
        vm.prank(registryAdmin);
        participants.registerOrganization(makeAddr("late"));
    }

    function test_AdminHandover_AccreditationAuthority() public {
        vm.startPrank(authority);
        participants.grantRole(ACCREDITATION_AUTHORITY_ROLE, newcomer);
        participants.revokeRole(ACCREDITATION_AUTHORITY_ROLE, authority);
        vm.stopPrank();

        assertTrue(participants.isAccreditationAuthority(newcomer));
        assertFalse(participants.isAccreditationAuthority(authority));

        vm.prank(newcomer);
        participants.accreditAuditor(outsider);
        assertTrue(participants.isAuditor(outsider));
    }

    function test_AdminRoles_CannotTouchEachOther() public {
        _expectUnauthorized(registryAdmin, ACCREDITATION_AUTHORITY_ROLE);
        vm.prank(registryAdmin);
        participants.grantRole(ACCREDITATION_AUTHORITY_ROLE, newcomer);

        _expectUnauthorized(registryAdmin, ACCREDITATION_AUTHORITY_ROLE);
        vm.prank(registryAdmin);
        participants.revokeRole(ACCREDITATION_AUTHORITY_ROLE, authority);

        _expectUnauthorized(authority, REGISTRY_ADMIN_ROLE);
        vm.prank(authority);
        participants.grantRole(REGISTRY_ADMIN_ROLE, newcomer);

        _expectUnauthorized(authority, REGISTRY_ADMIN_ROLE);
        vm.prank(authority);
        participants.revokeRole(REGISTRY_ADMIN_ROLE, registryAdmin);
    }

    function test_AdminRoles_NobodyCanGrantDefaultAdmin() public {
        _expectUnauthorized(registryAdmin, DEFAULT_ADMIN_ROLE);
        vm.prank(registryAdmin);
        participants.grantRole(DEFAULT_ADMIN_ROLE, registryAdmin);

        _expectUnauthorized(authority, DEFAULT_ADMIN_ROLE);
        vm.prank(authority);
        participants.grantRole(DEFAULT_ADMIN_ROLE, authority);
    }

    function test_AdminRoles_KeepOneRolePerWallet() public {
        vm.startPrank(registryAdmin);
        vm.expectRevert(IParticipantRegistry.ZeroAddress.selector);
        participants.grantRole(REGISTRY_ADMIN_ROLE, address(0));

        // Neither a participant nor the other admin can become Registry Admin.
        address[3] memory taken = [org, auditor, authority];
        for (uint256 i = 0; i < taken.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, taken[i]));
            participants.grantRole(REGISTRY_ADMIN_ROLE, taken[i]);
        }

        // Re-granting to the current holder is a no-op, as in OpenZeppelin.
        participants.grantRole(REGISTRY_ADMIN_ROLE, registryAdmin);
        vm.stopPrank();
        assertTrue(participants.isRegistryAdmin(registryAdmin));
    }

    function test_AdminRoles_RenounceNeedsConfirmation() public {
        vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
        vm.prank(registryAdmin);
        participants.renounceRole(REGISTRY_ADMIN_ROLE, authority);
    }

    // ------------------------------------------------------------------- views

    function test_IsAccredited_OnlyActiveParticipants() public view {
        address[7] memory accredited = [org, verifier1, verifier2, auditor, disputant, org2, org2Verifier1];
        for (uint256 i = 0; i < accredited.length; i++) {
            assertTrue(participants.isAccredited(accredited[i]));
        }
        assertFalse(participants.isAccredited(registryAdmin));
        assertFalse(participants.isAccredited(authority));
        assertFalse(participants.isAccredited(outsider));
        assertFalse(participants.isAccredited(address(0)));
    }

    function test_Views_ReportEachRoleOnly() public view {
        assertTrue(participants.isOrganization(org));
        assertFalse(participants.isOrganization(verifier1));
        assertFalse(participants.isAuditor(org));
        assertEq(participants.organizationOf(org), address(0), "an organization is not its own verifier");
        assertEq(participants.organizationOf(auditor), address(0));
        assertEq(participants.organizationOf(org2Verifier1), org2);
        assertEq(participants.activeVerifierCount(outsider), 0);
        assertFalse(participants.isRegistryAdmin(org));
        assertFalse(participants.isAccreditationAuthority(auditor));
    }

    // -------------------------------------------------------------------- fuzz

    function testFuzz_OnlyRegistryAdminRegisters(address caller, address account) public {
        vm.assume(caller != registryAdmin);
        _expectUnauthorized(caller, REGISTRY_ADMIN_ROLE);
        vm.prank(caller);
        participants.registerOrganization(account);
    }

    function testFuzz_OnlyAuthorityAccredits(address caller, address account) public {
        vm.assume(caller != authority);
        _expectUnauthorized(caller, ACCREDITATION_AUTHORITY_ROLE);
        vm.prank(caller);
        participants.accreditAuditor(account);
    }

    function testFuzz_VerifierCountTracksRegistrations(uint8 registered, uint8 revoked) public {
        registered = uint8(bound(registered, 0, 20));
        revoked = uint8(bound(revoked, 0, registered));

        vm.startPrank(registryAdmin);
        participants.registerOrganization(newcomer);
        for (uint256 i = 0; i < registered; i++) {
            participants.registerInternalVerifier(_numbered(i), newcomer);
        }
        for (uint256 i = 0; i < revoked; i++) {
            participants.revokeInternalVerifier(_numbered(i));
        }
        vm.stopPrank();

        assertEq(participants.activeVerifierCount(newcomer), uint256(registered) - revoked);
        if (registered > revoked) assertEq(participants.organizationOf(_numbered(revoked)), newcomer);
        if (revoked > 0) assertEq(participants.organizationOf(_numbered(0)), address(0));
    }

    /// @dev Whatever role a wallet had and however it left it, it can never take any role again.
    function testFuzz_RevokedParticipantCanNeverTakeAnyRole(uint8 firstRole, uint8 nextRole) public {
        firstRole = uint8(bound(firstRole, 0, 2));
        nextRole = uint8(bound(nextRole, 0, 4));

        _registerAs(newcomer, firstRole);
        _revokeAs(newcomer, firstRole);

        _expectAlreadyAccredited(newcomer);
        _registerAs(newcomer, nextRole);
        assertFalse(participants.isAccredited(newcomer));
    }

    // ----------------------------------------------------------------- helpers

    function _expectAlreadyAccredited(address account) internal {
        vm.expectRevert(abi.encodeWithSelector(IParticipantRegistry.AlreadyAccredited.selector, account));
    }

    /// @dev 0 organization, 1 internal verifier of `org`, 2 auditor, 3 Registry Admin, 4 Authority.
    function _registerAs(address account, uint8 role) internal {
        address admin = role == 2 || role == 4 ? authority : registryAdmin;
        vm.prank(admin);
        if (role == 0) participants.registerOrganization(account);
        else if (role == 1) participants.registerInternalVerifier(account, org);
        else if (role == 2) participants.accreditAuditor(account);
        else if (role == 3) participants.grantRole(REGISTRY_ADMIN_ROLE, account);
        else participants.grantRole(ACCREDITATION_AUTHORITY_ROLE, account);
    }

    function _revokeAs(address account, uint8 role) internal {
        vm.prank(role == 2 ? authority : registryAdmin);
        if (role == 0) participants.revokeOrganization(account);
        else if (role == 1) participants.revokeInternalVerifier(account);
        else participants.revokeAuditor(account);
    }

    function _expectUnauthorized(address account, bytes32 neededRole) internal {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, neededRole)
        );
    }

    function _numbered(uint256 i) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("fuzz-verifier", i)))));
    }
}
