// =============================================================================
// Proof of Aid — Team 05 — Test helper: a stub evidence service (login, claims, uploads) recording requests
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import type { FetchLike } from '../data/httpJson';

export const API = 'http://api.test';
export const NEW_CLAIM_ID: Hex = `0x${'c1'.repeat(32)}`;
export const NEW_METADATA_HASH: Hex = `0x${'d2'.repeat(32)}`;
export const NEW_ROOT: Hex = `0x${'e3'.repeat(32)}`;
export const LOGIN_MESSAGE = 'Sign in to ClearTrust\n\nAddress: 0x…\nNonce: 1\nExpires: soon';

export type Recorded = { url: string; method: string; credentials: RequestCredentials | undefined; body: unknown };

type Reply = { status: number; body?: unknown };

export type EvidenceApiScript = {
  /** Wallet of the current session cookie, if any. */
  session: string | undefined;
  /** Overrides by "METHOD path", e.g. "POST /claims/…/evidence". */
  replies: Record<string, Reply | 'network-error'>;
};

/** A fetch that behaves like the backend's happy path unless `script.replies` says otherwise. */
export function stubEvidenceApi(script: EvidenceApiScript): { fetch: FetchLike; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetch: FetchLike = (input, init) => {
    const method = init.method ?? 'GET';
    const path = input.replace(API, '').replace(/\?.*$/, '');
    const body = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url: input, method, credentials: init.credentials, body });
    const override = script.replies[`${method} ${path}`];
    let reply: Reply;
    if (override === 'network-error') {
      return Promise.reject(new TypeError('Failed to fetch'));
    } else if (override !== undefined) {
      reply = override;
    } else if (method === 'GET' && path === '/auth/me') {
      reply = script.session === undefined ? { status: 401, body: { detail: 'not logged in' } } : { status: 200, body: { address: script.session } };
    } else if (path === '/auth/challenge') {
      reply = { status: 200, body: { message: LOGIN_MESSAGE, nonce: '1', expires_at: '2026-09-25T12:00:00Z' } };
    } else if (path === '/auth/verify') {
      const address = (body as { address: string }).address.toLowerCase();
      script.session = address;
      reply = { status: 200, body: { address } };
    } else if (method === 'POST' && path === '/claims') {
      reply = { status: 201, body: { claim_id_hex: NEW_CLAIM_ID, metadata_hash_hex: NEW_METADATA_HASH, title: 't' } };
    } else if (method === 'POST' && path.endsWith('/evidence')) {
      reply = { status: 201, body: { root_index: Number((body as { root_index: string }).root_index), files: [{}], evidence_root: NEW_ROOT } };
    } else {
      reply = { status: 404, body: { detail: 'Not Found' } };
    }
    return Promise.resolve(new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), { status: reply.status }));
  };
  return { fetch, requests };
}
