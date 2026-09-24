// =============================================================================
// Proof of Aid — Team 05 — "What was claimed": title and description, shown only once checked (P8.4)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import type { MetadataCheck } from '../data/claimMetadata';
import type { ClaimView } from '../types/claim';
import { HashDisplay } from './HashDisplay';
import { AlertTriangleIcon, ShieldCheckIcon } from './icons';
import './ClaimMetadata.css';

const RECORDED_LABEL = 'Recorded fingerprint of the title and description';

function Verdict({ check }: { check: MetadataCheck }): ReactNode {
  let verdict: ReactNode;
  switch (check.state) {
    case 'verified':
      verdict = (
        <p className="verified-note">
          <ShieldCheckIcon size={16} className="verified-note__icon" />
          <span>Title and description match the blockchain record.</span>
        </p>
      );
      break;
    case 'mismatch':
      verdict = (
        <p className="notice" role="alert">
          <AlertTriangleIcon size={16} className="notice__icon" />
          <span>
            Warning: the title and description sent by the server do not match the blockchain record, so they are not shown.
            They may have been changed after the claim was recorded. {check.detail}
          </span>
        </p>
      );
      break;
    case 'not-published':
      verdict = <p className="muted">The server has no title or description for this claim, so there is nothing to check.</p>;
      break;
    case 'not-configured':
      verdict = (
        <p className="muted">
          This page reads only the blockchain, which keeps a fingerprint of the claim’s title and description but not the text
          itself, so there is nothing to show or check here.
        </p>
      );
      break;
  }
  return verdict;
}

/** The claim's text, hidden unless it hashes to the `metadataHash` read from the contract. */
export function ClaimMetadata({ claim }: { claim: ClaimView }) {
  const check = claim.metadata;
  return (
    <section className="card claim-metadata" aria-labelledby="metadata-heading">
      <h2 id="metadata-heading">What was claimed</h2>
      {check.state === 'verified' && (
        <>
          <h3 className="claim-metadata__title">{check.metadata.title}</h3>
          <p className="claim-metadata__description">{check.metadata.description}</p>
          <dl className="detail-list">
            <div>
              <dt>Region</dt>
              <dd>{check.metadata.locationRegion}</dd>
            </div>
            <div>
              <dt>Date of the aid</dt>
              <dd>{check.metadata.claimDate}</dd>
            </div>
          </dl>
        </>
      )}
      <Verdict check={check} />
      <dl className="detail-list">
        {check.state === 'mismatch' && check.computedHash !== undefined && (
          <div>
            <dt>Fingerprint of the text sent by the server</dt>
            <dd>
              <HashDisplay value={check.computedHash} label="fingerprint of the served text" />
            </dd>
          </div>
        )}
        <div>
          <dt>{RECORDED_LABEL}</dt>
          <dd>
            <HashDisplay value={claim.metadataHash} label="recorded fingerprint of the title and description" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
