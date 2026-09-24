// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Deploys both registries and reads/writes shared/deployments
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";

/// @notice Shared by Deploy and DemoLifecycle. The deployment file is the only way the backend
///         (indexer) and the frontend learn the contract addresses, so its shape is fixed:
///         `{ chainId, participantRegistry, claimRegistry, deployBlock, registryAdmin,
///         accreditationAuthority }` at `code/shared/deployments/<network>.json` (`anvil.json`,
///         `arbitrum-sepolia.json`). Solidity cannot know its own transaction hashes, so
///         `script/record_transactions.py` later adds `deploymentTransactions` and
///         `lifecycleTransactions` from Foundry's broadcast log.
abstract contract DeploymentFile is Script {
    // Incentive amounts at 1/100 of the production reference values (reward 0.01, auditor
    // deposit 0.1, organization penalty 1, dispute bond 0.1 ETH), so the testnet demo stays cheap.
    // The dispute window is the real one.
    uint256 internal constant AUDITOR_REWARD = 0.0001 ether;
    uint256 internal constant AUDITOR_DEPOSIT = 0.001 ether;
    uint256 internal constant ORGANIZATION_PENALTY = 0.01 ether;
    uint256 internal constant DISPUTE_BOND = 0.001 ether;
    uint256 internal constant DISPUTE_WINDOW = 60 days;

    struct Deployment {
        uint256 chainId;
        address participantRegistry;
        address claimRegistry;
        uint256 deployBlock;
        address registryAdmin;
        address accreditationAuthority;
    }

    /// @dev Must be called inside a broadcast: both contracts are created by the broadcaster.
    ///      `deployBlock` is the block after the current head, the first block that can hold
    ///      the deployment: exact on anvil (automine), a safe lower bound on public networks,
    ///      where the indexer may start earlier without missing events.
    function _deploy(address registryAdmin, address accreditationAuthority)
        internal
        returns (Deployment memory deployment)
    {
        deployment.chainId = block.chainid;
        deployment.deployBlock = vm.getBlockNumber() + 1;
        deployment.registryAdmin = registryAdmin;
        deployment.accreditationAuthority = accreditationAuthority;
        ParticipantRegistry participants = new ParticipantRegistry(registryAdmin, accreditationAuthority);
        deployment.participantRegistry = address(participants);
        deployment.claimRegistry = address(
            new ClaimRegistry(
                participants, AUDITOR_REWARD, AUDITOR_DEPOSIT, ORGANIZATION_PENALTY, DISPUTE_BOND, DISPUTE_WINDOW
            )
        );
    }

    /// @dev Written only when the transactions are really sent (`--broadcast` or `--resume`),
    ///      so a dry run never leaves addresses of contracts that do not exist. A new deployment
    ///      replaces the whole file, including transaction lists recorded for the previous one.
    function _writeDeployment(Deployment memory deployment) internal {
        string memory path = _deploymentPath();
        bool broadcasting =
            vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (broadcasting) {
            string memory key = "deployment";
            vm.serializeUint(key, "chainId", deployment.chainId);
            vm.serializeAddress(key, "participantRegistry", deployment.participantRegistry);
            vm.serializeAddress(key, "claimRegistry", deployment.claimRegistry);
            vm.serializeUint(key, "deployBlock", deployment.deployBlock);
            vm.serializeAddress(key, "registryAdmin", deployment.registryAdmin);
            string memory json = vm.serializeAddress(key, "accreditationAuthority", deployment.accreditationAuthority);
            vm.createDir("../shared/deployments", true);
            vm.writeJson(json, path);
            console2.log("Deployment written to", path);
        } else {
            console2.log("Dry run: deployment file not written (add --broadcast)");
        }
    }

    function _readDeployment() internal view returns (Deployment memory deployment) {
        string memory json = vm.readFile(_deploymentPath());
        deployment.chainId = vm.parseJsonUint(json, ".chainId");
        deployment.participantRegistry = vm.parseJsonAddress(json, ".participantRegistry");
        deployment.claimRegistry = vm.parseJsonAddress(json, ".claimRegistry");
        deployment.deployBlock = vm.parseJsonUint(json, ".deployBlock");
        deployment.registryAdmin = vm.parseJsonAddress(json, ".registryAdmin");
        deployment.accreditationAuthority = vm.parseJsonAddress(json, ".accreditationAuthority");
        require(deployment.chainId == block.chainid, "deployment file is for another chain");
        require(deployment.claimRegistry.code.length > 0, "no ClaimRegistry code at the recorded address");
    }

    function _deploymentPath() internal view returns (string memory) {
        return string.concat("../shared/deployments/", _networkName(), ".json");
    }

    /// @dev File stem per network, as the other layers expect; unknown chains use their id.
    function _networkName() internal view returns (string memory name) {
        name = vm.toString(block.chainid);
        if (block.chainid == 31337) name = "anvil";
        if (block.chainid == 421614) name = "arbitrum-sepolia";
    }

    function _logDeployment(Deployment memory deployment) internal pure {
        console2.log("chainId             ", deployment.chainId);
        console2.log("ParticipantRegistry ", deployment.participantRegistry);
        console2.log("ClaimRegistry       ", deployment.claimRegistry);
        console2.log("deployBlock         ", deployment.deployBlock);
        console2.log("registryAdmin       ", deployment.registryAdmin);
        console2.log("accreditationAuth.  ", deployment.accreditationAuthority);
    }
}
