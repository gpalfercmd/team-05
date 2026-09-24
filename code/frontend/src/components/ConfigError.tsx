// =============================================================================
// Proof of Aid — Team 05 — Startup screen shown when the VITE_* configuration is invalid
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

type ConfigErrorProps = { message: string };

// Rendered instead of the app: a misconfigured deployment must not show any claim data at all.
export function ConfigError({ message }: ConfigErrorProps) {
  return (
    <main className="container app-main">
      <div className="card" role="alert">
        <h1>The app is not configured correctly</h1>
        <p>Check the values in code/frontend/.env against .env.example, then restart the app.</p>
        <pre className="muted">{message}</pre>
      </div>
    </main>
  );
}
