// =============================================================================
// Proof of Aid — Team 05 — RoleCards: who does what in ClearTrust, one card per role, the viewer's own marked
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { ROLE_LABELS, type Role } from '../../utils/roles';
import { Reveal } from '../Reveal';

// What each role can do in this app (its screens and the contract's rules); no counts, no names.
const ROLE_DUTIES: Record<Role, string> = {
  public: 'Checks evidence in the browser, and can settle a claim once its dispute window has closed.',
  organization: 'Records claims with the fingerprint of their evidence, and sends more proof when an auditor asks.',
  internalVerifier: 'Makes the first check of an organization’s claim (checkpoint 1).',
  auditor: 'An independent, accredited reviewer who gives the final decision (checkpoint 2).',
  accreditationAuthority: 'Assigns auditors to claims and decides disputes.',
  registryAdmin: 'Manages who is registered in the participant registry.',
};

const ORDER: readonly Role[] = ['public', 'organization', 'internalVerifier', 'auditor', 'accreditationAuthority', 'registryAdmin'];

/** `current` is the connected wallet's role, or undefined when it is not known (no wallet, demo data). */
export function RoleCards({ current }: { current: Role | undefined }) {
  return (
    <ul className="role-cards">
      {ORDER.map((role, index) => {
        const mine = role === current;
        return (
          <Reveal as="li" key={role} className="role-card" delay={index} data-mine={mine} aria-current={mine ? 'true' : undefined}>
            <h3 className="role-card__title">{ROLE_LABELS[role]}</h3>
            <p className="role-card__text">{ROLE_DUTIES[role]}</p>
            {mine && <p className="role-card__mine">Your role</p>}
          </Reveal>
        );
      })}
    </ul>
  );
}
