// =============================================================================
// Proof of Aid — Team 05 — Tests: typed ABI subset matches the frozen IClaimRegistry ABI
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import frozenAbiJson from '@shared/abi/IClaimRegistry.json';
import {
  toEventSelector,
  toFunctionSelector,
  type Abi,
  type AbiEvent,
  type AbiFunction,
  type AbiParameter,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { CLAIM_EVENT_SELECTORS, claimRegistryReadAbi } from './claimRegistryAbi';

const frozenAbi = frozenAbiJson as Abi;

type EventParameter = AbiEvent['inputs'][number];

type CanonicalParameter = { name: string; type: string; indexed: boolean; components: CanonicalParameter[] };

// Everything that changes decoding or the selector is compared; `internalType` is compiler
// metadata (e.g. "enum IClaimRegistry.ClaimStatus" for a uint8) and does not reach the wire.
function canonicalParameter(parameter: AbiParameter | EventParameter): CanonicalParameter {
  const components = 'components' in parameter ? parameter.components : [];
  const canonical = {
    name: parameter.name ?? '',
    type: parameter.type,
    indexed: 'indexed' in parameter ? parameter.indexed === true : false,
    components: components.map(canonicalParameter),
  };
  return canonical;
}

function canonicalItem(item: AbiFunction | AbiEvent) {
  const canonical = {
    type: item.type,
    name: item.name,
    inputs: item.inputs.map(canonicalParameter),
    outputs: item.type === 'function' ? item.outputs.map(canonicalParameter) : [],
    stateMutability: item.type === 'function' ? item.stateMutability : undefined,
  };
  return canonical;
}

const subsetItems = claimRegistryReadAbi.filter(
  (item): item is Extract<(typeof claimRegistryReadAbi)[number], AbiFunction | AbiEvent> =>
    item.type === 'function' || item.type === 'event',
);

function frozenItem(type: 'function' | 'event', name: string): AbiFunction | AbiEvent | undefined {
  const match = frozenAbi.find(
    (item): item is AbiFunction | AbiEvent => (item.type === 'function' || item.type === 'event') && item.type === type && item.name === name,
  );
  return match;
}

describe('typed ClaimRegistry ABI subset', () => {
  it.each(subsetItems.map((item) => [`${item.type} ${item.name}`, item] as const))(
    '%s is identical in code/shared/abi/IClaimRegistry.json',
    (_label, item) => {
      const frozen = frozenItem(item.type, item.name);
      expect(frozen, `${item.name} is missing from the frozen ABI`).toBeDefined();
      expect(canonicalItem(item)).toEqual(frozen === undefined ? undefined : canonicalItem(frozen));
    },
  );

  it('uses the same selectors as the frozen ABI', () => {
    for (const item of subsetItems) {
      const frozen = frozenItem(item.type, item.name);
      const selector = item.type === 'function' ? toFunctionSelector(item) : toEventSelector(item);
      const frozenSelector =
        frozen?.type === 'function' ? toFunctionSelector(frozen) : frozen === undefined ? undefined : toEventSelector(frozen);
      expect(selector).toBe(frozenSelector);
    }
  });

  it('includes every claim-scoped IClaimRegistry event, so no timeline entry can be silently dropped', () => {
    const frozenEvents = frozenAbi.filter((item): item is AbiEvent => item.type === 'event');
    const claimScoped = frozenEvents.filter((event) => event.inputs[0]?.name === 'claimId');
    expect(frozenEvents).toHaveLength(14);
    expect(frozenEvents.filter((event) => !claimScoped.includes(event)).map((event) => event.name)).toEqual(['Withdrawn']);
    expect(new Set(claimScoped.map((event) => toEventSelector(event)))).toEqual(CLAIM_EVENT_SELECTORS);
  });

  it('has claimId as the first indexed parameter of every event (the eth_getLogs topic filter)', () => {
    for (const item of subsetItems.filter((entry) => entry.type === 'event')) {
      expect(item.inputs[0]).toMatchObject({ name: 'claimId', type: 'bytes32', indexed: true });
    }
  });
});
