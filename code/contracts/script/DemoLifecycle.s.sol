// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Demo: accredits the cast and runs one claim's full lifecycle
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {console2} from "forge-std/Script.sol";
import {DeploymentFile} from "./DeploymentFile.sol";
import {IClaimRegistry} from "../src/interfaces/IClaimRegistry.sol";
import {IParticipantRegistry} from "../src/interfaces/IParticipantRegistry.sol";

/// @notice Seven TEST-ONLY wallets derived from `MNEMONIC` (m/44'/60'/0'/0/i) play every role:
///           0 deployer + Registry Admin   1 Accreditation Authority   2 Organization
///           3 Internal Verifier 1         4 Internal Verifier 2       5 Auditor
///           6 Disputant (a second accredited auditor, also the spare for reassignment)
///         Story, each step signed by its own wallet:
///           anchor → attestInternal(approve) → assignAuditor → requestProof → submitProof
///           → confirmProof(accept, verifier 2) → attestFinal(approve) → openDispute
///           → resolveDispute(dismissed). The claim ends Verified.
///         The claim anchors the frontend's real demo evidence, so the public claim page shows a
///         genuine match when it recomputes the Merkle roots of the demo files.
///         Env: `MNEMONIC` (required); `USE_EXISTING=true` reuses
///         `code/shared/deployments/<network>.json` instead of deploying; `DEMO_CLAIM_UUID`
///         sets claimId = keccak256(bytes(uuid)) instead of the default (needed to replay the
///         story on the same chain). Re-running is safe: wallets already accredited are skipped.
///
///         forge script script/DemoLifecycle.s.sol --rpc-url anvil --broadcast --slow
///         python3 script/record_transactions.py DemoLifecycle.s.sol --chain-id 31337
contract DemoLifecycle is DeploymentFile {
    /// @dev `FULL_STORY_CLAIM_ID` of the frontend fixture (`code/frontend/src/mocks/claims.ts`),
    ///      also the `claimId` inside `code/frontend/public/demo-evidence/manifest*.json`.
    bytes32 internal constant DEFAULT_CLAIM_ID = 0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28;

    /// @dev Actors below this balance get a top-up from the deployer (6 × 0.002 ETH at most).
    uint256 internal constant MIN_ACTOR_BALANCE = 0.001 ether;
    uint256 internal constant ACTOR_TOP_UP = 0.002 ether;

    uint256 internal constant ACTOR_COUNT = 7;
    uint256 internal constant DEPLOYER = 0;
    uint256 internal constant AUTHORITY = 1;
    uint256 internal constant ORGANIZATION = 2;
    uint256 internal constant VERIFIER_1 = 3;
    uint256 internal constant VERIFIER_2 = 4;
    uint256 internal constant AUDITOR = 5;
    uint256 internal constant DISPUTANT = 6;

    /// @dev Merkle root (shared recipe, `poa_shared.merkle.build_root`) of the files listed in
    ///      `code/frontend/public/demo-evidence/manifest.json` (rootIndex 0), and of
    ///      `manifest-proof-1.json` (rootIndex 1, the supplementary proof). Frontend constants
    ///      `DEMO_ORIGINAL_ROOT` / `DEMO_PROOF_ROOT`; recompute them if the demo files change.
    bytes32 internal constant EVIDENCE_ROOT = 0x515344752095a24904ad32a660a1d15ddbf9c49e90f43d58323d76e398548707;
    bytes32 internal constant SUPPLEMENTARY_ROOT = 0x8e94bc6a483ea396391f77e88e9359003f723d74463a8afef5279ab397612370;

    // Deterministic stand-ins for texts the backend would hash offchain.
    bytes32 internal constant METADATA_HASH = keccak256("demo:metadata:v1");
    bytes32 internal constant INTERNAL_JUSTIFICATION = keccak256("demo:internal-justification:v1");
    bytes32 internal constant PROOF_REQUEST = keccak256("demo:proof-request:v1");
    bytes32 internal constant PROOF_REVIEW = keccak256("demo:proof-review:v1");
    bytes32 internal constant FINAL_JUSTIFICATION = keccak256("demo:final-justification:v1");
    bytes32 internal constant COUNTER_EVIDENCE = keccak256("demo:counter-evidence:v1");
    bytes32 internal constant RESOLUTION_JUSTIFICATION = keccak256("demo:dispute-resolution:v1");

    string[8] internal statusNames = [
        "None", "Anchored", "InternallyVerified", "ProofRequested", "ProofSubmitted", "Verified", "Rejected", "Disputed"
    ];

    uint256[ACTOR_COUNT] internal keys;
    address[ACTOR_COUNT] internal wallets;

    function run() external {
        _loadActors();
        _fundActors();
        Deployment memory deployment = vm.envOr("USE_EXISTING", false) ? _existingDeployment() : _deployFresh();
        _logDeployment(deployment);

        _accreditCast(IParticipantRegistry(deployment.participantRegistry));
        bytes32 claimId = _claimId();
        _runStory(IClaimRegistry(deployment.claimRegistry), claimId);
    }

    // ------------------------------------------------------------------ setup

    function _loadActors() internal {
        string memory mnemonic = vm.envOr("MNEMONIC", string(""));
        require(bytes(mnemonic).length > 0, "MNEMONIC is not set (use a TEST-ONLY mnemonic)");
        string[ACTOR_COUNT] memory labels =
            ["deployer/registryAdmin", "authority", "organization", "verifier1", "verifier2", "auditor", "disputant"];
        for (uint256 i = 0; i < ACTOR_COUNT; i++) {
            keys[i] = vm.deriveKey(mnemonic, uint32(i));
            wallets[i] = vm.addr(keys[i]);
            console2.log(labels[i], wallets[i]);
        }
    }

    function _fundActors() internal {
        for (uint256 i = 1; i < ACTOR_COUNT; i++) {
            if (wallets[i].balance < MIN_ACTOR_BALANCE) {
                vm.broadcast(keys[DEPLOYER]);
                (bool sent,) = payable(wallets[i]).call{value: ACTOR_TOP_UP}("");
                require(sent, "top-up failed");
                console2.log("funded actor", i, wallets[i]);
            }
        }
    }

    function _deployFresh() internal returns (Deployment memory deployment) {
        vm.startBroadcast(keys[DEPLOYER]);
        deployment = _deploy(wallets[DEPLOYER], wallets[AUTHORITY]);
        vm.stopBroadcast();
        _writeDeployment(deployment);
    }

    function _existingDeployment() internal view returns (Deployment memory deployment) {
        deployment = _readDeployment();
        require(
            deployment.registryAdmin == wallets[DEPLOYER], "MNEMONIC index 0 is not the deployment's Registry Admin"
        );
        require(
            deployment.accreditationAuthority == wallets[AUTHORITY],
            "MNEMONIC index 1 is not the deployment's Accreditation Authority"
        );
    }

    /// @dev Idempotent, so the demo can be replayed on an existing deployment.
    function _accreditCast(IParticipantRegistry participants) internal {
        address organization = wallets[ORGANIZATION];
        if (!participants.isOrganization(organization)) {
            vm.broadcast(keys[DEPLOYER]);
            participants.registerOrganization(organization);
        }
        for (uint256 i = VERIFIER_1; i <= VERIFIER_2; i++) {
            if (participants.organizationOf(wallets[i]) != organization) {
                vm.broadcast(keys[DEPLOYER]);
                participants.registerInternalVerifier(wallets[i], organization);
            }
        }
        for (uint256 i = AUDITOR; i <= DISPUTANT; i++) {
            if (!participants.isAuditor(wallets[i])) {
                vm.broadcast(keys[AUTHORITY]);
                participants.accreditAuditor(wallets[i]);
            }
        }
        console2.log("cast accredited; organization verifiers:", participants.activeVerifierCount(organization));
    }

    function _claimId() internal view returns (bytes32 claimId) {
        string memory uuid = vm.envOr("DEMO_CLAIM_UUID", string(""));
        claimId = bytes(uuid).length == 0 ? DEFAULT_CLAIM_ID : keccak256(bytes(uuid));
        console2.log("claim UUID override", bytes(uuid).length == 0 ? "(none: frontend demo claim)" : uuid);
        console2.log("claimId");
        console2.logBytes32(claimId);
    }

    // ------------------------------------------------------------------ story

    function _runStory(IClaimRegistry claims, bytes32 claimId) internal {
        vm.broadcast(keys[ORGANIZATION]);
        claims.anchorClaim(claimId, EVIDENCE_ROOT, METADATA_HASH);
        _logStep("1. organization anchors the evidence root", claims, claimId);

        vm.broadcast(keys[VERIFIER_1]);
        claims.attestInternal(claimId, true, INTERNAL_JUSTIFICATION);
        _logStep("2. verifier 1 approves (checkpoint 1)", claims, claimId);

        vm.broadcast(keys[AUTHORITY]);
        claims.assignAuditor(claimId, wallets[AUDITOR]);
        _logStep("3. authority assigns the auditor", claims, claimId);

        vm.broadcast(keys[AUDITOR]);
        claims.requestProof(claimId, PROOF_REQUEST);
        _logStep("4. auditor requests proof", claims, claimId);

        vm.broadcast(keys[ORGANIZATION]);
        claims.submitProof(claimId, SUPPLEMENTARY_ROOT);
        _logStep("5. organization submits supplementary evidence", claims, claimId);

        vm.broadcast(keys[VERIFIER_2]);
        claims.confirmProof(claimId, true, PROOF_REVIEW);
        _logStep("6. verifier 2 confirms the proof (four eyes)", claims, claimId);

        vm.broadcast(keys[AUDITOR]);
        claims.attestFinal(claimId, true, FINAL_JUSTIFICATION);
        _logStep("7. auditor approves (checkpoint 2, final)", claims, claimId);

        vm.broadcast(keys[DISPUTANT]);
        claims.openDispute(claimId, COUNTER_EVIDENCE);
        _logStep("8. disputant opens a dispute", claims, claimId);

        vm.broadcast(keys[AUTHORITY]);
        claims.resolveDispute(claimId, false, RESOLUTION_JUSTIFICATION);
        _logStep("9. authority dismisses the dispute", claims, claimId);

        require(claims.statusOf(claimId) == IClaimRegistry.ClaimStatus.Verified, "demo claim did not end Verified");
        console2.log("evidence roots onchain:", claims.evidenceRoots(claimId).length);
    }

    function _logStep(string memory step, IClaimRegistry claims, bytes32 claimId) internal view {
        console2.log(step, "->", statusNames[uint8(claims.statusOf(claimId))]);
    }
}
