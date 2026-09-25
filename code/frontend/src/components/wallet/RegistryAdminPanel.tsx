// =============================================================================
// Proof of Aid — Team 05 — Registry Admin: register and revoke organizations and internal verifiers
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import {
  registerInternalVerifierCall,
  registerOrganizationCall,
  revokeInternalVerifierCall,
  revokeOrganizationCall,
  type RegistryAddresses,
} from '../../chain/calls';
import { addressAt } from '../../chain/inputs';
import { AddressActionForm } from './AddressActionForm';

const ONE_ROLE = 'A wallet that ever held a role can never be given another one.';

/** ParticipantRegistry functions guarded by REGISTRY_ADMIN_ROLE. Auditors belong to the Authority. */
export function RegistryAdminPanel({ registries }: { registries: RegistryAddresses }) {
  return (
    <section className="wallet-stack" aria-labelledby="admin-heading">
      <h3 id="admin-heading">Registry Admin</h3>
      <p className="caption">Accredit the organizations and their internal verifiers. Auditors are accredited by the Accreditation Authority.</p>
      <AddressActionForm
        title="Register an organization"
        description={`The organization can record claims once it has at least one active internal verifier. ${ONE_ROLE}`}
        inputs={[{ label: 'Organization wallet' }]}
        submitLabel="Register organization"
        buildCall={(addresses) => registerOrganizationCall(registries, addressAt(addresses, 0))}
      />
      <AddressActionForm
        title="Register an internal verifier"
        description={`Links a verifier wallet to an active organization. ${ONE_ROLE}`}
        inputs={[{ label: 'Internal verifier wallet' }, { label: 'Organization wallet', hint: 'Must be an active, registered organization.' }]}
        submitLabel="Register internal verifier"
        buildCall={(addresses) => registerInternalVerifierCall(registries, addressAt(addresses, 0), addressAt(addresses, 1))}
      />
      <AddressActionForm
        title="Revoke an organization"
        description="It can no longer record claims or add evidence, and its claims can no longer be approved. Its internal verifiers lose their rights too."
        inputs={[{ label: 'Organization wallet to revoke' }]}
        submitLabel="Revoke organization"
        variant="danger"
        buildCall={(addresses) => revokeOrganizationCall(registries, addressAt(addresses, 0))}
      />
      <AddressActionForm
        title="Revoke an internal verifier"
        description="The verifier can no longer check claims. The wallet can never be registered again."
        inputs={[{ label: 'Internal verifier wallet to revoke' }]}
        submitLabel="Revoke internal verifier"
        variant="danger"
        buildCall={(addresses) => revokeInternalVerifierCall(registries, addressAt(addresses, 0))}
      />
    </section>
  );
}
