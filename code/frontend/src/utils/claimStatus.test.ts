// =============================================================================
// Proof of Aid — Team 05 — Tests keeping the ClaimStatus mapping in sync with the contracts
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import claimStatusJson from '@shared/abi/claim-status.json';
import { describe, expect, it } from 'vitest';
import {
  CLAIM_STATUS_NAMES,
  RECORDED_CLAIM_STATUSES,
  STATUS_META,
  statusIndexFromName,
  statusNameFromIndex,
} from './claimStatus';

describe('claim status mapping', () => {
  it('matches the enum order exported from IClaimRegistry', () => {
    expect([...CLAIM_STATUS_NAMES]).toEqual(claimStatusJson.values);
  });

  it('maps every uint8 index to its name and back', () => {
    CLAIM_STATUS_NAMES.forEach((name, index) => {
      expect(statusNameFromIndex(index)).toEqual({ ok: true, value: name });
      expect(statusIndexFromName(name)).toBe(index);
    });
  });

  it('rejects indexes the enum does not define', () => {
    expect(statusNameFromIndex(CLAIM_STATUS_NAMES.length).ok).toBe(false);
    expect(statusNameFromIndex(-1).ok).toBe(false);
    expect(statusNameFromIndex(1.5).ok).toBe(false);
  });

  it('has a label and icon for every recorded status, and none for "None"', () => {
    const expected = claimStatusJson.values.filter((name) => name !== 'None');
    expect([...RECORDED_CLAIM_STATUSES]).toEqual(expected);
    expect(Object.keys(STATUS_META).sort()).toEqual([...expected].sort());
  });
});
