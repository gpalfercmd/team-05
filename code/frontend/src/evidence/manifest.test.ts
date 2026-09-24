// =============================================================================
// Proof of Aid — Team 05 — Tests: zod manifest schema agrees with code/shared/manifest.schema.json
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import manifestJsonSchema from '@shared/manifest.schema.json';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { manifestSchema, parseManifestText } from './manifest';

// The committed JSON Schema is the contract with the backend. zod converts it into a validator,
// and both validators must give the same verdict on every sample below.
const sharedValidator = z.fromJSONSchema(manifestJsonSchema as Parameters<typeof z.fromJSONSchema>[0]);

const CLAIM_ID = `0x${'ab'.repeat(32)}`;
const HASH_A = `0x${'11'.repeat(32)}`;
const HASH_B = `0x${'22'.repeat(32)}`;
const SALT = `0x${'cd'.repeat(32)}`;

const manifest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: 1,
  claimId: CLAIM_ID,
  rootIndex: 0,
  files: [
    { sha256: HASH_A, public: true, name: 'receipt-001.txt' },
    { sha256: HASH_B, public: false },
  ],
  ...overrides,
});

const VALID_SAMPLES: Record<string, unknown> = {
  'public and private files': manifest(),
  'a public file without a name': manifest({ files: [{ sha256: HASH_A, public: true }] }),
  'uppercase hex and a supplementary bundle': manifest({
    rootIndex: 3,
    files: [{ sha256: HASH_A.toUpperCase().replace('0X', '0x'), public: false }],
  }),
  'a version 2 list with a salted public file': manifest({
    version: 2,
    files: [
      { sha256: HASH_A, public: true, name: 'receipt-001.txt', salt: SALT },
      { sha256: HASH_B, public: false },
    ],
  }),
  'a version 2 list with an unsalted public file': manifest({ version: 2 }),
};

const INVALID_SAMPLES: Record<string, unknown> = {
  'a private file with a name (privacy rule)': manifest({
    files: [{ sha256: HASH_B, public: false, name: 'beneficiaries.xlsx' }],
  }),
  'an unknown version': manifest({ version: 3 }),
  'a private file with a salt (privacy rule)': manifest({
    version: 2,
    files: [{ sha256: HASH_B, public: false, salt: SALT }],
  }),
  'a salt that is not bytes32': manifest({ version: 2, files: [{ sha256: HASH_A, public: true, salt: '0x1234' }] }),
  'a missing version': (({ version: _version, ...rest }) => rest)(manifest()),
  'an empty file list': manifest({ files: [] }),
  'a short fingerprint': manifest({ files: [{ sha256: '0x1234', public: true }] }),
  'a claim ID that is not bytes32': manifest({ claimId: '0x1234' }),
  'a negative root index': manifest({ rootIndex: -1 }),
  'a fractional root index': manifest({ rootIndex: 1.5 }),
  'a name with folders': manifest({ files: [{ sha256: HASH_A, public: true, name: 'docs/receipt.txt' }] }),
  'an empty name': manifest({ files: [{ sha256: HASH_A, public: true, name: '' }] }),
  '"public" given as a string': manifest({ files: [{ sha256: HASH_A, public: 'true' }] }),
  'an extra field in a file entry': manifest({ files: [{ sha256: HASH_A, public: true, size: 12 }] }),
  'an extra top-level field': manifest({ uploadedBy: 'someone' }),
  'not an object': [manifest()],
};

describe('evidence manifest schema', () => {
  it.each(Object.entries(VALID_SAMPLES))('both schemas accept %s', (_name, sample) => {
    expect(manifestSchema.safeParse(sample).success).toBe(true);
    expect(sharedValidator.safeParse(sample).success).toBe(true);
  });

  it.each(Object.entries(INVALID_SAMPLES))('both schemas reject %s', (_name, sample) => {
    expect(manifestSchema.safeParse(sample).success).toBe(false);
    expect(sharedValidator.safeParse(sample).success).toBe(false);
  });

  it('rejects duplicate fingerprints in code, as the JSON Schema description requires', () => {
    const duplicated = manifest({
      files: [
        { sha256: HASH_A, public: true },
        { sha256: HASH_A.toUpperCase().replace('0X', '0x'), public: false },
      ],
    });
    expect(manifestJsonSchema.description).toContain('same sha256 are invalid');
    expect(manifestSchema.safeParse(duplicated).success).toBe(false);
  });

  it('rejects salts in a version 1 list in code, as the JSON Schema description requires', () => {
    const salted = manifest({ files: [{ sha256: HASH_A, public: true, salt: SALT }] });
    expect(manifestJsonSchema.description).toContain('version 1 manifest must carry no salt');
    expect(manifestSchema.safeParse(salted).success).toBe(false);
  });
});

describe('parseManifestText', () => {
  it('parses a valid file list', () => {
    expect(parseManifestText(JSON.stringify(manifest()))).toMatchObject({ ok: true, value: { rootIndex: 0 } });
  });

  it('explains text that is not JSON', () => {
    expect(parseManifestText('receipt-001.txt')).toEqual({
      ok: false,
      error: 'This file is not a file list: it is not valid JSON.',
    });
  });

  it('explains JSON that is not a manifest', () => {
    expect(parseManifestText('{"files": []}')).toMatchObject({
      ok: false,
      error: expect.stringContaining('This is not a valid file list.'),
    });
  });
});
