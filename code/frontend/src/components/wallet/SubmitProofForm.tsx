// =============================================================================
// Proof of Aid — Team 05 — Organization: answer a proof request (upload bundle n → submitProof)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useState, type FormEvent } from 'react';
import type { Hash, Hex } from 'viem';
import { submitProofCall, type RegistryAddresses } from '../../chain/calls';
import { uploadEvidence } from '../../data/evidenceApi';
import { useContractAction } from '../../hooks/useContractAction';
import { useEvidenceService } from '../../hooks/useEvidenceService';
import { EvidenceFilesField, EvidenceSteps, type StepSpec } from './EvidenceSteps';
import { TxButton } from './TxButton';
import { TxStatus } from './TxStatus';

export const NO_API_PROOF_NOTE =
  'Submitting proof needs the evidence service (VITE_API_URL) to store the new files and compute their fingerprint. It is not configured here.';

type Step = 'session' | 'upload' | 'submit';

const STEPS: readonly StepSpec<Step>[] = [
  { key: 'session', label: 'Sign in to the evidence service (a signature, not a transaction)' },
  { key: 'upload', label: 'Upload and fingerprint the supplementary evidence' },
  { key: 'submit', label: 'Record the new evidence root on the blockchain' },
];

type SubmitProofFormProps = {
  registries: RegistryAddresses;
  claimId: Hex;
  rootIndex: number;
  onConfirmed?: (hash: Hash) => void;
};

/** The new bundle goes to index `rootIndex` = the number of roots already onchain. */
export function SubmitProofForm({ registries, claimId, rootIndex, onConfirmed }: SubmitProofFormProps) {
  const service = useEvidenceService();
  const [files, setFiles] = useState<File[]>([]);
  const [isPublic, setPublic] = useState(false);
  const [filesError, setFilesError] = useState<string | undefined>();
  const [done, setDone] = useState<Step[]>([]);
  const [current, setCurrent] = useState<Step | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [root, setRoot] = useState<Hex | undefined>();
  const submit = useContractAction({
    onConfirmed: (hash) => {
      setDone(['session', 'upload', 'submit']);
      onConfirmed?.(hash);
    },
  });
  const apiUrl = service.apiUrl;

  if (apiUrl === undefined) {
    return (
      <div className="action-form">
        <h5>Submit supplementary proof</h5>
        <p className="notice">{NO_API_PROOF_NOTE}</p>
      </div>
    );
  }

  const working = current === 'session' || current === 'upload';
  const fail = (message: string): void => {
    setFailure(message);
    setCurrent(undefined);
  };

  // An uploaded bundle is kept: a failed transaction is retried with the same root.
  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFailure(undefined);
    const missing = root === undefined && files.length === 0;
    setFilesError(missing ? 'Add at least one file.' : undefined);
    if (missing) {
      return;
    }
    let bundleRoot = root;
    if (bundleRoot === undefined) {
      setCurrent('session');
      const session = await service.ensureSession();
      if (!session.ok) return fail(session.error);
      setDone(['session']);
      setCurrent('upload');
      const bundle = await uploadEvidence(service.fetch, apiUrl, claimId, { files, isPublic, rootIndex });
      if (!bundle.ok) return fail(bundle.error);
      bundleRoot = bundle.value.evidenceRoot;
      setRoot(bundleRoot);
      setDone(['session', 'upload']);
    }
    setCurrent('submit');
    await submit.run(submitProofCall(registries, claimId, bundleRoot));
  };

  return (
    <form className="action-form" aria-label="Submit supplementary proof" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h5>Submit supplementary proof</h5>
      <p className="caption">
        The auditor asked for more proof. The files become evidence bundle #{rootIndex}; a second internal verifier then
        confirms them.
      </p>
      <EvidenceFilesField
        files={files}
        onChange={setFiles}
        isPublic={isPublic}
        onPublicChange={setPublic}
        error={filesError}
        disabled={root !== undefined || working || submit.busy}
      />
      <EvidenceSteps steps={STEPS} done={done} current={current === 'submit' && !submit.busy ? undefined : current} error={failure} />
      <div className="action-form__buttons">
        <TxButton
          type="submit"
          label={root === undefined ? 'Submit proof' : 'Retry recording'}
          phase={submit.phase}
          active
          busy={working || submit.busy}
          disabled={submit.phase.kind === 'confirmed'}
        />
      </div>
      <TxStatus phase={submit.phase} />
    </form>
  );
}
