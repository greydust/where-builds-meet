# System Architecture

## Purpose and deployment

Where Builds Meet is a client-only Where Winds Meet build and rotation simulator.
It is implemented with React, TypeScript, and Vite and is intended to run on
GitHub Pages without a backend. Game definitions are JSON files imported at
build time. User changes remain in browser storage and calculation work runs in
a persistent Web Worker.

The long-term product direction is to accept complete character and gear data,
simulate rotations, compare alternatives, and recommend builds or rotations.

## Runtime overview

```text
JSON game data ─────────────┐
Browser storage ────────────┼─> React application state
User edits ─────────────────┘           │
                                       │ build immutable calculation bundle
                                       v
                              Persistent worker client
                              one running + latest pending
                                       │
                                       v
                              Rotation simulation worker
                              timeline -> damage -> variants
                                       │
                                       v
                              Central RotationMetrics store
                                       │
                         ┌─────────────┼─────────────┐
                         v             v             v
                       Main       DPS Breakdown   Rotation Editor
```

The UI never needs a server request. The worker receives a structured-cloneable
bundle containing every value required for a deterministic calculation.

## Source layout

```text
data/
  skill/          castable and triggered skill maps
  dot/            damage-over-time definitions
  buff/           player effect definitions
  debuff/         target effect and encounter-state definitions
  innerway/       cumulative tier rules and triggers
  martial-art/    weapon talent arrays
  rotation/       bundled default rotations
  build/          bundled default build presets
  gear.json       gear slots, item bases, affix choices, and attunements
  system.json     innate character stats, talent nodes, and attribute conversions
  default-setup.json  first-load Inner Ways and setup selections
  enemy.json      enemy profiles
  arsenal.json
  bow-ring-set.json
  gear-set.json
  food.json       setup choices and their effects
  stat-priority.json

doc/
  damage-formula.md
  skill-data.md
  system-architecture.md

src/
  App.tsx                         UI, data composition, and current orchestration
  BuildTab.tsx                    equipped slots, inventory, and gear editor
  gear.ts                         persisted gear model and equipped effects
  types.ts                       character and enemy contracts
  data/statDefinitions.ts        stat labels, units, and defaults
  calculations/
    effectiveStats.ts            attack ranges and outcome rates
    statEffects.ts               fixed, formula, and effective stat pipeline
    damage.ts                    per-action expected damage
    rotationTimeline.ts          event simulation and state tracking
    rotationCalculator.ts        baseline, variants, metrics, and breakdowns
    rotationWorker.ts            worker entry point
    rotationWorkerClient.ts      persistent worker and request coalescing
    rotationMetrics.ts           central published result store
```

## Application and UI state

`App.tsx` owns the shared character state:

- final-value character stat overrides
- final-value attunement overrides
- two equipped weapons
- build list and active build ID
- selected enemy
- globally resolved stats and derived stats
- the latest metrics published for the active rotation

It renders six tabs:

1. Main
2. Build
3. DPS Breakdown
4. Rotation Editor
5. Skill Editor
6. Settings

The Rotation Editor subtree remains mounted when another tab is selected and is
hidden with CSS. This preserves its local state and lets its worker calculation
continue. Main and DPS Breakdown subscribe to `rotationMetrics.ts` with
`useSyncExternalStore`; they render the latest published immutable metrics rather
than calculating independently.

The currently viewed build and active build are separate concepts. Only the
active build contributes gear stats and attunement to calculations. The same
viewed-versus-active distinction applies to rotations; an edited rotation
publishes metrics globally only when it is also active.

## Browser persistence

Character stat overrides use `localStorage`, so they persist across browser sessions.
Most editor and setup state uses `sessionStorage`, so it lasts for the current
tab session.

| State | Storage |
| --- | --- |
| Character stat overrides | `localStorage`, `wwm-stat-overrides-v1` |
| Build list and per-build gear | `localStorage`, `wwm-build-list-v1` |
| Active build ID | `localStorage`, `wwm-active-build-v1` |
| Skill editor overrides | `sessionStorage`, `wwm-skill-editor-session-v1` |
| Inner Ways | `sessionStorage`, `wwm-inner-way-session-v1` |
| Attunement overrides | `sessionStorage`, `wwm-attunement-overrides-v1` |
| Weapons and enemy | `sessionStorage`, `wwm-settings-session-v1` |
| Arsenal | `sessionStorage`, `wwm-arsenal-session-v1` |
| Bow/ring set | `sessionStorage`, `wwm-bow-ring-set-session-v1` |
| Gear sets | `sessionStorage`, `wwm-gear-set-session-v1` |
| Food | `sessionStorage`, `wwm-food-session-v1` |
| Rotation list | `sessionStorage`, `wwm-rotation-list-session-v1` |
| Active rotation ID | `sessionStorage`, `wwm-active-rotation-session-v1` |

Loaders validate enough shape to fall back to defaults and include migrations
for older percentage, penetration, attunement, rotation, and single-inventory
gear formats. Non-zero values from the former raw character and attunement
storage keys migrate to overrides, preserving existing manual inputs. Calculated
metrics and timelines are not persisted.

When the corresponding session key is absent, `data/default-setup.json` supplies
the first-load Inner Ways, gear sets, bow/ring set, arsenal, and food. Once a
user changes a selection, the stored session value continues to take priority.

## Character stat pipeline

`calculateStatsWithEffects()` is the canonical path from simulation base stats
to the character values used for damage:

```text
simulation base stats
  -> fixed base-stat effects
  -> base-stat formula effects
  -> initial effective stats
  -> derived-source formula effects
  -> effectiveStat effects
  -> final stats + final derived stats
```

Equipped gear contributes one data-derived `stat` effect to this same pipeline.
With no overrides, the simulation base is the empty character and all displayed
stats come from the innate character system, character talents, gear, Inner
Ways, martial-art talents, arsenal, bow/ring set, gear sets, and food.

`data/system.json` keeps innate `baseStats`, level-derived `levelBonusStats`,
ordered `talentStats`, regional
Oddity groups such as `qingheOddityStats`, `kaifengOddityStats`, and
`imperialPalaceOddityStats`, `hexiOddityStats`,
`hiddenMountainOddityStats`, and `attributeConversions` separate. Talent and
Oddity rewards remain individual
effects so their source progression is auditable even when several rewards
grant the same stat. Attribute conversions are regular formula effects in the
shared pipeline, so Power, Agility, Momentum, Body, and Defense gained from any
source use the same conversion rules.

Editing a Main-tab field creates a final-value override. The field is marked as
modified and gains an individual reset control; Reset Stats clears all character
and attunement overrides. `calculateStatsWithOverrides()` repeatedly runs the
shared pipeline and solves the simulation base offset required to produce every
overridden final value. This means later baseline input changes cannot move an
override, while overridden source stats still feed formula-derived stats.

The solved simulation base—not an overlaid display object—is sent to the worker.
The active baseline effects reconstruct the overridden value there, while setup,
priority, and other comparison variants apply their changed effects to the same
base. Modified stats therefore remain responsive in delta calculations.

Gear attunements are the calculated attunement baseline. An attunement override
replaces its final displayed baseline value, but priority variants still add
their tested amount to that value.

`effectiveStats.ts` owns minimum/maximum normalization, Void/Formless folding,
Judgement Resistance, effective-rate caps, and final outcome rates. Damage code
receives the already-derived character object and only recalculates it when an
action has temporary `stat` or `effectiveStat` effects.

## Combat timeline

`buildRotationTimeline()` turns an ordered rotation into one global event queue.
It produces three row kinds:

- `rotation`: an explicit skill or manual event
- `trigger`: a skill inserted by a trigger action
- `dot`: generated DOT actions

Base skill casts are initially placed sequentially. Manual events use absolute
times and consume no cast time. The event queue is sorted by timestamp and then
by a lexicographic causal order. This lets casts, actions, triggers, and DOTs
interleave while ensuring a zero-time action caused by one event resolves before
an unrelated next cast at the same time.

The timeline owns mutable simulation state while it is being built:

- active player buffs
- active target debuffs
- stacks, maximum stacks, and expirations
- skill, action, and effect cooldowns
- action-time state snapshots

At cast start, modifiers are selected and cast/action times are adjusted. At
each action, expired effects are pruned, requirements are checked, and the state
snapshot is recorded before the action mutates state. Damage-triggered setup and
Inner Way rules then run, followed by the action's trigger, DOT, apply, consume,
extend, or cooldown behavior.

The simulator has a 2,000-event safety limit to prevent accidental infinite
trigger chains.

## Damage calculation

`calculateDamageBreakdown()` is a pure per-action calculation. Its input contains
the action, resolved character, attunement, enemy, equipped weapons, skill tags,
active effects, and a DOT flag. It returns expected Physical, Bellstrike,
Stonesplit, Silkbind, and Bamboocut damage plus outcome rates.

The function computes abrasion, normal, critical, and affinity variants, then
rate-weights each component. See `damage-formula.md` for the exact formula and
bonus categories.

## Calculation bundle and worker

The Rotation Editor currently composes a `RotationSimulationBundle`. It contains:

- the baseline `TimelineBuildInput`
- start anchor
- character stats, derived stats, attunement, enemy, and weapons
- one-stat-line variants
- attunement variants
- Inner Way removal variants
- arsenal, bow/ring, food, and gear-set comparisons
- equipped gear stats and attunements

The bundle is memoized from a serialized calculation-state key. React sends it
to `requestRotationSimulation()` and returns to rendering; the main thread does
not run the rotation simulation.

`rotationWorkerClient.ts` owns one persistent module worker. Its queue policy is:

1. If idle, dispatch immediately.
2. If a job is running, retain one pending request.
3. A newer request replaces the pending request and rejects the superseded
   promise.
4. When the running job finishes, dispatch the newest pending bundle.

The running calculation is not cancelled. This coalesces rapid edits while
ensuring the next calculation uses the newest complete state.

`rotationWorker.ts` has no React or storage dependency. It invokes the pure
calculation entry point and posts the result or a serialized error.

## Baseline and variant calculation

`calculateRotationSimulation()` performs work in this order:

1. Build the baseline timeline once.
2. Resolve the selected start anchor and duration through the final action.
3. Create baseline damage entries and one detailed breakdown per damage action.
4. Calculate baseline total damage and DPS once.
5. Evaluate every priority and setup variant against that baseline.
6. Produce skill, skill-category, and physical/attribute breakdowns.

Pure stat and attunement variants reuse the baseline timeline and its effect
snapshots. Inner Way removal variants rebuild the timeline because triggers,
cooldowns, durations, stacks, and cast times may change. Setup candidates reuse
the baseline timeline when they only change stats; a behavior-changing candidate
must provide a replacement timeline. Cleftpeak 4-piece currently does so.

Each priority row stores absolute DPS difference and percentage change. Character
and attunement priorities sort by descending DPS gain. Inner Ways are removed,
so their rows sort by the most negative DPS change first.

## Result publication

The worker returns:

- `RotationMetrics`
- baseline timeline
- anchor time and duration
- per-action `DamageBreakdown` map

The Rotation Editor uses the timeline and action map for its table and tooltips.
If the edited rotation is active, it publishes `RotationMetrics` to the central
module store. Main and DPS Breakdown update from that single result. While a new
worker request runs, the previous complete result remains visible.

## Static data composition

JSON is imported explicitly in `App.tsx`, so Vite includes it in the generated
static assets. The application currently recognizes:

- Snowparting, Phalanxbane, Mystic, and General skill editor categories
- Snowparting and Phalanxbane weapon IDs
- five Inner Ways
- Exhausted and Controlled manual events
- the bundled Stonesplit Strength default rotation
- eight gear slots and their affix/attunement options
- innate character, talent, and base-attribute conversion stats

Effect definitions are merged into one ID map from buff, debuff, and DOT files.
IDs must therefore be globally unique or a later spread will replace an earlier
definition.

## Adding data

### Skill or triggered skill

Add the record to an imported `data/skill/*.json` map and reference its ID from
rotation or trigger actions. A new editor category also requires an import and a
`defaultSkillMaps` entry in `App.tsx`.

### Buff, debuff, or DOT

Add the definition to the appropriate JSON file and ensure that file is included
in `effectDefinitions`. DOTs must also be present in the `dots` map. Follow
`skill-data.md` for stacking and duration semantics.

### Inner Way

Add its JSON file, import it into `innerWayDefinitions`, and provide cumulative
tier IDs from T0 through T6. Selection automatically activates all tiers through
the selected tier.

### Enemy

Add a complete `EnemyProfile` entry to `data/enemy.json`. The settings UI reads
the imported map.

### Gear definition

Add or update the slot definition, fixed base stats, allowed affixes, and
attunements in `data/gear.json`. See `gear-data.md` for the persisted item shape,
percentage conversion, and weapon-slot mapping.

### Character system stats

Update `data/system.json`. Keep innate values under `baseStats`, level-derived
values under `levelBonusStats`, every talent grant as its own ordered
`talentStats` entry, and every regional Oddity reward
under its own ordered collection such as `qingheOddityStats` or
`kaifengOddityStats`. Express base-attribute relationships under
`attributeConversions` using standard stat formulas.

### Weapon or primary path

This currently requires code changes to `WeaponId`, settings validation, martial
art imports, attunement matching, and `mainAttribute()` in `damage.ts`.

### Manual event

Add the event to the `RotationStep` union, `rotationEventDefinitions`, editor
options, and any special duration UI. General event definitions are currently
hard-coded rather than loaded from data.

## Known architectural limitations

- `App.tsx` is still a large composition and UI module. The calculation engine
  is pure and worker-safe, but bundle construction remains inside
  `RotationEditorTab` rather than a top-level application service.
- Skill Editor overrides are saved and displayed for the session, but the
  rotation simulator currently builds its skill map from defaults, so overrides
  do not affect DPS yet.
- If a different rotation is being edited, character changes do not currently
  recalculate the active rotation in the background; only active edited results
  are published.
- Manual event definitions and supported weapons are hard-coded.
- The primary attribute resolver only knows the current Stonesplit weapons.
- DMG Bonus Category 2 is specified but not implemented.
- DOT tick generation uses the DOT definition's duration, not an individual
  apply action's duration. Definitions without duration currently tick through
  the remaining base rotation.
- There is no automated test suite yet; `npm run build` is the current type and
  production-bundle verification step.

## Development and deployment

```text
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` performs TypeScript project compilation followed by a Vite
production build into `dist/`. No API keys, database, server process, or runtime
configuration are required for GitHub Pages hosting.
