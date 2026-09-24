// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — ClaimRegistry invariants under random valid and invalid calls
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {CommonBase} from "forge-std/Base.sol";
import {ClaimRegistry} from "../../src/ClaimRegistry.sol";
import {ParticipantRegistry} from "../../src/ParticipantRegistry.sol";
import {IClaimRegistry} from "../../src/interfaces/IClaimRegistry.sol";
import {
    REGISTRY_ADMIN_ROLE,
    ACCREDITATION_AUTHORITY_ROLE,
    ORGANIZATION_ROLE,
    INTERNAL_VERIFIER_ROLE,
    AUDITOR_ROLE
} from "../../src/interfaces/IParticipantRegistry.sol";
import {ProofOfAidFixture} from "../helpers/ProofOfAidFixture.sol";

/// @dev Participant role bits used by the lifetime-role ghost.
uint8 constant ORGANIZATION_BIT = 1;
uint8 constant VERIFIER_BIT = 2;
uint8 constant AUDITOR_BIT = 4;

/// @notice Drives a small, fixed set of claims through four entry points: `advance` takes the
///         next valid step with a caller picked from the live registry (so campaigns reach deep
///         states), `chaos` tries any action with any wallet and raw inputs (mostly invalid),
///         `churn` revokes participants and tries to register any wallet in any role, including
///         the role switches that permanent identity must block, and `revokeDecidingOrganization`
///         revokes a claim's organization right before its final decision. All wallets come
///         from one pool (the fixture cast plus fresh wallets for replacements). Reverts are
///         swallowed; ghosts record only what succeeded or was observed.
contract ClaimRegistryHandler is CommonBase {
    uint256 internal constant CLAIM_COUNT = 3;
    uint256 internal constant FRESH_WALLETS = 8;

    enum Kind {
        Organization,
        VerifierOf,
        Auditor
    }

    ClaimRegistry internal immutable claims;
    ParticipantRegistry internal immutable participants;
    address internal immutable registryAdmin;
    address internal immutable authority;

    address[] internal pool;
    bytes32[CLAIM_COUNT] internal claimIds;

    mapping(bytes32 claimId => address organization) public ghostOrganization;
    mapping(bytes32 claimId => bytes32 root) public ghostOriginalRoot;
    mapping(bytes32 claimId => bytes32 metadata) public ghostMetadata;
    mapping(bytes32 claimId => uint256 count) public ghostRootCount;
    uint256 public ghostUndeclaredTransitions;
    mapping(IClaimRegistry.ClaimStatus status => uint256 count) public ghostReached;
    /// @dev Bitmask of every participant role each pool wallet was ever seen holding.
    mapping(address account => uint8 roles) public ghostLifetimeRoles;
    /// @dev Transitions into Verified (attestFinal approve, dispute dismissed) of a claim whose
    ///      organization was already revoked when the call was made. Must stay 0.
    uint256 public ghostRevokedOrganizationVerifications;

    constructor(
        ClaimRegistry claims_,
        ParticipantRegistry participants_,
        address[] memory actors,
        address registryAdmin_,
        address authority_
    ) {
        claims = claims_;
        participants = participants_;
        registryAdmin = registryAdmin_;
        authority = authority_;
        for (uint256 i = 0; i < actors.length; i++) {
            pool.push(actors[i]);
        }
        for (uint256 i = 0; i < FRESH_WALLETS; i++) {
            pool.push(address(uint160(uint256(keccak256(abi.encode("fresh-wallet", i))))));
        }
        for (uint256 i = 0; i < pool.length; i++) {
            _observe(pool[i]);
        }
        for (uint256 i = 0; i < CLAIM_COUNT; i++) {
            claimIds[i] = keccak256(abi.encode("invariant-claim", i));
        }
    }

    // ------------------------------------------------------------- entry points

    /// @notice Performs 1-3 valid next steps (live caller, non-zero inputs, random branches),
    ///         so campaigns reach the proof loop, final attestation and disputes.
    function advance(uint256 seed) external {
        uint256 steps = 1 + seed % 3;
        for (uint256 i = 0; i < steps; i++) {
            _step(uint256(keccak256(abi.encode(seed, i))));
        }
    }

    /// @notice Any action, on any claim, by any wallet, with raw fuzzed inputs (zero included).
    function chaos(uint256 seed, bytes32 value, bool flag) external {
        bytes32 claimId = _claim(seed >> 8);
        address caller = _anyWallet(seed >> 16);
        address candidate = _anyWallet(seed >> 24);
        uint256 action = seed % 9;
        IClaimRegistry.ClaimStatus before = claims.statusOf(claimId);
        bool organizationActive = _organizationActive(claimId);
        vm.prank(caller);
        if (action == 0) {
            try claims.anchorClaim(claimId, value, value) {
                _recordAnchor(claimId, caller, value, value);
            } catch {}
        } else if (action == 1) {
            try claims.attestInternal(claimId, flag, value) {} catch {}
        } else if (action == 2) {
            try claims.assignAuditor(claimId, candidate) {} catch {}
        } else if (action == 3) {
            try claims.requestProof(claimId, value) {} catch {}
        } else if (action == 4) {
            try claims.submitProof(claimId, value) {
                ghostRootCount[claimId] += 1;
            } catch {}
        } else if (action == 5) {
            try claims.confirmProof(claimId, flag, value) {} catch {}
        } else if (action == 6) {
            try claims.attestFinal(claimId, flag, value) {} catch {}
        } else if (action == 7) {
            try claims.openDispute(claimId, value) {} catch {}
        } else {
            try claims.resolveDispute(claimId, flag, value) {} catch {}
        }
        _record(claimId, before, organizationActive);
    }

    /// @notice Revokes a participant (one call in eight) or tries to give a random pool wallet a
    ///         random participant or admin role. Most attempts hit used wallets and must revert;
    ///         fresh wallets succeed and become replacements.
    function churn(uint256 seed) external {
        address wallet = _anyWallet(seed >> 8);
        uint256 kind = seed % 8;
        if (kind == 0) {
            _revoke(wallet);
        } else if (kind == 1 || kind == 2) {
            vm.prank(registryAdmin);
            try participants.registerOrganization(wallet) {} catch {}
        } else if (kind == 3 || kind == 4) {
            address organization = _pick(seed >> 16, Kind.Organization, address(0), address(0));
            vm.prank(registryAdmin);
            try participants.registerInternalVerifier(wallet, organization) {} catch {}
        } else if (kind == 5 || kind == 6) {
            vm.prank(authority);
            try participants.accreditAuditor(wallet) {} catch {}
        } else {
            bool registry = (seed >> 16) % 2 == 0;
            vm.prank(registry ? registryAdmin : authority);
            try participants.grantRole(registry ? REGISTRY_ADMIN_ROLE : ACCREDITATION_AUTHORITY_ROLE, wallet) {}
                catch {}
        }
        _observe(wallet);
    }

    /// @notice One call in four: revokes the organization of a claim that is waiting for a
    ///         decision that could verify it (InternallyVerified or Disputed), so campaigns often
    ///         try to approve or dismiss for a revoked organization. `churn` alone rarely hits
    ///         the claim's organization at that moment.
    function revokeDecidingOrganization(uint256 seed) external {
        IClaimRegistry.Claim memory claim = claims.getClaim(_claim(seed >> 8));
        bool deciding = claim.status == IClaimRegistry.ClaimStatus.InternallyVerified
            || claim.status == IClaimRegistry.ClaimStatus.Disputed;
        if (seed % 4 != 0 || !deciding || !participants.isOrganization(claim.organization)) return;
        vm.prank(registryAdmin);
        participants.revokeOrganization(claim.organization);
    }

    // ------------------------------------------------------------------ views

    function claimIdAt(uint256 index) external view returns (bytes32) {
        return claimIds[index];
    }

    function claimCount() external pure returns (uint256) {
        return CLAIM_COUNT;
    }

    function walletAt(uint256 index) external view returns (address) {
        return pool[index];
    }

    function walletCount() external view returns (uint256) {
        return pool.length;
    }

    // --------------------------------------------------------------- internals

    /// @dev The natural next action for the claim's status; may still revert after churn.
    function _step(uint256 r) internal {
        bytes32 claimId = _claim(r);
        IClaimRegistry.Claim memory claim = claims.getClaim(claimId);
        bytes32 hash = keccak256(abi.encode("advance", r));
        IClaimRegistry.ClaimStatus status = claim.status;
        bool organizationActive = _organizationActive(claimId);
        if (status == IClaimRegistry.ClaimStatus.None) {
            address organization = _pick(r >> 8, Kind.Organization, address(0), address(0));
            bytes32 metadata = keccak256(abi.encode(hash));
            vm.prank(organization);
            try claims.anchorClaim(claimId, hash, metadata) {
                _recordAnchor(claimId, organization, hash, metadata);
            } catch {}
        } else if (status == IClaimRegistry.ClaimStatus.Anchored) {
            vm.prank(_pick(r >> 8, Kind.VerifierOf, claim.organization, address(0)));
            try claims.attestInternal(claimId, (r >> 16) % 5 != 0, hash) {} catch {}
        } else if (status == IClaimRegistry.ClaimStatus.InternallyVerified) {
            _auditStep(claimId, claim.auditor, r, hash);
        } else if (status == IClaimRegistry.ClaimStatus.ProofRequested) {
            vm.prank(claim.organization);
            try claims.submitProof(claimId, hash) {
                ghostRootCount[claimId] += 1;
            } catch {}
        } else if (status == IClaimRegistry.ClaimStatus.ProofSubmitted) {
            vm.prank(_pick(r >> 8, Kind.VerifierOf, claim.organization, claim.internalVerifier));
            try claims.confirmProof(claimId, (r >> 16) % 3 != 0, hash) {} catch {}
        } else if (status == IClaimRegistry.ClaimStatus.Verified) {
            vm.prank(_anyWallet(r >> 8));
            try claims.openDispute(claimId, hash) {} catch {}
        } else if (status == IClaimRegistry.ClaimStatus.Disputed) {
            vm.prank(authority);
            try claims.resolveDispute(claimId, (r >> 16) % 2 == 0, hash) {} catch {}
        }
        _record(claimId, status, organizationActive);
    }

    /// @dev InternallyVerified: (re)assign an auditor, or let the assigned one request proof or decide.
    function _auditStep(bytes32 claimId, address assigned, uint256 r, bytes32 hash) internal {
        if (assigned == address(0) || (r >> 24) % 4 == 0) {
            address candidate = _pick(r >> 8, Kind.Auditor, address(0), address(0));
            vm.prank(authority);
            try claims.assignAuditor(claimId, candidate) {} catch {}
        } else if ((r >> 32) % 3 == 0) {
            vm.prank(assigned);
            try claims.requestProof(claimId, hash) {} catch {}
        } else {
            vm.prank(assigned);
            try claims.attestFinal(claimId, (r >> 40) % 5 != 0, hash) {} catch {}
        }
    }

    function _revoke(address wallet) internal {
        if (participants.isOrganization(wallet)) {
            vm.prank(registryAdmin);
            participants.revokeOrganization(wallet);
        } else if (participants.hasRole(INTERNAL_VERIFIER_ROLE, wallet)) {
            vm.prank(registryAdmin);
            participants.revokeInternalVerifier(wallet);
        } else if (participants.isAuditor(wallet)) {
            vm.prank(authority);
            participants.revokeAuditor(wallet);
        }
    }

    /// @dev A pool wallet of the given kind (for VerifierOf: an active verifier of
    ///      `organization`), skipping `excluded`; address(0) when there is none.
    function _pick(uint256 seed, Kind kind, address organization, address excluded)
        internal
        view
        returns (address picked)
    {
        address[] memory matches = new address[](pool.length);
        uint256 count;
        for (uint256 i = 0; i < pool.length; i++) {
            address wallet = pool[i];
            bool fits = kind == Kind.Organization
                ? participants.isOrganization(wallet)
                : kind == Kind.Auditor
                    ? participants.isAuditor(wallet)
                    : organization != address(0) && participants.organizationOf(wallet) == organization;
            if (fits && wallet != excluded) matches[count++] = wallet;
        }
        if (count > 0) picked = matches[seed % count];
    }

    function _observe(address wallet) internal {
        ghostLifetimeRoles[wallet] |= participantRoles(participants, wallet);
    }

    function _recordAnchor(bytes32 claimId, address organization, bytes32 root, bytes32 metadata) internal {
        ghostOrganization[claimId] = organization;
        ghostOriginalRoot[claimId] = root;
        ghostMetadata[claimId] = metadata;
        ghostRootCount[claimId] = 1;
    }

    function _claim(uint256 seed) internal view returns (bytes32) {
        return claimIds[seed % CLAIM_COUNT];
    }

    function _anyWallet(uint256 seed) internal view returns (address) {
        return pool[seed % pool.length];
    }

    /// @dev Whether the claim's organization is active; read before the call is made.
    function _organizationActive(bytes32 claimId) internal view returns (bool) {
        return participants.isOrganization(claims.getClaim(claimId).organization);
    }

    /// @dev Counts any status change outside the declared transition table, and any transition
    ///      into Verified of a claim whose organization was revoked before the call.
    function _record(bytes32 claimId, IClaimRegistry.ClaimStatus before, bool organizationActive) internal {
        IClaimRegistry.ClaimStatus afterCall = claims.statusOf(claimId);
        if (afterCall != before) {
            ghostReached[afterCall] += 1;
            if (!_isDeclared(before, afterCall)) ghostUndeclaredTransitions += 1;
            if (!organizationActive && afterCall == IClaimRegistry.ClaimStatus.Verified) {
                ghostRevokedOrganizationVerifications += 1;
            }
        }
    }

    function _isDeclared(IClaimRegistry.ClaimStatus from, IClaimRegistry.ClaimStatus to)
        internal
        pure
        returns (bool declared)
    {
        // Edge = from * 10 + to, with the enum values None=0 … Disputed=7. The 12 edges are, in
        // IClaimRegistry's order: 0→1, 1→2, 1→6, 2→3, 3→4, 4→2, 4→3, 2→5, 2→6, 5→7, 7→6, 7→5.
        uint256 edge = uint256(from) * 10 + uint256(to);
        declared = edge == 1 || edge == 12 || edge == 16 || edge == 23 || edge == 34 || edge == 42 || edge == 43
            || edge == 25 || edge == 26 || edge == 57 || edge == 76 || edge == 75;
    }
}

/// @dev Participant roles `account` holds right now, as role bits.
function participantRoles(ParticipantRegistry participants, address account) view returns (uint8 roles) {
    if (participants.hasRole(ORGANIZATION_ROLE, account)) roles |= ORGANIZATION_BIT;
    if (participants.hasRole(INTERNAL_VERIFIER_ROLE, account)) roles |= VERIFIER_BIT;
    if (participants.hasRole(AUDITOR_ROLE, account)) roles |= AUDITOR_BIT;
}

contract ClaimRegistryInvariantTest is ProofOfAidFixture {
    ClaimRegistryHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](11);
        address[11] memory cast = _actors();
        for (uint256 i = 0; i < cast.length; i++) {
            actors[i] = cast[i];
        }
        handler = new ClaimRegistryHandler(claims, participants, actors, registryAdmin, authority);
        targetContract(address(handler));
    }

    /// @dev Anchored claims never disappear; claims are never created without a successful anchor.
    function invariant_AnchoredClaimsNeverReturnToNone() public view {
        for (uint256 i = 0; i < handler.claimCount(); i++) {
            bytes32 claimId = handler.claimIdAt(i);
            bool anchored = handler.ghostOrganization(claimId) != address(0);
            assertEq(claims.statusOf(claimId) != IClaimRegistry.ClaimStatus.None, anchored);
        }
    }

    /// @dev Only the 12 transitions of the IClaimRegistry table ever happen.
    function invariant_OnlyDeclaredTransitions() public view {
        assertEq(handler.ghostUndeclaredTransitions(), 0);
    }

    /// @dev A Verified or Disputed claim passed both checkpoints, by two different people.
    function invariant_VerifiedClaimsHaveBothCheckpoints() public view {
        for (uint256 i = 0; i < handler.claimCount(); i++) {
            IClaimRegistry.Claim memory claim = claims.getClaim(handler.claimIdAt(i));
            if (
                claim.status != IClaimRegistry.ClaimStatus.Verified
                    && claim.status != IClaimRegistry.ClaimStatus.Disputed
            ) {
                continue;
            }
            assertTrue(claim.internalVerifier != address(0), "no checkpoint-1 verifier");
            assertTrue(claim.auditor != address(0), "no auditor");
            assertTrue(claim.internalVerifier != claim.auditor, "verifier audited itself");
            assertTrue(claim.internalVerifier != claim.organization, "submitter verified itself");
            assertTrue(claim.auditor != claim.organization, "organization audited itself");
        }
    }

    /// @dev Roots are append-only: one per successful anchor/submission, original root fixed.
    function invariant_EvidenceRootsOnlyGrow() public view {
        for (uint256 i = 0; i < handler.claimCount(); i++) {
            bytes32 claimId = handler.claimIdAt(i);
            bytes32[] memory roots = claims.evidenceRoots(claimId);
            assertEq(roots.length, handler.ghostRootCount(claimId));
            if (roots.length > 0) assertEq(roots[0], handler.ghostOriginalRoot(claimId));
        }
    }

    /// @dev A claim whose organization is revoked never transitions into Verified: it can be
    ///      rejected (or a dispute upheld) but never approved or have a dispute dismissed.
    function invariant_RevokedOrganizationNeverBecomesVerified() public view {
        assertEq(handler.ghostRevokedOrganizationVerifications(), 0);
    }

    /// @dev The anchoring organization and metadata of a claim never change.
    function invariant_ClaimOwnershipIsImmutable() public view {
        for (uint256 i = 0; i < handler.claimCount(); i++) {
            bytes32 claimId = handler.claimIdAt(i);
            IClaimRegistry.Claim memory claim = claims.getClaim(claimId);
            assertEq(claim.organization, handler.ghostOrganization(claimId));
            assertEq(claim.metadataHash, handler.ghostMetadata(claimId));
        }
    }

    /// @dev No wallet ever holds two participant roles over its lifetime, and no current or
    ///      former participant ever holds an admin role.
    function invariant_ParticipantIdentityIsPermanent() public view {
        for (uint256 i = 0; i < handler.walletCount(); i++) {
            address wallet = handler.walletAt(i);
            uint8 lifetime = handler.ghostLifetimeRoles(wallet) | participantRoles(participants, wallet);
            assertTrue(
                lifetime == 0 || lifetime == ORGANIZATION_BIT || lifetime == VERIFIER_BIT || lifetime == AUDITOR_BIT,
                "wallet switched roles"
            );
            if (lifetime != 0) {
                assertFalse(participants.isRegistryAdmin(wallet), "participant became Registry Admin");
                assertFalse(participants.isAccreditationAuthority(wallet), "participant became Authority");
            }
        }
    }
}
