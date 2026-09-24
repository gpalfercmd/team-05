// =============================================================================
// Proof of Aid — Team 05 — Plain-language sentence for each timeline action
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Address } from 'viem';
import type { TimelineAction } from '../types/claim';
import { truncateMiddle } from './format';

/** Text, or a wallet address the page renders in monospace with its full value on hover. */
export type SentencePart = string | { address: Address };

// Human label first, technical value second (DESIGN.md): every sentence names the role, then
// shows the wallet that acted, so a donor can follow the story without knowing what a wallet is.
export function describeAction(action: TimelineAction): SentencePart[] {
  let parts: SentencePart[];
  switch (action.kind) {
    case 'anchored':
      parts = ['Organization ', { address: action.organization }, ' recorded the claim and the fingerprint of its evidence.'];
      break;
    case 'internal-attestation':
      parts = [
        'Internal verifier ',
        { address: action.verifier },
        action.approved ? ' approved the evidence (checkpoint 1).' : ' rejected the evidence (checkpoint 1).',
      ];
      break;
    case 'auditor-assigned':
      parts =
        action.previousAuditor === undefined
          ? ['The Accreditation Authority assigned auditor ', { address: action.auditor }, '.']
          : [
              'The Accreditation Authority replaced auditor ',
              { address: action.previousAuditor },
              ' with auditor ',
              { address: action.auditor },
              '.',
            ];
      break;
    case 'proof-requested':
      parts = ['Auditor ', { address: action.auditor }, ' requested more proof.'];
      break;
    case 'proof-submitted':
      parts = [`The organization submitted supplementary proof (bundle #${action.rootIndex}).`];
      break;
    case 'proof-reviewed':
      parts = [
        'A second internal verifier (',
        { address: action.verifier },
        action.accepted ? ') confirmed the proof.' : ') sent the proof back to the organization.',
      ];
      break;
    case 'final-attestation':
      parts = [
        'Auditor ',
        { address: action.auditor },
        action.approved ? ' gave the final approval.' : ' rejected the claim (final decision).',
      ];
      break;
    case 'dispute-opened':
      parts = [{ address: action.disputant }, ' opened a dispute.'];
      break;
    case 'dispute-resolved':
      parts = [
        action.upheld
          ? 'The Accreditation Authority upheld the dispute: the claim is rejected.'
          : 'The Accreditation Authority dismissed the dispute: the claim stays verified.',
      ];
      break;
    case 'status-changed':
      parts = ['The claim’s status changed.'];
      break;
  }
  return parts;
}

/** The sentence as plain text, with addresses shortened as they appear on screen. */
export const sentenceText = (parts: readonly SentencePart[]): string =>
  parts.map((part) => (typeof part === 'string' ? part : truncateMiddle(part.address))).join('');
