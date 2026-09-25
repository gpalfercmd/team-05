// =============================================================================
// Proof of Aid — Team 05 — Labelled form fields with hint and error linked by aria-describedby
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useId } from 'react';

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Shown instead of the hint and announced; marks the input invalid. */
  error?: string | undefined;
  disabled?: boolean;
};

function describedBy(hintId: string, errorId: string, hint: string | undefined, error: string | undefined): string | undefined {
  const ids = [hint === undefined ? undefined : hintId, error === undefined ? undefined : errorId].filter((id) => id !== undefined);
  const value = ids.length === 0 ? undefined : ids.join(' ');
  return value;
}

/** A wallet address: monospace, never autocorrected. */
export function AddressField({ label, value, onChange, hint, error, disabled = false }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        className="field__mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(hintId, errorId, hint, error)}
      />
      {hint !== undefined && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const NOTE_HINT =
  'Only a salted fingerprint of the note is recorded on the blockchain. With the evidence service the note is stored encrypted for the claim’s reviewers; without it you are shown the note and its salt to keep.';

/** A justification or request note; only its salted fingerprint goes onchain. */
export function NoteField({ label, value, onChange, hint = NOTE_HINT, error, disabled = false }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(hintId, errorId, hint, error)}
      />
      <p id={hintId} className="field__hint">
        {hint}
      </p>
      {error !== undefined && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
