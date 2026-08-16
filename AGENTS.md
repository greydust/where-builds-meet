# Agent Rules

- This is an AI-first codebase. Optimize architecture, naming, data layout, documentation, and workflows for reliable AI discovery, reasoning, editing, and verification.
- Prefer explicit, regular, machine-navigable structures over conventions or abstractions that primarily benefit human maintainers. Human readability is desirable but is not a requirement outside the core calculation logic.
- Humans are not expected to read through or maintain most of the codebase. Keep the core calculation logic human-readable and auditable because its formulas and numerical behavior require direct review.
- Read `doc/system-architecture.md`, `doc/damage-formula.md`, and `doc/skill-data.md` before changing calculation or combat-data behavior.
- Represent game mechanics in `data/*.json` when the existing schema can express them; avoid skill-specific hard-coding.
- Store percentages internally as decimal ratios (`0.1` = 10%); convert only at the UI boundary.
- Use the shared character/derived-stat pipeline and the centralized worker calculation result. Do not duplicate effective-stat, rate, or DPS calculations in UI components.
- Reuse a baseline timeline only for variants that cannot change combat events; rebuild it when timing, triggers, effects, stacks, cooldowns, or DOTs can change.
- Preserve stored user data and add migrations when renaming persisted fields.
- Update the relevant document when changing formulas, data semantics, or architecture.
- Run `npm run format` after editing supported source, data, or documentation files. Treat `npm run format:check` as the repository formatting gate.
- Run `npm run build` after code or data changes, plus a focused calculation check for simulation changes.
