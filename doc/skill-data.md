# Skill and combat-effect data

Combat data is split by responsibility:

- `data/skill/`: castable and triggered skills
- `data/dot/`: damage-over-time definitions
- `data/buff/`: player effects
- `data/debuff/`: target effects and manual encounter states
- `data/innerway/`: cumulative tier effects, triggers, and modifications
- `data/martial-art/`: weapon talent arrays
- `data/rotation/`: default rotation records
- `data/divinecraft.json`: selectable Divinecraft setup effects and availability

Maps use stable internal IDs as keys. References such as `trigger.value`,
`apply.value`, and `modify.target` must use those IDs. User-facing text belongs
in `name` and `description`.

## Separation of behavior

The model separates three moments:

1. A skill's `modifier` is checked when its cast starts. It can change cast and
   action timing or provide a cast-wide effect.
2. A skill's ordered `action` list creates events on the global timeline.
3. Buff, debuff, setup, and Inner Way effects are resolved from the state that
   exists when each action occurs.

An action that applies or consumes an effect changes later timeline state. The
state snapshot used by that action is captured before the action is executed, so
an on-damage trigger does not retroactively affect the hit that caused it.

## Skill definition

```ts
type SkillMap = Record<string, SkillDefinition>;

type SkillDefinition = {
  name: string;
  shortName?: string;
  castTime: number;
  cooldown?: number;
  action: SkillAction[];
  modifier: SkillModifier[];
  tags: string[];
};
```

`shortName` is optional presentation metadata. Skill lists, selectors, timeline
rows, and breakdowns display it as `Long Name (Short Name)` without changing the
stable skill ID used by rotations and trigger actions.

Actions must be listed in nondecreasing `time` order. Equal times are valid and
array order breaks ties. Triggered events inherit a causal ordering so their
zero-time actions run before the next unrelated cast at the same timestamp.

Current tag conventions include:

- `DirectDamage` for direct-damage skills
- `DOT` for DOT definitions
- `Triggered` for skills that can only be inserted by a `trigger` action; these
  skills are excluded from the Rotation Editor's castable skill dropdown
- `MartialArts` for the All Martial Arts bonus
- `Mystic` for breakdown grouping
- weapon, move, and behavior tags such as `SnowpartingBlade`, `MoBlade`,
  `VariedCombo`, `BurningHeart`, `AnxiSoldier`, and `TriggerAnxiSolder`

Tags are exact, case-sensitive strings. `MartialArts` is intentionally distinct
from the older `MartialArt` tag used by some attunement matching.

## Actions

All normal skill actions have a numeric `time` measured from cast start and may
have a `requirement` array. Inner Way trigger actions execute at the triggering
damage event and may omit `time`.

### Damage

```json
{
  "type": "damage",
  "phyCoef": 1.2338,
  "phyBonus": 342,
  "attrBonus": 186,
  "time": 0.7
}
```

`phyCoef` drives physical and all four attribute paths. `attrBonus` is used only
by the equipped weapons' primary attribute. See `damage-formula.md`.

### Apply

```json
{
  "type": "apply",
  "target": "self",
  "value": "InnerPassion",
  "stack": 3,
  "duration": 10,
  "reapply": true,
  "time": 2.083
}
```

- `target: "self"` creates or updates a buff.
- `target: "target"` creates or updates a debuff or starts a matching DOT.
- `stack` defaults to one and is capped by the resolved definition's `maxStack`.
- `duration` overrides the definition duration. No duration means the state does
  not expire.
- Reapplying a normal tracked effect adds stacks and refreshes its expiration.
- Effect-definition cooldowns can reject an application until the cooldown ends.

An Inner Way trigger can grant conditional extra stacks:

```json
{
  "type": "apply",
  "target": "self",
  "value": "YiRiver",
  "stack": 1,
  "additionalStack": {
    "requirement": [
      { "target": "target", "value": "Controlled" },
      { "target": "self", "value": "MoraleChantT3" }
    ],
    "stack": 1
  },
  "reapply": true
}
```

### Consume

```json
{
  "type": "consume",
  "target": "self",
  "value": "Forgetfulness",
  "stack": 1,
  "time": 0
}
```

Consumption occurs at the declared action time. The default amount is one. A
`first` operator consumes the first available name from a left-to-right list:

```json
{
  "type": "consume",
  "target": "self",
  "value": {
    "operator": "first",
    "operand": ["InnerPassion", "ChargeEnhancement"]
  },
  "time": 0.4
}
```

### Trigger

```json
{
  "type": "trigger",
  "requirement": [
    { "target": "self", "value": "IronGuard" }
  ],
  "value": "AnxiSoldierSnowbreakSpring",
  "time": 0.867
}
```

The referenced skill is inserted at the action timestamp. Triggered skills do
not consume rotation cast time. A skill-level `cooldown` prevents both casts and
triggers while active; a prevented cast is removed and later ordered casts shift
earlier by its cast time.

### Extend

```json
{
  "type": "extend",
  "target": "target",
  "value": "Dread",
  "duration": 2,
  "time": 1.883
}
```

`duration` is the amount added to the existing expiration time. Missing,
permanent, or already-expired states are not extended.

### Clear cooldown

```json
{
  "type": "clearCD",
  "target": "self",
  "value": "Forgetfulness",
  "time": 0.867
}
```

This clears the named effect/application cooldown at that timestamp.

## Requirements

A requirement array is an implicit AND group:

```json
"requirement": [
  { "target": "self", "value": "FrostCladNightT6" },
  { "target": "target", "value": "Exhausted" }
]
```

Supported targets are:

- `self`: an active player buff or selected Inner Way tier condition
- `target`: an active target debuff
- `skillTag`: a tag on the skill being evaluated
- `martialArt`: one of the equipped weapon IDs, currently `snowparting` or
  `phalanxbane`

For tracked effects, optional `stack` means at least that many stacks. The value
`"max"` means the tracked stack count must have reached its resolved maximum.

OR uses an explicit operator. An array nested inside `operand` remains an AND
group:

```json
{
  "operator": "or",
  "operand": [
    [
      { "target": "skillTag", "value": "Light" },
      { "target": "skillTag", "value": "VariedCombo" }
    ],
    { "target": "skillTag", "value": "AnxiSoldier" }
  ]
}
```

This means `(Light AND VariedCombo) OR AnxiSoldier`.

## Modifiers

Modifiers are selected from the state at cast start:

```json
"modifier": [
  {
    "requirement": [
      { "target": "self", "value": "Forgetfulness" }
    ],
    "effect": {
      "castTimeModifier": -0.667,
      "castTimeMultiplier": 0.8
    }
  }
]
```

Cast time and every numeric action time are transformed with:

```text
adjusted time = max(0, original time + sum(castTimeModifier))
              × product(castTimeMultiplier)
```

A modifier `duration` can override the duration of effects applied by that cast.
Modifiers do not consume states; use a timed `consume` action for consumption.

## Buff and debuff definitions

```json
{
  "MountainSplitter": {
    "name": "Mountain Splitter",
    "description": "Increases Critical DMG for matching skills and applies the guaranteed-critical rule.",
    "duration": 10,
    "cooldown": 15,
    "maxStack": 1,
    "effect": [
      {
        "requirement": [
          {
            "operator": "or",
            "operand": [
              { "target": "skillTag", "value": "BurningHeart" },
              { "target": "skillTag", "value": "AnxiSoldier" }
            ]
          }
        ],
        "effect": {
          "SteadfastGuaranteedCrit": true,
          "critDmgBonus": 0.1
        }
      }
    ]
  }
}
```

Definition fields:

- `name` and `description`: rotation display and hover text
- `duration`: default lifetime; omission means permanent
- `cooldown`: minimum time between accepted applications
- `maxStack`: stack cap
- `effect`: action-time effect rules
- `stackEffects`: cumulative effect rules indexed by current stack count
- `shared`: descriptive game metadata; it does not currently change simulation
  behavior

When `stackEffects` exists, index `stack - 1` is selected instead of `effect`.
Each index must contain the complete cumulative value for that stack; entries are
not added together. If another feature raises `maxStack`, enough `stackEffects`
entries must already exist for the larger cap.

An effect entry should canonically use `{ "requirement": [...], "effect": {...} }`.
Unwrapped effect objects are also accepted by the current evaluator.

## Modifying an effect definition

Inner Ways and setup data can modify a named buff or debuff:

```json
{
  "target": "ThroatPierced",
  "modify": {
    "duration": 15,
    "maxStack": 5
  }
}
```

Scalar definition fields override the base definition. A `modify.effect` array
is appended to the base `effect` array rather than replacing it. Requirements on
the modification are checked before it is applied.

## Inner Ways

Inner Way files contain a display `name`, path eligibility `tags`, and an
`effect` map keyed by tier ID:

```json
{
  "name": "Morale Chant",
  "tags": ["StonesplitStrength"],
  "effect": {
    "MoraleChantT0": {},
    "MoraleChantT1": {},
    "MoraleChantT2": {
      "effect": [
        { "stat": { "minPhys": 24.8, "maxPhys": 49.6 } }
      ]
    }
  }
}
```

When a selected path declares `tag`, the Inner Way selector and
calculation pipeline include only definitions whose `tags` contain that value.
Mixed has no required tag and therefore exposes every imported Inner Way.

Gear sets use the same path-tag convention in `data/gear-set.json`. Only
matching definitions are displayed and applied outside Mixed; stored tiers for
hidden definitions are preserved.

Selecting tier `Tn` activates every tier condition and rule from T0 through Tn.
Tier entries may contain:

- `effect`: passive stats, conditional action effects, or `target`/`modify`
- `trigger`: reactive actions evaluated on each damage action

Reactive trigger example:

```json
{
  "target": "self",
  "requirement": [
    { "target": "skillTag", "value": "DirectDamage" },
    { "target": "self", "value": "YiRiver", "stack": 5 }
  ],
  "action": [
    { "type": "trigger", "value": "MoraleChant" }
  ]
}
```

Rules are processed in tier order on a damage event. Therefore an earlier-tier
trigger can apply a stack before a later-tier trigger checks the stack count on
the same event.

## Stat and effective-stat effects

`stat` changes the base character object before effective values are calculated.
`effectiveStat` changes only the effective calculation and does not alter the
editable base value.

```json
{
  "stat": {
    "minPhys": {
      "formula": {
        "source": "agility",
        "multiplier": 0.264,
        "offset": 0,
        "max": 73.9
      }
    }
  }
}
```

Formula result:

```text
source × multiplier + offset
```

Optional `min` and `max` clamp the result. Optional `round` specifies decimal
places only when game data explicitly requires rounding. Formulas sourced from
base stats run after fixed base-stat effects. A source such as
`effectiveMinStonesplit` runs in a second pass after initial derived stats exist.

Formula-valued action effects, such as talent-added penetration on Iron Guard,
are resolved from the action's current base and derived character state.

## DOT definitions

DOT definitions use the skill shape plus `tick`, `duration`, and `maxStack`:

```json
{
  "ToadVenom": {
    "name": "Toad Venom",
    "tick": 5,
    "duration": 5,
    "maxStack": 1,
    "action": [
      { "type": "damage", "phyCoef": 1.6218, "phyBonus": 232, "attrBonus": 0, "time": 0 }
    ],
    "modifier": [],
    "tags": ["DOT", "Mystic"]
  }
}
```

The scheduler creates ticks at `tick`, `2 × tick`, and so on, including a tick
exactly at the resolved DOT duration. `apply.duration` takes precedence over the
DOT definition and effect definition. A DOT without a resolved duration does not
schedule ticks. DOT rows are interleaved globally with casts and triggered
skills. DOT damage ignores flat physical and attribute bonuses.

For DOT applications, `reapply: false` leaves an active instance unchanged. A
successful reapplication refreshes its expiration while preserving the original
tick cadence. `extend` adds to the current expiration instead. In both cases,
future ticks are associated with the cast that refreshed or extended the DOT.
Regular buffs and debuffs always refresh their duration when successfully
reapplied.

## Rotation records and events

```ts
type RotationRecord = {
  name: string;
  eventTimeReference?: "battleStart";
  steps: Array<
    | { type: "skill"; skill: string }
    | { type: "event"; event: "Exhausted" | "Controlled" | "BattleEnd"; startTime: number; duration?: number }
    | { type: "event"; event: "Move"; startTime: number; distance: number }
  >;
  start?: { step: number; action?: number };
};
```

Skill steps are placed sequentially by effective cast time. With
`eventTimeReference: "battleStart"`, every event `startTime` is relative to the
selected fight start and events consume no cast time. Pre-start cast-time changes
move the events with the anchor. `Exhausted` uses its definition's 10-second
duration. `Controlled` defaults to three seconds and the rotation event's
editable `duration` overrides it. `BattleEnd` has no action and excludes damage
ordered after it; it also fixes the rotation duration at that timestamp.
The Rotation Editor skill selector offers skills from the currently selected
weapon categories plus Mystic and General. Triggered skills remain excluded.
An existing step from another martial art is preserved and marked unavailable
until the user replaces it or restores a compatible weapon selection.
Distance starts at 1m. A `Move` event changes it to its integer `distance` from
that event onward. Timeline rows store cast-start distance, while every action
stores its own distance snapshot so an event interleaved with a cast affects only
the later actions.

Bundled mixed-dummy rotations include fight-relative movement events for Flute
distance modeling. They open at 19m, enter the first Fleeting Trace at 3m, then
return to 1m. Every Burning Heart cast moves to 6m for its first Anxi Soldier,
4m for its second Anxi Soldier, and 2m for its first damage action; consecutive
Burning Heart sections reset to 1m after their final cast.

### Dynamic effect values

An effect value can select from a data array using the current timeline state:

```json
{
  "function": "by",
  "param1": "distance",
  "param2": [0.02, 0.03, 0.04]
}
```

`by` treats distance as a one-based integer index. Values below the first index
use the first entry, and distances beyond the array use the last entry. Flute
uses this form for its distance-based `dmgBonus`.

The optional start record identifies the default rotation step and action used
as time zero. In memory, the UI converts this to a timeline row ID and optional
action index. Omitting `action` means the skill's cast start; providing it means
that exact zero-based action index. Base-skill damage actions are collapsed in the Rotation Editor by
default and can be revealed per skill. A triggered skill does not receive its
own row; its damage actions are associated with the base skill that caused the
trigger and follow that base skill's expand/collapse state. DOT damage is
associated with the cast that applied it; future ticks transfer to a cast that
refreshes or extends it. DOT ticks follow that owning base skill's expansion
state, including nested DOT applications such as Lesser Toad Venom. The base
skill containing the starting action opens initially, and that action remains
visible if the skill is collapsed. Preset rotations render skill names and event times as plain
labels; custom rotations render editable selectors and inputs. Pre-start
actions remain visible when their row is expanded,
but their damage cell is empty.

### Readable rotation format

The Rotation Editor's Readable Format dialog renders the effective base-skill
sequence as `Short Name > Short Name > ...`; a skill without `shortName` falls
back to its long name. The native modal dialog makes the editor inert until the
dialog is closed and provides both selectable text and a Copy button.

- The starting skill uses `(start)`, or `(start at hit N)` when the anchor is a
  damage action. Hit numbers are one-based and count damage actions only.
- A skill containing an `Exhausted` event, or carrying `causesBreak`, uses
  `(break)`.
- Skills before the fight anchor use `at N`, where `N` is seconds before start
  rounded to the nearest 0.5 seconds.
- Starting status takes precedence over break status, which takes precedence
  over the pre-fight countdown.

### Rotation export and import

The Rotation Editor sidebar exports all custom rotation records as a formatted
JSON file with the `where-builds-meet-rotations` format identifier and schema
version 1. The snapshot includes the current in-memory editor value, even before
the Save button is pressed. Bundled default rotations are discovered from
`data/rotation/**/*.json` and reconstructed from their JSON sources rather than
saved in session storage or exports. They are read-only in the editor; Duplicate
creates an editable custom copy.

Import validates every step and appends custom rotations to the current session
without replacing existing rotations or changing the active rotation. ID
collisions are remapped, and bundled default rotations are skipped to prevent
duplication. The first imported rotation is opened for review but is not made
active automatically. Importing the same file again creates another independent
copy of its custom rotations.

## Data conventions

- Use decimal ratios for percentages.
- Keep IDs stable and put display text in `name`/`description`.
- Use `action` for timeline changes and `modifier` only for cast-start changes.
- Keep action times ordered and represent repeated casts as repeated rotation
  steps.
- Use `duration` for lifetimes and extension amounts; do not use `extension`.
- Prefer explicit requirements over hard-coded skill-ID checks.
- Give every direct skill `DirectDamage` and every DOT definition `DOT`.

Divinecraft definitions use the same direct setup-effect shape as food and set
effects. Percentage values remain decimal ratios. `hpDMGBonus` is active;
`qiDMGBonus` and a `trigger` with `event: "healing"` are currently stored for
future implementation and intentionally ignored by the calculation engine.

Envigorated Warrior's `healingBonus` is stored alongside its active `dmgBonus`
for data completeness; healing is not currently simulated.

## Skill Editor categories

The Skill Editor exposes one martial-art category for each unique currently
selected weapon, followed by the always-visible Mystic, General, Buff, Debuff,
and DOT categories. Skill and DOT records use the structured action
and modifier editors. Buff and debuff records expose their descriptive and
timing fields plus structured effect-rule editors. Each effect rule supports
requirements, direct or wrapped effect fields, numeric and boolean values, and
parameter-based object values such as Flute distance scaling. Cumulative
`stackEffects` remain grouped by stack tier and each tier contains the same
structured effect-rule editor. Editor overrides last for the browser session
and do not currently replace the default combat maps used by rotation
calculations.
