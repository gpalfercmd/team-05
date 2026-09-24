// =============================================================================
// Proof of Aid — Team 05 — Tests: published file lists are kept only when proven against the chain
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { DEMO_EVIDENCE_PATH } from '../config/demoEvidence';
import { DEMO_MANIFESTS, DEMO_ORIGINAL_ROOT, DEMO_PROOF_ROOT, FULL_STORY_CLAIM_ID } from '../mocks/claims';
import { json, stubFetch, type StubAnswer } from '../test/stubFetch';
import { DEMO_STATIC_MANIFESTS, PublishedManifests } from './publishedManifests';

const API = 'http://localhost:8000';
const ROOTS: readonly Hex[] = [DEMO_ORIGINAL_ROOT, DEMO_PROOF_ROOT];
const OTHER_ROOT: Hex = `0x${'77'.repeat(32)}`;
const manifestUrl = (rootIndex: number): string => `${API}/claims/${FULL_STORY_CLAIM_ID}/bundles/${rootIndex}/manifest`;

function resolver(routes: Readonly<Record<string, StubAnswer>> = {}, apiUrl: string | undefined = undefined) {
  const stub = stubFetch(routes);
  const manifests = new PublishedManifests({ apiUrl, staticManifests: DEMO_STATIC_MANIFESTS, fetch: stub.fetch });
  return { manifests, requested: stub.requested };
}

describe('PublishedManifests', () => {
  it('publishes the demo file lists, with their downloads, when they hash to the onchain roots', async () => {
    const { manifests } = resolver();
    const published = await manifests.resolve(FULL_STORY_CLAIM_ID, ROOTS);
    expect(published.get(0)).toEqual({
      manifest: DEMO_MANIFESTS['manifest.json'],
      manifestHref: `${DEMO_EVIDENCE_PATH}manifest.json`,
      downloads: [
        { name: 'receipt-001.txt', href: `${DEMO_EVIDENCE_PATH}receipt-001.txt` },
        { name: 'invoice-7781.txt', href: `${DEMO_EVIDENCE_PATH}invoice-7781.txt` },
      ],
    });
    expect(published.get(1)).toMatchObject({
      manifestHref: `${DEMO_EVIDENCE_PATH}manifest-proof-1.json`,
      downloads: [
        { name: 'delivery-summary.csv', href: `${DEMO_EVIDENCE_PATH}delivery-summary.csv` },
        { name: 'stock-count.txt', href: `${DEMO_EVIDENCE_PATH}stock-count.txt` },
      ],
    });
  });

  it('rejects a list whose Merkle root is not the onchain root', async () => {
    const { manifests } = resolver();
    const published = await manifests.resolve(FULL_STORY_CLAIM_ID, [OTHER_ROOT, DEMO_PROOF_ROOT]);
    expect(published.has(0)).toBe(false);
    expect(published.has(1)).toBe(true);
  });

  it('publishes nothing for another claim, even with the same roots', async () => {
    const { manifests } = resolver();
    expect((await manifests.resolve(`0x${'42'.repeat(32)}`, ROOTS)).size).toBe(0);
  });

  it('treats missing files, network errors and non-JSON answers as "no file list"', async () => {
    const { manifests } = resolver({
      [`${DEMO_EVIDENCE_PATH}manifest.json`]: { networkError: 'Failed to fetch' },
      // A dev server answers an unknown path with its HTML page and status 200.
      [`${DEMO_EVIDENCE_PATH}manifest-proof-1.json`]: { status: 200, text: '<!doctype html><title>app</title>' },
    });
    expect((await manifests.resolve(FULL_STORY_CLAIM_ID, ROOTS)).size).toBe(0);
    const empty = new PublishedManifests({ apiUrl: undefined, staticManifests: { folder: '/nowhere/', files: ['x.json'] }, fetch: stubFetch().fetch });
    expect((await empty.resolve(FULL_STORY_CLAIM_ID, ROOTS)).size).toBe(0);
  });

  it('asks the API first and links its manifest endpoint (no downloads: it carries no file IDs)', async () => {
    const { manifests, requested } = resolver(
      { [manifestUrl(0)]: json(DEMO_MANIFESTS['manifest.json']), [manifestUrl(1)]: json(DEMO_MANIFESTS['manifest-proof-1.json']) },
      `${API}/`,
    );
    const published = await manifests.resolve(FULL_STORY_CLAIM_ID, ROOTS);
    expect(published.get(0)).toEqual({ manifest: DEMO_MANIFESTS['manifest.json'], manifestHref: manifestUrl(0), downloads: [] });
    expect(published.get(1)?.manifestHref).toBe(manifestUrl(1));
    expect(requested).toEqual([manifestUrl(0), manifestUrl(1)]);
  });

  it('falls back to the demo files when the API has no list (404) or is down', async () => {
    const { manifests, requested } = resolver({ [manifestUrl(1)]: { networkError: 'Connection refused' } }, API);
    const published = await manifests.resolve(FULL_STORY_CLAIM_ID, ROOTS);
    expect(published.get(0)?.manifestHref).toBe(`${DEMO_EVIDENCE_PATH}manifest.json`);
    expect(published.get(1)?.manifestHref).toBe(`${DEMO_EVIDENCE_PATH}manifest-proof-1.json`);
    expect(requested.slice(0, 2)).toEqual([manifestUrl(0), manifestUrl(1)]);
  });

  it('ignores an API list for another bundle or one altered after anchoring', async () => {
    const altered = {
      ...DEMO_MANIFESTS['manifest.json'],
      files: DEMO_MANIFESTS['manifest.json'].files.filter((file) => file.public),
    };
    const { manifests } = resolver(
      { [manifestUrl(0)]: json(altered), [manifestUrl(1)]: json(DEMO_MANIFESTS['manifest.json']) },
      API,
    );
    const published = await manifests.resolve(FULL_STORY_CLAIM_ID, ROOTS);
    // Both answers are rejected, so the (valid) demo files fill in.
    expect(published.get(0)?.manifestHref).toBe(`${DEMO_EVIDENCE_PATH}manifest.json`);
    expect(published.get(1)?.manifestHref).toBe(`${DEMO_EVIDENCE_PATH}manifest-proof-1.json`);
  });
});
