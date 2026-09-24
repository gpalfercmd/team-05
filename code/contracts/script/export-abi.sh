#!/usr/bin/env bash
# =============================================================================
# Proof of Aid — Team 05 — Exports the frozen interface ABIs to code/shared/abi
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p ../shared/abi
for name in IParticipantRegistry IClaimRegistry; do
  forge inspect "src/interfaces/${name}.sol:${name}" abi --json > "../shared/abi/${name}.json"
done
echo "ABIs written to code/shared/abi/"
