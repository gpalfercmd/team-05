// =============================================================================
// Proof of Aid — Team 05 — Tests: internal verifier, auditor and settle actions on a claim
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { openClaim, renderAs } from '../../test/roleScreens';
import { CLAIM_ID, demoChainState, WALLETS, type StubChainState, type StubClaim } from '../../test/stubRegistryNode';
import { wallet } from '../../test/wagmiMock';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../../test/wagmiMock')).wagmiHooks,
}));

const withClaim = (overrides: Partial<StubClaim>, state: Partial<StubChainState> = {}) =>
  demoChainState({
    claims: { [CLAIM_ID]: { organization: WALLETS.organization, status: 'Anchored', roots: [CLAIM_ID], ...overrides } },
    ...state,
  });

// Deliberately odd amounts: the buttons and the sent value must come from the contract getters.
const params = { anchorDeposit: 111n, auditorDeposit: 1_234_000_000_000_000n, disputeBond: 2_500_000_000_000_000n, disputeWindow: 60n };

describe('internal verifier', () => {
  it('approves checkpoint 1 on its organization’s claim with a fingerprinted note', async () => {
    const { user } = renderAs(WALLETS.verifier1, withClaim({}));
    const panel = await openClaim(user, CLAIM_ID);
    await user.type(within(panel).getByLabelText('Justification'), 'Receipts match the delivery list.');
    await user.click(within(panel).getByRole('button', { name: 'Approve evidence' }));
    await within(panel).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'attestInternal', args: [CLAIM_ID, true, expect.stringMatching(/^0x/)] });
  });

  it('disables every button while the transaction is pending', async () => {
    const { user } = renderAs(WALLETS.verifier1, withClaim({}));
    const panel = await openClaim(user, CLAIM_ID);
    wallet.write = 'pending';
    await user.type(within(panel).getByLabelText('Justification'), 'Missing receipts.');
    await user.click(within(panel).getByRole('button', { name: 'Reject claim' }));
    expect(await within(panel).findByRole('button', { name: 'Confirm in wallet…' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Approve evidence' })).toBeDisabled();
  });

  it('confirms submitted proof, unless it approved checkpoint 1 itself', async () => {
    const submitted = withClaim({ status: 'ProofSubmitted', internalVerifier: WALLETS.verifier1, auditor: WALLETS.auditor });
    const first = renderAs(WALLETS.verifier1, submitted);
    const panel = await openClaim(first.user, CLAIM_ID);
    expect(panel).toHaveTextContent('a different internal verifier must confirm this proof');
    expect(within(panel).queryByRole('button', { name: 'Accept proof' })).not.toBeInTheDocument();
    first.view.unmount();

    const second = renderAs(WALLETS.verifier2, submitted);
    const other = await openClaim(second.user, CLAIM_ID);
    await second.user.type(within(other).getByLabelText('Justification'), 'Stock count checked.');
    await second.user.click(within(other).getByRole('button', { name: 'Accept proof' }));
    await within(other).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'confirmProof', args: [CLAIM_ID, true, expect.any(String)] });
  });

  it('cannot act on another organization’s claim', async () => {
    const { user } = renderAs(WALLETS.verifier1, withClaim({ organization: WALLETS.stranger }));
    const panel = await openClaim(user, CLAIM_ID);
    expect(panel).toHaveTextContent('Only internal verifiers of this claim’s organization can check it.');
    expect(within(panel).queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('auditor', () => {
  const assigned = { status: 'InternallyVerified', internalVerifier: WALLETS.verifier1, auditor: WALLETS.auditor } as const;

  it('approves paying the auditor deposit read from the contract', async () => {
    const { user, simulated } = renderAs(WALLETS.auditor, withClaim(assigned, { params }));
    const panel = await openClaim(user, CLAIM_ID);
    const approve = await within(panel).findByRole('button', { name: 'Approve and lock 0.001234 ETH' });
    await user.type(within(panel).getByLabelText('Justification'), 'All bundles reviewed.');
    await user.click(approve);
    await within(panel).findByText(/Done ✓/);
    expect(simulated[0]).toMatchObject({ functionName: 'attestFinal', value: 1_234_000_000_000_000n });
    expect(wallet.written[0]).toMatchObject({ functionName: 'attestFinal', value: 1_234_000_000_000_000n });
  });

  it('rejects paying nothing', async () => {
    const { user } = renderAs(WALLETS.auditor, withClaim(assigned, { params }));
    const panel = await openClaim(user, CLAIM_ID);
    await user.type(within(panel).getByLabelText('Justification'), 'Evidence does not support the claim.');
    await user.click(within(panel).getByRole('button', { name: 'Reject claim' }));
    await within(panel).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'attestFinal', args: [CLAIM_ID, false, expect.any(String)], value: 0n });
  });

  it('requests more proof', async () => {
    const { user } = renderAs(WALLETS.auditor, withClaim(assigned));
    const panel = await openClaim(user, CLAIM_ID);
    await user.type(within(panel).getByLabelText('What proof is missing?'), 'A stock count for the warehouse.');
    await user.click(within(panel).getByRole('button', { name: 'Request proof' }));
    await within(panel).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'requestProof' });
  });

  it('cannot approve a claim whose organization was revoked', async () => {
    const { user } = renderAs(WALLETS.auditor, withClaim(assigned, { organizations: [] }));
    const panel = await openClaim(user, CLAIM_ID);
    expect(within(panel).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Request proof' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Reject claim' })).toBeInTheDocument();
  });

  it('disputes another auditor’s verified claim inside the window, paying the bond from the contract', async () => {
    const verified = { ...assigned, status: 'Verified', disputeWindowClosesAt: 1_900_000_000n } as const;
    const { user } = renderAs(WALLETS.disputant, withClaim(verified, { params }));
    const panel = await openClaim(user, CLAIM_ID);
    await user.type(within(panel).getByLabelText('Counter-evidence'), 'Beneficiary list duplicated.');
    await user.click(within(panel).getByRole('button', { name: 'Open dispute and lock 0.0025 ETH' }));
    await within(panel).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'openDispute', value: 2_500_000_000_000_000n });
  });

  it('cannot dispute the claim it approved', async () => {
    const verified = { ...assigned, status: 'Verified', disputeWindowClosesAt: 1_900_000_000n } as const;
    const { user } = renderAs(WALLETS.auditor, withClaim(verified));
    const panel = await openClaim(user, CLAIM_ID);
    expect(panel).toHaveTextContent('cannot dispute their own claim');
    expect(within(panel).queryByRole('button', { name: /Open dispute/ })).not.toBeInTheDocument();
  });

  it('keeps payable buttons disabled when the amounts cannot be read', async () => {
    const { user, client } = renderAs(WALLETS.auditor, withClaim(assigned));
    const readContract = client.readContract.bind(client);
    vi.spyOn(client, 'readContract').mockImplementation((request) =>
      request.functionName === 'auditorDeposit' ? Promise.reject(new Error('down')) : readContract(request),
    );
    const panel = await openClaim(user, CLAIM_ID);
    expect(await within(panel).findByText(/The deposit amounts could not be read/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Approve and lock the deposit' })).toBeDisabled();
  });
});

describe('settle (any wallet)', () => {
  const closed = {
    status: 'Verified',
    internalVerifier: WALLETS.verifier1,
    auditor: WALLETS.auditor,
    disputeWindowClosesAt: 1_700_000_000n,
  } as const;

  it('lets a wallet without a role settle once the window has closed on the chain clock', async () => {
    const { user } = renderAs(WALLETS.stranger, withClaim(closed));
    const panel = await openClaim(user, CLAIM_ID);
    await user.click(within(panel).getByRole('button', { name: 'Settle deposits' }));
    await within(panel).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'settle', args: [CLAIM_ID] });
  });

  it('is not offered while the window is open', async () => {
    const { user } = renderAs(WALLETS.stranger, withClaim({ ...closed, disputeWindowClosesAt: 1_900_000_000n }));
    const panel = await openClaim(user, CLAIM_ID);
    expect(within(panel).queryByRole('button', { name: 'Settle deposits' })).not.toBeInTheDocument();
    expect(screen.getByText(/Open to disputes until/)).toBeInTheDocument();
  });
});
