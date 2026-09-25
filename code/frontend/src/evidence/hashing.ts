// =============================================================================
// Proof of Aid — Team 05 — Hash a file in the browser: plain SHA-256 plus its salted commitments
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { readFileBytes, saltedSha256Hex, sha256Hex } from '../utils/merkle';
import { ok, type Result } from '../utils/result';
import type { HashedFile, SaltedDigest } from './verification';

// Shared by "Verify it yourself" (public salts of a verified list) and the reviewer view (the salt
// an authorized viewer received, P10.2). Hashing uses WebCrypto; the bytes never leave the browser.

/** SHA-256 of one file plus its commitment SHA-256(salt ‖ bytes) for every given salt (P8.2). */
export async function hashFileWithSalts(file: File, salts: readonly Hex[]): Promise<Result<HashedFile, string>> {
  const bytes = await readFileBytes(file);
  if (!bytes.ok) {
    return bytes;
  }
  const plain = await sha256Hex(bytes.value);
  if (!plain.ok) {
    return plain;
  }
  const salted: SaltedDigest[] = [];
  for (const salt of salts) {
    const commitment = await saltedSha256Hex(salt, bytes.value);
    if (commitment.ok) {
      salted.push({ salt, commitment: commitment.value });
    }
  }
  const hashed: Result<HashedFile, string> = ok({ name: file.name, sha256: plain.value, salted });
  return hashed;
}
