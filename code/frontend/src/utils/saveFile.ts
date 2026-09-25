// =============================================================================
// Proof of Aid — Team 05 — Hand bytes already in the page to the browser as a file download
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

// Private evidence is fetched with the session cookie (a plain link cannot send it cross-origin),
// so the page saves the bytes itself. They are typed as an opaque download, never rendered.

const REVOKE_AFTER_MS = 10_000;

/** Saves `bytes` under `name` (already a safe base name) through a temporary object URL. */
export function saveBytes(bytes: ArrayBuffer, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
