// =============================================================================
// Proof of Aid — Team 05 — Salted note fingerprints: keccak256(salt ‖ utf8(text)) (P10.3)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { bytesToHex, concat, isHex, keccak256, stringToHex, type Hex } from 'viem';
import { err, ok, type Result } from './result';

// Second implementation of code/shared/note-vectors.json, next to Python (poa_shared.notes); a test
// runs every vector here too. Justifications, proof requests, counter-evidence and dispute
// resolutions are anchored as this fingerprint. The random salt is what stops anyone from
// confirming a short note ("approved") by hashing guesses; notes anchored before P10.3 were
// keccak256(utf8(text)) and stay that way.

export const NOTE_SALT_BYTES = 32;

/** A fresh random 32-byte salt from the browser's CSPRNG; never reused. */
export function randomNoteSalt(): Hex {
  const salt = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(NOTE_SALT_BYTES)));
  return salt;
}

const isSalt = (value: string): value is Hex => isHex(value, { strict: true }) && value.length === 2 + NOTE_SALT_BYTES * 2;

/** keccak256(salt ‖ utf8(text)); refuses a salt that is not 32 bytes and an empty text. */
export function computeNoteHash(salt: string, text: string): Result<Hex, string> {
  if (!isSalt(salt)) {
    return err('The note salt must be exactly 32 bytes of hex.');
  }
  const hash: Result<Hex, string> = text === '' ? err('The note is empty.') : ok(keccak256(concat([salt, stringToHex(text)])));
  return hash;
}

/** The unsalted fingerprint of notes anchored before P10.3 (a guess can confirm it). */
export const legacyNoteHash = (text: string): Hex => keccak256(stringToHex(text));
