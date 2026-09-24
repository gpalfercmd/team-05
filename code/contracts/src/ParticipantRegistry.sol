// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Participant accreditation (organizations, verifiers, auditors)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    IParticipantRegistry,
    REGISTRY_ADMIN_ROLE,
    ACCREDITATION_AUTHORITY_ROLE,
    ORGANIZATION_ROLE,
    INTERNAL_VERIFIER_ROLE,
    AUDITOR_ROLE
} from "./interfaces/IParticipantRegistry.sol";

/// @title ParticipantRegistry
/// @notice Who may act in Proof of Aid. Two independent role admins:
///         - the Registry Admin registers organizations and links internal verifiers to them;
///         - the Accreditation Authority accredits auditors.
///         Each admin role administers only itself (so it can be handed over) and its own
///         participant roles, so neither admin can grant or revoke the other's roles.
///         Nobody holds `DEFAULT_ADMIN_ROLE`.
/// @dev    A wallet holds at most one of the five roles, and participant identity is permanent:
///         once a wallet has been an organization, internal verifier or auditor it can never be
///         registered again in any participant role nor receive an admin role, so revocation is
///         final and a replacement needs a new wallet. Without this, a revoked checkpoint-1
///         verifier (or organization) could be accredited as an auditor and give the final
///         approval on the same claim. Participant roles change only through the dedicated
///         functions below, which also keep the verifier → organization link and the
///         per-organization verifier count consistent and emit the interface events the indexer
///         builds the accreditation history from.
contract ParticipantRegistry is AccessControl, IParticipantRegistry {
    /// @dev Organization each registered internal verifier belongs to; cleared on revocation.
    mapping(address verifier => address organization) private _verifierOrganization;

    /// @dev Internal verifiers currently holding the role and linked to each organization.
    ///      Only reported while the organization is active (see `activeVerifierCount`).
    mapping(address organization => uint256 count) private _linkedVerifierCount;

    /// @dev Wallets that ever held a participant role; they can never take another role.
    mapping(address account => bool) private _wasParticipant;

    /// @param registryAdmin First holder of REGISTRY_ADMIN_ROLE.
    /// @param accreditationAuthority First holder of ACCREDITATION_AUTHORITY_ROLE; must differ
    ///        from `registryAdmin`, otherwise one party would register organizations and choose
    ///        their auditors.
    constructor(address registryAdmin, address accreditationAuthority) {
        if (registryAdmin == address(0) || accreditationAuthority == address(0)) revert ZeroAddress();
        if (registryAdmin == accreditationAuthority) revert AlreadyAccredited(accreditationAuthority);

        _setRoleAdmin(REGISTRY_ADMIN_ROLE, REGISTRY_ADMIN_ROLE);
        _setRoleAdmin(ACCREDITATION_AUTHORITY_ROLE, ACCREDITATION_AUTHORITY_ROLE);
        _setRoleAdmin(ORGANIZATION_ROLE, REGISTRY_ADMIN_ROLE);
        _setRoleAdmin(INTERNAL_VERIFIER_ROLE, REGISTRY_ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, ACCREDITATION_AUTHORITY_ROLE);
        _grantRole(REGISTRY_ADMIN_ROLE, registryAdmin);
        _grantRole(ACCREDITATION_AUTHORITY_ROLE, accreditationAuthority);
    }

    // ------------------------------------------------ Registry Admin actions

    /// @inheritdoc IParticipantRegistry
    function registerOrganization(address organization) external onlyRole(REGISTRY_ADMIN_ROLE) {
        _requireFreshWallet(organization);

        _wasParticipant[organization] = true;
        _grantRole(ORGANIZATION_ROLE, organization);
        emit OrganizationRegistered(organization, msg.sender);
    }

    /// @inheritdoc IParticipantRegistry
    /// @dev Permanent. Its verifiers keep their role and link but stop being active (see
    ///      `organizationOf`), so the organization's pending claims can no longer be attested.
    function revokeOrganization(address organization) external onlyRole(REGISTRY_ADMIN_ROLE) {
        if (!hasRole(ORGANIZATION_ROLE, organization)) revert NotActiveOrganization(organization);

        _revokeRole(ORGANIZATION_ROLE, organization);
        emit OrganizationRevoked(organization, msg.sender);
    }

    /// @inheritdoc IParticipantRegistry
    function registerInternalVerifier(address verifier, address organization) external onlyRole(REGISTRY_ADMIN_ROLE) {
        _requireFreshWallet(verifier);
        if (!hasRole(ORGANIZATION_ROLE, organization)) revert NotActiveOrganization(organization);

        _wasParticipant[verifier] = true;
        _verifierOrganization[verifier] = organization;
        _linkedVerifierCount[organization] += 1;
        _grantRole(INTERNAL_VERIFIER_ROLE, verifier);
        emit InternalVerifierRegistered(verifier, organization, msg.sender);
    }

    /// @inheritdoc IParticipantRegistry
    /// @dev Permanent. Works even if the verifier's organization was revoked, so the admin can
    ///      always close the record; the event still names the organization it belonged to.
    function revokeInternalVerifier(address verifier) external onlyRole(REGISTRY_ADMIN_ROLE) {
        if (!hasRole(INTERNAL_VERIFIER_ROLE, verifier)) revert NotActiveInternalVerifier(verifier);

        address organization = _verifierOrganization[verifier];
        delete _verifierOrganization[verifier];
        _linkedVerifierCount[organization] -= 1;
        _revokeRole(INTERNAL_VERIFIER_ROLE, verifier);
        emit InternalVerifierRevoked(verifier, organization, msg.sender);
    }

    // ----------------------------------------- Accreditation Authority actions

    /// @inheritdoc IParticipantRegistry
    function accreditAuditor(address auditor) external onlyRole(ACCREDITATION_AUTHORITY_ROLE) {
        _requireFreshWallet(auditor);

        _wasParticipant[auditor] = true;
        _grantRole(AUDITOR_ROLE, auditor);
        emit AuditorAccredited(auditor, msg.sender);
    }

    /// @inheritdoc IParticipantRegistry
    /// @dev Permanent: a revoked auditor can never be accredited again.
    function revokeAuditor(address auditor) external onlyRole(ACCREDITATION_AUTHORITY_ROLE) {
        if (!hasRole(AUDITOR_ROLE, auditor)) revert NotActiveAuditor(auditor);

        _revokeRole(AUDITOR_ROLE, auditor);
        emit AuditorRevoked(auditor, msg.sender);
    }

    // ------------------------------------------- generic AccessControl entry points

    /// @notice Only for the two admin roles (hand-over). Participant roles revert.
    /// @dev Keeps one role per wallet: an admin role cannot be given to a current or former
    ///      participant, nor to the other admin, which would merge the two separated duties.
    function grantRole(bytes32 role, address account) public override {
        _requireAdminRole(role);
        _checkRole(getRoleAdmin(role));
        if (account == address(0)) revert ZeroAddress();
        if (!hasRole(role, account) && _isTaken(account)) revert AlreadyAccredited(account);

        _grantRole(role, account);
    }

    /// @notice Only for the two admin roles. Participant roles revert.
    function revokeRole(bytes32 role, address account) public override {
        _requireAdminRole(role);

        super.revokeRole(role, account);
    }

    /// @notice Only for the two admin roles (completes a hand-over). Participant roles revert.
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        _requireAdminRole(role);

        super.renounceRole(role, callerConfirmation);
    }

    // ------------------------------------------------------------------ views

    /// @inheritdoc IParticipantRegistry
    function isOrganization(address account) public view returns (bool) {
        return hasRole(ORGANIZATION_ROLE, account);
    }

    /// @inheritdoc IParticipantRegistry
    /// @dev A verifier is active while it holds its role and its organization is active.
    function organizationOf(address verifier) public view returns (address organization) {
        address linked = _verifierOrganization[verifier];
        organization = isOrganization(linked) ? linked : address(0);
    }

    /// @inheritdoc IParticipantRegistry
    function activeVerifierCount(address organization) external view returns (uint256 count) {
        count = isOrganization(organization) ? _linkedVerifierCount[organization] : 0;
    }

    /// @inheritdoc IParticipantRegistry
    function isAuditor(address account) public view returns (bool) {
        return hasRole(AUDITOR_ROLE, account);
    }

    /// @inheritdoc IParticipantRegistry
    function isAccreditationAuthority(address account) external view returns (bool) {
        return hasRole(ACCREDITATION_AUTHORITY_ROLE, account);
    }

    /// @inheritdoc IParticipantRegistry
    function isRegistryAdmin(address account) external view returns (bool) {
        return hasRole(REGISTRY_ADMIN_ROLE, account);
    }

    /// @inheritdoc IParticipantRegistry
    function isAccredited(address account) external view returns (bool) {
        return isOrganization(account) || organizationOf(account) != address(0) || isAuditor(account);
    }

    // --------------------------------------------------------------- internals

    /// @dev New participants must be non-zero wallets that were never participants and hold no
    ///      admin role. `AlreadyAccredited` also covers revoked wallets: accreditation is permanent.
    function _requireFreshWallet(address account) private view {
        if (account == address(0)) revert ZeroAddress();
        if (_isTaken(account)) revert AlreadyAccredited(account);
    }

    /// @dev Participant roles must go through the dedicated functions, otherwise the verifier
    ///      link/count would drift and the interface events would be missing from the history.
    ///      `AccessControlBadConfirmation` ("the caller is not the expected one") is reused
    ///      because it carries no payload: `AccessControlUnauthorizedAccount(caller, role)` would
    ///      falsely claim that, e.g., the Registry Admin lacks a role it actually holds.
    function _requireAdminRole(bytes32 role) private pure {
        if (role == ORGANIZATION_ROLE || role == INTERNAL_VERIFIER_ROLE || role == AUDITOR_ROLE) {
            revert AccessControlBadConfirmation();
        }
    }

    /// @dev Current participants are a subset of `_wasParticipant`, so this covers all five roles.
    function _isTaken(address account) private view returns (bool) {
        return _wasParticipant[account] || hasRole(REGISTRY_ADMIN_ROLE, account)
            || hasRole(ACCREDITATION_AUTHORITY_ROLE, account);
    }
}
