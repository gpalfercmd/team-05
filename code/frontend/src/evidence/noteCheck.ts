// =============================================================================
// Proof of Aid — Team 05 — Stored notes next to the history events that anchored their fingerprints
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { StoredNote } from '../data/evidenceApi';
import type { TimelineEntry } from '../types/claim';
import { computeNoteHash } from '../utils/noteHash';

// The backend keeps note texts (P10.3) but is not trusted for them: a note counts only when
// keccak256(salt ‖ utf8(text)), recomputed here, equals the fingerprint the history event recorded.
// The history's fingerprints come from the chain (or the indexer, which mirrors its events).

export type NoteVerdict = 'match' | 'mismatch';

/** One history event that anchored a note fingerprint, with the stored note for it, if any. */
export type AnchoredNote = { entry: TimelineEntry & { noteHash: `0x${string}` }; note: StoredNote | undefined; verdict: NoteVerdict | undefined };

export type NoteMatches = {
  anchored: AnchoredNote[];
  /** Stored notes whose fingerprint is in no history event (transaction not sent or not yet indexed). */
  unanchored: StoredNote[];
};

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Whether the stored text and salt really give the fingerprint recorded onchain. */
export function verifyNote(note: StoredNote, recorded: string): NoteVerdict {
  const computed = computeNoteHash(note.salt, note.text);
  const verdict: NoteVerdict = computed.ok && same(computed.value, recorded) ? 'match' : 'mismatch';
  return verdict;
}

/** Pairs every note-carrying history event with the stored note of the same fingerprint. */
export function matchNotes(timeline: readonly TimelineEntry[], notes: readonly StoredNote[]): NoteMatches {
  const anchored = timeline.flatMap((entry): AnchoredNote[] => {
    const recorded = entry.noteHash;
    if (recorded === undefined) {
      return [];
    }
    const note = notes.find((item) => same(item.noteHash, recorded));
    return [{ entry: { ...entry, noteHash: recorded }, note, verdict: note === undefined ? undefined : verifyNote(note, recorded) }];
  });
  const unanchored = notes.filter((note) => !anchored.some((item) => same(item.entry.noteHash, note.noteHash)));
  const matches: NoteMatches = { anchored, unanchored };
  return matches;
}
