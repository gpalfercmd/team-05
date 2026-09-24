// =============================================================================
// Proof of Aid — Team 05 — Timeline: the claim's history, one entry per transaction, oldest first
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { useAppConfig } from '../hooks/useAppConfig';
import type { ClaimSource, TimelineEntry } from '../types/claim';
import { explorerUrl } from '../utils/explorer';
import { formatTimestamp } from '../utils/format';
import { describeAction } from '../utils/timelineText';
import { AddressText } from './AddressText';
import { HashDisplay } from './HashDisplay';
import { StatusBadge } from './StatusBadge';
import './Timeline.css';

type TimelineProps = { entries: readonly TimelineEntry[]; source: ClaimSource };

const toIsoTime = (seconds: number): string => new Date(seconds * 1000).toISOString();

function ActionSentence({ entry }: { entry: TimelineEntry }) {
  const parts = describeAction(entry.action);
  return (
    <p className="timeline__sentence">
      {parts.map((part, index) =>
        typeof part === 'string' ? part : <AddressText key={`${part.address}-${index}`} address={part.address} />,
      )}
    </p>
  );
}

/** Where the data came from: trust needs a way to check it without trusting this page. */
export function SourceNote({ source }: { source: ClaimSource }) {
  const { chain, contracts } = useAppConfig();
  let note: ReactNode;
  if (source === 'demo' || contracts.mode === 'mock') {
    note = 'Demo data: sample records, not read from a blockchain.';
  } else {
    const href = explorerUrl(chain, 'address', contracts.claimRegistry);
    const explorerName = chain.blockExplorers?.default.name ?? 'block explorer';
    // Honest about the one part a server provided: with the indexer, only the history did.
    const origin =
      source === 'indexer'
        ? `History from the indexer API; status and evidence fingerprints read directly from the blockchain (${chain.name}).`
        : `Read directly from the blockchain (${chain.name}), without any server in between.`;
    note = (
      <>
        {origin}{' '}
        {href === undefined ? (
          <>
            Contract <HashDisplay value={contracts.claimRegistry} label="contract address" />
          </>
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer">
            View the contract on {explorerName}
          </a>
        )}
      </>
    );
  }
  return <p className="caption source-note">{note}</p>;
}

export function Timeline({ entries, source }: TimelineProps) {
  const txExplorer = source === 'demo' ? undefined : 'tx';
  return (
    <section className="card" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">History</h2>
      {entries.length === 0 ? (
        <p className="muted">No actions have been recorded for this claim yet.</p>
      ) : (
        <ol className="timeline">
          {entries.map((entry) => (
            <li key={`${entry.txHash}-${entry.logIndex}`} className="timeline__entry">
              {entry.newStatus !== undefined && <StatusBadge status={entry.newStatus} />}
              <ActionSentence entry={entry} />
              <p className="timeline__meta caption">
                <time dateTime={toIsoTime(entry.timestamp)}>{formatTimestamp(entry.timestamp)}</time>
                <span aria-hidden="true"> · </span>
                <span className="timeline__tx">
                  Transaction <HashDisplay value={entry.txHash} label="transaction" explorer={txExplorer} />
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}
      <SourceNote source={source} />
    </section>
  );
}
