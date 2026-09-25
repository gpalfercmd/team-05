// =============================================================================
// Proof of Aid — Team 05 — Test helper: a scriptable stand-in for the wagmi hooks the role screens use
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { UserRejectedRequestError, type Address, type Hash, type PublicClient } from 'viem';
import { anvil } from 'viem/chains';
import type { AppEnv } from '../config/env';
import { AppConfigContext } from '../context/appConfigContext';
import { chainEnv } from './stubRegistryNode';

// Use in a test file with:
//   vi.mock('wagmi', async (importOriginal) => ({
//     ...(await importOriginal<typeof import('wagmi')>()),
//     ...(await import('../test/wagmiMock')).wagmiHooks,
//   }));
// then set `wallet` before rendering. The hooks keep real React state, so the screens go through
// the same render cycles as with a real wallet: pending, sent, confirmed or failed.

export const TX_HASH: Hash = `0x${'7a'.repeat(32)}`;

export type WriteOutcome = 'sent' | 'rejected' | 'pending';
export type ReceiptOutcome = 'success' | 'reverted' | 'pending';

export type WalletScript = {
  address: Address | undefined;
  chainId: number;
  client: PublicClient | undefined;
  write: WriteOutcome;
  receipt: ReceiptOutcome;
  /** What `signMessage` returns (backend login). */
  signature: Hash;
  /** Every `writeContract` request, in order. */
  written: Record<string, unknown>[];
  switched: number[];
  signed: string[];
};

export const wallet: WalletScript = {
  address: undefined,
  chainId: anvil.id,
  client: undefined,
  write: 'sent',
  receipt: 'success',
  signature: `0x${'11'.repeat(65)}`,
  written: [],
  switched: [],
  signed: [],
};

/** Connects `address` on `chainId` (anvil by default) with `client` answering reads. */
export function connectWallet(address: Address | undefined, client: PublicClient | undefined, chainId: number = anvil.id): void {
  Object.assign(wallet, {
    address,
    client,
    chainId,
    write: 'sent',
    receipt: 'success',
    written: [],
    switched: [],
    signed: [],
  } satisfies Partial<WalletScript>);
}

const rejection = () => new UserRejectedRequestError(new Error('User rejected the request.'));

function useConnection() {
  const connection =
    wallet.address === undefined
      ? { status: 'disconnected', address: undefined, chainId: undefined }
      : { status: 'connected', address: wallet.address, chainId: wallet.chainId };
  return connection;
}

function usePublicClient() {
  return wallet.client;
}

function useWriteContract() {
  const [state, setState] = useState<{ data: Hash | undefined; isPending: boolean; error: Error | null }>({
    data: undefined,
    isPending: false,
    error: null,
  });
  const mutate = (request: Record<string, unknown>) => {
    wallet.written.push(request);
    setState({ data: undefined, isPending: true, error: null });
    if (wallet.write === 'sent') {
      queueMicrotask(() => setState({ data: TX_HASH, isPending: false, error: null }));
    } else if (wallet.write === 'rejected') {
      queueMicrotask(() => setState({ data: undefined, isPending: false, error: rejection() }));
    }
  };
  const reset = () => setState({ data: undefined, isPending: false, error: null });
  return { ...state, mutate, reset };
}

function useWaitForTransactionReceipt({ hash }: { hash: Hash | undefined }) {
  const data =
    hash === undefined || wallet.receipt === 'pending' ? undefined : { status: wallet.receipt, transactionHash: hash };
  return { data, error: null, isLoading: hash !== undefined && data === undefined };
}

function useSwitchChain() {
  const [isPending, setPending] = useState(false);
  const mutate = ({ chainId }: { chainId: number }) => {
    wallet.switched.push(chainId);
    setPending(false);
  };
  return { mutate, isPending, error: null };
}

function useSignMessage() {
  const mutateAsync = async ({ message }: { message: string }) => {
    wallet.signed.push(message);
    return Promise.resolve(wallet.signature);
  };
  return { mutateAsync, isPending: false, error: null };
}

export const wagmiHooks = {
  useConnection,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useSignMessage,
};

/** Renders `ui` with the app config, a fresh query cache and a router (claim links). */
export function renderWithProviders(ui: ReactElement, env: AppEnv = chainEnv()): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] });
  const result = render(
    <AppConfigContext value={env}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppConfigContext>,
  );
  return result;
}
