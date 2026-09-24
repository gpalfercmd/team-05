// =============================================================================
// Proof of Aid — Team 05 — Plain-language labels for evidence bundles and file-list problems
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { merkleErrorMessage } from '../utils/merkle';
import type { FileCheck, ManifestProblem } from './verification';

/** `evidenceRoots[0]` is the original bundle; each later root answers one proof request. */
export const bundleLabel = (rootIndex: number): string =>
  rootIndex === 0 ? 'Original evidence' : `Supplementary proof #${rootIndex}`;

/** Problems other than `manifest-mismatch`, which gets its own VerificationResult panel. */
export function manifestProblemMessage(problem: ManifestProblem): string {
  let message: string;
  switch (problem.kind) {
    case 'other-claim':
      message = 'This file list belongs to a different claim, so it cannot be used here.';
      break;
    case 'unknown-root':
      message = `This file list is for evidence bundle #${problem.rootIndex}, which this claim does not have.`;
      break;
    case 'invalid-hashes':
      message = `This file list cannot be checked. ${merkleErrorMessage(problem.error)}`;
      break;
    case 'manifest-mismatch':
      message = 'This file list does not match what was recorded on the blockchain; it may have been altered.';
      break;
  }
  return message;
}

/** Second sentence of a file result: where the file was found, or why it was not. */
export function fileCheckDetail(check: FileCheck, rootIndex: number): string {
  const bundle = bundleLabel(rootIndex).toLowerCase();
  let detail: string;
  if (check.kind === 'match' && check.visibility === 'private') {
    detail = `It is listed in the ${bundle} as a private file, so its name is not published.`;
  } else if (check.kind === 'match') {
    detail =
      check.listedName === undefined
        ? `It is listed in the ${bundle} as a public file.`
        : `It is listed in the ${bundle} as the public file “${check.listedName}”.`;
  } else {
    detail = check.sameNameListed
      ? `A file named “${check.file.name}” is listed in the ${bundle}, but its content is different.`
      : `Its fingerprint is not in the file list of the ${bundle}.`;
  }
  return detail;
}
