// =============================================================================
// Proof of Aid — Team 05 — Tests: public claim page in demo mode, incl. the jury's upload flow
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import deliverySummary from '../../public/demo-evidence/delivery-summary.csv?raw';
import manifestText from '../../public/demo-evidence/manifest.json?raw';
import receipt from '../../public/demo-evidence/receipt-001.txt?raw';
import stockCount from '../../public/demo-evidence/stock-count.txt?raw';
import { FULL_STORY_CLAIM_ID } from '../mocks/claims';
import { renderRoute } from '../test/renderRoute';

const textFile = (text: string, name: string) => new File([text], name, { type: 'text/plain' });

async function openFullStory() {
  renderRoute(`/claims/${FULL_STORY_CLAIM_ID}`);
  await screen.findByRole('heading', { level: 2, name: 'Current status' });
}

const section = (name: string): HTMLElement => {
  const heading = screen.getByRole('heading', { level: 2, name });
  const container = heading.closest('section');
  if (container === null) {
    throw new Error(`No section for ${name}`);
  }
  return container;
};

describe('PublicClaimPage (demo data)', () => {
  it('tells the claim’s story as a timeline, oldest first, one entry per action', async () => {
    await openFullStory();
    const history = section('History');
    const entries = within(history).getAllByRole('listitem');
    expect(entries).toHaveLength(14);
    expect(entries[0]).toHaveTextContent(/Organization 0x\w{4}…\w{4} recorded the claim/);
    expect(entries[1]).toHaveTextContent(/0x\w{4}…\w{4} locked a deposit in the contract\./);
    expect(within(entries[1] as HTMLElement).queryByText('Anchored')).not.toBeInTheDocument();
    expect(entries[2]).toHaveTextContent(/Internal verifier 0x\w{4}…\w{4} approved the evidence \(checkpoint 1\)\./);
    expect(entries[2]).toHaveTextContent('Internally verified');
    expect(entries[3]).toHaveTextContent(/The Accreditation Authority assigned auditor 0x/);
    expect(within(entries[3] as HTMLElement).queryByText('Internally verified')).not.toBeInTheDocument();
    expect(entries[5]).toHaveTextContent('The organization submitted supplementary proof (bundle #1).');
    expect(entries[6]).toHaveTextContent(/A second internal verifier \(0x\w{4}…\w{4}\) confirmed the proof\./);
    expect(entries[11]).toHaveTextContent('The Accreditation Authority dismissed the dispute: the claim stays verified.');
    expect(entries[12]).toHaveTextContent(/The contract credited a payout to 0x\w{4}…\w{4}\./);
    expect(within(history).getAllByRole('button', { name: 'Copy transaction' })).toHaveLength(14);
    expect(within(history).getByText('Demo data: sample records, not read from a blockchain.')).toBeInTheDocument();
  });

  it('shows the claim’s title and description only after checking them against the recorded fingerprint', async () => {
    await openFullStory();
    const card = section('What was claimed');
    expect(within(card).getByRole('heading', { level: 3, name: '500 food kits delivered in district X' })).toBeInTheDocument();
    expect(within(card).getByText('Title and description match the blockchain record.')).toBeInTheDocument();
  });

  it('summarises the checkpoints, the auditor and the dispute', async () => {
    await openFullStory();
    const summary = section('Verification checks');
    expect(summary).toHaveTextContent(/Internal check \(checkpoint 1\)Approved by internal verifier 0x/);
    expect(summary).toHaveTextContent(/assigned by the Accreditation Authority on .*More proof requested once\./);
    expect(summary).toHaveTextContent(/Final decision \(checkpoint 2\)Approved by auditor 0x/);
    expect(summary).toHaveTextContent(/Dismissed, so the claim stays verified/);
  });

  it('shows the deposits held for the claim and its dispute window (P9)', async () => {
    await openFullStory();
    const deposits = section('Deposits');
    expect(deposits).toHaveTextContent('0.0111 ETH');
    expect(deposits).toHaveTextContent(/Disputes open until|Dispute window closed/);
  });

  it('lists each evidence bundle with its fingerprint, public downloads and private entries', async () => {
    await openFullStory();
    const evidence = section('Evidence');
    expect(within(evidence).getByRole('heading', { level: 3, name: 'Original evidence' })).toBeInTheDocument();
    expect(within(evidence).getByRole('heading', { level: 3, name: 'Supplementary proof #1' })).toBeInTheDocument();
    expect(within(evidence).getByRole('link', { name: 'Download receipt-001.txt' })).toHaveAttribute(
      'href',
      '/demo-evidence/receipt-001.txt',
    );
    expect(within(evidence).getAllByText('The published file list matches this fingerprint, so its entries can be trusted.')).toHaveLength(2);
    expect(
      within(evidence).getByText('This file is private to protect beneficiaries. Only its fingerprint is public.'),
    ).toBeInTheDocument();
  });

  it('confirms an unchanged receipt and rejects the same receipt with one character changed', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    await openFullStory();
    const input = screen.getByLabelText('Choose files to check');

    await user.upload(input, textFile(receipt, 'receipt-001.txt'));
    const results = section('Verify it yourself').querySelector('[aria-live="polite"]');
    expect(await screen.findByText(/^This file is exactly the one recorded on 14 Sept? 2026, 09:00 UTC\.$/)).toBeInTheDocument();
    expect(results).toHaveTextContent('It is listed in the original evidence as the public file “receipt-001.txt”.');

    await user.upload(input, textFile(receipt.replace('500 food kits', '501 food kits'), 'receipt-001.txt'));
    expect(
      await screen.findByText('This file does not match the recorded evidence. It was changed or is a different file.'),
    ).toBeInTheDocument();
    expect(results).toHaveTextContent('A file named “receipt-001.txt” is listed in the original evidence, but its content is different.');
    // Files are hashed locally: nothing, and certainly not their contents, goes over the network.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('checks a complete bundle without any file list', async () => {
    const user = userEvent.setup();
    await openFullStory();
    await user.click(screen.getByRole('radio', { name: 'Supplementary proof #1' }));
    await user.click(screen.getByRole('radio', { name: /^A complete bundle/ }));
    const input = screen.getByLabelText('Choose files to check');

    await user.upload(input, [textFile(deliverySummary, 'delivery-summary.csv'), textFile(stockCount, 'stock-count.txt')]);
    expect(await screen.findByText(/^These files are exactly the ones recorded on 17 Sept? 2026/)).toBeInTheDocument();

    await user.upload(input, [textFile(deliverySummary, 'delivery-summary.csv')]);
    expect(
      await screen.findByText('This file does not match the recorded evidence. It was changed or is a different file.'),
    ).toBeInTheDocument();
  });

  it('refuses the same file twice in a bundle with a plain explanation', async () => {
    const user = userEvent.setup();
    await openFullStory();
    await user.click(screen.getByRole('radio', { name: /^A complete bundle/ }));
    await user.upload(screen.getByLabelText('Choose files to check'), [
      textFile(receipt, 'receipt-001.txt'),
      textFile(receipt, 'copy-of-receipt.txt'),
    ]);
    expect(
      await screen.findByText('The same file was added twice. Each file can appear only once in a bundle.'),
    ).toBeInTheDocument();
  });

  it('flags a file list that was altered after it was published', async () => {
    const user = userEvent.setup();
    await openFullStory();
    await user.click(screen.getByText('Load a file list (manifest JSON) you received'));
    const altered = manifestText.replace('"0xffbce320', '"0xffbce321');
    await user.upload(
      screen.getByLabelText('Choose a file list'),
      new File([altered], 'manifest.json', { type: 'application/json' }),
    );
    expect(await screen.findByText('File list altered')).toBeInTheDocument();
    expect(
      screen.getByText('This file list does not match what was recorded on the blockchain; it may have been altered.'),
    ).toBeInTheDocument();
  });

  it('shows a claim that is still waiting for proof, and what has not happened yet', async () => {
    renderRoute('/claims/0x82d7d0558f02cc464b6a7ea582b1b419d4b5fbde2722a96b33b24c62fc980b3c');
    const status = await screen.findByRole('heading', { level: 2, name: 'Current status' });
    expect(status.closest('section')).toHaveTextContent('Proof requested');
    expect(section('History')).toHaveTextContent(/A second internal verifier \(0x\w{4}…\w{4}\) sent the proof back to the organization\./);
    expect(section('Verification checks')).toHaveTextContent(/Final decision \(checkpoint 2\)Pending\./);
    expect(section('Deposits')).toHaveTextContent('0.0101 ETH');
    expect(section('Deposits')).not.toHaveTextContent(/Dispute window|Disputes open/);
    expect(section('Verify it yourself')).toHaveTextContent(/none that matches the blockchain is available/);
  });
});
