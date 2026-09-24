// =============================================================================
// Proof of Aid — Team 05 — "moon" icon (switch to the dark theme)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { SvgIcon, type IconProps } from './SvgIcon';

export function MoonIcon(props: IconProps) {
  return (
    <SvgIcon name="moon" {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </SvgIcon>
  );
}
