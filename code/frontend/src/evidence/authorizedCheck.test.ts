// =============================================================================
// Proof of Aid — Team 05 — Tests: reviewer checks of downloaded private files (P10.2)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import type { AuthorizedBundle, AuthorizedFile } from '../data/evidenceApi';
import { buildRoot, saltedSha256Hex, sha256Hex } from '../utils/merkle';
import { checkAuthorizedBundle, checkDownloadedFile, safeDownloadName } from './authorizedCheck';

const CLAIM_ID: Hex = `0x${'ab'.repeat(32)}`;
const SALT: Hex = `0x${'5a'.repeat(32)}`;
const bytesOf = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

async function unwrap(promise: Promise<{ ok: true; value: Hex } | { ok: false; error: string }>): Promise<Hex> {
  const result = await promise;
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

async function scenario() {
  const salted: AuthorizedFile = {
    id: 'f1',
    fingerprint: await unwrap(saltedSha256Hex(SALT, bytesOf('private delivery photo'))),
    salt: SALT,
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 22,
    isPublic: false,
    rootIndex: 0,
  };
  const legacy: AuthorizedFile = {
    ...salted,
    id: 'f2',
    fingerprint: await unwrap(sha256Hex(bytesOf('legacy receipt'))),
    salt: undefined,
    name: 'receipt.txt',
  };
  const bundle: AuthorizedBundle = { rootIndex: 0, files: [salted, legacy] };
  const root = buildRoot([salted.fingerprint, legacy.fingerprint]);
  if (!root.ok) {
    throw new Error('fixture root');
  }
  return { salted, legacy, bundle, root: root.value };
}

describe('reviewer checks', () => {
  it('accepts the backend file list only when it hashes to the onchain root', async () => {
    const { bundle, root } = await scenario();
    expect(checkAuthorizedBundle(CLAIM_ID, bundle, [root]).ok).toBe(true);
    const altered = checkAuthorizedBundle(CLAIM_ID, bundle, [`0x${'00'.repeat(32)}`]);
    expect(altered.ok ? undefined : altered.error.kind).toBe('manifest-mismatch');
  });

  it('matches the downloaded bytes against the salted fingerprint of that very file', async () => {
    const { salted, bundle, root } = await scenario();
    const verified = checkAuthorizedBundle(CLAIM_ID, bundle, [root]);
    if (!verified.ok) throw new Error('fixture');
    const check = await checkDownloadedFile(verified.value, salted, bytesOf('private delivery photo'));
    expect(check).toEqual({ ok: true, value: { kind: 'match', computed: salted.fingerprint } });
  });

  it('reports a mismatch for changed bytes, and for another file of the same bundle', async () => {
    const { salted, legacy, bundle, root } = await scenario();
    const verified = checkAuthorizedBundle(CLAIM_ID, bundle, [root]);
    if (!verified.ok) throw new Error('fixture');
    const changed = await checkDownloadedFile(verified.value, salted, bytesOf('private delivery photo!'));
    expect(changed.ok && changed.value.kind).toBe('mismatch');
    const swapped = await checkDownloadedFile(verified.value, salted, bytesOf('legacy receipt'));
    expect(swapped.ok && swapped.value.kind).toBe('mismatch');
    const legacyMatch = await checkDownloadedFile(verified.value, legacy, bytesOf('legacy receipt'));
    expect(legacyMatch.ok && legacyMatch.value.kind).toBe('match');
  });

  it('names downloads with a plain base name', () => {
    const fingerprint: Hex = `0x${'12345678'.repeat(8)}`;
    expect(safeDownloadName('report 2026.pdf', fingerprint)).toBe('report_2026.pdf');
    expect(safeDownloadName('../../etc/passwd', fingerprint)).toBe('passwd');
    expect(safeDownloadName('C:\\temp\\x<y>.jpg', fingerprint)).toBe('x_y_.jpg');
    expect(safeDownloadName('...', fingerprint)).toBe('evidence-12345678.bin');
  });
});
