// =============================================================================
// Proof of Aid — Team 05 — VerificationResult: unmissable match / mismatch / private / altered panel
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { formatTimestamp } from '../utils/format';
import { MISMATCH_MEANING, MISMATCH_NEXT_STEPS } from '../evidence/labels';
import { HashDisplay } from './HashDisplay';
import { ICONS, type IconName } from './icons';
import './VerificationResult.css';

export type VerificationState = 'match' | 'mismatch' | 'incomplete' | 'private' | 'manifest-mismatch';

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
  /** The fingerprint computed from what the visitor provided. */
  computed: HashRow;
  /** What it is compared with, like with like; omitted when nothing listed can be compared. */
  expected?: HashRow | undefined;
  /** The anchored bundle root the file list matches: the link in the chain, never the compared value. */
  chainRoot?: Hex | undefined;
  /** Mismatch help steps; defaults to all of them. */
  nextSteps?: readonly string[] | undefined;
};

// DESIGN.md sentences. Each state also has its own icon and a text label, so the verdict never
// depends on colour (colour-blind visitors, greyscale screenshots of the jury demo).
const STATE_META: Record<VerificationState, { icon: IconName; label: string }> = {
  match: { icon: 'shield-check', label: 'Match' },
  mismatch: { icon: 'x-octagon', label: 'No match' },
  incomplete: { icon: 'help-circle', label: 'Incomplete' },
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
    incomplete: 'Fewer files were added than the list holds, so the bundle cannot be confirmed. Nothing suggests a file was changed.',
    private: 'This file is private to protect beneficiaries. Only its fingerprint is public.',
    'manifest-mismatch': 'This file list does not match what was recorded on the blockchain; it may have been altered.',
  };
  const sentence = sentences[state];
  return sentence;
}

function MismatchHelp({ plural, steps }: { plural: boolean; steps: readonly string[] }) {
  return (
    <div className="verification-result__help">
      <p>{plural ? MISMATCH_MEANING.plural : MISMATCH_MEANING.single}</p>
      <p className="verification-result__help-title">What to try next</p>
      <ul>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </div>
  );
}

export function VerificationResult({
  state,
  subject,
  plural = false,
  recordedAt,
  detail,
  computed,
  expected,
  chainRoot,
  nextSteps = MISMATCH_NEXT_STEPS,
}: VerificationResultProps) {
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
      {state === 'mismatch' && <MismatchHelp plural={plural} steps={nextSteps} />}
      <dl className="verification-result__hashes">
        <div>
          <dt>{computed.label}</dt>
          <dd>
            <HashDisplay value={computed.value} label={computed.label} />
          </dd>
        </div>
        {expected !== undefined && (
          <div>
            <dt>{expected.label}</dt>
            <dd>
              <HashDisplay value={expected.value} label={expected.label} />
            </dd>
          </div>
        )}
      </dl>
      {chainRoot !== undefined && (
        <p className="verification-result__chain">
          The file list matches the recorded bundle fingerprint <HashDisplay value={chainRoot} label="recorded bundle fingerprint" />
        </p>
      )}
    </article>
  );
}
