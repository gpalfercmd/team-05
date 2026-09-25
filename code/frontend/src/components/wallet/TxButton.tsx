// =============================================================================
// Proof of Aid — Team 05 — TxButton: a button that reflects the transaction it started
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { busyLabel, type TxPhase } from '../../chain/txPhase';

type TxButtonProps = {
  label: string;
  phase: TxPhase;
  /** True for the button that started the current transaction; it shows the lifecycle label. */
  active: boolean;
  /** Any transaction in flight disables every button of the form. */
  busy: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  onClick?: () => void;
};

export function TxButton({ label, phase, active, busy, disabled = false, variant = 'primary', type = 'button', onClick }: TxButtonProps) {
  const pending = active && busy ? busyLabel(phase) : undefined;
  return (
    <button type={type} className={`btn btn-${variant}`} disabled={busy || disabled} aria-busy={active && busy} onClick={onClick}>
      {pending ?? label}
    </button>
  );
}
