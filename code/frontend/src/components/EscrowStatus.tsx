// =============================================================================
// Proof of Aid — Team 05 — Escrow card: deposits held for a claim, dispute window and settlement (P9)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { formatEther } from 'viem';
import type { EscrowState } from '../types/claim';
import { formatTimestamp } from '../utils/format';

type EscrowStatusProps = {
  escrow: EscrowState | undefined;
  /** Seconds since the epoch; defaults to the visitor's clock. */
  now?: number | undefined;
};

const nowInSeconds = (): number => Math.floor(Date.now() / 1000);

function DisputeWindow({ closesAt, now }: { closesAt: number; now: number }) {
  const open = now < closesAt;
  return (
    <div>
      <dt>Disputes</dt>
      <dd>{open ? `Disputes open until ${formatTimestamp(closesAt)}` : `Dispute window closed (${formatTimestamp(closesAt)})`}</dd>
    </div>
  );
}

/** The money side of a claim, from the contract views; nothing is shown when they were unavailable. */
export function EscrowStatus({ escrow, now }: EscrowStatusProps) {
  if (escrow === undefined) {
    return null;
  }
  return (
    <section className="card" aria-labelledby="escrow-heading">
      <h2 id="escrow-heading">Deposits</h2>
      <dl className="detail-list">
        <div>
          <dt>Held by the contract</dt>
          <dd>{formatEther(escrow.lockedWei)} ETH</dd>
        </div>
        {escrow.disputeWindowClosesAt !== undefined && (
          <DisputeWindow closesAt={escrow.disputeWindowClosesAt} now={now ?? nowInSeconds()} />
        )}
        {escrow.settled && (
          <div>
            <dt>Settlement</dt>
            <dd>Settled: the deposits were paid out.</dd>
          </div>
        )}
      </dl>
      <p className="caption">
        The organization and the approving auditor lock deposits that go to whoever proves the claim false in a dispute.
      </p>
    </section>
  );
}
