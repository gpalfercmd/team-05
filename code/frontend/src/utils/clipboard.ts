// =============================================================================
// Proof of Aid — Team 05 — Clipboard write with graceful failure
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { err, ok, type Result } from './result';

/**
 * Copies text to the clipboard. The API is missing on insecure origins and the browser may deny
 * permission (a DOMException); every failure become an error result so the UI can say "Copy failed"
 * instead of throwing inside a click handler.
 */
export async function copyText(text: string): Promise<Result<void, string>> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    return err('Clipboard is not available in this browser.');
  }
  let result: Result<void, string>;
  try {
    await navigator.clipboard.writeText(text);
    result = ok(undefined);
  } catch (error: unknown) {
    // Any failure (denied permission, no focus, a polyfill's own error) is reported, never thrown.
    result = err(error instanceof Error ? error.message : 'The clipboard refused the copy.');
  }
  return result;
}
