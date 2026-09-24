// =============================================================================
// Proof of Aid — Team 05 — Vite and Vitest configuration
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// ABIs and the ClaimStatus enum live in code/shared so every layer reads the same frozen files.
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));
const frontendDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': sharedDir },
  },
  server: {
    // The dev server only serves files inside the project root; code/shared sits one level up.
    fs: { allow: [frontendDir, sharedDir] },
  },
  build: {
    rolldownOptions: {
      output: {
        // The web3 and React libraries are most of the bundle and change far less often than the
        // app code, so separate chunks stay cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'web3', test: /node_modules[\\/](viem|wagmi|@wagmi|@tanstack|ox|abitype|@noble|@scure)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
