// =============================================================================
// Proof of Aid — Team 05 — Shared SVG wrapper for the inline icon set
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactNode } from 'react';
import type { IconName } from './index';

export type IconProps = {
  size?: number | undefined;
  /** Gives the icon an accessible name; without it the icon is decorative and hidden from screen readers. */
  title?: string | undefined;
  className?: string | undefined;
};

type SvgIconProps = IconProps & { name: IconName; children: ReactNode };

// Stroke icons inherit `currentColor`, so a badge or button colours its icon with its own text token.
export function SvgIcon({ name, size = 16, title, className, children }: SvgIconProps) {
  const labelled = title !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-icon={name}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      {children}
    </svg>
  );
}
