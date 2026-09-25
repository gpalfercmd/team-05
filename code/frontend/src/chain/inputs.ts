// =============================================================================
// Proof of Aid — Team 05 — Form inputs for role actions: wallet addresses and note fingerprints
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, isAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
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
 * Justifications, proof requests and counter-evidence stay offchain: the contract records only
 * this keccak-256 fingerprint, so the note can be shown later and checked against the record.
 */
export function parseNoteInput(raw: string): Result<Hex, string> {
  const value = raw.trim();
  const parsed: Result<Hex, string> =
    value === '' ? err('Write a short note. Only its fingerprint is recorded on the blockchain.') : ok(keccak256(stringToHex(value)));
  return parsed;
}

/**
 * The address forms call `buildCall` only with one valid address per input, so the fallback is never
 * sent; if it were, the registry would refuse it with `ZeroAddress`.
 */
export const addressAt = (addresses: readonly Address[], index: number): Address => addresses[index] ?? zeroAddress;

