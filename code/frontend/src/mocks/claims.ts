// =============================================================================
// Proof of Aid — Team 05 — Demo claims (contract state + event history) for mock mode
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, keccak256, slice, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
import { DEMO_EVIDENCE_PATH, type DemoManifestFile } from '../config/demoEvidence';
import type { ClaimSnapshot, PublishedEvidence } from '../data/assembleClaimView';
import type { MetadataLookup } from '../data/claimMetadata';
import type { ClaimEventLog, DecodedClaimEvent } from '../data/timeline';
import { statusIndexFromName, type ClaimStatusName } from '../utils/claimStatus';
import { computeMetadataHash, type ClaimMetadataFields } from '../utils/metadata';

// Everything here is made up. Like the real public view, it holds only hashes, wallet addresses
// and public demo files: no names, places or other personal data. Each claim is shaped exactly
// like the chain source's snapshot (contract views + decoded events), so demo data runs through
// the same timeline code as real data. A test checks that states and events tell the same story.

const demoHash = (label: string): Hex => keccak256(stringToHex(`proof-of-aid demo: ${label}`));

/** Deterministic, obviously synthetic wallets (last 20 bytes of a labelled hash). */
const demoWallet = (role: string): Address => getAddress(slice(demoHash(`wallet ${role}`), 12));

const ORGANIZATION = demoWallet('organization A');
const OTHER_ORGANIZATION = demoWallet('organization B');
const VERIFIER_1 = demoWallet('internal verifier 1');
const VERIFIER_2 = demoWallet('internal verifier 2');
const AUDITOR = demoWallet('auditor');
const AUTHORITY = demoWallet('accreditation authority');
const DISPUTANT = demoWallet('disputing auditor');

export const FULL_STORY_CLAIM_ID: Hex = '0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28';

// Real Merkle roots of the demo bundles (a test recomputes them from the files on disk).
export const DEMO_ORIGINAL_ROOT: Hex = '0x515344752095a24904ad32a660a1d15ddbf9c49e90f43d58323d76e398548707';
export const DEMO_PROOF_ROOT: Hex = '0x8e94bc6a483ea396391f77e88e9359003f723d74463a8afef5279ab397612370';

/**
 * Copies of public/demo-evidence/manifest*.json (a test keeps them identical); the jury downloads,
 * edits and re-checks the files they list.
 */
export const DEMO_MANIFESTS = {
  'manifest.json': {
    version: 1,
    claimId: FULL_STORY_CLAIM_ID,
    rootIndex: 0,
    files: [
      { sha256: '0xffbce320bdf4a4da57257e33b2cca258a0913db00739bcf5483ff7fec1cfe4ae', public: true, name: 'receipt-001.txt' },
      { sha256: '0x023aa03b9371b1bd2dc8ccfc566cf2e3172b02c41e8277086999e4dc8cf64b7b', public: true, name: 'invoice-7781.txt' },
      // A signed distribution list with beneficiaries' names: only its fingerprint is public.
      { sha256: '0xc03c502b806a9e54b6fdcc794c77ad179886e6f03fb149a3818d9a1e0171161f', public: false },
    ],
  },
  'manifest-proof-1.json': {
    version: 1,
    claimId: FULL_STORY_CLAIM_ID,
    rootIndex: 1,
    files: [
      { sha256: '0xfd3b79d09baf0274ad626c572f8203e7078996e0061acf5fdcb4aed9f81f75e5', public: true, name: 'delivery-summary.csv' },
      { sha256: '0x852db872441d6066d358db8b22ee64901be1145af6196d4e68dff68755dc05e3', public: true, name: 'stock-count.txt' },
    ],
  },
} as const satisfies Record<DemoManifestFile, unknown>;

const demoFiles = (manifestFile: keyof typeof DEMO_MANIFESTS, files: readonly string[]): PublishedEvidence => ({
  manifest: DEMO_MANIFESTS[manifestFile],
  manifestHref: `${DEMO_EVIDENCE_PATH}${manifestFile}`,
  downloads: files.map((name) => ({ name, href: `${DEMO_EVIDENCE_PATH}${name}` })),
});

const statusChanged = (claimId: Hex, from: ClaimStatusName, to: ClaimStatusName): DecodedClaimEvent => ({
  eventName: 'StatusChanged',
  args: { claimId, from: statusIndexFromName(from), to: statusIndexFromName(to) },
});

type StoryStep = { at: string; events: readonly DecodedClaimEvent[] };

/** One transaction per step, in its own block, with the given UTC time. */
function story(claimKey: string, firstBlock: bigint, steps: readonly StoryStep[]): ClaimEventLog[] {
  const logs = steps.flatMap((step, stepIndex) =>
    step.events.map(
      (event, logIndex): ClaimEventLog => ({
        ...event,
        blockNumber: firstBlock + BigInt(stepIndex * 4_000),
        logIndex,
        transactionHash: demoHash(`${claimKey} transaction ${stepIndex}`),
        timestamp: Date.parse(step.at) / 1000,
      }),
    ),
  );
  return logs;
}

const seconds = (isoTime: string): bigint => BigInt(Date.parse(isoTime) / 1000);

type DemoMetadata = { hash: Hex; lookup: MetadataLookup };

/**
 * A claim's made-up title and description, served as the API would, and their real
 * `metadataHash` (shared recipe), so demo mode shows the metadata check passing.
 */
function demoMetadata(claimId: Hex, text: ClaimMetadataFields): DemoMetadata {
  const hash = computeMetadataHash(text, claimId);
  if (!hash.ok) {
    throw new Error(`Demo metadata of ${claimId} breaks the metadata recipe: ${hash.error}`);
  }
  const served = { title: text.title, description: text.description, location_region: text.locationRegion, claim_date: text.claimDate };
  const metadata: DemoMetadata = { hash: hash.value, lookup: { kind: 'served', raw: served } };
  return metadata;
}

// Claim 1 — the whole lifecycle, including a proof round and a dismissed dispute.
const FULL_STORY_ANCHORED_AT = '2026-09-14T09:00:00Z';
const FULL_STORY_METADATA = demoMetadata(FULL_STORY_CLAIM_ID, {
  title: '500 food kits delivered in district X',
  description:
    'Food kits (rice, oil, lentils) for 500 households, handed out at the district X warehouse.\nThe signed distribution list stays private; a delivery summary and a stock count were added when the auditor asked for more proof.',
  locationRegion: 'District X',
  claimDate: '2026-09-12',
});
const fullStory: ClaimSnapshot = {
  claimId: FULL_STORY_CLAIM_ID,
  status: 'Verified',
  record: {
    organization: ORGANIZATION,
    internalVerifier: VERIFIER_1,
    auditor: AUDITOR,
    anchoredAt: seconds(FULL_STORY_ANCHORED_AT),
    metadataHash: FULL_STORY_METADATA.hash,
  },
  evidenceRoots: [DEMO_ORIGINAL_ROOT, DEMO_PROOF_ROOT],
  metadata: FULL_STORY_METADATA.lookup,
  published: new Map([
    [0, demoFiles('manifest.json', ['receipt-001.txt', 'invoice-7781.txt'])],
    [1, demoFiles('manifest-proof-1.json', ['delivery-summary.csv', 'stock-count.txt'])],
  ]),
  logs: story('claim 1', 8_120_000n, [
    {
      at: FULL_STORY_ANCHORED_AT,
      events: [
        {
          eventName: 'ClaimAnchored',
          args: {
            claimId: FULL_STORY_CLAIM_ID,
            organization: ORGANIZATION,
            evidenceRoot: DEMO_ORIGINAL_ROOT,
            metadataHash: FULL_STORY_METADATA.hash,
          },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'None', 'Anchored'),
      ],
    },
    {
      at: '2026-09-14T15:30:00Z',
      events: [
        {
          eventName: 'InternalAttestation',
          args: { claimId: FULL_STORY_CLAIM_ID, verifier: VERIFIER_1, approved: true, justificationHash: demoHash('claim 1 checkpoint 1') },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'Anchored', 'InternallyVerified'),
      ],
    },
    {
      at: '2026-09-15T10:00:00Z',
      events: [
        { eventName: 'AuditorAssigned', args: { claimId: FULL_STORY_CLAIM_ID, auditor: AUDITOR, previousAuditor: zeroAddress } },
      ],
    },
    {
      at: '2026-09-16T11:15:00Z',
      events: [
        { eventName: 'ProofRequested', args: { claimId: FULL_STORY_CLAIM_ID, auditor: AUDITOR, requestHash: demoHash('claim 1 request 1') } },
        statusChanged(FULL_STORY_CLAIM_ID, 'InternallyVerified', 'ProofRequested'),
      ],
    },
    {
      at: '2026-09-17T09:40:00Z',
      events: [
        {
          eventName: 'ProofSubmitted',
          args: { claimId: FULL_STORY_CLAIM_ID, organization: ORGANIZATION, supplementaryRoot: DEMO_PROOF_ROOT, rootIndex: 1n },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'ProofRequested', 'ProofSubmitted'),
      ],
    },
    {
      at: '2026-09-17T14:05:00Z',
      events: [
        {
          eventName: 'ProofReviewed',
          args: { claimId: FULL_STORY_CLAIM_ID, verifier: VERIFIER_2, accepted: true, justificationHash: demoHash('claim 1 proof review') },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'ProofSubmitted', 'InternallyVerified'),
      ],
    },
    {
      at: '2026-09-18T16:20:00Z',
      events: [
        {
          eventName: 'FinalAttestation',
          args: { claimId: FULL_STORY_CLAIM_ID, auditor: AUDITOR, approved: true, justificationHash: demoHash('claim 1 final') },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'InternallyVerified', 'Verified'),
      ],
    },
    {
      at: '2026-09-20T08:30:00Z',
      events: [
        {
          eventName: 'DisputeOpened',
          args: { claimId: FULL_STORY_CLAIM_ID, disputant: DISPUTANT, counterEvidenceHash: demoHash('claim 1 counter-evidence') },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'Verified', 'Disputed'),
      ],
    },
    {
      at: '2026-09-22T12:00:00Z',
      events: [
        {
          eventName: 'DisputeResolved',
          args: { claimId: FULL_STORY_CLAIM_ID, authority: AUTHORITY, upheld: false, justificationHash: demoHash('claim 1 ruling') },
        },
        statusChanged(FULL_STORY_CLAIM_ID, 'Disputed', 'Verified'),
      ],
    },
  ]),
};

// Claim 2 — still in the proof loop: the second verifier sent the first proof back.
const PROOF_LOOP_CLAIM_ID: Hex = '0x82d7d0558f02cc464b6a7ea582b1b419d4b5fbde2722a96b33b24c62fc980b3c';
const PROOF_LOOP_ANCHORED_AT = '2026-09-19T08:00:00Z';
const PROOF_LOOP_METADATA = demoMetadata(PROOF_LOOP_CLAIM_ID, {
  title: '40 water tanks installed in camp B',
  description: '40 water tanks of 1,000 litres installed and filled in camp B, with a maintenance schedule.',
  locationRegion: 'Camp B',
  claimDate: '2026-09-17',
});
const PROOF_LOOP_ROOTS = [demoHash('claim 2 original evidence'), demoHash('claim 2 proof 1')] as const;
const proofLoop: ClaimSnapshot = {
  claimId: PROOF_LOOP_CLAIM_ID,
  status: 'ProofRequested',
  record: {
    organization: ORGANIZATION,
    internalVerifier: VERIFIER_1,
    auditor: AUDITOR,
    anchoredAt: seconds(PROOF_LOOP_ANCHORED_AT),
    metadataHash: PROOF_LOOP_METADATA.hash,
  },
  evidenceRoots: PROOF_LOOP_ROOTS,
  metadata: PROOF_LOOP_METADATA.lookup,
  published: new Map(),
  logs: story('claim 2', 8_310_000n, [
    {
      at: PROOF_LOOP_ANCHORED_AT,
      events: [
        {
          eventName: 'ClaimAnchored',
          args: {
            claimId: PROOF_LOOP_CLAIM_ID,
            organization: ORGANIZATION,
            evidenceRoot: PROOF_LOOP_ROOTS[0],
            metadataHash: PROOF_LOOP_METADATA.hash,
          },
        },
        statusChanged(PROOF_LOOP_CLAIM_ID, 'None', 'Anchored'),
      ],
    },
    {
      at: '2026-09-19T13:20:00Z',
      events: [
        {
          eventName: 'InternalAttestation',
          args: { claimId: PROOF_LOOP_CLAIM_ID, verifier: VERIFIER_1, approved: true, justificationHash: demoHash('claim 2 checkpoint 1') },
        },
        statusChanged(PROOF_LOOP_CLAIM_ID, 'Anchored', 'InternallyVerified'),
      ],
    },
    {
      at: '2026-09-20T09:00:00Z',
      events: [
        { eventName: 'AuditorAssigned', args: { claimId: PROOF_LOOP_CLAIM_ID, auditor: AUDITOR, previousAuditor: zeroAddress } },
      ],
    },
    {
      at: '2026-09-21T10:30:00Z',
      events: [
        { eventName: 'ProofRequested', args: { claimId: PROOF_LOOP_CLAIM_ID, auditor: AUDITOR, requestHash: demoHash('claim 2 request 1') } },
        statusChanged(PROOF_LOOP_CLAIM_ID, 'InternallyVerified', 'ProofRequested'),
      ],
    },
    {
      at: '2026-09-22T09:10:00Z',
      events: [
        {
          eventName: 'ProofSubmitted',
          args: { claimId: PROOF_LOOP_CLAIM_ID, organization: ORGANIZATION, supplementaryRoot: PROOF_LOOP_ROOTS[1], rootIndex: 1n },
        },
        statusChanged(PROOF_LOOP_CLAIM_ID, 'ProofRequested', 'ProofSubmitted'),
      ],
    },
    {
      at: '2026-09-22T15:45:00Z',
      events: [
        {
          eventName: 'ProofReviewed',
          args: { claimId: PROOF_LOOP_CLAIM_ID, verifier: VERIFIER_2, accepted: false, justificationHash: demoHash('claim 2 proof review') },
        },
        statusChanged(PROOF_LOOP_CLAIM_ID, 'ProofSubmitted', 'ProofRequested'),
      ],
    },
  ]),
};

// Claim 3 — just anchored, waiting for its internal check.
const ANCHORED_CLAIM_ID: Hex = '0x239f591f48a6c0be54381da11fde953b0cf0821aaa3abc374b104750c6f94863';
const ANCHORED_AT = '2026-09-23T11:00:00Z';
const ANCHORED_METADATA = demoMetadata(ANCHORED_CLAIM_ID, {
  title: 'Hygiene kits for the northern shelters',
  description: '350 hygiene kits (soap, towels, sanitary pads) delivered to three shelters.',
  locationRegion: 'Northern region',
  claimDate: '2026-09-22',
});
const anchoredOnly: ClaimSnapshot = {
  claimId: ANCHORED_CLAIM_ID,
  status: 'Anchored',
  record: {
    organization: OTHER_ORGANIZATION,
    internalVerifier: zeroAddress,
    auditor: zeroAddress,
    anchoredAt: seconds(ANCHORED_AT),
    metadataHash: ANCHORED_METADATA.hash,
  },
  evidenceRoots: [demoHash('claim 3 original evidence')],
  metadata: ANCHORED_METADATA.lookup,
  published: new Map(),
  logs: story('claim 3', 8_402_000n, [
    {
      at: ANCHORED_AT,
      events: [
        {
          eventName: 'ClaimAnchored',
          args: {
            claimId: ANCHORED_CLAIM_ID,
            organization: OTHER_ORGANIZATION,
            evidenceRoot: demoHash('claim 3 original evidence'),
            metadataHash: ANCHORED_METADATA.hash,
          },
        },
        statusChanged(ANCHORED_CLAIM_ID, 'None', 'Anchored'),
      ],
    },
  ]),
};

export const MOCK_CLAIMS: readonly ClaimSnapshot[] = [fullStory, proofLoop, anchoredOnly];
