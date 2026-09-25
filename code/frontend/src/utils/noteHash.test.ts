// =============================================================================
// Proof of Aid — Team 05 — Tests: browser note fingerprints reproduce the shared Python vectors
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import vectors from '@shared/note-vectors.json';
import { concat, stringToHex, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { computeNoteHash, legacyNoteHash, randomNoteSalt } from './noteHash';

describe('note fingerprint (code/shared/note-vectors.json)', () => {
  it.each(vectors.cases.map((entry) => [entry.name, entry] as const))('reproduces the %s case byte for byte', (_name, entry) => {
    expect(concat([entry.salt as `0x${string}`, stringToHex(entry.text)])).toBe(entry.preimage_hex);
    expect(computeNoteHash(entry.salt, entry.text)).toEqual({ ok: true, value: entry.note_hash });
    expect(legacyNoteHash(entry.text)).toBe(entry.legacy_hash);
  });

  it.each(vectors.invalid.map((entry) => [entry.name, entry] as const))('rejects the %s case', (_name, entry) => {
    expect(computeNoteHash(entry.salt, entry.text).ok).toBe(false);
  });

  it('draws a fresh 32-byte salt every time', () => {
    const first = randomNoteSalt();
    expect(first).toMatch(/^0x[0-9a-f]{64}$/);
    expect(randomNoteSalt()).not.toBe(first);
    expect(toHex(new Uint8Array(32))).not.toBe(first);
  });
});
