# Skill and combat-effect data

This document keeps authoring constraints, source exceptions, and unresolved
mechanics. The JSON is authoritative for implemented skill values, timing,
tier effects, and preset sequences. Do not repeat those records here or append
completed implementation history. Remove WIP notes when resolved; retain a
short explanation only when it prevents a likely misinterpretation.

## Source of truth

| Information                                           | Location                         |
| ----------------------------------------------------- | -------------------------------- |
| Castable, component, and triggered skills             | `data/skill/`                    |
| Periodic damage definitions                           | `data/dot/`                      |
| Player effects and target states                      | `data/buff/`, `data/debuff/`     |
| Cumulative Inner Way tiers                            | `data/innerway/`                 |
| Complete talent selection at each rank                | `data/martial-art/`              |
| Resource defaults, caps, and universal event gains    | `data/system.json`               |
| Cast-scoped resource rate overrides                   | `endurance` on the skill record  |
| Preset sequences, attachments, and encounter settings | `data/rotation/`                 |
| Practice target names, types, and attack patterns     | `data/boss.json`                 |
| Martial-art numeric IDs and persisted weapon IDs      | `data/official/profile-map.json` |
| Solo Level and talent rank selection                  | `data/breakthrough.json`         |

For formulas and runtime implementation, use the existing references:

- [Damage and healing formulas](damage-formula.md).
- [Stat stages and snapshots](stat-pipeline.md).
- [Event ordering, readiness, cutoff, and expected-state scheduling](rotation-event-loop.md).
- [Data registration and worker integration](system-architecture.md#adding-data).
- [Talent exceptions and deferred mechanics](martial-art-talent-audit.md).
- [Attunement scope](attunement-audit.md) and [weapon-set coverage](weapon-set-four-piece.md).
- [Preset DPS review gate](dps-snapshots.md) and [localization](localization.md).

The live `SkillRecord`, `EffectDefinition`, `RotationRecord`, and `RotationStep`
contracts are in [rotationTimeline.ts](../src/calculations/rotationTimeline.ts).
Use them instead of maintaining a second TypeScript schema in this document.

## Datamine interpretation

Local references are under `local/datamine/`: `wwm-skills-normal-all.json`,
`wwm-skills-mystic-skills-offensive.json`, `wwm-skills-mechanism-all.json`,
`wwm-inner-way-normal.json`, and
`wwm-martial-arts-normal.json`. Prefer interpreted normal-variant fields;
ignore `versions` subtrees. Do not infer missing timing, route selection,
resource units, or mode-specific behavior from a damage baseline alone.

- Skill `byLevel` arrays use **level minus one**, including leading nulls.
  `aggregated` contains level-independent values. Implemented offensive
  Mystics use level 71; Smolder, Dragon Head - Tide, and Ghostly Step - Umbra
  use `enlightenmentCurves`. Martial-art coefficients resolve from the normal
  curve's `SKILL_POWER_PRO_ATK` / `SKILL_POWER_PRO_HEAL`, with
  `SKILL_ADD_W_ATK` as `phyBonus` and `SKILL_ADD_WX_PRO_ATK` as `attrBonus`,
  read at **level 100** (array index 99) unless the value is `aggregated`.
  Derive physical coefficient, attribute coefficient,
  and flat physical bonus independently. Preserve source precision, retaining
  derived values to 12 decimal places rather than tooltip rounding.
- Runtime Inner Way `bySoloLevel` arrays use **the actual Solo Level**; slot 0
  is unused. Prepend that slot when importing source arrays. Null means no
  bonus, with no interpolation or talent-rank fallback. Resolve through
  `innerWayDefinitionForSoloLevel` without mutating the catalog.
- Find a martial-art source rank by `talents.ranks[].unlockLevel`, not array
  position or world level. Its `talentIds` are a complete selection, not
  additions to prior ranks. Resolve them against `talents.definitions`.
  Runtime `talent[rank]` is likewise a complete independent array; missing or
  empty ranks contribute nothing. Solo Level and talent rank are separate.
- Rank-14 Additional Attack uses `effect.flatAttackBonus` to scale `phyBonus`
  and `attrBonus`, scoped by the martial-art skill tag. The normal Strategic
  Sword, Heavenwill, and Skystrike definitions also use
  `effect.coefficientBonusWithoutFlatAttack` when both flat terms are zero.
  Other arts do not inherit this coefficient exception.
- Preserve internal IDs used by saved data. Display names and translations do
  not change identifiers. Renaming persisted fields requires migration.

### Deliberate source exceptions

These are reasons to preserve existing data when refreshing from the datamine,
not a second catalog of current values:

- Smolder's tick factor remains **0.0532**, confirmed by observed damage;
  the exported **0.045** conflicts with that evidence. DOT flat bonuses remain
  inactive under the current damage formula.
- Dragon Head - Tide uses the confirmed pre-multiplier physical/attribute
  coefficient **16.3591422641509** and physical bonus **2483.50943396226**,
  followed by its upgrade/enlightenment factors. Do not replace that baseline
  with a conflicting export without new evidence.
- Panacea's extra **Mystic Precision Enhancement** talent is intentional despite
  its absence from the rank-13 source list; see the talent audit.
- Echoes of Oblivion's Karma reduction is **10 flat Bamboocut Resistance** at
  every tier. The conflicting T6 wording does not turn it into a percentage
  or add a second reduction.
- Vendetta's stated duration increases mean **total durations**, not seconds
  added to the base. Rodent Hunt uses the confirmed **20-second** window despite
  text mentioning 15 seconds. Vendetta Mark means the same caster-specific Vendetta Token
  target debuff, not an additional status. Saved manual Buff events migrate to
  Debuff events, and saved Token overrides retain their values in the Debuff
  category with self-targeted Token actions and conditions retargeted.
- Mortal Rope Dart Tokens of Gratitude are intentionally ignored at the user's
  request. Rodent's Resilience uses the requested **1.5-second hold**, not the
  export's animation interrupt. Do not silently introduce token costs.
- Rodent uses the confirmed **nonmatching PvE route**; matching routes are PvP.
  The raw export-distance to editor-meter mapping is still unverified.
- Attr. Attack DMG Up is already represented by attribute channels and the
  primary-path multiplier. Its empty talent effect must not add that bonus again.
- Rising Momentum is buff `1055004`: a successful deflection adds 2% HP damage
  for `buff_maxtime` 5 seconds, capped at `buff_sameadd_max` 10 stacks. It is a
  general buff with no weapon lock, and its application is gated on a boss
  target through the `targetType` requirement rather than a skill condition.
- Yaksha Rush authors only the two base-animation hits, `230006101` at 0.2x and
  `230006102` at 0.8x. The base route also lists a simultaneous `230006105` at
  0.8x for its defense-break reward, which matches neither that reward's 0.5x
  skill text nor an unambiguous layer rule; the text value is left unimplemented
  rather than guessed. Its Vitality cost and cooldown come from the community
  wiki, not the export, which carries no resource-cost or cooldown fields. It
  uses a plain `cooldown` because it is currently the only Mystic carrying the
  Break Defense tag; add a `cooldownGroup` when a second one appears.
- Summon Lightning (`75120051`) applies Thunder Summoning at 0.403 seconds and
  ends at 1.591 seconds. Both values come from the export route rather than a
  measured schedule, and the export carries no cooldown or resource cost. Its
  30% is the source's independent DMG Bonus (`calc_cause_change` cause 50), so
  it belongs to the Mechanism damage category and not to DMG Bonus Category 1.
  The export's `buffremove_add_buff` grant of `1500232` is a client-side usage
  lock with no combat effect.

## Authoring rules

Use existing data mechanisms before extending the engine. Prefer explicit tags,
requirements, actions, and definition modifiers over skill-ID conditionals.
Percentages are decimal ratios unless a runtime parameter explicitly uses
percentage points. Keep IDs stable and references resolvable.

### Timing and state

1. Modifiers snapshot when the owning skill/component starts. Use them for
   timing and cast-wide state, not bonuses that must inspect each hit.
2. Actions resolve chronologically. An action snapshots state before its own
   changes, so on-hit applications affect later hits, not the triggering hit.
3. Buff/debuff effects and ordinary requirements inspect action-time state.
   A requirement `{ "resolveAt": "skillStart", "operand": [...] }` instead
   freezes its result at the owning component's start.

Normal action `time` is seconds from cast start. Keep action arrays in
nondecreasing time order; array order resolves ties. Actions may occur after
cast completion. Effect actions may use `time: "expire"`; refresh invalidates
old expiry actions, and consumption does not count as natural expiration.

Cast time excludes ping. `ignorePing: true` suppresses latency for that skill.
`triggerPing: true` opts a triggered skill into paying the rotation ping when
it is dispatched; ordinary triggered effects remain latency-free unless they
declare it. Composite parents and components must declare exemptions
deliberately to avoid charging latency twice. Component selection happens
before its ping gap; modifiers and start-bound requirements resolve at the
actual delayed start.

A trigger action with `queueTime` is accepted at that earlier local time and
executes at its normal `time`. `sourceEffect` and `queueRequirement` are
checked when the input is accepted, so a queued execution may occur after the
tracked source state expires. A queued trigger extends the owning ordered
row's effective cast through the queued skill's delayed start and completion;
its `time` is the execution marker, not the queue-acceptance marker.

### Tags and martial-art context

- `DirectDamage` and `DOT` distinguish direct hits from periodic damage.
- `Triggered` and `SubAction` hide internal skills from the castable selector.
- `MartialArts` is the broad All Martial Arts scope. Singular `MartialArt` is
  a narrower attunement tag; they are not interchangeable.
- `MartialArtEffect` identifies secondary martial-art effects. Such effects can
  also carry `MartialArts`; use the actual intended bonus scopes.
- Use `VariedCombo` consistently. Tags are exact and case-sensitive.
- Every castable `MartialArts` skill declares canonical `martialArt` and physical
  `weapon`. Triggered components omit them to inherit context without switching
  the active weapon. General and Mystic skills do not switch martial arts.

`martialArt` requirements match the canonical martial-art tag on the action.
`equippedMartialArt` checks an ID in either equipped slot. `currentMartialArt`
and `currentWeapon` inspect active timeline state; these are distinct questions.

Attunement `tags` are ANDed; a nested array is an OR group. `excludeTags` rejects
matching actions. Use the shared matcher for damage and healing.

A castable skill may hand its damage to `Triggered` component skills, and matching
runs against the component that actually deals the hit. A component that continues
its parent's hits must therefore repeat the parent's skill-category tags
(`Charged`, `Special`, `MartialArt`, `Light`, `Heavy`, `VariedCombo`, `Pursuit`).
Piercing Dart's seven `PiercingDartSweepN` hits repeat `Heavy` and `Charged` for this
reason. `MartialArtEffect` marks a separate summoned attack rather than a
continuation, so it is deliberately exempt. Trigger actions do not inherit parent
tags. `tests/attunement.test.ts` checks explicitly authored component categories.

Scarlet Spin Resonance uses `MartialArt`, including lower-tier cadence summons.
Dreamwrought Bubbles Resonance uses `Heavy` and `Charged`. Both also carry `Umbrella`
and `ReturningUmbrella` for weapon and returning-umbrella bonuses, without parent
identity tags. They share `skillBreakdownCategory: "Resonance"`.
Saved skill overrides migrate the former shared Resonance and summon definitions
to both routes, preserving customized damage and summon actions.

A Scarlet Spin throw that spends Fragrant Song also crits the Resonances that throw
summons, both the returning umbrella and its perfect catch. A throw spends the buff
at its own start and the next throw starts on the same instant its catch fires, so
neither "Fragrant Song is up" nor "the newest throw" identifies the owning throw:
a nested trigger reports the cast as its source, and the spent buff is already
gone. The throw therefore clears and re-primes the hidden `FragrantSongResonance`
marker at its own start, gated on Fragrant Song at skill start, and `Resonance`
carries the crit as a modifier on that marker. The clear scopes the bonus to one
throw, so its duration only has to outlive that throw's own Resonances. It is
causal, not timestamp-based: the catch trigger precedes the next throw's trigger in
the action array, so the catch's Resonance resolves before the next throw clears
the marker.

Attack categories are independent, not exclusive. A charged attack carries `Charged`
plus the attack it charges: `Charged` and `Heavy` for Avalanche, Burning Heart, and
Piercing Dart; `Charged` and `Light` for Snowparting's charged light. `Charged` alone
is for a dedicated charged move that is neither, such as Vile Condemned. Gate an
effect on the combination when it should only cover one of them, as Exquisite
Scenery's T6 does with `Heavy` and `Charged`.

### Requirements and dynamic values

Requirement arrays are AND groups. `operator: "or"` supplies alternatives,
including nested AND arrays. `operator: "not"` takes exactly one operand.
`self` checks buffs or active tier/setup conditions; `target` checks debuffs.
`skillTag` checks the action's tags. `targetType` matches the rotation's
`targetType` practice target. Both dummies count as a boss, so the boss role is
implicit: do not gate a mechanic on `targetType: "Boss"` when its source says it
works against a boss, because that would exclude `Dummy` and `DummyAttack`.
Express those unconditionally, as `vsBossDmg` is. Tracked-effect `stack` means at
least that many stacks; `"max"` means its resolved maximum.

`battleStarted` is true only at or after the fight-start anchor, so a rule can
exclude prepull. Target debuffs and DOTs are already rejected during prepull; use
this for a self effect that should only accumulate in-combat, such as a hit
counter. An action-level anchor opens the fight on its own resolved time, so an
action sharing that instant with the anchored hit is already in combat.

Numeric targets include `resource`, `distance`, `enemyCount`, `selfHPPercentage`,
`targetHPPercentage`, `targetQiPercentage`, and `endurancePercentage`.
Comparisons support `>=`, `>`, `<=`, `<`, `==`, and `!=`. Use `amount` for a
constant or `compareTo` for another numeric runtime state. HP/Qi percentage
parameters use percentage points, whereas stored HP/Qi ratios use 0–1.
`endurancePercentage` is current Endurance against its own maximum; it is absent
while Endurance has no tracked maximum, and an absent value never satisfies a
comparison.

Supported dynamic-value contracts include:

| Function                     | Contract                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segment`                    | `param1` is the input, `param2` the ordered thresholds, `param3` the results; results have one more entry than thresholds.                                                                              |
| `switch`                     | `param1` selects a key in `param2`; `fallback` covers initial expansion or an unmatched key. Tier/setup conditions can supply boolean keys.                                                             |
| `multiply`                   | Multiply parameter `param1` by scalar `param2`; numeric strings are accepted.                                                                                                                           |
| `byStack`                    | `param1` names the tracked effect, `param2` is the per-stack amount, and `target` defaults to `self`. In a modifier, the value is frozen for the cast.                                                  |
| `segment` on `enduranceLost` | `enduranceLost` is Endurance **currently below its maximum**, snapshotted per damage action: at 50 of 120 it reads 70. Recovered Endurance counts as un-lost again. It is not a running total of spend. |

`segment.mode` is `LowerBoundInclusive` by default: equality enters the next
interval (`[lower, upper)`). `UpperBoundInclusive` keeps equality in the preceding
interval (`(lower, upper]`). Unknown modes do not resolve. Omitting the mode
preserves version-3 overrides and existing migration behavior. For example:

```json
{ "function": "segment", "param1": "distance", "param2": [2, 3], "param3": [0.02, 0.03, 0.04] }
```

The default selects 0.03 at exactly 2 and 0.04 at exactly 3. Do not change
boundary semantics while simplifying a definition. `actionTime` refers to the
original cast/action time, allowing a segmented modifier to move different hits
by different offsets. Timing resolves as
`max(0, originalTime + sum(castTimeModifier)) × product(castTimeMultiplier)`.
A switched cast time is locked at cast start. Switched action values can also
use `resolveAt: "skillStart"`.

### Actions

| Type                                            | Important semantics                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `damage`                                        | Independent `phyCoef` and `attrCoef`; omitted coefficients are zero. `attrBonus` applies only to the primary attribute. `rateRoute` selects the outcome set and `averageAttack` pins the attack to the range average; see [damage formula](damage-formula.md#per-outcome-damage).          |
| `heal`                                          | Uses `phyCoef` and `silkbindCoef`; restores Self HP and reports excess as overhealing. Always resolves at the average of each attack range and rolls the healing route. `HOT` identifies healing over time.                                                                                |
| `apply`                                         | `value` is an effect ID; `target` is `self`, `target`, or `player`. Default stack is one, capped by the definition. Action duration overrides definition duration. A `target` application before the fight-start anchor is rejected.                                                       |
| `consume`                                       | Removes one stack by default, or all with `stack: "all"`. `value: { operator: "first", operand: [...] }` selects the first available effect.                                                                                                                                               |
| `extend`                                        | Adds `duration` to an existing expiry; missing, expired, or permanent states are unchanged. Use `duration`, not `extension`.                                                                                                                                                               |
| `trigger`                                       | Starts another skill at the event time without spending sequential cast time. The triggered skill's cooldown still applies. `sourceEffect` names a self effect whose application source must match the trigger row's source, preventing a delayed chain from attaching to a later refresh. |
| `clearCD`                                       | Resets the named skill/application cooldown. Optional positive integer `charges` restores only that many spent skill uses; `seconds` instead reduces pending recovery timestamps by that duration, clamped to the current time. Do not combine `seconds` and `charges`.                    |
| `setResource`, `addResource`, `consumeResource` | Replace, add, or subtract numeric resource `amount`; consumption accepts `"all"`. A consumption that actually reduces a resource with a `resourceSpendRegenDelay` also suppresses its regeneration for that delay.                                                                         |
| `setHP`, `takeDamage`                           | Set absolute Self HP or subtract absolute incoming damage.                                                                                                                                                                                                                                 |
| `setTargetHP`, `setQi`                          | Set target ratios. Qi reaching zero applies Exhausted; its expiry restores Qi through data.                                                                                                                                                                                                |
| `emitEvent`                                     | Dispatches a named targeted accumulator check, not a general combat-event broadcast.                                                                                                                                                                                                       |
| `replay`                                        | Multiplies recorded final damage by `coef`, bypassing the formula and damage events. Requires a `Replayed` skill.                                                                                                                                                                          |
| `resolveRecording`                              | Effect expiry action that settles the matching recording activation.                                                                                                                                                                                                                       |

`reapply: false` leaves an active effect untouched. Otherwise applications add
stacks; definition `refresh` decides whether expiry resets. An application
cooldown can reject the attempt. Trigger applications may add conditional
`additionalStack`. `player` applications fill self then teammates up to
`groupSize`, then replace the earliest-expiring recipient copy.

For `consume` with `first`, `resolveAt: "skillStart"` remembers the selected
effect. If it expires before consumption, do not fall through to another one.

### Cooldowns, components, and attack responses

`cooldownGroup` shares readiness across skill definitions; otherwise the skill ID
is the key. `cooldownUses` with default `cooldownRecovery: "window"` grants uses
within one window. `"independent"` gives each spent charge its own recovery.
Shared definitions must agree on capacity and recovery mode. Modifier changes
do not move already-pending recoveries. Explicit casts wait; unavailable triggers
are rejected. Generated waits are output only, not saved rotation steps.

`subAction` is an ordered list of `{ value, requirement?, fallback? }` references.
The parent runs first. Each component spends cast time but retains parent
attribution. Select primary/fallback at dispatch and lock that selection.
Equal-length value/fallback arrays lock the whole sequence from one check.
Conditional candidates must be leaf components; unconditional nesting is allowed.
Reserved action slots keep attachments stable when alternatives differ, and
attachments to unselected actions are skipped.

`silent: true` components have no actions, cooldowns, attack responses, or
skill-start notifications. `waitForRequirement: true` requires a silent,
unconditional prefix; see [readiness after charging](rotation-event-loop.md#readiness-after-charging).

`attackResponse` declares `onSuccess`, optional `endMargin`, `durationFrom`, and
`perAttack`. An incoming hit within the window is avoided and triggers success
at impact, preserving the defensive cast's attribution/context. Default success
is once per cast; `perAttack` permits every positive incoming hit. No incoming
attack means no success reward. `durationFrom` shares a response window without
forcing the same blocking cast duration. Full alignment rules are in the
[event-loop reference](rotation-event-loop.md#incoming-attack-readiness-and-success).

## Effects and Inner Ways

Skills carry no `description`. Source record ids and the reasoning behind a skill
belong in this document and the per-path draft notes, not in the data the app
loads. Buff and debuff definitions do keep a `description`, because the timeline
shows it as a tooltip, and those describe how the effect behaves rather than
citing a source id.

`badgeColor: "red"` selects the red timeline effect badge independently of the
definition's source file. Omit it for the default badge; DOT styling takes precedence.

`duration`, `maxStack`, `cooldown`, and `refresh` control tracked-effect lifetime
and application. `effect` supplies action-time rules. `stackEffects[n - 1]`
replaces `effect` at stack n and must contain the **complete cumulative value**,
not an increment. Provide entries for every reachable stack count.

`global: true` contributes always-active setup rules without a tracked buff.
`shared` identifies party-shared debuffs; `showCoverage` requests coverage output.
`hidden: true` marks an internal bookkeeping effect that drives the simulation but
has no counterpart the player reads, so the timeline omits it. Use it for counters
such as the Stonesplit Strength `Cadence` and the Dust Phantom Umbrella summon
cadence, which would otherwise appear as meaningless buff plates. The effect still
resolves normally; only its display is suppressed.
Internal self-buff counters may declare `parentEffect: "BuffId"` to follow that
buff's lifetime and source attribution. Parent refreshes preserve the counter's
stacks while updating its expiry/source; parent removal, expiry, or replacement
removes its counter. Use `onMaxStack` for count-based threshold triggers rather
than a damage/healing accumulator. Wind uses separate counters for ordinary and
Enhanced Rodent Rampage so progress cannot transfer between activations.
Permanent seeded effects are not consumed and merge with later applications.
Canonical conditional rules use `{ requirement: [...], effect: {...} }`.

`{ target: "EffectId", modify: {...} }` modifies a definition. Scalar fields
override; `modify.effect` appends to the existing effect array. Requirements gate
the modification. Setup `buffDurationBonus` scales resolved self/player buff
duration and uses the applying skill's context, including indirect applications.

Inner Way tier selection is cumulative from T0 through the selected tier.
Entries contain `effect`, reactive `trigger`, or final-damage `listen` rules.
Damage triggers run in tier order, so a later rule may observe a stack applied
by an earlier rule on the same hit. `tags` control path eligibility; unassigned
Inner Ways remain usable in Mixed.

Every Inner Way and set declares `altersTimeline`. Keep it true whenever timing,
triggers, resources, stacks, effects, healing, cooldowns, or DOTs can change.
Only event-invariant damage/stat changes may reuse a baseline timeline. Script
and other setup comparisons must follow the same rule.

### Stat effects

Use `rawStat` for permanent progression/gear/Inner Way bonuses and flat talent
attribute attack, before talent scaling. Temporary conditional buffs stay in
their ordinary stat stage. `stat` changes ordinary stats; `effectiveStat` changes
derived contributions. Do not duplicate calculations in UI components.

Talent formulas read immutable raw stats, including flat attribute talents but
excluding later talent/food bonuses. Use raw source names for these conversions.
A formula source may be a stat name or `{ "max": ["body", "power"] }` to select the higher source value from the same stat snapshot. All named sources must be finite numbers. Formula values compute `source × multiplier + offset`, with optional `min`,
`max`, and explicitly justified `round`. See the [stat pipeline](stat-pipeline.md)
for effective-source resolution and final-value overrides.

Damage categories such as `dmgBonus`, `baseDMGBonus`, the Mechanism category's
`globalDmgBonus`, `dotDamage`, and per-channel bonuses are not interchangeable;
use [damage-formula.md](damage-formula.md) for their order and scope.

### Triggers, accumulators, and recording

Ordinary Inner Way triggers default to `damage`; supported event-specific setup
rules include `heal`, `takeDamage`, `skillStart`, and `attackResponse`.
Skill-start triggers run after cast acceptance but before timed actions, including
empty and triggered skills, excluding silent components and periodic rows.
Use `attackResponse` for successful defense rewards, not attempted cast start. The
`PerfectDodge` variants and `DeflectSuccessful` set `attackResponse.fallback`, so
their response rewards resolve at cast start when no incoming attack is selected.
`Dodge` keeps the same response window but has no fallback, so it requires an
incoming attack. When a following attack is available, the normal attack-aligned
response is preserved.

A trigger's `cooldown` is independent of the cooldown of its actions. A setup
effect's `trigger` may be a single rule or an array of rules that each react to
their own event; each rule keeps its own cooldown. An active self-buff may
declare `trigger` with the same event and requirement contract as a setup trigger.

A trigger's `action` may be one action or an ordered array. Array actions run in
order within the single pass that fires the trigger, so a `consume` placed before
a `trigger` completes before the triggered row is queued. Timestamp ordering
cannot express this: two damage actions sharing a timestamp both resolve before
either queued row runs, so a buff consumed inside the triggered skill would still
be present for the second action. The cooldown is stamped once after the whole
pass. `DivinecraftSolidFoundation` uses this to spend the buff on the hit that
unleashes it, so a multi-hit skill cannot trigger it twice. Buff triggers run after the ordinary
Inner Way triggers on damage/heal/take-damage events. `oncePerSkill: true` on a
setup or buff trigger accepts only the first damage action of each stage,
including composite components; it excludes probability-weighted expected proc
rows. It does not treat a later hit as the first when the buff appears mid-stage.
Rodent uses this with `additionalStack` to count Infernal/Mortal stages twice.
`hitWindow: { count, seconds }` counts eligible damage timestamps, includes the
lower time boundary, and keeps receiving hits during cooldown. Expected rows
carrying `hitProbability` do not count, even at probability one; sampled actual
hits do. Heal and non-damage actions never count.

`damageOutcome` rules run after the resolved outcome and affect later hits.
Insightful Strike restarts its configured decayDelay (seconds) on each eligible
Affinity outcome; failed outcomes leave that deadline unchanged.
They can use a decaying outcome resource with `gain`, `decayRate`, `threshold`,
and required `resetTo: 0`. Expected and sampled tracking are separate. Retain
correlated expected states except for the shared tiny-state rule: individual
probability below `1e-5` and matching 0.1-second timing buckets merge with every
numeric state field probability-weighted, including Focus and stacks. Insightful
Strike instead merges all tiny resulting branches within each Concentration
activity category without timing buckets, favoring calculation speed. Sampled
states remain concrete. Specialized random-outcome and
accumulator contracts are documented in [system architecture](system-architecture.md).

Buff accumulators can listen for damage or overheal, perform named checks,
limit successful triggers, and snapshot attack-based thresholds on application.
Each recipient's overhealing contributes separately. A finite listener budget
stops new triggers without ending the buff; refresh/reset semantics belong in
the definition. `group: true` heals use party recipients, not enemy count.

A final-damage listener supplies `parameter: { damage: "event.damage" }` to a
`Replayed` skill. Requirements use that hit's tags/state; the listener cooldown
starts only after it successfully spawns the skill.

A timed effect can instead declare `recording: { event: "damage", requirement?,
action: { type: "trigger", value: "ReplaySkillId" } }` and an expiry
`resolveRecording` action. Expiry or reapplication closes the old window before
spawning its replay. Hits exactly at expiry are excluded; empty windows produce
nothing. Replay coefficients apply to final source damage and cannot recurse.
Recording windows are not extended with ordinary `extend` actions.

`damageGroup: { id, name }` assigns Inner Way damage to a runtime breakdown
owner instead of an explicit cast. `collectBoostDamage` names the enabling
buff for counterfactual attribution; delayed applications use
`boostDamageSource` to retain that cast's ownership. Neither changes persisted
rotation steps or the damage formula.

Replay-only effects use numeric replayDmgBonus, evaluated after source damage
and the replay coefficient. Wildstride (Draught) is its sole authored source.
Ordinary damage and healing ignore this field; normal damage bonuses are not
reapplied to replays.

### Periodic and chance-applied effects

`periodic` separates cadence from lifetime. `interval` must be positive;
`firstTick` defaults to it and may be zero. `resetOnRefresh: false` preserves
cadence; true restarts it. `tickOnExpire: false` excludes the exact expiry tick;
the default endpoint is inclusive. No duration means ticking until removal or
combat cutoff. Resource `amountPerTick` adds to `amount` by zero-based tick index.

Consuming/removing the last stack cancels future periodic actions. A DOT deals
one copy per active tick, independent of stack count, and ignores flat bonuses.
Use ordinary expiry actions for delayed non-DOT attacks. Future ticks inherit
the cast that refreshes or extends the effect. A DOT row still counts as a
`damage` event for `trigger` rules, so a rule that reapplies the same DOT must
require a non-`DOT` hit; `data/dot/divinecraft.json` does this so its burns
cannot sustain themselves.

`onMaxStack: { consume: "all", trigger: "SkillId", triggerTags?: [...] }`
consumes the effect and cancels pending ticks before spawning the threshold
skill. Overflow produces one burst; later actions cannot see the threshold
stack. `triggerTags` affect only that spawned instance.

Action `chance` accepts a number or supported dynamic value; finite results are
clamped to 0–1, invalid results rejected. The supported expected periodic case
is a refreshing target DOT applied by non-DOT damage with preserved cadence;
expected threshold payloads are damage-only triggered skills without cooldowns.
Trigger `apply` actions may use an array of effect IDs to share one proc roll.
Bitter Seasons uses this for its five-second Poison and ten-second defense debuff:
applications add and refresh each effect's own stacks; Poison always deals one
0.02-coefficient tick regardless of stack count. T3 incoming-hit procs retain
10% chance even when T4 raises outgoing-hit chance to 15%.

Chance-applied nonperiodic target debuffs support unconditional damage effects.
They reuse the periodic tracker's stack/expiration distribution. Damage resolves
at each possible stack count before weighting, rather than applying average
stacks to a nonlinear formula. For a grouped DOT/debuff application,
tick damage uses the debuff distribution conditional on that tick occurring;
the shorter DOT lifetime can restart its cadence while debuff stacks persist.
Poison uses the same expected battle-clock alignment as Weeping Blood, limiting
it to one probability-weighted tick per battle second. Its linked defense-debuff
distribution uses the same clock; sampled simulation retains exact application
cadence. This approximates Poison tick timing, not its application chance.
As with other shared-clock DOTs, this can change damage-triggered cooldown and
resource feedback. In particular, many tiny exact-cadence tick weights can occupy
the shared Vitality cooldown; grouping them changes expected Vitality and can
therefore change the Mystic damage penalty even when raw Poison damage barely changes.
This is not joint tracking of unrelated chance systems. Keep this support
boundary when extending data.

`reductionGroup` in a damage effect groups party-shared defense and Physical
Resistance reductions. Each field takes its strongest reduction within the group.
Bitter Seasons' existing global T1/T6 controls therefore supply permanent maximum
stacks without adding a second defense reduction to local Poison procs; a local
T6 debuff can still supply its five-stack resistance reduction alongside global T1.
Existing saved global-debuff IDs remain unchanged. Bitter Seasons tiers opt into
`showCoverage`: reported average stacks use marginal expected stacks at output
actions, and Max Stack Coverage integrates the probability of being at maximum
stacks between applications and expiry,
clipped to the combat window. Coverage never fabricates a guaranteed tracked debuff
or reuses Poison's shorter lifetime. Permanent global copies at maximum stacks report 100% Max Stack Coverage.

`expectedTickAlignment: "battle"` deliberately approximates expected DOT timing
on shared battle-clock boundaries, with no partial ticks; an application waits
for the next strictly later boundary. Simulation retains concrete cadence and
ignores expected-state merging. Runtime `damageScale` and `hitProbability` are
not authored fields. See the [event-loop reference](rotation-event-loop.md)
for probability storage, correlation, and cutoff behavior.

## Resources and rotation records

Resources default to zero unless initialized. Actions clamp to the named maximum
when supplied; Vitality may go negative to expose deficits. Regeneration starts
at battle start, not prepull. `infiniteResources` skips gains, costs, and regen
for those resources. Universal gains belong in `system.json.resourceEvents`.
Apply direct Mystic costs once; triggered follow-ups must not pay them again.

Vitality and Endurance both seed from their own maximum stat at full, in the
preset bundle and the rotation editor. Endurance is therefore always present as
a resource, so `endurancePercentage` and `enduranceLost` resolve for every
character. No authored skill currently spends Endurance, so `enduranceLost`
reads 0 and low-Endurance conditions are inactive until costs exist.

Endurance also regenerates at 10/s and can be spent. Regeneration and
consumption are separate rates held over cast-relative windows, and a direct
spend suppresses regeneration for `system.json.resourceSpendRegenDelay`. See
[Endurance rates](#endurance-rates).

`enduranceLost` is a net measure, not an accumulator. Cumulative spending has no
general parameter: `row.resourceConsumption` is per-cast, and the final
`timelineResourceSummary` carries gross totals. A mechanic that needs its own
running threshold, such as Wildfire Spark T3's "after consuming a total of 50
Endurance", needs a dedicated accumulator rather than either of those.

Skill steps and explicit Delays are sequential. Attached events are stored
immediately before their anchor and reference zero-based action indexes or
`"start"`; optional `trigger` selects the declared trigger-action ordinal.
A Martial Art event is start-only. Timed encounter events consume no cast time;
`eventTimeReference: "battleStart"` makes their times fight-relative. In the
editor, entering a start time on an event makes that event explicitly
battle-time-anchored; the editor retains its prior action target only as
navigation metadata and the runtime gives `startTime` precedence. Moving a
fixed-time event with the previous/next controls removes the explicit time and
reattaches it to the selected action. `Switch Martial Art` and explicit `Delay`
remain in the editor's Action category and retain their existing action/sequential
semantics. Legacy attached Take Damage records without an explicit battle-start
reference are converted to fixed time during migration; battle-start records
preserve explicit attachments so reattachment round-trips through the editor.
`editableCastTime: true` permits a step duration override before timing modifiers.
`editableCastTime: { effect, max, required? }` makes a step duration the authoritative held
cast duration and mirrors it onto the named self effect. The cap is applied
before anchor timing, editor display, and the sequential scheduler. An omitted
duration uses the configured maximum; `required: true` additionally prevents
an authored/imported step from omitting that duration.

`start: { step, action? }` chooses battle start; omitted action means cast start.
Composite action indexes use the same structural expansion as the simulator,
reserving the larger action count of each primary/fallback component pair,
including sequence alternatives. Layout times are authored estimates; live
requirements and timing modifiers still resolve in the event loop.
Only ordered or live-attached rows can be selected as a fight-start anchor; fixed-time
rows are not valid starts. Preserve attachment indexes and fight-start anchors when
editing/migrating data.
Generated waits and periodic rows are never authored rotation steps.
All editor event timestamps are shown and entered relative to battle start.
Authored fixed-time events already store that reference; generated target attacks
carry simulation-absolute times and must subtract the battle anchor for display.
Changing the anchor preserves authored battle-relative event offsets.

Without Battle End, the final ordered item determines cutoff, including its
same-time causal follow-ups. A trailing explicit Delay extends combat. With
Battle End, damage at its timestamp is excluded. Generated effects never extend
combat on their own; see [combat cutoff](rotation-event-loop.md#combat-cutoff).

Self HP events store absolute HP; the UI percentage is only an input boundary.
Take Damage is an independent timed event. A manually authored event with zero
damage still dispatches defensive responses and Take Damage effects even though
it removes no HP. Target HP is depleted only when the rotation supplies maximum
`targetHP`; otherwise it stays at the implicit state unless explicitly set. Qi
depletion is authored rather than calculated. A preset's Qi events read as repeating
ramps of `0.5999`, `0.3999`, `0`; the `0` event applies Exhausted, and its expiry is
the only thing that refills the meter. The target is then immune to Qi damage
for four seconds (user-confirmed). A following depletion ramp starts after both the Exhausted
duration and that immunity window. Presets preserve each ramp's depletion gaps
by shifting its thresholds four seconds later per preceding Exhausted window.
Might retains its original hit-attached Qi timings by user instruction.
Shifted hit attachments become battle-relative timestamps; thresholds at or
beyond Battle End are omitted. This is authored encounter timing, not an
automatic Qi-damage calculation or a restriction on custom editor events. A rotation may stop its last ramp early, but every
authored event must fall inside the fight. Move events use nonnegative whole-meter
distances, including zero meters. Initial distance is one meter.

Preset `martialArts` controls eligibility. Presets remain immutable; editor
changes and imports produce custom records. Skill overrides replace records in
the worker's resolved maps and must participate in calculation fingerprints.
Use existing import/migration code rather than restating export schemas here.

## Data previews

`data/preview/<id>/` mirrors the folders under `data/` and supplies alternate
versions of records, selected from Settings. A preview file holds whole records
under the same ids the shipped file uses, so a previewed record reads exactly as it
would in `data/` and an omitted field is genuinely absent rather than inherited. The
one exception is an Inner Way file, which supplies individual `<Id>T<n>` tiers so a
version that changed one tier does not restate the whole definition and its
`bySoloLevel` tables.

A preview may introduce records the shipped data does not define, which is how a
version adds a sub-action beside the record it replaces; it may not introduce a new
Inner Way, because the selectors enumerate the shipped set. Name a new sub-action
for what it is, keep `SubAction` or `Triggered` so it stays out of the castable
list, and repeat the parent's damage-identity tags so attunement and set matching
resolve on the component that deals the hit.

A preview is layered under the user's own skill overrides, so it sets the baseline
they edit against rather than competing with them. Resolved preview records are
part of the worker bundle, so a previewed coefficient, duration, or tier reaches
every result and invalidates the caches computed without it.

## WIP and evidence gaps

An empty record is preferable to invented mechanics. Treat tests using synthetic
hits as verification of rules, not evidence that a real skill's timing is known.
The talent and weapon-set audits hold their detailed deferred cases; the list
below keeps cross-cutting blockers and outstanding skill evidence.

### Model limitations

- Qi damage bonuses are data-only. Endurance is a tracked resource seeded from
  `maxEndurance`, so `endurancePercentage` and `enduranceLost` both resolve, but
  no authored skill spends Endurance yet. Those effects therefore read zero:
  Battle Anthem T6, and every Wildfire Spark tier. Wildfire Spark T3 additionally
  needs a dedicated cumulative accumulator, which is not a general parameter.
- Wind attack HP drain/leech remains unmodeled. Insightful Strike uses its
  Concentration tracker for damage-based HP recovery. Song of Tang HP drain is
  intentionally ignored by user instruction.
- Blade Momentum and Battle Will retain confirmed starting values but no
  generation, spending, or caps. Do not treat their current fixed state as a
  completed resource model.
- Enemy-healing reduction, movement slow, control immunity,
  breath-hold, and some talent-specific dodge-window changes remain unsupported.
  Existing incoming-attack response windows do not resolve all those mechanics.
- Eonpour, Skyspeak, and Volutefit currently provide stat tiers only; other
  mechanics await combat-skill and state wiring. See their JSON and the talent
  audit. Mistwing is fully wired and is offered on Draught and Wind.
- Yaksha Rush's defense-break rewards are unresolved: breaking the target's
  defense is not a modeled timeline state, so its extra damage, 10 Qi damage, and
  Tenacity grant have no representation. Do not attach them to the base hits.

### Timing and source validation

- Non-Gauntlet General Deflect timings retain the shared placeholder until
  weapon-specific measurements are available.
- Might still has provisional cast-end multi-hit timings outside its measured
  routes. Its available path status is not proof that every timing is verified.
- Addled Mind's supplied outside-PvP Level 100 timing is unverified in play.
  Its uniform Flamelash shift places the third hit at 0.328 seconds versus
  0.329 in the supplied active table; do not silently mix timing models.
- Bursting Nine's Single-Target versus Area classification remains unconfirmed.
- Coiled Dragon still needs skill/application wiring; existing Bone Corrosion
  Qi bonuses do not affect calculated HP damage.
- Rodent's raw-distance unit mapping needs verification. Preserve the confirmed
  PvE route while investigating it.

### Bellstrike Splendor

Splendor is `wip`, not `available`: it has talent, Inner Way, attunement, and
skill data and the proposed `dummy-1-min-81-waves` rotation, but no preset build
or accepted DPS snapshot. Its path status is not proof that any timing is verified.

`Dummy 1 min 81 waves` preserves the user-proposed sequence: 27 tier-2 Vagrant
Sword casts, with battle start on the first cast's first damage hit (after its
Endurance-spend action). It starts at 12 m and reasserts 12 m on Flute Full's
last direct hit. The target is the non-attacking dummy, with preset ping of 15 ms. Qi break is attached after wave 3 of the Vagrant cast immediately before the
second full Qiankun's Lock (the 11th Vagrant cast). The last Spear Q is a cancel.
Battle ends at 60 seconds relative to the first-hit battle anchor. No
additional movement is inferred. The break resolves at 21.338s after battle start.
Qi 60% and 40% thresholds retain proportional timing at 8.5352s and 12.8028s.
After Exhausted ends at 31.338s, Qi damage immunity lasts until 35.338s.
The same depletion rate places the next 60% and 40% thresholds at 43.8732s
and 48.1408s. No second break is authored.
The production calculation verifies 81 waves before the cutoff: all 27 casts
use the three-wave route, which requires Sword Morph and either Shield, the T1
out-of-combat exception, or the T4 follow-up window.

Ghostly Step - Umbra is cast immediately after the fourth Vagrant Sword.
Both Ghostly Step variants' 30-second Mystery buffs reduce all Endurance costs
by 10%. This combines additively with Endless Gale's general 20% reduction:
the shared general factor is 0.7. Mountain's Might's charge-only 10% reduction
remains in the separate charge category, giving a combined 0.63 charge factor.
At T6, a full ordinary charge therefore spends 15.12 Endurance with both buffs,
and Sword Morph's separate release costs 14. Qi Surge's base 1 cost becomes
0.63. Existing charge-start snapshots and release-time cost evaluation apply.
The Fully Relayed preset equips Sword Morph, Mountain's Might, Battle Anthem, and Insightful Strike at T6, Jadeware, and Affinity bow/ring. Its fixed core is 12 max Physical, 8 Momentum, 2 All Martial Arts, 1 Art of Sword, and 2 vs Boss rolls. Comparing all legal Power/Affinity fills and offensive armor bases gives 6 Affinity and 9 Power rolls; optimization rebuilds the live timeline for each candidate.

Only the skills the Inner Ways reference are authored, at the user's direction:

| Skill                                    | ID        | Scope                                                         |
| ---------------------------------------- | --------- | ------------------------------------------------------------- |
| `QiankunsLock`                           | 20102101  | Nameless Spear Martial Art Skill; applies Endless Gale        |
| `QiankunsLockCancel`                     | 20102101  | Zero-time cancel; applies Endless Gale without damage         |
| `VagrantSword2`                          | 202011021 | Nameless Sword charge tier 2; three phases, two shot variants |
| `VagrantSwordShootSingle` / `ShootThree` | —         | The two charge-tier-2 release variants                        |
| `DauntingStrikeCancel`                   | 20201101  | Flying-sword hit and cancel at 0.293s; 20% of source damage   |

The remaining Sword and Spear actions, including charge tier 1, are deliberately
absent. The proposed rotation does not require them; author additional actions
only when a rotation needs them.

Spear Q and Sword Q each have a 12-second skill cooldown. Spear Q and its
cancel share `QiankunsLock` readiness; Sword Q has its own cooldown. Early
rotation casts wait automatically without storing explicit Delay steps.

### Vagrant Sword charge tiers

Vagrant Sword (both release variants) and Shadow Step carry `SwordEnergy`. Each
damage hit applies Sword Slash Damage Boost (劍氣增傷) after that hit: one stack,
up to three, with a shared eight-second duration refreshed on every hit. The
debuff adds 10% damage bonus per stack only to `SwordEnergy` skills; the applying
hit uses the previous stack count. This mechanic is independent of Inner Way tier.

Vagrant Sword ignores ping on its parent and every sub-action: pre-charge,
charging, and both release variants. Input latency adds no delay to the cast
or any phase or hit, including the charge skipped by Energy Surge.

The export describes charge tier 2 (`202011021`) as two mutually exclusive
"Full charge" routes, and `normalDescriptions.terms` supplies each wave's
multiplier against the tier-2 baseline of `3.2664` / `904` / `493`:

| Route         | Waves | Multipliers           | Markers (attack animation) |
| ------------- | ----- | --------------------- | -------------------------- |
| `single wave` | 1     | `1`                   | `0.2023076923076923`       |
| `three waves` | 3     | `0.4`, `0.48`, `0.56` | `0.101`, `0.267`, `0.755`  |

The waves **replace** each other rather than stacking, so the release selects
one route. Both variants repeat the parent's `Charged` and `Heavy` tags so
attunement matching resolves on the component that deals the hit.

The cast is three sub-actions that the timing and the Endurance rates both fall
out of: a 0.2s pre-charge with no Endurance setting, a 1.2s charging phase, and
a 0.85s shooting phase, totalling the 2.25s cast. The shooting sub-action is
itself a `value`/`fallback` choice between the two release variants, so there is
no wrapper between the cast and its phases. Sword Morph T0 with the Qi shield
active picks the three-wave variant. T1 also permits this route out of combat,
using a negated `battleStarted` requirement; the release is selected before its
first hit opens battle and retains all three waves. Both routes pay the extra
20 Endurance at release. Shadow Step [Cancel] spends 20 Endurance at cast start,
lands its single hit and ends at 0.287s (user-confirmed), and applies the
five-second `SwordMorphWindow` on that hit with T1. Its level-100 damage comes
from source skill `20201110`; it carries `Special` and `SwordEnergy`.
T1 or T4 permits the three-wave route while this hidden, one-stack window is
active. At T4, each three-wave release applies or refreshes it at release start
for five seconds; a single-wave release cannot refresh it.
Otherwise the single wave runs. Only the
three-wave variant carries `SwordEnergy`, which is the skill tag the Nameless
Sword talents match on, so the single wave must not carry it. Charge tier 1
is not authored.

### Endurance rates

Endurance regenerates at 10/s from `system.json.resourceRegeneration`. A skill
may hold rates for the span of its own cast:

```json
"endurance": { "regeneration": 0.001, "consumption": 20 }
```

Permanent setup effects may declare `resourceRegenerationBonus` with `resource`,
`belowRatio`, and `bonus`. Nameless Spear's rank-13 talent uses Endurance, `0.3`,
and `0.2`: natural regeneration is 20% faster strictly below 30% of the current
maximum. This multiplies the active natural rate, including a cast's regeneration
override, but never direct `addResource` restores such as Spear Q, Mountain's Might,
Battle Anthem, or Energy Surge. Suppressed regeneration remains zero. The rate
integrator splits at threshold crossings in either direction, alongside the existing
cast and suppression boundaries; the bonus does not multiply consumption rates.

There are no authored start or end times. A skill's rates cover exactly its
cast, and a composite carries none itself: each sub-action owns the phase it
covers, so a charge's timings and its Endurance follow from the same structure. A
`value`/`fallback` variant carries its own rates, so whichever release variant is
selected holds the shooting phase's regeneration.

Consumption-rate modifiers are snapshotted at the owning phase's start, not the
composite parent's start. Vagrant Sword's 0.2-second pre-charge remains free;
the following charging phase fixes its drain rate for all 1.2 seconds even if
Endless Gale expires or is gained midway. Direct `consumeResource` actions stay
live: Sword Morph evaluates its extra 20-Endurance cost when the release starts.

Energy Surge (Qi Surge) skips both Vagrant Sword's pre-charge and charging
phases. Its buff's parent `skillStart` trigger pays 1 base Endurance before the
0.85-second release, using the normal charged-cost modifiers. Sword Morph still
pays its separate 20 base Endurance. The trigger sets `creditResourceSpend: false` on
its `consumeResource` action: this drains the meter and suppresses natural
regeneration normally, but excludes the cast cost from `baseResourceConsumption`
and therefore from resource-spend damage bonuses. The default is to credit
direct spends; the extra Sword Morph payment retains that behavior.

`regeneration` replaces the base rate and `consumption` drains on top of it, so
the two never merge into one net figure. `system.json.resourceSpendRegenDelay`
suppresses regeneration for a fixed delay after a **direct** spend, which is a
`consumeResource` action. A consumption rate is not a direct spend and does not
suppress anything. Suppression stops regeneration only; a consumption rate keeps
draining.

The timeline splits each advance at every rate-window boundary and every
suppression deadline, so a change lands exactly where the owning cast ends
rather than being smeared across the gap. Both are event-aligned by
construction: a window starts and ends at a sub-action boundary, and a spend
happens at an event.

Vagrant Sword's charge tier 2 is the only authored consumer. The pre-charge
has no setting; charging drains 20/s for its 1.2s; whichever release variant runs
holds 0.001/s for its 0.85s; and the base 10/s returns after 2.25s. Both release
variants declare the Sword Morph spend, which only resolves on the three-wave
route, and that direct spend is what suppresses the 10/s for the following 1.2
seconds. Passive rates begin at battle start in the current simulator, so the
opening pre-combat charge does not drain Endurance; its direct release spend
still applies.

Remaining mechanics:

- The export lacks Endurance costs; Vagrant Sword has separately authored costs.
  Battle Anthem T6 and the low-Endurance Spear condition can now resolve.
  Wildfire Spark T3 still needs its cumulative accumulator.
- Sword Morph T0 scales sword-energy damage by 1.5% per directly spent Endurance,
  capped at 30%. The dynamic `enduranceSpent` value excludes the charging rate
  and credits the paid fraction of the undiscounted release cost. General cost
  reductions do not reduce this bonus: paying 16 under Endless Gale counts as
  the full 20. The release action uses `resourceCostTags: []` to exclude
  charge-specific cost modifiers. Insufficient Endurance still reduces the
  credited payment proportionally. T1 opens
  the out-of-combat route; T4 sustains its five-second window. T3 removes Abrasion
  on sword energy against Exhausted and guarantees Affinity on the third wave.
  Shadow Step opens the same five-second window at T1. T6's
  Energy Surge restores 20 Endurance at the start of a three-wave release,
  after its Sword Morph payment, and grants a five-second buff that skips the
  next charge. Its 20-second cooldown starts there and is reduced by one second
  on each subsequent sword-energy hit, including the triggering release's waves,
  up to eight times, using a hidden stack budget.

Damage actions may declare `modifier` using the same requirement/effect structure
as skill modifiers. These resolve against each hit's live state, and participate
in the effect cache identity, so a third-hit modifier cannot leak into earlier
hits. `GuaranteedAffinity` forces the Affinity outcome; `NoAbrasion` resolves
rates with full precision while preserving Affinity and Critical inputs.

Mountain's Might T1 applies Qi Imbalance on damaging Splendor Martial Art hits;
Sword Q cancel uses this same hit trigger. Spear Q and its cancel restore
30 Endurance, increased to 60 at T3. T6 restores 8 Endurance on charged hits
against Qi Imbalance, with one shared two-second cooldown. Non-boss Moving
Mountain is outside the current practice-target model: every target is a boss.

Battle Anthem T3 restores 10 Endurance on a Critical or Affinity charged hit,
with a shared 12-second cooldown. The live damage resolver exposes outcome rates;
resource-only `damageOutcome` triggers track a distribution of cooldown readiness
in expected mode and concrete outcomes in sampled mode. Expected resource gains
enter the shared meter as probability-weighted amounts. T6's missing-Endurance
bonus applies only to Charged damage. The user confirmed that T6 removes the
10% charge-cost increase despite the description. The T4 cost rule therefore
requires T6 to be absent, preserving the increase at T4–T5 without changing
the damage bonuses or recovery trigger. At T4–T5, +0.10 and Mountain's Might's
-0.10 cancel before Endless Gale's general 0.8 multiplier. At T6, only the
-0.10 remains: Vagrant's base 20/s drain becomes 14.4/s, or 17.28 Endurance
over its 1.2-second charging phase. Without Gale it costs 24. The separate
Sword Morph release payment remains 16 with Gale or 20 without it.

Insightful Strike T1's damage/leech rules and T6's DOT bonus belong to
Concentration, not to permanent effects. The outcome-state tracker includes the
conditional damage rules only in its active branch. At or below 75% HP, its
damage-based recovery updates self HP after each eligible hit. The same tracker
resolves incoming-damage reduction, including expiry between outgoing hits.
Neither HP effect is exercised by the full-HP, non-attacking dummy.

### Endless Gale naming

The export renders one buff under two names: `Endless Gale` in the Nameless
Spear talent and Mountain's Might T0, and `Long Wind` in Mountain's Might T4. The
correct name is **Endless Gale**, it is the buff Qiankun's Lock applies, and the
user confirmed `Long Wind` is a mistranslation of that same buff rather than a
second effect. Store it as `EndlessGale` only; do not add a `LongWind` alias.
Its base duration is 5 seconds with a maximum of one stack; Mountain's Might T0
sets the duration to 10 seconds. T4
is therefore reachable and grants 3% Direct Affinity Rate while it is active —
the source splits that into 1.5% plus 1.5% against bosses, and the boss role is
implicit because both dummies count as a boss.

Daunting Strike [Cancel] ends on its initial flying-sword hit at 0.293s.
Its damage uses 0.2 times source skill `20201101` at level 100; the two
Relentless Chase follow-ups are excluded. Mountain's Might T1 applies Qi
Imbalance through the shared Martial Art damage trigger at the hit, replacing
the former explicit cast-start application.

### Wind dummy rotation behavior

Blade of Heaven's Wrath must start while Flamelash is active. The user confirmed
that Flamelash may expire during an already-started cast; its remaining hits
continue with the actual buff state. Do not restore Flamelash or extend its
duration to cover those hits. A new Blade of Heaven's Wrath cast starting
without Flamelash remains an invalid state to investigate.

### Bamboocut Dust definitions

Dust implements only the skills its rotations cast. The rotations live at
`data/rotation/bamboocut-dust/`, and each is the subject of its own DPS snapshot,
so they are the reference rather than a separate draft. `dust-dummy-1-min-100pc`
is the path default and the 100% Phantom Chime variant; it anchors battle start on
the four-hit release's first hit, which is why its opener break lands in combat.

Unmeasured damage hits use **0 seconds**, as requested. Unmeasured buff
applications use **cast end**, except user-confirmed applications at 0 and Soul
Loss, which is applied immediately after its corresponding hit.

| Skill                | Temporary values                                                | Existing cast duration                                      |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Soul Sweep           | Three damage timestamps at 0                                    | 1.75 s, source interrupt                                    |
| Piercing Dart        | Measured seven-hit marker series; four-hit release truncates it | 1.841 s full, 0.796 s interrupted release                   |
| Burn and Bury        | Finger snap at 0.53 s, inside the 0.65 s cast                   | 0.65 s, source interrupt                                    |
| Scarlet Spin         | Four source stage markers; duration input controls the chain    | User-entered, capped at 12 s                                |
| Dreamwrought Bubbles | Charge and release split into sub-actions                       | 0.743 s charge + 1.2 s release; Delicate removes the charge |

The 0.743 s Bubbles charge is a user-supplied value, not a measurement: the
datamine explicitly excludes charge timing. Soul Sweep Cancel at 0 and Piercing
Dart Charge at 1.5 s are user-confirmed rather than timing gaps.

Qi is authored as absolute-time `Qi` steps on the rotation. A rotation cannot
attach one beyond a Scarlet Spin throw's first, because an attachment's `trigger`
ordinal indexes the anchoring step's own trigger actions and later throws are
raised by the stage rows. The exhaust therefore sits on the sixth throw's
forward hit of the second Scarlet Spin, and a second proportional ramp follows
the first Exhausted window without reaching a second exhaust.

The second ramp's spacing is measured from the end of the four-second Qi
damage immunity after the exhaust's expiry, so re-authoring
the exhaust moves its steps twice: once by the exhaust's own shift and once by
whatever change the first ramp's shape took. Shortening the four-hit release
moved the whole downstream timeline 0.2209835277 s earlier, so the first ramp
shifted by that much and the second by twice it. The 100% Phantom Chime variant
places its own exhaust on the fifth forward hit of its second Scarlet Spin and
stops there; it keeps the same two ramp gaps so the exhaust lands on that hit.
The regular variant now crosses 60% Qi at 51.2362s after recovery immunity;
its shifted 40% threshold would fall at 60.722s and is omitted after Battle End.

Out of scope by user instruction: Fading Crimson, Tokens of Gratitude, Song of
Tang HP drain, and Tenacity damage. These are exclusions rather than gaps, so
they are not tracked as outstanding work.

Piercing Dart's seven hits are modelled as `PiercingDartSweep1`–`7` triggered
damage skills rather than seven `damage` actions on one skill. This is deliberate:
Towline Sweep Tier 3 gives each hit a different bonus (0.05, 0.05, 0.05, 0.10,
0.10, 0.15, 0.15) through `skillTag` requirements, and a `damage` action cannot
carry its own tag — tags resolve per skill. Keeping the hits in one skill would
need a per-action tag mechanism, which is not worth introducing for a single skill.
Revisit this if a second skill needs per-action tags. The four-hit release reuses
sweeps 1–4, matching the shared marker series.

The source routes for Piercing Dart are cumulative prefixes of one seven-hit series
measured from the side-button press: `20702101` is the charging stance and reports
no hits, `20702102` is the three-hit release, `20702103` the five-hit release, and
`20702104` the seven-hit release. Each variant is therefore the leading markers of
`[0.099, 0.298, 0.498, 0.796, 1.02, 1.268, 1.841]`, and the cast time is the last
marker it lands: 1.841 s for the full release and 0.796 s for the four-hit release,
which ends at the interrupt. Soul Loss is applied on the same markers as the hit it
belongs to, and its requirement resolves at skill start because Soulbound is
consumed there.

Each sweep's coefficients come from `timings.hitCoefficients` on `20702104`, matched
by the `hitIds` list parallel to `hitTimes` and read at level 100. Each ordinal
lists the collision alternatives observed for it, and every alternative within an
ordinal shares one coefficient, so the mapping is unambiguous. Ordinals 1 and 2
both resolve to the `20702102` 0.3-multiplier curve, so the first two hits are
deliberately equal; the ramp is 0.334122, 0.334122, 0.445496, 0.313564, 0.470346,
0.689664, 1.034496. The per-hit `multiplier` is already folded into these
coefficients, so it is not applied again.

Dreamwrought Bubbles is split into a charge and a release sub-action. Actions
scheduled past a skill's cast time are inactive, and action times are absolute from
the skill's start, so a charge that Fragrant Song - Delicate skips cannot be
expressed inside the release skill. As sub-actions the 0.743 s charge delays the
release, and skipping it slides the two collider markers back to their raw
`0.400` and `0.830` second offsets. The release ends at the 1.2 s source interrupt,
so the skill takes 1.943 s with the charge and 1.2 s without it. This matches the
Drunken Poet charge pattern, and matches how Soul Sweep and Burn and Bury take their
source interrupt as the cast time.

Delicate skips the charge through a conditional sub-action rather than a
`castTimeMultiplier` modifier on it. A sub-action that fails its requirement becomes
an inactive segment contributing no cast time, so the release simply starts at once.
Prefer this over a modifier: modifier requirements are evaluated against live state
when the segment resolves, so a Delicate stack consumed on the parent at time 0 is
already gone by then, and a lone remaining stack cancels nothing. Delicate is
consumed by the release, on the cast the buff paid for.

Both Dreamwrought Bubbles sub-actions set `ignorePing: true`. Input latency is paid
once when the parent is dispatched, and every sub-action past the first would
otherwise pay it again, stretching the skill by 2 × ping. Set it on a sub-action
when that component is not a separate button press.

Charged Combo reduces Soul Sweep remaining cooldown by 0.5 seconds per Piercing Dart
damage hit, with a shared 0.5-second trigger cooldown. Soul-state stacking,
conversion, lifetimes, and cast-start consumption are implemented. Fading Crimson
and Tokens of Gratitude are intentionally ignored by user instruction.
Mode-specific exclusions from Soulbreak recorded damage are intentionally ignored
by user instruction. Fragrant Song's source text describes a 30% faster flight
and accelerated-flight catch; Scarlet Spin applies the source `1 / 1.3` timing
ratio to the next throw, with acceleration on Stage 4. Its damage bonus,
guaranteed crit, and one-use consumption remain implemented. `FragrantSong` and
`FragrantSongDelicate` both last 10 seconds, so a grant made more than 10 seconds
before a throw does not accelerate it.

Rotation `enemyCount` is a positive whole number, defaulting to one. It models
the number of enemies hit for Light Anew and Song of Tang; it does not multiply
damage or replace healing-recipient `groupSize`. Light Anew applies Candlelight
on damage at three or more enemies, reduced to two at T4. Song of Tang T4
grants one extra Tang Melody stack per eligible Martial Arts hit at two or
more enemies, through the existing half-second application cooldown. Song of
Tang HP drain is intentionally ignored.
Scarlet Spin is represented by the castable `ScarletSpin` parent and the
source-tagged `ScarletSpinStage1`–`4` components. The parent applies
`FlowerBurial` for the authored duration and triggers the stage cycle
`1 → 2 → 3 → 4 → 2 → …`; each stage uses the source next-start marker and
level-100 weighted damage values. The entry and catch triggers use
`sourceEffect: "FlowerBurial"` to bind each chain to its original application.
Each delayed stage trigger declares an earlier `queueTime`; its queue-time
source check reserves the next throw before the current throw finishes, while
execution still waits for the source next-start marker. A queued throw can
therefore start after `FlowerBurial` expires, and the parent effective cast
extends through that throw's returned hit. Fragrant Song accelerates the next
throw using the source `1 / 1.3` ratio, so Stage 4 is the accelerated stage.
At zero ping, the rank-13 route starts 14 throws; positive ping shifts each
throw's execution and can move the final queue acceptance beyond the 12-second
state. The initial stage inherits the parent input's ping; later queued stages
opt into `triggerPing`. The parent clears accumulated catch stacks at the start
of a new segment. Local hit markers from every started stage remain two separate
outgoing/returning damage actions.

The draft has no accepted DPS snapshot and must not be treated as a validated
build or rotation recommendation.

Burn and Bury includes `dmgBonus: 0.3`, additive in the same category as vs Boss.
Light Anew T3 immobilization/lockouts, Candlelight slow, Phantom Rally pull,
and Burn and Bury slow/Breath-hold are intentionally ignored by user instruction.

Towline T6 refreshes/settles target Soulbreak only at distance <= 15m.
Its self Soul Return refresh and Burn and Bury damage bonus are not range-gated.

### Food choices

Food has two independent categories, each with its own None option. Physical
Attack offers Simmering Fish Slices (+120/+240 effective Physical Attack), while
Endurance offers Swallow’s Agility (巧燕). Both can be active together.
The persisted `food` selection holds Physical Attack; `enduranceFood` holds
Endurance. Legacy Swallow’s Agility selections migrate to Endurance with Physical
Attack set to None, preserving the previous effects.
Endurance (Swallow’s Agility) is available only for Splendor and Umbra and adds
20 to `maxEndurance` through the shared stat pipeline. A saved unavailable food
is treated as None without deleting the saved choice. Comparisons involving
Endurance food rebuild combat with the variant’s starting Endurance and capacity.
