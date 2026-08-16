# System Architecture

## Purpose and deployment

Where Builds Meet is a client-only Where Winds Meet build and rotation simulator.
It is implemented with React, TypeScript, and Vite and is intended to run on
GitHub Pages without a backend. Game definitions are JSON files imported at
build time. User changes remain in browser storage. Deterministic calculation
work runs in a persistent Web Worker, while requested Monte Carlo simulations
run in their own disposable worker.

## Typography and resilient layout

The UI self-hosts the variable Noto Sans family through Fontsource as its
cross-platform Latin, Greek, Cyrillic, and Devanagari baseline. System sans
fonts remain the loading, accessibility-override, and unsupported-script
fallback. Script-specific Noto families should be added alongside a locale
when translations for that script are introduced; the base Noto Sans package
does not contain CJK glyphs.

Layouts must remain usable when the web font is unavailable or overridden.
Text-bearing controls wrap instead of relying on English-label pixel widths,
flex and grid children use zero minimum sizes, longer content may grow row
height, and dense data tables scroll horizontally rather than compressing or
clipping their columns. Fixed square dimensions are reserved for icons and
other non-text controls. UI icons are SVG components so their geometry does
not depend on the active font. Noto Sans is therefore a repeatable visual
baseline, not a layout requirement.

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
                              keyed priority queue
                                       │
                                       v
                              Rotation simulation worker
                              cached baselines -> variants
                                       │
                                       v
                              Central RotationMetrics store
                                       │
                         ┌─────────────┼─────────────┐
                         v             v             v
                       Main       DPS Breakdown   Rotation Editor

Active rotation snapshot ─> Disposable simulation worker ─> Simulation tab
```

The UI never needs a server request. Both workers receive structured-cloneable
bundles containing every value required for their calculation.

## Source layout

```text
data/
  skill/          castable and triggered skill maps
  dot/            damage-over-time definitions
  buff/           player effect definitions, including global always-on rules
  debuff/         target effect and encounter-state definitions
  innerway/       cumulative tier rules and triggers
  martial-art/    weapon talent arrays
  path.json       selectable combat paths, icons, shared eligibility tags, and optional weapon locks
  rotation/       bundled default rotations
  build/          bundled default build presets
  gear.json       gear slots, item bases, affix choices, and attunement source tags
  system.json     innate stats, progression rewards, and base-attribute conversions
  attunement.json attunement names, source tags, stat targets, and skill-match tags
  default-setup.json  first-load Inner Ways/food/Divinecraft and legacy build-setup fallback
  enemy.json      enemy profiles
  arsenal.json
  bow-ring-set.json
  gear-set.json   weapon-set definitions and tier effects
  armor-set.json  armor-set definitions and tier effects
  food.json       setup choices and their effects
  divinecraft.json  Divinecraft choices, availability, images, and effects
  stat.json

doc/
  damage-formula.md
  skill-data.md
  system-architecture.md

src/
  App.tsx                         UI, data composition, and current orchestration
  BuildTab.tsx                    equipped slots, inventory, and gear editor
  gear.ts                         persisted gear model and equipped effects
  readableRotation.ts             pure readable-sequence formatter
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
    simulationCalculator.ts      Monte Carlo run aggregation and percentiles
    simulationWorker.ts          isolated Monte Carlo worker entry point
    simulationWorkerClient.ts    per-run worker lifecycle and cancellation
    rotationMetrics.ts           central published result store

public/
  divinecraft/                   static selector images copied into the build
  paths/                         static combat-path icons copied into the build
```

## Application and UI state

`App.tsx` owns the shared character state:

- final-value character stat overrides
- final-value attunement overrides
- reusable character profiles containing those override maps and Main-tab setup
- two equipped weapons
- selected combat path and its optional weapon lock
- build list, shared gear inventory, and active build ID
- selected enemy
- globally resolved stats and derived stats
- the latest metrics published for the active rotation

It renders seven tabs:

1. Main
2. Build
3. DPS Breakdown
4. Rotation Editor
5. Simulation
6. Skill Editor
7. Settings

The Rotation Editor subtree remains mounted when another tab is selected and is
hidden with CSS. This preserves its local state and lets its worker calculation
continue. Main and DPS Breakdown subscribe to `rotationMetrics.ts` with
`useSyncExternalStore`; they render the latest published immutable metrics rather
than calculating independently.

When Build or Rotation Editor is active, the page shell is constrained to the
visible viewport. The header, tabs, and footer remain visible while the build
manager and rotation table use the remaining height and scroll internally.
Other tabs retain normal document scrolling.

The currently viewed build and active build are separate concepts. Only the
active build contributes gear stats, attunement, weapon and armor sets, bow/ring set, and
arsenal to calculations. The same
viewed-versus-active distinction applies to rotations; an edited rotation
publishes metrics globally only when it is also active.

## Browser persistence

Character stat overrides use `localStorage`, so they persist across browser sessions.
Most editor and setup state uses `sessionStorage`, so it lasts for the current
tab session.

| State                                           | Storage                                            |
| ----------------------------------------------- | -------------------------------------------------- |
| Character stat overrides                        | `localStorage`, `wwm-stat-overrides-v1`            |
| Custom character profiles                       | `localStorage`, `wwm-character-profiles-v1`        |
| Build list, shared gear, and per-build loadouts | `localStorage`, `wwm-build-list-v1`                |
| Active build ID                                 | `localStorage`, `wwm-active-build-v1`              |
| Skill editor overrides                          | `sessionStorage`, `wwm-skill-editor-session-v1`    |
| Combat path                                     | `sessionStorage`, `wwm-path-session-v1`            |
| Attunement overrides                            | `sessionStorage`, `wwm-attunement-overrides-v1`    |
| Weapons and enemy                               | `sessionStorage`, `wwm-settings-session-v1`        |
| Build setup overrides                           | `sessionStorage`, `wwm-build-setup-overrides-v1`   |
| Food                                            | `sessionStorage`, `wwm-food-session-v1`            |
| Divinecraft                                     | `sessionStorage`, `wwm-divinecraft-session-v1`     |
| Target debuff controls                          | `sessionStorage`, `wwm-global-debuffs-session-v1`  |
| Rotation list                                   | `sessionStorage`, `wwm-rotation-list-session-v1`   |
| Active rotation ID                              | `sessionStorage`, `wwm-active-rotation-session-v1` |
| Custom simulation percentiles                   | `sessionStorage`, `wwm-simulation-percentiles-v1`  |

Loaders validate enough shape to fall back to defaults and include migrations
for older percentage, penetration, attunement, rotation, per-build inventory,
single-inventory gear, and session-wide build setup formats. Non-zero values from the former raw character and attunement
storage keys migrate to overrides, preserving existing manual inputs. Calculated
metrics and timelines are not persisted. Bundled default builds and rotations
are reconstructed from repository data and omitted from browser persistence;
formerly edited default rotations migrate to custom copies.
Standalone Inner Way, legacy gear-set, bow/ring, and arsenal session selections migrate
only when the unified build-setup override has never been saved. Once that
override exists—even as an empty object—the active build supplies every
non-overridden setup default and legacy session keys are ignored.

Build export produces a versioned JSON snapshot of shared gear and custom build
loadouts, including each build's Inner Ways, weapon and armor sets, bow/ring set, and arsenal.
Import validates that snapshot and appends it to the current state,
remapping colliding gear and build IDs without replacing existing data or
duplicating bundled default presets.
The official-dashboard import is a separate boundary adapter: a user-installed
bookmarklet copies role gear JSON from the authenticated official origin, then
`officialGearImport.ts` maps official slots and stat IDs into a normal build
snapshot. That snapshot enters the same validator and collision-safe merge path
as a file import. The large official ID table is loaded only when the user
submits the modal, keeping it out of the initial application chunk.

Rotation export similarly produces a versioned JSON snapshot of custom rotation
records. Rotation import validates skill and event step shapes, appends custom
rotations with collision-safe IDs, preserves the active rotation, and skips
bundled default rotations. Older rotations with absolute manual-event timestamps
are migrated to fight-relative timestamps using their stored start anchor.
Legacy fixed-time Move and Exhausted events are then attached to the nearest
skill start, direct action, or directly declared triggered-skill action and moved
immediately before that target skill. Legacy Exhausted `before` attachments are
migrated to post-action `after` attachments.

Character Profile export produces a versioned JSON snapshot containing only
custom profiles. Each profile contains character and attunement override maps,
Inner Ways, and final weapon-set/armor-set/bow-ring/arsenal selections. Food, Divinecraft,
global buff/debuff controls, and future Script controls remain independent
session state and are not stored in character profiles.
The implicit `Calculated` profile is reconstructed in the UI and is never
persisted or exported. Import validates stat keys and setup shapes, discards
unknown or non-finite override values, appends valid profiles, and remaps
colliding IDs without changing the currently applied profile.

`data/default-setup.json` supplies first-load Inner Ways, food, and Divinecraft
plus fallback build setup values for older build records. Bundled builds define Inner Ways and setup choices
in their own path-grouped `data/build/**/*.json` records.

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
Ways, martial-art talents, arsenal, bow/ring set, weapon and armor sets, food, and
Divinecraft.

`data/system.json` keeps innate `baseStats`, level-derived `levelBonusStats`,
ordered `enhancementStats`, ordered `talentStats`, regional
Oddity groups such as `qingheOddityStats`, `kaifengOddityStats`, and
`imperialPalaceOddityStats`, `hexiOddityStats`,
and `hiddenMountainOddityStats` separate. Its `baseAttributes` field stores a
nested source-attribute to target-stat multiplier map. The shared
`baseAttributeEffects.ts` adapter converts that map to ordinary formula effects. Talent and
Oddity rewards remain individual
effects so their source progression is auditable even when several rewards
grant the same stat. Attribute conversions are regular formula effects in the
shared pipeline, so Power, Agility, Momentum, Body, and Defense gained from any
source use the same conversion rules.

Editing a Main-tab field creates a final-value override. The field is marked as
modified and gains an individual reset control. Gear-set, bow/ring, and arsenal
changes similarly override the active build's selections. Inner Way selections
use the same build baseline and resettable override behavior. Reset clears all
character, attunement, and build-setup overrides. `calculateStatsWithOverrides()` repeatedly runs the
shared pipeline and solves the simulation base offset required to produce every
overridden final value. This means later baseline input changes cannot move an
override, while overridden source stats still feed formula-derived stats.

The solved simulation base—not an overlaid display object—is sent to the worker.
The active baseline effects reconstruct the overridden value there, while setup,
priority, and other comparison variants apply their changed effects to the same
base. Modified stats therefore remain responsive in delta calculations.

The compact Character Profile selector treats `Calculated` as an immutable
reset profile. Loading it clears character, attunement, and build-setup
overrides, thereby restoring the active build's setup. It does not change Food,
Divinecraft, global buff/debuff controls, or future Script controls. A custom profile stores
the user's current final-value character and attunement overrides plus the final
weapon-set, armor-set, bow/ring, arsenal, and Inner Way selections. Loading
one replaces that complete state. Profiles can be created, renamed, duplicated,
deleted, exported, and imported through the management dialog. While a custom
profile is selected, every subsequent profile-owned Main-tab change is written directly back
to that profile. Changes to independent session controls do not affect profile
matching. Changes made while `Calculated` is selected instead move the
selector to `Unsaved changes`; the restored Reset button loads `Calculated`
again without opening the selector.

Gear attunements are the calculated attunement baseline and remain keyed by
definition ID. Damage resolution maps weapon definitions to penetration and
maps tag-matching armor definitions to the standalone `attunementDMGBonus`
multiplier. Every Armor-tagged definition shares the `attunement.armor` maximum
roll from the active level in `data/stat.json`; weapon attunements retain definition-ID
priority values. Armor definitions also carry the owning martial-art tag from
`data/martial-art/*.json`. The UI requires both the current path tag (when one
exists) and at least one selected martial-art tag; Mixed skips only the path
check. Shared Weapon-tagged penetration fields remain available for every
weapon. Hidden values and overrides remain intact in the calculation, and
attunement priority variants use the same visible-field filter.
An attunement override replaces its final displayed baseline value, but priority
variants still add their tested amount to that value.

Gear-set definitions carry both path and martial-art eligibility `tags`. Main,
Build, and setup-effect resolution require every selected martial-art tag plus
the current non-Mixed path tag. Hidden stored tiers are retained so switching
back restores the prior selection.

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

Base skill casts and Delay events are initially placed sequentially. A Delay
consumes its configured duration without producing actions or effects, shifts
all later sequential rows, and counts toward rotation duration when it is the
last step. Move rows run before a
following skill's cast start, direct action, or triggered-skill action. Exhausted
rows run after their attached direct or triggered action. Both are rescheduled
with that target. Timed manual-event `startTime`
values are offsets from the selected fight-start anchor and consume no cast time.
The builder resolves cast-time modifiers and the fight-start anchor in a bounded
convergence pass, then processes manual events at their final absolute times.
This prevents an already-processed event from being retroactively moved across
a skill when pre-start cast timing changes.
The event queue is sorted by timestamp and then by a lexicographic causal order.
Fixed-time and Move events have priority over skills, triggers, and DOTs at the
same timestamp, while Exhausted attachments sort immediately after their target
action. Within
each row, cast start still precedes its zero-time actions. This lets casts,
actions, triggers, and DOTs interleave while preserving causal order.
Timestamps within `0.0001s` are treated as equal so rounded rotation data and floating-point arithmetic
cannot place a displayed equal-time skill ahead of its event.

The timeline owns mutable simulation state while it is being built:

- active player buffs
- active target debuffs
- current target distance, initially 1m
- current HP ratio, initially 1 (100%)
- stacks, maximum stacks, and expirations
- per-definition duration refresh behavior for stacked effects
- skill, action, and effect cooldowns
- action-time state snapshots

Main-tab global-effect controls seed permanent tracked target debuffs into this
initial state at their configured stack count. They therefore use ordinary
effect-definition and requirement resolution, appear in timeline state, and
share the same unique tracked entry with any matching application from the
rotation. Reapplication cannot expire or duplicate a permanent seeded effect.
Always-active rules from `data/buff/global.json` instead enter through setup
effects. They are evaluated at each damage action without creating a visible or
expiring tracked buff.

At cast start, modifiers are selected, stack-scaled modifier values are resolved
from that pre-action state, and cast/action times are adjusted. Resolved
cast-wide effects remain fixed even if an action in the cast later consumes the
source stacks. A segmented timing modifier resolves `actionTime` separately for
the original cast time and each original action time, allowing data-defined
timing bands without skill-specific code. Casts record their start distance, and each action records its
own distance snapshot. At each action, expired effects are pruned, requirements
are checked, and the state
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
bonus categories. Common global HP bonuses multiply every damage component,
while channel-specific global bonuses such as Qi Imbalance's Bellstrike bonus
are applied only to that returned component.

`calculateSimulatedDamageBreakdown()` uses the same internal formula with its
attack-roll mode set to `simulate`. It selects one outcome and samples the
normal/critical attack ranges instead of rate-weighting expected variants.

## Calculation bundle and worker

The Rotation Editor currently composes a `RotationSimulationBundle`. It contains:

- the baseline `TimelineBuildInput`
- start anchor
- character stats, derived stats, attunement, enemy, and weapons
- one-stat-line variants
- attunement variants
- Inner Way removal variants
- arsenal, bow/ring, food, Divinecraft, weapon-set, and armor-set comparisons
- target-debuff comparisons
- equipped gear stats and attunements

Baseline bundles omit every comparison variant. Comparison bundles contain the
same baseline inputs plus all variants, but the worker consumes an already
cached baseline instead of rebuilding its timeline or recalculating its DPS.
The main thread does not run the rotation simulation.

`rotationWorkerClient.ts` owns one persistent module worker. Its queue policy is:

1. If idle, dispatch immediately.
2. If a job is running, retain pending requests in priority order.
3. A newer pending request with the same key replaces the stale request.
4. Active baseline work has highest refresh priority, followed by active
   comparisons and then inactive baselines.
5. Equal-priority work remains first-in, first-out.

The running calculation is not cancelled. Keyed replacement coalesces rapid
edits without discarding queued calculations for other rotations.

`rotationWorker.ts` has no React or browser-storage dependency. It owns a
bounded in-memory baseline cache keyed by rotation ID, calculation context, and
rotation content. A comparison job reads that exact entry and posts only the
completed metrics.

The Simulation tab receives an immutable baseline-only snapshot for the active
rotation. Starting a simulation creates a separate `simulationWorker.ts`
instance. That worker builds the combat timeline once, repeatedly samples its
damage entries, reports progress, sorts completed runs by DPS, and returns the
best, P99, P95, P90, P75, and median runs. Cancel terminates that disposable worker;
it cannot disturb the persistent deterministic worker or its queue. Simulation
results are UI-local and are not published as `RotationMetrics` or persisted.
Like the Rotation Editor, the Simulation subtree remains mounted while another
tab is visible, so an in-progress worker and its completed result survive tab
switches. Each result retains the calculation-context and rotation key used to
start it. A later stat, build, setup, or active-rotation change marks that result
outdated without clearing it; the next completed simulation replaces it.
The result heading displays the rotation and build names captured when that run
started, so outdated results remain identifiable.
Users can add custom percentiles in `[0, 100)`, including decimal values, except
for the locked preset rows P99, P95, P90, P75, and P50/Median. The completed
worker result retains its DPS-sorted runs, so adding or removing a display row
updates the current result immediately without making it outdated. Custom row
choices persist for the browser session.

## Baseline and variant calculation

`calculateRotationBaseline()` performs work in this order:

1. Build the baseline timeline once.
2. Resolve the selected start anchor and duration through Battle End, or through
   the final action when no Battle End event exists.
3. Create baseline damage entries and one detailed breakdown per damage action
   at or after the anchor and no later than Battle End; keep excluded actions in
   the timeline display.
4. Calculate baseline total damage and DPS once.
5. Produce per-skill, per-cast, skill-category, and physical/attribute breakdowns.

Per-cast breakdown rows group repeated casts by skill. Damage from triggered
skills and owned DOT ticks is attributed to the explicit cast identified by
`sourceRowId`, then summed into its skill group. Inner Way-triggered skills carry
`triggerSource: "innerWay"` and receive their own grouped row instead; Morale
Chant is the current example. Each timed cast contributes damage divided by its
effective cast time. When the next explicit skill is Deflect, its effective cast
time is added to the preceding cast's time sample. Deflect and every other skill
with no attributed damage are omitted from this breakdown. The row shows the
arithmetic mean of the remaining cast DPS values plus average cast time.
Zero-time-only damaging groups leave DPS undefined. Rows sort by average DPS
descending.

Tracked effects retain the cast row that applied them. A buff definition with
`damageAttribution: "sourceCast"` requests a counterfactual calculation for
every affected hit with that buff removed. The difference is attributed to the
source cast without changing rotation total damage or the damaged skill's own
breakdown. Flute uses this metadata. Its per-cast Damage and Average DPS cells
show direct values followed by parenthesized values that include this attributed
buff damage; sorting uses the inclusive DPS.

`calculateRotationComparisons()` then evaluates priority and setup variants
against the cached timeline, damage entries, duration, total damage, and
breakdown. `calculateRotationSimulation()` remains as a combined entry point for
focused probes and callers that need both phases at once.

Pure stat and attunement variants reuse the baseline timeline and its effect
snapshots. Inner Way removal variants rebuild the timeline because triggers,
cooldowns, durations, stacks, and cast times may change. Setup candidates reuse
the baseline timeline when they only change stats; a behavior-changing candidate
must provide a replacement timeline. Cleftpeak 4-piece currently does so. Every
replacement timeline resolves its own start anchor and duration for DPS; only
timeline-reusing variants share the baseline duration.

Each priority row stores absolute DPS difference and percentage change. Character
and attunement priorities sort by descending DPS gain. Inner Ways are removed,
so their rows sort by the most negative DPS change first.
Character and attunement priority variants are generated only for fields visible
under the current weapon/path selection. In particular, Art of Heng/Mo follows
the selected weapon families and non-Mixed attunement priority keeps the two
shared Weapon entries plus matching path-tagged armor entries.

## Result publication

Each public baseline result contains:

- `RotationMetrics`
- baseline timeline
- anchor time and duration
- per-action `DamageBreakdown` map

The Rotation Editor uses the timeline and action map for its table and tooltips.
Base skills have collapsible action groups. Triggered skills and DOTs do not add
skill rows; their damage actions inherit the originating base skill's expansion
state and contribute to its displayed damage total. A DOT application records
that source cast, and a later refresh or extension transfers all subsequent ticks
to the cast that performed it. Nested DOTs inherit the original base cast.
A displayed damage action without a breakdown was before the start anchor and
has an empty damage cell.
The editor keeps one public baseline result per rotation, keyed by the complete
character/build calculation context and rotation record. Switching viewed or
active rotations reuses a valid cached result immediately. These results are
in-memory calculation caches and are intentionally not written to browser
storage.

Only the active rotation publishes to the central module store, and baseline
work never publishes an incomplete metrics object. Main and DPS Breakdown keep
the previous complete baseline-plus-comparisons result throughout a refresh,
then atomically swap to the replacement after its comparison pass completes. An
active-rotation Save and Make Active request comparisons; saving an inactive
rotation does not. The same central store publishes a recalculation status for
active comparison requests. The Main DPS block keeps displaying the last
complete value and shows `Recalculating` beneath it until the matching current
result is published; superseded requests cannot clear the status of newer work.

## Static data composition

Rotation and build presets are loaded eagerly from their data directories; the
remaining JSON is imported explicitly, so Vite includes it all in the generated
static assets. Rotation presets, build presets, and custom builds declare
`martialArts`; selectors show only records matching the current pair. Legacy
custom builds with `weapons` are migrated at the persistence/import boundary.
Presets with `test: true` remain bundled but are hidden until the persisted
header-level Dev toggle is enabled. The application currently recognizes:

- Snowparting, Phalanxbane, Mystic, General, Buff, Debuff, and DOT editor categories
- six martial-art IDs across Heng Blade, Mo Blade, Umbrella, Rope Dart, and Gauntlet weapon families
- six Inner Ways
- eight Divinecraft definitions, including a no-effect choice and two unavailable choices
- Exhausted, Controlled, Shield Broken, Battle End, Move, HP, Buff, and Debuff manual events
- bundled Stonesplit Strength default rotations discovered from
  `data/rotation/**/*.json`
- eight gear slots, relayed status, one required base affix, up to four optional
  additional affixes, and an optional attunement
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
tier IDs from T0 through T6. Add path eligibility strings to its top-level
`tags` array. Selection automatically activates all tiers through the selected
tier, and a tagged path exposes and calculates only Inner Ways carrying its tag.

### Enemy

Add a complete `EnemyProfile` entry to `data/enemy.json`. The settings UI reads
the imported map.

### Gear definition

Add or update the slot definition, fixed base stats, allowed affixes, and
attunements in `data/gear.json`. See `gear-data.md` for the persisted item shape,
percentage conversion, and weapon-slot mapping.

### Weapon and armor sets

Add weapon-set definitions to `data/gear-set.json` and armor-set definitions to
`data/armor-set.json`, with a display `name`, path and martial-art eligibility
`tags`, and tier `options`. Main, Build, and the setup-effect pipeline share the
same definition-driven filter and four-piece selection limit within each set
family. An option may expose a string `condition`; the timeline adds selected
setup conditions to the same requirement context used by Inner Ways.

### Character system stats

Update `data/system.json`. Keep innate values under `baseStats`, level-derived
values under `levelBonusStats`, every Enhancement bonus under its own ordered
`enhancementStats` entry, every talent grant as its own ordered
`talentStats` entry, and every regional Oddity reward
under its own ordered collection such as `qingheOddityStats` or
`kaifengOddityStats`. Express base-attribute relationships under
`baseAttributes` by nesting each target stat and its multiplier under the
source base attribute, for example `"power": { "minPhys": 0.22 }`.

### Weapon or primary path

Add the path metadata to `data/path.json`. A path can declare a shared `tag`
and a fixed `[left, right]` `lockedWeapons` pair; paths without a weapon lock
allow either martial art in either slot. New weapons still require changes to
`WeaponId`, settings validation, martial-art imports, attunement matching, and
`mainAttribute()` in `damage.ts`. Each martial-art JSON definition declares its
physical weapon family and a shared `tag`; Art-of field visibility is derived
from the weapon family, while attunement and set eligibility use the tag.
Paths may also declare `wip: true`; they remain visible with a WIP badge but are
disabled until the header-level Dev toggle is enabled. This runtime gate behaves
the same in local and deployed builds.
Might, Dust, and Kite are currently WIP shells. Their weapons and shared gear
tables are registered, but their skills, talents, and complete path-specific
calculations are not implemented.

### Manual event

Add the event to the `RotationStep` union, `rotationEventDefinitions`, editor
options, transfer validation, and any special duration UI. `Exhausted`,
`Controlled`, `ShieldBroken`, and `BattleEnd` use fight-relative timestamps.
Shield Broken consumes the shared player Shield and can use ordinary action
requirements for follow-up effects. Battle End has no actions; the calculator
treats its ordered timestamp as the damage and duration cutoff. Delay instead participates in sequential cast timing and has an editable
duration but no action. General event definitions are currently hard-coded rather than loaded
from data.

## Known architectural limitations

- `App.tsx` is still a large composition and UI module. The calculation engine
  is pure and worker-safe, but bundle construction remains inside
  `RotationEditorTab` rather than a top-level application service.
- Skill Editor skill, buff, debuff, and DOT overrides are saved and displayed
  for the session. Buff/debuff effect arrays and cumulative stack tiers use the
  same structured rule controls as skill actions and modifiers, including
  requirements and object-valued effects. The rotation simulator currently
  builds its combat maps from defaults, so overrides do not affect DPS yet.
- Manual event definitions and supported weapons are hard-coded.
- The primary attribute resolver only knows the current Stonesplit weapons.
- DMG Bonus Category 2 is specified but not implemented.
- There is no automated test suite yet; `npm run build` is the current type and
  production-bundle verification step.

### Rotation editor calculation lifecycle

Editing any rotation calculates and caches only that rotation's baseline
timeline, expected damage, DPS, and action breakdowns. Saving requests
comparisons only when the edited rotation is active. Making an inactive rotation
active reuses its valid baseline cache and requests comparisons.

When character stats, attunements, Inner Ways, food, Divinecraft, build, enemy,
or settings change, the refresh order is: active baseline, active comparisons,
then every inactive baseline. A context key prevents an older result from being
treated as current or published after a newer refresh begins. The Rotation
Editor keeps the last completed timeline for each rotation mounted during its
replacement calculation so scroll position and focused controls survive the
refresh. The central DPS result similarly retains its previous diff rows until
the replacement comparison result is ready, then swaps the complete result at
once. Its recalculation status changes independently of the retained metrics so
the UI can identify that displayed DPS as temporarily stale.

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
