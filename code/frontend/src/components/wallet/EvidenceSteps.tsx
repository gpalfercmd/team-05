// =============================================================================
// Proof of Aid — Team 05 — Progress of a multi-step evidence action, and file inputs for it
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useId, useRef } from 'react';

export type StepSpec<K extends string> = { key: K; label: string };

type EvidenceStepsProps<K extends string> = {
  steps: readonly StepSpec<K>[];
  /** Steps already finished, in any order. */
  done: readonly K[];
  current: K | undefined;
  /** A failed step's message: announced, and focused so the user lands on it. */
  error: string | undefined;
};

export function EvidenceSteps<K extends string>({ steps, done, current, error }: EvidenceStepsProps<K>) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error !== undefined) {
      errorRef.current?.focus();
    }
  }, [error]);
  return (
    <>
      <ol className="evidence-steps">
        {steps.map((step) => {
          const state = done.includes(step.key) ? 'Done ✓' : current === step.key ? 'In progress…' : '';
          return (
            <li key={step.key} aria-current={current === step.key ? 'step' : undefined}>
              {step.label}
              {state !== '' && <span className="evidence-steps__state"> — {state}</span>}
            </li>
          );
        })}
      </ol>
      {error !== undefined && (
        <p ref={errorRef} tabIndex={-1} className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

type EvidenceFilesFieldProps = {
  files: readonly File[];
  onChange: (files: File[]) => void;
  isPublic: boolean;
  onPublicChange: (value: boolean) => void;
  error: string | undefined;
  disabled: boolean;
};

/** Files are private by default (spec F3): only a deliberate tick publishes them for re-checking. */
export function EvidenceFilesField({ files, onChange, isPublic, onPublicChange, error, disabled }: EvidenceFilesFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <>
      <div className="field">
        <label htmlFor={id}>Evidence files</label>
        <input
          id={id}
          type="file"
          multiple
          disabled={disabled}
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? hintId : `${hintId} ${errorId}`}
        />
        <p id={hintId} className="field__hint">
          {files.length === 0
            ? 'Up to 25 MB each. The evidence service strips photo metadata, then stores each file encrypted; only fingerprints go onchain.'
            : `${files.length} file${files.length === 1 ? '' : 's'} selected.`}
        </p>
        {error !== undefined && (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="field field--check">
        <input
          id={`${id}-public`}
          type="checkbox"
          checked={isPublic}
          disabled={disabled}
          onChange={(event) => onPublicChange(event.target.checked)}
        />
        <label htmlFor={`${id}-public`}>
          Make these files public, so anyone can download them and re-check them. Leave unticked for anything with
          personal data.
        </label>
      </div>
    </>
  );
}
