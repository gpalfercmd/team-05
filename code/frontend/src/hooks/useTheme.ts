// =============================================================================
// Proof of Aid — Team 05 — Light/dark theme: follows the system unless the user picks one
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import { useCallback, useLayoutEffect, useState } from 'react';
import { err, ok, type Result } from '../utils/result';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'proof-of-aid:theme';

// Storage can throw a DOMException (private mode, blocked site data); the theme then simply
// falls back to the system setting instead of breaking the page.
function readStoredTheme(): Result<Theme | undefined, string> {
  let result: Result<Theme | undefined, string>;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    result = ok(stored === 'light' || stored === 'dark' ? stored : undefined);
  } catch (error: unknown) {
    if (!(error instanceof DOMException)) {
      throw error;
    }
    result = err(error.message);
  }
  return result;
}

function storeTheme(theme: Theme): Result<void, string> {
  let result: Result<void, string>;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    result = ok(undefined);
  } catch (error: unknown) {
    if (!(error instanceof DOMException)) {
      throw error;
    }
    result = err(error.message);
  }
  return result;
}

function systemTheme(): Theme {
  const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme: Theme = prefersDark ? 'dark' : 'light';
  return theme;
}

function initialPreference(): Theme | undefined {
  const stored = readStoredTheme();
  const preference = stored.ok ? stored.value : undefined;
  return preference;
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [preference, setPreference] = useState<Theme | undefined>(initialPreference);
  const theme = preference ?? systemTheme();

  // Layout effect so an explicit choice is applied before the first paint (no light/dark flash).
  // Without a choice the attribute stays unset and tokens.css follows prefers-color-scheme live.
  useLayoutEffect(() => {
    if (preference === undefined) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = preference;
    }
  }, [preference]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setPreference(next);
    // Failing to persist only means the choice is not remembered on the next visit.
    storeTheme(next);
  }, [theme]);

  const state = { theme, toggleTheme };
  return state;
}
