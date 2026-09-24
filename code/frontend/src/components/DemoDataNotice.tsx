// =============================================================================
// Proof of Aid — Team 05 — "Demo data" notice shown while no contracts are configured
// Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

// A trust tool must never let sample records pass for real ones, so demo mode is always labelled.
export function DemoDataNotice() {
  return (
    <span className="demo-notice" title="No contract addresses are configured. The claims shown are samples.">
      Demo data
    </span>
  );
}
