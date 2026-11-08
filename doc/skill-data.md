# Skill and combat-effect data

This document keeps authoring constraints, source exceptions, and unresolved
mechanics. The JSON is authoritative for implemented skill values, timing,
tier effects, and preset sequences. Do not repeat those records here or append
completed implementation history. Remove WIP notes when resolved; retain a
short explanation only when it prevents a likely misinterpretation.

## Source of truth

Startling Spring uses explicit `stackEffects` so charged damage and Endurance
cost both increase by 4% per stack. Ordinary effect lists are not implicitly
multiplied by stack count in the damage pipeline.

Umbrella's resistance-ignore talent uses projectile eligibility, including
Forsaken Fame's `JadebreakProjectile` tag. Its raw filter is 1005, unlike the
1006 filter used by Combo and Umbrella's critical-damage talent. Do not grant
FF those latter bonuses when applying the resistance ignore.

Strength's ordinary Mixed and Mixed Double Stab presets exhaust on the third
Mo charged strike of round two. Their break times differ: about 32.169 and
33.791 seconds respectively at 40 ms ping. Their other authored Qi markers
remain aligned. Ordinary Mixed places Mo QQ before its first Tab/VC/LC/VC
filler, then uses Leaping Toad/Deflect/Bursting Nine before round two. It
ends Tab/VC/Mo QQ so the final linked VC hit lands inside the minute. Double
Stab retains the Heng Q immediately before its late Heng Special and places
its second Flute after two charged casts. Its first filler is Tab/VC/LC/VC,
Toad/Deflect/Bursting Nine; it ends Tab/VC/LC. At 40 ms ping, the last direct
hit lands at about 59.851 seconds in Mixed Full Min at Solo 18 or 19.

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

The Skills editor displays a read-only combined cast time from the shared subaction
expansion alongside the editable wrapper duration. Conditional combinations
select their base route against an empty combat state rather than summing mutually
exclusive branches, and are marked as combat-dependent. The Rotation editor displays
the resolved worker timeline duration. Composite rotation rows always show that
resolved total rather than offering an editable wrapper-duration field. Stored
step duration overrides remain intact; wrapper editing stays in the Skills editor.
Base totals exclude ping.

Boss Talent is a permanent global buff selected at 0% or 15%. Its `dmgBonus`
adds to the existing general damage bonus category; it has no target-type condition.

## Datamine interpretation

### Draught one-minute preset

The initial Draught combat definitions use the Normal level-100 coefficients
and authored hit/interrupt clocks from the confirmed export
`where-datas-mine-internal/export/whaledraft-confirmed/2026-11-06_21-48-04-839_+0000-HH96uF`.
The export remains a local reference, outside runtime imports. Collider clocks
are the export's nominal immediate-contact model, not client measurements.

Binge uses the shared resource pipeline, starts at the user-confirmed 60, and
caps at the source resource-151 maximum of 200. Quick Whaledraft grants 25, or
50 during Carouse, at 0.315s on the modeled dummy; its interrupt time is 0.68s.
This is Quick Drink 209020061, rather than held drink 20902006. The checked-space
0.301s branch is not used by this preset. The full-meter check applies Deepdaze
at the grant timestamp with no additional delay, as confirmed by the user.
Inebriate starts at the source 50-percent resource threshold. Peakfall and
Castlink select their Jadeflush routes while Inebriate is active. Ordinary
Castlink uses the confirmed 0.733s recovery; Jadeflush has its own four-hit route.

Dragonquench's four explicit stages share the `Dragonquench - Inebriate`
damage-breakdown category and ignore input ping, as confirmed by the user.
Their animation clocks still use the existing cast-time multipliers for
15% and 30% acceleration after completed cycles; the third cycle resets the
speed. Skyspeak T3 extends Deepdaze from five to ten seconds, and T1 changes the exit drain from 200 Binge to 140. A full-meter exit therefore
leaves 60; a 180-Binge exit leaves 40. Eonpour's PvE base-damage bonuses use `baseDMGBonus`,
separate from Category 1: 10% initially, 20% from T3, and 40% during Deepdaze
at T6. Native event 34 targets `SKILL.jm_numerial_ratio` through
`FORMULA_DATA_ADJ_TARGET[4]`; it changes the whole direct-hit multiplier, not
an ordinary additive damage bonus. Drunkslay records the resulting damage
without applying Eonpour again at settlement. Eonpour T6 triggers once per 60 seconds against an exhausted
boss via native tag 1125 (ordinary/enhanced Peakfall and Castlink), entering
Deepdaze or extending it by six seconds and applying the three
authored target marks. Drunkslay records eligible enhanced-hit damage during its mark. Reapplying
the mark or reaching its 20-second expiry settles 20% of the recorded damage
through the shared recording mechanism, with Wildstride evaluated at settlement.
Battle End does not settle an unfinished window. Dragonquench stage four has
three damage contacts (two smaller hits followed by the finisher); the four
fourteen-cast chains therefore produce 80 Dragonquench hits.
Nightwick - Tipsylay and Nightwick - Primepick carry the same native
Inebriate-enhanced hit filter (calcpoints 2090210801 and 2090211001, tag 1121).
They therefore receive the enhanced critical-damage talent and Tiltrim bonus
and contribute to Drunkslay; neither is an ordinary unenhanced Special hit.

Mistwing's cumulative authored tiers represent replacements explicitly. T4's
six points of all-type penetration replace T1's three physical points. T6 adds
another six all-type points during Inebriate. Its HP scaling is one point per
10% missing HP, capped at four, plus the same scaling again during a martial-art
enhancement. Both parts affect all penetration channels from T4 onward. Before
T6, the HP interval is 20%; no HP-scaling bonus applies before the first interval.
Source: Normal buffs 10270350/10270351 and passives 102703501–102703510 in the
confirmed export. The shared Mistwing correction also affects Wind builds.

Quick drinking's Falcon projectile is requested at the raw action's 0.3s
timeline marker. Three contacts land at 0.550s, 0.683s, and 0.816s from the
drink start, each with 0.487872 Physical and Attribute coefficients and zero flat bonus.

`draught-dummy-1-min` uses fourteen Dragonquench heavies per round, for 56 casts and 80 damage contacts. Each stage-four cancel completes its cycle on the third hit (0.481998055s before acceleration), advances or resets the speed stack, and leads into plain Deflect. After the third cycle each round, use stage one, stage two, Reveldrift [Cancel], then enhanced Hero's Blood. All 44 enhanced Hero's Blood contacts land during Deepdaze at 40ms ping, and the final Drunkslay payout lands at 59.899180s.

The attacking-dummy BP variant uses twelve heavies in round one and thirteen in each later round. A 0.35s delay before the opening Nightwick - Tipsylay puts the second Whaledraft at 5.301852s at 40ms ping. Its 0.2s dodge window triggers Breaking Point T6 at 5.5s. Round one ends with Reveldrift [Cancel], enhanced Hero's Blood, Peakfall, then ordinary Hero's Blood after Deepdaze expires. This order assumes Castlink remains available across that weapon swap. In round two, follow the first Heavy 4 [Cancel] with Deflect and Dodge to trigger Breaking Point at 23.5s. The 35.5s dodge falls inside its cooldown. After the second Flute and the next Heavy 4 cancel / Deflect, cast Ghostly Step - Umbra before the 35.5s dodge. Its 40 Vitality cost is covered at that point. Nightwick - Tipsylay uses the first 0.3s of its cast as its conditional dodge window (20902108, graph 14 node 70), triggering Breaking Point at 47.5s. The 53.5s dodge activates Umbra while Breaking Point is on cooldown. All 44 enhanced Hero's Blood contacts land during Deepdaze, and the final Drunkslay payout lands at 59.769155s.

The Qi break remains attached to the tenth heavy of round two. Its revised
26.297678s battle time defines the depletion rate. Thresholds at 59.99% and
39.99% occur at 40% and 60% of that interval. After ten seconds of Exhausted
and four seconds of Qi immunity, the same depletion rate resumes; the next
break remains outside the minute. Battle start is the first ordinary Hero's
Blood hit, after Flute / Deflect / Peakfall preparation.
Draught is available in the standard path selector.

The four Fully Relayed builds derive from Dust's corresponding Min/Max gear at
tiers 96 and 100, with Gauntlet and Dual Blades weapon arts, Tiltrim, Deepdaze
armor attunements, and T6 Eonpour / Morale Chant / Skyspeak. The ordinary builds
use T6 Envigorated Warrior; the BP variants replace that Inner Way with T6 Breaking
Point. Both gear groups list Min, Max, Min BP, then Max BP.
The path defaults to Fully Relayed Min and Dummy 1 Min. Weapon and accessory Physical Penetration
attunements remain unchanged.

The Draught gear presets target at least 99% effective Precision after enemy Judgement Resistance. The ordinary fully relayed builds target 79–80% effective Critical Rate. The BP Min and Max builds target approximately 76.24% because direct critical chance also contributes to the critical outcome after affinity. BP gear tuning replaces whole Critical rolls and preserves the existing Agility, Power, and physical attack rolls. At BT18 this yields 74.44% and 76.91% effective crit on fully relayed Min and Max, and 77.26% and 76.71% on full Min and Max. Each affix uses its tier maximum, multiplied by 94% on relayed gear. Tier 96 is tuned at BT17 and tier 100 at BT18. BT19 shares tier 100 and grants additional crit through level stats and talents.

### Strength mixed preset fillers

The ordinary Mixed, Double Stab, and Infinite Vitality one-minute presets retain
fifteen Burning Heart charged casts. Snowbreak Spring (VC) must immediately follow
Snowparting Conversion (Tab) or Grave Frost (LC), ignoring attached events. Tab
must immediately follow a Mo Blade ability.

Ordinary Mixed uses Leaping Toad/Deflect followed by seven-arrow Bursting Nine
2 Shots before the second-round Snowparting Q, and omits the former final
Bursting Nine. Double Stab retains its first filler LC/VC pair before Leaping
Toad/Deflect and seven-arrow Bursting Nine 2 Shots. Infinite Vitality retains
Mo QQ/Tab and replaces the following VC/LC/VC with Leaping Toad/Deflect followed
by seven-arrow Bursting Nine 2 Shots. Existing charge movement
attachments and Qi anchors remain attached to their original surviving skills.
Ordinary Mixed exhausts on its third second-round charged strike at about
32.169 seconds. Double Stab exhausts on its third second-round charged strike
at about 33.791 seconds; their other authored Qi markers remain aligned.
All fourteen hits of Ordinary Mixed's earlier Bursting Nine land under Iron
Guard in the Mixed Full Min baseline.
Ordinary Mixed ends with Snowparting Conversion, Snowbreak Spring (VC), and Mo
QQ in that order so the final Anxi Soldier VC follow-up lands before 60 seconds.

### Export interpretation

Local references are under `local/datamine/`: `wwm-skills-normal-all.json`,
`wwm-skills-mystic-skills-all.json`, `wwm-skills-mechanism-all.json`,
`wwm-inner-way-normal.json`, and
`wwm-martial-arts-normal.json`. Prefer interpreted normal-variant fields;
ignore `versions` subtrees. Do not infer missing timing, route selection,
resource units, or mode-specific behavior from a damage baseline alone.

- Skill `byLevel` arrays use **level minus one**, including leading nulls.
  `aggregated` contains level-independent values. Implemented offensive
  Mystics use **level 76** (array index 75). Smolder, Dragon Head - Tide,
  and Ghostly Steps - Umbra use their established enlightenment baseline,
  not the regular curve. In the current schema-2 Mystic export, those known
  baselines are normal-variant `unassignedLevels` rows 171 at level 71 and
  176 at level 76. Row 171 reproduces the confirmed prior values before
  importing row 176; this is a narrow exception to ignoring `versions`, not
  a generic fallback for unidentified source routes. Ghostly Steps has the
  same values at both levels. Preserve each authored hit multiplier when
  replacing coefficients and flat bonuses. Martial-art coefficients resolve from the normal
  curve's `SKILL_POWER_PRO_ATK` / `SKILL_POWER_PRO_HEAL`, with
  `SKILL_ADD_W_ATK` as `phyBonus` and `SKILL_ADD_WX_PRO_ATK` as `attrBonus`,
  read at **level 100** (array index 99) unless the value is `aggregated`.
  Derive physical coefficient, attribute coefficient,
  and flat physical bonus independently. Preserve source precision, retaining
  derived values to 12 decimal places rather than tooltip rounding.
- Runtime Inner Way and set-bonus `bySoloLevel` arrays use **the actual Solo Level**; slot 0
  is unused. Prepend that slot when importing source arrays. Null means no
  bonus, with no interpolation or talent-rank fallback. Resolve through
  the shared `effectForSoloLevel` resolver (through
  `innerWayDefinitionForSoloLevel` for Inner Ways) without mutating the catalog.
- Find a martial-art source rank by `talents.ranks[].unlockLevel`, not array
  position or world level. Its `talentIds` are a complete selection, not
  additions to prior ranks. Resolve them against `talents.definitions`.
  Runtime `talent[rank]` is likewise a complete independent array; missing or
  empty ranks contribute nothing. Solo Level and talent rank are separate.
- Rank-14 Additional Attack uses `effect.flatAttackBonus` to scale `phyBonus`
  and `attrBonus`, scoped by the martial-art skill tag. The normal Strategic
  Sword, Phalanxbane Blade, Mortal Rope Dart, Heavenwill, and Skystrike definitions also use
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
- Dragon Head - Tide retains its confirmed enlightenment route. Its level-76
  pre-multiplier physical/attribute coefficient is **16.3600856603774** and
  physical bonus is **2596.71698113208**, followed by the existing upgrade/
  enlightenment factors. The source's level-71 row reproduces the previously
  confirmed 16.3591422641509 / 2483.50943396226 baseline; the regular curve
  is a different route and must not replace it.
  Its unconditional `NoAbrasion` modifier prevents Abrasion on every combat path,
  independently of Deluge's Mystic Precision talent.
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
  permits an ordinary equal/lower-priority follow-up at 1.179 seconds; its animation
  ends at 1.591 seconds. The cast duration uses the follow-up boundary, not animation
  end. These values come from the export route rather than a measured schedule.
  No cooldown or resource cost is authored. Its
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
   freezes its result at the owning component's start. Individual self/target
   effect conditions in an action requirement array may also use
   `resolveAt: "skillStart"`; those read the owning row’s starting buff/debuff
   state while unmarked conditions still inspect action-time state.

Normal action `time` is seconds from cast start. Keep action arrays in
nondecreasing time order; array order resolves ties. Actions may occur after
cast completion. Effect actions may use `time: "expire"`; refresh invalidates
old expiry actions, and consumption does not count as natural expiration.

Cast time excludes ping. `ignorePing: true` suppresses latency for that skill.
All Mystic skills, including their composite components, and both castable
Deflect variants ignore ping.
Leaping Toad uses the user-confirmed 1.15-second lunge-hit cancel before
Deflect. Keep this cancel boundary distinct from the export's contact-dependent
recovery clocks.
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
is for a dedicated charged move that is neither, such as Vile Condemned.
Grave Frost is a charged light attack, not a Varied Combo: it carries `Charged`
and `Light`, without `VariedCombo`, so Varied Combo bonuses do not apply. Gate an
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
The requirement reads the event loop's live battle flag, independently of damage
ownership. Delayed follow-ups from prepull casts can apply target effects and
satisfy `battleStarted` once the anchor has opened combat.

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

An `extend` action may set `maxRemaining` in seconds. The extension cannot
raise remaining lifetime above that cap, and never shortens an existing longer
lifetime. Tracked expiry and periodic scheduling use the same capped result.

`cooldownGroup` shares readiness across skill definitions; otherwise the skill ID
is the key. `cooldownUses` with default `cooldownRecovery: "window"` grants uses
within one window. `"independent"` gives each spent charge its own recovery.
Shared definitions must agree on capacity and recovery mode. Modifier changes
do not move already-pending recoveries. Explicit casts wait; unavailable triggers
are rejected. Generated waits are output only, not saved rotation steps.
Skill modifiers can override `cooldownUses`, using the same last-matching-rule
precedence as cooldown duration. Spring Sorrow has one charge without Blossom
Barrage, two at T0–T5, and three at T6; readiness and cooldown reductions resolve the same
capacity without replacing pending recovery timestamps.

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

By default, talent formulas read immutable raw stats, including flat attribute
talents but excluding later talent/food bonuses. Use raw source names for STEADY
rank conversions; native dynamic combat passives need explicit action binding.
A formula source may be a stat name or `{ "max": ["body", "power"] }` to select the higher source value from the same stat snapshot. All named sources must be finite numbers. Formula values compute `source × multiplier + offset`, or `floor(source / step) × multiplier + offset` when a positive `step` is authored. `resolveAt: "action"` keeps dynamic combat-passive formulas live instead of freezing them against raw talent inputs. The formulas support optional `min`,
`max`, and explicitly justified `round`. See the [stat pipeline](stat-pipeline.md)
for effective-source resolution and final-value overrides.

Damage categories such as `dmgBonus`, `baseDMGBonus`, the Mechanism category's
`globalDmgBonus`, `dotDamage`, and per-channel bonuses are not interchangeable;
use [damage-formula.md](damage-formula.md) for their order and scope.

### Triggers, accumulators, and recording

`skillEnd` triggers on setup effects, Inner Ways, and tracked self buffs run at
the existing cast-completion event. They inspect live completion-time state and
the completing skill's own tags, reuse ordinary trigger actions and cooldowns,
and run after the cast's same-time final actions but before the next ordered
cast. Composite casts dispatch once at their resolved end; timing changes and
queued continuations move that event. Silent components and casts cut off by
Battle End do not dispatch completion effects. No displayed action is added.
Seasonal Edge retains its specialized `onCastEnd` callback and its original
priority; ordinary `skillEnd` dispatch follows it at the same timestamp.

Ordinary Inner Way triggers default to `damage`; supported event-specific setup
rules include `heal`, `takeDamage`, `skillStart`, and `attackResponse`.
Skill-start triggers run after cast acceptance but before timed actions, including
empty and triggered skills, excluding silent components and periodic rows.
Use `attackResponse` for successful defense rewards, not attempted cast start. The
`PerfectDodge` variants and `DeflectSuccessful` set `attackResponse.fallback`, so
their response rewards resolve at cast start when no incoming attack is selected.
Ordinary forward `Dodge` aligns its defensive window to an incoming attack and
requires an overlapping hit for rewards. The window is 0.20 seconds, or 0.25
for Gauntlets (the lower bound of the reported 0.25–0.30 range). The weapon's
cast time separately determines when the next ordinary attack can start.

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

Authored DOT timings store effective wakeup delays, already adjusted for the
33 ms native timer wheel and Lua deadline retry. For the adopted aligned-clock,
timely-polling model, a request rounds down to a wheel slot; an early wakeup
retries with the 34 ms Lua minimum, which rounds to 33 ms. Thus 500 ms becomes
528 ms, 1,000 ms becomes 1,023 ms, and Hellfire's 100 ms drain becomes 132 ms.
Apply this to positive initial delays as well as intervals; do not quantize
these effective values again in the scheduler. This model comes from the CN
client implementation; identical live Global server behavior is not established.

Smolder and Combustion tick immediately, then every 528 ms. Their inclusive
initial lifetimes end at the last retained tick: Smolder uses 3.696 seconds
(8 ticks), Combustion 7.92 seconds (16 ticks). Burn extensions scale by
528/500: 1.5 seconds becomes 1.584, 3 becomes 3.168, 4 becomes 4.224,
and 7.5 becomes 7.92. The full Dragon's Breath casts retain 23 Smolder or
22 Combustion ticks. Expected battle-aligned DOTs use the authored effective
interval for their shared clock too.

The Deluge Smolder preset waits 0.35s before its third Dragon's Breath.
At its authored 40ms ping, this moves the cast past the original Intoxicated
expiry so Dragon's Breath grants a fresh buff rather than leaving one that
expires mid-cast. The following Drunken Poet therefore skips its drink and
avoids an extra 10 Vitality cost (7 after Turnaround's refund).
Strategy Enhancement (export level 5, entry 305) refunds 4 Vitality on the
fifth Poet hit. The refund resolves at impact, separately from the shared
damage-event payout and Turnaround's cast-time refund.

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

Reactive `addResource` actions also accept `chance`: expected timelines multiply
the resource gain by its probability, while sampled timelines roll the gain once.
Threshold requirements still read the resulting resource value, so this does not
represent a distribution of downstream buff outcomes.

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
it to one probability-weighted tick per 1.023-second battle-clock boundary. Its linked defense-debuff
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

Tracked self buffs can supply `resourceRates`: an array of `{ resource,
regeneration?, consumption?, requirement?, onDepleted? }`. These use the same
rate integration as cast-scoped Endurance, but remain active across subsequent
casts until the owning buff is removed or expires. The last active regeneration
override replaces ordinary recovery; consumption rates add together. Requirements
are evaluated against live self/target state, including target debuff expiry.
Use these requirements for state conditions, not resource thresholds within a
continuous span. Infinite resources ignore these rates and depletion callbacks.

`onDepleted` contains ordinary effect actions whose times are relative to the
exact zero-resource instant. A mode should consume its own buff at time zero;
that cancels pending periodic hits through the existing removal path. Delayed
refund actions can follow. The callback runs once per tracked application and
is distinct from natural expiry or explicit early removal. Those exit paths
must author their own refunds if required. The scheduler inserts clock boundaries
for rate changes and depletion; it does not approximate continuous drain with
projectile ticks. Buff-owned resource rates require live variant simulation.

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
Optional `startup` and `recovery` add fixed time outside that held duration;
the named effect still receives only the hold duration at its authored apply time.
`endOnEffectRemoval` enters recovery when that effect is explicitly removed early.
Resource-rate consumption uses the originating skill's tags for cost modifiers.

Spring Away uses the 2026-10-30 17:30 export's nominal projectile timeline:
0.74s startup, a user-selected hold capped at 10s, and 0.5909090909090908s
recovery. Its 60 firing opportunities follow the authored 2.001s repeating clip,
with nominal contact 0.04s after each launch. Releasing stops new launches but
does not discard projectiles already in flight. Each contact grants 3.4 Blossoms.
The raw carrier's ChargeNode421 specifies 10 Endurance per 1s and interruption
on depletion; the shared continuous resource-rate model represents that drain
and includes Startling Spring's charged-skill cost increase. Depletion removes
the channel effect and immediately begins recovery. Ordinary regeneration resumes
outside the channel. The unresolved opening-strike collider is not assigned a
fabricated hit time or Blossom gain. Contact remains the nominal 1m model;
distance-dependent projectile travel is not reconstructed by this export.

Jade has three build families: TB and BP use Mistwillow, while BP Mystic
uses Rain Whisper and tier-100 Mystic Damage armor affixes. Each has Fully Relayed
Min/Max variants and a non-relayed Full Max graduation preset. Display names follow
`[Fully Relayed|Full] [Min|Max] [TB|BP|BP Mystic]`. Existing preset IDs remain
unchanged to preserve saved selections; the former Short Fight IDs identify BP Mystic.
The three added BP IDs are `jade-bp-min`, `jade-bp-max`, and `jade-full-bp`.

Tier-100 Fully Relayed Max BP and Max BP Mystic use eight Critical Rate and two Agility rolls
for BT18. Their Graduate presets use seven Critical Rate and three Agility rolls
at full roll value. BT19 shares tier-100 gear. Other Max configurations use three Agility
rolls. Max BP also uses Minimum Physical Attack on the fan and chestpiece at
both gear tiers. Rates use Simmering Fish Slices and the Precision bow/ring
setup. BP gear uses one Precision roll and reaches 100% effective precision.
Breaking Point T5 supplies the additional direct critical, not the weapon set.

The 30-second IV preset uses
the attacking dummy and Max BP for its benchmark fixture. The latest event-clock
export gives Colorful Phoenix and Emerald Barrier a 0.4-second dodge window,
and Soaring Spin a 0.5-second window (skill level 41+). Their
`attackResponse.duration` caps the response window from cast start and clips it
at an earlier cast end. These offensive casts do not automatically wait for an
attack. A real overlapping incoming hit invokes the existing Perfect Dodge
success path, including Breaking Point's cooldown-gated T6 proc.

Jade's existing jade-three-rounds ID retains its saved-data identity and is
displayed as Grounded Dummy 30 Sec IV. Qi exhaustion is attached immediately before
the third UF's first damage hit, with proportional
59.99% and 39.99% markers. Opening Drink/Deflect/Flute/Ghostly Umbra/Fan Q keeps
Jadebreak through its second application. Ghostly Umbra can cancel Flute.
The rotation uses full two-hit Soaring, full Smolder with Deflect, and the final
one-hit Smolder/Deflect/Poet 1, a 0.02s hold, then Fan Q/Poet 2/Tide.
Ordinary Dodge refreshes Mystic damage at 17.5s. The hold places the 23.5s
attack inside Fan Q's defensive window. The first Umbrella Q hit anchors battle time.
BP builds use relayed All Mystic damage rolls on tier-100 helmet and chestpiece;
the affix is not available on their tier-96 gear.
Hybrid refills before UF one and four with one Umbrella Q and a Spring Away
hold (4s and 1.871s respectively). Both reach
100 Blossoms. Peak returns to melee after each charged refill. UF five uses
a partial single-Q refill, and UF six uses QHL.

Flying opens with Flute and Fan Q before the first Umbrella Q impact. Each
10s Spring Away ends with UF at 100 Blossoms and a Deflect cancel. In each
completed recovery, Peak closes to 1m for three-hit pursuit. Mystic fillers
allow Endurance to recover, followed by Fan Q and five-hit pursuit. The
first recovery uses Smolder and Serene Breeze. The second uses Golden Body,
Smolder and Flute. Fan Q and Combo can expire between applications.
Both new presets attach a Move to 9m at Spring Away's start and attach the
return to 1m immediately before Peak's main hit (action 1, at 0.557581475s).
The earlier small hit at 0.35s remains at 9m and misses. Pursuit preserves the
resulting distance; Peak casts that already begin at 1m retain their small hit.
These are the user's instantaneous repositioning assumptions,
not inferred travel speeds. Projectile contact retains the export's nominal delay.

The rotation editor displays Blossoms followed by Endurance for Jade. Cast and
expanded-action cells read the corresponding worker resource states and ranges;
the display does not independently calculate consumption or regeneration.

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
`targetHP`; otherwise it stays at the implicit state unless explicitly set.

`directDamageReduction` is an additive ratio on setup, innerway, or tracked
self-effect rules. It accepts a fixed ratio or a `segment` on
`currentHPPercentage`, resolved against pre-hit Self HP. Take Damage events
represent direct incoming attacks; the reduction applies before Insightful
Strike's probabilistic defense and before HP loss and take-damage triggers.
Light and Shadow Alike uses this field alongside `healingBonus` for Relentless
Combat. Its T4–T5 direct outgoing hits consume one Darkness and add one Light;
incoming hits consume one Light and add one Darkness. Each effect refreshes its
five-second duration, caps at five stacks, and uses `stackEffects` to enhance
its HP-dependent bonus. T6 gates off both triggers and replaces the base rules.

Qi depletion is authored rather than calculated. A preset's Qi events read as repeating
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
- Draught's authored rotation now includes Eonpour's Inebriate damage bonuses
  and exhausted-boss proc, plus Skyspeak's Deepdaze duration, conditional Binge exit drain and
  Drunkslay replay. Light-attack Binge generation, held drinking, sober-up drain,
  and the other Riven attack routes remain outside this initial rotation's
  coverage. Volutefit still provides stat tiers only. Mistwing is fully wired
  and is offered on Draught and Wind.
- Yaksha Rush's defense-break rewards are unresolved: breaking the target's
  defense is not a modeled timeline state, so its extra damage, 10 Qi damage, and
  Tenacity grant have no representation. Do not attach them to the base hits.

### Timing and source validation

The 2026-10-21 16:50 export supplies normal-route hit clocks for Fleeting Trace,
All Under Justice, Wicked Defiance, and Storm Roar. Fleeting Trace retains its
authored cast-end buffs and cast duration because its route has no interrupt
clock. Wicked Defiance's Heaven's Will gain follows its second hit. Storm Roar's
Drumbeat follows its hit. Floating Grace uses the cast-timeline healing request
at one second for both healing and its associated buff; its animation interrupt
is the next-cast boundary. Thunder Shock imports its ordinary interrupt without
inventing missing hit clocks or changing the one-hit cancel. Animation-relative
clocks remain provisional. Alternate routes, collider markers that do not identify
projectile contact, and documented charge/request clocks are not interchangeable.

The solo and team Deluge WTS presets wait 0.05 seconds after each Floating Grace
to preserve their downstream cast schedule after its ordinary interrupt changed
from 1.15 to 1.10 seconds. The healing request remains at one second. This explicit
rotation delay preserves Qi Blade and Solid Foundation proc alignment without
overriding the shared skill timing.

- User-confirmed Deflect timing is 0.3s for all weapons, except Heng Blade at
  0.25s. Both ordinary and successful variants resolve this from `currentWeapon`;
  unknown weapons use the 0.3s fallback.
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

### Silkbind Jade starter work

Jade remains `wip`. Its 60-second dummy preset uses the accepted timings
below, the starter builds, and Mystic/charged Fan light attacks as fillers. The
opener uses Flute of the Tides Cancel before Fan Q; battle still starts on the
first Umbrella Q impact. Jade's timeline displays Blossoms in place of Endurance.
The target breaks at the third Unfading Flower activation. The dedicated Inner Ways and
Blossom income, drain, and exhausted-target refunds are implemented. Combat ends
exactly 60 seconds after the opening Umbrella Q impact. The preset fits seven
Unfading Flower activations, with the target breaking at the third.
The opener retains Spring Sorrow twice, Heavy, and Colorful Phoenix to establish
Mistwillow. Later rounds refill with Spring Sorrow, Heavy, and full Colorful
Phoenix because charges recover sequentially. Both routes activate
Unfading Flower immediately at 100 Blossoms, with only normal ping between casts.
No maintenance cast or filler intervenes at the cap. Fan Q refreshes use its
spare charge during Unfading Flower, before Jadebreak expires; the preset has no
Jadebreak gaps or Fan Q charge waits. Refilling starts after the current action
completes and Flower ends.
Lingering Bone is maintained by projectile refreshes as well as Fan charged
light. All Unfading Flower activations start with Jadebreak and Combo.
The preset retains its original
`jade-three-rounds` ID to preserve saved selections.

The filler sequence uses three Flute cancels. The first Bursting Nine uses one
seven-hit volley; the second uses two. Smolder one-hit and Poet five-hit cancel
require Deflect or Fan Q immediately afterward in the authored preset. Smolder
can lead directly into Fan Q to avoid a separate Deflect. Fan heavy pursuit
is another user-confirmed cancel follow-up, but its complete cast duration
remains unconfirmed and unmodeled. Emerald Barrier applies Jadebreak at
0.167s and Windrider at 1.02s. Its cancel variant ends at 0.167s, retains
the hit at 0.15006s, and does not grant Windrider. Both variants share their
charge pool and breakdown category. The cancel variant requires Fan heavy
pursuit next. The optimizer compares this pair with full Fan Q and with
Deflect after the supported Mystic cancels.

Inkwash and Dear Sword were also compared using the October 30 nominal
first-cast timelines from the new-mystic-timings export. Inkwash uses the
ordinary two-stage route through its 4.096742424242423s movement gate. Dear
Sword uses the four-stage solo route through 8.002653846153846s, omitting
markers after each earliest transition. Even with a generous 2.4 multiplier
on all final-stage Dear Sword hits (NPC enhancement and Sword Essence),
neither displaced the selected fillers in the tested sequences. These
comparison candidates are not registered runtime skills; contact/startup
uncertainty remains as described by the export.

The preset uses Unfading Flower [Cancel] followed by Deflect for each activation.
Cancel ends at mode application (0.6s); Deflect adds 0.3s, saving 0.193s
against the normal 1.093s release without removing the hit or ongoing mode.
Both activation variants share the Unfading Flower Heavy Attack breakdown category. Follow-up projectiles retain their Unfading Flower name without a category wrapper. The activation hit has no FrequentProjectile tag and does not receive the Frequent Projectile attunement.
Unfading Flower mode blocks ordered Umbrella-tagged skills through the shared
automatic readiness wait. Resource depletion removes the mode immediately;
the delayed Blossom return does not restore it. Triggered projectiles remain
active during the wait, and manual refill delays are unnecessary.

Each Unfading Flower volley refreshes an existing Lingering Bone mark to
five seconds remaining, as confirmed by the user. It does not apply a missing
mark or add five seconds to its remaining duration. Its filler candidates were compared through
the production timeline and damage pipeline: the selected sequence uses Flute
Cancel, Leaping Toad/Deflect, Bursting Nine, Soaring Spin, Smolder, and Drunken
Poet. Yaksha Rush was also considered but was not selected. This is a constrained
sequence search, not a claim of a global optimum.

Moon Shatter Spring uses the October 30 13:05 event-clock-migration export's
current action 20302105, including its recovered startup and landing phases.
The ordinary three-hit route reaches its interruption boundary at 1.557s;
Windrider selects the five-hit route and its 2.433s boundary. These are nominal
earliest interruption times, not animation-end times. The old numerical-owner
20302103 action is not a separate cast or an extra hit sequence. The shared
six-second cooldown begins at cast start, and pursuit requires LB or Airborne.
Windrider selects the route at cast start and is not consumed by the cast.
NPC hit coefficients already include the 45% bonus; it must not be added twice.
Each hit grants Startling Spring (export buff 200177), up to five stacks for
15 seconds. Each stack adds 4% charged-skill damage and Endurance cost, scoped
to Charged-tagged skills rather than all damage. Enhanced pursuit uses the
export's distinct second-hit timing against Airborne targets.
The route is selected once: Windrider expiring during an enhanced cast must not
append the ordinary route. Internal dispatch and attack components ignore
additional ping; the ordered pursuit pays input latency once. The current
preset replaces two consecutive Fan charged lights after the fourth Flower
with Peak cancel followed by the enhanced pursuit. All six Jade build/tier
combinations improve; Max BT19 rises from 81,053.74333518809 to
81,455.47574941137 DPS. The search compares replacements of up to four
consecutive fillers while preserving required follow-ups, seven full-Blossom
Flower casts, and JB/LB/SR coverage. This is a constrained local search, not
a claim of an exhaustive global optimum.

Peak's Springless Silence uses the October 30 13:23 export's resolved action 20302101. The full variant uses its 1.1133333333333333s interruption boundary;
Cancel ends at the 0.557581475s main contact/Windrider application and must be
followed immediately by Moon Shatter Spring. Both share the same category and
12-second cooldown. Its separate 0.35s preliminary hit contributes 0.5% of base
damage only when distance is strictly below 2.5m and the target lacks Airborne.
The main hit contributes the other 99.5%. Existing LB or Airborne enables the
three-second Windrider grant; an unmarked target receives LB but no guaranteed
Windrider from that same contact. The contact also refreshes SR through its
shared grant cooldown. These are nominal immediate-contact timings; travel,
whiffs, and hit-reaction motion are not simulated. Thunder Enlightenment - Jade
and Gourd Toss variants are outside this implementation.

Refreshing an existing Lingering Bone with an Unfading Flower projectile also
triggers Star Reacher, sharing the one-second `StarReacherGrant` cooldown with
Fan charged light. An unmarked projectile grants neither Lingering Bone nor
Star Reacher. The grant resolves the ordinary or exhausted/low-Qi bonus from
the live target state, so Flower can refresh it throughout the spending phase.

Fan Q has two sequentially recovering 15-second charges. Its spare charge
allows Jadebreak to be refreshed before its 15-second duration expires.
Umbrella Q has one base charge, two at Blossom Barrage T0–T5, and three at T6.
Charges recover one at a time. Its five-second Combo hit refund advances the
recharge queue: if the current charge has less than five seconds left, the
unused reduction advances the next spent charge (`cooldownReductionCarries`).
Unused reduction cannot be banked for a future cast.
These charge capacities are user-confirmed; the raw
15-second cooldown alone does not describe skill availability.

The manual Blossoms event uses the same signed resource-change semantics as
Hellfire: positive amounts add, negative amounts subtract, and the resource
stays between zero and its cap. It supports timed and before-hit attachments,
including prepull timestamps. The resource and Jade preset start at zero.
The first Umbrella Q grants 20 and the second grants 45 against Combo.
Heavy adds 5; one Colorful Phoenix fills the remaining Blossoms.

The October 28 08:11 export replaces Colorful Phoenix's candidate hit route
with `colorfulPhoenixCollisions` and an empty `routes` array. The female clip's
C2 window opens at 0.3251136346310377s; the first C1 window opens at
0.4441558117121458s. Each channel has a 0.3s same-target hit interval. The four
C1 windows therefore allow at most two hits on one target, and C2 allows one:
three hits total is an upper bound, not five guaranteed hits. Each landed hit
grants four Blossoms. Both C1 (`2060110101`) and C2 (`2060110102`) use a 0.33
multiplier of skill `20601101`'s damage baseline, confirmed by the normal
`hitCoefficients` export and the user. Exported per-hit coefficient curves
already include that multiplier; do not multiply those curves by 0.33 again.
The user confirmed the simulation's cast-relative schedule:
C2 at 0.3251s, first C1 at 0.4442s, and second C1 at 0.7442s. Use these exact
accepted values, with the second C1 respecting the 0.3s same-target interval,
rather than treating each exported window opening as a separate hit.

Colorful Phoenix uses explicit one-, two-, three-hit, and refill-threshold flat attacks, with
no resource-based cancellation or component subactions. Their cast times are
0.3251, 0.53, and 0.7442 seconds. The two-hit route retains the accepted
0.53-second preset cancellation, including the target-check grant at that time.
Seven independent four-Blossom target-check grants occur at 0.03, 0.13,
0.23, 0.33, 0.43, 0.53, and 0.63 seconds. These are resource events, not
damage hits. Each route includes only events through its cast end, earning
16, 32, or 40 Blossoms before the cap. Reaching 100 does not cancel hits.
The Jade preset uses colorfulphoenix2. The full three-hit variant uses
ColorfulPhoenix; saved colorfulphoenix3 selections migrate to that ID.

The user accepted the following timings from
`local/datamine/2026-10-28_06-39-41-598_+0000-OjDtw0/wwm-skills-normal-all.json`:

- Forsaken Fame (Fan charged light) is final despite its exported provisional
  label: ordinary attack at 1.19s and interrupt at 1.63s from cast start;
  with buff `10230141`, attack at 1.00s and interrupt at 1.44s.
- Spring Sorrow (Umbrella Q) uses its projectile request time as impact time:
  0.7779487179487179s with Blossom Barrage, or 1.0066666666666666s without it,
  from cast start. No additional projectile travel delay is modeled.
- Normal Unfading Flower (`20601103`, buff `200112`) applies its mode at 0.6s
  and uses projectile callbacks as impacts: first at 1.15s from cast start,
  then every 0.5s while active. No additional projectile travel delay is modeled.

These are accepted implementation inputs. Do not substitute animation recovery
boundaries for projectile impacts.

`jade-fully-relayed-min` and `jade-fully-relayed-max` copy Strength's Pure Fully
Relayed Min/Max layouts at tiers 96 and 100, change the weapons to Vernal
Umbrella/Inkwell Fan, replace Art of Heng with Art of Umbrella, and convert native
Stonesplit rolls to Silkbind. They select Blossom Barrage, Morale Chant, Star
Reacher, and Thunderous Bloom at T6, Mistwillow four-piece, and the Silkbind
arsenal. With Clay Oven Flatbread and the normal breakthrough 17/18 targets,
Min reaches 80% effective crit at both tiers; Max reaches 80% at tier 96 and
79.7524% at tier 100. These are starter equipment layouts, not DPS-optimized
builds.

Jade defaults to `jade-fully-relayed-max`. Its graduation reference,
`jade-graduate`, retains that Max layout and setup with non-relayed maximum
affix rolls at both gear tiers. Existing saved build selections remain unchanged.

Mistwillow four-piece is implemented using existing ordered damage triggers.
Heavy hits grant Graceful Willow, boosting Light/Ballistic Physical and Silkbind
damage by 10%; Light/Ballistic hits grant Dense Smoke for Heavy attacks. When
both bonuses are earned they convert to one Mistwillow effect covering both
categories, without adding the two bonuses together. Matching hits refresh the
15-second effect at most once every two seconds. The hit that earns a bonus
does not retroactively receive it. Source: normal item set 25, buffs 120009,
120010, 120016 and passives 120008/120014/120015 in the October 28 01:03 export.
The set's two-second refresh rule supersedes the older five-second component
tooltip text; native `W_ATK_SCALE`/`PRO_ATK_C_SCALE` fields supply the Physical
and Silkbind damage pools.

The requested rotation begins Fan Q / Umbrella Q (combat starts on its hit) /
Umbrella Q / Umbrella Heavy + Light VC until 100 Blossoms / Unfading Flower /
Fan charged light. Subsequent rounds begin Umbrella Q, refill to 100 with Q or
Heavy + Light VC, then activate Unfading Flower. Fillers are Fan charged light,
Fan Special + five-hit pursuit, or Mystics. Umbrella attacks must not be cast
during Unfading Flower. Maintain Jadebreak, Combo, and Lingering Bone; author
the one-minute Grounded target break at the fourth round's Unfading Flower.

Confirmed resource data is in `blossoms` on the October 28 01:03 skill export,
with supporting analysis in `where-datas-mine-internal/reports/jade-blossoms.md`.
Resource 30 starts at zero, caps at 100, and ordinarily recovers 0.3/s in combat.
Light stages grant 4/3/5; Heavy stages 5/3/6/6; Dash and switch attack 4;
Colorful Phoenix 4 per hit plus up to seven independent 4-point target-check grants; Apricot Heaven 4 per hit; Bamboo Breeze 3 per hit;
Cloud Reverie 6 per hit; Spring Away 3.4 per projectile hit; Spring Sorrow 20
per successful attack result, plus Blossom Barrage's conditional 25 once per cast.
These are authored hit/branch grants, not guaranteed per-button totals.

Unfading Flower currently uses the user-requested temporary rollback to the
155-hit BP model: it requires 50 Blossoms, suppresses passive regeneration,
charges each grounded projectile 5 Blossoms, and uses continuous 25 Blossoms/s
consumption against Airborne targets. Grounded mode has no continuous base drain.
Qualifying exhaustion hits independently refund 3 Blossoms. Depletion removes
the mode and schedules the separate 15-Blossom return after 0.2s.

Volleys begin at +0.55s and repeat every 0.5s. Grounded Lingering Bone adds a
second shot at +0.15s; Airborne takes precedence and adds shots at +0.10s and
+0.20s. Each shot requires the live mode and positive Blossoms. The shot that
empties the meter still hits, but its refund cannot revive the mode. Heavy Attack
damage remains separate from UF projectile counts.

This is a restored comparison baseline, not the source-backed resource model.
The enhanced-drain audit establishes 10/s base drain plus 5/7.5 per enhanced
volley; the terminal-volley audit establishes that admitted delayed shots survive
ordinary mode removal. The intermediate corrected-drain implementation yielded
147 BP hits; allowing terminal volleys to finish yielded 152 in a diagnostic.
Both differ from the video's 155 and need further timeline investigation. The
user requested restoring the earlier implementation before reviewing Grounded
1 Min. See doc/jade-uf-volley-drain-results.md for the historical experiment.

### Bellstrike Splendor

Splendor is `available`: it has talent, Inner Way, attunement, and skill data,
preset builds, and the accepted `dummy-1-min-81-waves` DPS snapshot. Its path
status is not proof that any timing is verified.

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

Vagrant Sword's charge tier 2 uses this mechanism. The pre-charge
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

The 2026-10-20 timing export supplies normal animation-route interrupt boundaries
of 0.466s, 2/3s, and 0.866s for FA2, FA3, and FA4. Hit clocks are unchanged;
FA5’s two Echoes T6 bonus Rodents launch on its final blade hit at 1.023s
(full and Cancel variants); the ordinary coordinated Rodent launches on its first hit.
The Flamelash requirement for those two bonus Rodents uses resolveAt: skillStart:
it must be active when FA5 starts, and may expire before the final hit. Rampage,
Echoes T6, and distance requirements still resolve when the final hit triggers.
FA5 Rodent retains only its single immediate Rodent.

FA1 remains 0.357s and full FA5 remains 1.401s. The preset uses FA5 Cancel's
1.023s last-hit boundary followed by World to Sword on the first cycle and
Addled Mind on subsequent cycles while Flamelash remains active. The FA5 that
ends the first Flamelash window uses Deflect instead because Flamelash expires
during that cast. The next enhanced cycle restarts at FA1. Across
a dodge, it retries the stage replaced by a Rodent-only cast. It preserves the
dummy's incoming attack schedule, with earlier dodge starts aligned to their
authored attacks. If an attack cannot finish and leave the 40ms dodge input latency,
it uses the zero-duration Rodent-only variant and discards all blade hits,
including otherwise reachable partial hits. FA5 reserves enough time for the following
Addled Mind to finish before the dodge as well. FA3 now has that same existing
Rodent-only mechanism. Ordinary attacks restart at A1 after Flamelash expires.
Every Bladebound Thread Cancel is immediately followed by Deflect, including
the opening cast and the later Rodent Rampage refresh sequences. The ordinary
light-attack sequence after the first in-combat Rampage refresh starts only
after Bladebound Thread Cancel, Deflect, and Rodent Rampage, so utility casts do not split LA1
from LA2/LA3.

The manually authored second window restarts at FA1 after its first dodge.
Perfect Dodge itself preserves the combo; this restart is retained by user request.
A 0.066s Delay before the late second-window FA4 lets it start with Flamelash
active and continue after Hellfire depletion. Its remaining hits regenerate
Hellfire, followed by the normal LA1–LA4, Flute Cancel / Deflect, and LA1 refill
sequence. The next Flamelash starts at 80 Hellfire without changing the drain
cadence or forcing a resource value.

Hellfire remains governed by its accelerating 0.132s drain and Echoes'
Samsara hit recovery; no duration override or resource refill is authored.
New enhanced casts must start with Flamelash active; an accepted cast can
finish after depletion. Qi markers follow the damage-based break anchor.

The in-combat refresh blocks use Bladebound Thread Cancel / Deflect, then
Rodent Rampage. After the third activation, full FA1 and FA2 precede that
block so the existing Rampage can launch its coordinated attacks before refresh. Its later cycle
continues FA1–FA5 instead of reverting to normal attacks while Flamelash is active.
When that FA5 exhausts Hellfire, Deflect precedes normal LA1–LA4 loops. The fourth
activation waits until Hellfire is 80, then resumes FA1–FA5 with Addled Mind after
FA5. The late 53.475s and 59.475s dodges are omitted while Breaking Point
Cooldown is active and no Mystery buff remains. Full LA1 completes the refill,
and full FA2 connects directly into FA3 instead of using Rodent-only casts and
dodge resets.

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

The 0.743 s Bubbles charge is a retained user-supplied value, not a measurement
replaced by the October 23 export's separate charge-opening/threshold fields. Soul Sweep Cancel at 0 and Piercing
Dart Charge at 1.5 s are user-confirmed rather than timing gaps.

#### Scarlet Spin opening-catch timing (October 23, 2026)

The selected catch policy accepts input at the exported window opening. A catch
does not itself start the next throw: the continuation starts at the exported
gate and is admitted only while the owning Flower Burial application is active.
The queued final throw lands after Flower Burial expires, without a Perfect
Catch or its Resonance. This retains fourteen throws and 84 direct hits across
the three batches. The 100% PC preset resolves 84 Resonances, including three
from Bubbles; the regular preset resolves 86, including five from Bubbles.
These counts arise from events, not a hit-count override. Battle End still
filters damage at 60 seconds.

Normal stage clocks from `20603202`–`20603205` in the October 23 export are:

| Stage | Catch opening  | Phantom creation | Creation Resonance request | Next throw     |
| ----- | -------------- | ---------------- | -------------------------- | -------------- |
| 1     | 0.615384615385 | 0.746153846154   | 0.976923076923             | 1.076923076923 |
| 2     | 0.416666666667 | 0.583333333333   | 0.833333333333             | 0.958333333333 |
| 3     | 0.545454545455 | 0.727272727273   | 1.000000000000             | 1.090909090909 |
| 4     | 0.454545454545 | 0.609090909091   | 0.881818181818             | 1.000000000000 |

Direct-hit, creation, request, and continuation clocks scale by `1 / 1.3` on
a Fragrant Song throw. Enhanced catch openings have their own source values:
0.295857988166 / 0.252564102564 / 0.349650349650 / 0.279720279720 seconds.
Normal and enhanced continuation admission use the corresponding openings.

`PhantomUmbrellaSummon` now only replaces the Phantom and marks its creation
for the current throw. Each stage requests its Creation Resonance separately
when that throw actually summoned. A catch with no available Phantom sets
`PendingCatchResonance`; the later request resolves that pending catch once if
a Phantom exists. An immediate catch pulse never also sets the pending flag.
Both hidden flags clear at the next throw's start, and pending catch clears
after its request check. Lower-tier every-third-throw summon cadence is retained.

`FragrantSongResonance` remains the owning throw's marker. Each stage explicitly
clears it at the recovery/next-throw boundary listed above, scaled by `1 / 1.3`
on enhanced throws, before continuation starts. It has no fixed expiry; the
start-of-throw clear remains to reset ownership. Creation and accepted-catch
pulses before recovery retain guaranteed Critical and the additive 20% damage
bonus; later pulses do not. An early catch can
ready Fragrant Song for the following throw without granting its bonus to the
current ordinary throw. The source's unconnected request is not counted as an
extra guaranteed pulse. Interruption-specific readiness/damage cleanup and projectile contact latency
remain outside this scheduled-recovery cleanup. Direct-hit and
next-throw timestamps are unchanged, so the existing authored Qi anchors are
retained rather than recalibrated solely for the shifted supporting events.

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
The regular variant crosses 60% Qi at 51.44970650513562s after recovery immunity;
its shifted 40% threshold falls after Battle End and is omitted.

The regular preset keeps all three Scarlet Spin windows at 12s, producing
14 throws per cast at rank 13. After the second Scarlet Spin, it uses two
Dreamwrought Bubbles casts followed by full Flute of the Tides, replacing
the former Bubbles / two-hit Soaring Spin / Flute sequence. The additional
Bubbles stays at 9m; the obsolete movement to 1m is removed. This saves
0.78992899s and preserves Soulbreak for the third Burn and Bury.
At 35ms ping, that Burn and Bury starts at battle time 42.7375606916s,
with its hit at 43.2675606916s before Soulbreak expires at 43.2942448408s.
The fourth Burn and Bury hit lands at 59.9958055324s, leaving only about
4ms before Battle End; this tight timing was explicitly accepted by the user.
The first cast and the sixth throw of the second cast retain their timing,
so the authored Qi ramp and Exhausted anchor remain unchanged.

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

Dreamwrought Bubbles is split into a charge and a release sub-action.
The Normal description's 20% non-player HP damage bonus belongs to the release
sub-action so both outbound and returning hits receive it. Parent modifiers do
not propagate to sub-action damage. Normal calcpoints `2060320101` and
`2060320102`, layer 1, carry `target_tag_correct: [[8, 0.2]]`; layer 0 omits it.
This is a target correction, represented by `baseDMGBonus` for the supported PvE
targets, not Category 1 `hpDMGBonus`. The October 21 bonus coverage ledger left
this occurrence uncertified, and the October 23 coefficient audit did not verify
its runtime application. Neither audit established complete Bubble bonus parity.
The separate Everspring channel-damage talent is restricted by passive
`31220311` to originating class 108/current art 20603. Bubble's class 104
context, including its Resonance, does not receive that talent; the broad
`ReturningUmbrella` tag is not its eligibility test.

Actions scheduled past a skill's cast time are inactive, and action times are absolute from
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
The rank-13 route starts 14 throws independently of ping. The parent sets
`ignorePing: true`, and queued stages do not opt into `triggerPing`, so input
latency does not shift throw execution or final queue acceptance. The parent clears accumulated catch stacks at the start
of a new segment. Local hit markers from every started stage remain two separate
outgoing/returning damage actions.

The draft has no accepted DPS snapshot and must not be treated as a validated
build or rotation recommendation.

Soulbreak's 5% applier damage bonus uses general `dmgBonus` (Category 1).
Burn and Bury uses `baseDMGBonus: 0.3`, multiplying its direct base hit separately
from Category 1; settlement does not receive this multiplier again. Towline T6
retains its 12% replay and the shared Wildstride/Strayhunt replay adjustment.
Tang Melody requires HP above 50% through T4; T5 removes that restriction.
Its critical bonus requires both singular `MartialArt` and `DirectDamage`,
matching the modeled originating class-108 skill contexts. The broad
`MartialArts` tag alone is insufficient. Scarlet Spin Resonance retains its
`MartialArt` context, while Dreamwrought Bubbles and ordinary light/heavy
attacks do not gain the bonus. This does not change the stack-application triggers.
Fragrant Song's throw-scoped Resonance marker grants both guaranteed critical
and 20% Category 1 HP damage while active, using the existing throw ownership
and expiry rules. Current encounters are non-player targets.
Light Anew T3 immobilization/lockouts, Candlelight slow, Phantom Rally pull,
and Burn and Bury slow/Breath-hold are intentionally ignored by user instruction.

Towline T6 refreshes/settles target Soulbreak only at distance <= 15m.
Its self Soul Return refresh and Burn and Bury damage bonus are not range-gated.

### Bellstrike Umbra implementation gaps

`InnerTrackSlashCancel` (Sword QQQ [Cancel]) retains both third-cast hits and
ends that component at its second hit, 1.187704707s into cast three. Its total
base duration is 2.510104707s. The component remains in the ordinary third-cast
breakdown category and is hidden from rotation selection with `SubAction`.
The 60-second preset uses this variant for the first QQQ, followed immediately
by Ghostly Step - Umbra. At its configured 40ms ping, the delay before the second
Sweep All is 1.342295293s, preserving its 12-second Empowered River Flow BB
cooldown boundary and the rotation's 38 total Blood Bursts.

Umbra's dummy Qi break is attached after the final direct hit of editor cast #34
(zero-based skill numbering), Inner Balance Strike III [2 Casts][Cancel]. At the
preset's 40ms ping it lands at battle time 30.197903827636353s. Pre-break Qi
thresholds are authored at 40% and 60% of that time. Exhausted lasts ten seconds
and its expiry restores Qi; the next ramp starts after the additional four-second
immunity window. Only its 40% depletion milestone falls before the 60-second Battle End.

Umbra is available without Dev mode. Its Fully Relayed Max Build and Full Max Build presets copy Splendor's gear,
replace the four armor attunements with Strategic Sword - Bleeding DMG Boost,
and use Hawkwing with Sword Horizon, Morale Chant, Insightful Strike, and
Wolfchaser's Art at T6. `dummy-1-min-38-bb` is registered as a draft, with the
requested ordered sequence and Battle End at battle-relative 60 seconds. BB
means Blood Burst; 38 is the intended trigger count, not a validated result.
The first four-hit sword charge's first damage marker anchors battle start.
Zenith is a resource starting at 40, capped at 100 (20 per former stack).
The preset has no opening Zenith buff. Smolder follows the first Sweep All,
allowing the next full-Zenith burst to extend it through Sword Horizon T3.
The wait before the second Sweep All is 0.2 seconds, preserving River Flow,
its 12-second burst cooldown, and all 38 Blood Bursts.

Umbra variants share `skillBreakdownCategory` by skill family: Inner Track
Slash, Inner Balance Strike, Second Track Slash, Sober Sorrow, Sweep All, and
Blood Burst. `SecondTrackSlash2Casts1Hit` composes the existing charge and
one-hit follow-up; the preset replaces adjacent pairs with that composite.
The component IDs remain available for stored rotations and overrides.
Inner Balance Strike's second-cast variants use the separate breakdown category
`Crisscross - Inner Balance Strike III`.
Composite damage and healing use the subaction reference's `skillBreakdownCategory`,
then the component skill's category, then wrapper attribution. Reference overrides
also propagate through nested composites. Cast statistics
continue to describe the complete composite, and action IDs and damage are unchanged.

The refreshed `local/datamine/wwm-skills-normal-all.json` supplied on 2026-10-08
includes normal-route Strategic Sword per-hit coefficients and attack-animation
markers. These coefficients already include the hit multiplier; importing them
must not multiply them a second time. Level-dependent curves select level 100,
while scalar follow-up curves use their exported value.
Inner Track Slash uses three separate animation clocks: stage one advances at
the 0.3s combo boundary, stage two at the 1.0224s perfect-input boundary, and
stage three finishes at its 1.426s interrupt boundary. All seven damage hits
(one, four, then two) are imported, including both Horizon follow-up coefficients.
The four-hit charge uses the first four level-one hits after a free 0.2s
pre-charge and the minimum 0.3s charge clock, then advances at the 0.947s
perfect-input release boundary. Its deflect
cancel timing remains unmeasured. The first-stage special imports all four
hits and its 1.4s interrupt boundary. Sober Sorrow now uses all six exported
hit markers and the 1.996s full-cast interrupt boundary. Its five-hit cancel
uses a temporary boundary at the fifth hit (1.374300296s); actual cancel timing
remains unmeasured. Sweep All retains its 0.304s one-hit cancel duration. The
2026-10-21 14:51 export supplies first-hit markers at 0.26737638636363636s for
basic/Water Drop and 0.30375544363636364s for Spring Surge/River Flow; the user
confirmed this buff mapping. Damage and hit-attached effects use these markers
without shortening casts.
These remaining placeholders cannot validate the proposed sequence within 60s,
cooldown readiness, effect coverage, or its named 38 BB count.

The user confirmed that Q Q Q uses all three stages, the combined special
uses both stages, and the four-hit special uses only stage one. On 2026-10-08,
the combined special was clarified to mean three stage-one hits plus one
follow-up hit (four total). It advances at 1.063s and ends the follow-up at
its first hit at 0.095977982s for the combined [2 Casts][Cancel] variant.
The standalone second-stage definition retains its 0.946s interrupt boundary. Inner Track
Slash's first two stages use the source one-plus-four hit series; the third
stage is the two-hit Horizon follow-up. Second Track Slash is the charged route;
Inner Balance Strike III is the special route. The combined special now applies
Bleed before checking for Blood Burst on each stage-one hit. Horizon follow-up
hits also apply one stack and check at that same hit, including the second hit
of a two-hit route if the first has not reached five. These application/order
semantics are user-confirmed from combat comparison, rather than explicit
tooltip ordering. Charged follow-ups expose one-hit and two-hit
cancel variants; the rotation uses the one-hit variant. Their temporary cancel
boundaries equal their last retained hit marker (0.22504647s or 0.68347914s).

The 2026-10-21 14:51 export also moves Second Track Slash release's first hit
to 0.094987652s and Inner Balance Strike III's follow-up hit to 0.095032667s.
Their hit-attached Bleed and burst checks follow the corrected markers; existing
cancel durations and combo transitions are preserved. The 38-BB preset's authored
Qi thresholds retain their proportional placement against the corrected final-hit
break anchor.

Damage coverage and remaining omissions:

- Bleed ticks (`2038001`–`2038005`) use the user-supplied per-tick coefficients:
  0.132/0.165/0.198/0.264/0.33 for both physical and attribute damage at one
  through five stacks, without an additional stack multiplier. The existing DOT
  scheduler ticks at application +0.528s, then every 1.023 seconds. Stack additions refresh
  the ten-second duration while preserving cadence. Sword BB clears all stacks,
  then T6 reapplies two, restarting the 0.528-second tick delay. Full Zenith also
  extends the reapplied Bleed through the existing 16-second cap. Clearing or
  expiry ends ticks, and reapplication starts a new timer.
  Sweep All's High Bleed does not detonate Bleed: it keeps five stacks and preserves cadence.
- Blood Burst (`2038006`) uses the user-confirmed physical and attribute
  coefficients of 2.4, supplied on 2026-10-08. The export still lacks its curve,
  but burst damage is now implemented and resolves immediately on its trigger.
- The refreshed export resolves Q stage three and the four-hit charge/special
  coefficients, both charged follow-up cancel variants, and the combined special.
  Their coefficients are no longer placeholders; measured partial-route cancel
  boundaries remain missing.
- Horizon's description scopes its five-stack Blood Burst to follow-up attacks.
  This does not add a global threshold trigger to ordinary Q or charge hits.

Sword Blood Burst clears all Bleed stacks, then T6 reapplies two while Zenith
exists after the burst's Spirit grant, including the first burst as observed
in the user's confirmed special sequence. Raw Horizon passive `102154301` grants 20 Sword Spirit per burst,
stored as 20 units of the Zenith resource. At 100 Spirit the next burst forces
Affinity; T6 retains 20 and then credits that burst's ordinary 20 gain.
The T4 bonus and T1 follow-up Endurance restore are implemented. T3's full-Zenith
burst extends Bleeding, Smolder, Qingyi's Poison, and Weeping Blood by ten seconds,
capped at sixteen seconds remaining; missing effects are left absent. All
currently supported encounter targets are non-player targets.
Strategic Sword rank 13/14 restores ten Endurance on the first qualifying
five-stack Special hit of each cast. Special stages apply their Bleed stack
before checking the threshold. Their shared `StrategicSwordSpecialBloodBurst`
trigger restores Endurance when the cast-start readiness effect is present,
consumes that effect, then detonates. A hit raising four stacks to five therefore
restores Endurance too; later bursts in the same cast do not restore again.
The Special follow-up declares a `skillStart` action at its own start. This uses
the shared skill-start trigger pipeline with the component's tags, refreshing the
talent's readiness for that second cast even inside a composite rotation row.
Thus two casts can each refund ten; multiple detonations within one cast refund
only once. The composite wrapper remains a display container for these casts.
Ordinary Q/charged follow-up bursts and Sweep All do not use this special refund.
Blood Burst is `DirectDamage`, with `HighBleed` selecting Soul-Shaken's exclusive
High Bleed bonus (10% per stack). It receives no ordinary DOT bonus or
Insightful Strike DOT-only T6 bonus. `Bleed` selects Bleeding attunements and talents.
Legacy special and charge follow-up IDs migrate to the current III/Crisscross IDs
in saved rotations and skill overrides, including component references.
Component-only skills carry `SubAction` to hide them from rotation selection.
Every Umbra skill includes its own current skill ID in its tags.

Sober Sorrow's five-hit cancel and full six-hit route use the source five
0.15 multipliers plus the final 0.25 multiplier. Sweep All uses the description's
0.8/1/1.2 factors against `20101101`, rather than guessing from its separate
parent curve. Water Drop, Spring Surge, River Flow, and Empowered River Flow
are selected automatically when Sober Sorrow ends, using its cast-scoped combo
resource. Every DirectDamage hit during the cast counts, including Solid Foundation;
DOT ticks do not. Wolfchaser adds an extra combo on Sober Sorrow hits with own Bleed
at probabilities 0.6/0.7/0.8/0.9/1 for one through five stacks. Expected calculation
adds probability-weighted resource gains; sampled simulation rolls each gain.
Buff thresholds read this resource at the authored cast end; this expected-counter
model does not branch buff selection at uncertain thresholds. Five-stack casts
are deterministic. The counter resets on each cast and remains available for
diagnostics after the window closes. The explicit five-hit/ten-combo variant
starts with five extra combos and is used for the first Sober Sorrow in the
draft (stored step index 8). River Flow and Empowered River Flow Sweep All fill
Bleed to five stacks, based on the user's confirmed behavior; the tooltip only
says that Bleed is applied. Subsequent casts still require those stacks to
remain present; expiry and intervening consumption are not bypassed. The second-cast special cancel
keeps the first Empowered River Flow active through the second Sweep All;
all ordinary Sober Sorrow casts in the draft now start at five Bleed stacks.
Sweep All's defense reduction lifetime and empowered damage leech are missing.
Wolfchaser T3 damage, T6 Soul-Shaken, and the existing three-hit/three-second
rolling-window mechanism for fifteen-second Wine Gu are implemented.

User-supplied Endurance costs (2026-10-08): Second Track Slash drains 14/s
only during its held-charge phase and pays another 6 at 0.3s. A separate 0.2s
pre-charge precedes the 0.3s charging phase, matching Vagrant Sword's explicit
phase structure; pre-charge does not drain Endurance. Its separate
four-hit release does not continue the charging drain. The draft's default
0.3s hold costs 10.2 gross Endurance; a 1.2s full hold costs 22.8. Natural
regeneration and suppression use the shared resource pipeline, including before
battle start. Charging overrides regeneration to 0.001/s; the one-time 6 spend
suppresses regeneration for 1.2 seconds. Continuous
drain changes the tracked meter but, like other charging phases, is not
credited as direct `enduranceSpent` damage scaling.
Inner Balance Strike III pays 40 at stage-one start, for both the four-hit
first-stage route and the three-hit-prefix plus follow-up route. The follow-up
does not pay another 40. Its minimum 50 Endurance activation requirement is
documented but deliberately not enforced, at the user's request. The recovered
held-charge path has no fixed minimum and ends when Endurance runs out; this
draft tracks depletion but does not automatically truncate an authored hold.
Sweep All pays 40 at the start of its selected Water Drop, Spring Surge, or River
Flow component, once per cast. This direct spend also starts the shared
1.2-second regeneration suppression; empowered recovery remains a separate gain.
Endurance checks remain draft diagnostics with the remaining timing gaps,
not validation of the final measured rotation.

Umbra cooldowns, incoming mitigation/Tenacity, and missing
stage-specific Bleed grants still need source records. General and Mystic
skills retain their existing definitions. The draft has no accepted DPS
snapshot; its incomplete damage and zero timings cannot establish either a
useful DPS recommendation or the intended 38 Blood Bursts.

### Food choices

Food has two independent categories, each with its own None option. Physical
Attack offers Clay Oven Flatbread (+140/+280 effective Physical Attack), while
Endurance offers Swallow’s Agility (巧燕). Both can be active together.
The persisted `food` selection holds Physical Attack; `enduranceFood` holds
Endurance. Legacy Swallow’s Agility selections migrate to Endurance with Physical
Attack set to None, preserving the previous effects.
Endurance (Swallow’s Agility) is available only for Splendor and Umbra and adds
20 to `maxEndurance` through the shared stat pipeline. A saved unavailable food
is treated as None without deleting the saved choice. Comparisons involving
Endurance food rebuild combat with the variant’s starting Endurance and capacity.

### Umbra canceled Stage 1 Slash preset

`SecondTrackSlash1Cancel` uses the existing charge components and a four-hit
release ending at 0.831138954 seconds. Its release preserves all damage and
Bleed applications. The one-minute Umbra preset uses this cancel twice;
its timed Qi ramps are recalibrated around the earlier attached Qi break.

### Silkbind Wings Preview combat

Wings follows Deluge in the selector and is available without Dev mode with a Preview badge. Its martial arts are
文動霓裳 (Ribbon & Drum) and 杏遊草野 (Fan). Their rotation skills use the
normal layer-zero, level-100 numerical records from `wwm-skills-normal-all.json`.
Alternative hit IDs with identical numerical ownership are not extra hits.
Fan Q uses the tooltip's 0.8 multiplier; special variants use their exported
0.85 or 0.7225 multipliers. Attribute coefficients retain the same baseline as
physical coefficients. The shared damage calculator applies the primary Silkbind
attribute's 1.5 multiplier once; it must not also be baked into `attrCoef`.

The updated export supplies provisional animation clocks. Wings imports the
interrupt clock as the cancelable cast duration when the route identifies the
matching skill animation. Equivalent branches with identical clocks share that
timing. This covers both Drum Q casts, the drum light variant, all three matching
drum heavy casts, and both Fan Q casts. The Pre-VC third-heavy component
interrupts 0.25 seconds earlier (0.5833333333 seconds) when followed by VC. Hit clocks are imported for heavy stages
two and three and the drum light variant; its on-hit 雅意 gain uses that same
clock. These source routes remain marked `audit-provisional`.

Unresolved event timings remain zero. The first Drum Q's collider marker is not
projectile contact, and the second Drum Q and ordinary Fan Q lack hit clocks. The
first heavy uses its own animation's interrupt clock, never the unrelated
`skill_20901001_2` route; its hit clock stays zero. Northwind Sweep uses the shorter `skill_20303105_2` animation route by
explicit selection: its cast duration and three hit clocks are imported. Enhanced Fan Q uses two attack requests at 0.5 and 1.0 seconds, splitting the
existing combined coefficients into the first and second wind fields. Its
connection to Perception is at 1.0 seconds. The one-dash Fan Perception route
uses a 1.933-second cast with slash and final damage requests at 0.566 and
1.816 seconds relative to Perception start: 1.566, 2.816, and 2.933 seconds
from enhanced Fan Q start for slash, final damage, and ordinary interrupt.
After each slash, another eligible target allows another dash, up to four
executed dashes. Each additional dash adds 0.4 seconds to the final damage
request and ordinary interrupt gate; the first slash clock is unchanged.
For one through four dashes, final damage / interrupt times from Perception
start are 1.816 / 1.933, 2.216 / 2.333, 2.616 / 2.733, and 3.016 / 3.133
seconds respectively. The rotation editor’s enemy count selects the dash count,
capped at four, through existing enemy-count requirements and segmented timing
modifiers. Extra dashes strike other targets, so they extend timing without
adding slash damage to the selected target. The first slash and unspecified
resource/buff clocks are unchanged.
These are nominal callback/request times; unspecified buff and resource event
clocks remain unchanged. Jadebreaker uses user-supplied nominal timings from skill start: ordinary hits
at 0.982, 3.033, and 4.089 seconds; the enhanced wave at 5.235 seconds; and
the Harmony T6 extra wave at 5.435 seconds. Its earliest normal cancel is
5.852 seconds. The enhanced component starts at 5.235 seconds and places its
extra wave 0.2 seconds later. These timings assume immediate melody selection,
an immediately starting rhythm clock, and earliest perfect inputs. Position
synchronization and ring contact may delay actual landing; selection UI handoff
delay remains unverified. Dawnsun uses the same immediate-selection and earliest-perfect-input assumptions:
melody selection becomes available at 0.566 seconds, ordinary hits land at
0.982 and 2.963 seconds, the enhanced hit lands at 5.165 seconds, and normal
cancel is available at 5.920 seconds. The selection milestone is documentation,
not an additional delay on these skill-start-relative times. Buff applications and other
mechanic-event clocks are unchanged where unresolved.

Both presets use heavy 1–3 / VC for every drum combo, followed by movement to 1m,
and enable infinite Vitality. After the opening Ripple, the first round uses
Drum Q1/Q2, two heavy/VC combos, Leaping Toad / Deflect, Boundless Blossom,
End of Gale, Smolder 2-hit cancel / Deflect, and the second Ripple. This ordering
leaves a roughly 0.67-second Jadebreaker / 0.74-second Dawnsun Cloudshear gap
before Boundless Blossom. Smolder at skill 25 also leaves roughly 0.56 seconds
without Cloudshear before the fourth Ripple refresh. Qi breaks after the second Ripple's last hit: the second
enhanced Jadebreaker beat at T6, or Dawnsun's final wave. The following Drum
Q1/Q2 restores 100 Noble Will and resets the shared Ripple cooldown through
Harmony Song T4. Flute cancel / Deflect then precedes the third Ripple, followed
by Boundless Blossom, Smolder 2-hit cancel, End of Gale, heavy/VC, Leaping Toad / Deflect,
Drum Q1/Q2, heavy/VC, and the fourth Ripple. Both presets share this sequence,
with only the Ripple skill and its last-hit Qi anchor/times differing.
The proportional Qi markers use 40% and 60% of the second Ripple's last-hit time.
After the ten-second Exhausted window restores Qi, another pair of 59.99% and
39.99% markers uses that same depletion rate, measured from Qi recovery.
Charged light
羅袖動香 followed by VC remains selectable. Charged light uses numerical skill `2100100101`: five
0.135 hits and one 0.19 final hit, following the explicit damage table rather
than the conflicting maximum-eight-hit tooltip. Its user-confirmed time to connect to VC
is 2.033 seconds: 0.2 seconds of pre-charge plus 1.833 seconds after pre-charge.
Flat attribute bonuses use the unscaled level-100 source values (39.15 for each small hit and 55.1 for the final hit); the shared primary-attribute multiplier applies once, including to these flat terms.
Individual hit clocks remain zero because they are unresolved. It carries both `Light` and
`Charged` tags.

`RibbonLightChargedVC` and `RibbonHeavyComboVC` are selectable composite skills
using the shared `subAction` mechanism. The heavy composite uses
`RibbonHeavy3PreVC`; ordinary `RibbonHeavy3` keeps its original timing for stored
references. Heavy stages and charged light carry `SubAction` and are hidden from
rotation selection. The composite wrappers ignore ping; each component retains
its own input latency, preserving the original separate-input timing. Both
presets use these composites. Wings damage skills and components carry their weapon-family tag (`Fan` or
`RibbonAndDrum`) for Art affix matching, independently of their `weapon` context.
Wings skills omit descriptions; unresolved timing
details are maintained here.

These presets remain drafts; their DPS is not an accepted timing benchmark.
Both use the non-attacking dummy. Exhausted is attached after the second Ripple's
last damage action, including the triggered enhanced beat for Jadebreaker.
The reset occurs once per 60 seconds on the following Q2 hit. The final Ripple
finishes before the unchanged 60-second BattleEnd;
only hits within that battle window contribute. The opener uses Drink cancel, Deflect, Fan Special, Flute cancel, Deflect, Boundless Blossom (granting
Rustling), and End of Gale. Combat starts on Boundless Blossom's first hit,
which enables End of Gale. The first Drum Special starts at 6m.
`EndOfGale` is the internal ID for End of Gale (formerly `FiendishSquall`).
End of Gale is a Heavy Varied Combo and carries both `Heavy` and `VariedCombo`
for damage-bonus matching. 墨韻 is displayed in English as Ink Rhythm; its
internal ID remains `InkRhyme`.
`RhythmOfAccord` is the internal ID for Rhythm of Accord (鼓樂和), formerly
`HarmoniousDrum`; composite skill components and eligible-hit rules use the new ID.
Rhythm of Accord is a Light Varied Combo and carries both `Light` and `VariedCombo`
for damage-bonus matching.
`VerdantGust` is the internal ID for Verdant Gust (一扇生息), formerly `Rustling`.
Saved casts, skill overrides, and nested skill references migrate to the new ID.
Crane's Cry uses `CranesCry`, migrated from `CraneCry`, through the same mechanism.
The shared skill-ID migration preserves saved rotations and skill overrides,
including skill tags and nested references.
End of Gale reapplies the 20-second Driftbreeze buff on its first hit, so later
loops omit Fan Special. Its application action is appended to preserve stored
action indexes. The editor displays 雅意
from worker state on rows and actions. Cooldowns and the imported cast clocks
advance the timeline even where a hit still has a zero placeholder.

雅意 is represented by `NobleWill`, initially 100 with a cap of 100. Drum
specials consume all of it. The requested single-target loops restore 30 from
鸞鶴引聲, 20 from each 鼓樂和, and 30 from 煞盡東風 with 風知意 T3.
No preset resource-refill event is used. Each Fan Perception dash attempts 30 雅意 recovery through a triggered skill
with two shared cooldown uses per 15-second window. The editor enemy count
selects up to four dashes; the third and fourth recovery attempts are rejected.

扶風 and 爍鼓 activate the rank-13/14 talents and 弦墨篇 penetration rules.
Paired 扶風 grants 6% attribute attack, rising to 12% with 風知意 T6;
爍鼓 grants 6% all attack, rising to 12% with 相和歌 T6 and 18% with
風知意 T6. 相和歌 T3 enhances normal Jadebreaker Critical damage only while 爍鼓 is active; T6
adds the second enhanced beat and its Critical bonus. 墨韻 lasts 18 seconds
at 風知意 T4. Dawnsun shield-active markers and damage reduction are modeled; shield absorption
amounts and interruption refunds remain unmodeled. The exhaustion
reset applies on 鼓樂和 or 鸞鶴引聲 damage against an Exhausted target.

The Cloudshear build copies Deluge's Etherwrath minimum-attack gear at tiers
96 and 100, replacing Fan boost with Ribbon & Drum boost and armor attunement
with 文動霓裳 Special damage. It equips 相和歌, 風知意, 弦墨篇, and
Morale Chant at T6. The Full Min Build preset retains this setup and affix choices, with every base and
additional affix at its tier maximum and the existing maximum attunements.
Ribbon & Drum gear uses the template Fan's base values and
affix availability pending a dedicated equipment export.

Cloudshear and Etherwrath are available for Wings. Cloudshear retains the
77.8 minimum Physical Attack two-piece bonus at four pieces. Its self buff,
裁雲·翊 (`buff.json` 109804), grants 6% to each applicable channel's damage-scale
pool and 6% healing for 15 seconds, capped at
one stack and refreshing its duration on reapplication, when Fan Q applies
扶風 or Drum Special applies 爍鼓. The automatic 扶風 application when 爍鼓
expires does not trigger Cloudshear. Ally application is not part of the dummy presets.

寸草心 T2 uses the first Void Attack table, matching Celestial Vigor
(19.9–39.9 at Solo Level 21). Its alternative table is not added. Solo Level
arrays prepend the application's index-zero slot to the source levels.

### Wings attunements

The tier-96 and tier-100 item exports share five Wings attunement categories.
文動霓裳 covers Martial Art, Special, and Light/Heavy/Varied Combo damage;
杏遊草野 covers Martial Art and Heavy/Varied Combo damage. Derived attacks
use the existing VariedCombo tag. Armor rolls use the shared level-based limits
(6% at tier 96 and 7% at tier 100); the two tiers import into the same keys.

Blade's Will triggers and 寸草 damage bonuses match `Light` plus `VariedCombo`
or `Heavy` plus `VariedCombo`, without skill-ID exceptions or combined category
tags. Its T6 bonus additionally retains the Drum Series scope.
寸草心 models PvE 寸草 stacks using the editor target count: three targets
(two at T4) unlock eligible-hit applications; T4 gives two stacks at three
targets. Stacks cap at five, last five seconds (eight at T1), and increase
eligible damage by 2% per stack (4% at T3), with the T6 five-stack bonus.
Target count is a proxy for simultaneous hits, including the Fan perception
route; per-target hit tracking and PvP effects remain unimplemented. See
[wings-implementation-audit.md](wings-implementation-audit.md) for remaining gaps.

The Wings Fully Relayed Max Build uses Max Physical Attack weapon base affixes and eight Power rolls, one additional affix per piece, in place of Max Silkbind. The tier-96 Drum already has Power, so its displaced Max Silkbind roll uses Momentum, the best eligible offensive alternative by average preset DPS. Its additional affixes are optimized independently at each gear tier; setup and attunements remain fixed.

Official item imports map Ribbon & Drum Art affixes 9793032/9794032 (tier 96)
and 10193032/10194032 (tier 100) to `ribbonAndDrumDmgBoost`. The item exports omit these affixes' name fields; the user-provided
Traditional Chinese label is 舞綾鼓武學增傷.

相和歌 T6 昭陽 enhanced wave extends existing 爍鼓 by four seconds at
5.165 seconds, so the initial 6.5-second buff expires at 10.5 seconds from
cast start. With only 扶風 active, it grants four seconds of 爍鼓 instead.
The game caps this extension at ten seconds remaining; that cap is documented
but not enforced because the modeled route cannot exceed it.

Wings has four fully relayed attack layouts: Double Min (Min Physical and Min
Void/Silkbind), Min (Min Physical and Max Void/Silkbind), Min Attribute
(Max Physical and Min Void/Silkbind), and Max (Max Physical and Power). Graduate retains its non-relayed Min layout and maximum rolls.
Double Min, Min, and Graduate require eight Agility rolls, one
additional affix on every equipped piece, at both tiers. Missing Agility replaces
Critical Rate or attribute attack, choosing the higher average preset DPS.
This requirement takes precedence over the former twenty-attack-roll and 79%
effective-critical-rate constraints. Max weapon bases are fixed to Max Physical.

Affix optimization uses the average DPS of the Jadebreaker and Dawnsun presets,
Simmering Fish Slices, Fire, no script, and default global debuffs at
breakthroughs 17/18. After applying the Agility and weapon-base constraints,
the remaining attack rolls stay fixed to preserve each layout. Remaining
additional affixes other than flat attack are optimized by repeatedly accepting the best
eligible single replacement until none increases the objective. Required
Agility stays fixed in Min layouts. Weapons, sets, Inner Ways, armor bases, and
attunements remain fixed. These are constrained local optima, not a global search.
A weapon cannot combine Void and Silkbind rolls of the same attack bound.
Physical penetration remains the selected attunement for every layout.

Double Min requires twelve Min Physical and eight Min Silkbind rolls, including
Min Physical weapon bases, while retaining eight Agility rolls. The 12/8 split improves both preset rotations at both tiers compared with 10/10. Additional offensive affixes
may be replaced only when neither preset rotation loses DPS. The tier-100
layout moves Precision from weapon/accessory rolls to the helmet to meet this
constraint. Min Attribute requires ten Min Silkbind, ten Max Physical, and three Agility rolls at both tiers. Its remaining Agility/Critical/Power positions are filled with Critical Rate or Power by enumerating legal assignments and selecting the highest two-rotation average DPS. Existing Precision and damage-boost affixes remain fixed. Both tiers select eight total Critical Rate rolls, reaching 79.83% effective crit at tier 96 and 79.21% at tier 100 with Simmering Fish Slices. Remaining fills use one Power roll at tier 96 and two at tier 100; an additional crit roll lowers the objective.

### Wings supported-effect corrections

墨韻 applies after the final Perception hit, including enemy-count dash delays.
Its T4 upgrade adds 5% to the original 5% while preserving Fan/Drum Series scope.
弦墨篇 T6 replaces previous penetration and limits its extra 12 penetration to
Drum Series. Its qualifying attack buffs include both Floating Grace variants.
裁雲·翊 uses damage/healing bonuses rather than attack-range bonuses.

Envigorated Warrior uses existing incoming/outgoing triggers and timed buffs for
its disable, Cage, escape and T6 mark. Incoming damage belongs to the modeled
target; no separate attacker identities are inferred. Morale Chant healing
applications share Yi River’s two-second application cooldown, and T6 damage and
healing payloads share their ten-second cooldown. Below-T4 random self stacks
remain unsupported. See [the Wings audit](wings-implementation-audit.md) for
remaining mechanisms and draft Flourishing Notes timing limits.

### Global Wings support

The Global Buffs Wings selector uses permanent expected bonuses for other paths:
Support assumes Harmony Song T6. Ally Cloudshear contributes 2% to each
applicable channel's damage-scale pool and 2% healing; Yellow weights Tailwind's 3%
attribute attack bonus by 13.5/20 and Radiant Drum's 12% Physical/all-attribute
attack bonus by 6.5/20. Blue uses 9.5/20 and 10.5/20 respectively. Full uses
Cloudshear and Radiant Drum at full coverage. These weighted effects do not
activate local Tailwind/Radiant Drum states or grant Wings talent bonuses.

For the locked Wings weapon pair, None and Yellow add no effects. Blue overrides
local Radiant Drum applications to 10.5 seconds; Full uses 20.5 seconds. Both
disable Dawnsun's extra four-second extension and its fallback application.
The existing global effect-definition modifiers express the duration overrides,
and persistent support markers select them. Comparisons rebuild the timeline
because changing this selector changes Wings buff expiry events.

### Breaking Point cooldown indicator

Breaking Point's T6 dodge proc applies the visible `BreakingPointCooldown`
marker (BP CD) for its existing 15-second triggered-skill cooldown. The marker
has no stat effects and does not gate ordinary Disintegration stacks or Vitality
recovery. Only an accepted proc applies it; blocked dodges cannot extend it.
The triggered skill remains the authority for cooldown eligibility.

### Forgetfulness cooldown

Forgetfulness's application has no internal cooldown. Grave Frost consumes the
active Forgetfulness at cast start and applies the six-second Forgetfulness
Cooldown (忘機調息) only when that cast used Forgetfulness. Snowbreak Spring at
Frost-Clad Night T6 removes this cooldown buff on an Exhausted target, then
checks the live buff state before granting Forgetfulness. Other targets cannot
receive a new grant while the cooldown buff is active. An unused Forgetfulness
expiring does not start cooldown. The CN preview uses the same rules.

### Refreshed export decisions (2026-10-15)

Hawkwing uses 1.8% Physical and Bellstrike Attack per tracked stack, matching normal buff 107031. Adaptive Steel unlocks its 3% Bellstrike damage stat at T5, not T4. Seasonal Edge T0 lasts ten seconds; T1 remains twelve. By explicit user decision, retain the existing T6 one/two/three-effect probabilities and unconditional Winter exclusion despite the export’s different wording. See [datamine-balance-audit.md](datamine-balance-audit.md) for other pending differences.

Bursting Nine’s second volley retains its 50% strength while using the same 30% then 20% repeated-arrow decay as the first volley. The seven-hit variants retain the first seven arrows of each volley, totaling 230% of the first arrow per volley before the second-volley multiplier. They share the original timing, resource costs, and cooldown group; the two-shot variant lands fourteen arrows in total. Rank-14 Phalanxbane Blade and Mortal Rope Dart use the existing no-flat-attack coefficient exception at 0.725%, scoped to their own martial-art tags. Anxi Soldier variants owned by Snowparting Blade do not inherit Phalanxbane’s talent.

The attack-food key `SimmeringFishSlices` is retained for saved selections and now represents Clay Oven Flatbread (缸爐燒餅). It replaces the previous food rather than adding a second option. Older benchmark notes naming Simmering Fish Slices describe their original setup.

## Set bonus equipment tiers

Weapon, armor, and bow/ring set base-stat bonuses follow the selected
breakthrough's Solo Level: 17 selects equipment-tier 96 values and 18 selects
equipment-tier 100 values.
Set base-stat values use the same `bySoloLevel` tables and shared
`effectForSoloLevel` resolver as Inner Ways. Tables use actual Solo Level
indices 17 and 18 for the corresponding equipment-tier values. The resolver
handles both `rawStat` and `stat` before character and worker calculations;
four-piece triggers, conditions, and conditional damage/healing bonuses are
preserved. Missing table entries throw rather than reusing another level.
Values come from normal item-set two-piece curves in
`local/datamine/wwm-item-sets.json`. Starweave and Tiltrim lack exported
curves and use the shared minimum Physical Attack curve matching their
existing 77.8 bonus (90.6 at tier 100); Brimflow likewise uses the shared
Physical Defense curve (39 to 45.4).

## Enhancement and Arsenal Solo Level progression

`data/system.json` stores cumulative Enhancement totals as one authored effect;
`data/arsenal.json` stores attack in each Arsenal’s channel plus its HP bonus.
Both use the shared `bySoloLevel` tables and `effectForSoloLevel` resolver before
the character sheet and worker bundle consume them. Values are the normal
variant from `local/datamine/wwm-solo-levels.json`, including the exported HP
that was missing from Arsenal and understated in the old Enhancement slot list.
The supported Solo Levels are 17 and 18; no interpolation or fallback is used.

Tier-100 Wings and Kite presets use All Mystic on helmet and chest,
replacing their previous Silkbind/Bamboocut or Power rolls. Kite Max moves
helmet Critical to the left weapon in place of Power before replacing that
helmet Power with All Mystic, preserving its Max Physical rolls. Tier 96 stays
unchanged. These tier-100 choices supersede the earlier fixed attack-roll
counts for Wings Double Min.

Tier-100 Fully Relayed Umbra uses Momentum on greaves and Max Void Attack
on the left weapon; tier-100 left-weapon attribute rolls must use Void. Among legal replacements of its additional Momentum
rolls with Affinity or Max Bellstrike, including optional helmet/chest All
Mystic replacements, the highest 38-Blood-Burst preset DPS uses seven
Momentum, three Affinity, one Max Void Attack, and no All Mystic additional
rolls. Comparison uses breakthrough 18, Clay Oven Flatbread, Fire, no script,
default global buffs, and the preset ping; other affixes and setup stay fixed.

### Kite skill cooldowns and DH finisher

Normal skill-export cooldowns are authored on the castable records:
Heavenwill Declared (Q1) 15 seconds, Celestial Mandate (Q2) 2 seconds,
All Under Justice 6 seconds, Sky Grasped 18 seconds, and Snaring Lash
15 seconds. Q1 owns the main gauntlet Q cooldown; Q2's short follow-up
cooldown is independent, so Q1 does not block its continuation.
Snaring Lash and its Cancel variant share the `SnaringLash` cooldown group.
Ordinary light/heavy attacks and Wicked Defiance have zero exported cooldown;
Vile Condemned End retains its existing resettable 18-second effect marker.

The DH preset dodges the 41.5-second attack and uses Soaring Spin's first hit
to trigger the authored Qi break, matching the BP preset. Dragon Head follows
Soaring directly, then the third four-HW End. Both hit during Exhausted with
five Disintegration stacks on BP builds. Q1/Q2, A5/A6, and the legal
Snaring Lash / Deflect / Sky Grasped sequence follow that End.

The preset intentionally does not reset End again during Exhausted. Its final
ordinary Vile Condemned falls back to the two-HW hit while End cooldown remains
active. The four charged casts spend 4 / 4 / 4 / 2 HW. At 40ms ping, the Qi
break is at 41.894697 seconds, Dragon Head hits at 47.862429 seconds, and the
third End hits at 51.639929 seconds, before Exhausted expires at 51.894697.
The final weak hit lands at 59.940429 seconds; the 60-second cutoff leaves
little timing margin. Dragon Head already had five stacks in the old preset.

Both Kite BP presets use Soaring's own dodge window for the 17.5, 29.5, and
41.5-second attacks, without a preceding Perfect Dodge. A 0.45331818181819-second
Delay before the first Soaring preserves the attack alignment formerly supplied
by Perfect Dodge's automatic wait. Soaring starts at 17.1, 29.1, and 41.1 seconds.
The DH preset retains its accepted damage totals; the non-DH BP builds gain a
new, valid BP proc at 41.5 seconds that the old non-DH sequence lacked.

### Kite combo stage indicators

Heavenwill uses separate hidden `HeavenwillLightCombo` and
`HeavenwillHeavyCombo` next-stage indicators. Like Wind's markers, applications
replace the count at cast start and do not restrict skill selection. These
indicators track stage only: expiry, input windows, and interruption admission
are not modeled here. They must not be used as proof that a delayed follow-up
is legal. Existing attack timings and A4's separate fast-A5 marker are unchanged.

The normal skill export's six-stage Righteous Reign sequence advances A1–A5
to A2–A6; its description and explicit action shortcut loop A6 back to A2,
including the Cancel variant. Virtuous Enthroned's source stages
20901006/7/8/9 map to the persisted H1/H2/H3 IDs and the added H4 ID:
H1/H2 select A3, H3/H4 select A5, H1–H3 select the next heavy, and H4 clears
the heavy indicator. Existing persisted heavy IDs retain their meaning.

All Under Justice selects A5 unconditionally. Soaring High T1 enables the
Wicked Defiance and Celestial Mandate A5 shortcuts, confirmed by Inner Way
601 tier-one text and buff 10260120. The selecting Q2 action is 20901102;
the normal tooltip's reference to 20901101 is not an additional Q1 shortcut.
Shortcut selection does not apply A4's animation marker, so A5 retains its
ordinary timing unless that separate marker is already present.

### Wind combo windows

Ordinary Infernal light attacks track the next stage in hidden `InfernalLightCombo`:
A1 sets 2 for 0.794s, A2 sets 3 for 0.797s, A3 sets 4 for 1.059s, and A4 clears it.
Blade of Heaven's Wrath uses separate hidden `InfernalFlamelashCombo`: FA1 sets 2
for 0.571s, FA2 sets 3 for 0.750s, FA3 sets 4 for 1.000s, FA4 sets 5 for 1.100s,
and FA5 clears it. Each cast replaces the previous count at cast start, including
Cancel, Rodent, and Combo variants. These markers do not restrict skill selection.
Dodge does not clear them; expiry remains relative to the attack's start.

`[Combo]` variants end at the window's opening: A1/A2/A3 at
0.230/0.230/0.260s and FA1/FA2/FA3/FA4 at 0.186/0.260/0.217/0.260s.
Only actions at or before that boundary survive; later blade hits and their
Hellfire gains are omitted. The two FA4 / Perfect Dodge / FA5 connections in
the Wind preset use FA4 Combo. Retry, restart, and utility dodge sequences keep
their existing Rodent variants. No FA5 Combo exists because FA5 ends the chain.

The Wind preset uses 30ms ping. FA5 Rodent / Dodge / FA5 is not a valid
continuation and its Rodent-only entry is removed. Only the last attack before dodge may use Combo; preceding attacks must complete.
The late sequence removes the FA2 before Bladebound Thread Cancel and uses full
FA1 / FA2 / FA3 / FA4 Combo after the Rampage refresh. The pre-Flamelash Cancel variants and 0.066s delay preserve the 80-Hellfire
refill and the 41.475s dodge at 30ms ping. At millisecond precision, 0.065s
refills only to 74.5. A 40ms trial could not satisfy both constraints: its
minimum delay for 80 Hellfire was 0.132s, which ended FA4 Combo at 41.521333s
and missed the incoming attack. The preset therefore retains 30ms.

Ordinary Infernal A1–A4 can cancel into Flamelash after their final hit. Their
Cancel variants retain every hit, Hellfire gain, and combo-state action, with
cast times 0.339/0.343/0.419/0.167s respectively. The Wind preset uses these
variants whenever an ordinary light attack is immediately followed by Flamelash.

The opening Flamelash window fits full FA1 / FA2 before FA3 Rodent and the
first Perfect Dodge at 5.475s; the dodge is followed by the selected FA1 restart.

### Wind no-dodge dummy rotation

`wind-dummy-1-min-iv-no-dodge` is the separate **Dummy 1 Min IV No Dodge**
preset: non-attacking Dummy, infinite Vitality, 30ms ping, and a 60-second
battle cutoff. It retains the charged Rampage preparation and RD Q damage
battle-start anchor. Ghostly Step - Umbra cancels the first A4; World to Sword
cancels the first FA5. Subsequent completed FA5 casts use Addled Mind while
Flamelash remains active, or Deflect at the depletion transition.

Light attacks use full A1–A4 or FA1–FA5 sequences until Flamelash depletion
or an RD refresh interrupts them. RD Q / Deflect / RD Special refresh together
after Rampage expires, at the next completed-attack boundary; short waits let
the outgoing Rampage expire instead of refreshing it early. Every light attack
launches its coordinated Rodent, and FA5 keeps its two final-hit Echoes Rodents.
No dodge, Rodent-only light variant, or Combo shortcut is authored.
Flute is used outside Flamelash. New Flamelash casts start at 80 Hellfire;
a 0.021s wait after one A1 Cancel lets an already-launched Rodent complete
that refill. The shared authored Qi markers are retained, with the break
attached to the second Flamelash window’s first FA1.

Before the third Rampage activation, full FA3 follows FA2: its first hit launches
the coordinated Rodent before the outgoing Rampage expires, while the rest of
the cast finishes across expiry. RD Q / Deflect / RD Special follow that full
FA3 without the previous expiry wait. Rampage need not cover later blade hits
of a stage once its coordinated Rodent has launched; FA5 still needs Rampage
through the final hit for the two additional Echoes Rodents.

The preset ends its authored skill sequence on the final in-battle FA4.
The post-battle RD Q / Deflect / RD Special refresh and its expiry wait are
omitted; the fixed Battle End event still closes the measurement at 60 seconds.

### Might and Wings encounter alignment

Might's first Defense hold includes the 0.1 seconds saved by Leaping Toad's
user-confirmed cancel so it still covers the intended dummy attack pair. Wings'
fixed Qi thresholds retain proportional depletion around the second Drum
Special break and its recovery; changes to that break's time require recomputing
both cycles of fixed thresholds.

### Golden Body precombat shield

Golden Body [Cancel] waits 0.5 seconds for Shield before its cancel follow-up and
applies the shared Shield effect 0.5 seconds after cast start. Its upgraded
shield lasts ten seconds (eight base plus two from Defense Boost), extended to
twelve seconds with four-piece Formbend, with the
exported twenty-second cooldown. The delayed application survives cast completion
through the existing timed-action mechanism. This entry models shield presence
for Rain Whisper; shield absorption, defensive bonuses, healing on expiry, and
Vitality cost are not modeled yet.

Jade's 30-second IV preset uses Fan Q / Golden Body [Cancel] before the opening
Umbrella Q. Its second UF cancels directly into Fan Q to retain Jadebreak. Battle start remains that Q's first damage action,
so the extra precombat Deflect does not shift the in-combat dodge or Qi clocks.

Overlapping defensive response windows award success only to the most recently
started active response. One incoming attack cannot award both a canceled dodge
and the following Soaring Spin. Avoidance remains active for the whole window,
but ordinary dodge rewards occur at most once per response; paired incoming hits
do not fall back to an older overlapping window after the newest one succeeds.
Offensive skill windows never grant rewards without an incoming attack. Explicit
Perfect Dodge / successful-deflect rows retain their existing no-attack fallback.

Perfect Dodge now uses the same weapon-dependent recovery as ordinary Dodge:
0.4s for Spear, Sword, Umbrella, Rope Dart, Heng Blade and Gauntlets; 0.5s for
Fan; 0.7s for Mo Blade; 0.3s for grounded Dual Blades. This changes recovery,
not Perfect Dodge's existing response/fallback policy. Its cancel variant still
has zero recovery and derives its response duration from Perfect Dodge.
Ordinary Dodge separately limits its defensive window to 0.2s (0.25s for
Gauntlets) and requires an incoming attack to award success.

For the modeled grounded Dual Blades route, Dodge and Perfect Dodge set
`attackResponse.successRecovery` to 0.1s. A successful response replaces the
still-active dodge's recovery end with success time plus 0.1s, without a cap at
the original recovery. It can shorten or extend the cast, but does not change
the defensive window or duplicate rewards. An already-canceled dodge does not
rewind a subsequent action. Wind uses ordinary Dodge and retains its seven
selected successful responses at 5.5/11.5/17.5/23.5/29.5/41.5/47.5s.

Gauntlets' separate response animation is deliberately deferred. The reported
response recovery is approximately 0.4167s from accepted response start (about
0.5667s after dodge start for an immediate response to a 0.15s success). Its
acceptance and overlap with existing timing are not modeled; adding it may
double-count recovery. At the user's request, retain the current Gauntlet
timing while Kite's rotation checks continue to pass.

Both Kite BP presets use ordinary Dodge for their two explicit defensive steps;
Soaring Spin handles the other three selected attacks. Mixed Strength omits the
redundant Perfect Dodge Cancel before Soaring Spin, which handles the 11.5s
attack itself. Saved custom rotations retain their original skill selections.

### Jade one-minute rotation continuity

At 40ms ping, Grounded fits seven UF activations, Hybrid six and Flying
three. Grounded uses two single-Q partial refills and Hybrid uses one.
The Qi break lands on UF four for Grounded and Hybrid and UF two for Flying.

### Jade source-review boundaries

UF projectiles and both Forsaken Fame variants use the existing damage-action
`damageScale` for their separate NPC target corrections, respectively 1.15 and
1.45. These multiply the complete physical and attribute hit, including flat
bonuses, rather than adding to Category 1. All supported encounter targets are
PvE NPCs. A future player-target mode must gate these corrections by target type.

Forsaken Fame carries `JadebreakProjectile`, qualifying for Jadebreak without
qualifying for Combo's distinct `Ballistic` filter. Jadebreak grants 30% for
projectiles and another 10% for projectile or pursuit hits against bosses.
The user confirmed source condition `[12,3]` as the boss condition and confirmed
that it passes on all supported targets, including practice dummies. Consequently
both branches apply to eligible hits in the current encounter model. The 40%
remains an additive Category 1 bonus, separate from the NPC target multiplier.

The 2026-11-02 datamine review (external repository,
`reports/jade-combat-audit-review.html`) establishes replacement tiers for
Combo and ordinary Star Reacher. Their base rules are excluded when the
upgraded tier is selected; shared effect-definition arrays remain additive.
Star Reacher has separate target-Airborne and Lingering Bone states; airborne
states suppress Lingering Bone grants until expiry. Player flight or distance
does not imply an Airborne target. The existing one-second grant cooldown and
damage-listener dispatch remain model assumptions pending consumer validation.

UF selects additional shots against the volley-start target state using existing
`resolveAt: "skillStart"` requirements: grounded Bone at +0.15 seconds, or
airborne at +0.1/+0.2 seconds. These are nominal request offsets; the alternative
+0.083-second middle-shot route is not selected without its source discriminator.
Each damage event independently refunds Blossoms during exhaustion. The existing
volley-start Bone refresh and drain selection remain unchanged pending evidence.

Blossom Barrage T4 includes Spring Away and UF projectiles; only the exhausted
Combo extension has the 0.5-second cooldown. Target effects represent the local
player's marks in the current single-player PvE model (the source active-space
restriction); multiplayer ownership and arbitrary space selection are not modeled.
Umbrella Q capacity is one without Barrage, two at T0–T5, three at T6.

The generated Jade combat audit is a historical pre-correction report at its
recorded commit, not a live view of these definitions. Golden Body shield survival,
projectile contact clocks, and dodge policies retain the qualifications in the
external review.

The Jade 30-second IV opener cancels Flute with Deflect before Ghostly Step;
Ghostly Step is not a legal Flute cancel. Battle start remains the first Umbrella
Q hit. The opening Fan Q precedes Golden Body. The second UF uses Deflect
as its cancel follow-up, then Fan Q refreshes Jadebreak before expiry.
A second Golden Body precedes the late Smolder, covering Smolder, the two-hit
Poet chain, and Dragon Head's impact.
Golden Body [Cancel] takes 0.5 seconds, ending when Shield attaches. Once that
wait completes, any next skill is allowed; it does not require a Deflect, Fan Q,
or pursuit cancel follow-up. The late Poet filler uses two hits to retain
the final Fan Q dodge and fit the shielded Dragon Head hit before 30 seconds.
Shield survival against incoming damage remains a model assumption.

After the middle five-hit Poet cancel and Deflect, a one-hit Poet fills the
space before ordinary Dodge. At the preset's 40ms ping, Dodge begins around
17.49s and still catches the 17.5s attack, granting Mystery DMG Boost for the
following Umbrella Q. The extra hit preserves all four perfect dodges and the
late Dragon Head impact before the 30-second cutoff.

The 30-second IV preset uses Forsaken Fame [Cancel] / Serene Breeze / Soaring
Spin. Breeze is a legal non-Umbrella follow-up and its 0.4375-second cast
replaces almost all of FF's 0.44-second recovery. Soaring starts at 5.396541s
at 40ms ping, preserving the 5.5s perfect dodge; Phoenix and Fan Q also retain
their 11.5s and 23.5s dodges.
Its 76-hit UF result uses the temporarily restored per-projectile Blossom cost.

### Grounded Jade refill and exhaustion sequence

Vernal Umbrella's frequent-projectile armor attunement has one canonical key,
`vernalProjectile280304Boost`, named "Vernal Umbrella - Frequent Projectile DMG Boost".
Official IDs 280304 and 280305 both import into that key. The retired
`vernalProjectile280305Boost` key migrates in saved gear, attunement sheets,
overrides, and character profiles; old and new totals are added when both exist.
This removes the duplicate choice from attunement stats and priority charts
without dropping stored bonuses.

Colorful Phoenix [35 Blossoms] ends at the user-confirmed 0.63-second cancel,
retaining its first two damage hits and all resource grants through that time.
The name describes the refill requirement: the accepted four-Blossom pulses
actually grant 36 before the cap. It omits the third hit and its resource grant
at 0.7442s. The existing two-hit variant still ends at 0.53s and grants 32.

Grounded opens with Fan Q [Miss]. Fan Q grants Jadebreak and Windrider while its charge recovers normally. The first Umbrella Q hit starts the clock. The opener uses Q / Heavy / two-hit Colorful Phoenix / Q. Light VC grants 28 Blossoms by its second impact at 0.4442s and 32 after the 0.53s pulse. The second Q fills Blossoms to 100 and benefits from Mistwillow on builds using the set. Toad enables the three-hit pursuit
in the first UF window and full Fan Q enables the five-hit pursuit in the
second. Flute cancel follows Forsaken Fame in the third UF window. Q / Heavy / Phoenix refills the fourth UF, which breaks Qi at 28.331s. Saving the Q charge lets the final Umbrella Q start as soon as UF mode ends and input latency clears. Fan Q,
two-hit Smolder, and five-hit Poet / Deflect follow during exhaustion. Smolder starts sober, so Poet can follow its second impact directly.
Every UF cancel has an immediate Deflect. Single-Q refills start the fifth
and seventh UFs at about 60 Blossoms. Poet's fifth hit refunds 4 Vitality. An extra Forsaken Fame cancel / Deflect after the seventh UF fills the time before the final two-hit Soaring Spin on the passive dummy.

Forsaken Fame [Cancel] ends at its 1.19-second damage hit, retaining Lingering
Bone and the 10-Endurance grant at that same timestamp. It saves 0.44 seconds
over the full cast. Its immediate follow-up must be Deflect or another skill
that is neither Forsaken Fame (including its cancel variant) nor an Umbrella
skill. As with the other cancel variants, this is an authored-sequence contract
checked for presets; the editor does not enforce follow-up selection.

### Jade one-minute filler review (2026-11-05)

On Fully Relayed Max BP at BT19, Hybrid's fourth UF breaks Qi at 39.09s.
On Fully Relayed Max TB, Flying starts its channels at 0.38s, 23.61s and
48.02s. All three complete the full hold. The second UF breaks Qi at 35.57s.

### Jade low-Qi filler review (2026-11-06)

Flying sets distance to 9m before the opening Flute, Fan Q and Umbrella Q.
Both Peak casts cancel directly into three-hit pursuit. Removing Golden Body
from the exhausted filler window advances the third full channel and UF.
A short automatic wait for UF expiry remains before the third Umbrella Q.
All three channels retain their full ten-second hold.

Hybrid uses FF cancel / Deflect pairs during UF three, with its final FF
refresh moved after Umbrella Q and before the second charged-light refill.
This preserves Lingering Bone through the fourth UF. Removing Serene Breeze
and shortening the full FF casts advances the fourth and subsequent UFs.
Fan Q cancel leads directly into pursuit during exhaustion.
A final FF cancel into Fan Q refreshes Jadebreak through the cutoff.
Pursuit follows that Fan Q at 59.319s; its first two hits land within 60 seconds.

Both presets retain their second/fourth UF exhaust triggers. The 60%, 40%
and 30% Qi events use the existing linear decline convention with the new
break timing. These sequences were selected by comparing legal filler and
cancel variants with finite Vitality, full intended Blossom refills, and
normal production damage calculations.

### Draught audit follow-up

The 7 November source review is tracked in [draught-audit-followup.md](draught-audit-followup.md).
All current target profiles, including both dummy profiles, count as bosses for
Draught's exhausted-target proc, as confirmed by the user. The existing generic
Dummy selection is preserved. `DraughtExhaustedTrigger` represents source tag
1125 on Peakfall and Castlink contacts; it is independent of Inebriate-enhanced
eligibility. Successful Deflect responses grant 5 Binge through a separate
one-second talent-trigger cooldown without a Carouse condition. Plain authored
Deflect casts have no success reward. Quick Drink's unmarked-gain semantics and
Drunkslay's Eonpour-refresh lifecycle remain provisional.
