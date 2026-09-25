// =============================================================================
// Proof of Aid — Team 05 — Skeleton: placeholder blocks shaped like the content that is loading
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

type SkeletonBlocksProps = {
  /** Grey lines to draw below an optional title line. */
  rows?: number;
  title?: boolean;
  /** `row`: a taller line shaped like a list row (badge, ID, button). */
  variant?: 'text' | 'row';
};

/** Decorative lines only; the surrounding `Skeleton` carries the accessible status. */
export function SkeletonBlocks({ rows = 3, title = true, variant = 'text' }: SkeletonBlocksProps) {
  const rowClass = variant === 'row' ? 'skeleton__block skeleton__block--row' : 'skeleton__block';
  return (
    <>
      {title && <div className="skeleton__block skeleton__block--title" aria-hidden="true" />}
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={index === rows - 1 && variant === 'text' ? `${rowClass} skeleton__block--short` : rowClass}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

type SkeletonProps = SkeletonBlocksProps & {
  /** Read out while loading ("Loading the claim list"); also shown as a short caption. */
  label: string;
  /** Extra classes, e.g. `card` when the loaded content is a card. */
  className?: string;
};

/**
 * A busy region the size of the content it stands for, so nothing jumps when the data arrives
 * (DESIGN.md: skeletons instead of blank space).
 */
export function Skeleton({ label, className, ...blocks }: SkeletonProps) {
  return (
    <div className={className === undefined ? 'skeleton' : `${className} skeleton`} role="status" aria-busy="true" aria-label={label}>
      <p className="skeleton__text caption">{label}…</p>
      <SkeletonBlocks {...blocks} />
    </div>
  );
}
