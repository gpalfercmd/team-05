// =============================================================================
// Proof of Aid — Team 05 — Test helper: a stub `fetch` serving the demo files and fake API answers
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { DEMO_EVIDENCE_PATH } from '../config/demoEvidence';
import type { FetchLike } from '../data/httpJson';

// The exact bytes the dev server and the build publish under /demo-evidence/.
const DEMO_FILES = import.meta.glob<string>('../../public/demo-evidence/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const DEMO_FILE_BY_URL = new Map(
  Object.entries(DEMO_FILES).map(([path, text]) => [`${DEMO_EVIDENCE_PATH}${path.split('/').at(-1) ?? path}`, text]),
);

/** An answer per URL: a JSON body or raw text with a status, or a thrown network error. */
export type StubAnswer = { status: number; body: unknown } | { status: number; text: string } | { networkError: string };

export type StubFetch = { fetch: FetchLike; requested: string[] };

export const json = (body: unknown, status = 200): StubAnswer => ({ status, body });

/**
 * Serves `routes` first, then the demo evidence files; everything else is a 404, like a server
 * without that file. Every requested URL is recorded, in order.
 */
export function stubFetch(routes: Readonly<Record<string, StubAnswer>> = {}): StubFetch {
  const requested: string[] = [];
  const fetch: FetchLike = (input) => {
    requested.push(input);
    const answer = routes[input];
    const demoFile = DEMO_FILE_BY_URL.get(input);
    let response: Promise<Response>;
    if (answer !== undefined && 'networkError' in answer) {
      response = Promise.reject(new TypeError(answer.networkError));
    } else if (answer !== undefined) {
      const body = 'text' in answer ? answer.text : JSON.stringify(answer.body);
      response = Promise.resolve(new Response(body, { status: answer.status }));
    } else if (demoFile !== undefined) {
      response = Promise.resolve(new Response(demoFile, { status: 200 }));
    } else {
      response = Promise.resolve(new Response('{"detail":"Not Found"}', { status: 404 }));
    }
    return response;
  };
  return { fetch, requested };
}
