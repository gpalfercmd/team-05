// =============================================================================
// Proof of Aid — Team 05 — Tests: stored notes checked against the fingerprints in the history (P10.3)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { StoredNote } from '../data/evidenceApi';
import { WALLETS } from '../test/stubRegistryNode';
import type { TimelineEntry } from '../types/claim';
import { computeNoteHash, legacyNoteHash } from '../utils/noteHash';
import { matchNotes } from './noteCheck';

const SALT: Hex = `0x${'42'.repeat(32)}`;
const hashOf = (text: string): Hex => {
  const hashed = computeNoteHash(SALT, text);
  if (!hashed.ok) throw new Error(hashed.error);
  return hashed.value;
};

const entry = (logIndex: number, noteHash?: Hex): TimelineEntry => ({
  txHash: `0x${String(logIndex).padStart(2, '0').repeat(32)}`,
  blockNumber: 1n,
  logIndex,
  timestamp: 1_790_000_000,
  newStatus: undefined,
  action: { kind: 'internal-attestation', verifier: WALLETS.verifier1, approved: true },
  ...(noteHash === undefined ? {} : { noteHash }),
});

const note = (text: string, noteHash: Hex = hashOf(text)): StoredNote => ({
  id: text,
  kind: 'justification',
  author: WALLETS.verifier1,
  noteHash,
  text,
  salt: SALT,
  createdAt: '2026-09-25T08:00:00Z',
});

describe('matchNotes', () => {
  it('pairs each note with its event and verifies the salted fingerprint', () => {
    const matches = matchNotes([entry(1), entry(2, hashOf('approved'))], [note('approved')]);
    expect(matches.anchored).toHaveLength(1);
    expect(matches.anchored[0]?.verdict).toBe('match');
    expect(matches.unanchored).toEqual([]);
  });

  it('flags a stored text that does not give the recorded fingerprint', () => {
    const recorded = hashOf('approved');
    const matches = matchNotes([entry(2, recorded)], [note('rejected', recorded)]);
    expect(matches.anchored[0]?.verdict).toBe('mismatch');
  });

  it('keeps events without a stored note (e.g. old unsalted notes) and lists stored notes not in the history', () => {
    const matches = matchNotes([entry(3, legacyNoteHash('approved'))], [note('never sent')]);
    expect(matches.anchored[0]).toMatchObject({ note: undefined, verdict: undefined });
    expect(matches.unanchored.map((item) => item.text)).toEqual(['never sent']);
  });
});
