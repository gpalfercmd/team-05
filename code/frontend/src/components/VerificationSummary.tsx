// =============================================================================
// Proof of Aid — Team 05 — Verification summary card: checkpoints, auditor and dispute at a glance
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { summarizeVerification, type DisputeSummary, type VerificationSummary as Summary } from '../data/summary';
import type { ClaimView } from '../types/claim';
import { formatTimestamp } from '../utils/format';
import { AddressText } from './AddressText';
import './VerificationSummary.css';

type VerificationSummaryProps = { claim: ClaimView };

type SummaryItem = { term: string; description: ReactNode };

function checkpoint1Text(summary: Summary): ReactNode {
  const { checkpoint1 } = summary;
  const text =
    checkpoint1 === undefined ? (
      'Not done yet.'
    ) : (
      <>
        {checkpoint1.approved ? 'Approved' : 'Rejected'} by internal verifier <AddressText address={checkpoint1.by} /> on{' '}
        {formatTimestamp(checkpoint1.at)}.
      </>
    );
  return text;
}

function auditorText(summary: Summary): ReactNode {
  const { auditor, proofRequests } = summary;
  const requests = proofRequests === 0 ? '' : ` More proof requested ${proofRequests === 1 ? 'once' : `${proofRequests} times`}.`;
  const text =
    auditor === undefined ? (
      'Not assigned yet. The Accreditation Authority assigns an independent auditor after the internal check.'
    ) : (
      <>
        <AddressText address={auditor.by} />, assigned by the Accreditation Authority on {formatTimestamp(auditor.at)}.
        {requests}
      </>
    );
  return text;
}

function finalText(summary: Summary): ReactNode {
  const { finalAttestation, checkpoint1 } = summary;
  let text: ReactNode;
  if (finalAttestation !== undefined) {
    text = (
      <>
        {finalAttestation.approved ? 'Approved' : 'Rejected'} by auditor <AddressText address={finalAttestation.by} /> on{' '}
        {formatTimestamp(finalAttestation.at)}.
      </>
    );
  } else if (checkpoint1?.approved === false) {
    text = 'Not needed: the claim was rejected at the internal check.';
  } else {
    text = 'Pending.';
  }
  return text;
}

function disputeText(dispute: DisputeSummary): ReactNode {
  let text: ReactNode;
  switch (dispute.state) {
    case 'none':
      text = 'No dispute has been opened.';
      break;
    case 'open':
      text = (
        <>
          Open: <AddressText address={dispute.opened.by} /> disputed the claim on {formatTimestamp(dispute.opened.at)}. The
          Accreditation Authority will decide.
        </>
      );
      break;
    case 'resolved':
      text = (
        <>
          {dispute.resolved.upheld ? 'Upheld, so the claim was rejected' : 'Dismissed, so the claim stays verified'} (decided on{' '}
          {formatTimestamp(dispute.resolved.at)}). Opened by <AddressText address={dispute.opened.by} /> on{' '}
          {formatTimestamp(dispute.opened.at)}.
        </>
      );
      break;
  }
  return text;
}

/** The four facts a visitor looks for first, derived from the same events as the timeline. */
export function VerificationSummary({ claim }: VerificationSummaryProps) {
  const summary = summarizeVerification(claim.timeline);
  const items: SummaryItem[] = [
    { term: 'Internal check (checkpoint 1)', description: checkpoint1Text(summary) },
    { term: 'Independent auditor', description: auditorText(summary) },
    { term: 'Final decision (checkpoint 2)', description: finalText(summary) },
    { term: 'Dispute', description: disputeText(summary.dispute) },
  ];
  return (
    <section className="card" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Verification checks</h2>
      <dl className="summary-grid">
        {items.map((item) => (
          <div key={item.term} className="summary-grid__item">
            <dt>{item.term}</dt>
            <dd>{item.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
