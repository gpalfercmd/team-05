// =============================================================================
// Proof of Aid — Team 05 — React context carrying the validated app configuration
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { createContext } from 'react';
import type { AppEnv } from '../config/env';

// `null` default: reading it outside the provider is a wiring bug that useAppConfig reports.
export const AppConfigContext = createContext<AppEnv | null>(null);
