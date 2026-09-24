// =============================================================================
// Proof of Aid — Team 05 — Tests: manifest vs chain, file checks and bundle mode
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import vectors from '@shared/merkle-vectors.json';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { EvidenceManifest } from './manifest';
import {
  checkBundle,
  checkFilesAgainstManifest,
  checkManifest,
  examineManifest,
  listedFingerprint,
  publicSalts,
  verifiedFor,
  type HashedFile,
} from './verification';

// Fingerprints and roots come from the shared vectors, so these tests also pin the real recipe.
const threeFiles = vectors.cases.find((vectorCase) => vectorCase.name === 'three_files');
if (threeFiles === undefined) {
  throw new Error('merkle-vectors.json must contain the three_files case.');
}
const [receipt, invoice, photo] = threeFiles.files.map((file) => ({ name: file.name, sha256: file.sha256 as Hex }));
if (receipt === undefined || invoice === undefined || photo === undefined) {
  throw new Error('three_files must hold three files.');
}
const ROOT = threeFiles.root as Hex;
const OTHER_ROOT = `0x${'ee'.repeat(32)}` as Hex;
const CLAIM_ID = `0x${'ab'.repeat(32)}` as Hex;
const TAMPERED: HashedFile = { name: receipt.name, sha256: vectors.tamper.tampered_sha256 as Hex };

const manifest: EvidenceManifest = {
  version: 1,
  claimId: CLAIM_ID,
  rootIndex: 1,
  files: [
    { sha256: receipt.sha256, public: true, name: receipt.name },
    { sha256: invoice.sha256, public: true },
    { sha256: photo.sha256, public: false },
  ],
};

function verified() {
  const check = checkManifest(manifest, CLAIM_ID, [OTHER_ROOT, ROOT]);
  if (!check.ok) {
    throw new Error('The sample manifest must verify.');
  }
  return check.value;
}

describe('checkManifest', () => {
  it('accepts a file list whose Merkle root equals the onchain root at its index', () => {
    expect(checkManifest(manifest, CLAIM_ID, [OTHER_ROOT, ROOT])).toEqual({
      ok: true,
      value: { manifest, rootIndex: 1, root: ROOT },
    });
  });

  it('reports manifest-mismatch when the list does not hash to the onchain root', () => {
    expect(checkManifest(manifest, CLAIM_ID, [ROOT, OTHER_ROOT])).toEqual({
      ok: false,
      error: { kind: 'manifest-mismatch', rootIndex: 1, computedRoot: ROOT, onchainRoot: OTHER_ROOT },
    });
  });

  it('reports manifest-mismatch when one fingerprint was swapped', () => {
    const altered = { ...manifest, files: [...manifest.files.slice(1), { sha256: TAMPERED.sha256, public: true as const }] };
    expect(checkManifest(altered, CLAIM_ID, [OTHER_ROOT, ROOT])).toMatchObject({
      ok: false,
      error: { kind: 'manifest-mismatch', onchainRoot: ROOT },
    });
  });

  it('refuses a file list written for another claim', () => {
    expect(checkManifest(manifest, OTHER_ROOT, [OTHER_ROOT, ROOT])).toEqual({
      ok: false,
      error: { kind: 'other-claim', manifestClaimId: CLAIM_ID },
    });
  });

  it('refuses a root index the contract does not have', () => {
    expect(checkManifest(manifest, CLAIM_ID, [ROOT])).toEqual({
      ok: false,
      error: { kind: 'unknown-root', rootIndex: 1 },
    });
  });

  it('compares the claim ID and roots regardless of hex case', () => {
    const upper = CLAIM_ID.toUpperCase().replace('0X', '0x') as Hex;
    expect(checkManifest(manifest, upper, [OTHER_ROOT, ROOT.toUpperCase().replace('0X', '0x') as Hex]).ok).toBe(true);
  });
});

describe('examineManifest (untrusted input)', () => {
  it('reports that no file list was published', () => {
    expect(examineManifest(undefined, CLAIM_ID, [ROOT])).toEqual({ kind: 'none' });
  });

  it('explains a file list with the wrong shape before touching the chain data', () => {
    expect(examineManifest({ files: 'receipt' }, CLAIM_ID, [ROOT])).toMatchObject({ kind: 'invalid' });
  });

  it('checks a well-formed list against the onchain roots and exposes it only for its bundle', () => {
    const state = examineManifest(manifest, CLAIM_ID, [OTHER_ROOT, ROOT]);
    expect(state).toMatchObject({ kind: 'checked', check: { ok: true } });
    expect(verifiedFor(state, 1)?.root).toBe(ROOT);
    expect(verifiedFor(state, 0)).toBeUndefined();
    expect(verifiedFor(examineManifest(manifest, CLAIM_ID, [ROOT, OTHER_ROOT]), 1)).toBeUndefined();
  });
});

describe('checkFilesAgainstManifest', () => {
  it('matches a listed public file and names it', () => {
    expect(checkFilesAgainstManifest(verified(), [receipt])).toEqual([
      { kind: 'match', file: receipt, visibility: 'public', listedName: receipt.name },
    ]);
  });

  it('matches a private file by fingerprint without revealing a name', () => {
    const upload = { name: 'my-copy.jpg', sha256: photo.sha256 };
    expect(checkFilesAgainstManifest(verified(), [upload])).toEqual([
      { kind: 'match', file: upload, visibility: 'private', listedName: undefined },
    ]);
  });

  it('flags a changed file, noting that a file with its name is listed', () => {
    expect(checkFilesAgainstManifest(verified(), [TAMPERED])).toEqual([
      { kind: 'mismatch', file: TAMPERED, sameNameListed: true },
    ]);
  });

  it('flags an unrelated file', () => {
    const unrelated = { name: 'holiday.png', sha256: OTHER_ROOT };
    expect(checkFilesAgainstManifest(verified(), [unrelated])).toEqual([
      { kind: 'mismatch', file: unrelated, sameNameListed: false },
    ]);
  });

  it('checks several files independently, in the order given', () => {
    const kinds = checkFilesAgainstManifest(verified(), [TAMPERED, invoice]).map((check) => check.kind);
    expect(kinds).toEqual(['mismatch', 'match']);
  });
});

describe('checkBundle (no file list needed)', () => {
  it('matches when every file of the bundle is provided, in any order', () => {
    expect(checkBundle([photo, receipt, invoice], ROOT)).toEqual({
      ok: true,
      value: { kind: 'match', fileCount: 3, computedRoot: ROOT, onchainRoot: ROOT },
    });
  });

  it('does not match when one file was changed', () => {
    expect(checkBundle([TAMPERED, invoice, photo], ROOT)).toMatchObject({ ok: true, value: { kind: 'mismatch' } });
  });

  it('does not match when a file is missing', () => {
    expect(checkBundle([receipt, invoice], ROOT)).toMatchObject({ ok: true, value: { kind: 'mismatch', fileCount: 2 } });
  });

  it('rejects an empty selection', () => {
    expect(checkBundle([], ROOT)).toEqual({ ok: false, error: { kind: 'empty' } });
  });

  it('rejects the same file added twice', () => {
    expect(checkBundle([receipt, { ...receipt, name: 'copy.txt' }], ROOT)).toEqual({
      ok: false,
      error: { kind: 'duplicate', fileHash: receipt.sha256 },
    });
  });
});

describe('salted fingerprints (P8.2, manifest version 2)', () => {
  // salted vectors: the same receipt and invoice, committed as SHA-256(salt ‖ bytes).
  const [saltedReceipt, saltedInvoice] = vectors.salted.files;
  if (saltedReceipt === undefined || saltedInvoice === undefined) {
    throw new Error('merkle-vectors.json must contain two salted files.');
  }
  const SALTED_ROOT = vectors.salted.root as Hex;
  const saltedManifest: EvidenceManifest = {
    version: 2,
    claimId: CLAIM_ID,
    rootIndex: 0,
    files: [
      { sha256: saltedReceipt.commitment as Hex, public: true, name: saltedReceipt.name, salt: saltedReceipt.salt as Hex },
      // Private: the salt is never published, so this entry cannot be matched from a guessed file.
      { sha256: saltedInvoice.commitment as Hex, public: false },
    ],
  };
  // What the hook computes for a dropped file: its SHA-256 plus its commitment for each public salt.
  const dropped = (file: typeof saltedReceipt, commitment: string): HashedFile => ({
    name: file.name,
    sha256: file.sha256 as Hex,
    salted: [{ salt: saltedReceipt.salt as Hex, commitment: commitment as Hex }],
  });
  const verifiedSalted = () => {
    const check = checkManifest(saltedManifest, CLAIM_ID, [SALTED_ROOT]);
    if (!check.ok) {
      throw new Error('The salted manifest must verify against the salted vector root.');
    }
    return check.value;
  };

  it('verifies a version 2 list against the root of its commitments', () => {
    expect(checkManifest(saltedManifest, CLAIM_ID, [SALTED_ROOT]).ok).toBe(true);
  });

  it('lists only the public salts', () => {
    expect(publicSalts(saltedManifest)).toEqual([saltedReceipt.salt]);
  });

  it('matches a public salted file through SHA-256(salt ‖ file)', () => {
    const file = dropped(saltedReceipt, saltedReceipt.commitment);
    expect(checkFilesAgainstManifest(verifiedSalted(), [file])).toEqual([
      { kind: 'match', file, visibility: 'public', listedName: saltedReceipt.name },
    ]);
    expect(listedFingerprint(file, saltedManifest)).toBe(saltedReceipt.commitment);
  });

  it('never matches a private salted file from a guessed copy', () => {
    // The visitor only has the public salt, so the guessed invoice cannot reach its commitment.
    const guess: HashedFile = { name: 'invoice.txt', sha256: saltedInvoice.sha256 as Hex, salted: [] };
    expect(checkFilesAgainstManifest(verifiedSalted(), [guess])).toEqual([
      { kind: 'mismatch', file: guess, sameNameListed: false },
    ]);
  });

  it('does not accept a commitment computed with a salt other than the listed one', () => {
    const file: HashedFile = {
      name: saltedReceipt.name,
      sha256: saltedReceipt.sha256 as Hex,
      salted: [{ salt: saltedInvoice.salt as Hex, commitment: saltedReceipt.commitment as Hex }],
    };
    expect(checkFilesAgainstManifest(verifiedSalted(), [file])[0]?.kind).toBe('mismatch');
  });

  it('still matches unsalted version 1 entries by plain SHA-256', () => {
    expect(listedFingerprint(receipt, manifest)).toBe(receipt.sha256);
    expect(checkFilesAgainstManifest(verified(), [{ ...receipt, salted: [] }])[0]?.kind).toBe('match');
  });

  it('checks a salted bundle with the listed commitments, and cannot without the list', () => {
    const receiptFile = dropped(saltedReceipt, saltedReceipt.commitment);
    const invoiceWithoutSalt: HashedFile = { name: saltedInvoice.name, sha256: saltedInvoice.sha256 as Hex };
    const onlyPublic = { ...saltedManifest, files: saltedManifest.files.slice(0, 1) };
    expect(checkBundle([receiptFile], saltedReceipt.leaf as Hex, onlyPublic)).toMatchObject({
      ok: true,
      value: { kind: 'match' },
    });
    expect(checkBundle([receiptFile, invoiceWithoutSalt], SALTED_ROOT)).toMatchObject({
      ok: true,
      value: { kind: 'mismatch' },
    });
  });
});
