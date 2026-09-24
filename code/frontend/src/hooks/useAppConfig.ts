// =============================================================================
// Proof of Aid — Team 05 — Hook to read the validated app configuration
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useContext } from 'react';
import type { AppEnv } from '../config/env';
import { AppConfigContext } from '../context/appConfigContext';

export function useAppConfig(): AppEnv {
  const env = useContext(AppConfigContext);
  if (env === null) {
    throw new Error('useAppConfig must be used inside <AppConfigContext value={env}>.');
  }
  return env;
}
