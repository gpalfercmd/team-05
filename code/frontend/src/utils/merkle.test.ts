// =============================================================================
// Proof of Aid — Team 05 — Tests: TypeScript Merkle recipe against the shared P1 vectors
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import vectors from '@shared/merkle-vectors.json';
import { hexToBytes, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { buildRoot, hashFile, leafFromFileHash, saltedSha256Hex, sha256Hex, verifyProof } from './merkle';

// The same file is checked by Solidity (MerkleVectors.t.sol) and Python (test_merkle.py): if this
// suite passes, the browser computes exactly the roots the contract and the backend compute.
const bytesOf = (hex: string): ArrayBuffer => hexToBytes(hex as Hex).slice().buffer;

describe('Merkle recipe vs code/shared/merkle-vectors.json', () => {
  it('covers every case listed in the vectors file', () => {
    expect(vectors.cases).toHaveLength(vectors.case_count);
  });

  describe.each(vectors.cases)('$name', (vectorCase) => {
    it('hashes every file to the expected SHA-256 and leaf', async () => {
      for (const file of vectorCase.files) {
        const fileHash = await sha256Hex(bytesOf(file.content_hex));
        expect(fileHash).toEqual({ ok: true, value: file.sha256 });
        expect(leafFromFileHash(file.sha256 as Hex)).toBe(file.leaf);
      }
    });

    it('builds the expected root from the file hashes, in the given order', () => {
      expect(buildRoot(vectorCase.files.map((file) => file.sha256))).toEqual({ ok: true, value: vectorCase.root });
    });

    it('builds the same root from the reversed order', () => {
      const reversed = vectorCase.files.map((file) => file.sha256).toReversed();
      expect(buildRoot(reversed)).toEqual({ ok: true, value: vectorCase.root });
    });

    it('verifies every published proof against the root', () => {
      for (const file of vectorCase.files) {
        expect(verifyProof(file.proof, vectorCase.root, file.leaf)).toBe(true);
      }
    });
  });

  it('rejects the tampered file: one flipped byte changes the hash, the leaf and the root', async () => {
    const { tamper } = vectors;
    const tamperedHash = await sha256Hex(bytesOf(tamper.tampered_content_hex));
    expect(tamperedHash).toEqual({ ok: true, value: tamper.tampered_sha256 });
    expect(leafFromFileHash(tamper.tampered_sha256 as Hex)).toBe(tamper.tampered_leaf);
    expect(verifyProof(tamper.proof, tamper.root, tamper.tampered_leaf)).toBe(tamper.must_verify);

    const tamperedCase = vectors.cases.find((vectorCase) => vectorCase.name === tamper.case);
    const hashes = tamperedCase?.files.map((file, index) =>
      index === tamper.file_index ? tamper.tampered_sha256 : file.sha256,
    );
    const root = buildRoot(hashes ?? []);
    expect(root.ok && root.value).not.toBe(tamper.root);
  });
});

describe('buildRoot input rules', () => {
  const [first, second] = vectors.cases.find((vectorCase) => vectorCase.name === 'two_files')?.files ?? [];
  const a = first?.sha256 ?? '';
  const b = second?.sha256 ?? '';

  it('rejects an empty bundle', () => {
    expect(buildRoot([])).toEqual({ ok: false, error: { kind: 'empty' } });
  });

  it('rejects the same file twice, whatever the hex case', () => {
    expect(buildRoot([a, b, a.toUpperCase().replace('0X', '0x')])).toEqual({
      ok: false,
      error: { kind: 'duplicate', fileHash: a },
    });
  });

  it('rejects values that are not 32-byte hex', () => {
    expect(buildRoot([a, '0x1234'])).toEqual({ ok: false, error: { kind: 'malformed-hash', value: '0x1234' } });
  });

  it('treats uppercase hex as the same bytes', () => {
    expect(buildRoot([a.toUpperCase().replace('0X', '0x'), b])).toEqual(buildRoot([a, b]));
  });

  it('refuses to verify a proof that contains a malformed value', () => {
    expect(verifyProof(['0x12'], a, b)).toBe(false);
  });
});

describe('hashFile', () => {
  it('hashes a browser File with WebCrypto', async () => {
    const receipt = vectors.cases[0]?.files[0];
    const file = new File([bytesOf(receipt?.content_hex ?? '0x')], 'receipt-001.txt');
    expect(await hashFile(file)).toEqual({ ok: true, value: receipt?.sha256 });
  });
});

describe('salted commitments vs merkle-vectors.json (P8.2)', () => {
  const { salted } = vectors;

  it('commits SHA-256(salt ‖ bytes) and feeds it to the unchanged recipe', async () => {
    for (const file of salted.files) {
      const commitment = await saltedSha256Hex(file.salt, bytesOf(file.content_hex));
      expect(commitment).toEqual({ ok: true, value: file.commitment });
      expect(leafFromFileHash(file.commitment as Hex)).toBe(file.leaf);
      expect(leafFromFileHash(file.sha256 as Hex)).not.toBe(file.leaf);
      expect(verifyProof(file.proof, salted.root, file.leaf)).toBe(true);
    }
    expect(buildRoot(salted.files.map((file) => file.commitment))).toEqual({ ok: true, value: salted.root });
  });

  it('refuses a salt that is not 32 bytes', async () => {
    const result = await saltedSha256Hex('0x1234', bytesOf('0x00'));
    expect(result.ok).toBe(false);
  });
});
