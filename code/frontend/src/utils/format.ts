// =============================================================================
// Proof of Aid — Team 05 — Display formatting for hashes, addresses and timestamps
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

const ELLIPSIS = '…';

// UTC keeps the rendered date identical for every visitor and in tests; the audience compares
// records across time zones, so a local time would make the same claim read differently.
const timestampFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/**
 * Keeps the start and the end of a hash visible (`0x3f2a…1b73`), which is what people compare
 * by eye. Values that would not get shorter are returned unchanged.
 */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  const validCounts = Number.isInteger(head) && Number.isInteger(tail) && head >= 0 && tail >= 0;
  if (!validCounts || value.length <= head + tail + ELLIPSIS.length) {
    return value;
  }
  // slice(-0) would return the whole string, so the tail is cut by absolute position.
  const truncated = `${value.slice(0, head)}${ELLIPSIS}${value.slice(value.length - tail)}`;
  return truncated;
}

/** Formats an onchain `uint64` timestamp (seconds since the epoch) as a UTC date and time. */
export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'Unknown date';
  }
  const formatted = `${timestampFormatter.format(new Date(seconds * 1000))} UTC`;
  return formatted;
}
