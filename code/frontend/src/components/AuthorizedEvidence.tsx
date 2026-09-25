// =============================================================================
// Proof of Aid — Team 05 — Reviewer view: open, download and check a claim's private evidence files
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useRef, useState, type ReactNode } from 'react';
import type { Hex } from 'viem';
import { downloadEvidenceFile, type AuthorizedBundle, type AuthorizedFile } from '../data/evidenceApi';
import type { FetchLike } from '../data/httpJson';
import { checkAuthorizedBundle, checkDownloadedFile, safeDownloadName, type AuthorizedFileCheck } from '../evidence/authorizedCheck';
import { bundleLabel } from '../evidence/labels';
import type { VerifiedManifest } from '../evidence/verification';
import { useClaimAccess, type ClaimAccessGate } from '../hooks/useClaimAccess';
import type { ClaimView } from '../types/claim';
import { formatBytes } from '../utils/format';
import { err, ok, type Result } from '../utils/result';
import { saveBytes } from '../utils/saveFile';
import { AuthorizedNotes } from './AuthorizedNotes';
import { ManifestProblemView } from './EvidenceSection';
import { HashDisplay } from './HashDisplay';
import { AlertTriangleIcon, LockIcon, ShieldCheckIcon } from './icons';
import { VerificationResult } from './VerificationResult';
import './AuthorizedEvidence.css';

export const DEMO_NOTE =
  'Demo data: the sample claims have no private files behind them. With the evidence service, the organization, its internal verifiers and the assigned auditor open and check private files here.';
export const NO_API_NOTE =
  'Opening private files needs the evidence service (VITE_API_URL), which stores them encrypted and decrypts them only for authorized reviewers. It is not configured here.';
export const NO_WALLET_NOTE =
  'Reviewers: connect your wallet (top right), then sign in here to open this claim’s private files.';
export const SIGNED_OUT_NOTE =
  'Sign in with your wallet to open this claim’s private files. Signing proves you control the wallet; it is not a transaction and costs nothing.';
export const NO_ACCESS_NOTE =
  'Your wallet is signed in, but it may not open this claim’s private files. Only the organization that recorded the claim, its internal verifiers and the auditor assigned to the claim can. Everyone else sees fingerprints only.';
export const NOT_STORED_NOTE = 'The evidence service holds no record of this claim, so there are no files to open.';

const RECORDED_ROOT_LABEL = 'Recorded evidence fingerprint (onchain root)';

type FileRowProps = {
  file: AuthorizedFile;
  verified: VerifiedManifest | undefined;
  root: Hex;
  recordedAt: number | undefined;
  apiUrl: string;
  fetch: FetchLike;
};

type FileOutcome = { kind: 'saved' } | { kind: 'checked'; check: AuthorizedFileCheck } | { kind: 'error'; message: string };

function FileRow({ file, verified, root, recordedAt, apiUrl, fetch }: FileRowProps) {
  const [busy, setBusy] = useState<'download' | 'check' | undefined>();
  const [outcome, setOutcome] = useState<FileOutcome | undefined>();
  // One download serves both buttons; the bytes stay in this tab only.
  const cached = useRef<ArrayBuffer | undefined>(undefined);
  const name = safeDownloadName(file.name, file.fingerprint);

  const bytes = async (): Promise<Result<ArrayBuffer, string>> => {
    if (cached.current !== undefined) {
      return ok(cached.current);
    }
    const downloaded = await downloadEvidenceFile(fetch, apiUrl, file.id);
    cached.current = downloaded.ok ? downloaded.value : undefined;
    return downloaded;
  };

  const download = async (): Promise<void> => {
    setBusy('download');
    const got = await bytes();
    if (got.ok) {
      saveBytes(got.value, name);
    }
    setOutcome(got.ok ? { kind: 'saved' } : { kind: 'error', message: got.error });
    setBusy(undefined);
  };

  const check = async (): Promise<void> => {
    setBusy('check');
    const got = await bytes();
    const checked =
      !got.ok || verified === undefined
        ? err(got.ok ? 'This bundle’s file list does not match the blockchain, so no file of it can be confirmed.' : got.error)
        : await checkDownloadedFile(verified, file, got.value);
    setOutcome(checked.ok ? { kind: 'checked', check: checked.value } : { kind: 'error', message: checked.error });
    setBusy(undefined);
  };

  let result: ReactNode = null;
  if (outcome?.kind === 'saved') {
    result = <p className="caption">Saved as “{name}”.</p>;
  } else if (outcome?.kind === 'error') {
    result = (
      <p className="notice" role="alert">
        <AlertTriangleIcon size={16} className="notice__icon" />
        <span>{outcome.message}</span>
      </p>
    );
  } else if (outcome?.kind === 'checked') {
    result = (
      <VerificationResult
        state={outcome.check.kind}
        subject={name}
        recordedAt={recordedAt}
        detail={
          outcome.check.kind === 'match'
            ? `Its ${file.salt === undefined ? '' : 'salted '}fingerprint is the one listed for it in the ${bundleLabel(file.rootIndex).toLowerCase()}, whose fingerprint is recorded on the blockchain.`
            : 'The downloaded bytes do not give the fingerprint recorded for this file.'
        }
        computed={{ label: `Fingerprint of the downloaded file (${file.salt === undefined ? 'SHA-256' : 'salted SHA-256'})`, value: outcome.check.computed }}
        expected={{ label: RECORDED_ROOT_LABEL, value: root }}
      />
    );
  }

  return (
    <li className="file-list__item authorized-file">
      <span className="file-list__name">
        {file.isPublic ? null : <LockIcon size={14} className="authorized-file__icon" />} {name}
      </span>
      <span className="caption">
        {file.isPublic ? 'Public' : 'Private'} · {formatBytes(file.sizeBytes)}
      </span>
      <HashDisplay value={file.fingerprint} label={`fingerprint of ${name}`} />
      <span className="authorized-file__buttons">
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Download ${name}`}
          disabled={busy !== undefined}
          onClick={() => void download()}
        >
          {busy === 'download' ? 'Downloading…' : 'Download'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Check this file: ${name}`}
          disabled={busy !== undefined}
          onClick={() => void check()}
        >
          {busy === 'check' ? 'Checking…' : 'Check this file'}
        </button>
      </span>
      <div className="authorized-file__result" aria-live="polite">
        {result}
      </div>
    </li>
  );
}

function BundleFiles({ claim, bundle, apiUrl, fetch }: { claim: ClaimView; bundle: AuthorizedBundle; apiUrl: string; fetch: FetchLike }) {
  const onchain = claim.evidence.find((item) => item.rootIndex === bundle.rootIndex);
  const check = checkAuthorizedBundle(
    claim.claimId,
    bundle,
    claim.evidence.map((item) => item.root),
  );
  const verified = check.ok ? check.value : undefined;
  return (
    <li className="evidence-bundle">
      <h3 className="evidence-bundle__title">
        {bundleLabel(bundle.rootIndex)} <span className="caption">(bundle #{bundle.rootIndex})</span>
      </h3>
      {check.ok ? (
        <p className="verified-note">
          <ShieldCheckIcon size={16} className="verified-note__icon" />
          <span>The evidence service’s file list for this bundle matches the fingerprint recorded on the blockchain.</span>
        </p>
      ) : (
        <ManifestProblemView problem={check.error} subject="The evidence service’s file list" />
      )}
      {onchain !== undefined && (
        <ul className="file-list">
          {bundle.files.map((file) => (
            <FileRow key={file.id} file={file} verified={verified} root={onchain.root} recordedAt={onchain.recordedAt} apiUrl={apiUrl} fetch={fetch} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Notice({ children, role }: { children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <p className="notice" role={role}>
      <AlertTriangleIcon size={16} className="notice__icon" />
      <span>{children}</span>
    </p>
  );
}

/** The gate's message, or `undefined` once the files can be listed. */
function gateMessage(gate: ClaimAccessGate): ReactNode {
  let message: ReactNode;
  switch (gate.state) {
    case 'demo':
      message = <p className="muted">{DEMO_NOTE}</p>;
      break;
    case 'no-api':
      message = <p className="muted">{NO_API_NOTE}</p>;
      break;
    case 'no-wallet':
      message = <p className="muted">{NO_WALLET_NOTE}</p>;
      break;
    case 'checking':
      message = <p role="status">Checking your sign-in with the evidence service…</p>;
      break;
    case 'signed-out':
      message = (
        <>
          <p className="muted">{SIGNED_OUT_NOTE}</p>
          <p>
            <button type="button" className="btn btn-primary" disabled={gate.signing} onClick={gate.signIn}>
              {gate.signing ? 'Confirm in wallet…' : 'Sign in with your wallet'}
            </button>
          </p>
          {gate.error !== undefined && <Notice role="alert">{gate.error}</Notice>}
        </>
      );
      break;
    case 'error':
      message = (
        <div role="alert">
          <Notice>The evidence service could not be asked about this claim. {gate.message}</Notice>
          <button type="button" className="btn btn-secondary" onClick={gate.retry}>
            Try again
          </button>
        </div>
      );
      break;
    case 'ready':
      message =
        gate.access.kind === 'denied' ? (
          <p className="muted">{NO_ACCESS_NOTE}</p>
        ) : gate.access.kind === 'not-stored' ? (
          <p className="muted">{NOT_STORED_NOTE}</p>
        ) : undefined;
      break;
  }
  return message;
}

export function AuthorizedEvidence({ claim }: { claim: ClaimView }) {
  const gate = useClaimAccess(claim.claimId, claim.source);
  const message = gateMessage(gate);
  return (
    <>
      <section className="card authorized-evidence" aria-labelledby="authorized-evidence-heading">
        <h2 id="authorized-evidence-heading">Evidence files (authorized)</h2>
        <p className="muted">
          For reviewers only. The evidence service decrypts a private file for the organization, its internal verifiers and
          the assigned auditor; this page then checks it against the fingerprint recorded on the blockchain.
        </p>
        {message}
        {message === undefined && gate.state === 'ready' && gate.access.kind === 'authorized' && (
          <ul className="evidence-list">
            {gate.access.bundles.map((bundle) => (
              <BundleFiles key={bundle.rootIndex} claim={claim} bundle={bundle} apiUrl={gate.apiUrl} fetch={gate.fetch} />
            ))}
          </ul>
        )}
      </section>
      {gate.state === 'ready' && gate.access.kind !== 'not-stored' && <AuthorizedNotes timeline={claim.timeline} notes={gate.notes} />}
    </>
  );
}
