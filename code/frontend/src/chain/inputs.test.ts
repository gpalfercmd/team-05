// =============================================================================
// Proof of Aid — Team 05 — Tests: address and note inputs of the role forms
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { WALLETS } from '../test/stubRegistryNode';
import { parseAddressInput, parseNoteInput } from './inputs';

describe('parseAddressInput', () => {
  it('accepts lowercase and checksummed addresses and returns the checksummed form', () => {
    expect(parseAddressInput(` ${WALLETS.admin.toLowerCase()} `)).toEqual({ ok: true, value: WALLETS.admin });
    expect(parseAddressInput(WALLETS.admin)).toEqual({ ok: true, value: WALLETS.admin });
  });

  it('rejects empty input, malformed input and a bad checksum', () => {
    expect(parseAddressInput('')).toEqual({ ok: false, error: 'Enter a wallet address.' });
    expect(parseAddressInput('0x1234').ok).toBe(false);
    expect(parseAddressInput(WALLETS.admin.replace('F', 'f')).ok).toBe(false);
  });
});

describe('parseNoteInput', () => {
  it('returns the note trimmed once, exactly as it is fingerprinted', () => {
    expect(parseNoteInput('  Receipts match.  ')).toEqual({ ok: true, value: 'Receipts match.' });
  });

  it('requires a note', () => {
    expect(parseNoteInput('   ').ok).toBe(false);
  });
});
