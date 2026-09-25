// =============================================================================
// Proof of Aid — Team 05 — Inline wallet address inside a sentence (short, full value on hover, copy button)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address } from 'viem';
import { truncateMiddle } from '../utils/format';
import { CopyButton } from './CopyButton';

type AddressTextProps = { address: Address };

// Sentences stay readable with the short form; the full address is in `title` for comparison,
// and the transaction's HashDisplay next to it links to the explorer for the complete record.
export function AddressText({ address }: AddressTextProps) {
  return (
    <span className="address-text">
      <code title={address}>{truncateMiddle(address)}</code>
      <CopyButton value={address} label={`address ${truncateMiddle(address)}`} />
    </span>
  );
}
