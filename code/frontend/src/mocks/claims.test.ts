// =============================================================================
// Proof of Aid — Team 05 — Tests: demo claims are self-consistent and demo evidence is real
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isAddressEqual, zeroAddress, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { MockClaimSource } from '../data/mockClaimSource';
import { parseManifest } from '../evidence/manifest';
import { checkBundle, checkManifest } from '../evidence/verification';
import { statusNameFromIndex } from '../utils/claimStatus';
import { sha256Hex } from '../utils/merkle';
import { DEMO_MANIFESTS, DEMO_ORIGINAL_ROOT, DEMO_PROOF_ROOT, FULL_STORY_CLAIM_ID, MOCK_CLAIMS } from './claims';

// The exact bytes the dev server and the build publish under /demo-evidence/.
const DEMO_FILES = import.meta.glob<string>('../../public/demo-evidence/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const onDisk = new Map(Object.entries(DEMO_FILES).map(([path, text]) => [path.split('/').at(-1) ?? path, text]));

const bytesOf = (text: string): ArrayBuffer => new TextEncoder().encode(text).slice().buffer;

async function sha256Of(name: string): Promise<Hex | undefined> {
  const text = onDisk.get(name);
  const digest = text === undefined ? undefined : await sha256Hex(bytesOf(text));
  return digest?.ok === true ? digest.value : undefined;
}

describe('demo evidence under public/demo-evidence', () => {
  it('holds ASCII text only, so the bytes served are exactly the bytes hashed here', () => {
    for (const [name, text] of onDisk) {
      expect(/^[\t\n\r\x20-\x7e]*$/.test(text), `${name} must be plain ASCII`).toBe(true);
    }
  });

  it.each(Object.keys(DEMO_MANIFESTS))('%s on disk is the manifest the demo claim publishes', (fileName) => {
    const text = onDisk.get(fileName);
    expect(text, `${fileName} is missing`).toBeDefined();
    expect(JSON.parse(text ?? 'null')).toEqual(DEMO_MANIFESTS[fileName as keyof typeof DEMO_MANIFESTS]);
  });

  it('lists every public file with the SHA-256 of the file actually served', async () => {
    for (const manifest of Object.values(DEMO_MANIFESTS)) {
      for (const file of manifest.files) {
        if (file.public) {
          expect(await sha256Of(file.name), file.name).toBe(file.sha256);
        }
      }
    }
  });

  it('never publishes the private file itself, nor its name', async () => {
    const privateHashes: string[] = Object.values(DEMO_MANIFESTS).flatMap((manifest) =>
      manifest.files.filter((file) => !file.public).map((file) => file.sha256),
    );
    const servedHashes = await Promise.all([...onDisk.keys()].map(sha256Of));
    expect(privateHashes.length).toBeGreaterThan(0);
    expect(servedHashes.filter((hash) => hash !== undefined && privateHashes.includes(hash))).toEqual([]);
  });

  it('matches the onchain root of the demo claim, recomputed from the manifest', () => {
    const roots = MOCK_CLAIMS.find((claim) => claim.claimId === FULL_STORY_CLAIM_ID)?.evidenceRoots ?? [];
    expect(roots).toEqual([DEMO_ORIGINAL_ROOT]);
    const parsed = parseManifest(DEMO_MANIFESTS['manifest.json']);
    expect(parsed.ok).toBe(true);
    const check = parsed.ok ? checkManifest(parsed.value, FULL_STORY_CLAIM_ID, roots) : parsed;
    expect(check.ok, 'manifest for root 0').toBe(true);
  });

  it('lets a visitor re-create the supplementary bundle root from the downloadable files alone', async () => {
    const names = DEMO_MANIFESTS['manifest-proof-1.json'].files.map((file) => file.name);
    const files = await Promise.all(names.map(async (name) => ({ name, sha256: (await sha256Of(name)) ?? zeroAddress })));
    expect(checkBundle(files, DEMO_PROOF_ROOT)).toMatchObject({ ok: true, value: { kind: 'match' } });
  });
});

describe('demo claims', () => {
  it.each(MOCK_CLAIMS.map((claim) => [claim.status, claim] as const))('the %s claim tells one consistent story', (_status, claim) => {
    const events = claim.logs;
    const lastChange = events.findLast((log) => log.eventName === 'StatusChanged');
    const lastStatus = lastChange?.eventName === 'StatusChanged' ? statusNameFromIndex(lastChange.args.to) : undefined;
    expect(lastStatus).toEqual({ ok: true, value: claim.status });

    const anchor = events.find((log) => log.eventName === 'ClaimAnchored');
    expect(anchor?.eventName === 'ClaimAnchored' && anchor.args.evidenceRoot).toBe(claim.evidenceRoots[0]);
    expect(anchor?.timestamp).toBe(Number(claim.record.anchoredAt));

    const proofRoots = events.flatMap((log) => (log.eventName === 'ProofSubmitted' ? [log.args.supplementaryRoot] : []));
    expect(claim.evidenceRoots.slice(1)).toEqual(proofRoots);

    const checkpoint = events.find((log) => log.eventName === 'InternalAttestation');
    const verifier = checkpoint?.eventName === 'InternalAttestation' ? checkpoint.args.verifier : zeroAddress;
    expect(isAddressEqual(claim.record.internalVerifier, verifier)).toBe(true);

    const assignment = events.findLast((log) => log.eventName === 'AuditorAssigned');
    const auditor = assignment?.eventName === 'AuditorAssigned' ? assignment.args.auditor : zeroAddress;
    expect(isAddressEqual(claim.record.auditor, auditor)).toBe(true);

    for (const log of events) {
      expect(log.args.claimId).toBe(claim.claimId);
    }
  });

  it('includes the full lifecycle, from anchoring to a dismissed dispute', async () => {
    const view = await new MockClaimSource().getClaim(FULL_STORY_CLAIM_ID);
    const steps = view.ok ? view.value.timeline.map((entry) => [entry.action.kind, entry.newStatus]) : [];
    expect(steps).toEqual([
      ['anchored', 'Anchored'],
      ['deposit-locked', undefined],
      ['internal-attestation', 'InternallyVerified'],
      ['auditor-assigned', undefined],
      ['final-attestation', 'Verified'],
      ['deposit-locked', undefined],
      ['dispute-opened', 'Disputed'],
      ['deposit-locked', undefined],
      ['dispute-resolved', 'Verified'],
      ['credited', undefined],
      ['credited', undefined],
    ]);
  });

  it('includes a claim that is still waiting for the final decision', () => {
    expect(MOCK_CLAIMS.some((claim) => claim.status === 'InternallyVerified')).toBe(true);
  });
});
