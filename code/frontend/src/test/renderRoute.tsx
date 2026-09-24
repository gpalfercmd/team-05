// =============================================================================
// Proof of Aid — Team 05 — Test helper: render a route inside the real provider stack
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { WagmiProvider } from 'wagmi';
import type { AppEnv } from '../config/env';
import { createWagmiConfig } from '../config/wagmi';
import { AppConfigContext } from '../context/appConfigContext';
import { routes } from '../routes';
import { testEnv } from './testEnv';

export function renderRoute(path: string, env: AppEnv = testEnv()): RenderResult {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppConfigContext value={env}>
      <WagmiProvider config={createWagmiConfig(env)}>
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </WagmiProvider>
    </AppConfigContext>,
  );
  return result;
}
