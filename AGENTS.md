# Agent Rules

- Read `doc/system-architecture.md`, `doc/damage-formula.md`, and `doc/skill-data.md` before changing calculation or combat-data behavior.
- Represent game mechanics in `data/*.json` when the existing schema can express them; avoid skill-specific hard-coding.
- Store percentages internally as decimal ratios (`0.1` = 10%); convert only at the UI boundary.
- Use the shared character/derived-stat pipeline and the centralized worker calculation result. Do not duplicate effective-stat, rate, or DPS calculations in UI components.
- Reuse a baseline timeline only for variants that cannot change combat events; rebuild it when timing, triggers, effects, stacks, cooldowns, or DOTs can change.
- Preserve stored user data and add migrations when renaming persisted fields.
- Update the relevant document when changing formulas, data semantics, or architecture.
- Run `npm run build` after code or data changes, plus a focused calculation check for simulation changes.
