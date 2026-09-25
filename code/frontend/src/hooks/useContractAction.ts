// =============================================================================
// Proof of Aid — Team 05 — Sends one contract call: simulate, sign (wagmi), wait for the receipt
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Hash } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import type { ContractCall } from '../chain/calls';
import { deriveTxPhase, isTxBusy, type Preflight, type TxPhase } from '../chain/txPhase';
import { describeContractFailure } from '../utils/contractErrors';
import { useAppConfig } from './useAppConfig';
import { useReadClient, useWallet } from './useWallet';

export type ContractAction = {
  phase: TxPhase;
  busy: boolean;
  run: (call: ContractCall) => Promise<void>;
  reset: () => void;
};

export type ContractActionOptions = {
  /** Called once per confirmed transaction, e.g. to clear a form. */
  onConfirmed?: (hash: Hash) => void;
};

export const WRONG_NETWORK_MESSAGE = 'Your wallet is on another network. Switch networks before signing.';
export const NO_WALLET_MESSAGE = 'Connect your wallet to sign this action.';

export function useContractAction(options: ContractActionOptions = {}): ContractAction {
  const { chain } = useAppConfig();
  const wallet = useWallet();
  const client = useReadClient();
  const queryClient = useQueryClient();
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: chain.id });
  const [preflight, setPreflight] = useState<Preflight>({ kind: 'idle' });
  const onConfirmed = useRef(options.onConfirmed);
  useEffect(() => {
    onConfirmed.current = options.onConfirmed;
  });

  const phase = deriveTxPhase({
    preflight,
    writePending: write.isPending,
    writeError: write.error,
    hash: write.data,
    receiptStatus: receipt.data?.status,
    receiptError: receipt.error,
  });

  // After a confirmed change every read (role, claim, credits, public page) is stale.
  const confirmedHash = phase.kind === 'confirmed' ? phase.hash : undefined;
  useEffect(() => {
    if (confirmedHash !== undefined) {
      void queryClient.invalidateQueries();
      onConfirmed.current?.(confirmedHash);
    }
  }, [confirmedHash, queryClient]);

  const run = async (call: ContractCall): Promise<void> => {
    write.reset();
    if (wallet.status !== 'connected' || client === undefined) {
      setPreflight({ kind: 'failed', message: NO_WALLET_MESSAGE });
      return;
    }
    if (wallet.wrongNetwork) {
      setPreflight({ kind: 'failed', message: WRONG_NETWORK_MESSAGE });
      return;
    }
    setPreflight({ kind: 'checking' });
    // Simulating first turns a contract rule the call would break into its plain-English error
    // before the wallet asks for a signature (wallets rarely pass the revert reason back).
    let failure: string | undefined;
    try {
      await client.simulateContract({ ...call, account: wallet.address });
    } catch (error: unknown) {
      failure = describeContractFailure(error);
    }
    setPreflight(failure === undefined ? { kind: 'idle' } : { kind: 'failed', message: failure });
    if (failure === undefined) {
      write.mutate({ ...call, account: wallet.address, chainId: chain.id });
    }
  };

  const reset = (): void => {
    write.reset();
    setPreflight({ kind: 'idle' });
  };

  const action: ContractAction = { phase, busy: isTxBusy(phase), run, reset };
  return action;
}
