// =============================================================================
// Proof of Aid — Team 05 — Where the demo evidence files and their file lists are served from
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

// The demo claim is also anchored on the live deployment, and the backend has no record of it
// (a Foundry script anchored it). Its files and file lists ship with the app under
// public/demo-evidence/, so demo mode and chain mode read them from the same place.

/** Folder of public/demo-evidence/ as the app serves it (respects Vite's `base`). */
export const DEMO_EVIDENCE_PATH = `${import.meta.env.BASE_URL}demo-evidence/`;

/** The published file lists in that folder, one per evidence bundle of the demo claim. */
export const DEMO_MANIFEST_FILES = ['manifest.json', 'manifest-proof-1.json'] as const;

export type DemoManifestFile = (typeof DEMO_MANIFEST_FILES)[number];
