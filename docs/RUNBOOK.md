# Runbook

Provide the shortest reproducible path from a fresh clone to a working demo.
Start setup from the repository root. After `cd code`, run subsequent commands from `code/` unless stated otherwise.

## Requirements

<!-- List required tools and versions, infrastructure, and external accounts. -->

## Setup and configuration

```bash
cd code
# Add dependency installation and preparation commands.
```

<!-- Document environment variables, networks, contracts, databases, and safe test
accounts. Provide code/.env.example when needed. Never include real secrets,
private keys, production credentials, or sensitive personal data.
State explicitly if no additional configuration is needed. -->

## Run

```bash
# Add commands to start the implementation.
```

**Expected result:** <!-- URL, endpoint, or output that confirms successful startup. -->

## Validate

```bash
# Add the fastest meaningful test or validation command.
```

**Expected result:** <!-- Describe what success looks like. -->

## Demo

Show one concrete result: **Initial state → Action → System behaviour → Observable result**.
Identify mocks explicitly and test the scenario from its documented initial state.

**Entry point:** <!-- URL, command, page, or script. -->

**Initial state:** <!-- Seed data, services, accounts, wallets, or manual preparation. -->

| Step | Action | Expected observable result |
| ---: | --- | --- |
| 1 | | |
| 2 | | |
| 3 | | |

<!-- Include any reset steps needed to repeat the scenario. The claim the demo
proves and validation evidence belong in SUBMISSION.md. -->

## Dependencies and limitations

<!-- Identify required external services, endpoints, test networks, mocks, and
manual steps. Explain how to obtain safe test credentials and any local fallback.
State explicitly if no external or simulated dependencies are needed. -->

| Dependency | Real / Mock / Simulated / Manual | Setup or availability notes |
| --- | --- | --- |
| | | |

<!-- List known setup, execution, or demo limitations and any useful recovery steps.
Broader product and design limitations belong in SUBMISSION.md. -->
