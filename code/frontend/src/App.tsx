// =============================================================================
// Proof of Aid — Team 05 — App root: providers and router only
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
// Everything comes from the single `react-router` entry: mixing in `react-router/dom` (which only
// adds flushSync navigation, unused here) loads two copies of the router under Node/Vitest.
import { createBrowserRouter, RouterProvider } from 'react-router';
import { WagmiProvider } from 'wagmi';
import type { AppEnv } from './config/env';
import { createWagmiConfig } from './config/wagmi';
import { AppConfigContext } from './context/appConfigContext';
import { routes } from './routes';

type AppProps = { env: AppEnv };

export function App({ env }: AppProps) {
  // Lazy state keeps one instance of each for the app's lifetime (StrictMode renders twice).
  const [wagmiConfig] = useState(() => createWagmiConfig(env));
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AppConfigContext value={env}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </WagmiProvider>
    </AppConfigContext>
  );
}
