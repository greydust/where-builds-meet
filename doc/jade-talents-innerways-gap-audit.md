# Jade talents, Inner Ways and remaining video gap

> Target-profile correction, 2026-11-05. The historical numbers below used 500
> defense and 85% Judgement Resistance despite the level-96 label. The talent
> findings remain applicable, but the intended target uses the BT17 profile.
> See the [corrected comparison and odds](jade-level96-video-comparison.md).

This follow-up reviews both equipped martial arts at BT18 rank 14, all tiers
of Blossom Barrage, Star Reacher, Morale Chant and Breaking Point, and the
previous Jade audit. It uses the corrected NPC multipliers and 40% FF Jadebreak.
The original investigation was diagnostic. Both findings below are now fixed
in production data. A fresh screenshot-matched BT18/level-96 rerun yields
**92,795.59113858896 total DPS** and **10,463.177361589787 FF DPS**, retaining
155 UF and 12 FF hits. This matches the combined diagnostic result below.
Startling Spring uses explicit stack tables; all supported Umbrella talent
ranks include FF in both ordinary and controlled-target resistance-ignore
branches. DPS snapshots remain unchanged pending review.

The remaining total gap to 100,585 is **7,789.409 DPS**. The visible skill gaps
are approximately 3,707 UF, 1,865 FF, 1,213 Soaring Spin and 844 Spring Sorrow
DPS. These differences do not establish an additional missing multiplier.
The strongest unresolved comparison inputs remain the unnamed skill/weapon
bonuses, live buff coverage and Mystic levels/enlightenments. The existing
fixed-timeline roll probabilities predate the SS/resistance fixes and should
not be quoted as probabilities for the newly corrected FF damage.

## Findings

### Startling Spring damage does not scale with its tracked stacks

The source buff 200177 allows five stacks. Its localized description specifies
4% charged damage and Endurance cost per stack. Passive 2001771 checks charged
class 104 and supplies the 4% damage effect. FF qualifies.

The current definition has one `effect` entry with `hpDMGBonus` 0.04. The damage
pipeline's `effectsForTrackedEffect` returns that entry once, regardless of
stack count. `prepareTrackedEffect` and the damage calculator therefore apply
4% at both three and five stacks. The resource-cost path separately repeats
ordinary effects per stack, so the cost already scales. This is a mismatch
between the authored stacking intent and the damage representation, rather
than a failure to accumulate the visible SS stacks.

Using the existing explicit `stackEffects` mechanism for 4/8/12/16/20% damage
and cost fixes this in a diagnostic bundle without changing the engine's
semantics for unrelated buffs. FF's three unbuffed, four three-stack and five
five-stack hits remain unchanged in count and timing. FF rises from
**9,737.278 to 10,322.276 DPS**, a gain of **584.998 DPS**.

### Umbrella's resistance-ignore talent excludes an eligible FF hit

Rank-14 Umbrella talent 303502 activates buff 3035021, which includes passives
30350113 and 30350114. Both check `cond_self [[26,1005]]`. The latter reduces
target `W_ATK_PEN_RDC` by 5; the former adds another 10 against immobilized or
airborne targets. Neither recovered passive restricts the hit to Umbrella.
FF has raw tag 1005, as established in the preceding Jadebreak audit.

The simulator requires both `VernalUmbrella` and `Ballistic`, excluding FF.
Granting FF the ordinary five-point ignore in a diagnostic bundle raises its
DPS to **9,870.230**, a gain of **132.952**. Combining this with SS stacking
yields **10,463.177 FF DPS** and **92,795.591 total DPS**. The effects interact,
so their combined gain is slightly larger than the sum of isolated gains.

Do not grant FF Combo or the Umbrella critical-damage talent while correcting
this filter. Combo and passive 30320312 check raw tag 1006, which FF lacks.
The Fan critical-damage talent, passive 30420312, checks skill 20302105
(Moon Shatter Spring), not FF's skill 20302111.

## Martial-art talent reconciliation

| Rank-14 talent                      | Source and current behavior                                                                     | Assessment                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fan Agility conversion              | 304114 gives 0.264 Min Physical Attack per Agility, capped at 300 Agility                       | Matches; included in the reconstructed pre-buff sheet                                                  |
| Fan pursuit critical damage         | 304203 / 30420312 gives 2.4% per 50 Min Physical Attack, capped at 36%, for Moon Shatter Spring | Matches; not an FF or Mystic bonus                                                                     |
| Fan low-Qi pursuit                  | 304502 adds 30% critical rate and 8% HP damage below 30% target Qi                              | Damage eligibility matches Moon Shatter Spring; extra Qi damage is outside this authored-Qi comparison |
| Fan Silkbind conversion             | 304312 gives 106–212 attack and up to 11.8% Silkbind damage                                     | Matches the screenshot override; adding it again would double-count                                    |
| Fan attribute path                  | 304401 gives the Silkbind channel its 1.5 multiplier                                            | Present in the shared damage formula, including Mystic attribute damage                                |
| Fan bonus attack                    | 304601 increases flat physical/attribute skill bonuses by 7.25%                                 | Present for Fan; not a 7.25% whole-hit or universal Mystic multiplier                                  |
| Umbrella Agility conversion         | 303114 gives 0.0304 percentage points of crit per Agility, capped at 300 Agility                | Matches; included in pre-buff sheet                                                                    |
| Umbrella projectile critical damage | 303203 / 30320312 gives up to 36%, gated by raw tag 1006                                        | Matches UF; does not qualify FF                                                                        |
| Umbrella resistance ignore          | 303502 / 30350113–14 checks raw tag 1005                                                        | FF is incorrectly excluded as described above                                                          |
| Umbrella Blossom refund             | 30350213–17 targets the two UF calcpoints, with target-state branches                           | Exhausted-boss branch is present; prior per-projectile refund correction is retained                   |
| Umbrella Silkbind conversion        | 303312 gives 106–212 attack and up to 23.6 penetration                                          | Matches the screenshot override                                                                        |
| Umbrella attribute path             | 303401 provides Silkbind's 1.5 channel multiplier                                               | Shared with Fan, not multiplied twice                                                                  |
| Umbrella bonus attack               | 303601 increases flat skill bonuses by 7.25%                                                    | Present for Umbrella; not a global Mystic bonus                                                        |

## Equipped Inner Ways

| Inner Way             | Review result                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blossom Barrage T0–T6 | Three Q charges at T6, upgraded 20% Combo, UF/Spring Away T4 bonuses, and resource/cooldown refunds are present. The prior audit's obsolete additive 30% Combo must not be reinstated. Crit/direct-crit sheet contributions are already in the screenshot reconstruction.                                              |
| Star Reacher T0–T6    | Ordinary grounded 7.5% and enhanced grounded 15% physical attack, 12s upgraded duration, penetration and the T6 HP-dependent damage/leech branches are represented. Raw 10230345 confirms enhanced grounded 15%; 25% belongs to the airborne branch. Live grant timing/refresh remains a previous audit qualification. |
| Morale Chant T0–T6    | Yi River uses explicit stack tables, so its damage and penetration already reach five-stack values. T3 controlled-target bonuses, T4 duration, direct crit and T6 extra damage are represented. Exhaustion alone should not be substituted for the separate Controlled flag without source evidence.                   |
| Breaking Point T0–T6  | Disintegration uses explicit stack tables up to 25 penetration and 25% critical damage. Exhausted-hit stacking, upgraded duration and the T6 perfect-dodge proc are present. It does not share SS's single-effect stacking omission.                                                                                   |

The older audit explicitly did not independently certify every shared Mystic
coefficient or enlightenment path. Its presence is not proof that those paths
were fully validated. Historical corrected Combo and Star Reacher findings are
already reflected in the current baseline.

## Mystic shortfall

### Soaring Spin high-roll check after both fixes

A 50,000-run check of the six Soaring Spin hits uses the corrected production
definitions and the same screenshot-matched BT18, level-96 target. Seed 2300058
drives the shared damage-sequence sampler, with buff timing and hit counts fixed.
The video threshold is its exact 406,684 total damage, rather than its rounded
DPS label. Expected damage is 333,887.188, or 5,564.786 DPS.

**359 of 50,000 runs reached the video total**, an observed rate of **0.718%**,
roughly one in 139 runs under these fixed assumptions. The 99th percentile was
6,723.892 DPS and the 99.9th percentile 7,051.931 DPS. The video's 6,778.067 DPS
is therefore a plausible, uncommon high roll for six hits, despite being 21.80%
above the expectation. It is much less extreme than the earlier 155-hit UF
comparison. This is a marginal probability for Soaring, not the probability
of matching the full video's combined skill totals.

All six simulated hits have five Disintegration stacks, four have Mystery DMG
Boost, and all have ordinary or enhanced Star Reacher. The result does not
establish a Jade-specific Soaring coefficient error. Different buff windows or
video build inputs remain possible, but no extra damage multiplier is justified
by this six-hit total alone.

The directly visible Mystic comparison is Soaring Spin, six hits at about
**5,565 simulated DPS versus 6,778 in the video**. The source numerical skill
2300058 at level 76 has coefficient 7.10342962464003 and physical flat 1120.06,
split 45%/55% across its two hits. These match the current definition. The
recovered normal hit records do not show an additional NPC target correction.
Its applied buff 98732 concerns healing reduction, not a damage boost.

The screenshot's 21.4% All Mystic bonus is supplied through the shared stat
pipeline. Neither FF nor UF is a Mystic skill. The ordinary martial-art
bonus-attack talents do not grant their 7.25% flat bonus to Mystic skills.
The video does not establish its Mystic skill level or every enlightenment
choice, so those remain comparison inputs to verify rather than inferred buffs.

The finite-Vitality run has a total-Mystic scaling factor of
**0.9862453915254237**. An infinite-Vitality sensitivity run increases total DPS
by only **191.865**, with identical hit counts and timing. Grouped skill damage
rows remain unscaled by this aggregate penalty, so removing it does not change
the displayed Soaring Spin row. This is a reporting distinction worth retaining
when comparing individual rows with the overall DPS. It cannot explain the
1,213-DPS Soaring gap or the FF shortfall.

## Diagnostic comparison

### Updated per-skill high-roll comparison

After both FF fixes, the same level-96 setup was sampled for 50,000 Spring
Sorrow runs and 50,000 FF runs, using seed 20302111 and the shared damage
sequence calculator. Timing and buff states were fixed. Spring Sorrow retained
eight hits and FF twelve. Exact video totals were 489,010 and 739,717.

| Skill           | Expected DPS | Video DPS from exact damage | Video above expectation |                     Runs reaching video |
| --------------- | -----------: | --------------------------: | ----------------------: | --------------------------------------: |
| Spring Sorrow   |    7,305.909 |                   8,150.167 |                  11.56% |                 3,023 / 50,000 (6.046%) |
| Forsaken Fame   |   10,463.177 |                  12,328.617 |                  17.83% |                    65 / 50,000 (0.130%) |
| Unfading Flower |   54,059.472 |                  57,766.700 |                   6.86% | 1 / 20,000 (earlier unchanged-UF check) |

Spring Sorrow is a plausible high roll, roughly one in 17 in this sample.
Corrected FF is rare, roughly one in 769, but substantially more plausible
than before its two fixes. UF remains the strongest individual discrepancy.
Its one observed exceedance is too little evidence for a precise tail rate.
These are individual probabilities under fixed model assumptions, not a
measured probability of matching all video totals simultaneously. SS in the
comparison means Spring Sorrow; Startling Spring is a buff without its own
damage row.

| Scenario                                               | Total DPS | UF DPS | FF DPS |
| ------------------------------------------------------ | --------: | -----: | -----: |
| Current corrected production                           |    92,070 | 54,059 |  9,737 |
| SS stacks corrected                                    |    92,655 | 54,059 | 10,322 |
| FF resistance ignore only                              |    92,203 | 54,059 |  9,870 |
| Both FF corrections                                    |    92,796 | 54,059 | 10,463 |
| Both, plus remove Vitality penalty as sensitivity only |    92,987 | 54,059 | 10,463 |
| Video                                                  |   100,585 | 57,766 | 12,328 |

All scenarios use BT18, the resolved level-96 target, screenshot-matched stats,
Mistwillow, physical food, Wraithstrike and no Boss Talent. All retain 155 UF
and 12 FF hits. The two FF omissions explain about 726 total DPS together;
they do not explain the complete video gap. There is no newly established
universal missing damage bonus from the reviewed talents or equipped Inner Ways.
The unnamed 28% skill boost and 7.1% weapon boost, live buff coverage, and the
video's Mystic levels/enlightenments remain useful follow-up evidence.

## Evidence

- [Previous boost audit and video assumptions](jade-uf-ff-boost-audit.md)
- [Historical implementation audit](jade-combat-audit.json)
- [External source review](../../where-datas-mine-internal/reports/jade-combat-audit-review.html)
- [Martial-art source export](../local/datamine/2026-10-28_08-11-44-968_+0000-csrGfl/wwm-martial-arts-normal.json)
- [Inner Way source export](../local/datamine/2026-10-28_08-11-44-968_+0000-csrGfl/wwm-inner-way-normal.json)
- [Raw passive rows](../local/datamine/2026-10-28_08-11-44-968_+0000-csrGfl/buff_passive_data.json)
- [Raw buff rows and localized SS description](../local/datamine/2026-10-28_08-11-44-968_+0000-csrGfl/buff.json)
- [Mystic numerical source export](../local/datamine/2026-10-28_08-11-44-968_+0000-csrGfl/wwm-skills-mystic-skills-all.json)
- [Damage effect collection](../src/calculations/rotationCalculator.ts)
- [Stack effect selection and resource-cost handling](../src/calculations/rotationTimeline.ts)
