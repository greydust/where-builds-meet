# Forsaken Fame and Unfading Flower calculation audit

> Target-profile correction, 2026-11-05. This report and its JSON/CSV preserve
> the historical 500-defense, 85%-Judgement-Resistance run. The stored level-96
> label was misleading. For the intended BT18 character against the BT17/level-96
> target, use the [corrected comparison and odds](jade-level96-video-comparison.md).

Prepared 2026-11-05 from the current working tree. This documents the implemented
calculation and identifies questions for independent verification. A passing
reproduction check establishes internal consistency, not agreement with the game.

The [independent source review](../../where-datas-mine-internal/reports/jade-ff-uf-review.html)
reproduced all 167 historical hits within 1.4552e-11 and verified 95 retained
source rows. It confirms the arithmetic and recent bonus eligibility fixes,
but does not validate the grounded UF resource trajectory. The five-point
per-projectile payment below is a simulator assumption that substitutes for a
source-backed timed base drain. No additional damage multiplier was established.

## Audit package and current result

- [Machine-readable inputs, resolved contexts and results for all 167 hits](jade-ff-uf-calculation-evidence.json)
- [CSV hit ledger with damage channels and active buff stacks](jade-ff-uf-hit-ledger.csv)
- [Previous boost/source audit](jade-uf-ff-boost-audit.md)
- [Talent, Inner Way and high-roll investigation](jade-talents-innerways-gap-audit.md)

| Measurement        | Current implementation |      Video |
| ------------------ | ---------------------: | ---------: |
| Full rotation DPS  |             92,795.591 |    100,585 |
| UF projectile hits |                    155 |        155 |
| UF total damage    |          3,243,568.327 |  3,466,002 |
| UF DPS             |             54,059.472 | 57,766.700 |
| FF hits            |                     12 |         12 |
| FF total damage    |            627,790.642 |    739,717 |
| FF DPS             |             10,463.177 | 12,328.617 |

Video skill DPS above is exact displayed total damage divided by 60. Its visible
integer DPS labels truncate slightly differently. UF's activation Heavy Attack
is a separate damage category and is excluded from the 155 projectile hits.
The full rotation contains other skills and an aggregate Mystic Vitality penalty,
so its total is not just the sum of these two rows.

## Reproduction inputs

The rotation is **Grounded Dummy 1 Min BP**, 60 seconds, 40ms ping, finite
Vitality, with the saved attacking-dummy and authored Qi/exhaustion events.
The selected preset ID is `jade-fully-relayed-max-bp`, whose current display
name is Fully Relayed Max BP Mystic. The comparison replaces its Rain Whisper
set with **Mistwillow four-piece** in memory. The saved build is not modified.

BT18 selects martial-art talent rank 14 and tier-100 weapon curves. The resolved
enemy is level **96**, defense **500**, zero base channel resistances and
**85% Judgement Resistance**. Enemy level alone does not specify those other
defensive values. Their provenance and applicability to the actual video dummy
remain appropriate subjects for an independent audit.

Equipped Inner Ways are Blossom Barrage, Star Reacher, Morale Chant and Breaking
Point, all T6. Fire Divinecraft and Wraithstrike are selected. Boss Talent and
party debuffs are disabled. The 7.1% boss-unit gear stat remains enabled; it is
different from Boss Talent.

| Screenshot input                    | Value and treatment                               |
| ----------------------------------- | ------------------------------------------------- |
| Power / Agility / Momentum          | 730 / 295 / 187                                   |
| Body / Defense                      | 187 / 187                                         |
| Physical Attack                     | 1,486–4,032 before food                           |
| Physical food                       | +140 minimum and +280 maximum, giving 1,626–4,312 |
| Attribute Attack                    | 386–747, assigned entirely to Silkbind            |
| Physical / Silkbind penetration     | 56.3 / 23.6                                       |
| Raw precision / crit / affinity     | 129.9% / 143.0% / 19.1%                           |
| Direct crit / affinity              | 13.3% / 0%                                        |
| Crit / affinity damage bonus        | 50% / 35% before conditional effects              |
| Physical / Silkbind damage bonus    | 0% / 11.8% before Mistwillow                      |
| All Martial Arts / boss-unit damage | 6.8% / 7.1%                                       |
| All Mystic damage                   | 21.4%; neither FF nor UF qualifies                |
| Named weapon bonus assumption       | 7.1% assigned to Umbrella, zero to Fan            |
| Named skill bonus assumption        | 28% assigned to Vernal frequent projectiles       |
| HP / physical defense               | 169,781 / 556                                     |

The last two named-bonus identities are not visible in the supplied screenshot.
They remain assumptions. Overrides go through `calculateStatsWithOverrides`.
Unconditional talent/Inner Way stats are reconciled to the supplied sheet rather
than added on top a second time. Food remains an effective-stat contribution.
The food ID is `SimmeringFishSlices`, currently displayed as Clay Oven Flatbread.
The evidence includes every override and the complete resulting base sheet.

The shared rate pipeline resolves 100% effective precision and final outcomes
of **89.6756756757% critical**, **10.3243243243% affinity**, with zero normal and
abrasion probability for these hits. Raw crit 143% is not the damage outcome
probability. Affinity resolves at maximum attack rather than average attack.

## Skill coefficients and attribution

| Parameter per damage hit               | FF / FF Cancel | UF projectile |
| -------------------------------------- | -------------: | ------------: |
| Physical coefficient                   |         1.9044 |    0.51082875 |
| Attribute coefficient                  |         1.9044 |    0.51082875 |
| Physical flat bonus                    |            527 |       141.375 |
| Attribute flat bonus                   |            287 |            77 |
| Rank-14 flat-bonus multiplier          |         1.0725 |        1.0725 |
| Separate NPC target multiplier         |           1.45 |          1.15 |
| Assumed matching attunement multiplier |              1 |          1.28 |

The flat-bonus talent modifies only the two flat bonuses, not attack coefficients
or the whole hit. FF full and cancel variants use the same damage action. Cancel
uses the nominal 1.19-second projectile-request boundary. The full variant's
1.63-second duration models the ordinary recovery/interrupt gate, not a proven
SKILL_END or complete animation duration. Neither timestamp establishes a
universally safe same-tick cancel input; actual projectile launch matters.
Source requests/animation markers are not independently measured projectile
contact times; the simulator currently treats their authored damage offsets as
impact times.

FF uses source calcpoint 2030211101 and display skill 20302111. UF uses the two
2060110301/02 projectile calcpoints. Each UF coefficient already includes its
0.125 numerical ratio; it must not be doubled because a volley can fire twice.
The simulator represents both projectile types with `UnfadingFlowerProjectile`.

## Calculation order for one hit

1. Resolve the timeline state at the hit, including active buffs, stack counts,
   target marks, Qi, HP and the current skill tags.
2. Collect skill modifiers, matching martial-art talents, Inner Way rules,
   setup effects and active buff/debuff effects. Unconditional cached effects
   and remaining conditional effects are separate inputs and both must be read.
3. Resolve `stat` and `effectiveStat` effects through the shared action-stat
   pipeline. Mistwillow enters here as physical/Silkbind damage-channel stats.
4. Sum the remaining damage-effect fields into their respective buckets.
5. Calculate each outcome's physical and attribute damage, then probability-weight
   those outcomes for expected damage. Simulation instead selects an outcome and
   samples eligible attack ranges independently per hit.
6. Sum accepted in-battle hits, group FF variants together, and divide by 60.

For the current two-channel setup, define `P` as physical attack after food and
active physical-attack bonuses, and `S` as Silkbind attack. Ordinary/critical
expected damage uses each range's midpoint; affinity uses its maximum.

```text
Pen(p, r) = 1 + (p-r)/200  when p >= r
          = 1 + (p-r)/100  otherwise

PhysicalBase = Cp × (P - adjustedEnemyDefense) + Bp × (1 + flatAttackBonus)
SilkbindBase = Cs × S + Bs × (1 + flatAttackBonus)

PhysicalDamage = max(0,
    PhysicalBase
  × Pen(physicalPenetration, physicalResistance)
  × (1 + physicalDamageBonus)
  × NPCFactor × (1 + baseDamageBonus)
  × (1 + Category1) × (1 + matchingAttunement)
  × outcomeMultiplier × (1 + globalDamageBonus))

SilkbindDamage = SilkbindBase
  × Pen(silkbindPenetration, silkbindResistance)
  × (1 + silkbindDamageBonus) × 1.5
  × NPCFactor × (1 + baseDamageBonus)
  × (1 + Category1 + attributeDamageBonus) × (1 + matchingAttunement)
  × outcomeMultiplier × (1 + globalDamageBonus)

ExpectedHit = 0.8967567567567567 × CriticalHitAtMeanAttack
            + 0.10324324324324324 × AffinityHitAtMaxAttack
```

The 1.5 Silkbind path multiplier is applied once, even though both equipped
martial arts are Silkbind. Zero other attribute channels contribute zero here.
Defense is subtracted inside the coefficient term, not from final damage.
The ordinary five-point resistance ignore changes `r`; it is not five percent
defense penetration. No universal per-hit integer rounding is modeled.

Critical multiplier is `1 + clamp(effectiveCritDmgBonus + activeCritDmgBonus,
0.35, 1.5)`. Affinity multiplier is `1 + clamp(affinityDmgBonus + active bonus,
0.2, 1.3)`. Thus their implemented multiplier limits are 1.35–2.50 and
1.20–2.30. Neither attack variance nor critical/affinity outcome is locked
for an entire UF activation in the current model.

## Bonus eligibility and placement

| Source                                 | FF                                                       | UF                                           | Calculation location                                                           |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| All Martial Arts                       | +6.8%                                                    | +6.8%                                        | Category 1                                                                     |
| Boss-unit gear stat                    | +7.1%                                                    | +7.1%                                        | Category 1                                                                     |
| Weapon art, assumed identity           | 0                                                        | +7.1%                                        | Category 1                                                                     |
| Fire Divinecraft                       | +1.5%                                                    | +1.5%                                        | Category 1; its triggered damage is separate                                   |
| Jadebreak                              | +30% and +10% while active                               | Same                                         | Category 1                                                                     |
| Combo T1+                              | No                                                       | +20% while marked                            | Category 1                                                                     |
| Blossom Barrage T4                     | No                                                       | +5%, another +5% while exhausted, with Combo | Category 1                                                                     |
| Startling Spring                       | +4% per stack, up to 20%                                 | No                                           | Category 1; FF is charged, UF is not                                           |
| Morale Chant / Yi River                | +1% damage and +2 physical penetration per stack         | Same                                         | Category 1 and penetration; T3 controlled-target branch doubles damage portion |
| Star Reacher grounded                  | +7.5% or enhanced +15% physical attack                   | Same                                         | Physical attack range, not whole-hit damage                                    |
| Star Reacher T6                        | +3% with owned Bone or Airborne and HP above 75%         | Same                                         | Category 1                                                                     |
| Mystery DMG Boost                      | +15% while active                                        | Same                                         | Category 1                                                                     |
| Disintegration                         | +5 penetration and +5% crit damage per stack, up to five | Same                                         | Physical penetration and critical outcome                                      |
| Wraithstrike                           | +10% crit damage below 40% target Qi                     | Same                                         | Critical outcome only                                                          |
| Umbrella crit-damage talent            | No                                                       | +36% at this Min Physical Attack             | Critical outcome only                                                          |
| Fan pursuit crit-damage talent         | No                                                       | No                                           | Applies to Moon Shatter Spring, not these hits                                 |
| Umbrella resistance-ignore talent      | 5 ordinary, additional 10 against immobilized/airborne   | Same                                         | Target physical resistance                                                     |
| Mistwillow                             | +10% physical/Silkbind channel damage                    | Same                                         | Channel stat bonuses; Silkbind becomes 21.8%                                   |
| Exhausted                              | +10%                                                     | Same                                         | Separate global multiplier 1.1                                                 |
| Assumed frequent-projectile attunement | No                                                       | +28%                                         | Separate multiplier 1.28                                                       |
| NPC correction                         | ×1.45                                                    | ×1.15                                        | Separate whole-hit factor                                                      |
| All Mystic / Rain Whisper              | Neither applies                                          | Neither applies                              | Mistwillow is selected; these are martial-art hits                             |

Raw hit tag 1005 qualifies FF for Jadebreak and projectile resistance ignore.
Raw tag 1006 qualifies UF for Combo and its critical-damage talent. FF lacks 1006. The implementation's `JadebreakProjectile` tag preserves this distinction.
Jadebreak's secondary target condition `[12,3]` is user-confirmed as boss and
eligible on all supported targets, rather than independently decoded in this
audit. That distinction should travel with the handoff.

## Worked opening hits

Both first hits have three Yi River stacks, Jadebreak and Mistwillow. Neither
has Star Reacher, Disintegration, Wraithstrike, Mystery DMG Boost or prior Bone.
FF applies Bone after its damage; its first hit cannot retroactively gain it.

| Input or result                        | First FF at 4.959041s | First UF at 3.979041s |
| -------------------------------------- | --------------------: | --------------------: |
| Physical attack range / mean           |   1,626–4,312 / 2,969 |                  Same |
| Silkbind range / mean                  |       386–747 / 566.5 |                  Same |
| Adjusted defense                       |                   500 |                   500 |
| Physical penetration                   |              56.3 + 6 |                  Same |
| Physical resistance                    |                    -5 |                    -5 |
| Physical penetration multiplier        |                1.3365 |                1.3365 |
| Silkbind penetration multiplier        |                 1.118 |                 1.118 |
| Physical / Silkbind channel multiplier |           1.1 / 1.218 |                  Same |
| Category 1 sum                         |                 0.584 |                 0.905 |
| Critical / affinity multiplier         |           1.50 / 1.35 |           1.86 / 1.35 |
| NPC / attunement multiplier            |              1.45 / 1 |           1.15 / 1.28 |
| Expected physical damage               |         27,606.271920 |         10,921.207246 |
| Expected Silkbind damage               |          9,882.042348 |          3,924.212756 |
| Expected total                         |     **37,488.314268** |     **14,845.420002** |

FF Category 1 is `0.068 + 0.071 + 0.015 + 0.03 + 0.40`.
UF additionally receives `0.071 + 0.20 + 0.05`. Flat bonuses are multiplied
by 1.0725 before the above calculation. The evidence retains the complete
contexts for these examples and every later buff combination.

## Timing, resources and hit-count semantics

FF damage, Lingering Bone application and the 10-Endurance grant share the
nominal 1.19-second timestamp, in authored action order. Cancelled FF must be
followed by Deflect or another eligible non-FF, non-Umbrella skill. Its cancel
variant does not reduce damage.

Grounded UF launches its first volley 0.55s after mode activation, then every
0.5s. A Bone-marked volley schedules its second shot at +0.15s. Target Airborne
uses the distinct three-shot branch; this comparison is grounded. Shot-count
selection uses the volley-start target state, while each scheduled shot still
checks live mode and positive Blossoms before firing.

In the current simulator assumption, each grounded projectile spends five
Blossoms, then deals damage. Exhausted
projectile damage refunds three. A depletion boundary can end the mode before
the subsequent shot and before a refund, so refunds must not revive a mode
that already ended. This allows odd hit counts around exhaustion transitions.
The activation Heavy Attack is separate and does not count as a projectile.
Mode termination schedules the existing 15-Blossom return after 0.2s.

The independent review finds Normal buff 200112 instead explicitly authors
`resource_auto_consume=[30,1,10]`, separately from the 0.5s projectile callback
with 0.55s first delay. This supports a timed 10/s base drain and suppression of
ordinary recovery. Text describes an additional 10 or 15/s for enhanced shots,
but the supplier/selection of that extra rate and the drain tick phase are not
established. Five-point shot payments and spend-before-refund mode termination
are not recovered game rules. Do not add 10/s on top of the current per-shot
costs, or assume an immediate continuous 5.5-point startup cost, without tracing
the missing consumer behavior. A corrected model requires a new timeline run.

The current six activation totals are **20 / 23 / 29 / 20 / 20 / 43**, summing
to 155. This matches the video total, but does not prove its per-activation
distribution, resource payment rule or exact volley/contact clocks. UF also refreshes existing Bone
on the implemented volley-start event. Star Reacher grant dispatch and that
refresh timing remain explicit live-validation items from the previous audit.

All bonuses resolve at each damage event. A cast-start buff is not assumed to
cover its last hit. Hits at or after the battle cutoff are excluded. The CSV
uses battle-relative timestamps, while the JSON retains the anchor offset.

## FF hit ledger

|  Hit time | Expected damage | Jadebreak | SS stacks | BP stacks |
| --------: | --------------: | --------: | --------: | --------: |
|  4.959041 |      37,488.314 |       yes |         0 |         0 |
| 21.753795 |      61,980.934 |       yes |         0 |         5 |
| 23.283795 |      61,980.934 |       yes |         0 |         5 |
| 32.388990 |      48,261.770 |       yes |         3 |         0 |
| 33.918990 |      48,261.770 |       yes |         3 |         0 |
| 35.448990 |      48,261.770 |       yes |         3 |         0 |
| 40.674185 |      34,320.607 |        no |         3 |         0 |
| 43.708185 |      49,188.051 |       yes |         5 |         0 |
| 50.862703 |      69,567.340 |       yes |         5 |         5 |
| 53.542703 |      69,567.340 |       yes |         5 |         5 |
| 56.369703 |      54,394.528 |        no |         5 |         5 |
| 57.899703 |      44,517.284 |        no |         5 |         5 |

These are expected values over outcomes, not predictions for individual crits.
The full CSV also lists physical/Silkbind damage, Bone, exhaustion, Yi River,
Star Reacher and Mystery DMG Boost for all 155 UF projectiles.

## Questions for the next independent audit

1. **Target and sheet reconstruction.** Verify the video dummy's defense and
   resistance profile, food inclusion in the pre-buff screenshot, named 28%
   skill/7.1% weapon bonuses and the all-Silkbind attribute assumption.
2. **Per-hit numerical evidence.** Compare the opening FF and UF examples above
   with individual labeled critical/affinity hits, then repeat during five-stack
   BP and five-stack SS. This separates attack ranges, outcome multipliers and
   missing conditional effects from aggregate luck.
3. **NPC correction consumer.** Verify 1.15/1.45 placement for critical and
   affinity branches and any rounding. The earlier recovered consumer proof
   directly covered ordinary-damage branches; numerical parity is not certified
   merely by reusing the factor in every simulator outcome.
4. **FF projectile eligibility.** Recheck raw tags 1005/1006 and the application
   scope of Umbrella's resistance passive when Fan is active. Test Jadebreak,
   Combo and resistance ignore independently. Confirm SS's full 20% damage at
   five stacks with fixed attack/outcome labels.
5. **UF clocks and refunds.** Verify per-activation counts, first volley delay,
   paired-shot interval, last funded shot, and exhaustion transitions. Equal
   total hit counts can hide different damage-heavy exhaustion windows.
6. **Buff coverage and attack-stat scope.** Verify the Star Reacher grant/refresh
   rules, ordinary versus enhanced replacement, and the attack components its
   percentage affects. Check Jadebreak expiry on the three uncovered FF hits.
7. **Roll dependence.** The simulator rolls every projectile independently and
   samples attack channels according to the shared formula. Establish whether
   the game shares any roll across a volley or activation before treating the
   simulated tail probability as definitive evidence of a missing multiplier.

The latest independent per-skill samples reached the video in 65/50,000 FF
runs and 1/20,000 UF runs. They use fixed buff timing. UF's single observed
exceedance is insufficient for a precise tail probability. No joint probability
for all video skill totals has been measured.

## Reading and verifying the JSON

`setup` contains screenshot overrides, resolved base stats, enemy and equipment
assumptions. `rotation` contains the exact authored sequence. Each `hits` entry
contains its action, input damage context, resolved stat context, expected channel
damage and buff/debuff stack maps. Repeated arrays/snapshots are stored in `pools`.
A field such as `statsRef` indexes `pools.stats`; `enemyRef` refers to `setup.enemy`.
Expand all references before using the context. Ratios remain decimal ratios.

Use **inputContext** with the public damage calculator. `resolvedStatContext`
is for inspection after action-stat effects have already been applied; feeding
it back through stat resolution can double-apply those effects. Trigger-only
metadata and `minBreakthrough` are omitted from exported per-hit effect lists
after timeline resolution. They are not needed for damage-only replay; the
production definitions are still required to rebuild the timeline.

The export check verifies level 96, both hit counts, and agreement between the
sum of per-hit damage and grouped FF/UF totals. It does not update DPS snapshots.
This audit makes no production mechanic changes.

## Source map

- [FF data](../data/skill/inkwell-fan.json), [UF data](../data/skill/vernal-umbrella.json)
- [Jade buffs](../data/buff/silkbind-jade.json), [Combo and Bone](../data/debuff/silkbind-jade.json)
- [Fan talents](../data/martial-art/inkwell-fan.json), [Umbrella talents](../data/martial-art/vernal-umbrella.json)
- [Damage formula implementation](../src/calculations/damage.ts), [action stat resolution](../src/calculations/actionStats.ts)
- [Timeline](../src/calculations/rotationTimeline.ts), [rotation damage collection](../src/calculations/rotationCalculator.ts)
- [Source hit records](../../where-datas-mine-internal/site/public/data/processed-hit-records.json)
- [Target correction consumer evidence](../../where-datas-mine-internal/notes/skill-hit-scaling-evidence.md)
- [External Jade audit review](../../where-datas-mine-internal/reports/jade-combat-audit-review.html)
