// =============================================================================
// Proof of Aid — Team 05 — Finds the published file list of each onchain root (API, then demo files)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { DEMO_EVIDENCE_PATH, DEMO_MANIFEST_FILES } from '../config/demoEvidence';
import { MAX_MANIFEST_BYTES, parseManifest, type EvidenceManifest } from '../evidence/manifest';
import { checkManifest } from '../evidence/verification';
import type { PublicFileLink } from '../types/claim';
import type { PublishedEvidence } from './assembleClaimView';
import { apiEndpoint, browserFetch, DEFAULT_TIMEOUT_MS, getJson, type FetchLike } from './httpJson';

// A file list is untrusted wherever it comes from: it is kept only when the Merkle root of its
// fingerprints equals the root the contract holds for that bundle (the same `checkManifest` the
// page uses for a list a visitor uploads). Anything else, including an unreachable server, is
// treated as "no file list published", which the page already explains.

/** What the chain-based sources need: the verified file lists of a claim, by root index. */
export type ManifestResolver = {
  resolve(claimId: Hex, onchainRoots: readonly Hex[]): Promise<ReadonlyMap<number, PublishedEvidence>>;
};

/** File lists served as static files next to the public files they list. */
export type StaticManifests = { folder: string; files: readonly string[] };

/** The demo claim's lists under public/demo-evidence/ (the backend has no record of that claim). */
export const DEMO_STATIC_MANIFESTS: StaticManifests = { folder: DEMO_EVIDENCE_PATH, files: DEMO_MANIFEST_FILES };

export type PublishedManifestsOptions = {
  /** P4 API base URL; `GET /claims/{id}/bundles/{n}/manifest` is tried first when set. */
  apiUrl: string | undefined;
  /** Tried for every root the API has no valid list for. */
  staticManifests?: StaticManifests | undefined;
  fetch?: FetchLike | undefined;
};

const FETCH_OPTIONS = { timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: MAX_MANIFEST_BYTES };

/** The list, if it is well formed, names this claim and hashes to the onchain root it claims to be. */
function provenList(raw: unknown, claimId: Hex, onchainRoots: readonly Hex[]): EvidenceManifest | undefined {
  const parsed = parseManifest(raw);
  const check = parsed.ok ? checkManifest(parsed.value, claimId, onchainRoots) : undefined;
  const manifest = check?.ok === true ? check.value.manifest : undefined;
  return manifest;
}

/** Public files sit in the same folder as their static list, under the name the list gives. */
const staticDownloads = (manifest: EvidenceManifest, folder: string): PublicFileLink[] =>
  manifest.files.flatMap((file) =>
    file.public && file.name !== undefined ? [{ name: file.name, href: `${folder}${file.name}` }] : [],
  );

export class PublishedManifests implements ManifestResolver {
  readonly #apiUrl: string | undefined;
  readonly #static: StaticManifests | undefined;
  readonly #fetch: FetchLike;

  constructor(options: PublishedManifestsOptions) {
    this.#apiUrl = options.apiUrl;
    this.#static = options.staticManifests;
    this.#fetch = options.fetch ?? browserFetch;
  }

  async resolve(claimId: Hex, onchainRoots: readonly Hex[]): Promise<ReadonlyMap<number, PublishedEvidence>> {
    const fromApi = await Promise.all(onchainRoots.map((_, rootIndex) => this.#fromApi(claimId, rootIndex, onchainRoots)));
    const fromStatic = fromApi.includes(undefined)
      ? await this.#fromStatic(claimId, onchainRoots)
      : new Map<number, PublishedEvidence>();
    const published = new Map<number, PublishedEvidence>();
    fromApi.forEach((evidence, rootIndex) => {
      const chosen = evidence ?? fromStatic.get(rootIndex);
      if (chosen !== undefined) {
        published.set(rootIndex, chosen);
      }
    });
    return published;
  }

  async #fromApi(claimId: Hex, rootIndex: number, onchainRoots: readonly Hex[]): Promise<PublishedEvidence | undefined> {
    if (this.#apiUrl === undefined) {
      return undefined;
    }
    const url = apiEndpoint(this.#apiUrl, `/claims/${claimId.toLowerCase()}/bundles/${rootIndex}/manifest`);
    const raw = await getJson(this.#fetch, url, FETCH_OPTIONS);
    const proven = raw.ok ? provenList(raw.value, claimId, onchainRoots) : undefined;
    // The API is asked for bundle `rootIndex`; a list for another bundle is not an answer.
    const manifest = proven?.rootIndex === rootIndex ? proven : undefined;
    // The manifest carries no file IDs, so the API's public downloads cannot be linked from it.
    const evidence = manifest === undefined ? undefined : { manifest, manifestHref: url, downloads: [] };
    return evidence;
  }

  async #fromStatic(claimId: Hex, onchainRoots: readonly Hex[]): Promise<Map<number, PublishedEvidence>> {
    const found = new Map<number, PublishedEvidence>();
    const source = this.#static;
    if (source === undefined) {
      return found;
    }
    const lists = await Promise.all(
      source.files.map(async (file) => {
        const href = `${source.folder}${file}`;
        const raw = await getJson(this.#fetch, href, FETCH_OPTIONS);
        return { href, manifest: raw.ok ? provenList(raw.value, claimId, onchainRoots) : undefined };
      }),
    );
    for (const { href, manifest } of lists) {
      if (manifest !== undefined && !found.has(manifest.rootIndex)) {
        found.set(manifest.rootIndex, { manifest, manifestHref: href, downloads: staticDownloads(manifest, source.folder) });
      }
    }
    return found;
  }
}
