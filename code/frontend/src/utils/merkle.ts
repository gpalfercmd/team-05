// =============================================================================
// Proof of Aid — Team 05 — Browser-side Merkle recipe (frozen in P1) and file fingerprints
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { bytesToHex, concat, hexToBytes, keccak256, type Hex } from 'viem';
import { err, ok, type Result } from './result';

// Third implementation of the recipe in code/shared/merkle-vectors.json, next to Solidity and
// Python (poa_shared.merkle). All three must agree byte for byte, otherwise the public page would
// report false mismatches, so this file follows the Python reference step by step:
//   fileHash = SHA-256(bytes); leaf = keccak256(fileHash); empty input and duplicates rejected;
//   leaves sorted ascending; parent = keccak256(min ‖ max); odd node promoted; one leaf = root.
// Since P8.2 uploads commit to SHA-256(salt ‖ bytes) with a random 32-byte salt instead of the plain
// SHA-256 (saltedSha256Hex); the commitment is the fileHash for everything above.

export type MerkleError =
  | { kind: 'empty' }
  | { kind: 'malformed-hash'; value: string }
  | { kind: 'duplicate'; fileHash: Hex };

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Files bigger than this are refused instead of freezing the tab while they are read into memory. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

export const isBytes32 = (value: string): value is Hex => BYTES32_PATTERN.test(value);

/** keccak256(min ‖ max): sorted-pair hashing, so a proof never needs left/right flags. */
function nodeHash(a: Hex, b: Hex): Hex {
  // Lowercase hex strings of equal length sort exactly like the raw bytes they encode.
  const node = a < b ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
  return node;
}

/** Leaf for one file: keccak256 over the 32 raw bytes of its SHA-256, never the file itself. */
export const leafFromFileHash = (fileHash: Hex): Hex => keccak256(fileHash);

function sortedLeaves(fileHashes: readonly string[]): Result<Hex[], MerkleError> {
  if (fileHashes.length === 0) {
    return err({ kind: 'empty' });
  }
  const malformed = fileHashes.find((value) => !isBytes32(value));
  if (malformed !== undefined) {
    return err({ kind: 'malformed-hash', value: malformed });
  }
  // Hex case carries no meaning, so "0xAB…" and "0xab…" are the same file.
  const normalized = fileHashes.map((value) => value.toLowerCase() as Hex);
  const duplicate = normalized.find((value, index) => normalized.indexOf(value) !== index);
  if (duplicate !== undefined) {
    return err({ kind: 'duplicate', fileHash: duplicate });
  }
  const leaves = ok(normalized.map(leafFromFileHash).toSorted());
  return leaves;
}

/** Hashes adjacent pairs; an odd last node moves up unchanged. */
function nextLevel(level: readonly Hex[]): Hex[] {
  const parents: Hex[] = [];
  for (let index = 0; index < level.length; index += 2) {
    const left = level[index];
    const right = level[index + 1];
    if (left !== undefined) {
      parents.push(right === undefined ? left : nodeHash(left, right));
    }
  }
  return parents;
}

/** Merkle root of a bundle, from the SHA-256 of each of its files (any order). */
export function buildRoot(fileHashes: readonly string[]): Result<Hex, MerkleError> {
  const leaves = sortedLeaves(fileHashes);
  if (!leaves.ok) {
    return leaves;
  }
  let level: readonly Hex[] = leaves.value;
  while (level.length > 1) {
    level = nextLevel(level);
  }
  const root = level[0];
  const result: Result<Hex, MerkleError> = root === undefined ? err({ kind: 'empty' }) : ok(root);
  return result;
}

/** Same check as OpenZeppelin `MerkleProof.verify(proof, root, leaf)`: fold the siblings bottom-up. */
export function verifyProof(proof: readonly string[], root: string, leaf: string): boolean {
  const values = [...proof, root, leaf];
  if (!values.every(isBytes32)) {
    return false;
  }
  const computed = proof.reduce<Hex>(
    (node, sibling) => nodeHash(node, sibling.toLowerCase() as Hex),
    leaf.toLowerCase() as Hex,
  );
  const valid = computed === root.toLowerCase();
  return valid;
}

/** SHA-256 of raw bytes with WebCrypto; the bytes never leave the browser. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<Result<Hex, string>> {
  // WebCrypto only exists in secure contexts (https or localhost).
  if (globalThis.crypto?.subtle === undefined) {
    return err('This browser cannot compute file fingerprints here. Open the page over https.');
  }
  let result: Result<Hex, string>;
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    result = ok(bytesToHex(new Uint8Array(digest)));
  } catch (error: unknown) {
    result = err(error instanceof Error ? error.message : 'The browser could not compute the fingerprint.');
  }
  return result;
}

/** Salted commitment SHA-256(salt ‖ bytes); a salt that is not 32 bytes is refused. */
export async function saltedSha256Hex(salt: string, bytes: ArrayBuffer): Promise<Result<Hex, string>> {
  if (!isBytes32(salt)) {
    return err('The salt must be exactly 32 bytes of hex.');
  }
  const saltBytes = hexToBytes(salt);
  const joined = new Uint8Array(saltBytes.length + bytes.byteLength);
  joined.set(saltBytes, 0);
  joined.set(new Uint8Array(bytes), saltBytes.length);
  const result = await sha256Hex(joined.buffer);
  return result;
}

/** Reads a file chosen or dropped by the visitor and returns its SHA-256 (the Merkle fileHash). */
export async function hashFile(file: Blob): Promise<Result<Hex, string>> {
  if (file.size > MAX_FILE_BYTES) {
    return err('This file is too large to check in the browser (limit: 256 MB).');
  }
  let bytes: Result<ArrayBuffer, string>;
  try {
    bytes = ok(await file.arrayBuffer());
  } catch (error: unknown) {
    bytes = err(error instanceof Error ? error.message : 'The file could not be read.');
  }
  const result = bytes.ok ? await sha256Hex(bytes.value) : bytes;
  return result;
}

/** Plain-language explanation of a Merkle input error, for the verification panel. */
export function merkleErrorMessage(error: MerkleError): string {
  const messages: Record<MerkleError['kind'], string> = {
    empty: 'Add at least one file.',
    'malformed-hash': 'A fingerprint in the list is not a valid SHA-256 value.',
    duplicate: 'The same file was added twice. Each file can appear only once in a bundle.',
  };
  const message = messages[error.kind];
  return message;
}
