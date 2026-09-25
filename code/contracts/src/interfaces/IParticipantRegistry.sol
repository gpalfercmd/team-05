// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Participant accreditation interface (frozen in P1)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity ^0.8.24;

/// @dev Role ids, shared by the implementation and offchain clients (`hasRole` checks).
bytes32 constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");
bytes32 constant ACCREDITATION_AUTHORITY_ROLE = keccak256("ACCREDITATION_AUTHORITY_ROLE");
bytes32 constant ORGANIZATION_ROLE = keccak256("ORGANIZATION_ROLE");
bytes32 constant INTERNAL_VERIFIER_ROLE = keccak256("INTERNAL_VERIFIER_ROLE");
bytes32 constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

/// @title IParticipantRegistry
/// @notice Who may act in the system. Two separate role admins (spec F1):
///         - the Registry Admin registers organizations and their internal verifiers;
///         - the Accreditation Authority accredits auditors (and, in ClaimRegistry,
///           assigns them to claims and resolves disputes).
///         A wallet holds at most one participant role (organization, internal
///         verifier or auditor), so an auditor can never also verify for an organization.
interface IParticipantRegistry {
    // ---------------------------------------------------------------- events

    event OrganizationRegistered(address indexed organization, address indexed registryAdmin);
    event OrganizationRevoked(address indexed organization, address indexed registryAdmin);
    event InternalVerifierRegistered(
        address indexed verifier, address indexed organization, address indexed registryAdmin
    );
    event InternalVerifierRevoked(
        address indexed verifier, address indexed organization, address indexed registryAdmin
    );
    event AuditorAccredited(address indexed auditor, address indexed authority);
    event AuditorRevoked(address indexed auditor, address indexed authority);

    // ---------------------------------------------------------------- errors
    // Missing admin/authority permissions revert with OpenZeppelin's
    // `AccessControlUnauthorizedAccount(account, neededRole)`.

    error ZeroAddress();
    /// @dev The wallet already holds a participant role (one role per wallet).
    error AlreadyAccredited(address account);
    error NotActiveOrganization(address account);
    error NotActiveInternalVerifier(address account);
    error NotActiveAuditor(address account);

    // ------------------------------------------------ Registry Admin actions

    function registerOrganization(address organization) external;

    function revokeOrganization(address organization) external;

    /// @notice Links `verifier` to an active `organization`.
    function registerInternalVerifier(address verifier, address organization) external;

    function revokeInternalVerifier(address verifier) external;

    // ----------------------------------------- Accreditation Authority actions

    function accreditAuditor(address auditor) external;

    function revokeAuditor(address auditor) external;

    // ------------------------------------------------------------------ views

    function isOrganization(address account) external view returns (bool);

    /// @return organization The organization `verifier` belongs to, or address(0)
    ///         if `verifier` is not an active internal verifier.
    function organizationOf(address verifier) external view returns (address organization);

    /// @notice Active internal verifiers of `organization`; anchoring needs at least
    ///         MIN_INTERNAL_VERIFIERS (see IClaimRegistry).
    function activeVerifierCount(address organization) external view returns (uint256);

    function isAuditor(address account) external view returns (bool);

    function isAccreditationAuthority(address account) external view returns (bool);

    function isRegistryAdmin(address account) external view returns (bool);

    /// @notice True for any active organization, internal verifier or auditor
    ///         (the set of wallets allowed to open disputes, spec F7).
    function isAccredited(address account) external view returns (bool);
}
