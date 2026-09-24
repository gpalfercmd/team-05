// =============================================================================
// Proof of Aid — Team 05 — Claim history from the P4 indexer API; status and roots from the contract
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { isAddressEqual, type Address, type Hex } from 'viem';
import type { ClaimSource, ClaimView } from '../types/claim';
import { statusIndexFromName } from '../utils/claimStatus';
import { err, ok, type Result } from '../utils/result';
import { assembleClaimView } from './assembleClaimView';
import type { ChainClaimSource, ContractState } from './chainClaimSource';
import { apiEndpoint, browserFetch, DEFAULT_TIMEOUT_MS, getJson, type FetchLike } from './httpJson';
import { parseIndexedTimeline, type IndexedTimeline } from './indexedTimeline';
import type { ClaimDataSource, DataError } from './source';
import { byChainPosition, type ClaimEventLog } from './timeline';

/** A timeline is a few kilobytes; anything near this is not an answer from our indexer. */
const MAX_TIMELINE_BYTES = 2 * 1024 * 1024;

export type ApiClaimSourceOptions = {
  apiUrl: string;
  /** The deployment the page is configured for; the API must be indexing the same one. */
  chainId: number;
  claimRegistry: Address;
  fetch?: FetchLike | undefined;
};

type History = { logs: readonly ClaimEventLog[]; source: ClaimSource };

const sameHex = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Roots in the order the history recorded them: the anchor's, then one per proof submission. */
const recordedRoots = (logs: readonly ClaimEventLog[]): Hex[] =>
  logs.flatMap((log) =>
    log.eventName === 'ClaimAnchored' ? [log.args.evidenceRoot] : log.eventName === 'ProofSubmitted' ? [log.args.supplementaryRoot] : [],
  );

/**
 * The indexed history must end where the contract is now: its last status change leads to
 * `statusOf`, and the roots it recorded are exactly `evidenceRoots`. This catches a corrupt index
 * or events of a reorged block; a merely late index is caught by the freshness check below.
 */
function agreesWithContract(logs: readonly ClaimEventLog[], state: ContractState): boolean {
  const ordered = logs.toSorted(byChainPosition);
  const lastStatus = ordered.findLast((log) => log.eventName === 'StatusChanged');
  const roots = recordedRoots(ordered);
  const agrees =
    lastStatus?.eventName === 'StatusChanged' &&
    lastStatus.args.to === statusIndexFromName(state.status) &&
    roots.length === state.evidenceRoots.length &&
    roots.every((root, index) => sameHex(root, state.evidenceRoots[index] ?? ''));
  return agrees;
}

/**
 * P4 source. Status, record and evidence roots always come from the contract views (through the
 * chain source), so no integrity check depends on the backend. The API only replaces the slowest
 * read, the event-log scan, and only when its history is provably complete.
 *
 * Staleness rule: the API history is used only if (1) it indexes this chain and this registry,
 * (2) it has an `indexedToBlock`, (3) it agrees with the contract's current status and roots, and
 * (4) the chain holds no event of this claim after `indexedToBlock` (one `eth_getLogs` over that
 * short tail). Every state change of a claim emits an event, so (4) proves the index misses
 * nothing. Otherwise, or when the API is unreachable, answers non-2xx or sends malformed data,
 * the whole history is read from the chain as `ChainClaimSource` does: never less than without it.
 */
export class ApiClaimSource implements ClaimDataSource {
  readonly kind = 'indexer';
  readonly #chain: ChainClaimSource;
  readonly #apiUrl: string;
  readonly #chainId: number;
  readonly #claimRegistry: Address;
  readonly #fetch: FetchLike;

  constructor(chain: ChainClaimSource, options: ApiClaimSourceOptions) {
    this.#chain = chain;
    this.#apiUrl = options.apiUrl;
    this.#chainId = options.chainId;
    this.#claimRegistry = options.claimRegistry;
    this.#fetch = options.fetch ?? browserFetch;
  }

  async getClaim(claimId: Hex): Promise<Result<ClaimView, DataError>> {
    const [state, indexed] = await Promise.all([this.#chain.readState(claimId), this.#fetchTimeline(claimId)]);
    if (!state.ok) {
      return state;
    }
    const [history, published] = await Promise.all([
      this.#history(claimId, state.value, indexed),
      this.#chain.publishedFor(claimId, state.value.evidenceRoots),
    ]);
    if (!history.ok) {
      return history;
    }
    const view = assembleClaimView({ claimId, ...state.value, logs: history.value.logs, published }, history.value.source);
    return view;
  }

  async #fetchTimeline(claimId: Hex): Promise<Result<IndexedTimeline, string>> {
    const url = apiEndpoint(this.#apiUrl, `/public/claims/${claimId.toLowerCase()}/timeline`);
    const raw = await getJson(this.#fetch, url, { timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: MAX_TIMELINE_BYTES });
    const timeline = raw.ok ? parseIndexedTimeline(raw.value) : raw;
    return timeline;
  }

  async #history(claimId: Hex, state: ContractState, indexed: Result<IndexedTimeline, string>): Promise<Result<History, DataError>> {
    const fresh = indexed.ok ? await this.#completeIndexedLogs(claimId, state, indexed.value) : indexed;
    if (fresh.ok) {
      return ok({ logs: fresh.value, source: 'indexer' });
    }
    const scanned = await this.#chain.readHistory(claimId);
    const history: Result<History, DataError> = scanned.ok ? ok({ logs: scanned.value, source: 'chain' }) : scanned;
    return history;
  }

  /** The indexed logs if the staleness rule above accepts them; otherwise why not. */
  async #completeIndexedLogs(claimId: Hex, state: ContractState, timeline: IndexedTimeline): Promise<Result<readonly ClaimEventLog[], string>> {
    if (!sameHex(timeline.claimId, claimId)) {
      return err('The indexer answered for another claim.');
    }
    if (timeline.chainId !== this.#chainId || !isAddressEqual(timeline.claimRegistry, this.#claimRegistry)) {
      return err('The indexer follows another deployment.');
    }
    if (timeline.indexedToBlock === undefined) {
      return err('The indexer has not processed any block yet.');
    }
    if (!agreesWithContract(timeline.logs, state)) {
      return err('The indexed history does not end in the contract’s current status and roots.');
    }
    const later = await this.#chain.readHistory(claimId, timeline.indexedToBlock + 1n);
    const complete: Result<readonly ClaimEventLog[], string> = !later.ok
      ? err('The chain could not confirm that the index is up to date.')
      : later.value.length > 0
        ? err('The indexer is behind: the claim changed after its last indexed block.')
        : ok(timeline.logs);
    return complete;
  }
}
