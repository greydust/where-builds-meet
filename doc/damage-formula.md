# Damage Formula Specification

This document describes the formula currently implemented by the rotation simulator. Unless stated otherwise, percentage values are stored internally as decimal ratios: `0.11` means `11%`. The UI converts between ratios and percentage points.

Enemy defense, level, path resistances, Judgement Resistance, and level-derived
character bonuses come from the selected entry in `data/breakthrough.json`.
Breakthrough 17 uses 408 enemy defense, zero base resistance, 65% Judgement
Resistance, 16.5% level Precision, and 150 of each base attribute. Breakthrough
18 uses 446 enemy defense, zero base resistance, 85% Judgement Resistance,
17.8% level Precision, and 164 of each base attribute. Enemy level remains 96
for both profiles; it is not imported from the Solo Level datamine.
Breakthrough 17 selects martial-art talent rank 13 and breakthrough 18 selects
rank 14 through `martialArtTalentRank`.
Each equipped martial art contributes only its `talent[rank]` effects; ranks are
not cumulative. Infernal Twinblades' rank-13 conversions use the interpreted
datamine rates: 0.264 Min Physical Attack per Agility (capped at 73.92), and
0.0672 Bamboocut Penetration per raw Min Bamboocut Attack (capped at 22).
Its Flamelash status enables 5% Critical DMG Bonus plus up to another 25%,
scaling from raw Min Physical Attack and capped at 750. Its attribute-damage
talent is already included in the primary-path multiplier described below.

Infernal Twinblades Light Attacks, including Blade of Heaven's Wrath, also
receive a persistent `hpDMGBonus: 0.1` in the PvE model. Both skill descriptions
in `local/datamine/wwm-skills-normal-all.json` specify 10% more HP damage against
non-player units. The setup rule is included only with Infernal Twinblades
equipped in either slot. It requires both the `InfernalTwinblades`
martial-art tag and `Light`; it does not require Flamelash or Samsara and does
not affect Rodent hits or other martial arts. This adds to the existing
HP/damage bonus bucket rather than multiplying final damage separately.
It is a skill property, not a rank-dependent talent or a manually applied buff.

Mortal Rope Dart rank 13 grants `0.000304 × Agility` Critical Rate (capped at
8.512%), 98 Min and 196 Max raw Bamboocut Attack, and
`0.000336 × raw Min Bamboocut Attack` Bamboocut DMG Bonus (capped at 11%).
Actions tagged `Rodent` gain a fixed 9% plus up to another 12% Physical and
Bamboocut DMG Bonus, scaling at `0.00016 × raw Min Physical Attack` to the cap
at 750. This uses the existing additive channel bonuses and raw-stat stages.
Its Attr. Attack DMG UP also uses the shared primary-path multiplier.
Rodent uses the user-confirmed nonmatching-target route for PvE. Physical and
attribute coefficients are both 0.348974526316, with zero flat bonuses. This is
skill 20391's base coefficient 0.581624210526316 multiplied by the route's 0.6;
0.6 itself is not the final coefficient. Ordinary coordinated and automatic
triggers require distance below 12. The matching PvP routes (0.366423252632
below 5 and 0.3315258 from 5 to below 12) are not used by the PvE simulator.
Export distances use raw game units, whose correspondence with the editor's
metres remains unverified. Rodent Rampage launches it once per
Infernal/Mortal light-attack stage and once per two stages of other martial arts.
Enhanced Rodent Rampage retains these coordinated launches and adds one automatic
Rodent hit per second, starting one second after application: launches occur at
+0.5, +1.5, ... and each Rodent lands 0.5 seconds after launch. Coordinated
Rodents also land 0.5 seconds after their triggers. Its 10/15/20-second
lifetime includes the final automatic hit at expiry. These hits use the same
damage coefficients, Vendetta Token bonuses, Rodent Hunt recording, and
Samsara Hellfire gains as coordinated Rodents.
Echoes T6 adds two more launches on FA5's first hit while the buff and Flamelash
are active. Expected and sampled calculations use the same definite trigger
schedule; individual damage outcomes remain mode-dependent.

Combat inclusion and the DPS/HPS duration follow the
[rotation event-loop endpoint](rotation-event-loop.md). Explicit Battle End
excludes damage at its timestamp. Otherwise the last ordered cast or explicit
Delay ends combat, including same-time final actions but dropping later damage,
healing, DOT ticks, and replays. Generated damage never extends the duration.

Damage and healing resolve once as their events execute in the single combat
traversal. HP feedback, recorded damage, and replay coefficients consume those
resolved values immediately. Reporting retains the results; buff-attribution
counterfactual formulas do not execute combat events or change live state.

Expected probability models share a tiny-state timing policy, defined in
`probabilityStateMerging.ts`: states with individual probability strictly below
`1e-5` merge when each timing field lies in the same absolute 0.1-second bucket.
There is no equal-Focus, equal-stack, owner, cadence, or decay-lifetime condition.
Every numeric state field becomes its probability-weighted mean. Timing fields
are rounded to the 0.1 ms clock; Focus and stacks retain fractional weighted
values. Probability mass is summed, never discarded. Singleton and significant
states retain their original values. The same bucket rule applies to zero or
elapsed timers; there is no additional active-timer test.
This applies to Hawkwing, outcome-dependent resource cooldowns,
and [DOT expiry tracking](rotation-event-loop.md#tiny-expected-state-merging).
Damage-source identities remain a probability-weighted mixture within the merged
state, rather than selecting one source or blocking the merge. Pending-tick
fractions and application-relative cadence times are weighted as well. Fractional
debuff stacks resolve between neighboring authored stack-effect tables through
the ordinary expected-damage pipeline. Temporary causal branches finish their
linked follow-ups before they enter the retained state distribution.
Seasonal Edge's rare Yield histories weight each window's activation and use
those weighted windows for subsequent Vitality recovery. Its categorical buff
choices continue to be represented by their effect-set probability mixtures.
Timing and its interaction with later hits are approximate; simulation retains
exact sampled timing.

## Rank-14 Additional Attack

Rank 14 grants 106 minimum and 212 maximum raw attribute attack. Existing
conversion rates retain their slopes, with base-attribute thresholds raised to
300 (79.2 Physical Attack, 9.12% Critical Rate, or 4.56% Affinity Rate caps).
Attribute penetration caps rise to 23.6 and damage/healing bonus caps to 11.8%.
Existing deferred higher-of-Body-or-Power conversions remain deferred.

Additional Attack scales the matching martial art's flat physical and attribute
bonus attack terms by `1 + flatAttackBonus` (1.0725 at rank 14), before channel
and outcome multipliers. It does not scale attack stats or final damage.
The normal Strategic Sword, Heavenwill, and Skystrike talents additionally
scale both coefficients by `1 + coefficientBonusWithoutFlatAttack` (1.00725),
only when both action flat terms are zero. Effects and triggered actions use
the same martial-art tag requirement; unrelated arts and Mystics do not match.
Expected and sampled damage share this resolution, including static aggregates.

## Stat resolution

Rank 13 uses the interpreted conversion rates, including
`0.264` Physical Attack per base-attribute point (cap `73.92`), `0.000304`
Critical Rate (cap `0.08512`), and `0.000152` Affinity Rate (cap `0.04256`).
Attribute talents add 98 minimum and 196 maximum raw attack. Penetration scales
at `0.0672` from minimum attack or `0.0336` from maximum attack, capped at 22;
attribute damage/healing scales at `0.000336` from minimum or `0.000168` from
maximum, capped at 11%. Displayed source thresholds such as 328 and 655 are
rounded descriptions; the exact conversion rates determine the calculation.
The higher-of-Body-or-Power conversions remain deferred rather than using Power
alone. See the [rank-13 audit](martial-art-talent-audit.md) for conditional
effects, existing shared behavior, and all unresolved talent portions.

The simulation input starts from zero, then the calculator applies innate character stats, the selected breakthrough's level bonuses, Enhancement bonuses, the selected Solo Level's cumulative character talent stats, regional Oddity totals eligible for the selected breakthrough (Qingzhou from breakthrough 18), attribute conversions, equipped gear, selected Inner Ways, martial-art talents, the active build's arsenal, bow/ring set, weapon set, and armor set (with any Main-tab overrides), food, and the selected Divinecraft through these stages. Set options may also contribute named timeline conditions; these use the common requirement pipeline for non-stat mechanics such as Formbend extending Shield and Breakthrough:

Inner Way stat tables resolve using the selected breakthrough's `soloLevel`,
independently of `martialArtTalentRank`, before these stages. A table contributes
only its selected level; fixed bonuses remain constant. For example, Eonpour
T2 contributes 74.4 Min Physical Attack at Solo Level 16 and 77.9 at Solo Level 17.
The resolved bonuses therefore feed both raw-sourced talents and worker comparisons.

1. Build `rawStats` from explicit `rawStat` permanent contributions, including
   flat martial-art min/max attribute bonuses, and five-attribute conversions.
2. Build `stats`: remaining martial-art talent formulas read immutable `rawStats`; add
   ordinary talent bonuses change ordinary fields; food and other `effectiveStat`
   bonuses change only effective ranges and rates on this same object.
3. Build `buffedStats` with selected global buff/debuff stat contributions.
4. Build cached `skillStats` for each effective action-tag signature.
5. Copy that baseline into `actionStats`, add the current combat contribution,
   and derive final values before damage or healing.

See [Stat snapshot pipeline](stat-pipeline.md) for stage ownership, lifecycle
aggregation, conditional effects, overrides, and comparison variants.

Fixed effects are applied before formulas, regardless of JSON order. Internal floating-point results are normalized to nine decimal places.

A manually edited Main-tab stat is stored as a final-value override. The calculator solves the base-stat offset that makes the shared pipeline produce that exact value under the current baseline inputs. Changing the active build, Inner Ways, food, or another baseline input causes the offset to be solved again, so the modified final value remains fixed. The solved base is also used for comparison variants; adding or removing a tested effect therefore still changes the stat and contributes to the reported DPS delta.

Physical DMG Reduction is retained as a raw character-sheet ratio. Explicit
Take Damage events already specify resolved HP loss; they do not apply this
stat, Physical Defense, or Physical Resistance again. A manually authored
zero-damage Take Damage event still dispatches defensive responses and the
Take Damage lifecycle; a positive attack reduced to zero by avoidance is not
treated as damage taken.

Formless Penetration from raw character stats adds to matching attunement
penetration on the equipped primary attribute only. Its displayed Attunement
Stats total includes the character bonus, while the attunement calculation
input excludes that bonus to prevent double counting.

### Effective attack ranges

For physical, Bellstrike, Stonesplit, Silkbind, and Bamboocut attack:

```text
Effective Minimum = Minimum + Summed Effective Minimum Bonuses
Effective Maximum = max(Effective Minimum, Maximum + Summed Effective Maximum Bonuses)
```

All effective contributions are resolved before this check and leave ordinary
stats unchanged. Food's `+120 / +240` on ordinary physical attack `2000 / 1900`
produces effective attack `2120 / 2140`. Additive effective inputs are retained
on each stat snapshot so subsequent stages recompute from the unnormalized inputs.

Void/Formless Attack is folded into the equipped path's primary attribute after
that attribute's first minimum/maximum normalization:

```text
Min Primary = Ordinary Min Primary + Summed Effective Min Primary Bonuses
Max Primary = Ordinary Max Primary + Summed Effective Max Primary Bonuses
Min Void/Formless = Ordinary Min Void/Formless + Summed Effective Min Void/Formless Bonuses
Max Void/Formless = Ordinary Max Void/Formless + Summed Effective Max Void/Formless Bonuses
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
Twinblades, Mortal Rope Dart, Skystrike Gauntlets, and Riven Twinblades use
Bamboocut. The primary attribute receives
the action's attribute bonus, the 1.5 path multiplier, and Formless Penetration.
Void/Formless Attack is therefore Stonesplit for Strength and Might, Bellstrike
for Splendor and Umbra, Silkbind for Jade and Deluge, and Bamboocut for Dust,
Kite, Wind, and Draught.

## Damage outcomes

An action's `rateRoute` selects which of these outcomes it can roll. The
`normal` route, used when the field is absent, keeps all four. The `healing`
route drops abrasion and affinity, leaving only Normal and Critical. The
`divinecraft` route drops all three, leaving only Normal. Because the restricted
routes are single-outcome, their damage is the same in expected and sampled
calculations.

An action's `averageAttack` field pins the attack to the average of its effective
range. Expected damage already uses that average for Normal and Critical, so the
field only changes sampled calculations, where it replaces the uniform roll
inside the range. Every `heal` action and every Divinecraft damage action sets it.

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

Repeated damage entries reuse the ordered list of attunement definitions matching
their effective tags. Only matching is cached: each hit reads the current values
and repeats the original arithmetic, including starting Formless Penetration
from that hit's character stats. No contribution is regrouped or reordered.

Tracked buffs and debuffs move unconditional finite numeric damage fields into
a timeline aggregate when the effect is applied, changes stack, is consumed, or
expires. Each damage entry reads that aggregate directly instead of scanning
those rules again. A rule stays on the normal per-hit path when it has a
requirement, a dynamic value, metadata, an unsupported field, or definition
content that can be modified. Mixed definitions are split rule by rule, so an
unconditional attack bonus can use the aggregate while a conditional
penetration rule from the same stack tier is still evaluated on hit.

The worker receives the complete character-sheet snapshot, including food's
effective-only additive inputs in `effectiveStatBonuses`. Ordinary character-sheet
stats exclude those bonuses. Selected global buffs/debuffs produce
`buffedStats`. Already-applied sheet and global stat contributions are excluded
from later additions, so neither disappears nor applies twice on a later pass.
Numeric combat-stat contributions use the tracked-effect lifecycle aggregate;
the action resolver derives values from the immutable skill baseline, not the
previous action's capped result.

Setup and Inner Way rules whose complete requirements depend only on skill tags,
the skill's martial-art tag, or the equipped martial-art pair are resolved once
per distinct effective action-tag signature. Their stat fields produce a cached
skill-static stat and derived-stat snapshot, and their finite numeric damage
fields use the same aggregate shape as tracked effects. Static residual fields
remain in a compact cached effect list. Rules that inspect buffs,
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
a probability distribution keyed by stack count and absolute expiry time,
quantized to integer 0.1 ms ticks. Every hit reads the expected stack count before
damage, applies `2% × expected stacks` as Physical Attack Bonus, and then branches
the distribution using that hit's resolved Affinity rate. Identical stack/expiry
states are merged, and compatible tiny expiries use the shared weighted timing rule.
Simulation runs instead use the sampled outcome: an Affinity
hit adds and refreshes one concrete stack, while other outcomes leave the concrete
state unchanged.

Insightful Strike uses a separate outcome tracker with the same integer 0.1 ms
clock. Focus is stored as decay units rather than a floating-point resource:
one Focus equals 20,000 units. Each eligible direct Affinity hit adds one Focus
(1.5 at Tier 4+) and restarts a three-second decay delay. After the delay,
one unit expires per tick, exactly 0.5 Focus per second; other outcomes
do not restart the delay. Reaching 100,000 units (five Focus) applies or
refreshes Concentration for 10 seconds and resets Focus to zero.
The conversion happens after the triggering hit, so that hit does not receive
Concentration's 10% Affinity DMG Bonus. Deterministic calculation carries the
probability distribution in an inactive array and an active min-heap ordered by
Concentration expiry; simulations update one concrete state from sampled outcomes.
Before damage, expired active states move to the inactive array and the active
probability total is updated. Focus decay is deferred until the next eligible hit.
Each hit splits states using their category's Affinity chance. Resulting branches
with individual probability strictly below `1e-5` merge into one aggregate per
category, without a timing-bucket restriction. Focus and both deadlines are
probability-weighted; deadlines round to the shared clock. Significant branches retain their values. Exactly identical states are
consolidated using numeric keys after tiny-state aggregation. This deliberately favors speed over preserving rare timing
histories; probability mass is retained. Expected
Focus may therefore contain fractional decay units. Once a decay deadline has passed, it normalizes to zero
because the last processed tick carries ongoing decay; zero Focus also clears
its irrelevant deadline.
Insightful Strike T3 makes the Affinity probability itself depend on whether
Concentration is active. Deterministic calculation therefore resolves each hit
once for the inactive branch and once for the active branch, weights their
damage and outcome rates by the tracked pre-hit Concentration probability, and
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

The adjustment is deliberately an aggregate result correction. Main-page total
damage and DPS use the corrected value. Rotation Editor total damage and DPS,
timeline actions, per-action damage, skill and cast breakdowns, and editor
resource values remain unscaled so they continue to describe the authored
rotation.

### Per-action stat conversion

An active effect may convert one named numeric calculation stat into another:

```json
{ "convert": { "from": "finalAffinity", "to": "directCrit", "ratio": 1, "max": 0.12 } }
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
for the active rotation snapshot. Its four outcome percentages are shares of the
run's total damage, not of its hit count, so the four always total 100%. Replay
damage resolves no outcome and is credited to normal. Mystic damage is
accumulated in per-outcome buckets, so the Vitality deficit adjustment scales
each share and the denominator together. Healing outcome percentages remain
heal-count shares. Runs are sorted by DPS; Best, P99, P95, P90, P75, and Median select
the nearest actual run at each percentile rather than interpolating damage from
two runs. Session-configured custom percentile rows use the same selection rule.

## Per-outcome damage

For an action with physical coefficient `Cp` (`phyCoef`), attribute coefficient `Ca` (`attrCoef`), physical bonus `Bp`, attribute bonus `Ba`, and outcome-specific attacks `P` and `Ai`:

```text
Adjusted Enemy Defense = Enemy Defense × (1 + sum(active defenseBonus))
Base Physical = Cp × (P − Adjusted Enemy Defense) + Bp
Base Attribute i = Ca × Ai + (Ba when i is the primary path, otherwise 0)
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

The action's `attrBonus` is added only to the primary path. Physical and attribute coefficients are independent; an omitted coefficient is zero. Existing actions explicitly retain equal coefficients. The primary attribute still receives its usual 1.5 path multiplier; other attributes receive 1.

### Periodic probability scaling

Echoes of Oblivion T4 deliberately excludes all probability-weighted damage
actions from its expected six-hit window, even when a row reaches probability
one. Their expected damage remains included in DPS. Only definite hit events
can reset Addled Mind in expected timelines; sampled simulation counts actual
successful proc hits. This keeps expected charge-reset timing independent of
chance estimates.

All DOTs deal their authored damage once per active tick, regardless of stack count.
Stacks can still determine effect transitions, including Weeping Blood's five-stack
consumption, but do not multiply tick damage. DOT tick rows resolve through the
ordinary per-outcome damage formula with no separate rules: the row's coefficients,
flat `phyBonus` and `attrBonus`, attacks, penetration, path multiplier, active
effects, and outcome rates are all calculated exactly as for a direct hit. For
expected chance DOTs the timeline
supplies `damageScale` equal to the probability of a tick. This multiplies every
damage channel after ordinary formula resolution; `hitProbability` carries the same
probability for hit counts and outcome triggers. A multi-stack tick is one hit.
The expected tracker factors cadence into weighted schedules inside each
stack/expiry state: a cadence of probability mass `p` at any positive stack count
contributes `p` to both tick damage scale and hit probability. This is an
exact representation change by default, with no probability truncation.
Weeping Blood opts into a battle-aligned expected tick grid: at seconds 1, 2,
and so on, its damage scale is the summed probability of branches eligible to
tick. Stack count does not multiply that value. This approximates DOT timing
and hit-time effects in expected calculations; simulations retain the exact
application-relative cadence. Stack, threshold, and expiration probabilities
remain unrounded.
An `onMaxStack` burst resolves as a separate ordinary damage action, weighted by
its trigger probability in expected calculations. Weeping Blood consumes at
five stacks, so it never produces a five-stack tick.
Fivefold Bleed T1 adds 100% Base DMG Bonus to Piercing Damage, and T2 adds
62.3 Max Physical Attack. T3's natural-expiration burst has expected weight
`P(DOT expires at this time) × 0.2`; it uses the same Piercing Damage formula
and T1 bonus as the five-stack burst, not the DOT damage multiplier.
Piercing Damage is Direct Damage and rolls the normal Weeping Blood chance.
At T6 only a five-stack consumption burst also guarantees one post-hit stack;
an expiration burst has only the independent Direct Damage chance.
These applications are conditional
on the branches that produced the burst: their probabilities must not be
multiplied by its hit weight again. Renewed expiration bursts continue to use
the 20% chance, within the fixed timeline cutoff described in `skill-data.md`.
Weeping Blood and Piercing Damage are attributed to the Fivefold Bleed damage
group, and Morale Chant to its own group. Group ownership does not change the
hit-time formula, proc probability, or rotation total; it removes these actions
from the damage credited to an individual cast.
Published grouped results may combine equivalent same-time damage contributions
after all event processing and metrics are complete. Their channel damage and hit
weights are additive; no combined hit is fed back into triggers or outcome-state
trackers. Exact event timelines remain authoritative for calculation and simulation.

## Divinecraft damage

| Divinecraft  | Divinecraft damage        |
| ------------ | ------------------------- |
| Fire         | Burn and Solid Foundation |
| Fire-Water   | Burn and Solid Foundation |
| Fire-Poison  | Burn and Solid Foundation |
| Poison-Fire  | Poison                    |
| Poison-Water | Poison                    |
| Water-Fire   | none                      |
| Water-Poison | none                      |
| None         | none                      |

`data/divinecraft.json` selects which of them each Divinecraft applies. Both DOTs
are one stack, refreshable, tick every second starting 0.5 seconds after
application, and use the `divinecraft` rate route with `averageAttack`, so each
tick is
`(average physical attack - enemy defense) x physical coefficient` at a single
fixed value in both expected and sampled calculations.

| DOT                 | Element | Duration | `phyCoef` |
| ------------------- | ------- | -------- | --------- |
| `DivinecraftFire`   | Fire    | 4s       | 0.26      |
| `DivinecraftPoison` | Poison  | 8s       | 0.16      |

Neither has an attribute coefficient or a flat bonus, so only the physical
component is produced.

Fire, Fire-Water, and Fire-Poison apply the burn and also build
`DivinecraftFireEmber`; Poison-Fire and Poison-Water apply the poison. A
Water-first pairing carries no Divinecraft damage: Water-Fire and Water-Poison
keep only their existing bonuses and healing trigger. Each application is a
`damage` event trigger that requires a non-`DOT` hit, so a Divinecraft DOT never
refreshes or sustains itself.

No target effect is applied before the fight-start anchor, so a prepull hit never
puts a Divinecraft DOT on the target. The Solid Foundation counter additionally
requires the fight to have started, so prepull hits do not count toward it.

`RotationRecord.divinecraftDamage` is a per-rotation checkbox in the rotation
editor, next to Ping. Unchecking it strips the `damage` event rules from the
selected effect, which is exactly the burn, the poison, and the Solid Foundation
counter, and leaves the HP DMG bonus and the healing trigger intact. Omitted
records mean damage applies, so rotations saved before the checkbox existed keep
their current numbers. Every setup comparison variant for a rotation inherits
that rotation's flag, so a comparison delta measures only the option that
varies.

The Fire Divinecrafts build `DivinecraftFireEmber`, a hidden five-stack counter
with the same direct-damage requirement. Reaching five stacks consumes the count
and triggers `DivinecraftSolidFoundationGrant`, which applies
`DivinecraftSolidFoundation`: a five-second buff with a ten-second re-application
cooldown. Its next qualifying direct hit triggers
`DivinecraftSolidFoundationStrike`, a direct hit with `phyCoef` 0.4 and the same
`divinecraft` route, which consumes the buff so it fires once.

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
  × (1 + Physical Healing Bonus)

Silkbind Healing =
  (Average Silkbind Attack × Silkbind Coefficient + Attribute Bonus)
  × (1 + Silkbind Penetration / 200)
  × (1 + Silkbind Healing Bonus)
```

Healing uses `phyCoef` for Physical and `silkbindCoef` for Silkbind, with omitted coefficients treated as zero. It does not use `attrCoef` or other attribute attacks. It always resolves at the average of each attack range, which its `averageAttack` field records.

Calculation-time Physical and Silkbind Attack Bonus effects multiply their
respective average attack before the coefficient. Matching healing attunements
contribute General Healing Bonus: Martial Art Skill requires the owning martial
art, Special Skill additionally requires `Special`, and Panacea Fan Healing
Skill requires `Heavy`. Physical
Penetration combines its Weapon attunement value with matching calculation-time
effects. Silkbind Penetration combines its resolved character-stat value with
matching calculation-time effects. Formless Penetration sums its raw character-stat and matching attunement
contributions once, then converts to the equipped
path's primary attribute before healing is resolved, so it contributes to
Silkbind Healing when Silkbind is the primary attribute.

Healing has only Normal and Critical outcomes, which is the `healing` rate route:

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

The base Critical Healing Bonus is the `0.5` character stat supplied by
`data/system.json`. Critical Healing Bonus effects add to that stat for their
matching actions. The Healing Bonus Category adds General Healing Bonus, All Martial
Arts for actions tagged `MartialArts`, and the matching weapon Art bonus (for
example, Art of Fan or Art of Umbrella), then multiplies the expected combined heal.
Healing totals use the same fight duration as damage, producing HPS alongside
DPS. A skill marked `group: true` reports `Final Healing × Group Size`, where
Group Size is 1, 5, or 10. Per-skill healing breakdowns report the average
Normal and Critical outcome rates across that skill's healing actions; abrasion
and affinity are always absent.
Simulation independently rolls each recipient's Normal or Critical result and
a uniform final-healing multiplier from `0.92` through `1.08`. This fluctuation
is applied after the outcome and healing-bonus multipliers. It does not affect
deterministic expected healing or the Rotation Editor. Group-heal outcome counts
are weighted by recipient count, and each DPS-ranked simulation record also
reports its sampled HPS and healing outcome percentages.

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

World to Sword snapshots fully buffed attack when its application action executes at cast time:

```text
Qi Blade Threshold =
  12 × Cast-Time Average Physical Attack + 18 × Cast-Time Average Silkbind Attack
```

The shared action-stat resolver includes food, effective attack ranges, Void-to-Silkbind
conversion, active flat attack bonuses, and Physical/Silkbind attack multipliers.
Hawkwing contributes its current Physical Attack bonus; Etherwrath contributes its
current attack bonuses. Healing bonuses, penetration, and damage bonuses do not enter
the threshold. Skill-specific effects are evaluated against WTS itself.
The value is frozen for that activation. Later buff applications, expirations, and
stack changes do not alter it; recasting captures a new value.
Expected calculations use expected Hawkwing stacks at the cast timestamp, an
approximation rather than an exact distribution of resulting Qi Blade counts.
Simulation uses that run's sampled stacks. Qi Blade damage continues to resolve
at each hit's own timestamp.

Every recipient's healing number enters the accumulator separately. Expected
calculations use that recipient's expected healing; simulations roll each
recipient independently. Reaching the threshold launches one Qi Blade and
resets accumulated overhealing to zero in both modes. If the 0.3-second launch
cooldown is active, further healing remains accumulated; the delayed cooldown
check launches the blade and resets the complete stored amount once ready.

### Shared multiplier

```text
Shared Multiplier =
  (1 + Base DMG Bonus)
  × (1 + DMG Bonus Category 1)
  × (1 + matching Attunement DMG Bonus)
```

`baseDMGBonus` applies to physical damage and all four attributes. It is a separate multiplier from Category 1.

Snowbreak Spring uses its unscaled level-100 baseline (2.07686 physical and
attribute coefficients, 575 physical flat damage, 313 attribute flat damage).
Its unconditional PvE `baseDMGBonus: 0.36` adds to Frost-Clad Night T4's
`baseDMGBonus: 0.4` while Inner Passion is active or, at T6, the target is
Exhausted. The resulting base multiplier is 1.36 normally and 1.76 when
enhanced; overlapping conditions grant the enhancement only once. This scales
coefficients and flat damage together, separately from HP damage bonuses.
T6's separate 10% damage bonus remains in Category 1.

Category 1 currently contains:

- `vsBossDmg` (the current encounter is treated as a boss)
- `allMartialArts` for skills tagged `MartialArts`
- Art of Mo Blade for `MoBlade`, or Art of Heng Blade for `HengBlade`
- Single-Target Mystic Skill DMG Boost for `SingleTargetMystic`, or Area Mystic Skill DMG Boost for `AreaMystic`
- active `dmgBonus` effects
- active `hpDMGBonus` effects whose requirements pass

Adaptive Steel grants its Heng Blade buff on a successful deflection while Heng
Blade is the current weapon. The buff lasts 5 seconds with a 20-second application
cooldown and adds 5% Category 1 damage to Heng Blade Light/Heavy Varied Combos.
Failed deflections and perfect dodges do not grant it. The existing shared
deflection-success action applies the buff; Inner Way comparisons rebuild the
timeline. Adaptive Steel retains its Might-only path eligibility. Other
weapon-mastery branches and T6 cross-weapon retention are outside this implementation.

Art of Resistance T3 contributes 5% `dmgBonus` while the shared player Shield
is active. At T6 its cumulative contribution is 10%. A Shield Broken event
removes Shield and conditionally applies Hardened Foe at T6; Hardened Foe
contributes 10% `dmgBonus` for 12 seconds. Casting Predator's Shield consumes
Hardened Foe before applying and extending a fresh Shield.

Flute supplies damage bonus from the damage action's distance snapshot: 1%, 2%, 3%,
4%, 5%, 8%, 11%, 14%, 17%, and 20% in the bands starting at 0m through 9m
respectively. Each lower bound is inclusive; the next bound is exclusive.
The 20% band ends at 20m, where the bonus becomes 0%. A Move event changes
distance for subsequent timeline actions; the initial distance remains 1m.

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
`param1: "maxHp"`. Its thresholds are stored in `param2`
and corresponding results in `param3`; values beyond the final threshold use
the final result. Thundercry Blade uses this for its Charged/Varied Combo Max
Physical Attack and Effective Critical Rate talents. The
talents carry skill-tag requirements, so the worker applies them only to their
matching damage actions rather than adding them to the displayed global stats.

Numeric damage-effect values may also use the data-defined `segment` function.
The optional `mode` selects `LowerBoundInclusive` (default, `<` upper-bound
comparison) or `UpperBoundInclusive` (`<=` upper-bound comparison). Existing
definitions retain their boundary behavior when the mode is omitted.
When `param1` is `distance`, the action's distance snapshot is compared against
the upper bounds in `param2` using the selected mode; the matching value comes from the same
index in `param3`, and values beyond every matching bound use its extra final entry. Damage-action
`phyCoef` and `attrCoef` use the same resolver and the action's distance snapshot,
including in sampled damage calculations.

The selected Divinecraft contributes its `hpDMGBonus` through this category and
healing-triggered Vitality gain through the shared heal event trigger. Divinecraft
`qiDMGBonus` is retained in `data/divinecraft.json` as future-facing data and is
not currently evaluated by the simulator.

Script requirements are evaluated from each damage action's target HP and Qi
snapshot. When a rotation declares target Max HP, target-HP requirements are
reevaluated after every preceding hit. `critDmgBonus` and `affinityDmgBonus`
extend their matching outcome bonuses. Convergence adds 15% to each of the four attribute-specific DMG Bonus stats when its Qi condition passes.

Attunement definitions in `data/attunement.json` provide the target stat and
required skill-match tags. Armor definitions target `attunementDMGBonus`;
matching values are summed and applied through the standalone
`1 + matching Attunement DMG Bonus` multiplier above. Charged, varied-combo,
and martial-art boosts require every `effect.tags` entry: strings match exactly,
and nested arrays match any one listed tag. Matching multiple alternatives
still applies each attunement once. Damage and healing share this matching rule.
Panacea/Soulshade Martial Art healing boosts require singular `MartialArt`,
which covers Fan Q/QQ (including cancels) and Umbrella Q only.
Physical and Formless Penetration target their corresponding penetration
channels and have no skill-match restriction.

The shared result is then multiplied by the Mechanism multiplier, a
channel-specific final multiplier that is separate from the shared multiplier and
from DMG Bonus Category 1. It models the source's independent DMG Bonus, whose
`calc_cause_change` cause 50 multiplies the whole resolved hit instead of
joining the additive Category 1 pool:

```text
Physical, Stonesplit, Silkbind, Bamboocut Mechanism Multiplier =
  1 + globalDmgBonus + globalHPDMGBonus

Bellstrike Mechanism Multiplier =
  1 + globalDmgBonus + globalHPDMGBonus + globalBellstrikeDMGBonus
```

All effects in this Mechanism category add together before forming the
multiplier. With Soulshade Umbrella's Buff Enhancement talent, active Floating
Grace adds another `dmgBonus: 0.05` only against an Exhausted target. This is
part of Floating Grace's damage bonus (including its Deluge variant), with no
separate buff or five-second timer.

`Exhausted` supplies `globalDmgBonus: 0.1`. Thunder Summoning supplies
`globalDmgBonus: 0.3` for 15 seconds, matching its source cause-50 value.
Qi Imbalance conditionally supplies
`globalHPDMGBonus: 0.08` for every HP-damage channel and an additional
`stat.bellstrikeDmgBonus: 0.08` for Bellstrike only. The latter adds in the earlier attribute-specific multiplier.

Damage rows generated by a DOT definition also receive a standalone multiplier:

```text
DOT Multiplier = 1 + sum(active dotDamage effects)
```

`dotDamage` values add together within this category and then multiply physical
and every attribute component of the DOT. They do not affect ordinary damage
actions, even when the casting skill applies or extends a DOT. Soul-Shaken uses
this field for its general DOT vulnerability and its additional Umbra-source
vulnerability.

Vendetta Token uses `dmgBonus: 0.5` for Rodent-tagged attacks, following the
confirmed general-damage behavior. Vendetta T6 adds `dmgBonus: 0.3` for those attacks
while the same caster-specific target debuff is active. These bonuses add together in the same existing
category: without other bonuses their multiplier is `1 + 0.5 + 0.3 = 1.8`.
Other attacks receive neither bonus. No Category 2 multiplier is introduced.

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
state contains the player Shield. The same conditions grant 10% and 15%
`criticalHealingBonus`; normal healing receives no bonus.

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

Penetration effect values may be a `segment` over `missingTargetHPPercentage`,
so they resolve per hit from the same target-HP snapshot the damage categories
use. Mistwing is the current case: its T0 base step is one Physical Penetration
per completed 20% of missing target HP (capped at four), and T6 replaces that step
with one per 10% instead of adding a second step. T3 adds a separate Physical
Penetration step of two per 10% (capped at eight) while a Martial Art Special
Enhancement is active, and T4 supplies six of every penetration type. These are
ordinary calculation-time effects: they read the action's target-HP snapshot,
apply to healing on the same channels, and are not character-sheet stats.

Effects may adjust resistance directly with `bellstrikeResistance`, `stonesplitResistance`, `silkbindResistance`, or `bamboocutResistance`. These values are added to enemy resistance. For example, Fearful Blade contributes `-16` to each attribute resistance.

Echoes of Oblivion applies `bamboocutResistance: -10` only to Infernal
Twinblades Light Attacks against Karma, at every tier. This flat adjustment
combines with other Bamboocut resistance adjustments in the existing channel;
it does not scale with enemy resistance. Sin separately supplies 10% Physical
Defense ignore for matching Light Attacks. Neither changes Judgment Resistance
or its precision, critical, and affinity rate formulas.

Strayhunt (Draught) adds 2% to Physical DMG Bonus and each of the four attribute DMG Bonuses. Its target debuff lasts 20 seconds, refreshes, and caps at one stack; the global control keeps one externally maintained copy active. These channel bonuses add to Swallowcall's conditional 6%, Convergence's conditional attribute 15%, Qi Imbalance's conditional Bellstrike 8%, and the matching channel talents of Mortal Rope Dart, Everspring Umbrella, Skygrasp Rope Dart, and Riven Twinblades. Their existing requirements and channel scopes still apply.

The Main tab can treat Strayhunt (Draught), Phantom Chime, Qi Imbalance, Soul-Shaken, Vulnerable,
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
80% Effective Critical cap. Flamelash contributes `0.1` and Ivorybloom's
full-HP four-piece effect contributes `0.05` through
`effectiveStat.effectiveCritBonus`. At `J = 0.65`, these are equivalent to
`0.165` and `0.0825` ordinary Critical respectively before the cap. Ivorybloom's
unconditional `0.09` Critical remains subject to Judgement Resistance.
These bonuses feed the shared damage and healing rate calculations; Precision
and outcome competition still apply normally.
Direct Critical is a separate final-rate channel
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

`GuaranteedCrit` is an unconditional rate override: Critical Rate becomes 100% and every other outcome rate becomes zero.

`SteadfastGuaranteedCrit` is a separate conditional rate override and only applies to skills tagged `BurningHeart` or `AnxiSoldier`:

- If the normal Final Critical is at least 75%, Critical Rate becomes 100% and every other outcome rate becomes zero.
- Otherwise, 15% Direct Critical is added and the rates are recalculated; this fallback does not guarantee a critical hit.

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

The action total is the sum of expected Physical, Bellstrike, Stonesplit, Silkbind, and Bamboocut damage. Rotation total damage includes resolved damage at or after the selected start anchor and within the combat window, including triggered skills and DOT ticks. Pre-start actions remain visible but are omitted from damage, hit count, and outcome-rate aggregation; actions after combat ends are not resolved. Battle End precedes damage at the same timestamp, so an equal-time hit does not count. Actions at the starting timestamp still use timeline order to omit earlier actions in the starting skill. DPS is total damage divided by the time from the selected start anchor to Battle End, or to completion of the final ordered cast/Delay when Battle End is absent. Final-cast same-time actions count; later DOTs and replays do not extend the duration.

## Replayed damage

A `replay` action does not enter the normal damage formula. Its source is the
final resolved damage of the source events that triggered its `Replayed` skill:

```text
Replay Damage = Sum(Source Events Final Damage) × replay.coef × (1 + replayDmgBonus)
```

Wildstride (Draught) is the sole authored replay bonus: its 20-second, one-stack target debuff supplies 20% replay damage while Strayhunt (Draught) is also active and the skill is tagged Replayed. Requirements resolve at replay time, not source-hit time. The global control maintains one permanent copy; manual applications refresh the ordinary duration.

No attack roll, defense, resistance, penetration, ordinary damage bonus, Critical,
Affinity, Abrasion, or other outcome is evaluated again. Replay damage is
reported in the physical/total breakdown channel, cannot emit another damage
event, and is excluded from simulation outcome-rate hit counts. The average
calculator and Monte Carlo simulator accumulate source totals within each live run, so a
simulation replay copies that run's randomized source hits. Because a replay
resolves no outcome, its damage is credited to the normal simulation damage
share.

Vendetta T3 records Rodent-tagged hits during Rodent Hunt's base 20-second window (user-confirmed despite the Inner Way's 15-second wording).
Expiry and reapplication each settle the active window once at 30% of its
recorded total. Source damage already includes Token, talents, and individual
outcomes; the payout applies none of them again. Chronological resolution also
updates target HP before subsequent actions. Reapplication opens a new window,
while expiry closes it. Sky Gripped continues to replay one source hit.

## Stat-priority conversion

Level-keyed max-roll values are stored in `data/stat.json` under `affix` and `attunement`. Stat and attunement priority select the entry matching the selected breakthrough profile's `gearTier`, add one max roll, and recalculate DPS. Gear editing uses the same entry matching the gear item's level. The base-attribute conversion rules are stored under `baseAttributes` in `data/system.json` and apply to character talents, gear, manual comparison deltas, and every other source:

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

Inner Way priority is calculated by removing each selected Inner Way and measuring the resulting DPS loss. Every current Inner Way declares `altersTimeline: true`, so these removals conservatively rebuild the timeline. Setup comparisons replace the selected setup option with the candidate and omit the already-active choice. Weapon and armor set comparisons rebuild when any changed tier belongs to a definition with `altersTimeline: true`, including a timeline-changing set removed by the replacement. Rain Whisper changes also rebuild the timeline because its Critical Healing bonuses can change overhealing and healing-triggered events. Script comparisons use the same two-sided rule: they rebuild when either the selected baseline Script or the candidate has `altersTimeline: true`. Revelry carries that flag because Take Damage can apply its buff; comparisons between the other damage-only Scripts reuse the baseline timeline.

### Morale Chant T6 controlled targets

At maximum Yi River stacks, Morale Chant T6 triggers one bonus attack, or two
separate hits against a Controlled target, on the same 10-second cooldown.
The second hit uses the ordinary damage pipeline and checks Controlled at hit
time. Exhausted alone does not satisfy this condition.

## Splendor outcome and spending effects

Vagrant Sword (both release variants) and Shadow Step carry `SwordEnergy`. Each
damage hit applies Sword Slash Damage Boost (劍氣增傷) after that hit: one stack,
up to three, with a shared eight-second duration refreshed on every hit. The
debuff adds 10% damage bonus per stack only to `SwordEnergy` skills; the applying
hit uses the previous stack count. This mechanic is independent of Inner Way tier.

Nameless Spear increases natural Endurance regeneration by 20% strictly below
30% of maximum Endurance. The regeneration calculation uses the current cap and
splits spans when the meter crosses that threshold. Direct skill and Inner Way
restores are unchanged, and post-spend regeneration suppression still applies.
The extra natural recovery can change later Sword Morph payments and Battle
Anthem's missing-Endurance bonus, so comparisons with this talent rebuild combat.

Sword Morph's sword-energy bonus is additive with other damage bonuses:
`min(0.30, 0.015 * enduranceSpent)`. The input is the paid fraction of the
authored direct cost before cost modifiers, excluding its charging drain.
Paying all 16 Endurance of a discounted 20-Endurance release therefore credits
20 for the bonus. A partial payment credits the same fraction of the original
cost; a discount alone does not reduce damage. Actual meter spending remains
separate in `resourceConsumption`; `baseResourceConsumption` supplies the bonus.

Resource costs resolve as `baseCost * (1 + sum(resourceCostBonus)) *
(1 + sum(resourceCostMultiplier - 1))`, with each factor floored at zero.
General cost multipliers combine their offsets additively: Ghostly Step's 0.9
and Endless Gale's 0.8 yield 0.7, or 30% less Endurance cost.
Requirement-gated charge modifiers share the additive category: Battle Anthem
T4–T5 add 0.10 and upgraded Endless Gale subtracts 0.10. Per user-confirmed
game behavior, Battle Anthem T6 removes that cost increase despite its description;
its damage bonuses and Endurance restore remain active. Endless Gale's general
reduction multiplies separately by 0.8. With Mountain's Might and Gale, a 20/s
charge therefore costs 16/s at T4–T5 and 14.4/s at T6 (17.28 over 1.2 seconds).
Without Gale, T6 costs the base 20/s (24 over 1.2 seconds).
Direct resource actions may override their matching tags with
`resourceCostTags`. Sword Morph's extra release payment uses an empty list so
general reductions apply but charge-specific modifiers do not. A charge snapshots
its consumption-rate modifiers when the charging phase starts, after pre-charge.
Gaining or losing Endless Gale during that phase does not change its drain.
Sword Morph's separate 20-Endurance payment resolves at release start using the
then-active modifiers, so Gale expiring mid-charge preserves the discounted
charge but leaves an undiscounted release payment.

Battle Anthem T3 tracks a probability distribution of its 12-second proc cooldown.
Expected-mode Endurance gains are probability-weighted; sampled mode uses the
resolved hit outcome. Expected Endurance is a shared mean meter, not a joint
distribution of every possible resource value and outcome history.

Against Exhausted targets, Sword Morph T3 removes Abrasion from sword-energy
hits by resolving their rates with full precision; its third wave forces Affinity.
The third-wave condition is a per-action modifier evaluated at the hit, so entering
or leaving Exhausted during a cast affects the actual hit state.

Insightful Strike's HP-conditional damage bonus and DOT bonus are weighted only
with the Concentration-active outcome branch. Battle Anthem T6's missing-Endurance
bonus is restricted to Charged hits.

While Concentration is active and self HP is at or below 75%, Insightful Strike
recovers 1.5% of the resolved outgoing damage. Expected mode weights the active
branch's damage by its pre-hit Concentration probability; it does not leech from
the inactive branch or the hit that first activates Concentration. Recovery caps
at maximum HP and is direct self recovery, not a healing skill, so it does not
generate healing-skill overheal or HPS entries.

For an incoming hit, Concentration has a 5% chance to reduce damage by 40%.
Expected mode uses `damage * (1 - concentrationProbability * 0.05 * 0.40)`;
sampled mode rolls the proc only while Concentration is active. Avoided hits
remain zero and do not roll mitigation. Both effects share the existing Focus
tracker, including expiry between outgoing hits. Expected HP remains a single
mean meter, so later HP-threshold rules do not retain a joint HP distribution.
