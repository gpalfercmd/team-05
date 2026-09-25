// =============================================================================
// Proof of Aid — Team 05 — What the signed-in wallet may open of one claim (the backend decides)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { skipToken, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Address, Hex } from 'viem';
import { readClaimAccess, readNotes, readSession, type ClaimAccess, type StoredNote } from '../data/evidenceApi';
import type { FetchLike } from '../data/httpJson';
import type { ClaimSource } from '../types/claim';
import { err, ok, type Result } from '../utils/result';
import { useAppConfig } from './useAppConfig';
import { useEvidenceService } from './useEvidenceService';
import { useWallet } from './useWallet';

// The reviewer view (P10.2) reuses the wallet-signature login of the role screens and asks the
// backend, with that session, for the claim: its access matrix (owning organization, its internal
// verifiers, the assigned auditor) answers with every file and salt, or with fingerprints only.
// The page never decides access itself. The same session reads the claim's notes (P10.3).

export type ClaimAccessGate =
  /** Demo data: there is no backend record behind the sample claims. */
  | { state: 'demo' }
  | { state: 'no-api' }
  | { state: 'no-wallet' }
  | { state: 'checking' }
  | { state: 'signed-out'; signIn: () => void; signing: boolean; error: string | undefined }
  | { state: 'error'; message: string; retry: () => void }
  /** `notes`: every note for authorized reviewers, the viewer's own otherwise (P10.3). */
  | { state: 'ready'; viewer: Address; access: ClaimAccess; notes: Result<StoredNote[], string>; apiUrl: string; fetch: FetchLike };

type Loaded = { kind: 'signed-out' } | { kind: 'ready'; access: ClaimAccess; notes: Result<StoredNote[], string> };

async function loadAccess(fetchFn: FetchLike, apiUrl: string, claimId: Hex, viewer: Address): Promise<Result<Loaded, string>> {
  const session = await readSession(fetchFn, apiUrl);
  if (!session.ok) {
    return session;
  }
  // A session cookie of another wallet does not count: this wallet must sign in itself.
  if (session.value?.toLowerCase() !== viewer.toLowerCase()) {
    return ok({ kind: 'signed-out' });
  }
  const access = await readClaimAccess(fetchFn, apiUrl, claimId);
  if (!access.ok) {
    return err(access.error);
  }
  // A claim the backend never stored has no notes either; a notes failure does not hide the files.
  const notes = access.value.kind === 'not-stored' ? ok([]) : await readNotes(fetchFn, apiUrl, claimId);
  const loaded: Result<Loaded, string> = ok({ kind: 'ready', access: access.value, notes });
  return loaded;
}

export function useClaimAccess(claimId: Hex, source: ClaimSource): ClaimAccessGate {
  const { apiUrl } = useAppConfig();
  const wallet = useWallet();
  const service = useEvidenceService();
  const [signing, setSigning] = useState(false);
  const [signInError, setSignInError] = useState<string | undefined>();
  const viewer = wallet.status === 'connected' ? wallet.address : undefined;
  const enabled = source !== 'demo' && apiUrl !== undefined && viewer !== undefined;
  const query = useQuery({
    queryKey: ['claim-access', apiUrl, claimId, viewer],
    queryFn: enabled ? () => loadAccess(service.fetch, apiUrl, claimId, viewer) : skipToken,
    retry: false,
  });
  const retry = () => void query.refetch();

  const signIn = (): void => {
    setSigning(true);
    setSignInError(undefined);
    void service.ensureSession().then((session) => {
      setSigning(false);
      setSignInError(session.ok ? undefined : session.error);
      if (session.ok) {
        retry();
      }
    });
  };

  let gate: ClaimAccessGate;
  if (source === 'demo') {
    gate = { state: 'demo' };
  } else if (apiUrl === undefined) {
    gate = { state: 'no-api' };
  } else if (viewer === undefined) {
    gate = { state: 'no-wallet' };
  } else if (query.data === undefined) {
    gate = query.isError ? { state: 'error', message: query.error.message, retry } : { state: 'checking' };
  } else if (!query.data.ok) {
    gate = { state: 'error', message: query.data.error, retry };
  } else if (query.data.value.kind === 'signed-out') {
    // Right after signing in, the refetch runs while the old "signed out" answer is still cached.
    gate = query.isFetching ? { state: 'checking' } : { state: 'signed-out', signIn, signing, error: signInError };
  } else {
    gate = { state: 'ready', viewer, access: query.data.value.access, notes: query.data.value.notes, apiUrl, fetch: service.fetch };
  }
  return gate;
}
