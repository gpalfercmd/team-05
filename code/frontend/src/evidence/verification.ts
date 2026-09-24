// =============================================================================
// Proof of Aid — Team 05 — Pure evidence checks: manifest vs onchain root, files, whole bundles
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { buildRoot, type MerkleError } from '../utils/merkle';
import { err, ok, type Result } from '../utils/result';
import { parseManifest, type EvidenceManifest } from './manifest';

// Everything here works on fingerprints already computed in the browser, so it is synchronous,
// deterministic and fully unit-tested. The only trusted input is the list of onchain roots.

/** A file the visitor chose, reduced to what the checks need. Its bytes never leave the browser. */
export type HashedFile = { name: string; sha256: Hex };

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
  | { kind: 'match'; file: HashedFile; visibility: 'public' | 'private'; listedName: string | undefined }
  | { kind: 'mismatch'; file: HashedFile; sameNameListed: boolean };

export type BundleCheck = {
  kind: 'match' | 'mismatch';
  fileCount: number;
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

/** The verified list, if this state holds one for bundle `rootIndex`. */
export function verifiedFor(state: ManifestState | undefined, rootIndex: number): VerifiedManifest | undefined {
  const verified = state?.kind === 'checked' && state.check.ok ? state.check.value : undefined;
  const result = verified?.rootIndex === rootIndex ? verified : undefined;
  return result;
}

/** Each chosen file matches when its SHA-256 is one of the fingerprints in the verified list. */
export function checkFilesAgainstManifest(verified: VerifiedManifest, files: readonly HashedFile[]): FileCheck[] {
  const checks = files.map((file): FileCheck => {
    const entry = verified.manifest.files.find((listed) => sameHex(listed.sha256, file.sha256));
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
          };
    return check;
  });
  return checks;
}

/**
 * Bundle mode, no file list needed: the visitor provides every file of a bundle and their Merkle
 * root must equal the onchain root. A missing, extra or changed file all give a mismatch.
 */
export function checkBundle(files: readonly HashedFile[], onchainRoot: Hex): Result<BundleCheck, MerkleError> {
  const computed = buildRoot(files.map((file) => file.sha256));
  if (!computed.ok) {
    return computed;
  }
  const check = ok<BundleCheck>({
    kind: sameHex(computed.value, onchainRoot) ? 'match' : 'mismatch',
    fileCount: files.length,
    computedRoot: computed.value,
    onchainRoot,
  });
  return check;
}
