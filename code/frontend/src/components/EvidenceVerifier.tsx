// =============================================================================
// Proof of Aid — Team 05 — "Verify it yourself": re-hash files in the browser vs the onchain root
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import { bundleLabel, fileCheckDetail } from '../evidence/labels';
import type { ManifestState } from '../evidence/verification';
import { useEvidenceVerifier, type CheckOutcome, type LoadedManifest, type VerifierMode } from '../hooks/useEvidenceVerifier';
import type { ClaimView } from '../types/claim';
import { ManifestProblemView } from './EvidenceSection';
import { FileDropZone } from './FileDropZone';
import { AlertTriangleIcon, ShieldCheckIcon } from './icons';
import { VerificationResult } from './VerificationResult';

type EvidenceVerifierProps = { claim: ClaimView; manifests: ReadonlyMap<number, ManifestState> };

const RECORDED_ROOT_LABEL = 'Recorded evidence fingerprint (onchain root)';

function OutcomeView({ outcome }: { outcome: CheckOutcome }) {
  let view: ReactNode;
  switch (outcome.kind) {
    case 'error':
      view = (
        <p className="notice">
          <AlertTriangleIcon size={16} className="notice__icon" />
          <span>{outcome.message}</span>
        </p>
      );
      break;
    case 'files':
      view = outcome.checks.map((check, index) => (
        <VerificationResult
          key={`${check.file.sha256}-${index}`}
          state={check.kind}
          subject={check.file.name}
          recordedAt={outcome.bundle.recordedAt}
          detail={fileCheckDetail(check, outcome.bundle.rootIndex)}
          computed={{ label: 'Fingerprint of your file (SHA-256)', value: check.file.sha256 }}
          expected={{ label: RECORDED_ROOT_LABEL, value: outcome.bundle.root }}
        />
      ));
      break;
    case 'bundle': {
      const { check, bundle } = outcome;
      view = (
        <VerificationResult
          state={check.kind}
          subject={`${check.fileCount} ${check.fileCount === 1 ? 'file' : 'files'} checked as the complete ${bundleLabel(bundle.rootIndex).toLowerCase()}`}
          plural={check.fileCount > 1}
          recordedAt={bundle.recordedAt}
          computed={{ label: 'Fingerprint computed from your files (Merkle root)', value: check.computedRoot }}
          expected={{ label: RECORDED_ROOT_LABEL, value: check.onchainRoot }}
        />
      );
      break;
    }
  }
  return view;
}

function LoadedManifestView({ loaded }: { loaded: LoadedManifest }) {
  const { state, fileName } = loaded;
  let view: ReactNode;
  if (state.kind === 'invalid') {
    view = (
      <p className="notice">
        <AlertTriangleIcon size={16} className="notice__icon" />
        <span>{state.message}</span>
      </p>
    );
  } else if (state.check.ok) {
    view = (
      <p className="verified-note">
        <ShieldCheckIcon size={16} className="verified-note__icon" />
        <span>
          “{fileName}” matches the fingerprint of the {bundleLabel(state.check.value.rootIndex).toLowerCase()}. You can now check
          single files against it.
        </span>
      </p>
    );
  } else {
    view = <ManifestProblemView problem={state.check.error} subject={fileName} />;
  }
  return view;
}

export function EvidenceVerifier({ claim, manifests }: EvidenceVerifierProps) {
  const verifier = useEvidenceVerifier(claim, manifests);
  const { bundle, mode, verified, busy } = verifier;
  const hasDownloads = bundle !== undefined && bundle.downloads.length > 0;
  const modes: { value: VerifierMode; label: string; disabled: boolean }[] = [
    {
      value: 'files',
      label:
        verified === undefined
          ? 'Single files (needs a file list — none that matches the blockchain is available for this bundle yet)'
          : 'Single files (with matching file list)',
      disabled: verified === undefined,
    },
    { value: 'bundle', label: 'A complete bundle (all files together)', disabled: false },
  ];

  return (
    <section id="verify" className="card verifier" aria-labelledby="verify-heading">
      <h2 id="verify-heading">Verify it yourself</h2>
      <p className="muted">
        Your files never leave this browser. Their fingerprints are computed on your device and compared with the fingerprint
        recorded on the blockchain.
      </p>
      {claim.source === 'demo' && hasDownloads && (
        <p className="verifier__hint">
          Try it: download <strong>{bundle.downloads[0]?.name}</strong> from the Evidence section and add it below. Then change
          one character in it and add it again.
        </p>
      )}

      {claim.evidence.length > 1 && (
        <fieldset className="choice-group">
          <legend>Which evidence do you want to check?</legend>
          {claim.evidence.map((item) => (
            <label key={item.rootIndex} className="choice">
              <input
                type="radio"
                name="verify-bundle"
                checked={verifier.rootIndex === item.rootIndex}
                disabled={busy}
                onChange={() => verifier.selectBundle(item.rootIndex)}
              />
              <span>{bundleLabel(item.rootIndex)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="choice-group">
        <legend>What do you want to check?</legend>
        {modes.map((option) => (
          <label key={option.value} className="choice" data-disabled={option.disabled}>
            <input
              type="radio"
              name="verify-mode"
              checked={mode === option.value}
              disabled={option.disabled || busy}
              onChange={() => verifier.selectMode(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <FileDropZone
        id="verify-files"
        label="Choose files to check"
        hint={mode === 'files' ? 'Drop one or more files here' : 'Drop all the files of this bundle here'}
        multiple
        disabled={busy || bundle === undefined}
        onFiles={(files) => void verifier.checkFiles(files)}
      />

      <div className="verifier__results" aria-live="polite">
        {busy ? (
          <p role="status">
            <span className="spinner" aria-hidden="true" /> Computing fingerprints…
          </p>
        ) : (
          verifier.outcome !== undefined && (
            <>
              <OutcomeView outcome={verifier.outcome} />
              <button type="button" className="btn btn-secondary" onClick={verifier.clearOutcome}>
                Clear results
              </button>
            </>
          )
        )}
      </div>

      <details className="verifier__manifest">
        <summary>Load a file list (manifest JSON) you received</summary>
        <p className="caption">
          An organization can publish the list of fingerprints of a bundle. It is only trusted if it matches the fingerprint on
          the blockchain.
        </p>
        <FileDropZone
          id="verify-manifest"
          label="Choose a file list"
          hint="Drop a manifest JSON file here"
          accept=".json,application/json"
          disabled={busy}
          onFiles={(files) => void verifier.loadManifest(files)}
        />
        <div aria-live="polite">
          {verifier.loadedManifest !== undefined && <LoadedManifestView loaded={verifier.loadedManifest} />}
        </div>
      </details>
    </section>
  );
}
