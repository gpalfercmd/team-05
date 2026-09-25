// =============================================================================
// Proof of Aid — Team 05 — Route table (shared by the browser router and the tests)
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

import type { RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicClaimPage } from './pages/PublicClaimPage';
import { WorkspacePage } from './pages/WorkspacePage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'workspace', element: <WorkspacePage /> },
      { path: 'claims/:claimId', element: <PublicClaimPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
