# Damage Formula Specification

This document describes the formula currently implemented by the rotation simulator. Unless stated otherwise, percentage values are stored internally as decimal ratios: `0.11` means `11%`. The UI converts between ratios and percentage points.

Enemy defense, path resistances, and Judgement Resistance come from the selected profile in `data/enemy.json`. The only profile currently shipped is Level 96: 405 defense, zero base resistance, and 65% Judgement Resistance.

## Stat resolution

The simulation input starts from zero, then the calculator applies innate character stats, level bonuses, Enhancement bonuses, character talent stats, regional Oddity rewards, attribute conversions, equipped gear, selected Inner Ways, martial-art talents, the active build's arsenal, bow/ring set, weapon set, and armor set (with any Main-tab overrides), food, and the selected Divinecraft through these stages. Set options may also contribute named timeline conditions; these use the common requirement pipeline for non-stat mechanics such as Formbend extending Shield:

1. Add fixed `stat` values.
2. Resolve `stat` formulas whose source is another base stat.
3. Calculate effective attack ranges and rates.
4. Resolve `stat` formulas whose source is a derived stat.
5. Add `effectiveStat` values and calculate the final derived stats.

Fixed effects are applied before formulas, regardless of JSON order. Internal floating-point results are normalized to nine decimal places.

A manually edited Main-tab stat is stored as a final-value override. The calculator solves the base-stat offset that makes the shared pipeline produce that exact value under the current baseline inputs. Changing the active build, Inner Ways, food, or another baseline input causes the offset to be solved again, so the modified final value remains fixed. The solved base is also used for comparison variants; adding or removing a tested effect therefore still changes the stat and contributes to the reported DPS delta.

### Effective attack ranges

For physical, Bellstrike, Silkbind, and Bamboocut attack:

```text
Effective Minimum = Minimum
Effective Maximum = max(Minimum, Maximum)
```

Void/Formless Attack is folded into the primary attribute after Stonesplit's first minimum/maximum normalization:

```text
Normalized Stonesplit Maximum = max(Min Stonesplit, Max Stonesplit)
Effective Min Stonesplit = Min Stonesplit + Min Void/Formless
Effective Max Stonesplit = max(
  Effective Min Stonesplit,
  Normalized Stonesplit Maximum + Max Void/Formless
)
```

Snowparting Blade and Phalanxbane Blade currently use Stonesplit as their primary attribute. Because these are the only supported weapon settings, Stonesplit is the active primary path in the current application.

## Damage outcomes

Every damage action is evaluated as four possible outcomes and then rate weighted:

| Outcome  | Physical attack   | Attribute attack  | Outcome bonus      |
| -------- | ----------------- | ----------------- | ------------------ |
| Abrasion | effective minimum | effective minimum | none               |
| Normal   | effective average | effective average | none               |
| Critical | effective average | effective average | Critical DMG Bonus |
| Affinity | effective maximum | effective maximum | Affinity DMG Bonus |

The effective average is `(effective minimum + effective maximum) / 2`.

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
`data/buff/global.json`. At each hit it resolves:

```text
Missing HP percentage points = (1 - current HP ratio) × 100
Dragon Head DMG Bonus = Missing HP percentage points × 0.0045
```

An HP event changes the timeline's current HP ratio for its target action and
all subsequent actions. The initial ratio is `1` (100%).

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

Physical penetration consists of attunement Physical Penetration plus active `physicalPenetration` effects.

Each attribute starts with its corresponding character penetration stat. Stonesplit additionally receives active `stonesplitPenetration` effects. Formless Penetration is added to the primary attribute.

Effects may adjust resistance directly with `bellstrikeResistance`, `stonesplitResistance`, `silkbindResistance`, or `bamboocutResistance`. These values are added to enemy resistance. For example, Fearful Blade contributes `-16` to each attribute resistance.

The Main tab can treat Phantom Chime, Qi Imbalance, Soul-Shaken, Vulnerable,
Fearful Blade, and Bitter Seasons as externally maintained global effects. An
enabled choice initializes one permanent tracked debuff on the timeline;
stacking debuffs start at maximum stacks. If the rotation applies the same
effect, it updates that tracked entry rather than adding a second copy, and the
global entry remains permanent. Requirements still resolve per damage action:
Qi Imbalance requires Exhausted, and path-specific additions require the
matching martial-art tag. These controls and their DPS comparisons use the same
worker calculation as the baseline.

## Rate calculation

For Judgement Resistance `J`:

```text
Effective Precision = min(1, (Precision − J) / (1 + J) + J)
Effective Critical  = min(0.8, Critical / (1 + J) + Effective Critical Bonus)
Effective Affinity  = min(0.4, Affinity / (1 + J))
Final Affinity = Effective Affinity + Direct Affinity
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

## Stat-priority conversion

Level-keyed max-roll values are stored in `data/stat.json` under `affix` and `attunement`. Stat and attunement priority select the entry matching the active enemy profile's numeric level, add one max roll, and recalculate DPS. Gear editing uses the same entry matching the gear item's level. The base-attribute conversion rules are stored under `baseAttributes` in `data/system.json` and apply to character talents, gear, manual comparison deltas, and every other source:

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

Inner Way priority is calculated by removing each selected Inner Way, rebuilding the timeline, and measuring the resulting DPS loss. Setup comparisons replace the selected setup option with the candidate; variants that introduce timeline behavior, such as Cleftpeak 4-piece, rebuild the timeline.
