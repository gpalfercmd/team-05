// =============================================================================
// Proof of Aid — Team 05 — Reveal tests: scroll-triggered entrance, off without observer or under reduced motion
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reveal } from './Reveal';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

function stubObserver() {
  const state: { callback: Callback | undefined; disconnected: boolean } = { callback: undefined, disconnected: false };
  class FakeObserver {
    constructor(callback: Callback) {
      state.callback = callback;
    }
    observe() {}
    disconnect() {
      state.disconnected = true;
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reveal', () => {
  it('stays hidden until it scrolls into view, then reveals once and stops observing', () => {
    const observer = stubObserver();
    render(<Reveal>content</Reveal>);
    const box = screen.getByText('content');
    expect(box).toHaveAttribute('data-revealed', 'false');
    act(() => observer.callback?.([{ isIntersecting: false }]));
    expect(box).toHaveAttribute('data-revealed', 'false');
    act(() => observer.callback?.([{ isIntersecting: true }]));
    expect(box).toHaveAttribute('data-revealed', 'true');
    expect(observer.disconnected).toBe(true);
  });

  it('shows content immediately when there is no IntersectionObserver', () => {
    render(<Reveal>content</Reveal>);
    expect(screen.getByText('content')).toHaveAttribute('data-revealed', 'true');
  });

  it('shows content immediately under prefers-reduced-motion', () => {
    stubObserver();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    render(<Reveal>content</Reveal>);
    expect(screen.getByText('content')).toHaveAttribute('data-revealed', 'true');
  });

  it('passes a stagger delay as a CSS variable', () => {
    render(<Reveal delay={3}>content</Reveal>);
    expect(screen.getByText('content').style.getPropertyValue('--reveal-index')).toBe('3');
  });
});
