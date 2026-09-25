// =============================================================================
// Proof of Aid — Team 05 — Salt a note, keep it with the evidence service, then anchor its fingerprint
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { storeNote, type NoteKind } from '../data/evidenceApi';
import { computeNoteHash, randomNoteSalt } from '../utils/noteHash';
import { err, ok, type Result } from '../utils/result';
import { useEvidenceService } from './useEvidenceService';

// P10.3: every note gets a fresh random salt in this browser, so its onchain fingerprint cannot be
// matched by hashing guesses. With the evidence service configured, text and salt are stored there
// (sealed with the claim key) before the transaction is sent; if storing fails, nothing is sent.
// Without it, or when the service has no record of the claim, the note is kept nowhere and the
// author is shown the text and salt to copy.

/** A note ready to anchor: `noteHash` is what the transaction records. */
export type PreparedNote = {
  text: string;
  salt: Hex;
  noteHash: Hex;
  /** `service`: stored with the evidence service; `nowhere`: only this page has it now. */
  kept: 'service' | 'nowhere';
};

export type NoteKeeper = {
  prepare: (claimId: Hex, kind: NoteKind, text: string) => Promise<Result<PreparedNote, string>>;
};

export function useNoteKeeper(): NoteKeeper {
  const service = useEvidenceService();
  const apiUrl = service.apiUrl;

  const prepare = async (claimId: Hex, kind: NoteKind, text: string): Promise<Result<PreparedNote, string>> => {
    const salt = randomNoteSalt();
    const noteHash = computeNoteHash(salt, text);
    if (!noteHash.ok) {
      return noteHash;
    }
    const unkept: PreparedNote = { text, salt, noteHash: noteHash.value, kept: 'nowhere' };
    if (apiUrl === undefined) {
      return ok(unkept);
    }
    const session = await service.ensureSession();
    if (!session.ok) {
      return err(`The note could not be stored, so nothing was sent. ${session.error}`);
    }
    const stored = await storeNote(service.fetch, apiUrl, claimId, { kind, text, salt, noteHash: noteHash.value });
    const prepared: Result<PreparedNote, string> = !stored.ok
      ? err(`The note could not be stored, so nothing was sent. ${stored.error}`)
      : ok(stored.value === 'stored' ? { ...unkept, kept: 'service' } : unkept);
    return prepared;
  };

  const keeper: NoteKeeper = { prepare };
  return keeper;
}
