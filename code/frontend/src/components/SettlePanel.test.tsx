// =============================================================================
// Proof of Aid — Team 05 — Tests: the claim page's Settle button (window closed on the chain clock)
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
import { chainEnv, demoChainState, stubRegistryClient, WALLETS } from '../test/stubRegistryNode';
import { connectWallet, wallet } from '../test/wagmiMock';
import type { ClaimView } from '../types/claim';
import type { Result } from '../utils/result';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../test/wagmiMock')).wagmiHooks,
}));

const { getClaim } = vi.hoisted(() => ({ getClaim: vi.fn<(claimId: Hex) => Promise<Result<ClaimView, DataError>>>() }));
vi.mock('../data/createClaimSource', () => ({ createClaimSource: () => ({ kind: 'chain', getClaim }) }));

async function verifiedClaim(closesAt: number, settled = false): Promise<Result<ClaimView, DataError>> {
  const demo = await new MockClaimSource().getClaim(FULL_STORY_CLAIM_ID);
  const claim: Result<ClaimView, DataError> = demo.ok
    ? { ok: true, value: { ...demo.value, source: 'chain', escrow: { lockedWei: 11n, disputeWindowClosesAt: closesAt, settled } } }
    : demo;
  return claim;
}

// The stub chain's clock reads 1_800_000_000.
const CLOSED = 1_700_000_000;
const OPEN = 1_900_000_000;

describe('SettlePanel on the public claim page', () => {
  beforeEach(() => {
    getClaim.mockReset();
    connectWallet(undefined, stubRegistryClient(demoChainState()).client);
  });

  it('lets any connected wallet settle once the window closed by the chain’s clock', async () => {
    getClaim.mockResolvedValue(await verifiedClaim(CLOSED));
    connectWallet(WALLETS.stranger, stubRegistryClient(demoChainState()).client);
    renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`, chainEnv());
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Settle deposits' }));
    expect(await screen.findByText(/Done ✓/)).toBeInTheDocument();
    expect(wallet.written[0]).toMatchObject({ functionName: 'settle', args: [FULL_STORY_CLAIM_ID] });
  });

  it('asks a visitor to connect a wallet, without needing a role', async () => {
    getClaim.mockResolvedValue(await verifiedClaim(CLOSED));
    renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`, chainEnv());
    expect(await screen.findByText(/Connect a wallet to settle\. Anyone may do it/)).toBeInTheDocument();
  });

  it('judges the Deposits card’s dispute window on the chain’s clock, not the visitor’s', async () => {
    // Closes in the visitor's future, but the stub chain's clock (1_800_000_000) is already past it.
    const inWallClockFuture = 1_790_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    getClaim.mockResolvedValue(await verifiedClaim(inWallClockFuture));
    renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`, chainEnv());
    expect(await screen.findByText(/^Dispute window closed/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settle the deposits' })).toBeInTheDocument();
  });

  it('is absent while the window is open and after settlement', async () => {
    getClaim.mockResolvedValue(await verifiedClaim(OPEN));
    const open = renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`, chainEnv());
    await screen.findByRole('heading', { name: 'Deposits' });
    expect(screen.queryByRole('heading', { name: 'Settle the deposits' })).not.toBeInTheDocument();
    open.unmount();
    getClaim.mockResolvedValue(await verifiedClaim(CLOSED, true));
    renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`, chainEnv());
    await screen.findByText('Settled: the deposits were paid out.');
    expect(screen.queryByRole('heading', { name: 'Settle the deposits' })).not.toBeInTheDocument();
  });

  it('never appears in demo mode', async () => {
    const closed = await verifiedClaim(CLOSED);
    getClaim.mockResolvedValue(closed.ok ? { ok: true, value: { ...closed.value, source: 'demo' } } : closed);
    connectWallet(WALLETS.stranger, stubRegistryClient(demoChainState()).client);
    renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`);
    await screen.findByRole('heading', { name: 'Deposits' });
    expect(screen.queryByRole('heading', { name: 'Settle the deposits' })).not.toBeInTheDocument();
  });
});
