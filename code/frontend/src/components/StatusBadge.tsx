// =============================================================================
// Proof of Aid — Team 05 — StatusBadge: pill with icon + label for a claim's status
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { STATUS_META, type RecordedClaimStatus } from '../utils/claimStatus';
import { ICONS } from './icons';
import './StatusBadge.css';

type StatusBadgeProps = { status: RecordedClaimStatus };

// Colour comes only from the status tokens (never recoloured locally) and is always paired with
// an icon and a text label, so the status survives colour blindness and greyscale screenshots.
export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = ICONS[meta.icon];
  return (
    <span className="status-badge" data-status={status}>
      <Icon size={14} />
      <span>{meta.label}</span>
    </span>
  );
}
