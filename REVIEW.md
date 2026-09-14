# Code Review — Maintainability and Readability

Scope: maintainability / readability only. No behavior changes proposed.
Basis: `src/` inspection plus `doc/system-architecture.md`,
`doc/damage-formula.md`, `doc/skill-data.md`, and `AGENTS.md`.
No code was changed for this review.

## T0 — Harden the toolchain before refactors

Tooling must carry the refactors below, so strictness comes first (ordered by
dependency; each item includes fixing its own fallout so gates stay green).

1. Raise oxlint strictness successively, fixing each phase before the next:
   plugins first, then the `suspicious`, `perf`, and `pedantic` categories
   (`correctness` is already on). Target plugin set: `eslint`,
   `typescript`, `unicorn`, `react`, `react-perf`, `oxc`, `import`, and
   `jsx-a11y` (current: only `typescript`, `unicorn`, `oxc`). Triage the new
   findings before P0 starts so refactors do not inherit fresh violations.
2. Scope the `vitest` plugin to `tests/` only (nested config or override),
   keeping the rest of the codebase on the T0 item 1 plugin set.
3. Set `sortPackageJson: true` in `.oxfmtrc.json` (currently `false`) and
   accept the one-shot `package.json` reorder.
4. Return stylelint to plain `stylelint-config-standard` with no local rule
   overrides (current overrides pin number alpha/hue/lightness, prefix media
   queries, and disable specificity/keyword-case checks). Fix the stylesheet
   fallout once instead of carrying the exceptions.
5. Remove `typescript-classic`: rewrite the remaining classic compiler-API
   users (`script/i18n/extract.mjs`, `script/i18n/migrate-source.mjs`,
   `tests/gear.test.ts`) against a supported API, then drop the alias
   dependency. Do this last; it is the only item needing a rewrite rather
   than config plus fallout fixes.

## P0 — Split oversized modules first

1. `src/App.tsx` (9056 lines) is a god-component.
   `RotationEditorTab` (`src/App.tsx:5588-8496`, ~2909 lines),
   `StatsTab` (`src/App.tsx:2680-3933`, ~1254 lines),
   `SkillEditorTab` (`src/App.tsx:5072-5516`),
   plus persistence keys/migrations, domain math, formatting, worker
   orchestration, and all seven tabs live in one file.
   Split to `tabs/StatsTab/*`, `tabs/RotationEditor/*`
   (list vs. timeline vs. calculation orchestration),
   `tabs/SkillEditor/*`, `tabs/BreakdownTab/*`,
   `storage/*`, `format.ts`, and `characterPipeline.ts`.
   `RotationEditorTab` alone owns ~12 refs, ~15 memos, ~30 inner
   update/commit/move/save functions; it cannot be reviewed safely as one unit.

2. `src/calculations/rotationTimeline.ts:743` `buildRotationTimelinePass()`
   (~2700 lines) violates the AGENTS.md requirement that core calculation
   stay human-readable and auditable. Keep the pass as orchestration only;
   extract `expandSkill`/`appendSubAction`, the cooldown tracker, trigger /
   periodic executors, and auto-HP / dummy-attack synthesis
   (`src/calculations/rotationTimeline.ts:1993,3489-3503`) into named helpers
   with `// Phase N:` banners.

3. `src/calculations/rotationCalculator.ts:851` `calculateBreakdown()`
   (~500 lines), `createTimelineEntryBuilder()`
   (`src/calculations/rotationCalculator.ts:1506`, ~387 lines),
   `timelineDamageEntries()` (`src/calculations/rotationCalculator.ts:1893`,
   ~328 lines), and `calculateDamageBreakdownInternal()`
   (`src/calculations/damage.ts:172`, ~353 lines) mix aggregation,
   entry construction, mechanic detection, metrics, and sorting.
   Split coverage/breakdown/entry-building from resolution; move benchmark
   `start/finishCalculationPhase` instrumentation behind a
   `withPhase(name, fn)` helper so the formula reads without noise.

4. `src/BuildTab.tsx` (1220 lines) and `src/gear.ts` (1080 lines, 51 exports)
   each combine 5–6 responsibilities: types, static data, roll math,
   eligibility, normalization, persistence, inventory resolution, display,
   import/export, and `calculateEquippedGearEffects`.
   Split to `gearTypes.ts` / `gearData.ts` / `gearRolls.ts` /
   `buildPersistence.ts`, and `BuildOverview.tsx` / `BuildManagement.tsx` /
   `BuildSetupPanel.tsx` / `buildDisplay.ts`.
   Extract pure draft validation from `src/components/GearEditor.tsx:73-195`
   into `gearDraft.ts`.

## P0 — Single shared helpers for formatting, percents, storage

5. Deduplicate formatting and percent conversion.
   `formatNumber` exists 3–4 times (`src/App.tsx:1572`,
   `src/components/GearEditor.tsx:43`, `src/SimulationTab.tsx:53`,
   `src/BuildTab.tsx:118-119`); ratio `<->` percent `*100//100` is scattered
   (`src/App.tsx:2034,3148-3235,6010,7730,8030-8411`,
   `src/BuildTab.tsx:119`, `src/components/GearEditor.tsx:56,185,195`,
   `src/SimulationTab.tsx:54,67,244`).
   Add one `src/ui/format.ts` (`formatNumber`, `formatPercentRatio`,
   `formatRange`, `PercentField`) and enforce decimal ratios internally with
   conversion only at the UI boundary per AGENTS.md.

6. Route all persistence through `src/persistentStorage.ts`.
   `src/gear.ts:582,958,1027`, `src/characterProfiles.ts:73-75`, and
   `src/App.tsx:708,1634,1670,8802-8831` use raw `localStorage` and bypass
   the session-to-local migration; `loadPathSelectionIds`
   (`src/App.tsx:538-556`) writes back inside a loader.
   Add a version to the build-list snapshot (rotations and profiles already
   have one), surface corrupt-storage errors instead of silent
   `catch -> defaults`, and unify the legacy global active-build/rotation
   migration currently split between `src/gear.ts:1027-1042` and `src/App.tsx`.

## P1 — Calculation readability and data-driven mechanics

7. Resolve the enemy-defense discrepancy before any other formula cleanup:
   `src/calculations/damage.ts:81` uses `ENEMY_DEFENSE = 405` while
   `doc/damage-formula.md:7` specifies 408. Hoist defense, `1.5` path
   multiplier (`src/calculations/damage.ts:377`), penetration divisors
   (`/200` vs `/100` in `src/calculations/damage.ts:131`,
   `src/calculations/healing.ts:122,126`), rate caps (`0.8`, `0.4`, `0.75`,
   `0.15` in `src/calculations/effectiveStats.ts:96,109-110,178-179`),
   `2000`-event cap and `1e-4` / `5.5s` / auto-HP grid constants in
   `rotationTimeline.ts` into `combatDefaults.ts` with doc links.

8. Add formula-trace comments in the auditable core.
   `damage.ts:281-414`, `effectiveStats.ts:174-180`,
   `healing.ts:118-142` reimplement `damage-formula.md` sections with
   ~1 comment per ~200 lines. Add one-line cites (`Shared multiplier`,
   `Path multiplier`, `Penetration`, `Rate calculation`, group-heal rules)
   following the good examples in
   `src/calculations/statEffects.ts:92-93,240-241,269-271`.

9. Replace code-locked tables with data or single maps, smallest first
   (per AGENTS.md mechanism preference):
   weapon-to-primary-attribute table
   (`src/calculations/effectiveStats.ts:43-75`) to `data/martial-art/*.json`
   or `system.json`; `weaponArtBonus` / `mysticSkillDamageBonus`
   (`src/calculations/damage.ts:134-170`) to a tag-to-stat map;
   ~50-field `AttunementStats` (`src/calculations/damage.ts:23-78`) to
   `Record<string, number>` plus the existing tag-match helper;
   `SteadfastGuaranteedCrit` tags/thresholds
   (`src/calculations/effectiveStats.ts:95`, `src/calculations/damage.ts:430`)
   to a data rule. Rename the variable to lowerCamelCase; it currently reads
   as a type. Do not generalize Hawkwing / Insightful Strike / Seasonal Edge
   into one tracker until the small tables are done — that unification is
   larger and risks overlapping mechanisms.

10. Remove narrow duplication between expected and sampled paths without
    merging their semantics: shared `resolveHitTimeEffectValue()` and
    `matchingAttunement()` for `healing.ts:28-67` vs. `damage.ts:181-335`;
    extract `resolveHawkwing` / `resolveInsightful` / `resolveSeasonal` from
    the 200-line `resolve()` closure
    (`src/calculations/rotationCalculator.ts:379-578`); document that
    `damageScale` scales damage while `hitProbability` counts hits
    (`src/calculations/damage.ts:346`).

## P1 — Dispatch, naming, and types

11. Follow the AGENTS.md `switch` rule literally.
    Convert deep nested ternaries to `switch` or lookup maps:
    `src/App.tsx:3146-3176` (4-deep stat dispatch, duplicated left/right),
    `src/App.tsx:8369`, `src/calculations/rotationTimeline.ts:3210,2492`,
    `src/calculations/dynamicValues.ts:14`.
    Convert `switch (true)` (`src/calculations/damage.ts:441`) to `if/else`
    or a threshold lookup, and entry-kind `if/else-if` chains
    (`src/calculations/rotationCalculator.ts:244-276`,
    `src/App.tsx:906-948,1295-1310`) to `switch`.

12. Fix misleading names and unify glossaries.
    `weapons` vs `martialArts` vs `martialArtTags` (`src/BuildTab.tsx:228-239`,
    `src/gear.ts:401,412,451`); `wwm-*-session-v1` storage suffix (all
    `localStorage` now); `t()` vs `dataText()` vs `gameText()`
    (`src/i18n.ts:134,147,151`); `isDefault` vs `test` vs
    `buildEntryIsTestPreset`; five stat-stage names in one destructure
    (`src/App.tsx:5622-5625,8617-8618`); `tick` meaning 0.1 ms ints in
    outcome trackers vs seconds elsewhere; `unconditional` vs `remaining` vs
    `residual` vs `aggregated`. Reduce `as unknown as EditableObject`
    casts in the skill editor (`src/App.tsx:3934-5071`) with narrower JSON
    value types.

13. Replace fragile structural keys with stable hashes where profiling
    justifies it: `JSON.stringify(effects)` grouping
    (`src/calculations/rotationCalculator.ts:491`) and the `WeakMap`/string
    cache key in `src/calculations/actionStats.ts:30-34`. Document the
    baseline-reuse contract next to
    `canReuseExpectedOutcomeBuffSchedule`
    (`src/calculations/rotationCalculator.ts:2493-2538`): exactly which
    variant fields force a rebuild, cross-linked to `system-architecture.md`.

## P2 — Boundaries: i18n, UI layering, CSS, data schemas

14. Keep localized values out of persisted/cached IDs.
    Key `gameMessages` by stable ID, not English text
    (`src/i18n.ts:100-110`); translate the fallback in
    `src/components/GearOcrModal.tsx:94`; verify exports contain no localized
    strings (`src/gear.ts:795`, `src/BuildTab.tsx:336`); cover hardcoded
    names in `src/globalDebuffs.ts:29-35` with `gameText`/`t`. Workers are
    currently clean (no locale imports in worker/calculator files).

15. Keep the `src/ui/` one-way dependency and centralize calculation.
    `src/ui/Modal.tsx` is clean; the risk is duplicated derivation in UI:
    `BuildTab.tsx:150` display path bypasses pipeline caps, and
    `src/statPriorityDisplay.ts:25-30` applies `relayedAffixMultiplier`
    (`src/gear.ts:172`) outside `calculations/`. Move that scaling into a
    worker variant or mark and test it explicitly as an estimate.

16. Stabilize CSS layering and tokens.
    All of `mobile.css`, `domains/*.css`, `components/*.css` share
    `@layer components`, so `.panel-heading`, `.build-list-item`,
    `.build-manager-panel` winners depend on import order in
    `src/main.tsx:10-25`. Give `domains/` and `mobile/` distinct layers or
    move to CSS modules; move hardcoded spacing and the `48em`/`80em`
    breakpoints (`src/BuildTab.tsx:101`) into `tokens.css`.

17. Add `data/schema/*.schema.json` plus a CI check and normalize irregular
    shapes: `bySoloLevel` leading-`null` padding, stringified-numeric set-tier
    keys (`gear-set.json: "0","2","4"`), empty-tier `{}` vs effect arrays,
    and top-level shape differences across `stat.json`, `breakthrough.json`,
    `gear.json`, `path.json`, `system.json`. Prefer explicit `null`/`[]`
    over `{}` so AI and validators do not need special cases.
