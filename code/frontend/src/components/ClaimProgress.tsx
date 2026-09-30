// =============================================================================
// Proof of Aid — Team 05 — ClaimProgress: the five-step path of a claim as a stepper, from the data the page already read
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { CSSProperties } from 'react';
import { claimStages, type Stage, type StageState } from '../data/stages';
import { summarizeVerification, type VerificationSummary } from '../data/summary';
import type { ClaimView } from '../types/claim';
import { formatTimestamp } from '../utils/format';
import { Reveal } from './Reveal';
import './ClaimProgress.css';

const STATE_TEXT: Record<StageState, string> = {
  done: 'Done',
  current: 'Waiting here',
  pending: 'Not reached yet',
  stopped: 'Stopped here',
  skipped: 'Not reached',
};

/** When each step happened, only where the claim's own data says so. */
function stageDetail(stage: Stage, claim: ClaimView, summary: VerificationSummary): string | undefined {
  let detail: string | undefined;
  switch (stage.id) {
    case 'anchored':
      detail = formatTimestamp(claim.anchoredAt);
      break;
    case 'internal':
      detail = summary.checkpoint1 === undefined ? undefined : formatTimestamp(summary.checkpoint1.at);
      break;
    case 'auditor':
      detail = summary.auditor === undefined ? undefined : formatTimestamp(summary.auditor.at);
      break;
    case 'verified':
      detail = summary.finalAttestation === undefined ? undefined : formatTimestamp(summary.finalAttestation.at);
      break;
    case 'window': {
      const closes = claim.escrow?.disputeWindowClosesAt;
      if (claim.escrow?.settled === true) {
        detail = 'Deposits released';
      } else if (summary.dispute.state === 'open') {
        detail = 'A dispute is open';
      } else if (closes !== undefined && stage.state !== 'skipped') {
        detail = `Closes ${formatTimestamp(closes)}`;
      }
      break;
    }
  }
  return detail;
}

function Marker({ state, index }: { state: StageState; index: number }) {
  let mark: string | number = index + 1;
  if (state === 'done') {
    mark = '✓';
  } else if (state === 'stopped') {
    mark = '✕';
  } else if (state === 'skipped') {
    mark = '–';
  }
  return (
    <span className="stepper__marker" aria-hidden="true">
      {mark}
    </span>
  );
}

/** Where the claim stands and what comes next: text says the state, so colour and shape only support it. */
export function ClaimProgress({ claim }: { claim: ClaimView }) {
  const summary = summarizeVerification(claim.timeline);
  const stages = claimStages(claim.status, summary, claim.escrow);
  return (
    <Reveal as="section" className="card claim-progress" >
      <p className="eyebrow">Where this claim is</p>
      <ol className="stepper" aria-label="Claim progress">
        {stages.map((stage, index) => {
          const detail = stageDetail(stage, claim, summary);
          return (
            <li
              key={stage.id}
              className="stepper__step"
              data-state={stage.state}
              aria-current={stage.state === 'current' ? 'step' : undefined}
              style={{ '--step': index } as CSSProperties}
            >
              <Marker state={stage.state} index={index} />
              <span className="stepper__label">{stage.label}</span>
              <span className="stepper__state">{STATE_TEXT[stage.state]}</span>
              {detail !== undefined && <span className="stepper__detail caption">{detail}</span>}
            </li>
          );
        })}
      </ol>
    </Reveal>
  );
}
