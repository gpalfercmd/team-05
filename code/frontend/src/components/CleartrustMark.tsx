// =============================================================================
// Proof of Aid — Team 05 — cleartrust brand mark: blue gradient "C" holding a shield
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

// Hand-traced from the brand artwork (ChatGPT_Image_25_sept_2026_13_09_39.png at the repo
// root), which ships on an opaque near-black background and cannot be used directly on the
// theme-aware header. Gradient stops sampled from the artwork; the shield uses the theme's
// on-surface token so it stays visible in light and dark mode.

import { useId } from 'react';

/** Wordmark blue ("trust"), constant across themes like the artwork. */
export const CLEARTRUST_BLUE = '#2aa0fc';

const GRADIENT_STOPS = ['#20c0f9', '#28a6fd', '#235fed'] as const;

export function CleartrustMark({ size = 26 }: { size?: number | undefined }) {
  // useId can contain colons, which break SVG fragment references: strip them.
  const gradientId = `cleartrust-c-${useId().replace(/:/g, '')}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GRADIENT_STOPS[0]} />
          <stop offset="0.5" stopColor={GRADIENT_STOPS[1]} />
          <stop offset="1" stopColor={GRADIENT_STOPS[2]} />
        </linearGradient>
      </defs>
      <path
        d="M 35 15.4 A 14 14 0 1 0 35 32.6"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={9}
      />
      <path
        d="M24 17.5 L29.5 19.8 V24.8 C29.5 28.6 27 30.8 24 32 C21 30.8 18.5 28.6 18.5 24.8 V19.8 Z"
        style={{ fill: 'var(--color-on-surface)' }}
      />
    </svg>
  );
}
