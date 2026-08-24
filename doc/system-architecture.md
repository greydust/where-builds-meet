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

PC and mobile are explicit presentation modes over the same React state and
calculation components. PC retains the established wide grids and viewport-bound
Build and Rotation workspaces. Mobile uses normal document scrolling, compact
single-column panels, horizontal item choosers, and card-style rotation rows.
The production mode follows a `48em` viewport query. Settings always shows the
currently resolved PC/Mobile layout below Enemy. The selector remains disabled
and dimmed until Dev mode is enabled, at which point it overrides the viewport
query for the current session without changing calculation or stored game data.

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
  script.json      Script choices, images, threshold requirements, and effects
  stat.json

doc/
  damage-formula.md
  localization.md
  skill-data.md
  system-architecture.md

src/
  App.tsx                         UI, data composition, and current orchestration
  BuildTab.tsx                    equipped slots, inventory, and gear editor
  i18n.ts                         locale resolution, message loading, and UI translation
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
  locales/                       generated per-locale runtime message JSON
  paths/                         static combat-path icons copied into the build
```

## Localization boundary

`locales/translations.csv` is the canonical translation source. The extraction
script discovers UI message keys plus translatable JSON and stat labels, then
generates the locale manifest and one JSON file per locale under
`public/locales/`. At startup the application loads the saved user locale,
falls back to the browser locale when none was saved, and finally falls back to
English. Only an explicit user selection is persisted.

Localization remains on the main-thread presentation boundary. Workers,
calculation bundles, cache identities, stored builds, stored rotations, and
game-data IDs never contain localized values. See `localization.md` for the
catalog workflow and validation rules.

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

In PC mode, Build or Rotation Editor constrains the page shell to the visible
viewport. The header, tabs, and footer remain visible while the build manager
and rotation table use the remaining height and scroll internally. Mobile mode
and the other tabs retain normal document scrolling.

The currently viewed build and active build are separate concepts. Only the
active build contributes gear stats, attunement, weapon and armor sets, bow/ring set, and
arsenal to calculations. The same
viewed-versus-active distinction applies to rotations; an edited rotation
publishes metrics globally only when it is also active.

Rotation editing uses a separate baseline-preview schedule. Input changes render
immediately while a short debounce coalesces rapid edits before constructing and
fingerprinting the worker bundle. A matching main-thread baseline cache entry is
published without recalculation; a cache miss is queued as low-priority worker
work. Results enter the cache when completed, but only the latest requested
fingerprint may replace the editor preview. The previous completed preview stays
visible while newer work runs. Editor previews never request comparison variants;
active-rotation comparisons remain tied to save, activation, or setup changes.

Rotations may optionally store a target maximum HP. The centralized baseline
calculation then walks damage actions in timeline order, subtracts each resolved
damage result, and publishes target-HP snapshots with the worker timeline. Rows
and actions without damage inherit the most recent target-HP ratio instead of
falling back to the timeline's initial 100% state. Self
HP, target HP, and target Qi are distinct timeline states. Qi reaching zero
applies Exhausted; the debuff's data-defined `"expire"` action restores Qi when
the current application expires, so duration refreshes remain authoritative.
Attached manual events can target either a skill action or a fixed-time Take
Damage action. The editor keeps the attached event immediately before its
anchor in stored rotation order, while timeline sort order determines whether
its effect resolves before or after the selected action at the shared timestamp.

Current martial art and physical weapon are timeline state as well. They start
from the left equipped martial art, change automatically at the start of each
castable `MartialArts` skill from that skill's data fields, and remain unchanged
through General, Mystic, and triggered skills. A start-only Martial Art event
can switch them explicitly before a cast. Ordinary requirements can inspect
both values, and rows and actions snapshot them so a Mystic follow-up such as
Ghostly Step - Umbra Dodge can dispatch weapon-specific damage definitions.

## Browser persistence

Character stat overrides use `localStorage`, so they persist across browser sessions.
Most editor and setup state uses `sessionStorage`, so it lasts for the current
tab session.

| State                                           | Storage                                            |
| ----------------------------------------------- | -------------------------------------------------- |
| Character stat overrides                        | `localStorage`, `wwm-stat-overrides-v1`            |
| Explicitly selected locale                      | `localStorage`, `wwm-locale`                       |
| Custom character profiles                       | `localStorage`, `wwm-character-profiles-v1`        |
| Build list, shared gear, and per-build loadouts | `localStorage`, `wwm-build-list-v1`                |
| Active build ID                                 | `localStorage`, `wwm-active-build-v1`              |
| Skill editor overrides                          | `sessionStorage`, `wwm-skill-editor-session-v1`    |
| Combat path                                     | `sessionStorage`, `wwm-path-session-v1`            |
| Dev layout preview                              | `sessionStorage`, `wwm-layout-preview-session-v1`  |
| Attunement overrides                            | `sessionStorage`, `wwm-attunement-overrides-v1`    |
| Weapons and enemy                               | `sessionStorage`, `wwm-settings-session-v1`        |
| Build setup overrides                           | `sessionStorage`, `wwm-build-setup-overrides-v1`   |
| Food                                            | `sessionStorage`, `wwm-food-session-v1`            |
| Divinecraft                                     | `sessionStorage`, `wwm-divinecraft-session-v1`     |
| Script                                          | `sessionStorage`, `wwm-script-session-v1`          |
| Global buff/debuff controls                     | `sessionStorage`, `wwm-global-debuffs-session-v1`  |
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
global buff/debuff controls, and Script controls remain independent
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
  -> character stat caps
  -> initial effective stats
  -> derived-source formula effects
  -> character stat caps
  -> effectiveStat effects
  -> final stats + final derived stats
```

Equipped gear contributes one data-derived `stat` effect to this same pipeline.
Direct Critical Rate is capped at `0.2` (20%) in this shared pipeline and again
when effective per-action values are resolved, so displayed stats, overrides,
setup effects, and damage calculations cannot bypass the cap.
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
The hidden base stat `heavensWillRegen` is also resolved through this pipeline.
It is passed into the timeline as the per-second regeneration rate for the
numeric `HeavensWill` resource rather than exposed as an editable combat stat.
The resource's universal initial value of two and maximum of four are stored in
`system.json` and passed through `TimelineBuildInput.initialResources` and
`TimelineBuildInput.resourceMaximums`. Passive regeneration starts at the
resolved fight-start anchor, so prepull time does not generate Heaven's Will;
passive regeneration and explicit resource actions share the same cap.
Innate Max HP is stored directly in `baseStats`; its `101929` value excludes the
`25980` HP from four Tier 96 Purple armor pieces that was present in the observed
`127909` value. Armor base HP remains a separate equipped-gear contribution,
while talent, Oddity, Body, and Defense HP retain their individual sources.

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
Divinecraft, global buff/debuff controls, or Script controls. A custom profile stores
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
Alongside buffs, debuffs, distance, and current HP, it tracks a map of named
numeric resources. Resource actions update that map in event order, and each
action snapshot carries the resource values used by action and setup-effect
requirements. Optional resource-regeneration rates accrue from elapsed timeline
time before each ordered event is processed.
Actions may wrap their requirement operands with `resolveAt: "skillStart"`.
The timeline evaluates and stores that boolean when the owning skill component
begins, then uses the stored result when the action executes. This keeps delayed
resource consumption and similar mechanics bound to their release-start state.
It produces four row kinds:

- `rotation`: an explicit skill or manual event
- `trigger`: a skill inserted by a trigger action
- `dot`: generated DOT actions
- `periodic`: generated non-DOT buff or debuff actions

Base skill casts and Delay events are initially placed sequentially. A Delay
consumes its configured duration without producing actions or effects, shifts
all later sequential rows, and counts toward rotation duration when it is the
last step. Move rows run before a
following skill's cast start, direct action, or triggered-skill action. Exhausted
rows run after their attached direct or triggered action. Both are rescheduled
with that target. Take Damage and other timed manual-event `startTime`
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
actions, triggers, DOTs, and other periodic effects interleave while preserving
causal order.
Timestamps within `0.0001s` are treated as equal so rounded rotation data and floating-point arithmetic
cannot place a displayed equal-time skill ahead of its event.

The timeline owns mutable simulation state while it is being built:

- active player buffs
- active target debuffs
- current target distance, initially 1m
- absolute self HP initialized from calculated Max HP, plus its derived ratio
- stacks, maximum stacks, and expirations
- per-definition duration refresh behavior for stacked effects
- skill, action, and effect cooldowns
- action-time state snapshots

Main-tab global-effect controls seed permanent tracked player buffs or target
debuffs into this initial state at their configured stack count. They therefore
use ordinary effect-definition and requirement resolution, appear in timeline
state, and share the same unique tracked entry with any matching application
from the rotation. Floating Grace selects either its base Mixed definition or
its stronger Deluge definition through `initialBuffs`. Reapplication cannot
expire or duplicate a permanent seeded effect.
Effect definitions with `global: true` instead enter through setup effects.
They are evaluated at each damage action without creating a visible or expiring
tracked buff and are omitted from manual Buff choices.

At cast start, modifiers are selected, stack-scaled modifier values are resolved
from that pre-action state, and cast/action times are adjusted. Resolved
cast-wide effects remain fixed even if an action in the cast later consumes the
source stacks. A segmented timing modifier resolves `actionTime` separately for
the original cast time and each original action time, allowing data-defined
timing bands without skill-specific code. Casts record their start distance, and each action records its
own distance snapshot. At each action, expired effects are pruned, requirements
are checked, and the state
snapshot is recorded before the action mutates state. Damage-triggered setup and
Inner Way rules then run, followed by the action's trigger, periodic-effect
application, consume, extend, or cooldown behavior. Tracked effects with a
top-level `action` array enqueue those actions after each accepted application
or reapplication. Rejected applications, including effect-cooldown and
`reapply: false` cases, do not enqueue effect actions. Tracked effects with a
`periodic` definition schedule their nested actions in the same global queue.
Refreshing can either preserve or restart the cadence according to
`resetOnRefresh`; consuming the final stack cancels pending periodic rows. DOTs
use this shared scheduler and differ only in row classification, damage rules,
and source-cast presentation.

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

After an ordinary hit resolves, the centralized damage sequence emits a typed,
synchronous damage event containing its final damage, action-specific tags, and
the immutable combat-state snapshot for that action. Active Inner Way listeners
are data-defined and evaluated against this event. A successful listener may
spawn a parameterized `Replayed` skill; its delayed actions retain a link to the
source entry rather than copying a deterministic value into the timeline.

The average calculator and simulator resolve that link after calculating the
source hit. Replay actions therefore follow randomized source damage during
Monte Carlo runs while bypassing normal multipliers and outcomes. Generated
replay rows participate in duration, target-HP progression, Battle End cutoff,
timeline display, and breakdown attribution. They do not emit damage events,
which makes the event graph acyclic.

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

Every full recalculation starts a new batch. Starting that batch terminates the
worker executing the previous batch and rejects all of its pending requests,
then schedules a fresh baseline followed by the new comparison categories.
This batch boundary takes precedence over keyed pending-request replacement and
also clears the worker's baseline cache, so comparisons cannot use a baseline
from a superseded state. The main thread can explicitly reseed a cached baseline
into the replacement worker before its first missing variant. Keyed replacement
still coalesces requests scheduled within the same batch.

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
tab is visible, so an in-progress worker and its completed-result history
survive tab switches. New results are prepended and individual records can be
deleted without affecting the worker or other records. Each result retains the
calculation-context and rotation key, rotation and build names, run count, and
duration captured when that run started. Records matching the current
fingerprint are marked Current; other records remain visible and are marked
Outdated.
Users can add custom percentiles in `[0, 100)`, including decimal values, except
for the locked preset rows P99, P95, P90, P75, and P50/Median. The completed
worker result retains its DPS-sorted runs, so adding or removing a display row
updates every retained result immediately without changing fingerprint status.
Custom row choices persist for the browser session; simulation history itself
remains component memory and is not stored.

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
arithmetic mean of the remaining cast DPS values, average damage per cast,
summed total damage, and average cast time. The two damage values sit beneath a
shared Damage header. Attributed buff-inclusive values are calculated for both
the per-cast average and total.
Zero-time-only damaging groups leave DPS undefined. Rows sort by average DPS
descending.

Tracked effects retain the cast row that applied them. A skill with
`collectBoostDamage` passes that target effect ID and its cast row into buffs it
applies. When the named effect becomes active directly or through a later buff
application, each affected hit is recalculated with that effect removed. Only
the difference is attributed to the source cast; rotation total damage and the
damaged skill's own breakdown do not change. Flute names `Flute`, while Ghostly
Step names `MysteryDMGBoost`; the intermediate `Mystery` or `MysteryUmbra` buff
carries Ghostly Step's source until Perfect Dodge applies the named damage buff.
Both skills therefore use the same tracked-effect and counterfactual path.
Their per-cast Damage and Average DPS cells show direct values followed by
parenthesized values that include the attributed buff damage; sorting uses the
inclusive DPS.

`calculateRotationComparisons()` then evaluates priority and setup variants
against the cached timeline, damage entries, duration, total damage, and
breakdown. `calculateRotationSimulation()` remains as a combined entry point for
focused probes and callers that need both phases at once.

Deterministic damage is resolved exactly once per baseline or variant. A
rotation that tracks target HP or has damage-event listeners uses one ordered
pass to update target state, dispatch listeners, enqueue replay actions, and
retain each action's resolved breakdown for the final total. Replay actions are
inserted into the unprocessed portion of that ordered queue without repeatedly
sorting or shifting the full event list. A rotation with neither feature skips
the ordered damage pass and damage-event state snapshots entirely; its final
aggregation performs the single required damage resolution. Monte Carlo runs
still resolve the stored entries independently with that run's random samples.

Local Vite development builds wrap each deterministic worker request in a
calculation benchmark and emit a collapsed `[Damage benchmark]` console table.
The table separates top-level timeline construction, damage-pipeline, timing,
and metrics/breakdown costs. Its nested damage-event rows retain the complete
ordered traversal as a parent measurement and split out target-state
propagation, real damage resolution, listener cooldown and requirement checks,
replay construction, replay queue insertion, and post-hit target-HP updates.
The real-damage parent is further divided into per-hit stat resolution, effect
and attunement aggregation, outcome-rate conversion, damage-variant evaluation,
and final outcome weighting. Variant evaluation reports physical and attribute
channel math as nested children so repeated attribute-effect scans remain
visible without being double-counted in the formula remainder.
Stat resolution separately reports effect detection and shared stat-pipeline
execution. Effect aggregation reports damage-effect fields, resolved channel
snapshots, matching attunements, and shared multiplier construction.
Unconditional finite numeric fields from tracked buffs and debuffs are split
from their definitions and maintained as a timeline-state aggregate at effect
lifecycle transitions. Damage contexts carry the aggregate separately, while
conditional or dynamic rules remain in the regular effect list. This removes
stable tracked-effect field probes from each hit without tying the reusable
timeline to a particular character-stat baseline.
Derived remainder rows reconcile unclassified work without adding nested replay
measurements twice under their listener parent. Timeline queue ordering,
effect-trigger evaluation, and active-effect resolution retain their own call
counts. The collector is gated by `import.meta.env.DEV`; production workers
bypass collection and do not log benchmark output.

Pure stat and attunement variants reuse the baseline timeline and its effect
snapshots. Inner Way definitions also declare `altersTimeline`; every current
Inner Way sets it to true, so removal variants conservatively rebuild the
timeline because triggers, cooldowns, durations, stacks, and cast times may
change. Setup candidates reuse
the baseline timeline when they only change stats. Weapon and armor set
definitions declare `altersTimeline`; a set comparison provides a replacement
timeline when any timeline-changing set has a different tier between the
current and replacement selections. This checks both the incoming set and sets
removed to satisfy the four-piece limit. Cleftpeak and Formbend currently opt
in, while a Rain Whisper-only tier change reuses the baseline timeline. Every
replacement timeline resolves its own start anchor and duration for DPS; only
timeline-reusing variants share the baseline duration.

Setup comparison bundles omit the currently selected arsenal, bow/ring set,
food, Divinecraft, global-effect state, and Bitter Seasons tier. The Main tab
already renders those choices as active, so calculating an identical baseline
variant would only produce a redundant zero-difference result. Weapon and armor
set comparison generation likewise omits the currently selected tier.

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

The Rotation Editor rebuilds its draft timeline immediately with the shared
timeline builder whenever structural rotation content or the combat context
changes. This main-thread pass is memoized and does not calculate damage, DPS,
or comparison variants, so adding, removing, or moving a step updates the editor
without waiting for the worker debounce. The editor overlays calculated target-HP
snapshots from compatible worker rows onto this structural timeline; row identity
and structure still come from the immediate draft. The completed worker result supplies
the action map, metrics, and cached baseline for the table and tooltips.
Base skills have collapsible action groups. Triggered skills and DOTs do not add
skill rows; their damage actions inherit the originating base skill's expansion
state and contribute to its displayed damage total. A DOT application records
that source cast, and a later refresh or extension transfers all subsequent ticks
to the cast that performed it. Nested DOTs inherit the original base cast.
A multi-action skill likewise remains one base row. Its component actions are
flattened into that row, while each sequential component retains its own tags,
start-time modifier evaluation, and effective cast duration. Component damage
and triggers remain owned by the base row.
A displayed damage action without a breakdown was before the start anchor and
has an empty damage cell.
Every complete baseline input bundle, including stats, all setup selectors,
effective skill, buff, debuff, and DOT definitions, and rotation content,
receives a deterministic fingerprint. The editor keeps a
bounded in-memory baseline cache keyed by that fingerprint. Each comparison is
split into a single variant request and cached under the pair of the baseline
fingerprint and a fingerprint of that variant's category, group, and input.
Rotation combat content includes its full ordered steps, events, attachments,
timings, and start anchor; the display-only rotation name is excluded so a
rename does not invalidate damage results.
Baseline and variant results enter these caches immediately when their worker
request completes, including partial batches that are later superseded.
Switching viewed or active rotations reuses matching entries immediately. A
cached baseline can seed a fresh worker when some variants are still missing.
These caches are intentionally not written to browser storage.

Only the active rotation publishes to the central module store. Its baseline is
published as soon as it completes, replacing DPS, total damage, and breakdowns
while retaining the previous comparison rows. Comparison categories then run
sequentially and replace only their own rows. An active-rotation Save and Make
Active request comparisons; saving an inactive rotation does not. The central
store publishes independent progress for baseline, stat priority, attunement
priority, weapon sets, armor sets, bow/ring, arsenal, global buffs/debuffs,
Inner Ways, Script, Divinecraft, and food. Superseded requests cannot update or
clear the status owned by newer work.

## Static data composition

Rotation and build presets are loaded eagerly from their data directories; the
remaining JSON is imported explicitly, so Vite includes it all in the generated
static assets. Rotation presets, build presets, and custom builds declare
`martialArts`; selectors show only records matching the current pair. Legacy
custom builds with `weapons` are migrated at the persistence/import boundary.
Presets with `test: true` remain bundled but are hidden until the persisted
header-level Dev toggle is enabled. The application currently recognizes:

- Snowparting, Phalanxbane, Thundercry, Stormbreaker, Heavenwill, Mystic, General, Buff, Debuff, and DOT editor categories
- eight martial-art IDs across Heng Blade, Mo Blade, Umbrella, Rope Dart, Gauntlet, and Spear weapon families
- six Inner Ways
- eight available Divinecraft definitions, including a no-effect choice
- seven Script definitions plus a no-effect choice
- Exhausted, Controlled, Shield Broken, Battle End, Move, Self HP, Take Damage, target HP, Qi, Buff, and Debuff manual events
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
tier IDs from T0 through T6. Add the required top-level `altersTimeline`
boolean; current definitions conservatively use true, while a future false
value means its removal can reuse baseline event state. Add path eligibility strings to its top-level
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
`tags`, required boolean `altersTimeline`, and tier `options`. Set
`altersTimeline` to true when changing that set can affect timing, triggers,
conditions, stacks, cooldowns, DOTs, or any other event-state behavior. Main,
Build, and the setup-effect pipeline share the
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
the same in local and deployed builds. A path can instead declare `devOnly: true`
when its mechanics are supported but the path itself is intended only for
development and unrestricted test combinations. Dev-only paths remain visible,
carry a Dev badge, and use the same runtime gate without being described as WIP.
Mixed is the final selector option and is Dev-only. Kite is available without
Dev mode. Wind and Dust remain WIP shells; Wind has no weapon lock until its
martial arts are registered, while Dust retains its existing registered weapon
pair.

### Manual event

Add the event to the `RotationStep` union, `rotationEventDefinitions`, editor
options, transfer validation, and any special duration UI. `Exhausted`,
`Controlled`, `ShieldBroken`, `BattleEnd`, and `TakeDamage` use fight-relative timestamps.
Shield Broken consumes the shared player Shield and can use ordinary action
requirements for follow-up effects. Battle End has no actions; the calculator
treats its ordered timestamp as the damage and duration cutoff. Delay instead participates in sequential cast timing and has an editable
duration but no action. General event definitions are currently hard-coded rather than loaded
from data.

## Known architectural limitations

- `App.tsx` is still a large composition and UI module. The calculation engine
  is pure and worker-safe, but bundle construction remains inside
  `RotationEditorTab` rather than a top-level application service.
- Skill Editor skill, buff, debuff, and DOT overrides are saved for the session
  and composed over the default combat maps used by the calculator and
  simulator. Buff/debuff effect arrays and cumulative stack tiers use the same
  structured rule controls as skill actions and modifiers, including
  requirements and object-valued effects. Effective definitions participate in
  calculation fingerprints, so saving or resetting an override cannot reuse a
  stale baseline or comparison result.
- Manual event definitions and supported weapons are hard-coded.
- Primary-attribute damage resolution supports the registered Stonesplit and
  Bamboocut martial arts, but Void/Formless Attack folding currently remains
  Stonesplit-only.
- DMG Bonus Category 2 is specified but not implemented.
- There is no automated test suite yet; `npm run build` is the current type and
  production-bundle verification step.

### Rotation editor calculation lifecycle

Editing any rotation calculates and caches only that rotation's baseline
timeline, expected damage, DPS, and action breakdowns. Saving requests
comparisons only when the edited rotation is active. Making an inactive rotation
active reuses its valid baseline cache and requests comparisons.

When character stats, attunements, Inner Ways, food, Divinecraft, build, enemy,
or settings change, the refresh order is: active baseline; stat priority;
attunement priority; weapon sets; armor sets; bow/ring; arsenal; global
buffs/debuffs; Inner Ways; Script; Divinecraft; food; then every inactive
baseline. A context key prevents an older result from being treated as current
or published after a newer refresh begins. The Rotation Editor keeps the last
completed timeline for each rotation mounted during its replacement calculation
so scroll position and focused controls survive the refresh. Main retains each
category's previous rows until that category completes, then publishes the
replacement rows immediately. Each panel subscribes to its own category status,
whose reserved layout space prevents progress text from shifting the panel.

The refresh identity combines the resolved active rotation ID with the complete
baseline fingerprint. Scheduling records that identity immediately. A later
different identity always supersedes the running batch, even if it was
calculated earlier in the session; cached results are restored through the same
publication path instead of suppressing the schedule. Path filtering can
replace an incompatible active rotation while a request is running without
allowing a discarded transitional request to suppress its replacement.
Requests superseded by a newer full calculation do not schedule another retry;
the newer request is already their replacement. This distinction prevents
development effect replays and rapid context changes from forming a retry loop.

Completed full calculations publish directly when their request is still the
latest request for the resolved active rotation. Publication does not wait for a
second effect to reconcile the stored active and editing IDs during a path
transition. If the persistent worker fails while loading or processing a
request, the client discards it and retries the interrupted request once on a
fresh worker instead of leaving later work attached to a dead worker.

Each comparison category reports deterministic variant progress independently.
Before a category begins, all category indicators enter a pending zero-percent
state. Each worker comparison request calculates one variant. A variant is
complete only after its timeline entries and final damage total have both been
calculated and cached. Cache hits count as immediately completed work. The
displayed percentage is exactly `completed category variants / total category
variants`. The baseline is one
separate unit that moves from zero to complete when its metrics publish.
Categories with no variants complete immediately without a worker request.
Progress is stored separately from metrics; status components subscribe through
the external calculation-status store rather than causing the application tree
to rerender on every worker update.

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
