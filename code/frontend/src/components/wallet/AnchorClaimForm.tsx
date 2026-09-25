// =============================================================================
// Proof of Aid — Team 05 — Organization: record a new claim (details + evidence → anchorClaim)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { formatEther, type Address, type Hex } from 'viem';
import { anchorClaimCall, type RegistryAddresses } from '../../chain/calls';
import { MIN_INTERNAL_VERIFIERS, readActiveVerifierCount } from '../../chain/reads';
import { createClaim, uploadEvidence, type CreatedClaim } from '../../data/evidenceApi';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useContractAction } from '../../hooks/useContractAction';
import { useEscrowParams } from '../../hooks/useEscrowParams';
import { useEvidenceService } from '../../hooks/useEvidenceService';
import { useReadClient } from '../../hooks/useWallet';
import { truncateMiddle } from '../../utils/format';
import { EvidenceFilesField, EvidenceSteps, type StepSpec } from './EvidenceSteps';
import { TxButton } from './TxButton';
import { TxStatus } from './TxStatus';

export const NO_API_ANCHOR_NOTE =
  'Recording a claim needs the evidence service (the backend, VITE_API_URL): it stores the claim details and the encrypted evidence, and computes the fingerprints the blockchain records. It is not configured here, so claims cannot be recorded from this page.';

type Step = 'session' | 'claim' | 'upload' | 'anchor';

const STEPS: readonly StepSpec<Step>[] = [
  { key: 'session', label: 'Sign in to the evidence service (a signature, not a transaction)' },
  { key: 'claim', label: 'Save the claim details' },
  { key: 'upload', label: 'Upload and fingerprint the evidence' },
  { key: 'anchor', label: 'Record the claim on the blockchain' },
];

type Details = { title: string; description: string; region: string; date: string };
type Errors = Partial<Record<keyof Details | 'files', string>>;

const EMPTY: Details = { title: '', description: '', region: '', date: '' };

function validate(details: Details, files: readonly File[]): Errors {
  const errors: Errors = {};
  if (details.title.trim() === '') errors.title = 'Give the claim a title.';
  if (details.description.trim() === '') errors.description = 'Describe what was delivered.';
  if (details.region.trim() === '') errors.region = 'Name the region (no exact locations).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.date)) errors.date = 'Pick the date of the delivery.';
  if (files.length === 0) errors.files = 'Add at least one evidence file.';
  return errors;
}

type TextFieldProps = { name: keyof Details; label: string; hint?: string; type?: 'text' | 'date'; multiline?: boolean };

function AnchorForm({ apiUrl, registries, organization }: { apiUrl: string; registries: RegistryAddresses; organization: Address }) {
  const service = useEvidenceService();
  const params = useEscrowParams();
  const client = useReadClient();
  const { chain } = useAppConfig();
  const verifiers = useQuery({
    queryKey: ['active-verifiers', chain.id, registries.participantRegistry, organization],
    queryFn: client === undefined ? skipToken : () => readActiveVerifierCount(client, registries, organization),
  });
  const [details, setDetails] = useState<Details>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [isPublic, setPublic] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<Step[]>([]);
  const [current, setCurrent] = useState<Step | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [created, setCreated] = useState<CreatedClaim | undefined>();
  const [root, setRoot] = useState<Hex | undefined>();
  const [recorded, setRecorded] = useState<Hex | undefined>();
  const [formKey, setFormKey] = useState(0);
  const anchor = useContractAction({
    onConfirmed: () => {
      setRecorded(created?.claimId);
      setDone((steps) => [...steps, 'anchor']);
      setCurrent(undefined);
    },
  });

  const deposit = params?.ok === true ? params.value.anchorDeposit : undefined;
  const tooFewVerifiers = verifiers.data?.ok === true && verifiers.data.value < MIN_INTERNAL_VERIFIERS;
  const working = current !== undefined && current !== 'anchor';
  const locked = created !== undefined && recorded === undefined;

  const startOver = (): void => {
    setDetails(EMPTY);
    setFiles([]);
    setPublic(false);
    setErrors({});
    setDone([]);
    setCurrent(undefined);
    setFailure(undefined);
    setCreated(undefined);
    setRoot(undefined);
    setRecorded(undefined);
    setFormKey((key) => key + 1);
    anchor.reset();
  };

  const fail = (message: string): void => {
    setFailure(message);
    setCurrent(undefined);
  };

  // Each finished step is kept, so a retry after a failure resumes where it stopped instead of
  // creating a second claim record or uploading the files twice.
  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const found = validate(details, files);
    setErrors(found);
    setFailure(undefined);
    if (Object.keys(found).length > 0 || deposit === undefined) {
      return;
    }
    let claim = created;
    let evidenceRoot = root;
    if (claim === undefined) {
      setCurrent('session');
      const session = await service.ensureSession();
      if (!session.ok) return fail(session.error);
      setDone(['session']);
      setCurrent('claim');
      const saved = await createClaim(service.fetch, apiUrl, {
        title: details.title.trim(),
        description: details.description.trim(),
        locationRegion: details.region.trim(),
        claimDate: details.date,
      });
      if (!saved.ok) return fail(saved.error);
      claim = saved.value;
      setCreated(claim);
      setDone(['session', 'claim']);
    }
    if (evidenceRoot === undefined) {
      setCurrent('upload');
      const session = await service.ensureSession();
      const bundle = session.ok ? await uploadEvidence(service.fetch, apiUrl, claim.claimId, { files, isPublic, rootIndex: 0 }) : session;
      if (!bundle.ok) return fail(bundle.error);
      evidenceRoot = bundle.value.evidenceRoot;
      setRoot(evidenceRoot);
      setDone(['session', 'claim', 'upload']);
    }
    setCurrent('anchor');
    await anchor.run(anchorClaimCall(registries, { claimId: claim.claimId, evidenceRoot, metadataHash: claim.metadataHash }, deposit));
  };

  const field = ({ name, label, hint, type = 'text', multiline = false }: TextFieldProps) => {
    const id = `anchor-${formKey}-${name}`;
    const describedBy = [hint === undefined ? undefined : `${id}-hint`, errors[name] === undefined ? undefined : `${id}-error`]
      .filter((value) => value !== undefined)
      .join(' ');
    const common = {
      id,
      value: details[name],
      disabled: locked || working || anchor.busy,
      'aria-invalid': errors[name] !== undefined,
      'aria-describedby': describedBy === '' ? undefined : describedBy,
    };
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        {multiline ? (
          <textarea {...common} onChange={(event) => setDetails({ ...details, [name]: event.target.value })} />
        ) : (
          <input {...common} type={type} onChange={(event) => setDetails({ ...details, [name]: event.target.value })} />
        )}
        {hint !== undefined && (
          <p id={`${id}-hint`} className="field__hint">
            {hint}
          </p>
        )}
        {errors[name] !== undefined && (
          <p id={`${id}-error`} className="field-error" role="alert">
            {errors[name]}
          </p>
        )}
      </div>
    );
  };

  const submitLabel = deposit === undefined ? 'Record claim' : `Record claim and lock ${formatEther(deposit)} ETH`;
  return (
    <form className="action-form" aria-label="Record a new claim" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h4>Record a new claim</h4>
      <p className="caption">
        Anchoring locks the organization’s deposit ({deposit === undefined ? 'read from the contract' : `${formatEther(deposit)} ETH`}:
        penalty plus the auditor’s reward). It comes back if the claim is rejected at a checkpoint and is paid out at settlement.
      </p>
      {tooFewVerifiers && (
        <p className="notice" role="alert">
          Your organization has fewer than two active internal verifiers, so the contract will not accept a claim yet. Ask the
          Registry Admin to register them first.
        </p>
      )}
      {field({ name: 'title', label: 'Title' })}
      {field({ name: 'description', label: 'Description', multiline: true })}
      {field({ name: 'region', label: 'Region', hint: 'Region level only, never exact coordinates or addresses.' })}
      {field({ name: 'date', label: 'Delivery date', type: 'date' })}
      <EvidenceFilesField
        key={formKey}
        files={files}
        onChange={setFiles}
        isPublic={isPublic}
        onPublicChange={setPublic}
        error={errors.files}
        disabled={locked || working || anchor.busy}
      />
      <EvidenceSteps steps={STEPS} done={done} current={current === 'anchor' && !anchor.busy ? undefined : current} error={failure} />
      <div className="action-form__buttons">
        {locked && !working && !anchor.busy && (
          <button type="button" className="btn btn-secondary" onClick={startOver}>
            Start over
          </button>
        )}
        <TxButton
          type="submit"
          label={locked ? 'Retry' : submitLabel}
          phase={anchor.phase}
          active
          busy={working || anchor.busy}
          disabled={deposit === undefined || tooFewVerifiers || recorded !== undefined}
        />
      </div>
      <TxStatus phase={anchor.phase} />
      {recorded !== undefined && (
        <p>
          Claim <code>{truncateMiddle(recorded)}</code> recorded. <Link to={`/claims/${recorded}`}>Open its public page</Link> or{' '}
          <button type="button" className="btn btn-secondary" onClick={startOver}>
            record another claim
          </button>
        </p>
      )}
    </form>
  );
}

/** Without the evidence service there is nowhere to keep the evidence, so the page says so. */
export function AnchorClaimSection({ registries, organization }: { registries: RegistryAddresses; organization: Address }) {
  const { apiUrl } = useAppConfig();
  return (
    <section className="wallet-stack" aria-labelledby="record-heading">
      <h3 id="record-heading">Record a claim</h3>
      {apiUrl === undefined ? (
        <p className="notice">{NO_API_ANCHOR_NOTE}</p>
      ) : (
        <AnchorForm apiUrl={apiUrl} registries={registries} organization={organization} />
      )}
    </section>
  );
}
