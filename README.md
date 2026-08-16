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
npm run format        # Format source, JSON data, and documentation
npm run format:check  # Check formatting without changing files
npm run build         # Type-check and create the production build in dist/
npm run preview       # Serve the production build locally
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

Read [AGENTS.md](AGENTS.md) and the relevant technical documents before changing calculation or combat-data behavior. Keep game mechanics in JSON when the existing schema supports them, update affected documentation, and verify changes with:

```bash
npm run format
npm run build
```

Simulation changes should also receive a focused calculation check.

## Deployment

GitHub Pages deploys through [the Pages workflow](.github/workflows/deploy.yml) when changes are pushed to the `release` branch. Merge the tested `main` branch into `release` to publish a new version.

## License

Copyright © 2026 greydust.

Except where otherwise noted, Where Builds Meet is free software licensed under the [GNU General Public License, version 3 or later](LICENSE). You may use, modify, and redistribute it under the terms of that license. Third-party material retains its respective rights and license terms.

The bundled Noto Sans font is licensed under the [SIL Open Font License 1.1](public/licenses/Noto-Sans-OFL.txt).

## Acknowledgements

- **yoka**, creator of the original spreadsheet that inspired this work
- The **Where Winds Math** site, for its work and contributions to the community
- **Mhysa**, for detailed Stonesplit Strength timing data and testing
- **Xia**, for Stonesplit Might skill data and mechanical explanations
