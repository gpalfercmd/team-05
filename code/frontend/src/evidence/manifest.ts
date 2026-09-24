// =============================================================================
// Proof of Aid — Team 05 — Evidence manifest (per-bundle file list): zod mirror of the JSON Schema
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import { z } from 'zod';
import { err, ok, type Result } from '../utils/result';

// Mirrors code/shared/manifest.schema.json, the format agreed with the backend (P3/P4). A test
// runs both schemas over the same samples so they cannot drift apart. A manifest is untrusted
// input: parsing it only proves its shape; `checkManifest` then proves it against the chain.

const bytes32Schema = z.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
  'Expected a 0x-prefixed 32-byte hex value',
);

const publicFileSchema = z.strictObject({
  sha256: bytes32Schema,
  public: z.literal(true),
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\]+$/, 'A file name cannot contain folders')
    .optional(),
});

// strictObject: a private entry carrying a `name` (possible personal data) is rejected outright.
const privateFileSchema = z.strictObject({
  sha256: bytes32Schema,
  public: z.literal(false),
});

export const manifestSchema = z
  .strictObject({
    version: z.literal(1),
    claimId: bytes32Schema,
    rootIndex: z.int().nonnegative(),
    files: z.array(z.discriminatedUnion('public', [publicFileSchema, privateFileSchema])).min(1),
  })
  .refine(
    (manifest) => {
      const hashes = manifest.files.map((file) => file.sha256.toLowerCase());
      return new Set(hashes).size === hashes.length;
    },
    { message: 'Each file fingerprint can appear only once', path: ['files'] },
  );

export type EvidenceManifest = z.infer<typeof manifestSchema>;

export type ManifestFile = EvidenceManifest['files'][number];

/** A file list larger than this is not a plausible manifest; refusing it keeps parsing cheap. */
export const MAX_MANIFEST_BYTES = 1024 * 1024;

export function parseManifest(raw: unknown): Result<EvidenceManifest, string> {
  const parsed = manifestSchema.safeParse(raw);
  const result: Result<EvidenceManifest, string> = parsed.success
    ? ok(parsed.data)
    : err(`This is not a valid file list. ${z.prettifyError(parsed.error)}`);
  return result;
}

/** Parses a manifest file chosen by the visitor (JSON text). */
export function parseManifestText(text: string): Result<EvidenceManifest, string> {
  let json: Result<unknown, string>;
  try {
    json = ok(JSON.parse(text));
  } catch {
    json = err('This file is not a file list: it is not valid JSON.');
  }
  const result = json.ok ? parseManifest(json.value) : json;
  return result;
}
