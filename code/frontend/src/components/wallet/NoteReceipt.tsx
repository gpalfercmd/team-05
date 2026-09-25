// =============================================================================
// Proof of Aid — Team 05 — Where a just-anchored note is kept, and its text and salt when nowhere
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState } from 'react';
import type { PreparedNote } from '../../hooks/useNoteKeeper';
import { copyText } from '../../utils/clipboard';
import { HashDisplay } from '../HashDisplay';

export const NOTE_KEPT_MESSAGE =
  'Your note is stored encrypted with the evidence service. The organization, its internal verifiers and the assigned auditor can read it and check it against the recorded fingerprint.';
export const NOTE_NOT_KEPT_MESSAGE =
  'Your note is not kept anywhere: only its salted fingerprint is recorded. To prove the note later, copy the text and the salt below and keep them.';

/** Shown with a confirmed (or pending) action that carried a note. */
export function NoteReceipt({ note }: { note: PreparedNote }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (): Promise<void> => {
    const result = await copyText(JSON.stringify({ text: note.text, salt: note.salt, noteHash: note.noteHash }, null, 2));
    setCopied(result.ok ? 'copied' : 'failed');
  };
  const receipt =
    note.kept === 'service' ? (
      <p className="caption">{NOTE_KEPT_MESSAGE}</p>
    ) : (
      <div className="notice notice--stack" role="note">
        <p>{NOTE_NOT_KEPT_MESSAGE}</p>
        <p className="note-text">{note.text}</p>
        <p className="caption">
          Salt <HashDisplay value={note.salt} label="note salt" /> · Fingerprint <HashDisplay value={note.noteHash} label="note fingerprint" />
        </p>
        <p>
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
            Copy note and salt
          </button>{' '}
          <span aria-live="polite" className="caption">
            {copied === 'copied' ? 'Copied.' : copied === 'failed' ? 'Copy failed: select the text above instead.' : ''}
          </span>
        </p>
      </div>
    );
  return receipt;
}
