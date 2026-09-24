// =============================================================================
// Proof of Aid — Team 05 — Test helpers: a valid AppEnv and rendering inside its context
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { render, type RenderResult } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { anvil } from 'viem/chains';
import type { AppEnv } from '../config/env';
import { AppConfigContext } from '../context/appConfigContext';

export function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  const env: AppEnv = {
    chainKey: 'anvil',
    chain: anvil,
    rpcUrl: undefined,
    apiUrl: undefined,
    contracts: { mode: 'mock' },
    ...overrides,
  };
  return env;
}

export const renderWithConfig = (ui: ReactElement, env: AppEnv = testEnv()): RenderResult =>
  render(createElement(AppConfigContext, { value: env }, ui));
