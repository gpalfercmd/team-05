// =============================================================================
// Proof of Aid — Team 05 — "shield-check" icon (status Verified, evidence match)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { SvgIcon, type IconProps } from './SvgIcon';

export function ShieldCheckIcon(props: IconProps) {
  return (
    <SvgIcon name="shield-check" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </SvgIcon>
  );
}
