// =============================================================================
// Proof of Aid — Team 05 — CopyButton: copies a full value, says "Copied" visibly and to screen readers
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useState } from 'react';
import { copyText } from '../utils/clipboard';
import { CopyIcon } from './icons';
// The feedback styles live with the hash component that introduced them.
import './HashDisplay.css';

type CopyButtonProps = {
  value: string;
  /** What the value is ("claim ID", "auditor address"); names the button "Copy {label}". */
  label: string;
};

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK: Record<CopyState, string> = { idle: '', copied: 'Copied', failed: 'Copy failed' };
const FEEDBACK_MS = 2000;

/** Icon button plus a live region; used by HashDisplay and AddressText (DESIGN.md: copy on every hash). */
export function CopyButton({ value, label }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  // The feedback is transient so the next copy is announced again by screen readers.
  useEffect(() => {
    if (copyState === 'idle') {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopyState('idle'), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const handleCopy = async () => {
    const result = await copyText(value);
    setCopyState(result.ok ? 'copied' : 'failed');
  };

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={() => void handleCopy()}
      >
        <CopyIcon size={14} />
      </button>
      <span className="hash__feedback caption" role="status" aria-live="polite">
        {COPY_FEEDBACK[copyState]}
      </span>
    </>
  );
}
