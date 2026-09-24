// =============================================================================
// Proof of Aid — Team 05 — Icon registry, keyed by the icon names used in DESIGN.md
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { ReactElement } from 'react';
import { AlertTriangleIcon } from './AlertTriangleIcon';
import { AnchorIcon } from './AnchorIcon';
import { CopyIcon } from './CopyIcon';
import { ExternalLinkIcon } from './ExternalLinkIcon';
import { FilePlusIcon } from './FilePlusIcon';
import { HelpCircleIcon } from './HelpCircleIcon';
import { LockIcon } from './LockIcon';
import { MoonIcon } from './MoonIcon';
import { ShieldCheckIcon } from './ShieldCheckIcon';
import { SunIcon } from './SunIcon';
import type { IconProps } from './SvgIcon';
import { UserCheckIcon } from './UserCheckIcon';
import { XOctagonIcon } from './XOctagonIcon';

// Keys match the `icon` values in DESIGN.md, so a design token resolves to a component by name.
export const ICONS = {
  anchor: AnchorIcon,
  'user-check': UserCheckIcon,
  'help-circle': HelpCircleIcon,
  'file-plus': FilePlusIcon,
  'shield-check': ShieldCheckIcon,
  'x-octagon': XOctagonIcon,
  'alert-triangle': AlertTriangleIcon,
  lock: LockIcon,
  copy: CopyIcon,
  'external-link': ExternalLinkIcon,
  sun: SunIcon,
  moon: MoonIcon,
} as const satisfies Record<string, (props: IconProps) => ReactElement>;

export type IconName = keyof typeof ICONS;

export type { IconProps } from './SvgIcon';
export {
  AlertTriangleIcon,
  AnchorIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilePlusIcon,
  HelpCircleIcon,
  LockIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  UserCheckIcon,
  XOctagonIcon,
};
