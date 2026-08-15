# Where Builds Meet

Where Builds Meet is a browser-based build and rotation simulator for **Where Winds Meet**. It combines character stats, equipment, effects, and a timed combat rotation to calculate damage, DPS, and comparison metrics.

The app is built with React, TypeScript, and Vite. It is fully client-side: game data is bundled from JSON, user settings are stored in the browser, and simulations run in a Web Worker.

## Quick start

Requirements:

- Node.js `20.19+` or `22.12+`
- npm

```bash
npm ci
npm run dev
```

Vite will print the local development URL, normally `http://localhost:5173`.

Other commands:

```bash
npm run build    # Type-check and create the production build in dist/
npm run preview  # Serve the production build locally
```

There is currently no automated test suite. `npm run build` is the baseline verification step; simulation changes should also receive a focused calculation check.

## Project map

```text
data/                 Game definitions: skills, effects, gear, enemies, rotations
doc/                  Architecture, formula, and combat-data documentation
src/App.tsx           Application state, UI composition, and simulation inputs
src/calculations/     Stat resolution, timeline simulation, damage, and Web Worker
src/data/             UI-facing stat definitions
src/types.ts          Shared character and enemy types
```

At runtime, the app resolves character and setup data, builds an immutable calculation bundle, and sends it to a persistent Web Worker. The worker builds the combat timeline, calculates damage and variants, then publishes one centralized result used by the UI.

For more detail, start with:

- [System architecture](doc/system-architecture.md)
- [Damage formula](doc/damage-formula.md)
- [Skill and combat-effect data](doc/skill-data.md)
- [Gear data and inventory](doc/gear-data.md)

## Contributing

Before changing calculations or combat data, read the relevant documents above. A few important rules:

- Prefer representing mechanics in `data/*.json` instead of adding skill-specific code.
- Store percentages as decimal ratios (`0.1` means 10%); convert them only at the UI boundary.
- Use the shared stat pipeline and centralized worker result. Do not recalculate effective stats, rates, or DPS in UI components.
- Rebuild timelines for variants that can affect timing, triggers, effects, stacks, cooldowns, or DOTs. Reuse the baseline only for stat-only variants.
- Preserve browser-stored user data and add a migration when persisted fields change.
- Update the relevant document when formulas, data semantics, or architecture change.

A typical contribution loop is:

```bash
npm ci
npm run dev
# make and inspect the change
npm run build
```

When adding skills or effects, keep internal IDs stable, keep action times ordered, use exact case-sensitive tags, and follow the schemas and examples in [Skill and combat-effect data](doc/skill-data.md).

## License

Copyright © 2026 greydust.

Except where otherwise noted, Where Builds Meet is free software licensed under the [GNU General Public License, version 3 or later](LICENSE). You may use, modify, and redistribute it under the terms of that license. Third-party material retains its respective rights and license terms.

The bundled Noto Sans font is licensed under the [SIL Open Font License 1.1](public/licenses/Noto-Sans-OFL.txt).

## Acknowledgements

Special thanks to **yoka**, creator of the original spreadsheet that inspired this work, and to the **Where Winds Math** site for its work and contributions to the community.
