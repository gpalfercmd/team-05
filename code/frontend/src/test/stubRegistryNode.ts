// =============================================================================
// Proof of Aid — Team 05 — Test helper: a stub JSON-RPC node for both registries (role screens)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  getAddress,
  hexToBigInt,
  numberToHex,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { anvil } from 'viem/chains';
import type { RegistryAddresses } from '../chain/calls';
import { claimRegistryAbi, participantRegistryAbi } from '../config/contracts';
import type { AppEnv } from '../config/env';
import { statusIndexFromName, type ClaimStatusName } from '../utils/claimStatus';
import { testEnv } from './testEnv';

// Answers eth_call for both registries from a small in-memory state, so the role screens run
// their real reads and simulations through a real viem client, without a node.

/** Anvil's well-known development accounts, in the roles the demo scripts give them. */
export const WALLETS = {
  admin: getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
  authority: getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'),
  organization: getAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'),
  verifier1: getAddress('0x90F79bf6EB2c4f870365E785982E1f101E93b906'),
  verifier2: getAddress('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'),
  auditor: getAddress('0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'),
  disputant: getAddress('0x976EA74026E726554dB657fA54763abd0C3a0aa9'),
  stranger: getAddress('0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'),
} as const;

export const REGISTRIES: RegistryAddresses = {
  participantRegistry: getAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3'),
  claimRegistry: getAddress('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'),
};

export const chainEnv = (overrides: Partial<AppEnv> = {}): AppEnv =>
  testEnv({ contracts: { mode: 'chain', ...REGISTRIES, deployBlock: 0n }, ...overrides });

export const CLAIM_ID: Hex = `0x${'ab'.repeat(32)}`;

export type StubClaim = {
  organization: Address;
  status: ClaimStatusName;
  internalVerifier?: Address;
  auditor?: Address;
  roots?: Hex[];
  disputeWindowClosesAt?: bigint;
  settled?: boolean;
};

export type StubRevert = { errorName: string; args?: readonly unknown[] };

export type StubChainState = {
  /** Active organizations. */
  organizations: Address[];
  /** Active internal verifier → its organization. */
  verifiers: Record<Address, Address>;
  auditors: Address[];
  registryAdmin: Address;
  authority: Address;
  params: { anchorDeposit: bigint; auditorDeposit: bigint; disputeBond: bigint; disputeWindow: bigint };
  credits: Record<Address, bigint>;
  claims: Record<Hex, StubClaim>;
  /** Latest block timestamp. */
  now: bigint;
  /** A write function simulated here reverts with this custom error. */
  reverts: Record<string, StubRevert>;
  /** Every view call fails like an unreachable node. */
  failReads: boolean;
};

/** The demo deployment after `DemoLifecycle`: every role filled, reference deposits / 100. */
export function demoChainState(overrides: Partial<StubChainState> = {}): StubChainState {
  const state: StubChainState = {
    organizations: [WALLETS.organization],
    verifiers: { [WALLETS.verifier1]: WALLETS.organization, [WALLETS.verifier2]: WALLETS.organization },
    auditors: [WALLETS.auditor, WALLETS.disputant],
    registryAdmin: WALLETS.admin,
    authority: WALLETS.authority,
    params: {
      anchorDeposit: 10_100_000_000_000_000n,
      auditorDeposit: 1_000_000_000_000_000n,
      disputeBond: 1_000_000_000_000_000n,
      disputeWindow: 5_184_000n,
    },
    credits: {},
    claims: {},
    now: 1_800_000_000n,
    reverts: {},
    failReads: false,
    ...overrides,
  };
  return state;
}

export type SentCall = { to: Address; from: Address | undefined; functionName: string; args: readonly unknown[]; value: bigint };

type CallRequest = { to: Hex; from?: Hex; data: Hex; value?: Hex };

function viewResult(state: StubChainState, functionName: string, args: readonly unknown[]): unknown {
  const account = typeof args[0] === 'string' && args[0].length === 42 ? getAddress(args[0]) : zeroAddress;
  const claim = typeof args[0] === 'string' ? state.claims[args[0].toLowerCase() as Hex] : undefined;
  const results: Record<string, () => unknown> = {
    isRegistryAdmin: () => account === state.registryAdmin,
    isAccreditationAuthority: () => account === state.authority,
    isOrganization: () => state.organizations.includes(account),
    organizationOf: () => {
      const organization = state.verifiers[account];
      return organization !== undefined && state.organizations.includes(organization) ? organization : zeroAddress;
    },
    isAuditor: () => state.auditors.includes(account),
    activeVerifierCount: () =>
      state.organizations.includes(account) ? BigInt(Object.values(state.verifiers).filter((organization) => organization === account).length) : 0n,
    anchorDeposit: () => state.params.anchorDeposit,
    auditorDeposit: () => state.params.auditorDeposit,
    disputeBond: () => state.params.disputeBond,
    disputeWindow: () => state.params.disputeWindow,
    credits: () => state.credits[account] ?? 0n,
    getClaim: () => ({
      organization: claim?.organization ?? zeroAddress,
      status: statusIndexFromName(claim?.status ?? 'None'),
      internalVerifier: claim?.internalVerifier ?? zeroAddress,
      auditor: claim?.auditor ?? zeroAddress,
      anchoredAt: 0n,
      metadataHash: `0x${'00'.repeat(32)}`,
    }),
    evidenceRoots: () => claim?.roots ?? [],
    disputeWindowClosesAt: () => claim?.disputeWindowClosesAt ?? 0n,
    settled: () => claim?.settled ?? false,
  };
  const result = results[functionName];
  if (result === undefined) {
    throw new Error(`view ${functionName} not stubbed`);
  }
  return result();
}

/** A viem public client over the stub node, plus every write that was simulated through it. */
export function stubRegistryClient(state: StubChainState): { client: PublicClient; simulated: SentCall[] } {
  const simulated: SentCall[] = [];

  function call(request: CallRequest): Hex {
    const abi: Abi = getAddress(request.to) === REGISTRIES.claimRegistry ? claimRegistryAbi : participantRegistryAbi;
    const { functionName, args = [] } = decodeFunctionData({ abi, data: request.data });
    const item = abi.find((entry) => entry.type === 'function' && entry.name === functionName);
    const isView = item !== undefined && item.type === 'function' && (item.stateMutability === 'view' || item.stateMutability === 'pure');
    let result: Hex;
    if (isView) {
      if (state.failReads) {
        throw { code: -32603, message: 'internal error: upstream unavailable' };
      }
      result = encodeFunctionResult({ abi, functionName, result: viewResult(state, functionName, args) });
    } else {
      simulated.push({
        to: getAddress(request.to),
        from: request.from === undefined ? undefined : getAddress(request.from),
        functionName,
        args,
        value: request.value === undefined ? 0n : hexToBigInt(request.value),
      });
      const revert = state.reverts[functionName];
      if (revert !== undefined) {
        throw {
          code: 3,
          message: 'execution reverted',
          data: encodeErrorResult({ abi, errorName: revert.errorName, args: revert.args ?? [] }),
        };
      }
      result = '0x';
    }
    return result;
  }

  async function request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
    const list = Array.isArray(params) ? params : [];
    const handlers: Record<string, () => unknown> = {
      eth_chainId: () => numberToHex(anvil.id),
      eth_blockNumber: () => numberToHex(100n),
      eth_call: () => call(list[0] as CallRequest),
      eth_getBlockByNumber: () => ({
        number: numberToHex(100n),
        hash: numberToHex(100n, { size: 32 }),
        timestamp: numberToHex(state.now),
        transactions: [],
      }),
    };
    const handler = handlers[method];
    if (handler === undefined) {
      throw { code: -32601, message: `method ${method} not stubbed` };
    }
    return Promise.resolve(handler());
  }

  const client = createPublicClient({ chain: anvil, transport: custom({ request }, { retryCount: 0 }) });
  return { client, simulated };
}
