// =============================================================================
// Proof of Aid — Team 05 — Evidence section: one row per onchain root, its file list and downloads
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { bundleLabel, manifestProblemMessage } from '../evidence/labels';
import type { ManifestProblem, ManifestState, VerifiedManifest } from '../evidence/verification';
import type { ClaimView, EvidenceBundle } from '../types/claim';
import { formatTimestamp } from '../utils/format';
import { HashDisplay } from './HashDisplay';
import { AlertTriangleIcon, ShieldCheckIcon } from './icons';
import { VerificationResult } from './VerificationResult';
import './EvidenceSection.css';

type EvidenceSectionProps = { claim: ClaimView; manifests: ReadonlyMap<number, ManifestState> };

const RECORDED_ROOT_LABEL = 'Recorded evidence fingerprint (onchain root)';

export function ManifestProblemView({ problem, subject }: { problem: ManifestProblem; subject: string }) {
  const view =
    problem.kind === 'manifest-mismatch' ? (
      <VerificationResult
        state="manifest-mismatch"
        subject={subject}
        computed={{ label: 'Fingerprint of this file list (Merkle root)', value: problem.computedRoot }}
        expected={{ label: RECORDED_ROOT_LABEL, value: problem.onchainRoot }}
      />
    ) : (
      <p className="notice">
        <AlertTriangleIcon size={16} className="notice__icon" />
        <span>{manifestProblemMessage(problem)}</span>
      </p>
    );
  return view;
}

function VerifiedFiles({ verified, bundle }: { verified: VerifiedManifest; bundle: EvidenceBundle }) {
  return (
    <>
      <p className="verified-note">
        <ShieldCheckIcon size={16} className="verified-note__icon" />
        <span>The published file list matches this fingerprint, so its entries can be trusted.</span>
      </p>
      <ul className="file-list">
        {verified.manifest.files.map((file) => {
          const download = file.public ? bundle.downloads.find((link) => link.name === file.name) : undefined;
          const name = file.public ? (file.name ?? 'Public file (no name given)') : 'Name not published';
          return (
            <li key={file.sha256} className="file-list__item">
              {file.public ? (
                <>
                  {download === undefined ? (
                    <span className="file-list__name">{name}</span>
                  ) : (
                    <a className="file-list__name" href={download.href} download={download.name}>
                      Download {name}
                    </a>
                  )}
                  <HashDisplay value={file.sha256} label={`fingerprint of ${name}`} />
                </>
              ) : (
                <VerificationResult
                  state="private"
                  subject={name}
                  computed={{ label: 'File fingerprint (SHA-256)', value: file.sha256 }}
                  expected={{ label: RECORDED_ROOT_LABEL, value: bundle.root }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PublishedFiles({ bundle, state }: { bundle: EvidenceBundle; state: ManifestState }) {
  let content: ReactNode;
  switch (state.kind) {
    case 'none':
      content = (
        <p className="muted">
          No file list has been published for this bundle. You can still check it below with all of its files, or with a
          file list you received.
        </p>
      );
      break;
    case 'invalid':
      content = (
        <p className="notice">
          <AlertTriangleIcon size={16} className="notice__icon" />
          <span>The published file list is not valid, so it is ignored. {state.message}</span>
        </p>
      );
      break;
    case 'checked':
      content = state.check.ok ? (
        <VerifiedFiles verified={state.check.value} bundle={bundle} />
      ) : (
        <ManifestProblemView problem={state.check.error} subject="Published file list" />
      );
      break;
  }
  return (
    <div className="evidence-bundle__files">
      {content}
      {bundle.manifestHref !== undefined && (
        <p className="evidence-bundle__manifest">
          <a href={bundle.manifestHref} download>
            Download the file list (manifest JSON)
          </a>
        </p>
      )}
    </div>
  );
}

export function EvidenceSection({ claim, manifests }: EvidenceSectionProps) {
  const txExplorer = claim.source === 'demo' ? undefined : 'tx';
  return (
    <section className="card" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence</h2>
      <p className="muted">
        The evidence files stay off the blockchain. Only a fingerprint of each bundle of files (its Merkle root) was recorded,
        so anyone can check a file without the others being revealed.
      </p>
      <ul className="evidence-list">
        {claim.evidence.map((bundle) => (
          <li key={bundle.rootIndex} className="evidence-bundle">
            <h3 className="evidence-bundle__title">{bundleLabel(bundle.rootIndex)}</h3>
            <dl className="detail-list">
              <div>
                <dt>Fingerprint recorded on the blockchain</dt>
                <dd>
                  <HashDisplay value={bundle.root} label={`${bundleLabel(bundle.rootIndex)} fingerprint`} />
                </dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd className="evidence-bundle__recorded">
                  {bundle.recordedAt === undefined ? 'Date not found in the history' : formatTimestamp(bundle.recordedAt)}
                  {bundle.txHash !== undefined && (
                    <span className="evidence-bundle__tx">
                      <span aria-hidden="true">·</span> Transaction{' '}
                      <HashDisplay value={bundle.txHash} label="transaction" explorer={txExplorer} />
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <PublishedFiles bundle={bundle} state={manifests.get(bundle.rootIndex) ?? { kind: 'none' }} />
          </li>
        ))}
      </ul>
    </section>
  );
}
