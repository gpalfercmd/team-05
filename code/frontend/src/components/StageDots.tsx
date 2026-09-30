// =============================================================================
// Proof of Aid — Team 05 — StageDots: a four-segment bar showing how far a claim got, with the count as text
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { CSSProperties } from 'react';
import { stageProgress } from '../data/stages';
import type { RecordedClaimStatus } from '../utils/claimStatus';
import './StageDots.css';

const TOTAL = 4;
const STEP_NAMES = ['Recorded', 'Internal review', 'Auditor', 'Verified'] as const;

/** Progress from the status alone (cards hold no history); the text says what the bar shows. */
export function StageDots({ status }: { status: RecordedClaimStatus }) {
  const done = stageProgress(status);
  return (
    <div className="stage-dots">
      <div className="stage-dots__bar" role="img" aria-label={`${done} of ${TOTAL} steps done`}>
        {STEP_NAMES.map((name, index) => (
          <span key={name} className="stage-dots__seg" data-done={index < done} style={{ '--seg': index } as CSSProperties} />
        ))}
      </div>
      <p className="stage-dots__caption caption" aria-hidden="true">
        {STEP_NAMES[Math.min(done, TOTAL) - 1]}
        {done < TOTAL ? ` · next: ${STEP_NAMES[done]}` : ''}
      </p>
    </div>
  );
}
