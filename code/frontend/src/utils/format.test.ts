// =============================================================================
// Proof of Aid — Team 05 — Tests for hash truncation and timestamp formatting
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { describe, expect, it } from 'vitest';
import { formatTimestamp, truncateMiddle } from './format';

const TX_HASH = `0x3f2a${'0'.repeat(56)}1b73`;

describe('truncateMiddle', () => {
  it('keeps the first 6 and last 4 characters of a hash (DESIGN.md example)', () => {
    expect(truncateMiddle(TX_HASH)).toBe('0x3f2a…1b73');
  });

  it('truncates a 20-byte address the same way', () => {
    expect(truncateMiddle('0x9A5055dde27365353c0a11168f9B5CF5d3E175b7')).toBe('0x9A50…75b7');
  });

  it('returns the value unchanged when truncating would not make it shorter', () => {
    expect(truncateMiddle('')).toBe('');
    expect(truncateMiddle('0x12')).toBe('0x12');
    // 6 + 1 (ellipsis) + 4 = 11 characters: the boundary stays intact.
    expect(truncateMiddle('0123456789a')).toBe('0123456789a');
  });

  it('truncates as soon as the value is one character past the boundary', () => {
    expect(truncateMiddle('0123456789ab')).toBe('012345…89ab');
  });

  it('honours custom head and tail lengths, including zero', () => {
    expect(truncateMiddle(TX_HASH, 4, 2)).toBe('0x3f…73');
    expect(truncateMiddle(TX_HASH, 6, 0)).toBe('0x3f2a…');
    expect(truncateMiddle(TX_HASH, 0, 4)).toBe('…1b73');
  });

  it('returns the value unchanged for negative, fractional or NaN lengths', () => {
    expect(truncateMiddle(TX_HASH, -1, 4)).toBe(TX_HASH);
    expect(truncateMiddle(TX_HASH, 6, 2.5)).toBe(TX_HASH);
    expect(truncateMiddle(TX_HASH, Number.NaN, 4)).toBe(TX_HASH);
  });
});

describe('formatTimestamp', () => {
  it('formats onchain seconds as a UTC date and time', () => {
    expect(formatTimestamp(0)).toBe('1 Jan 1970, 00:00 UTC');
  });

  it('reports invalid timestamps instead of showing a wrong date', () => {
    expect(formatTimestamp(-1)).toBe('Unknown date');
    expect(formatTimestamp(Number.NaN)).toBe('Unknown date');
  });
});
