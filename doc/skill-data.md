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
- `data/script.json`: selectable Script effects, threshold requirements, and timeline triggers

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

On-hit bonuses belong in effect rules rather than skill modifiers. For example,
Frost-Clad Night T4 checks Inner Passion or the T6 Exhausted condition against
Snowbreak Spring's state at each damage action, not at cast start.

An action that applies or consumes an effect changes later timeline state. The
state snapshot used by that action is captured before the action is executed, so
an on-damage trigger does not retroactively affect the hit that caused it.

## Skill definition

```ts
type SkillMap = Record<string, SkillDefinition>;

type SkillDefinition = {
  name: string;
  shortName?: string;
  group?: boolean;
  castTime: number;
  cooldown?: number;
  cooldownGroup?: string;
  cooldownUses?: number;
  action: SkillAction[];
  subAction?: Array<{
    value: string | string[];
    requirement?: Requirement[];
    fallback?: string | string[];
  }>;
  modifier: SkillModifier[];
  tags: string[];
  martialArt?: WeaponId;
  weapon?: WeaponFamily;
};
```

`shortName` is optional presentation metadata. Skill lists, selectors, timeline
rows, and breakdowns display it as `Long Name (Short Name)` without changing the
stable skill ID used by rotations and trigger actions.

`group: true` marks healing actions that affect every member represented by the
rotation's `groupSize`. Reported healing is multiplied by that recipient count,
and the healing breakdown counts one heal per recipient, while Self HP receives
only one copy. Its teammate copies contribute one-fifth of their healing to
World to Sword. A single-target heal assigned through a `player` effect
contributes its full healing instead.

Actions must be listed in nondecreasing `time` order. Equal times are valid and
array order breaks ties. Triggered events inherit a causal ordering so their
zero-time actions run before the next unrelated cast at the same timestamp.

Current tag conventions include:

- `DirectDamage` for direct-damage skills
- `DOT` for DOT definitions
- `Triggered` for skills that can only be inserted by a `trigger` action; these
  skills are excluded from the Rotation Editor's castable skill dropdown
- `SubAction` for component skills referenced by another skill's `subAction`
  list; these are also excluded from the Rotation Editor dropdown
- `MartialArts` for the All Martial Arts bonus
- `Mystic` for breakdown grouping
- weapon, move, and behavior tags such as `SnowpartingBlade`, `MoBlade`,
  `VariedCombo`, `BurningHeart`, `AnxiSoldier`, and `TriggerAnxiSolder`
- `MartialArtEffect` for secondary martial-art effects such as Falcon, Vile
  Condemned, and Anxi Soldier damage

Tags are exact, case-sensitive strings. `MartialArts` is intentionally distinct
from the older `MartialArt` tag used by some attunement matching.
Use `VariedCombo` for every varied-combo skill tag and requirement.
Every `Falcon` skill also carries `MartialArts`, including triggered Falcon
attacks, so All Martial Arts bonuses apply consistently.

Requirement conditions with `"target": "martialArt"` use the same canonical
martial-art tag stored in `data/martial-art/*.json` and on that art's skills—for
example, `SnowpartingBlade` or `PhalanxbaneBlade`. They match the action's skill
tags, not the IDs of the currently equipped weapons. This prevents a
martial-art-specific effect from applying to Mystic or another equipped art.

Use `"target": "equippedMartialArt"` with a martial-art ID such as
`heavenwill` when a mechanic depends on the player's equipped pair rather than
the skill currently executing. This requirement checks either equipped slot and
does not depend on their order.

Every castable skill tagged `MartialArts` declares its canonical `martialArt`
ID and physical `weapon` family. At cast start, these fields replace the
timeline's current martial art and weapon. Triggered martial-art component
skills omit both fields so they inherit state instead of switching it. General
and Mystic casts leave both values unchanged. Requirements can inspect the
state with `currentMartialArt` or `currentWeapon`.

## Actions

All normal skill actions have a numeric `time` measured from cast start and may
have a `requirement` array. Inner Way trigger actions execute at the triggering
damage event and may omit `time`. An action stored on a buff or debuff
definition may instead use `"time": "expire"`; it runs only when that exact
application expires. Refreshing the effect invalidates the previously scheduled
expiry action and schedules it for the refreshed expiration time.

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

### Heal data

A healing action uses the same coefficient fields and timing as a damage action,
but declares `"type": "heal"`. It resolves Physical and Silkbind healing at
the action time and contributes to total healing and HPS without contributing
to damage or DPS. See `damage-formula.md` for the formula and outcome rules.

Healing-over-time skills carry the `HOT` tag. Their later heal actions may
resolve after the skill's cast time so the next sequential cast can begin while
the stored healing sequence continues.

Healing restores missing Self HP at its action time. The amount beyond Max HP
is overhealing and can feed a targeted buff accumulator. World to Sword uses
this mechanism: its buff listens only for the `overheal` event and its Qi Blade
emits `QiBladeCheck` 0.3 seconds after launch so stored overhealing can launch
the next blade as soon as the cooldown is ready. `emitEvent` is an internal
skill action and does not create a general combat-event broadcast.

Each recipient's healing number enters the accumulator separately. Expected
calculations use expected recipient healing, while simulations independently
roll every recipient's healing outcome and uniform `0.92`-to-`1.08` final-healing
fluctuation. Both modes reset accumulated overhealing to zero after
each launch and continue accepting healing during the 0.3-second launch
cooldown. The threshold derives from character-sheet Min/Max Physical and
effective Min/Max Silkbind Attack. For Deluge, Min/Max Void Attack is converted
into the effective Silkbind range before the threshold is calculated.
Combat-time effects and attack multipliers do not alter it.
Both modes enforce the
buff's 12-second lifetime and 20-blade limit. Finite accumulator listeners expose
their remaining successful-trigger budget on the tracked buff for timeline UI;
reaching zero prevents further triggers but does not end the buff early.

Ivorybloom is a Silkbind Deluge weapon set. Its two-piece effect adds 9%
Critical Rate. Its four-piece effect retains that bonus and, while Self HP is
full, adds another 5% Critical Rate plus 15% Critical Healing Bonus and 15%
Critical DMG Bonus. The set is timeline-affecting because its healing changes
can alter World to Sword's Qi Blade schedule.

Panacea Fan's Fourfold Inquiry light-attack chain is stored as four independently
castable stages. Each stage carries the shared `FourfoldInquiry` and `Light`
tags plus its own timing and damage values.
Panacea Fan's Jump Heavy carries the `Heavy` tag, lands at `0.975` seconds, and
retains its full `1.3125`-second cast time.

Intoxicated lasts 30 seconds. Drunken Poet and Dragon's Breath applications use
`reapply: false`, so casts made while the buff is active do not refresh that
expiry; a cast after expiry can apply a new 30-second instance. Drunken Poet is
selected through one- to five-hit composite skills. Each composite conditionally
casts Drunken Poet Drink first when Intoxicated is absent, then checks
Intoxicated again at the start of every requested hit and stops the remaining
components if it expires. The five underlying hit definitions are `SubAction`
components and use their always-Intoxicated timings directly; they have no
runtime cast-time modifier and are hidden from the castable skill list.

```json
{
  "type": "heal",
  "phyCoef": 4.912,
  "phyBonus": 1363,
  "attrBonus": 743,
  "time": 0.975
}
```

An internal targeted event action names only the listeners interested in that
event:

```json
{ "type": "emitEvent", "value": "QiBladeCheck", "time": 0.3 }
```

### Replay

Only a skill tagged `Replayed` may be spawned by a damage-event listener. Its
actions use a fixed coefficient instead of ordinary damage fields:

```json
{
  "type": "replay",
  "coef": 0.13333333333333333,
  "time": 1
}
```

The triggering listener passes `event.damage`; each replay action deals exactly
that final damage multiplied by `coef`. Replay actions bypass the damage formula
and do not emit damage events, preventing recursive replay chains.

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
- `target: "target"` creates or updates a debuff and starts its periodic actions when defined.
- `target: "player"` creates an independently timed buff copy for one player.
  Applications fill self and then teammate recipients up to the rotation's
  `groupSize`; once full, the copy with the earliest expiration is replaced.
- `stack` defaults to one and is capped by the resolved definition's `maxStack`.
- `duration` overrides the definition duration. No duration means the state does
  not expire.
- `reapply: false` leaves an already-active tracked effect unchanged.
- Reapplying a tracked effect adds stacks up to its maximum. Its definition's
  `refresh` field decides whether that application also resets the expiration.
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

Consumption occurs at the declared action time. The default amount is one;
`"stack": "all"` removes every current stack. A
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

Inner-way and setup trigger actions also support direct `consume` actions, so a
damage trigger can remove a status without spawning a helper skill.

By default, `first` is resolved when the consume action executes. Add
`"resolveAt": "skillStart"` to remember the first available operand when the
skill starts and consume only that remembered effect later. If the remembered
effect expires before the consume action, nothing is consumed; the action does
not fall through to another operand. For a multi-action skill, `skillStart`
means the start of the component definition that owns the consume action. This
also lets the following component snapshot its modifiers before a consume
scheduled just after the preceding component's cast time.

### Trigger

```json
{
  "type": "trigger",
  "requirement": [{ "target": "self", "value": "IronGuard" }],
  "value": "AnxiSoldierSnowbreakSpring",
  "time": 0.867
}
```

The referenced skill is inserted at the action timestamp. Triggered skills do
not consume rotation cast time. A skill-level `cooldown` prevents both casts and
triggers while active. An unavailable explicit cast waits until its cooldown is
ready; triggered skills remain rejected while unavailable. Cooldowns are keyed
by `cooldownGroup` when declared and otherwise by skill ID. Separate definitions
with the same group therefore read, consume, and clear one shared window.
`cooldownUses` permits that many casts in the window, which starts with the first
cast. A matching skill modifier may override `cooldown` while its requirements
pass.

The rotation editor materializes each cooldown wait as a protected Delay step with
`automatic: "cooldown"`; these generated steps cannot be edited, moved, or
removed directly and are regenerated whenever the rotation changes.

Timeline rows record whether a trigger came from a skill, setup effect, or Inner
Way. Per-cast breakdowns attribute normal triggered-skill and DOT damage to the
owning explicit cast. Inner Way-triggered damage, currently Morale Chant, stays
in its own skill group. Repeated casts group by skill, sum damage, and average
their individual damage-per-effective-cast-time DPS values. A Deflect immediately
following an explicit skill contributes its effective cast time to that skill's
sample. Skills with no attributed damage, including Deflect itself, are omitted.

Boost-damage attribution is declared on the enabling skill with
`collectBoostDamage`. Its value is the buff ID whose counterfactual damage
should be credited to that cast. The field and source cast are passed into buffs
applied by the skill. If the named buff is applied later, the active carrier
buff passes the same source forward. Flute names its directly applied `Flute`
buff. Ghostly Step names `MysteryDMGBoost`, so `Mystery` or `MysteryUmbra`
carries the source until Perfect Dodge applies the damage buff. Both then use
the same per-hit calculation with and without the named buff.

### Multi-action skills

A castable skill can declare an ordered `subAction` list of objects. `value`
names the primary component. Its optional `requirement` is evaluated when that
component starts, after earlier components finish. A passing requirement uses
the primary component; a failing requirement uses `fallback` when provided or
skips the component otherwise. The selection remains locked for that component
cast.

`value` and `fallback` may instead be equal-length arrays. The requirement is
evaluated once when the first component in the group starts, and the entire
primary or fallback sequence is locked from that result. Later components do
not re-evaluate the requirement after earlier components change resources,
effects, or cooldowns. Each paired position reserves enough action slots for
either candidate, using the same stable attachment behavior as a scalar
fallback.

The parent skill's own cast and actions execute first, followed by each selected
component in array order. Unlike a `trigger`, every selected component consumes
its effective cast time. Component actions retain the selected component's tags
and resolved modifiers for requirements and damage calculation. Their damage,
triggered actions, cast time, timeline display, and per-cast breakdown ownership
remain assigned to the parent skill.

Both primary and fallback action capacities are allocated during expansion.
Unused action slots are inert, allowing the candidates to have different action
counts while preserving stable indexes for stored action attachments. An
attachment targeting an unselected action is skipped. Component definitions use
the `SubAction` tag and cannot be selected directly in the Rotation Editor.

Legacy string entries from stored skill overrides are interpreted as objects
with only `value`; bundled data uses the object form. Nested lists are expanded
in order, and a cyclic reference is ignored at the repeated edge. Conditional
primary and fallback definitions are currently required to be leaf components;
unconditional component references may still contain nested subactions.
Conditional sequences provide grouping without adding nested conditional
definitions.

Burning Heart uses a conditional sequence immediately after its 0.4-second
PreCharge. Inner Passion or Charge Enhancement selects and locks the Fast
Charge/Fast Slam sequence; otherwise the Slow Charge/Slow Slam fallback is
locked. Fast Charge takes exactly two-thirds of the corresponding Slow Charge
time, with its internal action times scaled by the same ratio. Slam timing and
damage timing are unchanged. Only the Fast Slam can receive Steadfast Devotion
T4's `0.32` Base DMG Bonus, and it checks only that Inner Way condition because
the acceleration state was already captured by the sequence selection.

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
It also clears a skill cooldown with the same identifier. Inner-way and setup
trigger actions support `clearCD`, so an on-damage rule can reset a skill or
effect cooldown without a triggered helper skill.

### Set self HP and take damage

The timeline initializes self HP from the calculated Max HP stat. The attached
Self HP event emits a `setHP` action and stores an absolute value:

```json
{
  "type": "setHP",
  "currentHP": 100000,
  "time": 0
}
```

The Take Damage event subtracts a nonnegative absolute amount:

```json
{ "type": "takeDamage", "damage": 70000, "time": 0 }
```

Unlike Self HP, Take Damage is a fight-relative timed event. Its `startTime`
is editable independently of skills and resolves before skill actions at an
equal timestamp. This lets incoming encounter damage and damage-triggered setup
effects remain fixed even when rotation cast timing changes.

Every action snapshots both current self HP and its ratio to Max HP. Percentage
requirements therefore read the state after preceding actions at the same
timestamp. Rotation import retains `currentHPRatio` only as a legacy boundary
adapter and converts it against the current Max HP when building the timeline.
The Rotation Editor displays this state as a percentage. Its Self HP event input
also accepts a percentage and converts it to absolute `currentHP` at the UI
boundary. Take Damage accepts only an absolute damage amount in the Self HP
column; its row does not display a derived self-HP result.

### Set target HP and Qi

An optional positive `targetHP` on the rotation enables target-health tracking.
The target starts at 100%, each damage action subtracts its calculated damage
from the remaining target HP, and later actions snapshot the resulting ratio.
Without `targetHP`, damage does not reduce the displayed target percentage.
An attached target HP event can set the percentage explicitly:

```json
{
  "type": "setTargetHP",
  "targetHPRatio": 0.5,
  "time": 0
}
```

A rotation may instead set `"autoHP": true`. The timeline derives the rotation
duration, starts target HP at 99.99% at the fight-start anchor, and applies a
hidden ten-percentage-point reduction at every 10% duration boundary through
90%. Enabling Auto HP removes stored manual HP events, and the editor does not
offer the HP event while the option remains enabled.

A rotation with `"dummyAttack": true` derives two hidden Take Damage events at
5.5 seconds after fight start and every six seconds thereafter. Both events at
each timestamp deal 200 damage and use the same `takeDamage` action and trigger
ordering as manually entered damage. Generation stops before Battle End, or
before the resolved final timeline time when Battle End is absent. Generated
events are not written into the editable `steps` array.

Qi also starts at 100%. A Qi event emits `setQi`; setting Qi to zero immediately
applies Exhausted. Exhausted declares a generic expiry action which restores Qi
to 100% when its data-defined duration ends:

```json
{
  "type": "setQi",
  "targetQiRatio": 1,
  "time": "expire"
}
```

Rotation loaders migrate legacy Exhausted events to Qi-at-zero events and
legacy `HP` events containing `currentHPRatio` to explicit Self HP events.

Preset rotations approximate linear target-Qi loss within each depletion
segment. They attach 59% and 40% Qi events to the nearest damage actions at,
respectively, 41% and 60% of the interval from the previous Exhausted expiration
(or fight start for the first segment) to the next 0% Qi event. The
`check-rotation-qi-ramps.mjs` probe verifies one of each marker per depletion.

### Numeric resources

The timeline also tracks named numeric resources. Resources start at zero
unless supplied through `TimelineBuildInput.initialResources`. Skill and effect
actions can update them:

```json
{ "type": "setResource", "value": "HeavensWill", "amount": 1, "time": 0 }
{ "type": "addResource", "value": "HeavensWill", "amount": 1, "time": 1 }
{ "type": "consumeResource", "value": "HeavensWill", "amount": 1, "time": 2 }
```

`setResource` replaces the value, `addResource` increases it, and
`consumeResource` decreases it. A `consumeResource` action may use `"all"` as
its amount to set the resource to zero. Results are normally clamped to zero
and to an optional named maximum supplied by
`TimelineBuildInput.resourceMaximums`. Vitality is the exception: consumption
may take it below zero so a rotation can expose its resource deficit. Every
action snapshots the resources before that action resolves, so a resource
change affects later actions at the same timestamp but not earlier actions.

Timeline construction also keeps a resource ledger containing the initial,
accepted consumed, accepted regenerated, and final value of every resource.
Regeneration records the amount actually received after applying the resource
cap; wasted gains at the cap do not count. The final Vitality ledger drives the
aggregate Mystic damage correction described in `damage-formula.md` without
changing the resource values displayed on individual timeline rows.

An action can lock its requirement result when its owning skill or sub-action
component begins:

```json
{
  "requirement": {
    "resolveAt": "skillStart",
    "operand": [
      { "target": "self", "value": "SoaringHighT6" },
      { "target": "resource", "value": "HeavensWill", "comparison": "==", "amount": 4 }
    ]
  }
}
```

The complete operand uses the normal implicit-AND requirement semantics. Its
boolean result is remembered for that action and does not change when effects
or resources change before the action executes. In a multi-action skill,
`skillStart` means the start of the selected component that owns the action.

`TimelineBuildInput.resourceRegeneration` maps resource IDs to the amount
generated per second. Regeneration accrues continuously between ordered
timeline events before the next event snapshots its state, beginning at the
resolved fight-start anchor rather than the earliest prepull action. Heaven's
Will starts at the system-defined value of `2` and uses the character's hidden
`heavensWillRegen` stat; its innate value of `0.1` therefore generates one
Heaven's Will every 10 seconds after the fight starts. Explicit resource actions
operate on the regenerated value, and equal-time actions retain their declared
causal order.

`system.json.resourceEvents` defines universal gains caused by timeline
events. A damage rule may declare a cooldown; a take-damage rule may declare
`perMaxHPRatio`, in which case Max HP actually lost grants `amount`
proportionally to that ratio. Vitality starts at and is capped by the character's
`maxVitality`. Direct Mystic definitions consume Vitality with an explicit
time-zero `consumeResource` action. Triggered Mystic definitions omit that
action, so follow-up damage does not pay the parent cast's cost again. A
rotation with `"infiniteVitality": true` marks Vitality through the generic
`TimelineBuildInput.infiniteResources` handling; its value remains at the
resource maximum while resource gains, regeneration, and consumption are
ignored.

Inner Way triggers may react to either `damage` or `takeDamage` and execute the
same numeric resource actions used by skills. A missing trigger event continues
to mean `damage` for existing Inner Ways. Fury Harvest T3 uses two such triggers
to add `0.1` Vitality after every outgoing damage action and every Take Damage
event. Fury Harvest T1 adds one conditional Vitality action to Perfect Dodge,
and T4 adds one to a successful Deflect. T2 grants `33.5` Physical Defense. T5
grants `5.1` defensive Physical Resistance; this internal stat also accepts the
Physical Resistance attunement but is intentionally omitted from the character
stat display.

Fury Harvest T6 uses explicit actions on directly cast Mystic skills. At cast
end, the skill applies or refreshes one stack of the general Turnaround buff for five seconds.
If Turnaround was already active when a later Mystic consumed Vitality at cast
start, an immediately following action refunds 30% of that skill's declared
cost, capped at 10 Vitality. Turnaround is not consumed by the refund. Triggered
Mystic follow-ups neither spend Vitality nor apply Turnaround.

Seasonal Edge T0 uses a `skillEndRandomBuff` trigger on skills tagged
`Conversion`. Finishing an eligible skill outside the 30-second cooldown opens
one eight-second window whose `outcome` entries select Bloom, Flare, Yield, or
Frost with equal weight. T1 extends the shared duration to 12 seconds. T2 adds
24.8 Min Physical Attack and 49.6 Max Physical Attack. T3 changes the result
count to 70% one buff and 30% two distinct buffs; later selections use the
remaining weighted pool rather than allowing a duplicate.

T4 changes the outcome weights to 10/40/40/10 for Bloom, Flare, Yield, and
Frost, and permits Serene Breeze to trigger the same proc. T5 adds 2.8%
Physical DMG Bonus. T6 removes Frost, uses 10/40/40 weights for the remaining
pool, and changes result counts to 50% one buff, 30% two distinct buffs, and
20% all three buffs. Deterministic damage calculations enumerate and merge the
weighted buff combinations; simulations roll one concrete combination and
retain it for the whole window. Bloom and Frost currently have no numerical
effect. Flare adds 10% All Martial Arts and another 10% while self HP is above
75%. Yield adds 10% Mystic Skill Damage and may restore two Vitality per second.
The Seasonal Edge Cooldown itself is deterministic: every accepted trigger
adds a normal one-stack, 30-second timeline buff with an ordinary expiration
time. It is not included in the probability-weighted outcome plates.

Because any multi-buff result may include Yield, the timeline displays Vitality
as a lower and upper bound. The lower bound follows the ordinary resource
timeline for outcomes without Yield. The upper bound applies Yield during every
possible Seasonal Edge window while respecting Max Vitality. These bounds are
display state; damage calculations and simulations continue to use exact
seasonal combinations.

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
- `martialArt`: the canonical martial-art tag on the skill being evaluated,
  such as `SnowpartingBlade` or `PhalanxbaneBlade`
- `equippedMartialArt`: a canonical martial-art ID present in either equipped slot
- `currentMartialArt`: the canonical martial-art ID active at this timeline event
- `currentWeapon`: the active physical weapon family, such as `HengBlade` or `MoBlade`
- `resource`: a named numeric timeline resource compared with `amount` using
  `comparison`; supported comparisons are `>=`, `>`, `<=`, `<`, `==`, and `!=`
- `selfHPPercentage`, `targetHPPercentage`, and `targetQiPercentage`: the
  corresponding action-time percentage compared with `amount` using the same
  operators

For example, Heaven's Will requires at least one resource point:

```json
{ "target": "resource", "value": "HeavensWill", "comparison": ">=", "amount": 1 }
```

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
Modifier values may use `byStack` to capture a buff or debuff's stack count at
cast start:

```json
"dmgBonus": {
  "function": "byStack",
  "param1": "EnhanceDrunkenPoet",
  "param2": 0.2,
  "target": "self"
}
```

`param1` is the tracked effect ID, `param2` is the value per stack, and `target`
defaults to `self`. The resolved number is frozen for the cast, so a later
`consume` action does not remove the cast's bonus. Drunken Poet 5 uses this to
gain 20% direct damage per Enhanced Drunken Poet stack before consuming all of
those stacks. Its separately triggered explosions do not inherit the modifier.
Enhanced Drunken Poet is a Mystic buff displayed as `EDP`; its existing
internal ID remains `EnhanceDrunkenPoet` for stored-data compatibility.

## Buff and debuff definitions

```json
{
  "MountainSplitter": {
    "name": "Mountain Splitter",
    "description": "Increases Critical DMG for matching skills and applies the guaranteed-critical rule.",
    "duration": 10,
    "cooldown": 15,
    "maxStack": 1,
    "refresh": true,
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
- `refresh`: whether a successful reapplication resets the duration
- `action`: actions scheduled relative to each accepted application or
  reapplication; a rejected application does not schedule them
- `effect`: action-time effect rules
- `stackEffects`: cumulative effect rules indexed by current stack count
- `shared`: marks a debuff as shared with the party; a displayed shared debuff
  includes elapsed-time coverage in the DPS breakdown
- `showCoverage`: includes the effect in Buff Coverage or Debuff Coverage when
  it has a non-zero output-action average stack count or shared time coverage
- `global`: when `true`, contributes always-active setup rules and stays hidden
  from manual Buff choices

Effect definitions marked `global: true` are flattened into the always-active
setup effects. They are checked for every damage action like Inner Way rules,
but are not tracked buffs and do not appear in buff plates or the manual Buff
selector.

`TimelineBuildInput.initialBuffs` and `initialDebuffs` may seed permanent
tracked effects. Seeded effects have no expiration, are not consumed, and merge
by definition ID with later applications. This is used by the Main-tab global
effect controls rather than copying their damage fields into every action.

When `stackEffects` exists, index `stack - 1` is selected instead of `effect`.
Each index must contain the complete cumulative value for that stack; entries are
not added together. If another feature raises `maxStack`, enough `stackEffects`
entries must already exist for the larger cap.

An effect entry should canonically use `{ "requirement": [...], "effect": {...} }`.
Unwrapped effect objects are also accepted by the current evaluator.

A canonical wrapper containing only recognized, finite numeric damage fields is
eligible for lifecycle aggregation. The timeline updates that aggregate on
application, stack change, consumption, and expiration, and omits the extracted
wrapper from per-hit effect evaluation. Any requirement, dynamic value,
additional wrapper metadata, unsupported effect field, or modifier of the
definition's `effect`/`stackEffects` content keeps the complete rule on the
per-hit path. Authors should continue describing the mechanic normally in JSON;
the optimization does not require a data flag.

Damage effect fields `globalDmgBonus` and `globalHPDMGBonus` contribute to the
same additive global multiplier for every HP-damage component.
`globalBellstrikeDMGBonus` contributes to that global category only for the
Bellstrike component. These remain distinct from character attribute damage
bonuses such as `bellstrikeDmgBonus`; see `damage-formula.md` for the multiplier
order.

`dotDamage` is an additive DOT-only category. Active values are summed and
applied as a standalone multiplier to rows generated by a DOT definition; the
casting skill's direct damage is unaffected. Requirements on each effect entry
can further restrict the source by its martial-art or skill tags.

`defenseBonus` is a signed percentage adjustment to enemy defense, while
`physicalResistance` is a signed flat adjustment to enemy Physical Resistance.
Negative values reduce the corresponding enemy property. Cumulative
`stackEffects` must store the full adjustment at each stack index.

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
`effect` map keyed by tier ID. They also require `altersTimeline`; all current
Inner Ways conservatively set it to true, while a future false value allows
priority removal to reuse baseline event state:

```json
{
  "name": "Morale Chant",
  "altersTimeline": true,
  "tags": ["StonesplitStrength"],
  "effect": {
    "MoraleChantT0": {},
    "MoraleChantT1": {},
    "MoraleChantT2": {
      "effect": [{ "stat": { "minPhys": 24.8, "maxPhys": 49.6 } }]
    }
  }
}
```

When a selected path declares `tag`, the Inner Way selector and
calculation pipeline include only definitions whose `tags` contain that value.
Mixed has no required tag and therefore exposes every imported Inner Way.

Weapon sets in `data/gear-set.json` and armor sets in `data/armor-set.json` use
the same path-tag convention. Only
matching definitions are displayed and applied outside Mixed; stored tiers for
hidden definitions are preserved. Every set declares `altersTimeline`. A true
value conservatively rebuilds comparison timelines for that set; a false value
reuses the baseline timeline and is valid only when every option changes
damage/stat evaluation without changing combat events or tracked state.
One set option may provide either one setup-effect object or an array of setup
effects. Arrays allow unconditional stats and action-time rules to coexist in
the same tier. An explicit empty `requirement` array is an always-active
action-time rule that remains outside the displayed character-stat pipeline.
Rain Whisper four-piece uses one for its unconditional Critical DMG bonus and a
Shield requirement for its additional Critical DMG bonus.

Selecting tier `Tn` activates every tier condition and rule from T0 through Tn.
Tier entries may contain:

- `effect`: passive stats, conditional action effects, or `target`/`modify`
- `trigger`: reactive actions evaluated on each damage action
- `listen`: post-formula damage listeners that can spawn parameterized
  `Replayed` skills

Reactive trigger example:

```json
{
  "target": "self",
  "requirement": [
    { "target": "skillTag", "value": "DirectDamage" },
    { "target": "self", "value": "YiRiver", "stack": 5 }
  ],
  "action": [{ "type": "trigger", "value": "MoraleChant" }]
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

## Periodic effects and DOT definitions

Any tracked buff, debuff, or DOT can declare periodic actions. The `periodic`
object keeps cadence separate from lifetime and stack behavior:

```json
{
  "Smolder": {
    "name": "Smolder",
    "maxStack": 1,
    "periodic": {
      "interval": 0.5,
      "firstTick": 0.5,
      "resetOnRefresh": false,
      "action": [{ "type": "damage", "phyCoef": 0.2787, "phyBonus": 40, "attrBonus": 0, "time": 0 }]
    },
    "modifier": [],
    "tags": ["DOT", "Mystic"]
  }
}
```

`interval` must be positive. `firstTick` is the offset from initial application;
it defaults to `interval` and may be zero for an immediate trigger. Periodic
actions continue at `interval` steps through the resolved effect duration. An
effect without a resolved duration does not schedule periodic actions.
`resetOnRefresh: false` preserves the original cadence when a refresh extends
the effect; `true` starts a new cadence from the refresh timestamp. Consuming
the final stack or removing the effect cancels its remaining periodic rows.
Periodic rows from `player` effects retain their recipient: recipient zero heals
self, while every other copy heals one always-full teammate.

DOT definitions are periodic target debuffs tagged `DOT`. Their generated rows
remain DOT rows for damage rules and source-cast attribution. `apply.duration`
takes precedence over the DOT definition and effect definition. DOT rows are
interleaved globally with casts and triggered skills, and DOT damage ignores
flat physical and attribute bonuses.

DOT definitions currently use `refresh: false`, so a successful reapplication
does not reset their expiration or tick cadence. `extend` explicitly adds to the
current expiration and transfers future ticks to the extending cast. Ordinary
buff and debuff definitions use `refresh: true`. Surging Waves is the exception:
later stacks increase its stack count but all expire on the first stack's timer.

Delayed one-shot attacks use ordinary effect actions rather than `periodic`.
`"time": "expire"` resolves to the active effect's expiration and is exposed to
damage calculation as a numeric offset from the effect row. Toad Venom and
Lesser Toad Venom use this mechanism as five-second target debuffs without the
`DOT` tag. Toad Venom attacks at expiration and applies Lesser Toad Venom, which
attacks five seconds later. Reapplication before expiration is ignored, so it
neither refreshes the timer nor schedules another attack.

## Rotation records and events

```ts
type RotationRecord = {
  name: string;
  eventTimeReference?: "battleStart";
  steps: Array<
    | { type: "skill"; skill: string }
    | { type: "event"; event: "Delay"; duration: number }
    | { type: "event"; event: "Exhausted"; after: AttachedEventTarget; duration?: number }
    | { type: "event"; event: "Move"; before: AttachedEventTarget; distance: number }
    | { type: "event"; event: "SelfHP"; before: AttachedEventTarget; currentHP: number }
    | { type: "event"; event: "TakeDamage"; startTime: number; damage: number }
    | { type: "event"; event: "HP"; before: AttachedEventTarget; targetHPRatio: number }
    | { type: "event"; event: "Qi"; before: AttachedEventTarget; targetQiRatio: number }
    | { type: "event"; event: "Buff"; before: AttachedEventTarget; buff: string; stack?: number }
    | { type: "event"; event: "Debuff"; before: AttachedEventTarget; debuff: string; stack?: number }
    | { type: "event"; event: "MartialArt"; before: { action: "start" }; martialArt: WeaponId }
    | { type: "event"; event: "Controlled" | "ShieldBroken" | "BattleEnd"; startTime: number; duration?: number }
  >;
  start?: { step: number; action?: number };
};

type RotationPreset = RotationRecord & {
  martialArts: WeaponId[];
  test?: boolean;
};

type AttachedEventTarget = {
  action: number | "start";
  trigger?: number;
};
```

Skill steps and `Delay` events are placed sequentially. A Delay starts when the
preceding cast ends, advances every later sequential step by its nonnegative
`duration`, and applies no action or effect. A trailing Delay still extends the
rotation duration. `Move`, `SelfHP`, `HP`, `Qi`, `Buff`, `Debuff`, `MartialArt`,
and `Exhausted` are action-attached events and must be stored immediately before
their target skill. The first seven use `before`; Exhausted
uses `after`. The attachment's
`action` is a zero-based action index in that skill; `"start"` is valid for
before-attached events and targets cast start. When `trigger` is present, it is the
zero-based ordinal of a `trigger` action declared by the target skill, and
`action` selects an action inside that triggered skill. Move resolves before its
target; Exhausted resolves after its target, so the breaking hit does not receive
Exhausted bonuses while subsequent hits do. The editor displays these zero-based values as one-based action and
trigger numbers internally, but attached-event rows do not expose those indices
as editable text. Their up/down controls move the attachment through skill
starts (for before-attached events), direct damage actions, and declared triggered-skill damage
actions in effective timeline order. Exhausted skips skill-start targets. Moving to an action expands its owning skill so the
attachment and target remain visible together; leaving that skill collapses the
auto-expanded action list. When multiple events share the same skill, action,
trigger, and before/after phase, the controls first reorder those events before
moving beyond that attachment target. Their stored array order is their execution
order at the shared timestamp. The editor preserves the attached-event row's visual
scroll position while moving it. A newly inserted skill receives focus, and
converting it to an attached event targets the following skill.

The Martial Art event is restricted to `{ "action": "start" }`; it cannot
target a skill action or a triggered action. Its editor control appears in the
Damage column and can select either equipped martial art. It switches the
current martial art and derives the current physical weapon immediately before
the target cast without consuming time. The initial state uses the left martial
art. A later castable `MartialArts` skill may switch it again automatically.

Perfect Dodge uses `currentWeapon` requirements to trigger one of the six
weapon-tagged Ghostly Step - Umbra Dodge definitions. This lets its Mystic
damage inherit the physical weapon used before the dodge without turning the
dodge itself into a martial-art skill.

Bundled rotation JSON records declare the martial-art IDs they use in
`martialArts`. The Rotation Editor shows a preset only when those tags match the
current weapon selection. The all-tagged empty rotation uses `test: true`, so it
is bundled but hidden until the header-level Dev toggle is enabled.

With `eventTimeReference: "battleStart"`, timed encounter events, including
Take Damage, use a `startTime` relative to the selected fight start and consume
no cast time.
`Exhausted` and `Controlled` take their default durations from their debuff
definitions. Each event's editable `duration` overrides that default.
`ShieldBroken` consumes the general player `Shield`. When Art of Resistance T6
is selected, its following action applies the 12-second Hardened Foe buff.
`BattleEnd` has no action and excludes damage ordered after it; it also fixes
the rotation duration at that timestamp.
The Rotation Editor skill selector offers skills from the currently selected
weapon categories plus Mystic and General. Triggered skills remain excluded.
An existing step from another martial art is preserved and marked unavailable
until the user replaces it or restores a compatible weapon selection.
Distance starts at 1m. An attached `Move` event changes it to its integer
`distance` immediately before the selected action. An attached Exhausted event
applies at the same timestamp immediately after the selected action. Timeline rows store
cast-start distance, while every action stores its own distance snapshot.
An attached Self HP event sets absolute `currentHP` immediately before its
target. A timed Take Damage event subtracts from the current value and can fire
setup triggers such as Revelry Script. Buff and Debuff events select a definition from their respective data
directories and apply it before the target using that definition's duration.
Buff and Debuff events may specify a positive integer `stack`; omitted values
apply one stack, and tracked-effect resolution caps the result at the selected
effect's resolved `maxStack`. The editor applies unconditional Inner Way
definition modifiers for the active build when choosing and validating this
stack count, matching the cap used by timeline calculation.
Distance and HP columns are hidden unless the rotation contains their event or
a skill tagged `Distance`/`HP` respectively.

Bundled mixed-dummy rotations include fight-relative movement events for Flute
distance modeling. They open at 19m, enter the first Fleeting Trace at 3m, then
return to 1m. Every Burning Heart cast moves to 6m for its first Anxi Soldier,
4m for its second Anxi Soldier, and 2m for its first damage action; consecutive
Burning Heart sections reset to 1m after their final cast.

### Dynamic effect values

`segment` maps a numeric parameter through ordered inclusive upper bounds:

```json
{
  "function": "segment",
  "param1": "distance",
  "param2": [1, 2],
  "param3": [0.02, 0.03, 0.04]
}
```

For each threshold `param2[n]`, a parameter less than or equal to that threshold
uses `param3[n]`. A parameter greater than the last threshold uses the final
`param3` entry, so `param3` must contain one more value than `param2`. Flute
uses integer distance thresholds for its distance-based `dmgBonus`.

Stat and effective-stat effects use the same function with character-stat
parameters and explicit thresholds:

```json
{
  "function": "segment",
  "param1": "maxHp",
  "param2": [4999, 9999, 14999],
  "param3": [0, 4, 8, 12]
}
```

This example returns 0 below 5,000 Max HP, 4 from 5,000 through 9,999, 8 from
10,000 through 14,999, and the final value from 15,000 onward. Setup effects
with a `requirement` remain per-action rules: the worker resolves them against
the damage action's tags and state, and they are excluded from the global
character-stat display. Timing values can likewise use action-time thresholds:

```json
{
  "function": "segment",
  "param1": "actionTime",
  "param2": [1.5, 2.5],
  "param3": [-0.7, -1, -1.2]
}
```

`actionTime` resolves independently for the skill's original cast time and each
original action time before timing modifiers are applied. Thus a segmented
`castTimeModifier` may adjust early and late actions by different amounts.
Damage effects may similarly segment the current `distance` parameter.

`switch` selects a value from an explicit keyed table. `param1` names the
timeline-state value to inspect, `param2` maps possible values to results, and
the optional `fallback` is used while the structural timeline is built or when
no case matches:

```json
{
  "function": "switch",
  "param1": "currentWeapon",
  "param2": {
    "HengBlade": 0.5,
    "Gauntlet": 0.5
  },
  "fallback": 0.5
}
```

A switched `castTime` is resolved from `currentWeapon` when the cast starts and
is then locked for that cast. The fallback supplies the initial structural
estimate before timeline events have established the weapon state. Actions may
also use a switched `value` with `"resolveAt": "skillStart"`; Perfect Dodge
uses this to select one weapon-tagged Ghostly Step - Umbra Dodge definition
without repeating one trigger action per weapon.

General Deflect uses this weapon-time switch. Gauntlet Deflect is measured at
`0.3` seconds; the other weapon cases retain the shared `0.338`-second
placeholder until their individual timings are measured.

Successful Deflect and both Perfect Dodge variants carry the shared
`AvoidsTakeDamage` tag. A Take Damage event inside one of those cast intervals,
including either boundary, resolves to zero and does not activate take-damage
triggers. Ordinary Deflect does not carry the tag and therefore does not avoid
the event.

`multiply` multiplies a dynamic parameter by a scalar:

```json
{
  "function": "multiply",
  "param1": "missingHPPercentage",
  "param2": "0.0045"
}
```

Numeric strings are accepted for the scalar. `missingHPPercentage` converts the
hit-time HP ratio to percentage points, so 20% missing HP resolves this example
to `20 × 0.0045 = 0.09`. Dragon Head - Tide receives this always-active rule
from its `global: true` definition in `data/buff/mystic.json`.

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
version 8. Versions 1 through 7 remain importable; legacy attached Take Damage
events migrate to fight-relative timestamps, and legacy Exhausted `before`
attachments migrate to `after`. The snapshot includes each custom rotation's `martialArts`
eligibility and the current in-memory editor value, even before the Save button
is pressed. Bundled default rotations are discovered from
`data/rotation/**/*.json` and reconstructed from their JSON sources rather than
saved in browser storage or exports. They are read-only in the editor; Duplicate
creates an editable custom copy.

Import validates every step and appends custom rotations to the saved rotation list
without replacing existing rotations or changing the active rotation. ID
collisions are remapped, and bundled default rotations are skipped to prevent
duplication. The first imported rotation is opened for review but is not made
active automatically. Importing the same file again creates another independent
copy of its custom rotations.

## Data conventions

Weapon-set effects may listen to a resolved damage outcome without applying an
ordinary timeline buff:

```json
{
  "trigger": {
    "event": "damageOutcome",
    "outcome": "affinity",
    "action": {
      "type": "apply",
      "target": "self",
      "value": "Hawkwing",
      "stack": 1,
      "reapply": true
    }
  }
}
```

The referenced buff definition supplies its duration, maximum stack, and per-stack
effect. This trigger is resolved by the damage-sequence outcome tracker rather than
the ordinary action-time `damage` trigger pipeline.

An outcome-triggered Inner Way may accumulate a decaying resource before
applying a regular buff:

```json
{
  "event": "damageOutcome",
  "outcome": "affinity",
  "target": "self",
  "resource": {
    "name": "Focus",
    "gain": 1,
    "decayRate": -0.25,
    "threshold": 4,
    "resetTo": 0
  },
  "action": [
    {
      "type": "apply",
      "target": "self",
      "value": "Concentration",
      "stack": 1,
      "reapply": true
    }
  ]
}
```

Focus decay begins from the previous damage timestamp. The Affinity outcome is
resolved after the current hit; reaching the threshold therefore affects only
subsequent hits. `resetTo: 0` is required and makes conversion consume all
Focus. The referenced buff supplies the duration and Affinity DMG Bonus.
Concentration is defined in `data/buff/bellstrike-umbra.json`; its expected
pre-hit activation probability is exposed as a fractional average stack and
rendered through the same synthetic buff-plate path as Hawkwing.

Insightful Strike T1 grants `0.015` Damage Bonus while self HP is above 75%.
At or below 75%, it instead exposes `leech: 0.015`, meaning intended recovery
equal to 1.5% of damage dealt. `leech` is currently retained as data only and
does not recover HP until damage-based healing is implemented.
Insightful Strike T2 adds 22.3 Min Physical Attack and 44.7 Max Physical
Attack through the shared stat-effect pipeline.
Insightful Strike T3 modifies Concentration to add `0.015` Direct Affinity and
another `0.015` while self HP percentage is strictly greater than target HP
percentage. The second rule uses the generic `compareTo` requirement operand,
so both percentages are read at the current hit. A rotation without preset
target maximum HP supplies the stable implicit target state of 99%.
Insightful Strike T4 modifies the Focus outcome resource's gain from `1` to
`1.5` per Affinity outcome. The modifier is resolved before both deterministic
probability tracking and concrete simulation tracking.
Insightful Strike T5 adds 5.1 Physical Penetration through the ordinary
calculation-time penetration effect.
Insightful Strike T6 grants 10% Damage Bonus to skills tagged `DOT` or
`DOTEmpowered` through an explicit OR tag requirement.

A numeric requirement normally compares its resolved target with `amount`. It
may instead use `compareTo` with another numeric runtime state such as
`targetHPPercentage`; both operands are resolved at the requirement timestamp.

- Use decimal ratios for percentages.
- Keep IDs stable and put display text in `name`/`description`.
- Use `action` for timeline changes and `modifier` only for cast-start changes.
- Keep action times ordered and represent repeated casts as repeated rotation
  steps.
- Use `duration` for lifetimes and extension amounts; do not use `extension`.
- Prefer explicit requirements over hard-coded skill-ID checks.
- Give every direct skill `DirectDamage` and every DOT definition `DOT`.

### Bellstrike Splendor definition status

Nameless Sword's Qi Struggle Enhancement records `0.1` Qi DMG Bonus, which remains
inactive until Qi damage is simulated. Sword Energy attacks gain `0.02` HP damage
per 100 Max Physical Attack, capped at `0.2`. Physical Attack Up converts Momentum
to Max Physical Attack at `0.2639285714285714` per point, capped at `73.9`.

Sword Qi Affinity Enhancement applies only to `SwordEnergy` attacks when target Qi
is below 40% or Qi Imbalance is active. It grants `0.00012` Affinity DMG Bonus per
Max Physical Attack, capped at `0.18` at 1500. Bellstrike Attribute Up grants 98
Min and 196 Max Bellstrike Attack, then grants Bellstrike Penetration from resolved
Max Bellstrike Attack at `22 / 655` per point, capped at 22.

Nameless Spear's Affinity Rate Up converts Momentum to Affinity at
`0.043 / 280` per point, capped at `0.043`. Max Endurance Up grants 10 Endurance,
then one more for every complete two percentage points of Affinity above 10%, up
to another 10 at 30%. The Affinity formula is evaluated before this dependent
Endurance segment.

Affinity DMG Up grants `0.6` Affinity DMG Bonus per point of Affinity, capped at
`0.18` at 30%, while Endless Gale is active or Endurance is below 60%. The
`endurancePercentage` requirement is stored for the latter condition but remains
inert until Endurance state is simulated. Bellstrike Attribute Up grants 98 Min
and 196 Max Bellstrike Attack, then grants Bellstrike DMG Bonus from resolved Max
Bellstrike Attack at `0.11 / 655` per point, capped at `0.11`.

### Stonesplit Might definition status

The WIP Stonesplit Might data declares Thundercry Blade and Stormbreaker Spear
skills, buffs, Vulnerable, weapon talents, Exquisite Scenery, Art of Resistance,
and Formbend. Cast durations derived from the local WWM reference are 3.766s
for Avalanche, 1s for Stonebreaker Cleave, 1.6s for Thunder Shock, 1s for Storm
Roar, and 1s for Predator's Shield. Thunder Shock hits at 0.4s and 1.2s; its
cancel variant ends after the first hit at 0.4s. Until other per-hit timing is
available, every remaining multi-hit Might skill places its hits at cast end.
At each Thunder Shock timestamp, damage resolves before its following
Vulnerable application: hit one cannot benefit from its own application, while
hit two sees the debuff from hit one and then refreshes it.

The General Defense skill has zero cast time and applies one Cadence stack at
cast start when Exquisite Scenery T0 or higher is selected. Preset rotations
represent its 0.3-second animation with an explicit Delay immediately before
each Defense step. Cadence lasts 20
seconds and stacks twice. Each accepted Cadence application immediately tries
to apply Riposte. Riposte lasts five seconds and has a 10-second cooldown. Only
an accepted Riposte application consumes one Cadence stack and starts the
hidden Riposte Trigger wait; when that wait ends, it tries Riposte again if
Cadence remains. A failed attempt ends the chain, while a later Cadence
application starts a new attempt. Exquisite Scenery T4 changes both the Riposte
cooldown and the hidden trigger wait to five seconds. Riposte reduces
Avalanche's cast and hit timing by two seconds and is consumed when the
Avalanche cast starts.

Battle Anthem and Adaptive Steel are alternative Stonesplit Might Inner Ways.
Breaking Point is also available to both Stonesplit Strength and Stonesplit
Might through its path tags.
At T6, both Perfect Dodge variants trigger `BreakingPointT6Dodge`, which applies
five Disintegration stacks and has a 15-second skill cooldown. Only this proc
shares the cooldown across dodge variants; dodge timing and other dodge effects
remain independent. Disintegration itself has no application cooldown, so normal
Breaking Point stack generation remains available throughout the proc cooldown.
Battle Anthem adds 10% Charged Skill damage at T0, 3.9% Affinity at T2, and a
further 5% Charged Skill damage at T4. Its T6 damage scaling is stored as a
segment over `enduranceLost`, from 0% below 10 lost Endurance through 10% at 50
or more; `enduranceLost` is not yet supplied by the calculator, so this tier is
currently inert. Adaptive Steel adds 20% Charged Skill Critical DMG at T0, 38
Max Bellstrike Attack at T2, and 3% Bellstrike DMG Bonus at T4.
Exquisite Scenery T6 adds 50% Base DMG Bonus to attacks carrying either Light
or Heavy together with either Charged or Varied Combo. The four explicit tag
combinations keep the rule from affecting an attack tagged with only one half
of a category. Its `baseDMGBonus` is a separate multiplier from ordinary
`dmgBonus` effects.

Attunement effects match every entry in `effect.tags` and reject an action when
any entry in the optional `effect.excludeTags` appears on that action. This
keeps general combat tags intact when an individual attunement has a narrower
scope. Stonebreaker Quake remains tagged `Charged` for other mechanics but is
excluded from Thundercry Blade's Charged Skill DMG Boost.

Might actions use the same `phyCoef` for physical and attribute damage.
Thundercry Blade's Max-HP talents use segmented stat/effective-stat values and
per-action tag requirements. Its Critical talent contributes to Effective
Critical after Judgement Resistance and before the 80% Effective Critical cap;
it does not use the separate Direct Critical channel. Predator's
Shield uses the shared definition in `data/buff/general.json`; applying it
refreshes its base lifetime before its tier-based extensions are applied.
The General skill AoR T4 Shield has a three-second cast, applies that shared
Shield at cast start with a 14-second duration, and extends it to 16 seconds
when Formbend four-piece is selected.
Drumbeat independently grants 15% Charged Skill damage for six seconds and is
converted into the separate 42% Charged Skill damage buff Breakthrough by
Predator's Shield. Breakthrough uses its own 12-second base duration. Art of
Resistance T0 extends both Shield and Breakthrough by four seconds, T4 extends
both by another two seconds, and Formbend four-piece extends both by another
two seconds. Art of Resistance is an Inner Way rule requiring that
Shield: T3 adds 5% general
damage and cumulative T6 adds another 5%. The Shield Broken event consumes the
Shield and, at T6, applies the 12-second, 10% Hardened Foe buff. Predator's
Shield consumes Hardened Foe before applying a fresh Shield. Formbend is an
armor set available to Stonesplit Strength and Might. Its four-piece option
adds the `FormBend4` setup condition; Predator's Shield checks that condition
and extends the refreshed Shield and Breakthrough by two seconds.

Divinecraft definitions use the same direct setup-effect shape as food and set
effects. Percentage values remain decimal ratios. `hpDMGBonus` is active, while
`qiDMGBonus` remains stored for future implementation. A setup trigger with
`event: "heal"` runs its resource action after a healing action resolves and may
declare its own cooldown. Fire-Water and Poison-Water restore `0.8` Vitality;
Water-Fire and Water-Poison restore `1`, each at most once every three seconds.
These four choices alter resource state, so comparisons rebuild the timeline
when either the baseline or candidate uses one.

Script definitions also use direct setup effects. Wraithstrike, Voidrot,
Convergence, Opportunity, Detachment, and Insight use action-time HP/Qi or skill
tag requirements. Revelry declares an `event: "takeDamage"` trigger. After the
event subtracts damage, the trigger checks `selfHPPercentage <= 30` and applies
the 20-second Revelry buff. Its data-defined 60-second cooldown prevents another
application until the cooldown expires. Revelry is marked `altersTimeline`;
Script comparisons rebuild when either the selected baseline Script or the
candidate Script has that flag. Damage-only Script comparisons reuse the
baseline timeline.

Envigorated Warrior's `healingBonus` increases the final combined healing of
matching actions alongside its separate active `dmgBonus` effect.

Royal Remedy T0 grants Cloudburst Healing, including its cancel variant, `0.1`
general Healing Bonus. T1 reacts to every `heal` action from a skill tagged
`CloudburstHealing` and restores `2` Vitality, so all seven Fan Q heal ticks
grant the resource independently. T2 adds `0.086` Effective Critical Rate and
T5 adds `0.046` Direct Critical Rate. Seasonal Edge T2 adds `24.8` Min Physical
Attack and `49.6` Max Physical Attack, while T5 adds `0.028` Physical DMG Bonus.
The T2 and T5 bonuses are unconditional stat effects resolved by the shared
character-stat pipeline. Every Inner Way T2 and T5 stat bonus uses this form
and appears in the appropriate Stats-page total. Physical Penetration is
included in Attunement Stats, while Physical Resistance remains
calculation-only and is intentionally omitted from the page.

Panacea Fan converts Agility to Critical Rate at `0.085 / 280`, capped at
`0.085`. Heavy-tagged healing stores a `0.05` base Healing Bonus plus up to
`0.25` from Min Physical Attack at `750`. Its Silkbind Attribute talent adds
`98` Min and `196` Max Silkbind Attack, then derives both Silkbind DMG Bonus and
the recorded `silkbindHealingBonus` stat at `0.11 / 328`, capped at `0.11`.

Soulshade Umbrella grants Mystic-tagged actions `0.2` DMG Bonus while Panacea
Fan is equipped. It converts Agility to Min Physical Attack at `73.9 / 280`,
capped at `73.9`. Special-tagged healing stores a `0.05` Critical Healing Bonus
plus up to `0.25` from Min Physical Attack at `750`. Its Silkbind Attribute
talent adds `98` Min and `196` Max Silkbind Attack and derives Silkbind
Penetration at `22 / 328`, capped at `22`. Healing and Critical Healing effects
are resolved at each heal action's timestamp.

## Skill Editor categories

The Skill Editor exposes one martial-art category for each unique currently
selected weapon, followed by the always-visible Mystic, General, Buff, Debuff,
and DOT categories. Skill records use the structured action editor. DOT records
edit the actions nested in `periodic` plus interval, first-tick, cadence-refresh,
duration, and stack fields. Skill and DOT records use the structured modifier
editor. Buff and debuff records expose their descriptive and
timing fields plus structured effect-rule editors. Each effect rule supports
requirements, direct or wrapped effect fields, numeric and boolean values, and
parameter-based object values such as Flute distance scaling. Cumulative
`stackEffects` remain grouped by stack tier and each tier contains the same
structured effect-rule editor. Editor overrides persist in browser storage
and replace their matching records in the skill, buff, debuff, and DOT maps
used by rotation calculations and simulations. The resolved maps are part of
the calculation fingerprint, so saving or resetting an override schedules a
fresh result rather than restoring an incompatible cache entry.

### Bamboocut Kite definition status

Heavenwill Gauntlets currently defines Heavenwill Declared (Gauntlet Q) as a
0.9-second Martial Art skill. Its two hits use coefficients `0.2201` and
`0.8804`, with their respective flat physical and attribute bonuses, and both
land at cast end until measured per-hit timing becomes available.

Celestial Mandate is a 1.23-second Falcon skill with five cast-end hits. Its
first four hits each use physical coefficient `0.2293`, `63` flat physical
bonus, and `34` flat attribute bonus, while the fifth uses its larger
finishing-hit values. At cast end it adds `0.1` to the numeric `HeavensWill`
resource. Heaven's Unity is represented as a regular self buff;
while it is active, a second `addResource` action with the standard action
`requirement` adds another `0.2`, for `0.3` total generation.
Heaven's Unity lasts 24 seconds, has one maximum stack, and refreshes its
duration when reapplied.
Explicit resource changes and passive resource regeneration are normalized to
nine decimal places so fractional additions remain stable at requirement and
display boundaries.

Skygrasp Rope Dart currently defines Sky Grasped (RD Special) as a 0.9-second
Special skill. Its cast-end hit uses physical coefficient `1.2503`, `347` flat
physical bonus, and `189` flat attribute bonus. Immediately after that hit at
the same timestamp, it applies or refreshes Heaven's Unity on self.

Snaring Lash [Cancel] (RD Q [Cancel]) is a 0.6-second Martial Art skill. Its
single cast-end hit uses physical coefficient `0.4975`, `137` flat physical
bonus, and `75` flat attribute bonus.

The full Snaring Lash (RD Q) has a 1.7-second cast. It retains the cancel
variant's first hit at 0.6 seconds and adds a second hit at 1.7 seconds with
physical coefficient `1.1609`, `321` flat physical bonus, and `175` flat
attribute bonus.

A requirement with `operator: "not"` and exactly one operand negates that
operand. This allows data-defined component selection to require that a buff or
debuff is absent without adding mechanic-specific calculator branches.

Virtuous Enthroned's three Heavy Attack stages use cast times of `0.4125`,
`0.4375`, and `0.9625` seconds. The first two stages each deal one hit at cast
end. Stage three divides its total `0.6363` Physical coefficient, `177` Physical
bonus, and `96` attribute bonus by 30%, 30%, and 40% across hits at `0.275`,
`0.55`, and `0.7375` seconds.

Wicked Defiance (Gauntlet VC) is a `1.4375`-second Varied Combo. Its single hit
lands at `0.725` seconds with `1.209` Physical coefficient, `335` Physical
bonus, and `183` attribute bonus. A following action at the same timestamp adds
`0.1` Heaven's Will, so the damage resolves before the resource gain.

Righteous Reign 1st Hit is a `0.3375`-second Light Attack whose single hit lands
at cast end with `0.3564` Physical coefficient, `100` Physical bonus, and `54`
attribute bonus. Righteous Reign 2nd Hit is a `0.6`-second Light Attack. Its
total `0.3921` Physical coefficient, `110` Physical bonus, and `59` attribute
bonus are divided 40% at `0.4125` seconds and 60% at `0.6` seconds.

Righteous Reign 3rd Hit is a `0.425`-second Light Attack whose single hit lands
at cast end. Righteous Reign 4th Hit has a `0.4625`-second cast and lands its
single hit at `0.325` seconds.

Righteous Reign 5th Hit (Gauntlet A5) is a `0.6125`-second Light Attack. Its
total `0.4674` Physical coefficient, `130` Physical bonus, and `71` attribute
bonus are split one-third at `0.275` seconds and two-thirds at `0.5` seconds.

Righteous Reign 6th Hit [Cancel] (Gauntlet A6) is a `0.2875`-second Light
Attack. Its cast-end hit uses Physical coefficient `0.8202`, `228` Physical
bonus, and `124` attribute bonus, then triggers Light Attack Falcon at the same
timestamp. Light Attack Falcon is a zero-cast-time `Triggered` skill tagged
`Falcon`; its three `0.748` Physical-coefficient hits land at `0.3`, `0.45`, and
`0.5875` seconds without extending the rotation's sequential cast time.
The uncancelled Righteous Reign 6th Hit retains that hit and trigger at
`0.2875` seconds but has a total cast time of `0.75` seconds.

All Under Justice (Gauntlet Special) is a 1-second Special skill with four
cast-end hits. The first three each use physical coefficient `0.4884`, `135`
flat physical bonus, and `73` flat attribute bonus. The final hit uses physical
coefficient `0.9769`, `270` flat physical bonus, and `147` flat attribute bonus.

Vile Condemned (Gauntlet Charged) contains a one-second
`VileCondemnedCharge` component followed by a conditional release component.
At release start, Soaring High T0, three or more Heaven's Will, and the absence
of the self status `VileCondemnedEndCooldown` select `VileCondemnedEndHit`;
otherwise the component falls back to `VileCondemnedHit`. End Hit applies that
status `0.7375` seconds into its release; the status has no stat effect and
expires after 18 seconds. The weaker hit uses physical
coefficient `7.2178`, `1997` flat physical bonus, and `1088` flat attribute
bonus. End Hit uses physical coefficient
`11.7527`, `3250` flat physical bonus, and `1771` flat attribute bonus. With
Soaring High T6, exactly four Heaven's Will at release start locks a `0.3`
base-damage bonus and `0.1` Critical Damage bonus for End Hit. The normal hit
consumes exactly two Heaven's Will. End Hit consumes three, leaving any
fractional amount above three intact, and consumes one additional point when a
start-bound requirement found Soaring High T6 and exactly four Heaven's Will at
release start. Heaven's Will is capped at four.

When End Hit deals damage, Soaring High T6 triggers a one-point Heaven's Will
refund. The refund uses its own 18-second cooldown, independent of End Hit's
skill cooldown, so resetting End Hit does not also reset the refund. The
triggered refund resolves immediately after the End Hit actions and remains
subject to the four-point Heaven's Will cap.

Bursting Nine is a 1.3-second Mystic skill whose nine hits currently land at
cast end. Its first hit uses physical coefficient `2.546` and `365` flat
physical bonus. The second hit uses 30% of both values (`0.7638` and `109.5`),
while hits three through nine each use 10% (`0.2546` and `36.5`). Its
Single-Target or Area classification remains unset until that mechanic is
confirmed.

Bursting Nine 2 Shots uses a 1.7-second cast. Its first nine hits retain the
base skill's values and land at 1.3 seconds, then a second set lands at cast end.
Each second-set hit uses 50% of the corresponding first-set hit's physical
coefficient and flat physical bonus.

Etherwrath is available to Bamboocut Kite and Stonesplit Strength. Two pieces
add `78` minimum physical attack. With four pieces, every damage action adds or
refreshes one stack of the eight-second Etherwrath buff, up to five stacks,
while Perfect Dodge applies five stacks directly. Each stack adds `0.012` to
the calculation-time attack value multiplier for Physical, Bellstrike,
Stonesplit, Silkbind, and Bamboocut. At five stacks, actions tagged
`MartialArtEffect` also gain `6` Physical, Bellstrike, Stonesplit, Silkbind, and
Bamboocut penetration. Each attack and penetration channel remains a separate
effect entry in the buff definition.

Soaring High T0 enables the Vile Condemned End Hit branch. Without the
`SoaringHighT0` condition, Vile Condemned uses its normal release even when the
resource and cooldown conditions for End Hit otherwise pass. T0 also grants
`0.2` HP damage bonus to actions tagged `Falcon` or `VileCondemned`. Both the
normal and End Hit release components carry the `VileCondemned` tag.
Soaring High T2 adds `74.4` minimum physical attack through the shared stat
effect pipeline.
Soaring High T3 consumes `VileCondemnedEndCooldown` when a damaging action
tagged `Falcon` hits an exhausted target. The reset occurs after the qualifying
damage action resolves and affects subsequent Vile Condemned releases.
Soaring High T4 uses the generic `convert` effect for actions tagged
`VileCondemned`. It converts Final Affinity to Direct Critical at a 1:1 ratio,
up to `0.12` per action, before the ordinary outcome rates are calculated. The
global `0.2` Direct Critical cap limits the amount actually converted; Final
Affinity that cannot fit below that cap remains Final Affinity.
Empirical Edge T0 listens to damage tagged `MartialArtEffect` and applies one
stack of Cognition after the hit. Cognition lasts five seconds, refreshes on an
accepted application, stacks three times, and has a one-second application
cooldown. Each stack grants Martial Art Effects `2` Bellstrike, Stonesplit,
Silkbind, and Bamboocut penetration. Effects carrying both `HeavenwillGauntlets`
and `Falcon`, or carrying `VileCondemned`, gain another `2` of each attribute
penetration per stack. T1 extends Cognition to eight seconds, T2 grants `22.3`
Min Physical Attack and `44.7` Max Physical Attack, T3 raises the stack cap to
five, T4 removes the application cooldown, and T5 grants `0.025` Physical DMG
Bonus. T6 grants Physical Penetration equal to Cognition's total attribute
penetration for that action. Every penetration channel remains a separate
effect entry; T0 does not grant Physical Penetration.
Soaring High T6 grants Vile Condemned End Hit `0.3` base-damage bonus and `0.1`
Critical Damage bonus when the release begins at exactly four Heaven's Will.
An Inner Way tier may listen to final damage events:

```json
{
  "listen": [
    {
      "event": "damage",
      "cooldown": 18,
      "requirement": [
        { "target": "skillTag", "value": "Charged" },
        { "target": "target", "value": "HeavensMight" }
      ],
      "action": {
        "type": "trigger",
        "value": "SkyGrippedReplay",
        "parameter": { "damage": "event.damage" }
      }
    }
  ]
}
```

The event snapshot contains the source action's final damage, action-specific
tags, buffs, debuffs, resources, and target state at hit time. Requirements use
the existing targets against that snapshot. A listener cooldown is local to
that listener and begins only when it successfully spawns its skill. For a
multi-hit skill, the first eligible event starts the cooldown, so later hits in
that window do not replay.
