// =============================================================================
// Proof of Aid — Team 05 — HashDisplay: truncated monospace hash with copy and explorer link
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useState } from 'react';
import { useAppConfig } from '../hooks/useAppConfig';
import { copyText } from '../utils/clipboard';
import { explorerUrl, type ExplorerKind } from '../utils/explorer';
import { truncateMiddle } from '../utils/format';
import { CopyIcon, ExternalLinkIcon } from './icons';
import './HashDisplay.css';

type HashDisplayProps = {
  value: string;
  /** What the value is ("claim ID", "evidence fingerprint"); names the copy button and link. */
  label: string;
  /** Adds a block-explorer link when the value is an address or a transaction hash. */
  explorer?: ExplorerKind | undefined;
};

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK: Record<CopyState, string> = { idle: '', copied: 'Copied', failed: 'Copy failed' };
const FEEDBACK_MS = 2000;

export function HashDisplay({ value, label, explorer }: HashDisplayProps) {
  const { chain } = useAppConfig();
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const href = explorer === undefined ? undefined : explorerUrl(chain, explorer, value);
  const explorerName = chain.blockExplorers?.default.name ?? 'block explorer';

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
    <span className="hash" title={value}>
      <code className="hash__value">{truncateMiddle(value)}</code>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={() => void handleCopy()}
      >
        <CopyIcon size={14} />
      </button>
      {href !== undefined && (
        <a
          className="icon-button"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${label} on ${explorerName}`}
          title={`View on ${explorerName}`}
        >
          <ExternalLinkIcon size={14} />
        </a>
      )}
      <span className="hash__feedback caption" role="status">
        {COPY_FEEDBACK[copyState]}
      </span>
    </span>
  );
}
