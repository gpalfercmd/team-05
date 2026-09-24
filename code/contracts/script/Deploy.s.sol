// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Deploys ParticipantRegistry and ClaimRegistry
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {DeploymentFile} from "./DeploymentFile.sol";

/// @notice Deploys both registries and records them in `code/shared/deployments/<network>.json`
///         (`anvil.json`, `arbitrum-sepolia.json`).
///         Env: `REGISTRY_ADMIN`, `ACCREDITATION_AUTHORITY` (two different wallets).
///         The deployer key comes from the CLI (`--account <keystore>` or `--private-key`),
///         never from code. The deployer gets no role: both admins are set in the constructor.
///
///         forge script script/Deploy.s.sol --rpc-url anvil --broadcast --private-key <anvil key 0>
///         python3 script/record_transactions.py Deploy.s.sol --chain-id 31337
contract Deploy is DeploymentFile {
    function run() external returns (Deployment memory deployment) {
        address registryAdmin = vm.envAddress("REGISTRY_ADMIN");
        address accreditationAuthority = vm.envAddress("ACCREDITATION_AUTHORITY");

        vm.startBroadcast();
        deployment = _deploy(registryAdmin, accreditationAuthority);
        vm.stopBroadcast();

        _logDeployment(deployment);
        _writeDeployment(deployment);
    }
}
