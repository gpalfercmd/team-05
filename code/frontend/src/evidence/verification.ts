// =============================================================================
// Proof of Aid — Team 05 — Pure evidence checks: manifest vs onchain root, files, whole bundles
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { buildRoot, type MerkleError } from '../utils/merkle';
import { err, ok, type Result } from '../utils/result';
import { parseManifest, type EvidenceManifest, type ManifestFile } from './manifest';

// Everything here works on fingerprints already computed in the browser, so it is synchronous,
// deterministic and fully unit-tested. The only trusted input is the list of onchain roots.

/** SHA-256(salt ‖ bytes) of a chosen file for one salt published in a verified file list. */
export type SaltedDigest = { salt: Hex; commitment: Hex };

/**
 * A file the visitor chose, reduced to what the checks need. Its bytes never leave the browser.
 * `salted` holds its commitment for every public salt of the verified list (P8.2), so salted
 * entries can be matched without the checks needing the bytes.
 */
export type HashedFile = { name: string; sha256: Hex; salted?: readonly SaltedDigest[] };

export type ManifestProblem =
  | { kind: 'other-claim'; manifestClaimId: Hex }
  | { kind: 'unknown-root'; rootIndex: number }
  | { kind: 'invalid-hashes'; error: MerkleError }
  | { kind: 'manifest-mismatch'; rootIndex: number; computedRoot: Hex; onchainRoot: Hex };

/** Only obtainable from `checkManifest`: a file list proven to hash to an onchain root. */
export type VerifiedManifest = { manifest: EvidenceManifest; rootIndex: number; root: Hex };

export type ManifestCheck = Result<VerifiedManifest, ManifestProblem>;

/** A file list as received (published with the claim or loaded by the visitor), once examined. */
export type ManifestState =
  | { kind: 'none' }
  | { kind: 'invalid'; message: string }
  | { kind: 'checked'; check: ManifestCheck };

export type FileCheck =
  | {
      kind: 'match';
      file: HashedFile;
      visibility: 'public' | 'private';
      listedName: string | undefined;
      /** What was computed from the visitor's file: its SHA-256, or its commitment with the entry's salt. */
      computedFingerprint: Hex;
      /** The fingerprint the verified list holds for that entry; equal to `computedFingerprint`. */
      listedFingerprint: Hex;
    }
  | { kind: 'mismatch'; file: HashedFile; sameNameListed: boolean };

export type BundleCheck = {
  /** `incomplete`: fewer files than the verified list holds, so the root cannot be reproduced (not tampering). */
  kind: 'match' | 'mismatch' | 'incomplete';
  fileCount: number;
  /** How many files the verified list holds; `undefined` when no list was available to count them. */
  listedCount: number | undefined;
  computedRoot: Hex;
  onchainRoot: Hex;
};

const sameHex = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Accepts a file list only if the Merkle root of its fingerprints equals the root the contract
 * holds for that bundle. Anyone could publish a list; only this check makes it trustworthy.
 */
export function checkManifest(
  manifest: EvidenceManifest,
  claimId: Hex,
  onchainRoots: readonly Hex[],
): ManifestCheck {
  if (!sameHex(manifest.claimId, claimId)) {
    return err({ kind: 'other-claim', manifestClaimId: manifest.claimId });
  }
  const onchainRoot = onchainRoots[manifest.rootIndex];
  if (onchainRoot === undefined) {
    return err({ kind: 'unknown-root', rootIndex: manifest.rootIndex });
  }
  const computed = buildRoot(manifest.files.map((file) => file.sha256));
  if (!computed.ok) {
    return err({ kind: 'invalid-hashes', error: computed.error });
  }
  const check: ManifestCheck = sameHex(computed.value, onchainRoot)
    ? ok({ manifest, rootIndex: manifest.rootIndex, root: onchainRoot })
    : err({ kind: 'manifest-mismatch', rootIndex: manifest.rootIndex, computedRoot: computed.value, onchainRoot });
  return check;
}

/** Validates the shape of an untrusted file list, then proves it against the chain. */
export function examineManifest(raw: unknown, claimId: Hex, onchainRoots: readonly Hex[]): ManifestState {
  if (raw === undefined) {
    return { kind: 'none' };
  }
  const parsed = parseManifest(raw);
  const state: ManifestState = parsed.ok
    ? { kind: 'checked', check: checkManifest(parsed.value, claimId, onchainRoots) }
    : { kind: 'invalid', message: parsed.error };
  return state;
}

/** How many entries of a verified list are private: files only authorized reviewers can provide. */
export const privateFileCount = (verified: VerifiedManifest): number =>
  verified.manifest.files.filter((file) => !file.public).length;

/** The verified list, if this state holds one for bundle `rootIndex`. */
export function verifiedFor(state: ManifestState | undefined, rootIndex: number): VerifiedManifest | undefined {
  const verified = state?.kind === 'checked' && state.check.ok ? state.check.value : undefined;
  const result = verified?.rootIndex === rootIndex ? verified : undefined;
  return result;
}

/** Public salts of a file list: the only salts a visitor needs to re-hash files with. */
export function publicSalts(manifest: EvidenceManifest): Hex[] {
  const salts = manifest.files.flatMap((file) => (file.public && file.salt !== undefined ? [file.salt] : []));
  return salts;
}

/**
 * The value computed from `file` that equals `entry`'s fingerprint, or `undefined` when the entry
 * does not list it: its plain SHA-256 (unsalted, pre-P8.2 files), or SHA-256(salt ‖ file) when the
 * entry publishes a salt. A private salted entry publishes no salt, so it can never be matched
 * here; that is what keeps guessed files unconfirmable.
 */
function computedFor(entry: ManifestFile, file: HashedFile): Hex | undefined {
  const salt = entry.public ? entry.salt : undefined;
  const salted =
    salt === undefined
      ? undefined
      : (file.salted ?? []).find((digest) => sameHex(digest.salt, salt) && sameHex(digest.commitment, entry.sha256));
  const computed = sameHex(entry.sha256, file.sha256) ? file.sha256 : salted?.commitment;
  return computed;
}

const lists = (entry: ManifestFile, file: HashedFile): boolean => computedFor(entry, file) !== undefined;

/** The fingerprint this file has in the list (its salted commitment when salted), else its SHA-256. */
export function listedFingerprint(file: HashedFile, manifest: EvidenceManifest | undefined): Hex {
  const entry = manifest?.files.find((listed) => lists(listed, file));
  const fingerprint = entry === undefined ? file.sha256 : entry.sha256;
  return fingerprint;
}

/** Each chosen file matches when the verified list holds its SHA-256 or its salted commitment. */
export function checkFilesAgainstManifest(verified: VerifiedManifest, files: readonly HashedFile[]): FileCheck[] {
  const checks = files.map((file): FileCheck => {
    const entry = verified.manifest.files.find((listed) => lists(listed, file));
    const check: FileCheck =
      entry === undefined
        ? {
            kind: 'mismatch',
            file,
            sameNameListed: verified.manifest.files.some((listed) => listed.public && listed.name === file.name),
          }
        : {
            kind: 'match',
            file,
            visibility: entry.public ? 'public' : 'private',
            listedName: entry.public ? entry.name : undefined,
            computedFingerprint: computedFor(entry, file) ?? entry.sha256,
            listedFingerprint: entry.sha256,
          };
    return check;
  });
  return checks;
}

/**
 * Bundle mode, no file list needed: the visitor provides every file of a bundle and their Merkle
 * root must equal the onchain root. A missing, extra or changed file all give a mismatch. Salted
 * files (P8.2) need their salts: with a verified list, each file counts with its listed commitment;
 * without one, only unsalted bundles (recorded before P8.2) can match.
 */
export function checkBundle(
  files: readonly HashedFile[],
  onchainRoot: Hex,
  manifest?: EvidenceManifest,
): Result<BundleCheck, MerkleError> {
  const computed = buildRoot(files.map((file) => listedFingerprint(file, manifest)));
  if (!computed.ok) {
    return computed;
  }
  const listedCount = manifest?.files.length;
  const matches = sameHex(computed.value, onchainRoot);
  // Fewer files than the verified list holds can never reproduce the root: that is a shortfall to
  // report neutrally, not evidence that anything changed.
  const incomplete = !matches && listedCount !== undefined && files.length < listedCount;
  const check = ok<BundleCheck>({
    kind: matches ? 'match' : incomplete ? 'incomplete' : 'mismatch',
    fileCount: files.length,
    listedCount,
    computedRoot: computed.value,
    onchainRoot,
  });
  return check;
}
