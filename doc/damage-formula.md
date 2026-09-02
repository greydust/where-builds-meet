# Damage Formula Specification

This document describes the formula currently implemented by the rotation simulator. Unless stated otherwise, percentage values are stored internally as decimal ratios: `0.11` means `11%`. The UI converts between ratios and percentage points.

Enemy defense, level, path resistances, Judgement Resistance, and level-derived
character bonuses come from the selected entry in `data/breakthrough.json`.
Breakthroughs 16 and 17 currently share a Level 96 enemy with 408 defense, zero
base resistance, and 65% Judgement Resistance. Breakthrough 16 grants 15.3%
Precision and 138 of each base attribute; Breakthrough 17 grants 16.5% Precision
and 150 of each base attribute.

## Stat resolution

The simulation input starts from zero, then the calculator applies innate character stats, the selected breakthrough's level bonuses, Enhancement bonuses, character talent stats, regional Oddity rewards, attribute conversions, equipped gear, selected Inner Ways, martial-art talents, the active build's arsenal, bow/ring set, weapon set, and armor set (with any Main-tab overrides), food, and the selected Divinecraft through these stages. Set options may also contribute named timeline conditions; these use the common requirement pipeline for non-stat mechanics such as Formbend extending Shield and Breakthrough:

1. Add fixed `stat` values.
2. Resolve `stat` formulas whose source is another base stat.
3. Calculate effective attack ranges and rates.
4. Resolve `stat` formulas whose source is a derived stat.
5. Add `effectiveStat` values and calculate the final derived stats.

Fixed effects are applied before formulas, regardless of JSON order. Internal floating-point results are normalized to nine decimal places.

A manually edited Main-tab stat is stored as a final-value override. The calculator solves the base-stat offset that makes the shared pipeline produce that exact value under the current baseline inputs. Changing the active build, Inner Ways, food, or another baseline input causes the offset to be solved again, so the modified final value remains fixed. The solved base is also used for comparison variants; adding or removing a tested effect therefore still changes the stat and contributes to the reported DPS delta.

### Effective attack ranges

For physical, Bellstrike, Stonesplit, Silkbind, and Bamboocut attack:

```text
Effective Minimum = Minimum
Effective Maximum = max(Minimum, Maximum)
```

Void/Formless Attack is folded into the equipped path's primary attribute after
that attribute's first minimum/maximum normalization:

```text
Normalized Primary Maximum = max(Min Primary, Max Primary)
Effective Min Primary = Min Primary + Min Void/Formless
Effective Max Primary = max(
  Effective Min Primary,
  Normalized Primary Maximum + Max Void/Formless
)
```

Snowparting Blade, Phalanxbane Blade, Thundercry Blade, and Stormbreaker Spear
use Stonesplit as their primary attribute. Nameless Sword, Nameless Spear,
Strategic Sword, and HeavenQuaker Spear use Bellstrike. Vernal Umbrella, Inkwell
Fan, Panacea Fan, and Soulshade Umbrella use Silkbind. Everspring Umbrella,
Unfettered Rope Dart, Heavenwill Gauntlets, Skygrasp Rope Dart, Infernal
Twinblades, and Mortal Rope Dart use Bamboocut. The primary attribute receives
the action's attribute bonus, the 1.5 path multiplier, and Formless Penetration.
Void/Formless Attack is therefore Stonesplit for Strength and Might, Bellstrike
for Splendor and Umbra, Silkbind for Jade and Deluge, and Bamboocut for Dust,
Kite, and Wind.

## Damage outcomes

Every damage action is evaluated as four possible outcomes and then rate weighted:

| Outcome  | Physical attack   | Attribute attack  | Outcome bonus      |
| -------- | ----------------- | ----------------- | ------------------ |
| Abrasion | effective minimum | effective minimum | none               |
| Normal   | effective average | effective average | none               |
| Critical | effective average | effective average | Critical DMG Bonus |
| Affinity | effective maximum | effective maximum | Affinity DMG Bonus |

The effective average is `(effective minimum + effective maximum) / 2`.

Before evaluating those outcomes, the calculator resolves the damage entry's
hit-time effects and matching attunements once into a numeric snapshot. That
snapshot contains shared bonuses plus the attack bonus, penetration, and
resistance adjustment for Physical, Bellstrike, Stonesplit, Silkbind, and
Bamboocut. Physical and attribute components and all four outcome variants read
the same snapshot; they do not rescan active effects. Separate damage entries
still resolve independently because their hit-time buffs, debuffs, resources,
HP/Qi state, tags, or subaction modifiers may differ.

Tracked buffs and debuffs move unconditional finite numeric damage fields into
a timeline aggregate when the effect is applied, changes stack, is consumed, or
expires. Each damage entry reads that aggregate directly instead of scanning
those rules again. A rule stays on the normal per-hit path when it has a
requirement, a dynamic value, metadata, an unsupported field, or definition
content that can be modified. Mixed definitions are split rule by rule, so an
unconditional attack bonus can use the aggregate while a conditional
penetration rule from the same stack tier is still evaluated on hit.

Setup and Inner Way rules whose complete requirements depend only on skill tags,
the skill's martial-art tag, or the equipped martial-art pair are resolved once
per distinct effective action-tag signature. Their finite numeric damage fields
are cached in the same aggregate shape used by tracked effects. Static non-damage
fields remain in a cached residual effect list. Rules that inspect buffs,
debuffs, stacks, resources, HP, Qi, distance, cooldowns, or other hit-time state
remain on the per-hit path. This preserves state changes between hits and the
different component tags of multi-action skills while avoiding repeated static
tag checks and numeric aggregation.

Calculation-time attack-value bonuses multiply the resolved minimum and maximum
of their named attack type before the attack roll is selected. They do not
multiply an action's flat physical or attribute bonus. Etherwrath uses separate
`physicalAttackBonus`, `bellstrikeAttackBonus`, `stonesplitAttackBonus`,
`silkbindAttackBonus`, and `bamboocutAttackBonus` effects so each damage channel
receives the same per-stack increase without changing displayed character
stats. Effect-supplied penetration is likewise resolved independently for all
five damage channels.

Hawkwing is an outcome-triggered attack bonus. Deterministic calculations carry
an exact probability distribution keyed by stack count and absolute expiry time,
quantized to integer 0.1 ms ticks. Every hit reads the expected stack count before
damage, applies `2% × expected stacks` as Physical Attack Bonus, and then branches
the distribution using that hit's resolved Affinity rate. Identical stack/expiry
states are merged. Simulation runs instead use the sampled outcome: an Affinity
hit adds and refreshes one concrete stack, while other outcomes leave the concrete
state unchanged.

Insightful Strike uses a separate outcome tracker with the same integer 0.1 ms
clock. Focus is stored as decay units rather than a floating-point resource:
one Focus equals 40,000 units, and one unit expires per tick, which is exactly a
decay rate of `0.25` Focus per second. Every Affinity outcome adds 40,000 units.
Reaching 160,000 units applies or refreshes Concentration for 10 seconds and
resets Focus to zero. The conversion happens after the triggering hit, so that
hit does not receive Concentration's 10% Affinity DMG Bonus. Deterministic
calculation carries the exact probability distribution keyed by Focus units and
Concentration expiry; simulations update one concrete state from sampled
outcomes.
Insightful Strike T3 makes the Affinity probability itself depend on whether
Concentration is active. Deterministic calculation therefore resolves each hit
once for the inactive branch and once for the active branch, weights their
damage and outcome rates by the exact pre-hit Concentration probability, and
uses each branch's own Affinity rate for the next Focus transition. Simulation
runs use only their concrete active or inactive state. This avoids feeding an
average Direct Affinity value back into the Focus distribution.

Seasonal Edge uses deterministic proc times and random branch contents. A
Conversion skill finishing outside its shared cooldown creates an 8- or
12-second window according to Inner Way tier. Multi-buff tiers draw without
replacement: each later draw renormalizes the weights of the remaining buffs,
and ordered draws that produce the same set are merged. Expected calculations
evaluate each unique effect set through the ordinary damage pipeline and
combine them with its exact probability. Identical no-effect sets share one
calculation. Simulation runs sample one set per proc window and reuse that
result for every hit in the window, rather than rerolling per action.

### Vitality deficit adjustment

The timeline records initial, consumed, regenerated, and final values for each
numeric resource. Vitality may finish below zero. When it does, directly and
indirectly triggered damage carrying the `Mystic` tag is multiplied by:

```text
Mystic Vitality Scale = clamp((Total Vitality Consumed + Final Vitality) / Total Vitality Consumed, 0, 1)
```

This is equivalent to available Vitality divided by consumed Vitality. For
example, consuming 300 Vitality and ending at -100 retains `200 / 300`, or
two-thirds, of Mystic damage. Non-Mystic damage and healing are unchanged.
Infinite Vitality disables the adjustment. Seasonal Edge resolves each possible
Yield-regeneration branch independently, applies the deficit scale to that
branch, and then probability-weights the resulting scales. It does not apply
the nonlinear deficit clamp to an averaged ending Vitality, because a
resource-surplus branch must not erase the damage loss from a resource-deficit
branch.

The adjustment is deliberately an aggregate result correction. Timeline
actions, per-action damage, skill and cast breakdowns, and editor resource
values remain unscaled so they continue to describe the authored rotation.

### Per-action stat conversion

An active effect may convert one named numeric calculation stat into another:

```json
{
  "convert": {
    "from": "finalAffinity",
    "to": "directCrit",
    "ratio": 1,
    "max": 0.12
  }
}
```

The calculator reads both names from the current per-action stat snapshot. It
removes `min(max(source, 0), max)` from the source and adds that amount times
`ratio` to the target, subject to the target stat's own cap. Only the amount
that fits under the target cap is removed; the rest remains in the source.
Missing or non-numeric names make the conversion inert. Multiple conversions
run in data order and therefore read the result of the previous conversion.
`max` caps the source amount consumed, while Direct Critical Rate has a global
target cap of `0.2` (20%). Converted rate fields are passed through the ordinary
outcome-rate formula and its existing caps. The same conversions then run on
the derived `abrasionRate`, `normalRate`, `critRate`, and `affinityRate`
snapshot. This lets a data effect convert one finished outcome probability into
another without adding a mechanic-specific damage branch; conversions whose
named fields are absent from either snapshot are inert in that stage.

### Monte Carlo outcome and attack sampling

The deterministic calculator and Monte Carlo simulator share the same
per-action damage implementation. The calculator's `average` attack-roll mode
uses the effective average shown above. The simulator uses a `simulate` mode:

1. Generate one uniform random value in `[0, 1]` for the hit and select
   abrasion, normal, critical, or affinity from the cumulative outcome rates.
2. Abrasion still uses effective minimum attacks and affinity still uses
   effective maximum attacks.
3. For normal or critical damage, independently sample each physical and
   attribute attack from its inclusive effective minimum/maximum range before
   applying the same penetration, bonus, and outcome multipliers.

Every simulated run uses the deterministic timeline, start anchor, and duration
for the active rotation snapshot. Its outcome percentages are hit-count shares,
not damage shares. Runs are sorted by DPS; Best, P99, P95, P90, P75, and Median select
the nearest actual run at each percentile rather than interpolating damage from
two runs. Session-configured custom percentile rows use the same selection rule.

## Per-outcome damage

For an action with physical coefficient `C`, physical bonus `Bp`, attribute bonus `Ba`, and outcome-specific attacks `P` and `Ai`:

```text
Adjusted Enemy Defense = Enemy Defense × (1 + sum(active defenseBonus))
Base Physical = C × (P − Adjusted Enemy Defense) + Bp
Base Attribute i = C × Ai + (Ba when i is the primary path, otherwise 0)
```

`defenseBonus` is a signed percentage adjustment. A negative value lowers
enemy defense; for example, `-0.06` changes 408 defense to 383.52. Values from
multiple active effects add before adjusting defense.

Physical damage is clamped to zero after multiplication. Bellstrike, Stonesplit, Silkbind, and Bamboocut are calculated independently and are not reduced by physical defense.

```text
Physical = max(0,
  Base Physical
  × Physical Penetration Multiplier
  × (1 + Physical DMG Bonus)
  × Shared Multiplier
  × Outcome Multiplier
)

Attribute i =
  Base Attribute i
  × Attribute i Penetration Multiplier
  × (1 + Attribute i DMG Bonus)
  × Path Multiplier
  × Shared Multiplier
  × Outcome Multiplier
```

The action's `attrBonus` is added only to the primary path. The same action `phyCoef` is used by physical damage and all four attribute paths.

## Healing

Healing actions share the hit-time stat and effect snapshot used by damage
actions, but resolve only Physical and Silkbind components. Enemy defense,
resistance, other attribute attacks, damage bonuses, abrasion, and affinity do
not affect healing.

```text
Average Physical Attack = (Effective Min Physical + Effective Max Physical) / 2
Average Silkbind Attack = (Effective Min Silkbind + Effective Max Silkbind) / 2

Physical Healing =
  (Average Physical Attack × Physical Coefficient + Physical Bonus)
  × (1 + Physical Penetration / 200)

Silkbind Healing =
  (Average Silkbind Attack × Physical Coefficient + Attribute Bonus)
  × (1 + Silkbind Penetration / 200)
  × (1 + Silkbind Healing Bonus)
```

Calculation-time Physical and Silkbind Attack Bonus effects multiply their
respective average attack before the coefficient. Matching healing attunements
contribute General Healing Bonus: Martial Art Skill requires the owning martial
art, Special Skill additionally requires `Special`, and Panacea Fan Healing
Skill requires `Heavy`. Physical
Penetration combines its Weapon attunement value with matching calculation-time
effects. Silkbind Penetration combines its resolved character-stat value with
matching calculation-time effects. Formless Penetration converts to the equipped
path's primary attribute before healing is resolved, so it contributes to
Silkbind Healing when Silkbind is the primary attribute.

Healing has only Normal and Critical outcomes:

```text
Healing Critical Rate =
  clamp((Effective Critical Rate + Direct Critical Rate) × Effective Precision, 0, 1)

Expected Critical Multiplier =
  1 + Healing Critical Rate × (0.5 + Critical Healing Bonus)

Final Healing =
  (Physical Healing + Silkbind Healing)
  × Expected Critical Multiplier
  × (1 + Healing Bonus Category)
```

The base Critical Healing Bonus is 50%. Critical Healing Bonus effects add to
that bonus. The Healing Bonus Category adds General Healing Bonus, All Martial
Arts for actions tagged `MartialArts`, and the matching weapon Art bonus (for
example, Art of Fan or Art of Umbrella), then multiplies the expected combined heal.
Healing totals use the same fight duration as damage, producing HPS alongside
DPS. A skill marked `group: true` reports `Final Healing × Group Size`, where
Group Size is 1, 5, or 10. Per-skill healing breakdowns report the average
Normal and Critical outcome rates across that skill's healing actions; abrasion
and affinity are always absent.

At the heal timestamp, one per-recipient healing copy first restores missing
Self HP up to Max HP; the remainder is self overhealing. Other recipients of a
group heal are assumed full. World to Sword counts one-fifth of each teammate's
healing as overhealing:

```text
WTS Action Overhealing =
  Self Overhealing + Per-Recipient Healing × (Group Size - 1) / 5
```

For a single-target `player` heal, the self copy uses Self Overhealing and each
teammate copy contributes its full Per-Recipient Healing. Morning Drizzle uses
this single-target rule; its independently timed copies do not use the group-heal
one-fifth multiplier.

World to Sword snapshots its conversion threshold when cast:

```text
Qi Blade Threshold =
  12 × Average Physical Attack + 18 × Average Silkbind Attack
```

Expected calculations apply the one-threshold cap after combining self and
teammate overhealing, so additional recipients do not create independently
capped contributions. They launch one Qi Blade per accumulated threshold,
subject to the 0.3-second launch cooldown. Simulation uses the rolled heal and
clears stored overhealing after a launch. Overhealing continues to accumulate
while the launch is on cooldown.

### Shared multiplier

```text
Shared Multiplier =
  (1 + Base DMG Bonus)
  × (1 + DMG Bonus Category 1)
  × (1 + matching Attunement DMG Bonus)
```

`baseDMGBonus` applies to physical damage and all four attributes. It is a separate multiplier from Category 1.

Category 1 currently contains:

- `vsBossDmg` (the current encounter is treated as a boss)
- `allMartialArts` for skills tagged `MartialArts`
- Art of Mo Blade for `MoBlade`, or Art of Heng Blade for `HengBlade`
- Single-Target Mystic Skill DMG Boost for `SingleTargetMystic`, or Area Mystic Skill DMG Boost for `AreaMystic`
- active `dmgBonus` effects
- active `hpDMGBonus` effects whose requirements pass

Art of Resistance T3 contributes 5% `dmgBonus` while the shared player Shield
is active. At T6 its cumulative contribution is 10%. A Shield Broken event
removes Shield and conditionally applies Hardened Foe at T6; Hardened Foe
contributes 10% `dmgBonus` for 12 seconds. Casting Predator's Shield consumes
Hardened Foe before applying and extending a fresh Shield.

Flute supplies `dmgBonus` from the damage action's distance snapshot: 2%, 3%,
4%, 5%, 8%, 11%, 14%, 17%, and 20% at 1m through 9m respectively. Distances
beyond 9m retain the 20% value. A Move event changes distance for subsequent
timeline actions; the initial distance is 1m.

Dragon Head - Tide receives an always-active conditional `dmgBonus` rule from
its `global: true` definition in `data/buff/mystic.json`. At each hit it
resolves:

```text
Missing HP percentage points = (1 - current HP ratio) × 100
Dragon Head DMG Bonus = Missing HP percentage points × 0.0045
```

A Self HP event changes absolute current HP for its target action and all
subsequent actions. The timeline initializes it from the calculated Max HP stat;
Take Damage events subtract an absolute amount. Damage effects continue to read
the derived percentage at hit time.

Dynamic stat and effective-stat values may use `function: "segment"` with
`param1: "maxHp"`. Its explicit inclusive thresholds are stored in `param2`
and corresponding results in `param3`; values beyond the final threshold use
the final result. Thundercry Blade uses this for its Charged/Varied Combo Max
Physical Attack and Effective Critical Rate talents. The
talents carry skill-tag requirements, so the worker applies them only to their
matching damage actions rather than adding them to the displayed global stats.

Numeric damage-effect values may also use the data-defined `segment` function.
When `param1` is `distance`, the action's distance snapshot is compared against
the inclusive upper bounds in `param2`; the matching value comes from the same
index in `param3`, and values above every bound use its extra final entry.

The selected Divinecraft contributes its `hpDMGBonus` through this category.
Divinecraft `qiDMGBonus` and healing-triggered Vitality gain are retained in
`data/divinecraft.json` as future-facing data, but neither mechanic is currently
evaluated by the simulator.

Script requirements are evaluated from each damage action's target HP and Qi
snapshot. When a rotation declares target Max HP, target-HP requirements are
reevaluated after every preceding hit. `critDmgBonus` and `affinityDmgBonus`
extend their matching outcome bonuses. Convergence's `attributeDMGBonus` is
added to damage-bonus Category 1 for every attribute channel only; it does not
modify an individual Bellstrike, Stonesplit, Silkbind, or Bamboocut stat.

Attunement definitions in `data/attunement.json` provide the target stat and
required skill-match tags. Armor definitions target `attunementDMGBonus`;
matching values are summed and applied through the standalone
`1 + matching Attunement DMG Bonus` multiplier above. Charged, varied-combo,
and martial-art boosts apply only when all configured tags are present on the
skill. Physical and Formless Penetration target their corresponding penetration
channels and have no skill-match restriction.

The shared result is then multiplied by a channel-specific global multiplier:

```text
Physical, Stonesplit, Silkbind, Bamboocut Global Multiplier =
  1 + globalDmgBonus + globalHPDMGBonus

Bellstrike Global Multiplier =
  1 + globalDmgBonus + globalHPDMGBonus + globalBellstrikeDMGBonus
```

All effects in this global category add together before forming the multiplier.
`Exhausted` supplies `globalDmgBonus: 0.1`. Qi Imbalance conditionally supplies
`globalHPDMGBonus: 0.08` for every HP-damage channel and an additional
`globalBellstrikeDMGBonus: 0.08` for Bellstrike only. The character stat
`bellstrikeDmgBonus` remains in the earlier attribute-specific multiplier, so it
multiplies with the Bellstrike global multiplier rather than adding to it.

Damage rows generated by a DOT definition also receive a standalone multiplier:

```text
DOT Multiplier = 1 + sum(active dotDamage effects)
```

`dotDamage` values add together within this category and then multiply physical
and every attribute component of the DOT. They do not affect ordinary damage
actions, even when the casting skill applies or extends a DOT. Soul-Shaken uses
this field for its general DOT vulnerability and its additional Umbra-source
vulnerability.

DMG Bonus Category 2 is reserved for effects such as Mortal Rope Dart Vendetta Token, but it is not implemented in the calculator yet.

### Outcome multiplier

```text
Abrasion or Normal = 1
Critical = 1 + Effective Critical DMG Bonus + active critDmgBonus effects
Affinity = 1 + Affinity DMG Bonus
```

Critical and affinity bonuses multiply physical and every attribute component.
Rain Whisper four-piece contributes 10% `critDmgBonus` as an unconditional
compute-time effect, so it does not alter the displayed character Critical DMG
stat. It adds a separate 15% `critDmgBonus` to damage actions whose hit-time
state contains the player Shield.

### Path multiplier

```text
Primary path = 1.5
Other paths = 1.0
```

## Penetration and resistance

Active `physicalResistance` effects add flat values to the enemy's Physical
Resistance before the Physical Penetration Multiplier is evaluated. Negative
values therefore reduce resistance. Attribute resistance fields use the same
signed, flat adjustment for their corresponding channel.

When penetration is greater than or equal to resistance:

```text
Penetration Multiplier = 1 + (Penetration − Resistance) / 200
```

When penetration is lower than resistance:

```text
Penetration Multiplier = 1 + (Penetration − Resistance) / 100
```

Physical penetration consists of the character's Physical Penetration stat, matching attunement Physical Penetration,
and active `physicalPenetration` effects.

Each attribute starts with its corresponding character penetration stat. Stonesplit additionally receives active `stonesplitPenetration` effects. Formless Penetration is added to the primary attribute.

Effects may adjust resistance directly with `bellstrikeResistance`, `stonesplitResistance`, `silkbindResistance`, or `bamboocutResistance`. These values are added to enemy resistance. For example, Fearful Blade contributes `-16` to each attribute resistance.

The Main tab can treat Phantom Chime, Qi Imbalance, Soul-Shaken, Vulnerable,
Fearful Blade, Bitter Seasons, and Floating Grace as externally maintained
global effects. An enabled choice initializes one permanent tracked buff or
debuff on the timeline; stacking debuffs start at maximum stacks. If the
rotation applies the same effect, it updates that tracked entry rather than
adding a second copy, and the global entry remains permanent. Floating Grace's
Mixed choice uses the base 10% `dmgBonus` definition, while Deluge uses its 24%
definition. Requirements still resolve per damage action: Qi Imbalance requires
Exhausted, and path-specific additions require the matching martial-art tag.
These controls and their DPS comparisons use the same worker calculation as the
baseline.

## Rate calculation

For Judgement Resistance `J`:

```text
Effective Precision = min(1, (Precision − J) / (1 + J) + J)
Effective Critical  = min(0.8, Critical / (1 + J) + Effective Critical Bonus)
Effective Affinity  = min(0.4, Affinity / (1 + J))
Final Affinity = clamp(Effective Affinity + Direct Affinity, 0, 1)
```

Effective Critical Bonus is added after Judgement Resistance and shares the
80% Effective Critical cap. Direct Critical is a separate final-rate channel
and is not part of Effective Critical or its cap. When
`Final Affinity + Direct Critical + Effective Critical <= 1`:

```text
Final Critical = (Effective Critical + Direct Critical) × Effective Precision
```

Otherwise:

```text
Final Critical = (1 − Final Affinity) × Effective Precision
```

The resulting Final Critical is clamped to `[0, 1]`. Final Critical and Final
Affinity therefore cannot exceed 100% or fall below 0%.

The outcome distribution is:

```text
Affinity Rate = Final Affinity
Critical Rate = Final Critical
Abrasion Rate = (1 − Effective Precision) × (1 − Final Affinity)
Normal Rate   = max(0, 1 − Abrasion Rate − Affinity Rate − Critical Rate)
```

`SteadfastGuaranteedCrit` is a skill-specific rate override and only applies to skills tagged `BurningHeart` or `AnxiSoldier`:

- If the normal Final Critical is at least 75%, Critical Rate becomes 100% and every other outcome rate becomes zero.
- Otherwise, 15% Direct Critical is added and the rates are recalculated.

The associated 10% Critical DMG effects are represented separately as `critDmgBonus: 0.1` in effect data; they are not part of the rate function.

## Expected action damage

For every physical or attribute component:

```text
Expected Component =
    Abrasion Damage × Abrasion Rate
  + Normal Damage × Normal Rate
  + Critical Damage × Critical Rate
  + Affinity Damage × Affinity Rate
```

The action total is the sum of expected Physical, Bellstrike, Stonesplit, Silkbind, and Bamboocut damage. Rotation total damage is the sum of damage actions at or after the selected start anchor and before the ordered Battle End event, including triggered skills and DOT ticks. An action outside those bounds remains in the timeline but is omitted from damage, hit count, and outcome-rate aggregation. Manual events resolve before skills and damage actions at the same timestamp, so a hit timestamped exactly at Battle End does not count. Actions at the starting timestamp still use timeline order to omit earlier actions in the starting skill. DPS is total damage divided by the time from the selected start anchor to Battle End, or to the final timeline action when Battle End is absent.

## Damage-over-time exception

DOT damage ignores the action's flat Physical Bonus and Attribute Bonus. Its coefficient, attacks, penetration, path bonus, active effects, and outcome rates are otherwise calculated normally.

## Replayed damage

A `replay` action does not enter the normal damage formula. Its source is the
final resolved damage of the damage event that triggered its `Replayed` skill:

```text
Replay Damage = Source Event Final Damage × replay.coef
```

No attack roll, defense, resistance, penetration, damage bonus, Critical,
Affinity, Abrasion, or other outcome is evaluated again. Replay damage is
reported in the physical/total breakdown channel, cannot emit another damage
event, and is excluded from simulation outcome-rate hit counts. The average
calculator and Monte Carlo simulator use the same source-link resolution, so a
simulation replay copies that run's randomized source hit.

## Stat-priority conversion

Level-keyed max-roll values are stored in `data/stat.json` under `affix` and `attunement`. Stat and attunement priority select the entry matching the selected breakthrough profile's enemy level, add one max roll, and recalculate DPS. Gear editing uses the same entry matching the gear item's level. The base-attribute conversion rules are stored under `baseAttributes` in `data/system.json` and apply to character talents, gear, manual comparison deltas, and every other source:

```text
1 Power    = 0.22 Min Physical Attack + 1.36 Max Physical Attack
1 Agility  = 0.9 Min Physical Attack + 0.00076 Critical Rate
1 Momentum = 0.9 Max Physical Attack + 0.00038 Affinity Rate
```

The defensive base-attribute relationships are:

```text
1 Body    = 60 HP
1 Defense = 17 HP + 0.57 Physical Defense
```

Inner Way priority is calculated by removing each selected Inner Way and measuring the resulting DPS loss. Every current Inner Way declares `altersTimeline: true`, so these removals conservatively rebuild the timeline. Setup comparisons replace the selected setup option with the candidate and omit the already-active choice. Weapon and armor set comparisons rebuild when any changed tier belongs to a definition with `altersTimeline: true`, including a timeline-changing set removed by the replacement. A Rain Whisper-only change reuses the baseline timeline, but replacing Cleftpeak with Rain Whisper rebuilds it. Script comparisons use the same two-sided rule: they rebuild when either the selected baseline Script or the candidate has `altersTimeline: true`. Revelry carries that flag because Take Damage can apply its buff; comparisons between the other damage-only Scripts reuse the baseline timeline.
