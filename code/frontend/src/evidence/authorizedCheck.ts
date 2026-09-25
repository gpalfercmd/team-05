// =============================================================================
// Proof of Aid — Team 05 — Reviewer checks: a private file downloaded from the backend vs the chain
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import type { AuthorizedBundle, AuthorizedFile } from '../data/evidenceApi';
import { hashFileWithSalts } from './hashing';
import { err, ok, type Result } from '../utils/result';
import type { EvidenceManifest } from './manifest';
import { checkFilesAgainstManifest, checkManifest, listedFingerprint, type ManifestCheck, type VerifiedManifest } from './verification';

// The backend is trusted to decrypt, not to be honest (P10.2). An authorized viewer's file list,
// with every salt, is turned into a file list the public checks already understand; it counts only
// once its Merkle root equals the root the contract holds. A downloaded file then matches only if
// SHA-256(salt ‖ bytes) is the fingerprint listed for that very file.

/** The authorized file list of one bundle as a version 2 list. Built here, never published. */
export function authorizedManifest(claimId: Hex, bundle: AuthorizedBundle): EvidenceManifest {
  const manifest: EvidenceManifest = {
    version: 2,
    claimId,
    rootIndex: bundle.rootIndex,
    // Marked public only so the shared matcher may use each salt; nothing here leaves the page.
    files: bundle.files.map((file) => (file.salt === undefined ? { sha256: file.fingerprint, public: true } : { sha256: file.fingerprint, public: true, salt: file.salt })),
  };
  return manifest;
}

/** Proves the backend's list of fingerprints for a bundle against the onchain root. */
export const checkAuthorizedBundle = (claimId: Hex, bundle: AuthorizedBundle, onchainRoots: readonly Hex[]): ManifestCheck =>
  checkManifest(authorizedManifest(claimId, bundle), claimId, onchainRoots);

export type AuthorizedFileCheck = {
  kind: 'match' | 'mismatch';
  /** SHA-256(salt ‖ downloaded bytes), or the plain SHA-256 for an unsalted pre-P8.2 file. */
  computed: Hex;
};

/** Re-hashes the downloaded bytes with the file's salt; they match only this file's listed fingerprint. */
export async function checkDownloadedFile(
  verified: VerifiedManifest,
  file: AuthorizedFile,
  bytes: ArrayBuffer,
): Promise<Result<AuthorizedFileCheck, string>> {
  const hashed = await hashFileWithSalts(new File([bytes], 'downloaded'), file.salt === undefined ? [] : [file.salt]);
  if (!hashed.ok) {
    return err(hashed.error);
  }
  const computed = file.salt === undefined ? hashed.value.sha256 : (hashed.value.salted?.[0]?.commitment ?? hashed.value.sha256);
  const [check] = checkFilesAgainstManifest(verified, [hashed.value]);
  const listedAsThisFile =
    check?.kind === 'match' && listedFingerprint(hashed.value, verified.manifest).toLowerCase() === file.fingerprint.toLowerCase();
  const result: Result<AuthorizedFileCheck, string> = ok({ kind: listedAsThisFile ? 'match' : 'mismatch', computed });
  return result;
}

const UNSAFE_NAME_CHARACTERS = /[^A-Za-z0-9._-]+/g;
const MAX_NAME_LENGTH = 100;

/** A plain base name for the saved file (same rule as the backend's `safe_filename`). */
export function safeDownloadName(name: string, fingerprint: Hex): string {
  const base = name.split(/[/\\]/).at(-1) ?? '';
  const cleaned = base.replace(UNSAFE_NAME_CHARACTERS, '_').replace(/^[._]+|[._]+$/g, '').slice(0, MAX_NAME_LENGTH);
  const safe = cleaned === '' ? `evidence-${fingerprint.slice(2, 10)}.bin` : cleaned;
  return safe;
}
