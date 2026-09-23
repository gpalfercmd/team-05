# Proof of Aid Hackathon

**Design the complete system. Build one meaningful part in depth.**

Design how aid moves from a need to a verifiable outcome, then implement a focused contribution that demonstrates your approach.

```text
Need → Verification → Funding → Delivery → Outcome → Transparent history
```

Your architecture, stack, and implementation focus are open. Use blockchain where it adds meaningful value. Depth matters more than feature count.

## Start here

1. **Design the system** in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): actors, e2e flow, architecture, trust, and trade-offs.
2. **Choose a concrete problem** within that design and implement it under [code/](code/).
3. **Prove it works** with a reproducible demo and complete the [runbook](docs/RUNBOOK.md).
4. **Complete [the submission](docs/SUBMISSION.md)** and submit a commit SHA from `main` through the appropriate form.

The complete system is a design exercise; you are only expected to implement one meaningful part. Your design can evolve as you build.

## Repository guide

| Path | Purpose |
| --- | --- |
| [code/](code/) | Implementation, with a short overview in [code/README.md](code/README.md). |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Complete system design, actors, flow, and trade-offs. |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Setup, configuration, validation, and reproducible demo. |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Contribution, implementation boundaries, evidence, limitations, and AI disclosure. |

## Choose your focus

These are prompts, not mandatory tracks. Combine them or choose another relevant problem.

| Area | Questions to explore |
| --- | --- |
| Claims & Lifecycle | How are needs, milestones, changes, and cancellations represented without losing history? |
| Trust, Evidence & Privacy | Who verifies claims? How is evidence checked, disputed, and kept private? |
| Funding | How do donated, received, reserved, and available funds differ? What permits release? |
| Delivery & Impact | What proves a purchase, delivery, or outcome? How can beneficiaries confirm or challenge it? |
| Transparency & UX | How can each actor understand what happened and distinguish verified facts from claims? |

A useful scope statement:

> Within our complete Proof of Aid design, we focus on **[area]**, addressing **[problem]** through **[approach]**.

## Checkpoint and final submission

Use your assigned private team repository. Organizers manage access; contact them if a teammate cannot access it. Do not create a replacement repository.

Working directly on `main` or using branches is fine. Everything to be evaluated must be committed and pushed to `main`; no PR or release is required.

| Submission | Required state | Form |
| --- | --- | --- |
| Thursday checkpoint | Current system vision, initial flow and architecture, chosen problem and approach, effort split, and what works or remains missing/simulated. | [Checkpoint form](https://forms.gle/V1Xm4fH4pHpEBEmN8) |
| Final | Completed design and contribution, tested setup and demo, clear boundaries and limitations, and AI disclosure. | [Final form](https://forms.gle/B2vtMJdtdV5pBG7Y7) |

For each submission:

1. Update the documentation and commit all work to be evaluated on `main`.
2. Push `main` and copy the commit SHA:

   ```bash
   git status
   git push origin main
   git rev-parse HEAD
   ```

3. Submit **Team ID + commit SHA** through the relevant form.

The submitted SHA defines the evaluated version. Later commits do not change it. There is no separate checkpoint document, and the SHA does not belong in `docs/SUBMISSION.md`. Continue working after the checkpoint; repositories become read-only for participants after the final deadline.

## Schedule

Month, year, timezone, and exact Thursday checkpoint deadline are awaiting organizer confirmation.

| Day | Time | Activity |
| --- | --- | --- |
| Thursday 24 | 08:30 | Accreditation |
| | 09:00 | Welcome and talks |
| | ~11:00 | Breakfast, remaining team formation, and Hackathon start — Room 3.01 |
| | Rest of day | Development and mentoring; checkpoint deadline set by organizers |
| Friday 25 | Morning | Development and mentoring |
| | **14:00** | **Final submission deadline** |
| | 14:00–15:00 | Participant lunch and jury review |
| | 15:00 | Finalists announced |
| | 15:00–16:00 | Pitch preparation |
| | 16:00 | Pitches |
| | 17:00 | Awards and closing |

## Before submitting

- [ ] The complete design and focused implementation are clear and connected.
- [ ] Implemented, mocked, designed-only, and out-of-scope capabilities are explicit.
- [ ] Setup and demo instructions work; dependencies and limitations are documented.
- [ ] All documentation, demos, and pitch material are in **English**.
- [ ] Meaningful AI use is disclosed, including how outputs were reviewed or validated. The team can explain and defend the work.
- [ ] No secrets, private keys, production credentials, or sensitive personal data are committed.
- [ ] Everything to be evaluated is pushed to `main`, and **Team ID + SHA** is submitted through the form.

## License

The code and documentation in this repository are licensed under the [MIT License](LICENSE), matching the [Proof of Aid organization license](https://github.com/proof-of-aid/.github/blob/main/LICENSE).
Third-party materials retain their respective licenses.
