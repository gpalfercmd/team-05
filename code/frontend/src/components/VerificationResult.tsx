// =============================================================================
// Proof of Aid — Team 05 — VerificationResult: unmissable match / mismatch / private / altered panel
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { formatTimestamp } from '../utils/format';
import { HashDisplay } from './HashDisplay';
import { ICONS, type IconName } from './icons';
import './VerificationResult.css';

export type VerificationState = 'match' | 'mismatch' | 'private' | 'manifest-mismatch';

type HashRow = { label: string; value: Hex };

type VerificationResultProps = {
  state: VerificationState;
  /** What was checked: a file name, "2 files (complete bundle)", "Private file", "File list". */
  subject: string;
  /** Wording for several files checked together (bundle mode). */
  plural?: boolean | undefined;
  /** When the matching root was recorded onchain, for the "recorded on {date}" sentence. */
  recordedAt?: number | undefined;
  detail?: string | undefined;
  computed: HashRow;
  expected: HashRow;
};

// DESIGN.md sentences. Each state also has its own icon and a text label, so the verdict never
// depends on colour (colour-blind visitors, greyscale screenshots of the jury demo).
const STATE_META: Record<VerificationState, { icon: IconName; label: string }> = {
  match: { icon: 'shield-check', label: 'Match' },
  mismatch: { icon: 'x-octagon', label: 'No match' },
  private: { icon: 'lock', label: 'Private file' },
  'manifest-mismatch': { icon: 'alert-triangle', label: 'File list altered' },
};

function headline(state: VerificationState, plural: boolean, recordedAt: number | undefined): string {
  const when = recordedAt === undefined ? 'on the blockchain' : `on ${formatTimestamp(recordedAt)}`;
  const sentences: Record<VerificationState, string> = {
    match: plural ? `These files are exactly the ones recorded ${when}.` : `This file is exactly the one recorded ${when}.`,
    mismatch: plural
      ? 'These files do not match the recorded evidence. A file was changed, added or left out.'
      : 'This file does not match the recorded evidence. It was changed or is a different file.',
    private: 'This file is private to protect beneficiaries. Only its fingerprint is public.',
    'manifest-mismatch': 'This file list does not match what was recorded on the blockchain; it may have been altered.',
  };
  const sentence = sentences[state];
  return sentence;
}

export function VerificationResult({ state, subject, plural = false, recordedAt, detail, computed, expected }: VerificationResultProps) {
  const meta = STATE_META[state];
  const Icon = ICONS[meta.icon];
  return (
    <article className="verification-result" data-state={state}>
      <header className="verification-result__header">
        <Icon size={28} className="verification-result__icon" />
        <p className="verification-result__title">
          <span className="verification-result__label">{meta.label}</span>
          <span className="verification-result__subject">{subject}</span>
        </p>
      </header>
      <p className="verification-result__headline">{headline(state, plural, recordedAt)}</p>
      {detail !== undefined && <p className="verification-result__detail">{detail}</p>}
      <dl className="verification-result__hashes">
        <div>
          <dt>{computed.label}</dt>
          <dd>
            <HashDisplay value={computed.value} label={computed.label} />
          </dd>
        </div>
        <div>
          <dt>{expected.label}</dt>
          <dd>
            <HashDisplay value={expected.value} label={expected.label} />
          </dd>
        </div>
      </dl>
    </article>
  );
}
