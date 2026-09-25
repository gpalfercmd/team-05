// =============================================================================
// Proof of Aid — Team 05 — A claim action form: optional note, one or more decision buttons
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState, type ReactNode } from 'react';
import type { Hash, Hex } from 'viem';
import type { ContractCall } from '../../chain/calls';
import { parseNoteInput } from '../../chain/inputs';
import { useContractAction } from '../../hooks/useContractAction';
import { NoteField } from './fields';
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

type ActionFormProps = {
  title: string;
  description: ReactNode;
  /** Omit for actions without a note (settle). */
  noteLabel?: string;
  options: readonly ActionOption[];
  buildCall: (decision: boolean, note: Hex) => ContractCall;
  /** 5 inside a claim panel, whose own heading is an h4. */
  level?: 4 | 5;
  /** Lets the claim panel keep the confirmation after this form disappears with the old stage. */
  onConfirmed?: (hash: Hash) => void;
};

// Settle carries no note; the contract call ignores this placeholder.
const NO_NOTE: Hex = '0x';

export function ActionForm({ title, description, noteLabel, options, buildCall, level = 4, onConfirmed }: ActionFormProps) {
  const Heading = level === 5 ? 'h5' : 'h4';
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [active, setActive] = useState<string | undefined>();
  const action = useContractAction({
    onConfirmed: (hash) => {
      setNote('');
      onConfirmed?.(hash);
    },
  });

  const submit = (option: ActionOption): void => {
    const parsed = noteLabel === undefined ? { ok: true as const, value: NO_NOTE } : parseNoteInput(note);
    setNoteError(parsed.ok ? undefined : parsed.error);
    setActive(option.label);
    if (parsed.ok) {
      void action.run(buildCall(option.decision, parsed.value));
    }
  };

  return (
    <form className="action-form" aria-label={title} onSubmit={(event) => event.preventDefault()} noValidate>
      <Heading>{title}</Heading>
      <p className="caption">{description}</p>
      {noteLabel !== undefined && (
        <NoteField label={noteLabel} value={note} onChange={setNote} error={noteError} disabled={action.busy} />
      )}
      <div className="action-form__buttons">
        {options.map((option) => (
          <TxButton
            key={option.label}
            label={option.label}
            variant={option.variant ?? 'primary'}
            phase={action.phase}
            active={active === option.label}
            busy={action.busy}
            disabled={option.disabled ?? false}
            onClick={() => submit(option)}
          />
        ))}
      </div>
      <TxStatus phase={action.phase} />
    </form>
  );
}
