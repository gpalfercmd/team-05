// =============================================================================
// Proof of Aid — Team 05 — Entry point: validate the environment, then mount the app
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

// Global styles first so component styles, imported through App, come later in the cascade.
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConfigError } from './components/ConfigError';
import { loadEnv } from './config/env';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('index.html must contain an element with id "root".');
}

// Validated once at startup: the rest of the app only ever sees a typed, trusted AppEnv.
const envResult = loadEnv();

createRoot(rootElement).render(
  <StrictMode>
    {envResult.ok ? <App env={envResult.value} /> : <ConfigError message={envResult.error} />}
  </StrictMode>,
);
