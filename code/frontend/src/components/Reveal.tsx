// =============================================================================
// Proof of Aid — Team 05 — Reveal: fades a block in the first time it scrolls into view
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  /** Wrapper element; a list item inside a list, a section for a band. */
  as?: ElementType;
  className?: string;
  /** Position in a group: each step adds a short delay so a row staggers in. */
  delay?: number;
};

/** Nothing to wait for: no observer to ask, or the visitor asked for no motion. */
function startsRevealed(): boolean {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced || typeof IntersectionObserver === 'undefined';
}

/**
 * Content is hidden only while JavaScript can still reveal it, and never under reduced motion,
 * so the page cannot end up blank. The reveal happens once; scrolling away does not hide it again.
 */
export function Reveal({ children, as, className, delay = 0 }: RevealProps) {
  const Tag: ElementType = as ?? 'div';
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(startsRevealed);

  useEffect(() => {
    const node = ref.current;
    if (revealed || node === null) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [revealed]);

  const style = { '--reveal-index': delay } as CSSProperties;
  return (
    <Tag ref={ref} className={className === undefined ? 'reveal' : `reveal ${className}`} data-revealed={revealed} style={style}>
      {children}
    </Tag>
  );
}
