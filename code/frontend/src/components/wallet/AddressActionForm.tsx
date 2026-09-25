// =============================================================================
// Proof of Aid — Team 05 — One registry action on one or two wallet addresses (admin, authority)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState, type FormEvent } from 'react';
import type { Address, Hash } from 'viem';
import type { ContractCall } from '../../chain/calls';
import { parseAddressInput } from '../../chain/inputs';
import { useContractAction } from '../../hooks/useContractAction';
import { AddressField } from './fields';
import { TxButton } from './TxButton';
import { TxStatus } from './TxStatus';

export type AddressInputSpec = { label: string; hint?: string };

type AddressActionFormProps = {
  title: string;
  description: string;
  /** One entry per address the call takes, in argument order. */
  inputs: readonly AddressInputSpec[];
  submitLabel: string;
  variant?: 'primary' | 'danger';
  buildCall: (addresses: readonly Address[]) => ContractCall;
  /** 5 inside a claim panel, whose own heading is an h4. */
  level?: 4 | 5;
  onConfirmed?: (hash: Hash) => void;
};

export function AddressActionForm({
  title,
  description,
  inputs,
  submitLabel,
  variant = 'primary',
  buildCall,
  level = 4,
  onConfirmed,
}: AddressActionFormProps) {
  const Heading = level === 5 ? 'h5' : 'h4';
  const [values, setValues] = useState<string[]>(() => inputs.map(() => ''));
  const [errors, setErrors] = useState<(string | undefined)[]>([]);
  const action = useContractAction({
    onConfirmed: (hash) => {
      setValues(inputs.map(() => ''));
      onConfirmed?.(hash);
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const parsed = values.map(parseAddressInput);
    setErrors(parsed.map((result) => (result.ok ? undefined : result.error)));
    const addresses = parsed.flatMap((result) => (result.ok ? [result.value] : []));
    if (addresses.length === inputs.length) {
      void action.run(buildCall(addresses));
    }
  };

  return (
    <form className="action-form" onSubmit={onSubmit} noValidate aria-label={title}>
      <Heading>{title}</Heading>
      <p className="caption">{description}</p>
      {inputs.map((input, index) => (
        <AddressField
          key={input.label}
          label={input.label}
          {...(input.hint === undefined ? {} : { hint: input.hint })}
          value={values[index] ?? ''}
          error={errors[index]}
          disabled={action.busy}
          onChange={(value) => setValues((current) => current.map((item, position) => (position === index ? value : item)))}
        />
      ))}
      <div className="action-form__buttons">
        <TxButton type="submit" label={submitLabel} variant={variant} phase={action.phase} active busy={action.busy} />
      </div>
      <TxStatus phase={action.phase} />
    </form>
  );
}
