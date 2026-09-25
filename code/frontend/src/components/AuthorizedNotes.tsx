// =============================================================================
// Proof of Aid — Team 05 — Reviewer view: each stored note next to the history event that anchored it
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { NoteKind, StoredNote } from '../data/evidenceApi';
import { matchNotes, type AnchoredNote } from '../evidence/noteCheck';
import type { TimelineEntry } from '../types/claim';
import { formatTimestamp } from '../utils/format';
import type { Result } from '../utils/result';
import { AddressText } from './AddressText';
import { HashDisplay } from './HashDisplay';
import { AlertTriangleIcon, ShieldCheckIcon } from './icons';
import { ActionSentence } from './Timeline';

export const NO_NOTES_NOTE = 'No notes have been recorded for this claim yet.';
export const NOTE_NOT_STORED =
  'No text is stored for this fingerprint: it was recorded before notes were kept (unsalted), or without the evidence service.';
export const NOTE_MATCHES = 'Matches the onchain fingerprint: this is exactly the note that was recorded.';
export const NOTE_MISMATCH = 'Does not match the onchain fingerprint: this text is not the note that was recorded.';

const KIND_LABELS: Record<NoteKind, string> = {
  justification: 'Justification',
  proof_request: 'Proof request',
  counter_evidence: 'Counter-evidence',
  resolution: 'Dispute resolution',
};

function NoteBody({ note }: { note: StoredNote }) {
  return (
    <>
      <p className="note-text">{note.text}</p>
      <p className="caption">
        {KIND_LABELS[note.kind]} by <AddressText address={note.author} />
      </p>
    </>
  );
}

function AnchoredNoteItem({ item }: { item: AnchoredNote }) {
  return (
    <li className="authorized-note">
      <ActionSentence entry={item.entry} />
      <p className="caption">
        {formatTimestamp(item.entry.timestamp)} · Note fingerprint <HashDisplay value={item.entry.noteHash} label="note fingerprint" />
      </p>
      {item.note === undefined ? (
        <p className="muted">{NOTE_NOT_STORED}</p>
      ) : (
        <>
          <NoteBody note={item.note} />
          {item.verdict === 'match' ? (
            <p className="verified-note">
              <ShieldCheckIcon size={16} className="verified-note__icon" />
              <span>{NOTE_MATCHES}</span>
            </p>
          ) : (
            <p className="notice">
              <AlertTriangleIcon size={16} className="notice__icon" />
              <span>{NOTE_MISMATCH}</span>
            </p>
          )}
        </>
      )}
    </li>
  );
}

type AuthorizedNotesProps = { timeline: readonly TimelineEntry[]; notes: Result<StoredNote[], string> };

/** Only rendered for a signed-in wallet; the backend already limited `notes` to what it may read. */
export function AuthorizedNotes({ timeline, notes }: AuthorizedNotesProps) {
  const matches = matchNotes(timeline, notes.ok ? notes.value : []);
  const empty = matches.anchored.length === 0 && matches.unanchored.length === 0;
  return (
    <section className="card authorized-evidence" aria-labelledby="authorized-notes-heading">
      <h2 id="authorized-notes-heading">Notes (authorized)</h2>
      <p className="muted">
        Justifications, proof requests, counter-evidence and dispute decisions are recorded on the blockchain as salted
        fingerprints. Their text is shown here only to the claim’s reviewers and to each note’s author, and checked in this
        browser against the recorded fingerprint.
      </p>
      {!notes.ok && (
        <p className="notice" role="alert">
          <AlertTriangleIcon size={16} className="notice__icon" />
          <span>The notes could not be read from the evidence service. {notes.error}</span>
        </p>
      )}
      {empty && notes.ok && <p className="muted">{NO_NOTES_NOTE}</p>}
      {matches.anchored.length > 0 && (
        <ol className="authorized-notes">
          {matches.anchored.map((item) => (
            <AnchoredNoteItem key={`${item.entry.txHash}-${item.entry.logIndex}`} item={item} />
          ))}
        </ol>
      )}
      {matches.unanchored.length > 0 && (
        <>
          <h3>Stored notes not found in the history</h3>
          <p className="caption">Their transaction may not have been sent, may have failed, or is not indexed yet.</p>
          <ul className="authorized-notes">
            {matches.unanchored.map((note) => (
              <li key={note.id} className="authorized-note">
                <NoteBody note={note} />
                <p className="caption">
                  Fingerprint <HashDisplay value={note.noteHash} label="note fingerprint" />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
