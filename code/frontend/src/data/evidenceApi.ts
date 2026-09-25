// =============================================================================
// Proof of Aid — Team 05 — Evidence service client: login, claims, uploads, reviewer downloads, notes
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { err, ok, type Result } from '../utils/result';
import { apiEndpoint, type FetchLike } from './httpJson';

// The backend (P3) keeps the claim's metadata and the encrypted, salted evidence (P8.2); it
// returns the claim ID, the metadata fingerprint and each bundle's Merkle root, which the
// organization's wallet then records onchain. Login is a wallet signature over a single-use
// challenge (`/auth/challenge` → sign → `/auth/verify`), kept as a session cookie, so every
// request here sends credentials. Answers are validated before use.

const JSON_TIMEOUT_MS = 10_000;
/** Uploads carry up to 25 MiB per file; the backend strips metadata and encrypts each one. */
const UPLOAD_TIMEOUT_MS = 120_000;

const bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hex);
const address = z
  .string()
  .refine((value) => isAddress(value, { strict: false }))
  .transform((value) => getAddress(value));

const sessionSchema = z.object({ address });
const challengeSchema = z.object({ message: z.string().min(1) });
const createdSchema = z.object({ claim_id_hex: bytes32, metadata_hash_hex: bytes32 });
const uploadSchema = z.object({ root_index: z.number().int().nonnegative(), evidence_root: bytes32, files: z.array(z.unknown()) });
const detailSchema = z.object({ detail: z.string() });

type Answer = { status: number; body: unknown };

const describe = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error');

async function send(fetchFn: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Result<Answer, string>> {
  let answer: Result<Answer, string>;
  try {
    const response = await fetchFn(url, { ...init, credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body: unknown = undefined;
    try {
      body = text === '' ? undefined : JSON.parse(text);
    } catch {
      body = undefined;
    }
    answer = ok({ status: response.status, body });
  } catch (error: unknown) {
    answer = err(`The evidence service could not be reached (${describe(error)}).`);
  }
  return answer;
}

/** The backend's own reason, when it gave one as text. */
function refusal(answer: Answer): string {
  const detail = detailSchema.safeParse(answer.body);
  const reason = detail.success ? `: ${detail.data.detail}` : '';
  const message =
    answer.status === 401
      ? 'The evidence service session expired or was refused. Try again to sign in.'
      : `The evidence service refused the request (HTTP ${answer.status}${reason}).`;
  return message;
}

function expect2xx<T>(answer: Result<Answer, string>, schema: z.ZodType<T>): Result<T, string> {
  let result: Result<T, string>;
  if (!answer.ok) {
    result = answer;
  } else if (answer.value.status < 200 || answer.value.status > 299) {
    result = err(refusal(answer.value));
  } else {
    const parsed = schema.safeParse(answer.value.body);
    result = parsed.success ? ok(parsed.data) : err('The evidence service answered with something this page cannot read.');
  }
  return result;
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
});

/** The wallet behind the current session cookie; `ok(undefined)` when signed out. */
export async function readSession(fetchFn: FetchLike, apiUrl: string): Promise<Result<Address | undefined, string>> {
  const answer = await send(fetchFn, apiEndpoint(apiUrl, '/auth/me'), { method: 'GET', headers: { Accept: 'application/json' } }, JSON_TIMEOUT_MS);
  const session: Result<Address | undefined, string> =
    answer.ok && answer.value.status === 401 ? ok(undefined) : expect2xx(answer, sessionSchema.transform((value) => value.address));
  return session;
}

/** Step 1 of the login: the exact text the wallet must sign (EIP-191, single use, 10 minutes). */
export async function requestChallenge(fetchFn: FetchLike, apiUrl: string, wallet: Address): Promise<Result<string, string>> {
  const answer = await send(fetchFn, apiEndpoint(apiUrl, '/auth/challenge'), postJson({ address: wallet }), JSON_TIMEOUT_MS);
  const message = expect2xx(answer, challengeSchema.transform((value) => value.message));
  return message;
}

/** Step 2 of the login: the backend recovers the signer and opens a session for it. */
export async function verifyLogin(fetchFn: FetchLike, apiUrl: string, wallet: Address, signature: Hex): Promise<Result<Address, string>> {
  const answer = await send(fetchFn, apiEndpoint(apiUrl, '/auth/verify'), postJson({ address: wallet, signature }), JSON_TIMEOUT_MS);
  const session = expect2xx(answer, sessionSchema.transform((value) => value.address));
  return session;
}

export type ClaimDetails = {
  title: string;
  description: string;
  locationRegion: string;
  /** `YYYY-MM-DD`. */
  claimDate: string;
};

export type CreatedClaim = { claimId: Hex; metadataHash: Hex };

/** Stores the claim's metadata (organization only) and returns what `anchorClaim` needs besides the root. */
export async function createClaim(fetchFn: FetchLike, apiUrl: string, details: ClaimDetails): Promise<Result<CreatedClaim, string>> {
  const answer = await send(
    fetchFn,
    apiEndpoint(apiUrl, '/claims'),
    postJson({
      title: details.title,
      description: details.description,
      location_region: details.locationRegion,
      claim_date: details.claimDate,
    }),
    JSON_TIMEOUT_MS,
  );
  const created = expect2xx(
    answer,
    createdSchema.transform((value) => ({ claimId: value.claim_id_hex, metadataHash: value.metadata_hash_hex })),
  );
  return created;
}

export type UploadedBundle = { rootIndex: number; evidenceRoot: Hex; fileCount: number };

/**
 * Uploads files into bundle `rootIndex` (0 = original evidence, n = supplementary proof n). The
 * backend strips metadata, salts and encrypts each file and returns the bundle's Merkle root.
 */
export async function uploadEvidence(
  fetchFn: FetchLike,
  apiUrl: string,
  claimId: Hex,
  upload: { files: readonly File[]; isPublic: boolean; rootIndex: number },
): Promise<Result<UploadedBundle, string>> {
  const form = new FormData();
  for (const file of upload.files) {
    form.append('files', file, file.name);
  }
  form.append('public', upload.isPublic ? 'true' : 'false');
  form.append('root_index', String(upload.rootIndex));
  const answer = await send(
    fetchFn,
    apiEndpoint(apiUrl, `/claims/${claimId}/evidence`),
    { method: 'POST', headers: { Accept: 'application/json' }, body: form },
    UPLOAD_TIMEOUT_MS,
  );
  const bundle = expect2xx(
    answer,
    uploadSchema.transform((value) => ({ rootIndex: value.root_index, evidenceRoot: value.evidence_root, fileCount: value.files.length })),
  );
  return bundle;
}

// --- P10.2 reviewer view: the claim's private files for the viewers the access matrix allows --------

/** One stored file as an authorized viewer sees it (`EvidenceFileResponse`). */
export type AuthorizedFile = {
  id: string;
  /** SHA-256(salt ‖ bytes) since P8.2, plain SHA-256 before: the Merkle leaf input. */
  fingerprint: Hex;
  /** `undefined` on unsalted files recorded before P8.2. */
  salt: Hex | undefined;
  name: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
  rootIndex: number;
};

export type AuthorizedBundle = { rootIndex: number; files: readonly AuthorizedFile[] };

/**
 * What this session may see of a claim: every file (the backend's access matrix said yes), only
 * fingerprints (`denied`), or nothing because the backend holds no record of the claim.
 */
export type ClaimAccess =
  | { kind: 'authorized'; bundles: readonly AuthorizedBundle[] }
  | { kind: 'denied' }
  | { kind: 'not-stored' };

const authorizedFileSchema = z.object({
  id: z.string().min(1),
  sha256_hex: bytes32,
  salt: bytes32.nullable(),
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  is_public: z.boolean(),
  root_index: z.number().int().nonnegative(),
});

const claimAccessSchema = z.discriminatedUnion('viewer_access', [
  z.object({
    viewer_access: z.literal('authorized'),
    bundles: z.array(z.object({ root_index: z.number().int().nonnegative(), files: z.array(authorizedFileSchema) })),
  }),
  z.object({ viewer_access: z.literal('public') }),
]);

const toAccess = (value: z.infer<typeof claimAccessSchema>): ClaimAccess =>
  value.viewer_access === 'public'
    ? { kind: 'denied' }
    : {
        kind: 'authorized',
        bundles: value.bundles.map((bundle) => ({
          rootIndex: bundle.root_index,
          files: bundle.files.map((file) => ({
            id: file.id,
            fingerprint: file.sha256_hex,
            salt: file.salt ?? undefined,
            name: file.original_name,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
            isPublic: file.is_public,
            rootIndex: file.root_index,
          })),
        })),
      };

/** The claim as this session sees it; the backend decides with its access matrix, never the page. */
export async function readClaimAccess(fetchFn: FetchLike, apiUrl: string, claimId: Hex): Promise<Result<ClaimAccess, string>> {
  const answer = await send(fetchFn, apiEndpoint(apiUrl, `/claims/${claimId}`), { method: 'GET', headers: { Accept: 'application/json' } }, JSON_TIMEOUT_MS);
  const access: Result<ClaimAccess, string> =
    answer.ok && answer.value.status === 404 ? ok({ kind: 'not-stored' }) : expect2xx(answer, claimAccessSchema.transform(toAccess));
  return access;
}

/** The decrypted bytes of one file (`GET /files/{id}` with the session); denied reads look like 404. */
export async function downloadEvidenceFile(fetchFn: FetchLike, apiUrl: string, fileId: string): Promise<Result<ArrayBuffer, string>> {
  let bytes: Result<ArrayBuffer, string>;
  try {
    const response = await fetchFn(apiEndpoint(apiUrl, `/files/${encodeURIComponent(fileId)}`), {
      method: 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    bytes = response.ok
      ? ok(await response.arrayBuffer())
      : err(
          response.status === 404 || response.status === 401
            ? 'The evidence service did not hand out this file: your session may have expired or your access was removed.'
            : `The evidence service refused the download (HTTP ${response.status}).`,
        );
  } catch (error: unknown) {
    bytes = err(`The evidence service could not be reached (${describe(error)}).`);
  }
  return bytes;
}

// --- P10.3 notes: the text behind a salted note fingerprint, kept sealed by the backend ------------

/** Which contract argument a note is anchored as (the backend's `kind`). */
export type NoteKind = 'justification' | 'proof_request' | 'counter_evidence' | 'resolution';

export type NoteToStore = { kind: NoteKind; text: string; salt: Hex; noteHash: Hex };

/** A note this session may read: only its author and the claim's authorized reviewers get one. */
export type StoredNote = { id: string; kind: NoteKind; author: Address; noteHash: Hex; text: string; salt: Hex; createdAt: string };

const noteKindSchema = z.enum(['justification', 'proof_request', 'counter_evidence', 'resolution']);
const storedNoteSchema = z.object({
  id: z.string().min(1),
  kind: noteKindSchema,
  author: address,
  note_hash: bytes32,
  text: z.string(),
  salt: bytes32,
  created_at: z.string(),
});
const toStoredNote = (value: z.infer<typeof storedNoteSchema>): StoredNote => ({
  id: value.id,
  kind: value.kind,
  author: value.author,
  noteHash: value.note_hash,
  text: value.text,
  salt: value.salt,
  createdAt: value.created_at,
});

/**
 * Stores a note before its fingerprint is anchored; the backend recomputes the fingerprint and
 * refuses a mismatch. `not-stored` means the backend has no record of the claim (it was created
 * elsewhere), so the note cannot be kept there.
 */
export async function storeNote(fetchFn: FetchLike, apiUrl: string, claimId: Hex, note: NoteToStore): Promise<Result<'stored' | 'not-stored', string>> {
  const answer = await send(
    fetchFn,
    apiEndpoint(apiUrl, `/claims/${claimId}/notes`),
    postJson({ kind: note.kind, text: note.text, salt: note.salt, note_hash: note.noteHash }),
    JSON_TIMEOUT_MS,
  );
  const stored: Result<'stored' | 'not-stored', string> =
    answer.ok && answer.value.status === 404 ? ok('not-stored') : expect2xx(answer, storedNoteSchema.transform((): 'stored' => 'stored'));
  return stored;
}

/** The claim's notes this session may read (every note for reviewers, one's own otherwise). */
export async function readNotes(fetchFn: FetchLike, apiUrl: string, claimId: Hex): Promise<Result<StoredNote[], string>> {
  const answer = await send(fetchFn, apiEndpoint(apiUrl, `/claims/${claimId}/notes`), { method: 'GET', headers: { Accept: 'application/json' } }, JSON_TIMEOUT_MS);
  const notes = expect2xx(answer, z.object({ notes: z.array(storedNoteSchema) }).transform((value) => value.notes.map(toStoredNote)));
  return notes;
}
