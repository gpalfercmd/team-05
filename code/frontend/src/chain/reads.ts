// =============================================================================
// Proof of Aid — Team 05 — Validated contract reads for the role screens (role, deposits, claim state)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { BaseError, getAddress, isAddress, zeroAddress, type Address, type Hex, type PublicClient } from 'viem';
import { z } from 'zod';
import { claimRegistryAbi, participantRegistryAbi } from '../config/contracts';
import { statusNameFromIndex, type RecordedClaimStatus } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import type { RoleFlags } from '../utils/roles';
import type { RegistryAddresses } from './calls';

// The JSON ABIs type every return value as `unknown`, so each read is checked here, at the
// boundary, before any screen decides what a wallet may do.
const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), 'Expected an address')
  .transform((value) => getAddress(value));
const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Expected bytes32').transform((value) => value.toLowerCase() as Hex);
const weiSchema = z.bigint().nonnegative();

/** The minimal read surface used here; a viem PublicClient, or a stub in tests. */
export type ReadClient = Pick<PublicClient, 'readContract' | 'getBlock'>;

const describe = (error: unknown): string =>
  error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : 'unknown error';

async function readAll(client: ReadClient, calls: readonly Parameters<ReadClient['readContract']>[0][]): Promise<Result<unknown[], string>> {
  let values: Result<unknown[], string>;
  try {
    values = ok(await Promise.all(calls.map((call) => client.readContract(call))));
  } catch (error: unknown) {
    values = err(`The blockchain could not be read (${describe(error)}).`);
  }
  return values;
}

function parse<T>(schema: z.ZodType<T>, values: unknown): Result<T, string> {
  const parsed = schema.safeParse(values);
  const result: Result<T, string> = parsed.success
    ? ok(parsed.data)
    : err(`The contract returned values this page cannot read (${z.prettifyError(parsed.error)}).`);
  return result;
}

// --- Role ---------------------------------------------------------------------------------------

const roleFlagsSchema = z
  .tuple([z.boolean(), z.boolean(), z.boolean(), addressSchema, z.boolean()])
  .transform(([isRegistryAdmin, isAccreditationAuthority, isOrganization, organization, isAuditor]): RoleFlags => ({
    isRegistryAdmin,
    isAccreditationAuthority,
    isOrganization,
    verifierOrganization: organization === zeroAddress ? undefined : organization,
    isAuditor,
  }));

/** The ParticipantRegistry views that decide a wallet's role (the chain is the source of truth). */
export async function readRoleFlags(client: ReadClient, registry: RegistryAddresses, wallet: Address): Promise<Result<RoleFlags, string>> {
  const names = ['isRegistryAdmin', 'isAccreditationAuthority', 'isOrganization', 'organizationOf', 'isAuditor'] as const;
  const values = await readAll(
    client,
    names.map((functionName) => ({ address: registry.participantRegistry, abi: participantRegistryAbi, functionName, args: [wallet] })),
  );
  const flags = values.ok ? parse(roleFlagsSchema, values.value) : values;
  return flags;
}

// --- Deposits -----------------------------------------------------------------------------------

/** Payable amounts, always from the contract's parameter getters (never hardcoded). */
export type EscrowParams = {
  /** `anchorDeposit()` = organization penalty + auditor reward, paid by `anchorClaim`. */
  anchorDeposit: bigint;
  /** Paid by the auditor with an approving `attestFinal`. */
  auditorDeposit: bigint;
  /** Paid by `openDispute`. */
  disputeBond: bigint;
  /** Seconds a verified claim stays open to disputes. */
  disputeWindow: bigint;
};

const escrowParamsSchema = z
  .tuple([weiSchema, weiSchema, weiSchema, weiSchema])
  .transform(([anchorDeposit, auditorDeposit, disputeBond, disputeWindow]): EscrowParams => ({
    anchorDeposit,
    auditorDeposit,
    disputeBond,
    disputeWindow,
  }));

export async function readEscrowParams(client: ReadClient, registry: RegistryAddresses): Promise<Result<EscrowParams, string>> {
  const names = ['anchorDeposit', 'auditorDeposit', 'disputeBond', 'disputeWindow'] as const;
  const values = await readAll(
    client,
    names.map((functionName) => ({ address: registry.claimRegistry, abi: claimRegistryAbi, functionName })),
  );
  const params = values.ok ? parse(escrowParamsSchema, values.value) : values;
  return params;
}

/** Wei credited to `wallet` and not yet withdrawn. */
export async function readCredits(client: ReadClient, registry: RegistryAddresses, wallet: Address): Promise<Result<bigint, string>> {
  const values = await readAll(client, [
    { address: registry.claimRegistry, abi: claimRegistryAbi, functionName: 'credits', args: [wallet] },
  ]);
  const credits = values.ok ? parse(z.tuple([weiSchema]).transform(([amount]) => amount), values.value) : values;
  return credits;
}

/** `activeVerifierCount(organization)`: anchoring needs at least `MIN_INTERNAL_VERIFIERS` (1). */
export async function readActiveVerifierCount(
  client: ReadClient,
  registry: RegistryAddresses,
  organization: Address,
): Promise<Result<bigint, string>> {
  const values = await readAll(client, [
    { address: registry.participantRegistry, abi: participantRegistryAbi, functionName: 'activeVerifierCount', args: [organization] },
  ]);
  const count = values.ok ? parse(z.tuple([weiSchema]).transform(([value]) => value), values.value) : values;
  return count;
}

/** IClaimRegistry's `MIN_INTERNAL_VERIFIERS`: a single active verifier is enough to anchor. */
export const MIN_INTERNAL_VERIFIERS = 1n;

// --- Claim state for the action planner ---------------------------------------------------------

/** Everything the contract checks before a claim action, read for one claim and one wallet. */
export type ClaimActionState = {
  claimId: Hex;
  status: RecordedClaimStatus;
  organization: Address;
  /** Checkpoint-1 verifier; `undefined` before checkpoint 1. */
  internalVerifier: Address | undefined;
  /** Assigned auditor; `undefined` until the Authority assigns one. */
  auditor: Address | undefined;
  /** Number of onchain evidence roots; the next supplementary bundle gets this index. */
  rootCount: number;
  /** `isOrganization(claim.organization)`: a revoked organization's claim cannot be approved. */
  organizationActive: boolean;
  /** `organizationOf(viewer)`: the viewer's organization when it is an active internal verifier. */
  viewerOrganization: Address | undefined;
  /** `disputeWindowClosesAt`; 0 when the claim was never verified. */
  disputeWindowClosesAt: bigint;
  settled: boolean;
  /** Latest block timestamp: the contract's clock, not the visitor's (anvil can be moved forward). */
  now: bigint;
};

const claimRecordSchema = z.object({
  organization: addressSchema,
  status: z.number().int(),
  internalVerifier: addressSchema,
  auditor: addressSchema,
});

const claimStateSchema = z.tuple([
  claimRecordSchema,
  z.array(bytes32Schema),
  z.bigint().nonnegative(),
  z.boolean(),
  addressSchema,
]);

const optionalAddress = (value: Address): Address | undefined => (value === zeroAddress ? undefined : value);

async function readBlockTime(client: ReadClient): Promise<Result<bigint, string>> {
  let time: Result<bigint, string>;
  try {
    time = ok((await client.getBlock()).timestamp);
  } catch (error: unknown) {
    time = err(`The latest block could not be read (${describe(error)}).`);
  }
  return time;
}

/**
 * Reads one claim as the contract sees it, for `viewer`. `ok(undefined)` means no claim was ever
 * anchored under this ID (`status == None`).
 */
export async function readClaimActionState(
  client: ReadClient,
  registry: RegistryAddresses,
  claimId: Hex,
  viewer: Address,
): Promise<Result<ClaimActionState | undefined, string>> {
  const claimRead = (functionName: string) => ({ address: registry.claimRegistry, abi: claimRegistryAbi, functionName, args: [claimId] });
  const [values, now] = await Promise.all([
    readAll(client, [
      claimRead('getClaim'),
      claimRead('evidenceRoots'),
      claimRead('disputeWindowClosesAt'),
      claimRead('settled'),
      { address: registry.participantRegistry, abi: participantRegistryAbi, functionName: 'organizationOf', args: [viewer] },
    ]),
    readBlockTime(client),
  ]);
  const parsed = values.ok ? parse(claimStateSchema, values.value) : values;
  if (!parsed.ok) {
    return parsed;
  }
  if (!now.ok) {
    return err(now.error);
  }
  const [record, roots, closesAt, settled, viewerOrganization] = parsed.value;
  const status = statusNameFromIndex(record.status);
  if (!status.ok) {
    return err(status.error);
  }
  if (status.value === 'None') {
    return ok(undefined);
  }
  const active = await readAll(client, [
    { address: registry.participantRegistry, abi: participantRegistryAbi, functionName: 'isOrganization', args: [record.organization] },
  ]);
  const organizationActive = active.ok ? parse(z.tuple([z.boolean()]).transform(([value]) => value), active.value) : active;
  const state: Result<ClaimActionState | undefined, string> = organizationActive.ok
    ? ok({
        claimId: claimId.toLowerCase() as Hex,
        status: status.value,
        organization: record.organization,
        internalVerifier: optionalAddress(record.internalVerifier),
        auditor: optionalAddress(record.auditor),
        rootCount: roots.length,
        organizationActive: organizationActive.value,
        viewerOrganization: optionalAddress(viewerOrganization),
        disputeWindowClosesAt: closesAt,
        settled,
        now: now.value,
      })
    : organizationActive;
  return state;
}
