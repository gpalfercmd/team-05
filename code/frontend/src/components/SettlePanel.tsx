// =============================================================================
// Proof of Aid — Team 05 — Claim page: "Settle" once the dispute window has closed (anyone may)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { settleCall } from '../chain/calls';
import { useAppConfig } from '../hooks/useAppConfig';
import { useChainTime } from '../hooks/useChainTime';
import { useContractAction } from '../hooks/useContractAction';
import { useRegistries, useWallet } from '../hooks/useWallet';
import type { ClaimView } from '../types/claim';
import { TxButton } from './wallet/TxButton';
import { TxStatus } from './wallet/TxStatus';
import './wallet/wallet.css';

/**
 * Shown on the public claim page only for an onchain, verified, unsettled claim whose dispute
 * window has closed by the chain's clock. Settling needs a wallet but no role.
 */
export function SettlePanel({ claim }: { claim: ClaimView }) {
  const { chain } = useAppConfig();
  const registries = useRegistries();
  const wallet = useWallet();
  const action = useContractAction();
  const closesAt = claim.escrow?.disputeWindowClosesAt;
  const candidate =
    registries !== undefined && claim.source !== 'demo' && claim.status === 'Verified' && claim.escrow?.settled === false && closesAt !== undefined;
  const now = useChainTime(candidate);
  const finished = action.phase.kind === 'confirmed';
  const closed = candidate && now !== undefined && now >= BigInt(closesAt);
  // Once settled the claim no longer qualifies, but the confirmation stays on screen.
  if (registries === undefined || (!closed && !finished)) {
    return null;
  }
  let control;
  if (wallet.status === 'disconnected') {
    control = <p className="muted">Connect a wallet to settle. Anyone may do it; it costs only the network fee.</p>;
  } else if (wallet.wrongNetwork) {
    control = (
      <p className="notice" role="alert">
        Switch your wallet to {chain.name} (chain ID {chain.id}) to settle.
      </p>
    );
  } else {
    control = (
      <div className="action-form__buttons">
        <TxButton
          label="Settle deposits"
          phase={action.phase}
          active
          busy={action.busy}
          disabled={finished}
          onClick={() => void action.run(settleCall(registries, claim.claimId))}
        />
      </div>
    );
  }
  return (
    <section className="card wallet-stack" aria-labelledby="settle-heading">
      <h2 id="settle-heading">Settle the deposits</h2>
      <p>
        The dispute window has closed without an open dispute. Settling credits the organization its penalty deposit and the
        auditor its deposit and reward; each then withdraws from its wallet screen.
      </p>
      {control}
      <TxStatus phase={action.phase} />
    </section>
  );
}
