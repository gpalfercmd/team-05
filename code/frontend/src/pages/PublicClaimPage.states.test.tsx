// =============================================================================
// Proof of Aid — Team 05 — Tests: loading, not-found and error states of the public claim page
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Hex } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockClaimSource } from '../data/mockClaimSource';
import type { DataError } from '../data/source';
import { FULL_STORY_CLAIM_ID } from '../mocks/claims';
import { renderRoute } from '../test/renderRoute';
import { testEnv } from '../test/testEnv';
import type { ClaimView } from '../types/claim';
import { err, type Result } from '../utils/result';

// The chain source is replaced so each state can be produced on demand, without an RPC node.
const { getClaim } = vi.hoisted(() => ({ getClaim: vi.fn<(claimId: Hex) => Promise<Result<ClaimView, DataError>>>() }));
vi.mock('../data/createClaimSource', () => ({ createClaimSource: () => ({ kind: 'chain', getClaim }) }));

const CLAIM_ID = `0x${'42'.repeat(32)}`;
const chainEnv = testEnv({
  contracts: {
    mode: 'chain',
    claimRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    participantRegistry: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    deployBlock: 0n,
  },
});

describe('PublicClaimPage states', () => {
  beforeEach(() => {
    getClaim.mockReset();
  });

  it('says it is reading while the chain answers', async () => {
    getClaim.mockReturnValue(new Promise(() => undefined));
    renderRoute(`/claims/${CLAIM_ID}`, chainEnv);
    expect(await screen.findByRole('status')).toHaveTextContent('Reading this claim…');
  });

  it('reports a claim that statusOf says does not exist', async () => {
    getClaim.mockResolvedValue(err({ kind: 'not-found' }));
    renderRoute(`/claims/${CLAIM_ID}`, chainEnv);
    expect(await screen.findByText('No claim with this ID has been recorded.')).toBeInTheDocument();
  });

  it('explains an unreachable node in plain words and lets the visitor retry', async () => {
    const user = userEvent.setup();
    getClaim.mockResolvedValue(err({ kind: 'unavailable', detail: 'HTTP request failed.' }));
    renderRoute(`/claims/${CLAIM_ID}`, chainEnv);
    expect(
      await screen.findByText('We could not read this claim from the blockchain right now. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('HTTP request failed.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(getClaim).toHaveBeenCalledTimes(2);
  });

  it('explains a history the RPC endpoint refuses to return', async () => {
    getClaim.mockResolvedValue(err({ kind: 'history-too-large', detail: 'query returned more than 10000 results' }));
    renderRoute(`/claims/${CLAIM_ID}`, chainEnv);
    expect(await screen.findByRole('alert')).toHaveTextContent(/refused to return this claim’s history/);
  });

  it('says honestly which part came from the indexer API and which from the blockchain', async () => {
    const demo = await new MockClaimSource().getClaim(FULL_STORY_CLAIM_ID);
    getClaim.mockResolvedValue(demo.ok ? { ok: true, value: { ...demo.value, source: 'indexer' } } : demo);
    renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`, chainEnv);
    expect(
      await screen.findByText(/History from the indexer API; status and evidence fingerprints read directly from the blockchain/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/without any server in between/)).not.toBeInTheDocument();
  });

  it('does not query anything for a malformed claim ID', async () => {
    renderRoute('/claims/0x1234', chainEnv);
    expect(await screen.findByText('This link does not contain a valid claim ID.')).toBeInTheDocument();
    expect(getClaim).not.toHaveBeenCalled();
  });
});
