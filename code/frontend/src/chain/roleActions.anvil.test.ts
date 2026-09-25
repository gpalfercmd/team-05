// @vitest-environment node
// =============================================================================
// Proof of Aid — Team 05 — End-to-end: the role screens' calls against real contracts on local anvil
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import anvilDeployment from '@shared/deployments/anvil.json';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  stringToHex,
  type Account,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { anvil } from 'viem/chains';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClaim, readSession, requestChallenge, uploadEvidence, verifyLogin } from '../data/evidenceApi';
import { claimRegistryAbi } from '../config/contracts';
import type { FetchLike } from '../data/httpJson';
import { describeContractFailure } from '../utils/contractErrors';
import { resolveRole, type Role } from '../utils/roles';
import {
  accreditAuditorCall,
  anchorClaimCall,
  assignAuditorCall,
  attestFinalCall,
  attestInternalCall,
  confirmProofCall,
  openDisputeCall,
  registerInternalVerifierCall,
  registerOrganizationCall,
  requestProofCall,
  revokeAuditorCall,
  revokeOrganizationCall,
  settleCall,
  submitProofCall,
  withdrawCall,
  type ContractCall,
  type RegistryAddresses,
} from './calls';
import { planClaimActions } from './claimActions';
import { readClaimActionState, readCredits, readEscrowParams, readRoleFlags, type EscrowParams } from './reads';

// Opt-in: runs only against a chain prepared as in docs/RUNBOOK.md path B (anvil + Deploy +
// DemoLifecycle), e.g.
//   ANVIL_E2E_RPC=http://127.0.0.1:8545 pnpm vitest run src/chain/roleActions.anvil.test.ts
// With ANVIL_E2E_API (the backend on that chain, indexed after DemoLifecycle) the organization
// also records its claim and its proof through the evidence service, exactly like the screen.
// Each call is simulated, signed and mined with the builders the screens use; the wallets are
// the demo mnemonic's accounts (index 3 verifier, 4 auditor, 5 disputant, 6 stranger), never real keys.
const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const RPC = processEnv.ANVIL_E2E_RPC;
const API = processEnv.ANVIL_E2E_API;

const MNEMONIC = 'test test test test test test test test test test test junk';
const account = (index: number) => mnemonicToAccount(MNEMONIC, { addressIndex: index });
const admin = account(0);
const authority = account(1);
const organization = account(2);
// The demo script registers a single verifier and skips the proof loop; the proof-loop
// test below registers its own second verifier to keep covering the four-eyes path.
const verifier = account(3);
const auditor = account(4);
const disputant = account(5);
const stranger = account(6);

const registries: RegistryAddresses = {
  claimRegistry: getAddress(anvilDeployment.claimRegistry),
  participantRegistry: getAddress(anvilDeployment.participantRegistry),
};

// Anvil mines instantly: poll receipts every 100 ms instead of viem's default 4 s.
const publicClient = createPublicClient({ chain: anvil, transport: http(RPC), pollingInterval: 100 });
const testClient = createTestClient({ chain: anvil, mode: 'anvil', transport: http(RPC) });

/** Simulate (as the screens do), sign, send and wait: fails the test unless the receipt is a success. */
async function send(signer: Account, call: ContractCall): Promise<void> {
  await publicClient.simulateContract({ ...call, account: signer });
  const wallet = createWalletClient({ account: signer, chain: anvil, transport: http(RPC) });
  const hash = await wallet.writeContract({ ...call, account: signer, chain: anvil });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
}

/** The sentence a screen would show if `signer` tried `call`. */
async function refusal(signer: Account, call: ContractCall): Promise<string> {
  let message = 'no revert';
  try {
    await publicClient.simulateContract({ ...call, account: signer });
  } catch (error: unknown) {
    message = describeContractFailure(error);
  }
  return message;
}

async function roleOf(address: Address): Promise<Role> {
  const flags = await readRoleFlags(publicClient, registries, address);
  if (!flags.ok) {
    throw new Error(flags.error);
  }
  return resolveRole(flags.value);
}

async function plan(role: Role, viewer: Address, claimId: Hex) {
  const state = await readClaimActionState(publicClient, registries, claimId, viewer);
  if (!state.ok || state.value === undefined) {
    throw new Error(state.ok ? 'claim not found' : state.error);
  }
  return { state: state.value, ...planClaimActions(role, viewer, state.value) };
}

const kinds = async (role: Role, viewer: Address, claimId: Hex) => (await plan(role, viewer, claimId)).actions.map((action) => action.kind);

const note = (text: string): Hex => keccak256(stringToHex(text));

/** Node's fetch keeps no cookies; the browser does. This jar plays the browser for the session cookie. */
function cookieJarFetch(): FetchLike {
  let cookie: string | undefined;
  const jarFetch: FetchLike = async (input, init) => {
    const headers = new Headers(init.headers);
    if (cookie !== undefined) {
      headers.set('Cookie', cookie);
    }
    const response = await globalThis.fetch(input, { ...init, headers });
    const set = response.headers.getSetCookie();
    if (set.length > 0) {
      cookie = set.map((value) => value.split(';')[0]).join('; ');
    }
    return response;
  };
  return jarFetch;
}

type Prepared = { claimId: Hex; evidenceRoot: Hex; metadataHash: Hex };

describe.skipIf(RPC === undefined)('role screens’ calls against the local anvil deployment', { timeout: 60_000 }, () => {
  let params: EscrowParams;
  let claim: Prepared;
  const orgFetch = cookieJarFetch();

  beforeAll(async () => {
    const read = await readEscrowParams(publicClient, registries);
    if (!read.ok) {
      throw new Error(read.error);
    }
    params = read.value;
    const tag = generatePrivateKey();
    claim = { claimId: keccak256(tag), evidenceRoot: note(`root ${tag}`), metadataHash: note(`metadata ${tag}`) };
  });

  it('reads every demo wallet’s role from the ParticipantRegistry', async () => {
    expect(await roleOf(admin.address)).toBe('registryAdmin');
    expect(await roleOf(authority.address)).toBe('accreditationAuthority');
    expect(await roleOf(organization.address)).toBe('organization');
    expect(await roleOf(verifier.address)).toBe('internalVerifier');
    expect(await roleOf(auditor.address)).toBe('auditor');
    expect(await roleOf(disputant.address)).toBe('auditor');
    expect(await roleOf(stranger.address)).toBe('public');
  });

  it('Registry Admin registers and revokes an organization; the Authority accredits and revokes an auditor', async () => {
    const freshOrganization = privateKeyToAccount(generatePrivateKey()).address;
    const freshAuditor = privateKeyToAccount(generatePrivateKey()).address;
    await send(admin, registerOrganizationCall(registries, freshOrganization));
    expect(await roleOf(freshOrganization)).toBe('organization');
    await send(admin, revokeOrganizationCall(registries, freshOrganization));
    expect(await roleOf(freshOrganization)).toBe('public');
    await send(authority, accreditAuditorCall(registries, freshAuditor));
    expect(await roleOf(freshAuditor)).toBe('auditor');
    await send(authority, revokeAuditorCall(registries, freshAuditor));
    expect(await roleOf(freshAuditor)).toBe('public');
    // Who may call what is the contract's rule, and the screens explain a refusal in words.
    expect(await refusal(authority, registerOrganizationCall(registries, freshAuditor))).toBe(
      'Your wallet does not have permission for this action.',
    );
    expect(await refusal(admin, registerOrganizationCall(registries, freshOrganization))).toBe(
      'This wallet already has a role. Each wallet can hold only one role.',
    );
  });

  it.skipIf(API === undefined)('organization records the claim through the evidence service (login, create, upload)', async () => {
    const api = API ?? '';
    const challenge = await requestChallenge(orgFetch, api, organization.address);
    expect(challenge.ok).toBe(true);
    const signature = await organization.signMessage({ message: challenge.ok ? challenge.value : '' });
    expect(await verifyLogin(orgFetch, api, organization.address, signature)).toEqual({ ok: true, value: organization.address });
    expect(await readSession(orgFetch, api)).toEqual({ ok: true, value: organization.address });
    const created = await createClaim(orgFetch, api, {
      title: 'P5.3 end-to-end claim',
      description: 'Recorded by the anvil end-to-end test through the evidence service.',
      locationRegion: 'District X',
      claimDate: '2026-09-25',
    });
    expect(created.ok).toBe(true);
    const receipt = new File([`receipt ${claim.claimId}`], 'receipt.txt', { type: 'text/plain' });
    const bundle = created.ok ? await uploadEvidence(orgFetch, api, created.value.claimId, { files: [receipt], isPublic: true, rootIndex: 0 }) : created;
    expect(bundle.ok).toBe(true);
    if (created.ok && bundle.ok) {
      claim = { claimId: created.value.claimId, metadataHash: created.value.metadataHash, evidenceRoot: bundle.value.evidenceRoot };
    }
  });

  it('organization anchors, paying anchorDeposit() read from the contract', async () => {
    const lockedBefore = await publicClient.getBalance({ address: registries.claimRegistry });
    await send(organization, anchorClaimCall(registries, claim, params.anchorDeposit));
    expect(await publicClient.getBalance({ address: registries.claimRegistry })).toBe(lockedBefore + params.anchorDeposit);
    expect((await plan('organization', organization.address, claim.claimId)).state.status).toBe('Anchored');
  });

  it('internal verifier attests checkpoint 1; the Authority assigns the auditor', async () => {
    expect(await kinds('internalVerifier', verifier.address, claim.claimId)).toEqual(['attestInternal']);
    await send(verifier, attestInternalCall(registries, claim.claimId, true, note('receipts match')));
    expect(await kinds('accreditationAuthority', authority.address, claim.claimId)).toEqual(['assignAuditor']);
    await send(authority, assignAuditorCall(registries, claim.claimId, auditor.address));
    expect(await kinds('auditor', auditor.address, claim.claimId)).toEqual(['requestProof', 'attestFinal']);
    expect(await kinds('auditor', disputant.address, claim.claimId)).toEqual([]);
  });

  it('proof loop: auditor requests, organization submits bundle #1, a second verifier confirms', async () => {
    // The single-verifier demo skips this loop; register a second verifier here so the
    // four-eyes path (same-verifier refusal, other-verifier confirmation) stays covered.
    const secondVerifier = privateKeyToAccount(generatePrivateKey());
    await testClient.setBalance({ address: secondVerifier.address, value: 10n ** 17n });
    await send(admin, registerInternalVerifierCall(registries, secondVerifier.address, organization.address));
    await send(auditor, requestProofCall(registries, claim.claimId, note('stock count please')));
    const organizationPlan = await plan('organization', organization.address, claim.claimId);
    expect(organizationPlan.actions).toEqual([{ kind: 'submitProof', rootIndex: 1 }]);
    let proofRoot = note(`proof ${claim.claimId}`);
    if (API !== undefined) {
      const stock = new File([`stock count ${claim.claimId}`], 'stock-count.txt', { type: 'text/plain' });
      const bundle = await uploadEvidence(orgFetch, API, claim.claimId, { files: [stock], isPublic: false, rootIndex: 1 });
      expect(bundle).toMatchObject({ ok: true, value: { rootIndex: 1 } });
      proofRoot = bundle.ok ? bundle.value.evidenceRoot : proofRoot;
    }
    await send(organization, submitProofCall(registries, claim.claimId, proofRoot));
    expect(await kinds('internalVerifier', verifier.address, claim.claimId)).toEqual([]);
    expect(await refusal(verifier, confirmProofCall(registries, claim.claimId, true, note('ok')))).toBe(
      'A different internal verifier must confirm this proof.',
    );
    expect(await kinds('internalVerifier', secondVerifier.address, claim.claimId)).toEqual(['confirmProof']);
    await send(secondVerifier, confirmProofCall(registries, claim.claimId, true, note('stock count matches')));
  });

  it('auditor approves, locking auditorDeposit(); disputes are open to others only', async () => {
    await send(auditor, attestFinalCall(registries, claim.claimId, true, note('approved'), params.auditorDeposit));
    expect(await kinds('auditor', disputant.address, claim.claimId)).toEqual(['openDispute']);
    expect(await kinds('organization', organization.address, claim.claimId)).toEqual([]);
    expect(await kinds('auditor', auditor.address, claim.claimId)).toEqual([]);
    expect(await refusal(organization, openDisputeCall(registries, claim.claimId, note('x'), params.disputeBond))).toBe(
      'The organization and the approving auditor cannot dispute their own claim.',
    );
    expect(await refusal(stranger, settleCall(registries, claim.claimId))).toBe(
      'This claim can only be settled once its dispute window has closed.',
    );
  });

  it('after the dispute window anyone settles, and the organization withdraws its credits', async () => {
    await testClient.increaseTime({ seconds: Number(params.disputeWindow) + 1 });
    await testClient.mine({ blocks: 1 });
    expect(await kinds('public', stranger.address, claim.claimId)).toEqual(['settle']);
    const before = await readCredits(publicClient, registries, organization.address);
    await send(stranger, settleCall(registries, claim.claimId));
    const credited = await readCredits(publicClient, registries, organization.address);
    expect(before.ok && credited.ok && credited.value - before.value).toBe(await organizationPenalty());
    expect(await kinds('public', stranger.address, claim.claimId)).toEqual([]);

    const balanceBefore = await publicClient.getBalance({ address: organization.address });
    await send(organization, withdrawCall(registries));
    expect(await readCredits(publicClient, registries, organization.address)).toEqual({ ok: true, value: 0n });
    const balanceAfter = await publicClient.getBalance({ address: organization.address });
    // The balance grows by the credits minus the gas of the withdrawal.
    expect(credited.ok && balanceAfter > balanceBefore + credited.value - 10n ** 15n).toBe(true);
    expect(await refusal(organization, withdrawCall(registries))).toBe('This wallet has no funds waiting to be withdrawn.');
  });
});

/** Settling credits the organization its penalty; read it from the contract rather than assume it. */
async function organizationPenalty(): Promise<bigint> {
  const penalty = await publicClient.readContract({
    address: registries.claimRegistry,
    abi: claimRegistryAbi,
    functionName: 'organizationPenalty',
  });
  return typeof penalty === 'bigint' ? penalty : -1n;
}
