// =============================================================================
// Proof of Aid — Team 05 — State of the "Verify it yourself" panel (hashing stays in the browser)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState } from 'react';
import { MAX_MANIFEST_BYTES, parseManifestText } from '../evidence/manifest';
import {
  checkBundle,
  checkFilesAgainstManifest,
  checkManifest,
  publicSalts,
  verifiedFor,
  type BundleCheck,
  type FileCheck,
  type HashedFile,
  type ManifestState,
  type SaltedDigest,
  type VerifiedManifest,
} from '../evidence/verification';
import type { ClaimView, EvidenceBundle } from '../types/claim';
import type { Hex } from 'viem';
import { merkleErrorMessage, readFileBytes, saltedSha256Hex, sha256Hex } from '../utils/merkle';
import { err, ok, type Result } from '../utils/result';

export type VerifierMode = 'files' | 'bundle';

export type CheckOutcome =
  | { kind: 'files'; bundle: EvidenceBundle; checks: FileCheck[] }
  | { kind: 'bundle'; bundle: EvidenceBundle; check: BundleCheck }
  | { kind: 'error'; message: string };

/** A file list the visitor loaded; unlike a published one, it always exists once loaded. */
export type LoadedManifest = { fileName: string; state: Exclude<ManifestState, { kind: 'none' }> };

/** SHA-256 of one file plus its commitment for every public salt of the verified list (P8.2). */
async function hashOne(file: File, salts: readonly Hex[]): Promise<Result<HashedFile, string>> {
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

// Files are read and hashed here with WebCrypto; nothing about them is sent anywhere.
async function hashFiles(files: readonly File[], salts: readonly Hex[]): Promise<Result<HashedFile[], string>> {
  const hashed = await Promise.all(files.map(async (file) => ({ name: file.name, digest: await hashOne(file, salts) })));
  const hashes: HashedFile[] = [];
  let failure: string | undefined;
  for (const { name, digest } of hashed) {
    if (digest.ok) {
      hashes.push(digest.value);
    } else {
      failure ??= `“${name}” could not be checked: ${digest.error}`;
    }
  }
  const result: Result<HashedFile[], string> = failure === undefined ? ok(hashes) : err(failure);
  return result;
}

async function readManifestText(file: File): Promise<Result<string, string>> {
  if (file.size > MAX_MANIFEST_BYTES) {
    return err('This file is too large to be a file list.');
  }
  let text: Result<string, string>;
  try {
    text = ok(await file.text());
  } catch {
    text = err('The file could not be read.');
  }
  return text;
}

function evaluate(
  hashed: Result<HashedFile[], string>,
  mode: VerifierMode,
  verified: VerifiedManifest | undefined,
  bundle: EvidenceBundle,
): CheckOutcome {
  if (!hashed.ok) {
    return { kind: 'error', message: hashed.error };
  }
  let outcome: CheckOutcome;
  if (mode === 'files' && verified !== undefined) {
    outcome = { kind: 'files', bundle, checks: checkFilesAgainstManifest(verified, hashed.value) };
  } else {
    const check = checkBundle(hashed.value, bundle.root, verified?.manifest);
    outcome = check.ok ? { kind: 'bundle', bundle, check: check.value } : { kind: 'error', message: merkleErrorMessage(check.error) };
  }
  return outcome;
}

const manifestRootIndex = (state: ManifestState): number | undefined =>
  state.kind !== 'checked'
    ? undefined
    : state.check.ok
      ? state.check.value.rootIndex
      : state.check.error.kind === 'manifest-mismatch'
        ? state.check.error.rootIndex
        : undefined;

export function useEvidenceVerifier(claim: ClaimView, published: ReadonlyMap<number, ManifestState>) {
  const [rootIndex, setRootIndex] = useState(0);
  const [chosenMode, setChosenMode] = useState<VerifierMode | undefined>(undefined);
  const [loadedManifest, setLoadedManifest] = useState<LoadedManifest | undefined>(undefined);
  const [outcome, setOutcome] = useState<CheckOutcome | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const bundle = claim.evidence[rootIndex];
  // A list the visitor loaded wins over the published one; either only counts once verified.
  const verified = verifiedFor(loadedManifest?.state, rootIndex) ?? verifiedFor(published.get(rootIndex), rootIndex);
  // Single-file checks need a verified list; without one, only whole-bundle checks are possible.
  const mode: VerifierMode = verified === undefined ? 'bundle' : (chosenMode ?? 'files');

  const selectBundle = (index: number) => {
    setRootIndex(index);
    setChosenMode(undefined);
    setOutcome(undefined);
  };

  const selectMode = (next: VerifierMode) => {
    setChosenMode(next);
    setOutcome(undefined);
  };

  const clearOutcome = () => {
    setOutcome(undefined);
  };

  const checkFiles = async (files: readonly File[]) => {
    if (bundle === undefined || files.length === 0) {
      return;
    }
    setBusy(true);
    const salts = verified === undefined ? [] : publicSalts(verified.manifest);
    setOutcome(evaluate(await hashFiles(files, salts), mode, verified, bundle));
    setBusy(false);
  };

  const loadManifest = async (files: readonly File[]) => {
    const [file] = files;
    if (file === undefined) {
      return;
    }
    const text = await readManifestText(file);
    const parsed = text.ok ? parseManifestText(text.value) : text;
    const roots = claim.evidence.map((item) => item.root);
    const state: LoadedManifest['state'] = parsed.ok
      ? { kind: 'checked', check: checkManifest(parsed.value, claim.claimId, roots) }
      : { kind: 'invalid', message: parsed.error };
    const index = manifestRootIndex(state);
    setLoadedManifest({ fileName: file.name, state });
    setRootIndex(index ?? rootIndex);
    setChosenMode(undefined);
    setOutcome(undefined);
  };

  return { bundle, rootIndex, mode, verified, loadedManifest, outcome, busy, selectBundle, selectMode, clearOutcome, checkFiles, loadManifest };
}
