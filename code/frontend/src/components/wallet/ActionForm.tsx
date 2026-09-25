// =============================================================================
// Proof of Aid — Team 05 — A claim action form: optional salted note, one or more decision buttons
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState, type ReactNode } from 'react';
import type { Hash, Hex } from 'viem';
import type { ContractCall } from '../../chain/calls';
import { parseNoteInput } from '../../chain/inputs';
import type { NoteKind } from '../../data/evidenceApi';
import { useContractAction } from '../../hooks/useContractAction';
import { useNoteKeeper, type PreparedNote } from '../../hooks/useNoteKeeper';
import { NoteField } from './fields';
import { NoteReceipt } from './NoteReceipt';
import { TxButton } from './TxButton';
import { TxStatus } from './TxStatus';

export type ActionOption = {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  /** e.g. approve / reject; passed back to `buildCall`. */
  decision: boolean;
  /** Disabled with a reason, e.g. while the deposit amount is still being read. */
  disabled?: boolean;
};

/** The note an action carries: its field label, the claim, and what the backend files it as. */
export type ActionNote = { label: string; claimId: Hex; kind: NoteKind };

type ActionFormProps = {
  title: string;
  description: ReactNode;
  /** Omit for actions without a note (settle). */
  note?: ActionNote;
  options: readonly ActionOption[];
  /** `noteHash` is the salted fingerprint keccak256(salt ‖ utf8(text)) (P10.3). */
  buildCall: (decision: boolean, noteHash: Hex) => ContractCall;
  /** 5 inside a claim panel, whose own heading is an h4. */
  level?: 4 | 5;
  /** Lets the claim panel keep the confirmation (and the note's receipt) after this form disappears. */
  onConfirmed?: (hash: Hash, note: PreparedNote | undefined) => void;
};

// Settle carries no note; the contract call ignores this placeholder.
const NO_NOTE: Hex = '0x';

export function ActionForm({ title, description, note, options, buildCall, level = 4, onConfirmed }: ActionFormProps) {
  const Heading = level === 5 ? 'h5' : 'h4';
  const [text, setText] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [active, setActive] = useState<string | undefined>();
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | undefined>();
  // Kept for a retry with the same text, so a failed transaction does not store a second note.
  const [prepared, setPrepared] = useState<PreparedNote | undefined>();
  const keeper = useNoteKeeper();
  const action = useContractAction({
    onConfirmed: (hash) => {
      setText('');
      setPrepared(undefined);
      onConfirmed?.(hash, prepared);
    },
  });

  const prepareNote = async (current: ActionNote): Promise<PreparedNote | undefined> => {
    const parsed = parseNoteInput(text);
    setNoteError(parsed.ok ? undefined : parsed.error);
    if (!parsed.ok) {
      return undefined;
    }
    if (prepared?.text === parsed.value) {
      return prepared;
    }
    setPreparing(true);
    setPrepareError(undefined);
    const result = await keeper.prepare(current.claimId, current.kind, parsed.value);
    setPreparing(false);
    setPrepareError(result.ok ? undefined : result.error);
    setPrepared(result.ok ? result.value : undefined);
    const ready = result.ok ? result.value : undefined;
    return ready;
  };

  const submit = async (option: ActionOption): Promise<void> => {
    setActive(option.label);
    const ready = note === undefined ? undefined : await prepareNote(note);
    if (note === undefined || ready !== undefined) {
      await action.run(buildCall(option.decision, ready?.noteHash ?? NO_NOTE));
    }
  };

  return (
    <form className="action-form" aria-label={title} onSubmit={(event) => event.preventDefault()} noValidate>
      <Heading>{title}</Heading>
      <p className="caption">{description}</p>
      {note !== undefined && (
        <NoteField label={note.label} value={text} onChange={setText} error={noteError} disabled={action.busy || preparing} />
      )}
      <div className="action-form__buttons">
        {options.map((option) => (
          <TxButton
            key={option.label}
            label={option.label}
            variant={option.variant ?? 'primary'}
            phase={action.phase}
            active={active === option.label}
            busy={action.busy || preparing}
            disabled={option.disabled ?? false}
            onClick={() => void submit(option)}
          />
        ))}
      </div>
      {preparing && <p role="status">Storing your note with the evidence service (a signature may be asked for, not a transaction)…</p>}
      {prepareError !== undefined && (
        <p className="field-error" role="alert">
          {prepareError}
        </p>
      )}
      {prepared?.kept === 'nowhere' && action.phase.kind !== 'confirmed' && <NoteReceipt note={prepared} />}
      <TxStatus phase={action.phase} />
    </form>
  );
}
