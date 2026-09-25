// =============================================================================
// Proof of Aid — Team 05 — Live status line of a transaction, with its explorer link
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useRef } from 'react';
import type { TxPhase } from '../../chain/txPhase';
import { useAppConfig } from '../../hooks/useAppConfig';
import { HashDisplay } from '../HashDisplay';

type TxStatusProps = { phase: TxPhase };

/**
 * Always rendered, so screen readers hear every change. When the transaction ends (done or
 * failed) focus moves here, so a keyboard user lands on the outcome instead of a disabled button.
 */
export function TxStatus({ phase }: TxStatusProps) {
  const { chain } = useAppConfig();
  const ref = useRef<HTMLDivElement>(null);
  const finished = phase.kind === 'confirmed' || phase.kind === 'failed';

  useEffect(() => {
    if (finished) {
      ref.current?.focus();
    }
  }, [finished, phase]);

  let message = '';
  switch (phase.kind) {
    case 'checking':
      message = 'Checking the action against the contract rules…';
      break;
    case 'wallet':
      message = 'Confirm the transaction in your wallet…';
      break;
    case 'confirming':
      message = `Recording on ${chain.name}…`;
      break;
    case 'confirmed':
      message = `Done ✓ Recorded on ${chain.name}.`;
      break;
    case 'failed':
      message = phase.message;
      break;
    case 'idle':
      break;
  }
  const hash = phase.kind === 'confirming' || phase.kind === 'confirmed' || phase.kind === 'failed' ? phase.hash : undefined;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={`tx-status tx-status--${phase.kind}`}
      role={phase.kind === 'failed' ? 'alert' : 'status'}
    >
      {message !== '' && <span>{message}</span>}
      {hash !== undefined && (
        <span className="tx-status__hash">
          Transaction <HashDisplay value={hash} label="transaction" explorer="tx" />
        </span>
      )}
    </div>
  );
}
