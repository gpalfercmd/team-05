// =============================================================================
// Proof of Aid — Team 05 — Withdraw: shown to any wallet the contract owes money (credits > 0)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { formatEther } from 'viem';
import { withdrawCall, type RegistryAddresses } from '../../chain/calls';
import { useContractAction } from '../../hooks/useContractAction';
import { useCredits } from '../../hooks/useEscrowParams';
import { TxButton } from './TxButton';
import { TxStatus } from './TxStatus';

/**
 * Payouts are pull payments: settling or resolving a claim only credits wallets, and each wallet
 * withdraws its own balance. After a withdrawal the balance is 0, but the outcome stays visible.
 */
export function WithdrawCard({ registries }: { registries: RegistryAddresses }) {
  const credits = useCredits();
  const action = useContractAction();
  const amount = credits?.ok === true ? credits.value : 0n;
  const finished = action.phase.kind === 'confirmed' || action.phase.kind === 'failed';
  if (amount === 0n && !action.busy && !finished) {
    return null;
  }
  return (
    <section className="action-form" aria-labelledby="withdraw-heading">
      <h3 id="withdraw-heading">Funds waiting for you</h3>
      {amount > 0n && (
        <p>
          The contract holds <strong>{formatEther(amount)} ETH</strong> for this wallet: returned deposits, rewards or dispute bonds.
        </p>
      )}
      <div className="action-form__buttons">
        <TxButton
          label={amount > 0n ? `Withdraw ${formatEther(amount)} ETH` : 'Withdraw'}
          phase={action.phase}
          active
          busy={action.busy}
          disabled={amount === 0n}
          onClick={() => void action.run(withdrawCall(registries))}
        />
      </div>
      <TxStatus phase={action.phase} />
    </section>
  );
}
