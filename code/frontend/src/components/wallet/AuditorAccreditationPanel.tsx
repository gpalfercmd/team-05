// =============================================================================
// Proof of Aid — Team 05 — Accreditation Authority: accredit and revoke auditors
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { accreditAuditorCall, revokeAuditorCall, type RegistryAddresses } from '../../chain/calls';
import { addressAt } from '../../chain/inputs';
import { AddressActionForm } from './AddressActionForm';

/** ParticipantRegistry functions guarded by ACCREDITATION_AUTHORITY_ROLE. */
export function AuditorAccreditationPanel({ registries }: { registries: RegistryAddresses }) {
  return (
    <section className="wallet-stack" aria-labelledby="authority-heading">
      <h3 id="authority-heading">Auditor accreditation</h3>
      <AddressActionForm
        title="Accredit an auditor"
        description="The auditor can then be assigned to claims and can dispute claims it did not approve. A wallet that ever held a role can never be given another one."
        inputs={[{ label: 'Auditor wallet' }]}
        submitLabel="Accredit auditor"
        buildCall={(addresses) => accreditAuditorCall(registries, addressAt(addresses, 0))}
      />
      <AddressActionForm
        title="Revoke an auditor"
        description="The auditor can no longer review or dispute claims. Claims assigned to it need a new auditor."
        inputs={[{ label: 'Auditor wallet to revoke' }]}
        submitLabel="Revoke auditor"
        variant="danger"
        buildCall={(addresses) => revokeAuditorCall(registries, addressAt(addresses, 0))}
      />
    </section>
  );
}
