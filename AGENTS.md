# Agent Rules

- This is an AI-first codebase. Optimize architecture, naming, data layout, documentation, and workflows for reliable AI discovery, reasoning, editing, and verification.
- Do not follow requests blindly. When a request is ambiguous, doubtful, or has a materially better solution, explain the concern or alternative and wait for the user's decision before implementing it.
- Prefer explicit, regular, machine-navigable structures over conventions or abstractions that primarily benefit human maintainers. Human readability is desirable but is not a requirement outside the core calculation logic.
- Use `switch` for multi-option dispatch. Do not encode multiple alternatives as nested ternaries or extended `if`/`else if` chains.
- Humans are not expected to read through or maintain most of the codebase. Keep the core calculation logic human-readable and auditable because its formulas and numerical behavior require direct review.
- Read `doc/system-architecture.md`, `doc/damage-formula.md`, and `doc/skill-data.md` before changing calculation or combat-data behavior.
- Represent game mechanics in `data/*.json` when the existing schema can express them; avoid skill-specific hard-coding.
- When implementing a feature, prefer mechanisms in this order: use an existing mechanism unchanged; extend an existing mechanism so it also covers the new case; replace an existing mechanism with a broader mechanism that covers both the old and new cases, then remove the superseded mechanism; introduce a completely independent mechanism only when none of those options can fit. Avoid parallel mechanisms with overlapping responsibilities.
- Store percentages internally as decimal ratios (`0.1` = 10%); convert only at the UI boundary.
- Use the shared character/derived-stat pipeline and the centralized worker calculation result. Do not duplicate effective-stat, rate, or DPS calculations in UI components.
- Reuse a baseline timeline only for variants that cannot change combat events; rebuild it when timing, triggers, effects, stacks, cooldowns, or DOTs can change.
- Preserve stored user data and add migrations when renaming persisted fields.
- Update the relevant document when changing formulas, data semantics, or architecture.
- Tests and probes must verify observable behavior, calculations, migrations, or durable cross-file invariants. Do not add tests that merely restate literal source code or JSON values; such tests duplicate the implementation without validating its function or intent.
- Write each commit message with a one-sentence title summarizing the overall change, followed by a blank line and a brief description of why the change is being made.
- Do not use the commit body as a verbose inventory of updates. Put durable explanations in the relevant documentation or make the code and data self-explanatory.
- Run `npm run format` after editing supported source, data, or documentation files. Treat `npm run format:check` as the repository formatting gate.
- Run `npm run build` after code or data changes, plus a focused calculation check for simulation changes.
