// =============================================================================
// Proof of Aid — Team 05 — "help-circle" icon (status ProofRequested)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { SvgIcon, type IconProps } from './SvgIcon';

export function HelpCircleIcon(props: IconProps) {
  return (
    <SvgIcon name="help-circle" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </SvgIcon>
  );
}
