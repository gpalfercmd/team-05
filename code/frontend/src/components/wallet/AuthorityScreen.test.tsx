// =============================================================================
// Proof of Aid — Team 05 — Tests: Accreditation Authority screen (auditors, assignment, disputes)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { openClaim, renderAs } from '../../test/roleScreens';
import { json, stubFetch } from '../../test/stubFetch';
import { CLAIM_ID, chainEnv, demoChainState, REGISTRIES, WALLETS, type StubClaim } from '../../test/stubRegistryNode';
import { wallet } from '../../test/wagmiMock';
import { NO_API_QUEUE_NOTE } from './ClaimWorkbench';

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  ...(await import('../../test/wagmiMock')).wagmiHooks,
}));

const claim = (overrides: Partial<StubClaim>): Record<`0x${string}`, StubClaim> => ({
  [CLAIM_ID]: { organization: WALLETS.organization, status: 'InternallyVerified', internalVerifier: WALLETS.verifier1, roots: [CLAIM_ID], ...overrides },
});

describe('Accreditation Authority screen', () => {
  it('accredits auditors but never registers organizations', async () => {
    const { user } = renderAs(WALLETS.authority, demoChainState());
    const accredit = await screen.findByRole('form', { name: 'Accredit an auditor' });
    expect(screen.getByRole('form', { name: 'Revoke an auditor' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Register an organization' })).not.toBeInTheDocument();
    await user.type(within(accredit).getByLabelText('Auditor wallet'), WALLETS.stranger);
    await user.click(within(accredit).getByRole('button', { name: 'Accredit auditor' }));
    await within(accredit).findByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ address: REGISTRIES.participantRegistry, functionName: 'accreditAuditor', args: [WALLETS.stranger] });
  });

  it('says a claim ID is needed without the indexer API', async () => {
    renderAs(WALLETS.authority, demoChainState());
    expect(await screen.findByText(NO_API_QUEUE_NOTE)).toBeInTheDocument();
  });

  it('assigns an auditor to an internally verified claim', async () => {
    const { user } = renderAs(WALLETS.authority, demoChainState({ claims: claim({}) }));
    const panel = await openClaim(user, CLAIM_ID);
    expect(panel).toHaveTextContent('Waiting for the Accreditation Authority to assign an auditor.');
    expect(within(panel).getByRole('heading', { name: 'Claim 0xabab…abab' })).toHaveFocus();
    await user.type(within(panel).getByLabelText('Auditor wallet'), WALLETS.auditor);
    await user.click(within(panel).getByRole('button', { name: 'Assign auditor' }));
    await within(panel).findAllByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'assignAuditor', args: [CLAIM_ID, WALLETS.auditor] });
  });

  it('explains when the chosen wallet is not an active auditor', async () => {
    const { user } = renderAs(
      WALLETS.authority,
      demoChainState({ claims: claim({}), reverts: { assignAuditor: { errorName: 'NotActiveAuditor', args: [WALLETS.stranger] } } }),
    );
    const panel = await openClaim(user, CLAIM_ID);
    await user.type(within(panel).getByLabelText('Auditor wallet'), WALLETS.stranger);
    await user.click(within(panel).getByRole('button', { name: 'Assign auditor' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('This wallet is not an active, accredited auditor.');
  });

  it('resolves a dispute: uphold or dismiss, with a note', async () => {
    const { user } = renderAs(WALLETS.authority, demoChainState({ claims: claim({ status: 'Disputed', auditor: WALLETS.auditor }) }));
    const panel = await openClaim(user, CLAIM_ID);
    await user.click(within(panel).getByRole('button', { name: 'Dismiss dispute' }));
    expect(within(panel).getByLabelText('Decision note')).toHaveAccessibleDescription(/Write a short note/);
    expect(wallet.written).toHaveLength(0);
    await user.type(within(panel).getByLabelText('Decision note'), 'Counter-evidence does not hold.');
    await user.click(within(panel).getByRole('button', { name: 'Dismiss dispute' }));
    await within(panel).findAllByText(/Done ✓/);
    expect(wallet.written[0]).toMatchObject({ functionName: 'resolveDispute', args: [CLAIM_ID, false, expect.stringMatching(/^0x[0-9a-f]{64}$/)] });
  });

  it('can only uphold a dispute once the organization was revoked', async () => {
    const { user } = renderAs(
      WALLETS.authority,
      demoChainState({ organizations: [], claims: claim({ status: 'Disputed', auditor: WALLETS.auditor }) }),
    );
    const panel = await openClaim(user, CLAIM_ID);
    expect(within(panel).getByRole('button', { name: 'Uphold dispute' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Dismiss dispute' })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent('the dispute can only be upheld');
  });

  it('lists the claims waiting for it from the indexer API and opens one', async () => {
    const api = 'http://api.test';
    const item = (status: string) => ({ claimId: CLAIM_ID, organization: WALLETS.organization.toLowerCase(), status });
    const page = (...items: unknown[]) => json({ items, total: items.length, limit: 100, offset: 0, indexedToBlock: 1 });
    const { fetch } = stubFetch({
      [`${api}/public/claims?status=InternallyVerified&limit=100`]: page(item('InternallyVerified')),
      [`${api}/public/claims?status=ProofRequested&limit=100`]: page(),
      [`${api}/public/claims?status=ProofSubmitted&limit=100`]: page(),
      [`${api}/public/claims?status=Disputed&limit=100`]: page(),
    });
    vi.stubGlobal('fetch', fetch);
    const { user } = renderAs(WALLETS.authority, demoChainState({ claims: claim({}) }), chainEnv({ apiUrl: api }));
    await user.click(await screen.findByRole('button', { name: 'Show actions for claim 0xabab…abab' }));
    expect(await screen.findByRole('button', { name: 'Assign auditor' })).toBeInTheDocument();
  });

  it('reports a claim that was never recorded', async () => {
    const { user } = renderAs(WALLETS.authority, demoChainState());
    const panel = await openClaim(user, CLAIM_ID);
    expect(panel).toHaveTextContent('No claim with this ID has been recorded on the blockchain.');
  });
});
