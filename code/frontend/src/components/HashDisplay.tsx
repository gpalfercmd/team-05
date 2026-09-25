// =============================================================================
// Proof of Aid — Team 05 — HashDisplay: truncated monospace hash with copy and explorer link
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useAppConfig } from '../hooks/useAppConfig';
import { explorerUrl, type ExplorerKind } from '../utils/explorer';
import { truncateMiddle } from '../utils/format';
import { CopyButton } from './CopyButton';
import { ExternalLinkIcon } from './icons';
import './HashDisplay.css';

type HashDisplayProps = {
  value: string;
  /** What the value is ("claim ID", "evidence fingerprint"); names the copy button and link. */
  label: string;
  /** Adds a block-explorer link when the value is an address or a transaction hash. */
  explorer?: ExplorerKind | undefined;
};

export function HashDisplay({ value, label, explorer }: HashDisplayProps) {
  const { chain } = useAppConfig();
  const href = explorer === undefined ? undefined : explorerUrl(chain, explorer, value);
  const explorerName = chain.blockExplorers?.default.name ?? 'block explorer';

  return (
    <span className="hash" title={value}>
      <code className="hash__value">{truncateMiddle(value)}</code>
      <CopyButton value={value} label={label} />
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
    </span>
  );
}
