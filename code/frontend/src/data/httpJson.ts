// =============================================================================
// Proof of Aid — Team 05 — Bounded JSON GET for public, untrusted endpoints (indexer API, demo files)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { err, ok, type Result } from '../utils/result';

// Everything fetched here is optional extra material: a failure is a value the caller can ignore
// or fall back from, never an exception. The body stays `unknown` until a zod schema checks it.

/** The part of `fetch` this app uses; tests pass a stub. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** `fetch` called through a wrapper: stored as a method and called with another `this`, it throws. */
export const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export type GetJsonOptions = {
  /** A slow optional source must not hold the page back; the caller falls back instead. */
  timeoutMs: number;
  /** Larger answers are refused before parsing. */
  maxBytes: number;
};

/** Enough for a manifest or a claim timeline; the indexer answers in milliseconds when it is up. */
export const DEFAULT_TIMEOUT_MS = 6_000;

/** Joins the configured API base URL (with or without a trailing slash) and an endpoint path. */
export const apiEndpoint = (apiUrl: string, path: string): string => `${apiUrl.replace(/\/+$/, '')}${path}`;

const describeError = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error');

async function download(fetchFn: FetchLike, url: string, timeoutMs: number): Promise<Result<Response, string>> {
  let response: Result<Response, string>;
  try {
    // Public reads need no session, so no cookie is sent; the request also stays a simple CORS GET.
    response = ok(
      await fetchFn(url, {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      }),
    );
  } catch (error: unknown) {
    response = err(`${url} could not be reached (${describeError(error)}).`);
  }
  return response;
}

async function readBody(response: Response, maxBytes: number): Promise<Result<ArrayBuffer, string>> {
  let body: Result<ArrayBuffer, string>;
  try {
    body = ok(await response.arrayBuffer());
  } catch (error: unknown) {
    body = err(`The answer could not be read (${describeError(error)}).`);
  }
  const bounded: Result<ArrayBuffer, string> =
    body.ok && body.value.byteLength > maxBytes ? err(`The answer is larger than ${maxBytes} bytes.`) : body;
  return bounded;
}

function parseJson(bytes: ArrayBuffer): Result<unknown, string> {
  let json: Result<unknown, string>;
  try {
    json = ok(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    json = err('The answer is not JSON.');
  }
  return json;
}

/** GETs `url` and parses its JSON body; network errors, non-2xx answers and bad JSON all come back as `err`. */
export async function getJson(fetchFn: FetchLike, url: string, options: GetJsonOptions): Promise<Result<unknown, string>> {
  const response = await download(fetchFn, url, options.timeoutMs);
  if (!response.ok) {
    return response;
  }
  if (!response.value.ok) {
    return err(`${url} answered HTTP ${response.value.status}.`);
  }
  const body = await readBody(response.value, options.maxBytes);
  const json = body.ok ? parseJson(body.value) : body;
  return json;
}
