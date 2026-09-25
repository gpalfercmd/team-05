// =============================================================================
// Proof of Aid — Team 05 — Signs the connected wallet in to the evidence service when needed
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useSignMessage } from 'wagmi';
import type { Hex } from 'viem';
import { browserFetch, type FetchLike } from '../data/httpJson';
import { readSession, requestChallenge, verifyLogin } from '../data/evidenceApi';
import { isUserRejection } from '../utils/contractErrors';
import { err, ok, type Result } from '../utils/result';
import { useAppConfig } from './useAppConfig';
import { useWallet } from './useWallet';

export type EvidenceService = {
  /** `undefined` without `VITE_API_URL`: evidence cannot be stored, so claims cannot be recorded. */
  apiUrl: string | undefined;
  fetch: FetchLike;
  /** Reuses a session for this wallet, otherwise asks the wallet to sign a login message (no transaction). */
  ensureSession: () => Promise<Result<void, string>>;
};

export const SIGN_CANCELLED = 'You cancelled the login signature. Nothing was stored.';

export function useEvidenceService(): EvidenceService {
  const { apiUrl } = useAppConfig();
  const wallet = useWallet();
  const signMessage = useSignMessage();

  const sign = async (message: string): Promise<Result<Hex, string>> => {
    let signature: Result<Hex, string>;
    try {
      signature = ok(await signMessage.mutateAsync({ message }));
    } catch (error: unknown) {
      signature = err(isUserRejection(error) ? SIGN_CANCELLED : 'Your wallet could not sign the login message.');
    }
    return signature;
  };

  const ensureSession = async (): Promise<Result<void, string>> => {
    if (apiUrl === undefined || wallet.status !== 'connected') {
      return err('The evidence service is not configured or no wallet is connected.');
    }
    const current = await readSession(browserFetch, apiUrl);
    if (current.ok && current.value === wallet.address) {
      return ok(undefined);
    }
    const challenge = await requestChallenge(browserFetch, apiUrl, wallet.address);
    const signature = challenge.ok ? await sign(challenge.value) : challenge;
    const session = signature.ok ? await verifyLogin(browserFetch, apiUrl, wallet.address, signature.value) : signature;
    const result: Result<void, string> = session.ok ? ok(undefined) : err(session.error);
    return result;
  };

  const service: EvidenceService = { apiUrl, fetch: browserFetch, ensureSession };
  return service;
}
