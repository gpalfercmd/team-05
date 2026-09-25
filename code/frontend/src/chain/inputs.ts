// =============================================================================
// Proof of Aid — Team 05 — Form inputs for role actions: wallet addresses and note texts
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, isAddress, zeroAddress, type Address } from 'viem';
import { err, ok, type Result } from '../utils/result';

/** A pasted wallet address, checksum-validated; mixed case with a bad checksum is a typo, not an address. */
export function parseAddressInput(raw: string): Result<Address, string> {
  const value = raw.trim();
  let parsed: Result<Address, string>;
  if (value === '') {
    parsed = err('Enter a wallet address.');
  } else if (!isAddress(value)) {
    parsed = err('That is not a wallet address: 0x followed by 40 hexadecimal characters (check for a typo).');
  } else {
    parsed = ok(getAddress(value));
  }
  return parsed;
}

/**
 * Justifications, proof requests, counter-evidence and resolutions stay offchain: the contract
 * records only a salted fingerprint of the text (P10.3, `utils/noteHash`). This returns the text
 * exactly as it is hashed: trimmed once, never empty.
 */
export function parseNoteInput(raw: string): Result<string, string> {
  const value = raw.trim();
  const parsed: Result<string, string> =
    value === '' ? err('Write a short note. Only its fingerprint is recorded on the blockchain.') : ok(value);
  return parsed;
}

/**
 * The address forms call `buildCall` only with one valid address per input, so the fallback is never
 * sent; if it were, the registry would refuse it with `ZeroAddress`.
 */
export const addressAt = (addresses: readonly Address[], index: number): Address => addresses[index] ?? zeroAddress;

