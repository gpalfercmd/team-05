// SPDX-License-Identifier: MIT
// =============================================================================
// Proof of Aid — Team 05 — Checks the shared Merkle vectors against OpenZeppelin
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Every root and proof in `code/shared/merkle-vectors.json` must hold onchain:
///         sha256 precompile == file hash, keccak256(file hash) == leaf, and
///         OpenZeppelin `MerkleProof.verify` accepts each proof (and rejects the tampered one).
contract MerkleVectorsTest is Test {
    string internal constant VECTORS_PATH = "../shared/merkle-vectors.json";

    string internal json;

    function setUp() public {
        json = vm.readFile(VECTORS_PATH);
    }

    function test_EveryFileMatchesHashLeafAndProof() public view {
        uint256 caseCount = vm.parseJsonUint(json, ".case_count");
        assertGt(caseCount, 0, "no vector cases");
        for (uint256 i = 0; i < caseCount; i++) {
            _checkCase(i);
        }
    }

    function test_OrderIndependenceSharesRoot() public view {
        assertEq(_rootOf("order_independence"), _rootOf("five_files"), "input order changed the root");
    }

    function test_TamperedFileDoesNotVerify() public view {
        bytes memory content = vm.parseJsonBytes(json, ".tamper.tampered_content_hex");
        bytes32 fileHash = vm.parseJsonBytes32(json, ".tamper.tampered_sha256");
        bytes32 leaf = vm.parseJsonBytes32(json, ".tamper.tampered_leaf");
        bytes32 root = vm.parseJsonBytes32(json, ".tamper.root");
        bytes32[] memory proof = vm.parseJsonBytes32Array(json, ".tamper.proof");

        assertEq(sha256(content), fileHash, "tampered sha256 mismatch");
        assertEq(keccak256(abi.encodePacked(fileHash)), leaf, "tampered leaf mismatch");
        assertEq(root, _rootOf(vm.parseJsonString(json, ".tamper.case")), "tamper root is not its case root");
        assertFalse(vm.parseJsonBool(json, ".tamper.must_verify"), "tamper must be a negative vector");
        assertFalse(MerkleProof.verify(proof, root, leaf), "tampered file verified");
    }

    function _checkCase(uint256 caseIndex) internal view {
        string memory casePath = string.concat(".cases[", vm.toString(caseIndex), "]");
        bytes32 root = vm.parseJsonBytes32(json, string.concat(casePath, ".root"));
        uint256 fileCount = vm.parseJsonUint(json, string.concat(casePath, ".file_count"));
        assertGt(fileCount, 0, "case without files");
        for (uint256 j = 0; j < fileCount; j++) {
            _checkFile(string.concat(casePath, ".files[", vm.toString(j), "]"), root);
        }
    }

    function _checkFile(string memory filePath, bytes32 root) internal view {
        bytes memory content = vm.parseJsonBytes(json, string.concat(filePath, ".content_hex"));
        bytes32 fileHash = vm.parseJsonBytes32(json, string.concat(filePath, ".sha256"));
        bytes32 leaf = vm.parseJsonBytes32(json, string.concat(filePath, ".leaf"));
        bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(filePath, ".proof"));

        assertEq(sha256(content), fileHash, string.concat("sha256 mismatch at ", filePath));
        assertEq(keccak256(abi.encodePacked(fileHash)), leaf, string.concat("leaf mismatch at ", filePath));
        assertTrue(MerkleProof.verify(proof, root, leaf), string.concat("proof rejected at ", filePath));
    }

    function _rootOf(string memory name) internal view returns (bytes32) {
        uint256 caseCount = vm.parseJsonUint(json, ".case_count");
        bytes32 root;
        for (uint256 i = 0; i < caseCount; i++) {
            string memory casePath = string.concat(".cases[", vm.toString(i), "]");
            if (keccak256(bytes(vm.parseJsonString(json, string.concat(casePath, ".name")))) == keccak256(bytes(name))) {
                root = vm.parseJsonBytes32(json, string.concat(casePath, ".root"));
            }
        }
        assertTrue(root != bytes32(0), string.concat("vector case not found: ", name));
        return root;
    }
}
