// =============================================================================
// Proof of Aid — Team 05 — Demo claims used when no contract addresses are configured
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { Hex } from 'viem';
import type { ClaimSummary } from '../types/claim';

// Made-up values (SHA-256 of fixed demo labels). Like the real public view, they hold only
// hashes and wallet addresses: no names, places or other personal data.
export const MOCK_CLAIMS: readonly ClaimSummary[] = [
  {
    claimId: '0xfedebf75d5a350c6f5267f00c1d9cfc3e3fae92725d600e6095cebb4a5a79b28',
    status: 'Verified',
    organization: '0x9A5055dde27365353c0a11168f9B5CF5d3E175b7',
    anchoredAt: 1_788_000_000,
    anchorTxHash: '0xcbe9e950689b0ce6c4122b938d730de646998f4eae6f9c7f5bc57989d9d596c6',
    evidenceRoots: ['0x39435cf915d51f47a8aa0cce0c519b123853679c89761da95cdf9185c2ed2202'],
  },
  {
    claimId: '0x82d7d0558f02cc464b6a7ea582b1b419d4b5fbde2722a96b33b24c62fc980b3c',
    status: 'ProofSubmitted',
    organization: '0x9A5055dde27365353c0a11168f9B5CF5d3E175b7',
    anchoredAt: 1_788_400_000,
    anchorTxHash: '0xa1f8f1dd6bb6f007f5864bf4c4e7f232580de569c88dfc3fbff0bdb1e29d64cd',
    evidenceRoots: [
      '0x9e39f138c9e36811e16a3299d58d133811e87bc228347b8171809deac8812015',
      '0x1527486e19888941d844af8019074da756fc4e312071b39380fe44ba49830d42',
    ],
  },
  {
    claimId: '0x239f591f48a6c0be54381da11fde953b0cf0821aaa3abc374b104750c6f94863',
    status: 'Anchored',
    organization: '0x9c68eda769b4F656E39d35FB54d389B92e1F87EB',
    anchoredAt: 1_789_900_000,
    anchorTxHash: '0x22e5135faeaf3d83a522b8512a612d1bb19b2647733173084b6600769d253463',
    evidenceRoots: ['0xf64a242090cbd02b64ac18fd2a0182af2001f87c3cf82f7ad548deb1373116c5'],
  },
];

/** Claim IDs are hex, so lookups ignore case the same way the contract does. */
export const findMockClaim = (claimId: Hex): ClaimSummary | undefined =>
  MOCK_CLAIMS.find((claim) => claim.claimId.toLowerCase() === claimId.toLowerCase());
