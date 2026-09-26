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
cross-platform Latin, Greek, Cyrillic, and Devanagari baseline. The active
locale selects the matching self-hosted Noto Sans TC Variable or Noto Sans KR
Variable stack for Traditional Chinese or Korean, while Latin still resolves
through Noto Sans Variable first. System sans fonts remain the loading,
accessibility-override, and unsupported-script fallback.

Layouts must remain usable when the web font is unavailable or overridden.
Text-bearing controls wrap instead of relying on English-label pixel widths,
flex and grid children use zero minimum sizes, longer content may grow row
height, and dense data tables keep one logical row while their cell contents
wrap within flexible columns. Buff and debuff cells may grow vertically when
their effect lists need additional lines. Fixed square dimensions are reserved
for icons and other non-text controls. UI icons are SVG components so their
geometry does not depend on the active font. Noto Sans is therefore a repeatable
visual baseline, not a layout requirement.

PC and mobile are explicit presentation modes over the same React state and
calculation components. PC retains the established wide grids and viewport-bound
Build and Rotation workspaces. Mobile uses normal document scrolling, compact
single-column panels, and horizontal item choosers. Rotation rows remain a
single CSS grid row in both modes; their flexible columns wrap long cell content
instead of switching the whole row to a card layout.
The production mode follows a `48em` viewport query. Settings always shows the
currently resolved PC/Mobile layout below the weapon selectors. The selector remains disabled
and dimmed until Dev mode is enabled, at which point it overrides the viewport
query until the user changes it again, without changing calculation or stored game data.

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
  path.json       combat-path status, preset build group, eligibility tags, and optional weapon locks
  rotation/       bundled default rotations
  build/          bundled default build presets
  gear.json       gear slots, item bases, affix choices, and attunement source tags
  boss.json       practice target display names, Dummy/Boss types, and attack patterns
  system.json     innate stats, non-level progression rewards, resources, and base-attribute conversions
  attunement.json attunement names, source tags, stat targets, and skill-match tags
  default-setup.json  first-load Inner Ways/food/Divinecraft and legacy build-setup fallback
  breakthrough.json  breakthrough-indexed level bonuses and enemy profiles
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
  App.tsx                         application composition shell and cross-feature state
  application/                    cross-feature contracts, game data, persistence, and services
    gameData/                     path, skill, setup, and martial-art registries
    persistence/                  storage keys, migrations, and application loaders
    results/                      shared calculation result presentation
    shell/                        eager notice and feature-boundary components
  assets/                         source path icons transformed at build time
  features/                       feature UI and feature-local behavior
    analysis/                     breakdown presentation
    build/                        build, gear, OCR, and setup UI
    character/                    character statistics and profile UI
    rotations/                    rotation editor and timeline presentation
    settings/                     settings UI
    simulation/                   simulation UI and lifecycle
    skills/                       skill editor UI
  schemas/                        runtime trust-boundary validation
  ui/                             generic, reusable, domain-agnostic UI primitives
    Button/                       reusable button variants and sizes
    Checkbox/                     native checkbox shell
    Chip/                         native inline-chip shell
    Dialog/                       controlled native-dialog wrapper
    NumberInput/                  bounded number input and commit helpers
    Panel/                        panel and panel-heading shells
    Select/                       native select shell
    Tab/                          selectable button state shell
    Tooltip/                      layout-neutral hover/focus tooltip
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
  licenses/                      third-party notices copied into the build
  locales/                       generated per-locale runtime message JSON
```

Combat-path icons live under `src/assets/path-icons/` and are imported with
`vite-imagetools` using `?w=56&h=56&format=webp`; production builds emit
optimized 56px WebP assets instead of copying the 512px PNG sources.
`gameData/pathIcons.ts` binds one icon to each `PathId` and is the only place
that names a source file, so `data/path.json` carries no image fields and the
selector renders straight from the `PathId` it is already iterating.

## UI layering

`src/ui/` contains only generic, reusable UI primitives. A primitive stays
domain-agnostic: it renders arbitrary children, owns no game or application
state, and imports nothing from application, feature, or domain modules.
Feature components own their local UI and compose primitives from `src/ui/`.
Application services own cross-feature behavior and may import UI primitives,
but feature modules must not import one another. `src/App.tsx` is the eager
composition shell: it coordinates shared state and renders features, while
reusable domain services live under `src/application/`. The dependency
direction is one-way: features may use application services and primitives;
application services must not import feature UI; UI must not import any of
those layers.

### Primitive contract (`src/ui/<Name>/{index.tsx, style.module.css}`)

A primitive owns reusable behavior and its base presentation in one folder.
When `index.tsx` grows too large to stay readable, the folder has room for
additional files (for example `types.ts`, `helpers.ts`, or subcomponents) —
splitting a primitive across files inside its own folder is expected and
preferred over growing a single file. A primitive renders arbitrary children,
owns no game or application state, and imports nothing from application,
feature, or domain modules.

The CSS module owns the same small, reusable set of rules as any other UI
component and consumes shared custom properties from the globally loaded
`src/styles/tokens.css`. Reusable appearance options are explicit primitive
props and local module classes rather than recreated global classes. For
example, `Button` owns primary, secondary, and danger variants, their hover
states, and the small size. Its `data-button` marker exists only so domain
layout rules can target primitive instances; it does not provide a global
button-style fallback. `Panel` and `PanelHeading` expose the corresponding
`data-panel` and `data-panel-heading` hooks for stable application selectors
while their generated module classes remain private.

Domain-specific classes one layer above a primitive may still adjust layout
or context-specific appearance with the same design tokens. Primitives do not
expose a second custom-property theming API, duplicate token values as literal
fallbacks, or require global token bridges.

`src/ui/` sits above base normalization and below application layers in the
CSS cascade (`tokens, base, ui, layout, components, utilities`). `main.tsx`
must import `styles/index.css` before `App` so this declaration establishes
layer order before component CSS Modules are evaluated. Primitive defaults
therefore win over element normalization while application classes can still
refine them without specificity battles. The icon pack is
`@tabler/icons-react`, imported per-glyph at call sites; no new hand-drawn SVGs
are added.

Lint hardening is scoped to the folder and explicitly invoked after the root
lint pass: `src/ui/.oxlintrc.json` enables the `suspicious` and `pedantic`
categories on top of the root baseline through `extends`;
`src/ui/.stylelintrc.json` extends upstream `stylelint-config-standard` without
local rule overrides.

Icons never get a primitive: there is no `ui/Icon`. Call sites import
`@tabler/icons-react` icons directly so bundling stays per-glyph; the
`.tabler-icon` class in `styles/base.css` keeps them at `1em`. No new
hand-drawn SVGs are added.

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
- build list, shared gear inventory, and one active build ID per combat path
- selected breakthrough profile
- globally resolved stats and derived stats
- the latest metrics published for the active rotation

Food, Script, and Divinecraft are parent-owned React state, initialized from
persistent storage. The Main selectors, character-stat preparation, and rotation
bundles consume the same selection snapshot; storage is only persistence.
Character-stat memoization depends explicitly on stat overrides, settings
(including weapons and breakthrough), equipped gear effects, resolved build
setup, these three selections, and combat path. Path controls Inner Way and set
eligibility. `innerWayEntriesForTag` sorts eligible Inner Ways by their data
display name, so the key order of the `innerWayDefinitions` registry is not a UI
contract and reordering it cannot reorder a selector. Selection validity, tier
conditions, and calculation are keyed by ID. Resolve this sheet before
fingerprinting the worker bundle: a new fingerprint cannot repair stale prepared
stats. Attunement has its own derived pipeline; global buffs/debuffs and
conditional combat effects remain rotation inputs rather than unconditional
character-sheet bonuses.

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
and rotation table use the remaining height and scroll internally. The
Rotation Editor keeps its header and one-row grid while cell content wraps, so
it does not introduce a horizontal scrollbar. Mobile mode and the other tabs
retain normal document scrolling.

### Rotation row windowing

The rotation step list is windowed, but only after it has been measured. Row
heights vary because cell contents wrap, and a windowed list only knows the
height of rows it has actually rendered. Reserving space for the rest from an
average is not stable: every newly measured row replaces an estimate and moves
the total by (real − average), so the scroll extent swings, the browser clamps
`scrollTop`, and the list appears to bounce back with its last row unreachable.
So the list first renders in full, measures every row, and only then starts
windowing; from then on the total height is exact and stops moving.

Heights are collected during the commit, once per mounted row, and again when a
row resizes through a `ResizeObserver`. Both paths coalesce into one state update
per frame. The `ROW_GAP` in the windowing hook must match the list's CSS `gap`,
or spacer padding stops reproducing the real rhythm.

A changed column set re-wraps every cell, so `layoutKey` carries the resolved
grid template and invalidates the measurements when it changes. That costs one
full measuring pass per column change — which is what switching between an
attacking and a non-attacking target does — and is unavoidable, because every
row genuinely has a different height afterwards. Measurements are tagged with the
layout they were taken in, so a stale layout is ignored rather than cleared by an
effect.

Each display entry has a stable `displayEntryKey`, carried as `data-window-key`
on the rendered row. The final row is marked `data-window-last`, because
`:last-child` is now whichever row the window happens to end on. Scroll anchoring
and post-edit focus resolve authored step indexes to that key and call
`scrollToKey` first, so a target outside the current window is pulled into view
before its position is measured. Deleting a row still anchors to a neighbouring
_rendered_ row, which is correct because an anchor is only needed when the
deleted row was visible, and a visible row's neighbours fall inside the overscan.

When heights cannot be obtained at all — hidden, or a test environment without
layout — the full list stays rendered, so no row can disappear where layout
metrics do not exist. This is why the existing editor tests still exercise the
full list under jsdom.

The currently viewed build and active build are separate concepts. Only the
active build contributes gear stats, attunement, weapon and armor sets, bow/ring set, and
arsenal to calculations. The same
viewed-versus-active distinction applies to rotations; an edited rotation
publishes metrics globally only when it is also active.
All bundled rotation presets explicitly store ping, including the empty planner
preset, so changes to Settings ping do not change their timelines. Most use
40 ms; the Might dummy preset uses 30 ms.
Preset ping is displayed in a disabled input with muted text. A custom rotation inheriting
Settings shows the current default as a muted input placeholder.
Custom rotations can override ping; an explicit override uses the Main tab's
modified-field highlight and reset control. This feedback is local to the
ping field and appears while typing, before committing or rebuilding the
timeline. Reset removes the override and
returns to Settings ping. Editor worker calculations update silently without
a calculating-status message. Both ping inputs keep local drafts until Enter or
blur, then clamp to 0–999 ms; a blank custom rotation field inherits Settings.

Bundled rotation presets are immutable editor sources. Switching, activating,
or creating another rotation only writes the current editor content back when
the previous entry is user-created.

Build and rotation activation are stored independently for every combat path.
A single parent-owned path transition resolves the destination path's compatible
build and rotation before changing any visible state. A missing or incompatible
saved selection falls back to that path's configured default. The transition
invalidates the previous calculation batch, installs the path, martial arts,
build, and rotation together, then lets the normal fingerprint schedule restore
a cached result or start one replacement batch. The Rotation Editor remounts at
this path boundary but shares the application-level calculation cache; it does
not reconcile the new path through a later child effect. Calculation
fingerprints explicitly contain the ordered pair of equipped martial arts, so
otherwise identical rotations from different martial-art selections cannot
share cached results.

Rotation editing uses a separate baseline-preview schedule. Input changes render
immediately while a short debounce coalesces rapid edits before constructing and
fingerprinting the worker bundle. A matching main-thread baseline cache entry is
published without recalculation; a cache miss is queued as low-priority worker
work. Results enter the cache when completed, but only the latest requested
fingerprint may replace the editor preview. The previous completed preview stays
visible while newer work runs. Editor previews never request comparison variants;
active-rotation comparisons remain tied to save, activation, or setup changes.
Manual event rows expose their authored start time as an input. Entering a time
switches the event to explicit battle-relative timing while retaining its old
anchor only for editor navigation; the previous/next event controls remove that
explicit time and reattach the event to the selected action. Switch Martial Art
and Delay are presented as Action options, named "Action: Switch Martial Art"
and "Action: Delay" to match that group, and keep their existing start-only and
sequential semantics. The step picker groups options by skill category, listing
each equipped martial-art category, then Mystic, General, and Mechanism, ahead of the Events
and Action groups. Battle-start markers and persisted starts are limited to ordered
or live-attached rows; fixed-time rows cannot establish the fight-start anchor. The
rotation portion of the fingerprint includes its resolved ping, steps, target HP,
practice target, group size, enemy count, Infinite Vitality, battle-start anchor, and event-time
reference. Duration-controlled skill steps use the same authored input for
editor display, anchor timing, sequential scheduling, and any named tracked
effect; an omitted bounded input uses its configured maximum, and required
inputs reject duration-less authored/imported steps. Their data-defined cap is
applied before those consumers. Triggered
skills may name a source effect to keep a delayed chain bound to its original
application. Its display name is intentionally excluded because renaming cannot
change a calculation.

Rotations may optionally store a target maximum HP. Without one, the target HP
state defaults to 99% but damage does not deplete it. The centralized baseline
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

Auto HP has been removed. Loading or importing a legacy rotation discards its
`autoHP` flag while preserving authored HP events, target maximum HP, and the
fight-start anchor. The simulator does not infer HP changes from future rotation
duration. Target HP follows explicit HP events or damage against a supplied
maximum HP; otherwise it stays at the ordinary 99% default.

Each rotation stores a `targetType` practice target selected from `data/boss.json`.
That file is the single source for a target's display name, its `Dummy` or `Boss`
type, and its attack patterns. The removed `dummyAttack` flag is the former
two-value form of this setting; a stored `true` migrates to `DummyAttack` and any
other value to `Dummy`, so previously saved rotations keep their exact timeline.
The timeline exposes the resolved target to data as the `targetType` requirement
target, letting a definition gate itself on the encounter rather than on a
skill ID. `vsBossDmg` applies for every practice target.

Both `Dummy` and `DummyAttack` count as a boss, so the boss role is implicit
rather than a property to test. A mechanic whose source says it works "against a
boss" must therefore not gate itself on `targetType`, because matching `Boss`
would exclude both dummies. Write such a mechanic unconditionally, exactly as
`vsBossDmg` is applied. Reserve `targetType` for conditions that genuinely
distinguish one practice target from another, such as a target that attacks or a
target with a different resistance profile.

A target's `attackPattern` array declares its generated Take Damage events. Each
entry is `{ firstDelay, interval, count, damage }`: the first occurrence lands
`firstDelay` seconds after battle start, repeats every `interval` seconds, and
lands `count` simultaneous hits of `damage` each. Several entries repeat
independently, so a future boss can mix cadences. An empty array never attacks.
The current `DummyAttack` entry uses `5.5 / 6 / 2 / 200`. These rows carry
`automatic: "targetAttack"` and stop before Battle End. A Take
Damage event overlapping a skill tagged `AvoidsTakeDamage` resolves to zero and
does not fire take-damage triggers; the cast interval includes both boundaries,
so a zero-cast-time avoidance skill protects its exact timestamp. A manually
authored zero-damage Take Damage event still fires defensive responses and the
ordinary take-damage lifecycle. Other Take Damage events use the ordinary Self
HP and take-damage trigger pipeline. The optional `infiniteVitality` flag marks
Vitality as an infinite timeline resource: its displayed value is `∞`, and its
normal gains, regeneration, and consumption are skipped while ordinary resource
requirements continue to use the character's capped maximum.

Every normalized rotation stores `enemyCount`, a positive whole number defaulting
to one for new and legacy records. The Rotation Editor places Enemy Count before
Ping; edits commit on blur or Enter, persist with the rotation, and participate
in worker fingerprints. The timeline exposes it as a numeric requirement for
Light Anew and Song of Tang; it does not multiply total damage.

Every normalized rotation also stores `groupSize` as `1`, `5`, or `10`, exposed
in the editor as Solo, Team, or Group. Missing and invalid legacy values migrate
to `1`. A skill with `group: true` multiplies its reported healing by this
recipient count, while only one copy enters the tracked Self HP state. A
`target: "player"` application instead allocates one independently expiring
effect copy to self first and then to teammates. Once every represented player
has a copy, reapplication replaces the copy with the least remaining duration.

Timeline construction records an auditable numeric-resource ledger alongside
the first sorted row. The worker uses the ledger's consumed and final Vitality
to apply any rotation-wide Mystic damage sustainability correction only to the
published total damage and DPS. Action breakdowns and the Rotation Editor keep
their original calculated values; the UI does not independently derive or
apply this correction.

Current martial art and physical weapon are timeline state as well. They start
from the left equipped martial art, change automatically at the start of each
castable `MartialArts` skill from that skill's data fields, and remain unchanged
through General, Mystic, and triggered skills. A start-only Martial Art event
can switch them explicitly before a cast. Ordinary requirements can inspect
both values, and rows and actions snapshot them so a Mystic follow-up such as
Ghostly Step - Umbra Dodge can dispatch weapon-specific damage definitions.

## Chance-applied periodic damage

Chance-applied DOTs reuse the trigger application and periodic event scheduler.
Action chances can be numeric or use the existing `switch` value resolver against
current requirement state and active condition flags. Both expected and sampled
paths resolve the same value; simulation timeline-rebuild detection recognizes
object-valued chances as well as numeric ones.
The data-defined `onMaxStack` consume-and-trigger transition runs synchronously
inside both ordinary and trigger-driven effect applications, removing state and
pending ticks before queuing the burst. The expected tracker uses the same
threshold predicate, resets only threshold-reaching branches, and weights the
normal triggered damage skill by the resulting burst probability.
Existing `time: "expire"` actions also support chance-triggered damage. Concrete
expiration schedules have a latest-generation identity so refreshes to the same
timestamp cannot duplicate actions. Natural expiration is validated before state
pruning, independently of other actions at that clock boundary. Expected DOT
branches keep one pending expiry wakeup per effect, selected from sorted list heads.
Applications, branch release and tiny-state merging update that wakeup in place.
When it fires, matching owners supply their current probability, and the next
live expiration is scheduled. Live expiry actions
reuse the effect-action executor without publishing an expiration-check row.
`ExpectedPeriodicTracker` extends the outcome-probability infrastructure with a
distribution over stack count, shared expiration, damage owner, and temporary
branch identity. Within each branch and owner, stack-indexed sorted lists hold
expiration and absolute probability; inactive mass is a scalar. Applications walk
stacks downward, scale failed applications in place and aggregate successful mass
into one new entry per destination stack. Indexed linked lists backed by shared
numeric arrays recycle slots without allocating per-state objects. Packed arrays
remain available through the diagnostic `expectedPeriodicStorage` input.
Tiny-state compaction retains nodes and unlinks others during linear bucket
traversals; it does not rebuild groups and search to reinsert each result.
Branch release merges sorted lists with one forward cursor and a direct-tail
fast path for current-expiration follow-ups, avoiding repeated prefix searches.
Exact-cadence states also carry maps of next-tick timestamps to absolute
probability mass. Cadence does not affect the supported application, threshold,
or expiration transitions, so states with different cadences share those
transitions while their weighted tick schedules remain exact by default. The expected
timeline contains the union of possible ticks, with separate damage and hit
weights. These finite probability branches do not consume the ordinary-event
loop budget. Without the tiny-state approximation described below, the DOT's
marginal stack distribution is exact; downstream
expected-state calculations use marginal hit weights, not a joint distribution
of every proc, resource cap, and other random buff. Simulations instead rebuild
concrete timelines, including on-hit resource gains. Damage and proc draws occur
in chronological execution order, once per action/application, without replay.
Selecting or comparing an Inner
Way that can add these events must rebuild the timeline.
The distribution is partitioned by temporary branch identity inside each effect's
tracker. A conditional post-burst application detaches and transforms only its
partition; unrelated partitions retain their states, cadence maps, and merge
indexes. Ordinary applications still transform all partitions. Releasing a branch
merges only its states into the unconditioned partition, preserving absolute mass,
expiry, cadence and owner. Clock-driven ticks and expiration queries inspect all
applicable states; this is not a global joint-probability engine for unrelated
buffs or resources. `tests/periodic-branch-isolation.test.ts` covers overlapping branches,
conditional chances, owner-specific expiration, and probability conservation.
`script/probe/benchmark-fivefold-bleed.mjs` measures timeline runtime, output rows,
peak combat states, and executed tick/expiration checks for dense distinct-cadence hits.
The exact factorization reduces transition overhead without pruning rare outcomes.
Weeping Blood additionally opts into `periodic.expectedTickAlignment: "battle"`.
Expected timelines use one shared cadence at battle seconds 1, 2, and so on,
with one probability-weighted DOT row per active boundary. New applications wait
for the next strictly later boundary; refreshes retain it. Expiration and threshold
times are not rounded, and expired or consumed branches contribute no tick mass.
Battle-aligned trackers store one shared tick cursor, not per-state cadence maps.
Each active state's probability supplies tick mass directly. A scalar pending
probability excludes newly applied mass at the current unprocessed boundary;
it scales with conditional transitions and clears when the shared clock advances.
This preserves same-timestamp refresh/application ordering without individual tick
timestamps. Exact-cadence expected trackers retain their weighted cadence maps.
This deliberately approximates tick timing and downstream DOT-sensitive effects,
but the grid alone does not approximate stack/expiration transitions or conditional burst probabilities.
Sampled timelines ignore this option and retain exact periodic cadence.
The generic exact-cadence path remains available for other periodic definitions.
Shared-clock expected trackers additionally merge released states below `1e-5`
probability when stack count, damage owner and the 0.1-second expiration bucket
match. The merged state preserves total mass and uses the weighted mean expiry;
temporary conditional branches remain isolated until their follow-ups finish.
Superseded expiration wakeups are removed, not merely left to fire with zero mass.
This approximates expiry timing and can affect later stack/trigger transitions;
it never prunes probability. Exact-cadence trackers and simulations are unchanged.
See [tiny-state merging and its benchmark](rotation-event-loop.md#tiny-expected-state-merging)
for the diagnostic opt-out, rounding rule, and measured accuracy.
Expected DOT scheduling keeps one pending tick wakeup per active effect. Applications
update that wakeup's time/causal ordering instead of rebuilding future tick rows.
Only when it fires is the current tick probability resolved and a damage row emitted;
the scheduler then selects the next eligible tick. This also supports exact cadences
without enumerating their entire future union. Both tick and expiry wakeups retain
the active-effect identity so removal/reapplication cannot revive stale schedules.
These internal checks do not consume the ordinary trigger-chain safety budget.

Threshold and expiration bursts retain a temporary expected-state branch identity
until their damage triggers finish. Reapplications to the originating DOT operate
conditionally on those branches, preserving the consumed/expired-state correlation
without weighting the burst probability twice.
The optional data-defined `onMaxStack.triggerTags` adds skill tags to the spawned
instance only. This lets normal damage-trigger requirements distinguish a
threshold burst from an expiration burst of the same skill without duplicating
its damage definition.

Recurring effects use the same event-loop endpoint as ordinary actions. Battle
End excludes damage at its timestamp. Without Battle End, completing the last
ordered item ends combat, after same-time final actions and causal follow-ups.
A trailing explicit Delay extends this window; DOTs, triggered skills, replays,
and generated target attacks cannot extend it. No feedback-suppressed cutoff pass
is needed.

## Runtime Inner Way damage ownership

Skill and DOT `damageGroup` metadata names an Inner Way owner. Timeline construction
creates one read-only `damageGroup` row for each such selected Inner Way, even with
zero procs. Generated actions use that group's stable row ID as their damage owner;
they do not retain the attack that caused the proc for attribution. Fivefold Bleed
shares its owner across DOT states, threshold bursts, and expiration bursts, so
equivalent probability states from different attacks can merge. Temporary branch
identities still preserve conditional post-burst behavior.

The shared calculator credits group totals instead of cast totals without changing
combat timestamps or formulas. `rotationDisplay.ts` places non-expandable group
summaries after the regular rotation list. Group-owned internal actions never
become display entries, even if a previous session expanded their group.
The React editor indexes owner-to-row relationships once per timeline.
These runtime rows never enter saved rotation steps,
cooldown waits, attachment anchors, or fight-start selection.

Before publishing a baseline, `compactInnerWayResults.ts` combines single-action
group damage rows only when their skill, exact timestamp, damage context, resolved
unit damage, and outcome metadata agree. Damage and hit weights and resolved
channel totals are summed. No timestamp buckets or probability pruning are used.
This runs after triggers, outcome effects, attribution, and metrics have resolved;
it cannot combine threshold/expiration branches before their different T6 behavior.
The worker cache retains the original timeline. Published baselines carry
`compactedInnerWayResults`; a comparison using one after a cache miss rebuilds
the event timeline rather than replaying merged hits. Editor merging treats
calculated group-owned rows as authoritative so structural rows cannot restore
discarded contributions or replace summed weights. This reduces result/display
work, not the cost of constructing the original probability event timeline.

## Browser persistence

All user settings and editable records use `localStorage`, so they persist across
reloads, tabs, and browser sessions. `getPersistentItem()` migrates a value from
the former same-named `sessionStorage` key when no durable value exists, then
removes the session copy. Existing durable data takes precedence over a stale
session copy. App startup eagerly applies this migration to every remaining
application-owned session key before React state is initialized; unrelated
same-origin session keys are left untouched.

| State                                           | Storage                                          |
| ----------------------------------------------- | ------------------------------------------------ |
| Character stat overrides                        | `localStorage`, `wwm-stat-overrides-v1`          |
| Explicitly selected locale                      | `localStorage`, `wwm-locale`                     |
| Custom character profiles                       | `localStorage`, `wwm-character-profiles-v1`      |
| Build list, shared gear, and per-build loadouts | `localStorage`, `wwm-build-list-v1`              |
| Active build IDs by combat path                 | `localStorage`, `wwm-active-build-by-path-v1`    |
| Skill editor overrides                          | `localStorage`, `wwm-skill-editor-session-v1`    |
| Combat path                                     | `localStorage`, `wwm-path-session-v1`            |
| Dev layout preview                              | `localStorage`, `wwm-layout-preview-session-v1`  |
| Attunement overrides                            | `localStorage`, `wwm-attunement-overrides-v1`    |
| Weapons and default ping                        | `localStorage`, `wwm-settings-session-v1`        |
| Build setup overrides                           | `localStorage`, `wwm-build-setup-overrides-v1`   |
| Food                                            | `localStorage`, `wwm-food-session-v1`            |
| Divinecraft                                     | `localStorage`, `wwm-divinecraft-session-v1`     |
| Script                                          | `localStorage`, `wwm-script-session-v1`          |
| Global buff/debuff controls                     | `localStorage`, `wwm-global-debuffs-session-v1`  |
| Rotation list                                   | `localStorage`, `wwm-rotation-list-session-v1`   |
| Active rotation IDs by combat path              | `localStorage`, `wwm-active-rotation-by-path-v1` |
| Custom simulation percentiles                   | `localStorage`, `wwm-simulation-percentiles-v1`  |

The former global active-build and active-rotation IDs migrate into the current
combat path when that path has no saved selection in the new per-path maps.
A stored `empty` selection is discarded on read, from both the per-path maps and
the former global keys. `empty` is the placeholder preset that paths without
real builds or rotations point at, so a stored `empty` records that the path was
opened before it had presets rather than a deliberate pick. Discarding it lets a
path that ships its first build or rotation resolve its configured default even
while it is still work in progress, instead of pinning earlier visitors to the
placeholder. Loaders validate enough shape to fall back to defaults and include migrations
for older percentage, penetration, attunement, rotation, per-build inventory,
single-inventory gear, and session-wide build setup formats. Non-zero values from the former raw character and attunement
storage keys migrate to overrides, preserving existing manual inputs. Calculated
metrics and timelines are not persisted. Bundled default builds and rotations
are reconstructed from repository data and omitted from browser persistence;
formerly edited default rotations migrate to custom copies. A malformed custom
rotation is skipped independently so it cannot discard other saved rotations,
and initial load never replaces unreadable storage with an empty list.
Legacy consecutive Drunken Poet 1-through-5 steps migrate to the conditional
five-hit composite, including remapping fight-start and attached-action anchors
to the composite's flattened action indexes.
Standalone Inner Way, legacy gear-set, bow/ring, and arsenal selections migrate
only when the unified build-setup override has never been saved. Once that
override exists—even as an empty object—the active build supplies every
non-overridden setup default and legacy keys are ignored.

Superseded browser formats are read through the typed adapters in
`src/application/persistence/legacy/`. Each adapter owns its historical key and
schema and returns a typed value for the current loader; current loaders retain
domain normalization and migration policy. Legacy payloads are never passed
through a current-format schema, so format-specific migrations remain
independent and regression-tested.

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
migrated to post-action `after` attachments. Legacy attached Take Damage records
without an explicit battle-start reference are converted to fixed time; modern
battle-start records preserve explicit attachments when the editor reattaches them.

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
in their own path-grouped `data/build/**/*.json` records. Each path declares one
`buildGroup`, one explicit `status`, and `defaultBuild` and `defaultRotation`
preset IDs in `data/path.json`. Paths without presets explicitly reference the
development-only empty build and rotation. A compatible persisted selection
takes precedence; otherwise changing or loading a path selects its declared
default before considering other eligible presets. The preset-validation gate
requires every available path to declare existing, non-test defaults belonging
to that path before a production build can complete. Default-build visibility
follows the folder mapping rather than being inferred from the preset's
martial-art pair.

## Character stat pipeline

The authoritative stage contract is [Stat snapshot pipeline](stat-pipeline.md).
`calculateStatsWithEffects()` builds the raw and character-sheet snapshots;
calculation adds global, skill, and current combat contributions:

```text
base inputs / solved override offsets
  -> rawStats (rawStat contributions, including flat martial-art attributes)
  -> stats (raw-sourced talents, effective-only food inputs, effective/final fields)
  -> buffedStats (global buffs/debuffs)
  -> skillStats (skill-tag contributions)
  -> actionStats (current combat contributions)
```

Equipped gear contributes one data-derived `rawStat` effect to this same pipeline.
Direct Critical Rate is capped at `0.2` (20%) in this shared pipeline and again
when effective per-action values are resolved, so displayed stats, overrides,
setup effects, and damage calculations cannot bypass the cap. The complete
snapshot retains its uncapped input so removing contributions remains correct.
With no overrides, the simulation base is the empty character and all displayed
stats come from the innate character system, character talents, gear, Inner
Ways, martial-art talents, arsenal, bow/ring set, weapon and armor sets, food, and
Divinecraft.

`data/system.json` keeps innate `baseStats`, ordered `enhancementStats`,
ordered `talentStats`, regional
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
`data/breakthrough.json` groups the selected enemy profile and its
`levelBonusStats` under the breakthrough number. Changing breakthrough therefore
updates enemy inputs and replaces the level-derived Precision and five base
attributes through the same shared effect pipeline. Breakthrough 17 is selected
on every page load. The user may switch to Breakthrough 16 for the current page
session, but Breakthrough is not written to browser storage or character profiles.
Each breakthrough declares its own `soloLevel` for Inner Way stat tables.
`innerWayDefinitionForSoloLevel` resolves those tables to numeric raw-stat
effects before character-sheet and worker calculation. Breakthroughs 16 and 17
select Solo Levels 16 and 17. The live rotation rule memo depends on Solo Level,
so switching breakthrough replaces the Inner Way bonuses and invalidates the
normal calculation inputs. These levels are independent of martial-art rank.
Each breakthrough also declares `martialArtTalentRank`: breakthroughs 16 and 17
both use rank 13. The shared `martialArtEffectsForRank` selector reads the
two-dimensional `talent[rank]` array for each distinct equipped martial art and
passes its effects into the existing setup pipeline. Ranks 0–12 are empty;
rank 13 contains the datamined talent selection and supported effects. Empty or absent ranks grant no
talents. Rank selection reads the breakthrough field directly rather than
deriving a rank from enemy level or the datamine's world-level unlock requirements.
Changing rank therefore changes the setup effects used to build stats, worker
inputs, and calculation fingerprints; timeline-affecting talents are selected
before constructing a new baseline.
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

The complete character-sheet `stats` is sent to the worker alongside `rawStats`
and solved base offsets. Each complete snapshot retains `effectiveStatBonuses` as
additive derivation inputs, separate from ordinary fields. Food changes effective
attack without changing ordinary or displayed editable attack. Each stage resolves
all effective entries before adding their totals and normalizing ranges/rates.
Comparison variants copy that sheet and apply changed ordinary and effective
contribution deltas separately, then recompute effective fields. They do not reconstruct
the baseline sheet from unconditional effects. Modified stats therefore remain
responsive in delta calculations.

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

`buildRotationTimeline()` implements the [incremental event-loop design](rotation-event-loop.md):
ordered input, sorted timed input, an expanded-event priority queue, and resolved
timeline output. It expands one ordered item at a time, never future casts.
Alongside buffs, debuffs, distance, and current HP, it tracks a map of named
numeric resources. Resource actions update that map in event order, and each
action snapshot carries the resource values used by action and setup-effect
requirements. Optional resource-regeneration rates accrue from elapsed timeline
time before each ordered event is processed.
System-defined resource-event rules are evaluated by the same ordered queue.
They cover universal gains such as Vitality from attacks and actual Max-HP
loss, while ordinary skill actions handle explicit costs and gains.
Actions may wrap their requirement operands with `resolveAt: "skillStart"`.
The timeline evaluates and stores that boolean when the owning skill component
begins, then uses the stored result when the action executes. This keeps delayed
resource consumption and similar mechanics bound to their release-start state.
It produces four row kinds:

- `rotation`: an explicit skill or manual event
- `trigger`: a skill inserted by a trigger action
- `dot`: generated DOT actions
- `periodic`: generated non-DOT buff or debuff actions

Each accepted base cast or explicit Delay schedules a next-item marker at its
resolved completion time. Cast-time changes update that marker and current-cast
actions; future ordered rows do not yet exist. A trigger with `queueTime`
reserves its input at the earlier marker and can extend the owning row's
completion through the queued skill's delayed start and returned actions. A
Delay consumes its configured duration without producing actions or effects and
extends combat when it is the last item. Move rows run before a
following skill's cast start, direct action, or triggered-skill action. Exhausted
rows run after their attached direct or triggered action. Both are rescheduled
with that target. Take Damage and other timed manual-event `startTime`
values are offsets from the selected fight-start anchor and consume no cast time.
The builder records fight start when the selected event is reached, then activates
the fight-relative encounter schedule. Internal timestamps never shift for display;
the UI subtracts the published `battleStartTime`. There is no convergence pass.
The event queue is a stable priority queue ordered by timestamp and then by a
lexicographic causal order. Ordinary insertions and removals update its binary
heap directly. Cast-time changes can mutate several queued timestamps at once;
those mutations mark the queue dirty and rebuild the heap once before the next
event is removed. An insertion sequence preserves the previous stable order
when both ordering keys are equal.
Fixed-time and Move events have priority over skills, triggers, and DOTs at the
same timestamp, while Exhausted attachments sort immediately after their target
action. Within
each row, cast start still precedes its zero-time actions. This lets casts,
actions, triggers, DOTs, and other periodic effects interleave while preserving
causal order.
Timestamps within `0.0001s` are treated as equal so rounded rotation data and floating-point arithmetic
cannot place a displayed equal-time skill ahead of its event.

Inner Way triggers can retain a rolling hit window and an independent proc
cooldown within each timeline build. Window state is bounded by the configured
hit count and updated on eligible damage events, including during cooldown.
Probability-weighted expected damage is excluded from these windows; ordinary
DPS evaluation is unchanged. This uses the existing trigger action executor and
charge-reset wakeup path, with no additional scheduled polling events.

The timeline owns mutable simulation state while it is being built:

- active player buffs
- active target debuffs
- current target distance, initially 1m
- absolute self HP initialized from calculated Max HP, plus its derived ratio
- stacks, maximum stacks, and expirations
- per-definition duration refresh behavior for stacked effects
- skill, action, and effect cooldowns
- action-time state snapshots

The editor and calculator share the timeline's skill-cooldown state. An
unavailable explicit cast waits for its ready time, and a live cooldown reset can
wake it earlier. Before-cast attachments resolve only once the cast is ready.
Elapsed waits appear as protected automatic Delay rows in the shared timeline,
with no authored step index. Their durations reflect early cooldown resets and
the combat cutoff. They describe time already spent waiting and never enter
the event queue or authored rotation steps.
Legacy generated waits are removed on load/import with start indexes remapped.
Unavailable triggered skills are rejected
because they do not consume rotation time.

One skill-cooldown state map, keyed by skill or shared group, stores either a
shared usage window or sorted independent charge recovery timestamps. Explicit
casts, triggered casts, and component cooldown recording use the same tracker.
The ordinary cooldown-ready requirement reads the tracker's next availability,
so a skill with any charge remaining is ready. Partial `clearCD` actions restore
the requested number of uses and preserve other pending recoveries; full resets
clear the state. Restores use the existing waiting-cast rescheduling mechanism,
and an independent cast's cooldown modifier affects only its newly spent charge.

Setup `skillStart` triggers reuse the action trigger executor once per accepted
cast, before its timed actions, without inserting a visible action. Their
per-setup cooldown state is shared across matching skills. A `skillStart` trigger
matches the started skill's own definition tags, never the merged tag set, so a
raised skill that inherited its parent's tags cannot satisfy the parent's own
start-of-cast effects. Buff duration setup
rules resolve in both ordinary and trigger-driven applications. Triggered skill
rows carry the originating cast's `buffSourceSkillTags` separately from damage
ownership and damage tags, allowing duration bonuses to follow nested triggers
even when a triggered skill changes its damage group. These rules execute within
the shared worker timeline; comparisons that change them require a rebuilt
timeline rather than reusing baseline effect snapshots.

A `trigger` action marked `inheritTags: true` appends the raising skill's tags to
the raised skill's own, so an attack summoned by one skill is matched by that
skill's damage boosts. The merge composes down a chain: each link passes on its
merged tags, so a skill raised by a raised skill inherits from both. It is opt-in
per trigger because propagating every tag lets a raised skill satisfy its parent's
tag-gated damage effects and fire extra procs. Tag _category_ markers such as
`MartialArt`, `Heavy` and `ReturningUmbrella` are meant to cross; a skill's own
identity marker such as `PerfectCatch` is what start-of-cast triggers key on, and
those triggers read own tags to keep the two apart.

Main-tab global-effect controls seed permanent tracked player buffs or target
debuffs into this initial state at their configured stack count. They therefore
use ordinary effect-definition and requirement resolution, appear in timeline
state, and share the same unique tracked entry with any matching application
from the rotation. Floating Grace selects either its base Mixed definition or
its stronger Deluge definition through `initialBuffs`. Reapplication cannot
expire or duplicate a permanent seeded effect.
Effect definitions with `global: true` instead enter through setup effects.
`global: { equippedMartialArt: "infernalTwinblades" }` includes a rule only
when that martial art is equipped in either slot, before sending setup effects
to the worker. Its inner requirements still determine which attacks benefit.
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

The simulator has a 5,000-event safety limit to prevent accidental infinite
trigger chains. Exceeding it raises an error rather than publishing a truncated
timeline with a misleading duration. This accommodates Wind's complete authored
sequence with Hellfire ticks and automatic Enhanced Rodent Rampage attacks.

Setup and Inner Way triggers are indexed by event name once for each timeline
pass. A damage, healing, or incoming-damage action evaluates only the rules for
that event while retaining their original data order. A practice target queues
its next generated hits dynamically and needs no preliminary duration pass.
Fight-start detection activates its dependent clocks in the same traversal.

### Input latency (ping)

Settings persists a non-negative finite ping in milliseconds in the existing
user-settings record, defaulting to 40 ms for new and legacy settings. Rotations
may store an optional ping override. An absent override inherits Settings;
zero explicitly disables latency. Rotation save, duplication, export, and import
preserve overrides, and invalid overrides are discarded without replacing the
rotation.

The application resolves inherited ping into each immutable worker rotation
before fingerprinting. Active calculations, editor previews, comparison timelines,
graduation baselines, and Monte Carlo snapshots therefore use the same latency.
The low-level timeline accepts explicit milliseconds; omitted ping there is zero
for callers without application settings. DPS regression fixtures explicitly
record their configured ping.

After an ordered skill becomes cooldown-ready, its start is scheduled at ready
time plus ping / 1000, including the first skill. Attached events follow the
delayed start/actions. Cast modifiers do not scale latency. Timed events and
resource regeneration continue during the gap, and Battle End can prevent the
cast from starting. Cooldown Delay rows report only cooldown waiting; latency
is an additional gap.

A selected sub-action dispatches with its own skill definition's latency. Its
primary/fallback choice is locked at dispatch; cast-start values and modifiers
resolve when it starts after the latency gap. Skipped components consume no ping.
Composite row duration includes component gaps and pushes later components and
ordered skills accordingly. Triggered skills, DOTs, periodic actions, and explicit
Delay events do not pay input latency.

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

`calculateHealingBreakdown()` is the parallel pure action calculator for
`type: "heal"`. It consumes the same resolved stats, tags, attunements, and
hit-time effects, but returns only Physical, Silkbind, and total healing.
Healing has Normal and Critical outcomes only. The worker aggregates healing
beside damage and publishes total healing, HPS, and independently sorted
healing breakdown rows through the same baseline result.

The timeline applies one per-recipient copy of resolved healing to absolute Self
HP before calculating overhealing. Simulations roll every recipient separately
rather than multiplying one shared outcome. Other recipients of a group heal are
assumed full and each contribute one-fifth of their own healing number to World
to Sword. Every recipient emits a separate accumulator event. A single-target
periodic heal assigned to a teammate
also assumes that teammate is full, but contributes its complete healing rather
than the group-heal one-fifth weight. Buff accumulators subscribe to named events. Damage actions also feed a
requirement-filtered count: numeric thresholds, data-defined increments, and
`oncePerSkill` let Rodent Rampage count the first damage hit of each attack
stage, including multi-action components. Its accumulator preserves progress on
refresh and clears it on expiry or removal. Probability-weighted expected proc
rows do not advance the damage counter. Threshold objects continue to request
attack snapshots, while numeric thresholds work directly in the timeline. World to Sword snapshots
its threshold from fully buffed Physical/Silkbind attack at its own cast event, accepts `overheal`, and
checks only on overheal or a Qi Blade's delayed `QiBladeCheck`. Expected and
simulation modes both reset the accumulator after a launch. Healing received
during the cooldown remains stored until the delayed check can launch the next
blade. The calculated timeline carries a
finite listener's remaining trigger count into the editor's tracked buff state,
independently of the buff's normal expiration time.

After an ordinary hit resolves, the centralized damage sequence emits a typed,
synchronous damage event containing its final damage, action-specific tags, and
the immutable combat-state snapshot for that action. Active Inner Way listeners
are data-defined and evaluated against this event. A successful listener may
spawn a parameterized `Replayed` skill; its delayed actions retain a link to the
source entry rather than copying a deterministic value into the timeline.

The average calculator and simulator resolve that link after calculating the
source hit. Replay actions therefore follow randomized source damage during
Monte Carlo runs while bypassing normal multipliers and outcomes. The shared replay resolver additionally applies the dedicated numeric replayDmgBonus from requirement-filtered hit-time effects; Wildstride is its sole authored source. Generated
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
damage and healing entries, reports progress, sorts completed runs by DPS, and returns the
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
Custom row choices persist in browser storage; simulation history itself
remains component memory and is not stored.
Healing simulations independently sample each recipient's Normal/Critical
outcome and uniform ±8% final-healing fluctuation. They publish HPS plus
recipient-weighted Normal and Critical healing percentages on the same
DPS-ranked run records. Deterministic rotation results remain unchanged.

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
summed total damage, and average cast time. These damage values sit beneath a
shared Damage header. Each group also records the gross Vitality consumed by
its casts and divides attributed damage by that total. Deluge displays this
Per Vit value before DPS and sorts the rows by the inclusive Per Vit value;
zero-cost skills show no Per Vit value and follow Vitality-consuming skills.
Attributed buff-inclusive values are calculated for DPS, Per Vit, the per-cast
average, and total damage.
Zero-time-only damaging groups leave DPS undefined. Outside Deluge, rows sort
by average DPS descending.

Tracked effects retain the cast row that applied them. A skill with
`collectBoostDamage` passes that target effect ID and its cast row into buffs it
applies. When the named effect becomes active directly or through a later buff
application, each affected hit is recalculated with that effect removed. Only
the difference is attributed to the source cast; rotation total damage and the
damaged skill's own breakdown do not change. Flute names `Flute`, while Ghostly
Step names `MysteryDMGBoost`; the intermediate `Mystery` or `MysteryUmbra` buff
carries Ghostly Step's source until Perfect Dodge applies the named damage buff.
That application names its enabling self-buff using `boostDamageSource`; a
direct map lookup transfers ownership without depending on iteration order.
The two Ghostly Step variants consume each other's enabling buff before
applying their own.
Both skills therefore use the same tracked-effect and counterfactual path.
Their per-cast Damage and Average DPS cells show direct values followed by
parenthesized values that include the attributed buff damage; sorting uses the
inclusive DPS.

`calculateRotationComparisons()` then evaluates priority and setup variants
against the cached timeline, damage entries, duration, total damage, and
breakdown. `calculateRotationSimulation()` remains as a combined entry point for
focused probes and callers that need both phases at once.

Each baseline and event-changing variant has one live combat traversal. Shared
formulas resolve damage and healing inside the event executor, immediately update
HP and collectors, and dispatch listeners through the same queue. Final totals
consume retained results. Event-invariant variants reuse action snapshots and
evaluate their own formulas without replaying combat. Monte Carlo runs with
event feedback use the same live executor; event-invariant runs can sample stored
entries. No structural discovery or separate damage-event executor remains.

Outcome-triggered buff schedules are built with the baseline damage stream and
stored by damage-entry ID. A comparison variant that changes stats, setup
effects, Inner Way rules or conditions, or the timeline rebuilds the schedule.
This deliberately includes indirect Affinity changes such as Momentum formulas
instead of trying to infer dependencies from field names. Only variants that
cannot alter per-hit outcomes, such as current attunement-only variants, reuse
the baseline schedule. The baseline result also exposes the arithmetic mean
of Hawkwing's expected pre-hit stack values across ordinary damage actions for
the DPS summary. Delays, healing, and replay damage do not enter that display
average. Each ordinary damage action also exposes its expected pre-hit stack to
the timeline as a synthetic Hawkwing buff plate. Because that plate represents a
probability-weighted state rather than a concrete timed buff, it appears only
when the expected stack is above zero and its tooltip displays only the average
stack, without a remaining duration. Simulation runs do not use this probability
schedule and maintain their own sampled stack state.

Outcome mechanics are separated by responsibility. `hawkwing.ts` owns
Hawkwing's stack/expiry distribution and setup-effect parsing;
`insightfulStrike.ts` owns Focus decay, Concentration conversion, and its Inner
Way trigger parsing. `outcomeTriggeredBuffs.ts` contains only the shared 0.1 ms
clock and schedule primitives. The rotation calculator coordinates the two
mechanics and adds their resolved pre-hit effects to the ordinary unconditional
damage-effect snapshot. This keeps the probability transitions reviewable
without placing game-specific state machines inside the damage formula.

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
Effect resolution follows `rawStats → stats → buffedStats → skillStats →
actionStats`, as specified in [Stat snapshot pipeline](stat-pipeline.md).
The worker receives the complete sheet; variants apply contribution deltas to
a copy. Selected global stat contributions form the next baseline. Skill-tag
rules are cached per signature. Only timeline-dependent buffs, debuffs,
resources, HP/Qi state, distance, and action modifiers require hit-time context.

Unconditional finite numeric fields from tracked buffs and debuffs are split
from their definitions and maintained as a timeline-state aggregate at effect
lifecycle transitions. Damage contexts carry the aggregate separately, while
conditional or dynamic rules remain in the regular effect list. This removes
stable tracked-effect field probes from each hit without tying the reusable
timeline to a particular character-stat baseline.
Setup and Inner Way stat or damage fields with requirements limited to action
tags and the equipped martial-art pair are additionally cached per effective
action-tag signature while damage entries are built. Stat fields produce the
skill-static stat and derived-stat snapshot; numeric damage fields join the
aggregate. State-dependent rules and non-stat residual fields remain in the
per-hit list. Multi-action component tags therefore receive independent cache
entries instead of inheriting the displayed parent skill's tags.
Derived remainder rows reconcile unclassified work without adding nested replay
measurements twice under their listener parent. Timeline queue ordering,
effect-trigger evaluation, and active-effect resolution retain their own call
counts. The collector is gated by `import.meta.env.DEV`; production workers
bypass collection and do not log benchmark output.
The development table reports skill-static cache misses separately, then splits
the remaining damage-effect aggregation into aggregate initialization, the
residual per-hit scan, and dynamic-value resolution nested within that scan.

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
in. Rain Whisper also opts in because its Critical Healing bonuses can change
overhealing and healing-triggered events. Every
replacement timeline resolves its own start anchor and duration for DPS; only
timeline-reusing variants share the baseline duration.

Setup comparison bundles omit the currently selected arsenal, bow/ring set,
food, Divinecraft, global-effect state, and Bitter Seasons tier. The Main tab
already renders those choices as active, so calculating an identical baseline
variant would only produce a redundant zero-difference result. Weapon and armor
set comparison generation likewise omits the currently selected tier.

Each priority row stores absolute and percentage changes for both DPS and HPS.
The Stats Priority panel has a local Max / Relayed / Max + Relayed display mode,
defaulting to Max. Relayed rows linearly scale the cached Max roll, DPS/HPS delta,
and both percentage changes by the shared `relayedAffixMultiplier` (currently 0.94).
These are predictions, not recalculated variants; the mode is not part of
worker requests or calculation fingerprints. Combined mode ranks separate Max and
Relayed rows together, marking only Relayed affix names with the Build tab's up-arrow
icon rather than text labels. Attunement and Inner Way priorities are unchanged.
All priority rows sort by DPS change first and use HPS change as the tie-breaker.
Character-stat and attunement priorities use descending order. Inner Ways are
removed, so their rows use ascending order to show the largest lost DPS first,
then the largest lost HPS when DPS changes are equal.
Character and attunement priority variants are generated only for fields visible
under the current weapon/path selection. In particular, Art of Heng/Mo follows
the selected weapon families and non-Mixed attunement priority keeps the two
shared Weapon entries plus matching path-tagged armor entries.

## Result publication

Each public baseline result contains:

- `RotationMetrics`
- baseline timeline
- anchor time and duration
- per-action breakdown map containing damage and, for heal actions, healing

The centralized rotation breakdown also reports Buff Coverage and Debuff
Coverage for effect definitions marked `showCoverage`. Average stacks are
action-weighted: their denominator contains only resolved, non-replay damage and
healing actions with non-zero output. Delays, movement, resource changes,
applications, replay damage, and other actions that cannot be affected by
tracked effects do not affect that average. A debuff additionally reports
elapsed-time coverage when its definition has `shared: true`; tracked
application and expiration timestamps are clipped to the resolved fight window
and overlapping refresh intervals are counted once.

The Main-tab DPS panel derives Graduation Rate from the current DPS divided by
the highest DPS among the path's `graduated` build presets under the same
rotation, breakthrough, food, Divinecraft, Script, and global buff/debuff
state. Every configured preset is calculated through the ordinary deterministic
worker pipeline, and the maximum completed baseline becomes the denominator. A
fingerprint of that environment, the path, the graduate preset IDs, and active
skill overrides keys the existing bounded baseline cache. A new environment
schedules the required baseline calculations; build-only changes reuse the
cached denominators. No Monte Carlo simulation is involved.
`data/path.json` declares `defaultBuild` and a `graduated` preset array
separately so the build loaded by default does not have to be one of the builds
used as graduation denominators.

The Rotation Editor retains its complete last-built timeline, including generated
rows and calculated values, while a new draft is pending. `editorTimelinePreview.ts`
maps retained controls to the latest draft step identities; removed steps become
read-only until the replacement arrives. Repeated field edits preserve that identity.
Only the initial load uses authored placeholders. A status notice marks stale values.
After a 100 ms debounce, the existing deterministic worker calculates a complete
baseline directly from authored input. Results
are accepted only for the same rotation ID, combat-context key, and draft object
revision. A new edit cancels that editor's queued or running structural request;
unrelated queued work remains scheduled. Saving and further edits do not wait for this request. Results never
replace draft steps or remap editing state. Unreached steps after Battle End remain
editable placeholders without expanded combat actions.
The worker retains up to eight complete preview baselines, keyed by the normalized bundle
fingerprint, for one-use reuse by the following baseline request without recalculation. Superseding
busy work still terminates the worker; an idle worker retains this cache.
Calculated state and action damage are overlaid only for a matching fingerprint;
the previous aggregate totals may remain visible while recalculation is pending.
Base skills have collapsible action groups. Except for data-defined Inner Way
damage groups, triggered skills and DOTs do not add skill rows; their damage actions inherit the originating base skill's expansion
state and contribute to its displayed damage total. A DOT application records
that source cast, and a later refresh or extension transfers all subsequent ticks
to the cast that performed it. Nested DOTs inherit the original base cast.
Fivefold Bleed and Morale Chant instead appear in top-level Inner Way groups;
expanding an attack never reveals their actions or includes them in its damage.
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
- twenty martial-art IDs across Heng Blade, Mo Blade, Sword, Spear, Umbrella, Fan, Rope Dart, Gauntlet, and Dual Blades weapon families
- 56 catalog Inner Ways, including four Draught definitions with T2/T5 raw-stat effects; see the coverage notes in `skill-data.md`
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
rotation or trigger actions. A new editor category also requires an import, a
`defaultSkillMaps` and `skillDataNamespaceByCategory` entry in
`src/application/gameData/skills.ts`, and a `selectableRotationSkillGroups`
entry in `src/application/characterComposition.ts` so it reaches the rotation
step picker.

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

### Breakthrough

Add a complete breakthrough entry to `data/breakthrough.json`. Each entry combines
an `EnemyProfile`, a `levelBonusStats` effect, `soloLevel`, and `martialArtTalentRank`. The Main-tab selector reads the
entry keys, while its detail block above Inner Ways shows the level bonus and enemy
properties. Breakthrough is transient Main-tab state and is intentionally not
part of build data, character profiles, or browser storage.

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

Update `data/system.json`. Keep innate values under `baseStats`, every Enhancement bonus under its own ordered
`enhancementStats` entry, every talent grant as its own ordered
`talentStats` entry, and every regional Oddity reward
under its own ordered collection such as `qingheOddityStats` or
`kaifengOddityStats`. Express base-attribute relationships under
`baseAttributes` by nesting each target stat and its multiplier under the
source base attribute, for example `"power": { "minPhys": 0.22 }`.

### Weapon or primary path

Add the path metadata to `data/path.json`. Every path declares an explicit
`status` and `buildGroup`; the latter names its directory under `data/build/`.
A path can also declare a shared `tag` and a fixed `[left, right]`
`lockedWeapons` pair; paths without a weapon lock
allow either martial art in either slot. New weapons still require changes to
`WeaponId`, settings validation, martial-art imports, attunement matching, and
`mainAttributeForWeapons()` in `effectiveStats.ts`. Each martial-art JSON definition declares its
physical weapon family and a shared `tag`; Art-of field visibility is derived
from the weapon family, while attunement and set eligibility use the tag.
The `status` value is one of `available`, `wip`, `devOnly`, or `plannerOnly`.
Only `available` paths are enabled without the header-level Dev toggle. WIP paths
remain visible with a WIP badge. Dev-only paths carry a Dev badge and support
unrestricted test combinations. Planner-only paths indicate that their
martial-art pair and build-planner surfaces are registered but their combat mechanics
are not implemented. Planner-only
paths remain visible, carry a Planner Only badge, and are disabled until Dev mode
is enabled. Bellstrike Splendor and Umbra, Silkbind Jade, and Bamboocut
Draught currently use this state. Dust is WIP: its editor catalogs and Inner Way
rules are registered, and its default rotation uses explicit unresolved timing fallbacks. Deluge is available. Their fixed martial-art pairs and physical weapon
families are available to Settings and Build. Planner-only status does not imply
that all supporting data is absent: talents and attunements may already be
registered while combat skill definitions remain incomplete. See the martial-art
talent and attunement audit documents for their implementation status. Mixed is the final
selector option and is Dev-only. Kite and Wind are available without Dev mode.

Stored universal build and rotation records created before either planner-only
martial-art expansion contain one of the previous complete martial-art ID sets.
Shared weapon-ID normalization recognizes those exact legacy universes and
expands them to the current list, preserving those records as universal across
upgrades.

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

- `App.tsx` is now the composition shell. The calculation engine and the
  `buildPresetRotationBundle` service remain pure and worker-safe; the cohesive
  Rotation Editor owns the editor-specific state and timeline interactions.
- Skill Editor skill, buff, debuff, and DOT overrides are saved for the session
  and composed over the default combat maps used by the calculator and
  simulator. Buff/debuff effect arrays and cumulative stack tiers use the same
  structured rule controls as skill actions and modifiers, including
  requirements and object-valued effects. Effective definitions participate in
  calculation fingerprints, so saving or resetting an override cannot reuse a
  stale baseline or comparison result.
  The existing storage key now contains a `{ version: 3, overrides }` envelope. Older segment thresholds migrate from
  inclusive to exclusive bounds using the next representable number, preserving
  saved calculation behavior. Authored tables default to `LowerBoundInclusive` (exclusive upper bounds);
  `mode: "UpperBoundInclusive"` selects inclusive upper bounds explicitly.
  Version-3 overrides preserve either mode without threshold migration.
  Legacy unwrapped overrides copy `phyCoef` into missing damage `attrCoef` or
  healing `silkbindCoef` fields on load. Versions 2 and 3 preserve intentionally omitted
  coefficients as zero, including physical-only damage actions.
- Manual event definitions and supported weapons are hard-coded.
- Primary-attribute damage resolution supports the registered Stonesplit and
  Bamboocut martial arts, but Void/Formless Attack folding currently remains
  Stonesplit-only.
- DMG Bonus Category 2 is specified but not implemented.
- Release deployment runs deterministic DPS snapshot checks for every non-empty preset,
  including WIP paths. Ordinary builds run preset, localization, behavioral-test, type, and
  production-bundle verification without the accepted-snapshot comparison.
  A DPS change of 1% or more in either direction requires review before release; see
  [DPS snapshots](dps-snapshots.md). Focused probes cover individual mechanics.

### Rotation editor calculation lifecycle

Editing any rotation calculates and caches only that rotation's baseline
timeline, expected damage, DPS, and action breakdowns. Saving requests
comparisons only when the edited rotation is active. Making an inactive rotation
active reuses its valid baseline cache and requests comparisons.

When character stats, attunements, Inner Ways, food, Divinecraft, build, breakthrough,
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

Every production build embeds a unique version and emits the matching
`version.json`. Visible sessions check it once a minute and when focus,
visibility, or connectivity returns, using uncached requests. A non-blocking
notice asks users to save unfinished edits with the existing Save controls and
then reload. Reload is always explicit; it neither saves drafts nor clears
browser storage. A cache-busting navigation requests the current entry page.
Development-server sessions do not poll for releases.

`src/notices.ts` owns the shared, in-memory notice list. The header's `NoticeArea`
renders it as an absolutely positioned overlay to the left of Language on wide
screens, and below the controls on narrow screens or mobile. The controls provide
its positioning anchor; adding or dismissing notices never changes header or page
layout. It is a non-blocking panel with a viewport-bounded scroll limit and individual
dismiss buttons. Source IDs replace an earlier message from the same operation while
unrelated notices coexist. Update/module-load notices, profile and rotation
transfer results, build/dashboard/image import failures, save confirmations, and
calculation/simulation failures all publish through this store. Field validation and ongoing
progress remain next to their inputs. Notices survive tab changes but are not
persisted across page reloads. Dismissing an update does not cause every periodic
check to announce it again. Message keys are resolved at render time for update
notices; operation-specific error text is captured when the operation finishes.

The same notice handles Vite import failures without claiming every network
failure is a deployment. Boundaries around lazy Build and Simulation features
keep an import rejection from unmounting the app and its rotation editor.

The Pages workflow carries hashed `assets/` files forward for seven days after
they leave the current build. The deployed `asset-history.json` records current
assets with a null deadline and retired assets with an absolute expiry; later
deployments do not extend that expiry. Retention reads the live site's inventory
and files, so it does not depend on Actions artifact lifetime. The initial rollout
bootstraps from the last successful release's Pages artifact, before an inventory
exists. Missing required old files or inventory failures stop deployment rather
than silently dropping retained assets. Only assets are carried forward; HTML,
version metadata, and public locale files always come from the new build.
Expired assets are omitted at the next deployment. Tabs older than the retention
window may need the reload fallback. Already-open versions predating the notice
cannot display it until their first reload, though their retained chunks work.

```text
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` performs TypeScript project compilation followed by a Vite
production build into `dist/`. No API keys, database, server process, or runtime
configuration are required for GitHub Pages hosting.

### Preset DPS regression gate

The exported `buildPresetRotationBundle` in `src/application/graduation.ts` builds a selected preset
using the same setup, gear, stats, definitions, and timeline inputs as the
Graduation comparison. `buildGraduationBundleSet` resolves every preset in the
path's `graduated` array, and `selectHighestGraduationResult` chooses the
highest DPS result as the denominator. The headless DPS snapshot runner instead
supplies its default build ID and explicit environment settings. Both use the
centralized rotation calculator. The Pages
workflow runs `npm run test:dps` before deployment; ordinary build, test, and
watch commands exclude that release comparison.
See [DPS snapshots](dps-snapshots.md) for coverage and the review/update workflow.

### Chronological healing and cast snapshots

`createTimelineEntryBuilder` supplies the same action contexts to ordinary damage
reporting and the live healing traversal. A worker-local `TimelineActionResolverFactory`
creates one outcome resolver for the combat traversal. Accepted damage, healing,
and accumulator-application actions resolve in event order; healing immediately
restores self HP and feeds the existing accumulator, and generated Qi Blades re-enter
that same traversal. Final reporting aggregates those resolved actions, including
sampled outcomes. Replay damage also resolves in the live traversal.

Accumulator threshold coefficients live in buff data. WTS snapshots buffed Physical
and Silkbind attack at its own application, including current Hawkwing/Etherwrath
bonuses; the tracked buff retains `accumulatorThreshold` for that activation.
Each recast snapshots again. Expected Hawkwing stacks approximate the threshold;
sampled runs use actual stacks. Hawkwing now declares `altersTimeline` because its
attack bonus affects both healing and WTS conversion. No nearby damage/healing
entry is used as a substitute cast context.

Battle-start detection and pending silent charges never restart the traversal.
Sampled damage and proc draws interleave in live execution order.
The callback is never part of a serialized bundle. `npm run test:wts` verifies cast
ordering, buff changes, recasts, food, proc feedback, and periodic heals created after
Qi Blades, alongside the existing healing checks.

## Damage recording windows

Timed recording effects use the existing event queue and expiry scheduling.
Expiry and reapplication share one resolver; activation IDs reject stale expiry
events. A window stores damage-entry references, and the shared replay calculator
resolves their sum from the current expected or sampled run. Recording-dependent
calculations use the live combat traversal, also used for healing and accumulator
snapshots, so settlement affects target HP before subsequent actions. Comparison
variants rebuild that traversal and resolve their own source damage. Runtime
recording IDs and source references are not persisted in user rotations.

### Attack-aligned casts

Successful Deflect uses the data-defined `attackResponse.endMargin: 0.1` margin.
The ordered scheduler waits so its cast ends 0.1 seconds after the next manual
or dummy attack, subject to previous cast completion and cooldown readiness.
When those constraints force a later start, its end can also be later.
Without a next attack before Battle End, it follows normal ordered timing.
The existing automatic Delay mechanism represents both cooldown and attack waits
as read-only timeline output, removed at storage/import boundaries. Deluge presets
use this alignment for Successful Deflect. The two WTS presets retain a 0.4-second
authored delay before the opening World to Sword to coordinate its healing arrivals
with Qi Blade's launch cooldown. Their Qi events remain attached to actions near
the reviewed encounter times.

Composite release readiness holds a silent charge open while the live event loop
processes regeneration and pending events. It then finalizes the displayed charge
interval without replay; weapon switching occurs at the earliest possible start.
See `rotation-event-loop.md` for pending-charge execution and `skill-data.md`
for the Vile Condemned three/four-HW variants.

Attack responses share the timeline readiness queue with cooldown waits. Data-authored
response windows are independent of blocking cast duration; incoming hits dispatch
success effects through the existing triggered-skill executor at attack time.
See `doc/rotation-event-loop.md` for reservations, canceled-window overlap,
causal ordering, and preserved defensive weapon context.

Defense uses the shared response windows with success on every incoming hit.
Its optional rotation-step duration overrides base cast time only when the skill
declares `editableCastTime`; the worker resolves the hold and all success effects.
Defense omits automatic attack alignment, so its entered duration occupies the
ordered timeline from cast start. The editor reuses its duration control and does
not calculate defensive rewards or hold timing independently.

Stat-only comparisons that reuse a baseline timeline retain its resolved action
IDs. Conditional or cooldown-blocked actions remain absent; only a rebuilt
combat timeline can introduce a newly eligible action.
