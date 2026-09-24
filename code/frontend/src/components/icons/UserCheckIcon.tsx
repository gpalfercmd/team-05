// =============================================================================
// Proof of Aid — Team 05 — "user-check" icon (status InternallyVerified)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { SvgIcon, type IconProps } from './SvgIcon';

export function UserCheckIcon(props: IconProps) {
  return (
    <SvgIcon name="user-check" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </SvgIcon>
  );
}
