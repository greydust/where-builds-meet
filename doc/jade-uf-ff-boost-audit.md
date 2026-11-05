# Jade boost audit: Unfading Flower and Forsaken Fame

> Target-profile correction, 2026-11-05. The historical runs below used the BT18
> enemy profile (500 defense, 85% Judgement Resistance), whose stored level label
> incorrectly said 96. They do not represent the user's intended BT17/level-96
> target. See the [corrected comparison and odds](jade-level96-video-comparison.md).

## Implemented correction and rerun

The approved correction now applies UF's 1.15 and FF's 1.45 NPC multipliers
through the shared whole-hit `damageScale`, removing their former additive
modifiers. Both FF variants qualify for Jadebreak independently of Combo.
The user identified the secondary passive's `[12,3]` condition as hitting a
boss and confirmed that every supported target qualifies. FF therefore receives
both the 30% and 10% Jadebreak branches while the buff is active. This target
interpretation is user-confirmed, rather than independently decoded here.

The screenshot-matched BT18, level-96 rerun uses the comparison setup below,
including Mistwillow, food, Wraithstrike and no Boss Talent.

| Measurement       |   Before | Corrected |    Video |
| ----------------- | -------: | --------: | -------: |
| Total DPS         |   86,132 |    92,070 |  100,585 |
| UF projectile DPS |   50,505 |    54,059 |   57,766 |
| FF DPS            |    7,355 |     9,737 |   12,328 |
| UF / FF hits      | 155 / 12 |  155 / 12 | 155 / 12 |

Exact corrected DPS is **92,069.69138489164**, an increase of
**5,937.61513495368**. The remaining gap is **8,515 DPS**, about **8.47%** of
the video's total. UF remains about 3,707 DPS below the video and FF 2,591
below. These changes explain part of the discrepancy without changing timing,
hit counts or the unnamed screenshot boost assumptions. DPS snapshots have not
been refreshed.

Verification passed for 169 focused Jade tests, TypeScript, lint and formatting.
The full build stopped in its test stage with the same 15 existing dodge-timing
failures across six suites; 1,879 tests passed in that run. The subsequently
added UF Combo/Jadebreak overlap test also passed in the focused run.

The sections below retain the original pre-correction audit and sensitivity
results for comparison. Their references to an unresolved secondary condition
and diagnostic-only corrections describe that earlier audit state.

## Original audit

### Post-correction high-roll check

The corrected production definitions were sampled with seed 134901, using
20,000 runs per skill group and the shared damage-sequence calculator. The
actual resolved enemy was explicitly checked as level 96, defense 500,
judgement resistance 85%. Build and screenshot assumptions match the setup
above. Timing, buff coverage and the 155 UF / 12 FF hits were held fixed.
Critical/affinity outcomes and attack-range rolls were sampled independently
per damage event. This tests roll variance, not alternate live buff timelines.

| DPS statistic             |         UF |         FF |
| ------------------------- | ---------: | ---------: |
| Expected                  |     54,059 |      9,737 |
| Video                     |     57,767 |     12,329 |
| Video above expected      |      6.86% |     26.61% |
| Sample 99th percentile    |     56,220 |     11,082 |
| Sample 99.9th percentile  |     56,847 |     11,437 |
| Best sampled run          |     58,251 |     12,168 |
| Runs reaching video total | 1 / 20,000 | 0 / 20,000 |

Video thresholds use the exact displayed damage totals, 3,466,002 and 739,717,
divided by 60. This differs slightly from the video's truncated DPS labels.
UF's threshold is about 4.02 sample standard deviations above its mean; FF's
is about 4.38. These are descriptive distances, not Gaussian tail estimates.
UF reached the video once, demonstrating possibility under this model, but one
event is insufficient for a precise probability estimate. FF's theoretical
fixed-state maximum is 821,301 damage, above the video, so zero observed matches
does not establish impossibility. Its zero-in-20,000 sample gives an approximate
95% upper probability bound of 0.015% for this fixed model.

Both skill totals can be high rolls in principle, but the evidence makes luck
alone a weak explanation for their simultaneous video values. No joint or
whole-rotation probability was estimated. UF's many hits substantially narrow
its distribution despite the smaller percentage discrepancy. Remaining build
and buff-coverage discrepancies warrant investigation.

The video and simulator agree on all **155 Unfading Flower projectile hits** and **12 Forsaken Fame hits**. Two differences in boost handling are supported by the recovered game records. First, both skills have a target-specific damage multiplier that the simulator currently puts in an additive pool. Second, Forsaken Fame has the raw hit tag checked by Jadebreak's 30% bonus, but the simulator gives FF none of that bonus. Neither finding requires changing a hit count, a base coefficient, or the rotation.

| 60-second DPS               |  Video | Current simulator | Target multiplier corrected | Also grant FF Jadebreak +30% | Also grant its conditional +10% |
| --------------------------- | -----: | ----------------: | --------------------------: | ---------------------------: | ------------------------------: |
| Unfading Flower projectiles | 57,766 |            50,505 |                      54,059 |                       54,059 |                          54,059 |
| Forsaken Fame               | 12,328 |             7,355 |                       7,907 |                        9,280 |                           9,737 |

The last column is a sensitivity case: it assumes the additional Jadebreak target condition passes on this dummy. The two video skill rows together exceed the current simulation by **12,235 DPS**. The target-factor change explains **4,108 DPS**. Correcting FF's 30% Jadebreak eligibility explains another **1,373 DPS**; the additional 10% would explain **458 DPS** more. Even in that last case, UF remains **3,707 DPS** below the video and FF **2,591 DPS** below it. These are isolated diagnostic reruns; the production definitions were not changed for this report.

## Comparison setup

- Saved **Grounded Dummy 1 Min BP**, 60s, 40 ms, attacking level 96 dummy, finite Vitality, BT18. Six UF activations; their separate Heavy Attack damage is excluded. Every FF hit uses the cancel variant. It has the same damage action and intrinsic bonus as full FF.
- Reconstructed **Fully Relayed Max BP Mystic with Mistwillow four-piece**, retaining the preset's Blossom Barrage, Star Reacher, Morale Chant and Breaking Point T6. Fire Divinecraft is inherited from the comparison fixture. No Boss Talent or party debuffs. Wraithstrike and physical attack food are included.
- The screenshot is pre-buff. Physical attack 1,486–4,032 becomes **1,626–4,312** with food. Attribute attack 386–747 is assigned to Silkbind. Physical/Silkbind penetration 56.3/23.6; physical/Silkbind damage bonus 0%/11.8%; crit/affinity damage bonus 50%/35%. Raw precision/crit/affinity 129.9%/143.0%/19.1%, direct crit 13.3%, direct affinity 0%. The reconstructed final crit/affinity split is **89.68%/10.32%** before conditional hit effects.
- All Martial Arts 6.8%, boss-unit damage 7.1%, all Mystic damage 21.4%. The separate **7.1% specified weapon** and **28% specified skill** have no visible names in the screenshot. Baseline assumption: Art of Umbrella and Vernal Frequent Projectile. Neither UF nor FF has the Mystic tag, so neither directly receives the 21.4% Mystic boost. The boss-unit stat and the disabled Boss Talent are distinct.
- Each comparison rebuilt the full timeline through the calculator, checked both hit counts, and summed accepted damage actions. Coverage below is measured **at each hit**, not from cast-start buffs. DPS uses the full 60-second denominator.

## Source reconciliation

**1. NPC bonus magnitude matches; placement does not.** The Global Normal and Grey hit records have selector 8 target corrections of **0.15** on UF calcpoints **2060110301/02** and **0.45** on FF calcpoint **2030211101**. Selector 8 is the non-player/non-AI-avatar route; this comparison treats the attacking dummy as eligible. The recovered ordinary-damage consumer multiplies the combined hit by `1 + TARGET_TAG_CORRECT`. In the calculator the same percentages are unconditional `hpDMGBonus` modifiers in Category 1. With other bonuses present, that understates the eligible hit and loses the target predicate. The diagnostic **removed** the old modifier before scaling the complete hit by 1.15 or 1.45. It did not add a second bonus, scale just the attack coefficient, or claim a verified per-hit rounding match. The recovered consumer proof specifically covers ordinary-damage formula branches; validating critical and affinity branches against live hits remains useful. [Hit records](../../where-datas-mine-internal/site/public/data/processed-hit-records.json) · [Formula consumer evidence](../../where-datas-mine-internal/notes/skill-hit-scaling-evidence.md) · [Current damage formula](../src/calculations/damage.ts)

The rank-100 skill curves used for these BT18 gear-tier-100 presets match the source: both UF shots use **0.51082875** physical and attribute coefficients, with **141.375 / 77** flat bonuses; FF uses **1.9044** with **527 / 287**. UF's pair is two 0.125-ratio calcpoints, not one extra 0.25-ratio hit. In the recovered Normal hit table, **2030211101 is the only record explicitly attributed to display skill 20302111 (FF)**. That gives no affirmative evidence for folding another named skill's damage into FF, although it does not prove every live scoreboard attribution path. [Skill curve export](../local/datamine/2026-10-28_08-11-44-968_+0000-csrGfl/wwm-skills-normal-all.json) · [UF definition](../data/skill/vernal-umbrella.json) · [FF definition](../data/skill/inkwell-fan.json)

**2. Jadebreak and Combo use different raw tags.** Jadebreak passive **4313011** grants 30% on selector 26, hit tag **1005**. Its secondary passive **4313012** grants 10%, lists **1005/1012**, and has the additional target condition **[12,3]**. Upgraded Combo **102304211** checks **1006**, with a source/target ownership condition. Both UF calcpoints have **1005 and 1006**. FF has **1003, 1005, 1099**, and lacks 1006. The model's shared `Ballistic` gate correctly lets UF receive both bonuses but wrongly excludes FF from the 30% Jadebreak branch. Conversely, globally tagging FF as Ballistic would also give it Combo, which the raw filter does not support. Separate the two eligibility checks. Verify the secondary target condition before granting 40% by default; the current model also omits that predicate for UF. [Normal passive records](../../where-datas-mine-internal/site/public/data/gameplay/buff_passive_data/index.json) · [Jadebreak](../data/buff/silkbind-jade.json) · [Combo](../data/debuff/silkbind-jade.json)

**3. Earlier audit findings that should not be reapplied.** The current T6 Combo bonus is **20% total**, and ordinary Lingering Bone Star Reacher gives **7.5% physical attack**, not the obsolete additive 30% and 12.5% totals. The grounded enhanced Bone branch is **15% physical attack**; the **25%** enhanced branch belongs to airborne targets. Star Reacher T6's damage condition is Airborne **or** caster-owned Lingering Bone, with self HP above 75%. UF now checks each shot before firing. The hit-count evidence gives no reason to increase its coefficient. The precise Star Reacher grant dispatch/refresh timing remains a separate in-game validation question. [Historical audit](jade-combat-audit.json) · [Datamine review, J01–J05](../../where-datas-mine-internal/reports/jade-combat-audit-review.html) · [Star Reacher rules](../data/innerway/star-reacher.json)

## Which boosts actually reach the two hits?

| Boost                            | UF, 155 hits                                                                                                                                    | FF, 12 hits                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Jadebreak                        | Active and eligible on 143; current model applies 30% + 10%                                                                                     | Active on 9, applied on **0**; source supports at least the 30% hit-tag branch on those 9                                             |
| Combo / Blossom Barrage          | Combo on all 155. T4 adds 5% against Combo, plus another 5% on the 70 exhausted hits                                                            | Combo present on all 12, but **0 eligible**; FF also lacks either T4 calcpoint                                                        |
| Mistwillow four-piece            | Active on all 155; matching physical and Silkbind damage channels gain 10%                                                                      | Active on all 12; the same channels gain 10%. No evidence for a second simultaneous 10% from the lesser set states                    |
| Star Reacher                     | Ordinary Bone on 82, enhanced Bone on 71, neither on 2. Target has Lingering Bone on 153                                                        | Ordinary on 6, enhanced on 5, neither on 1. Target has Bone on 11; applying it on the first hit does not retroactively boost that hit |
| Startling Spring                 | Present on 92 but **0 eligible**: UF is not charged                                                                                             | FF is charged. 3 hits at zero stacks, 4 at three and 5 at five; 4% charged damage per stack                                           |
| Breaking Point / Disintegration  | Active on 96, including 91 at five stacks                                                                                                       | Active on 6, all at five stacks. At five stacks it grants 25 physical penetration and 25 percentage points of crit damage             |
| Wraithstrike / Exhausted         | 102 below 40% Qi for Wraithstrike; 70 actually Exhausted for the separate 10% damage-taken effect                                               | 6 below 40% Qi; 5 Exhausted. Wraithstrike gives 10 percentage points of **critical damage**, not 10% to every hit                     |
| Ghostly Step / Mystery DMG Boost | The 15% damage buff is present on 75                                                                                                            | Present on 3                                                                                                                          |
| Morale Chant / Yi River          | Active on all 155                                                                                                                               | Active on all 12. Its separate triggered damage is not included in these two skill rows                                               |
| Sheet bonuses                    | The assumed 28% frequent-projectile attunement and 7.1% Umbrella art match. Both skills receive 6.8% All Martial Arts and 7.1% boss-unit damage | Neither assumed named boost matches FF. The charged-Fan attunement would match if equipped                                            |

Mistwillow's physical/Silkbind attack-channel boosts, Star Reacher's physical attack stat, Wraithstrike's crit damage, Category 1 bonuses, attunement, and Exhausted's global factor are not interchangeable percentages. [Mistwillow source evidence](../../where-datas-mine-internal/notes/strayhunt.md) · [Mistwillow and Yi River](../data/buff/general.json) · [Wraithstrike](../data/script.json) · [Blossom Barrage](../data/innerway/blossom-barrage.json) · [Attunement filters](../data/attunement.json)

## Sensitivity of the live boost windows

The entries below are **DPS lost when the named contribution is removed**, holding both hit counts constant. They are measured against the current simulator, before the two proposed corrections. They overlap and must not be summed.

| Removed contribution                       | UF DPS lost | FF DPS lost |
| ------------------------------------------ | ----------: | ----------: |
| Assumed 28% UF attunement                  |      11,048 |           0 |
| Jadebreak damage effects                   |       8,573 |           0 |
| Disintegration penetration and crit damage |       5,530 |         771 |
| Mistwillow damage effects                  |       4,489 |         653 |
| Ordinary/enhanced Bone physical attack     |       4,190 |         577 |
| Current intrinsic NPC damage modifier      |       3,496 |       1,901 |
| Exhausted damage-taken bonus only          |       2,405 |         334 |
| Mystery DMG Boost                          |       1,609 |         129 |
| Wraithstrike                               |       1,495 |         206 |
| Startling Spring damage effect             |           0 |         124 |

The unnamed boosts matter, but shifting them trades one shortfall for another. Moving the full 28% from UF to charged Fan yields **39,457 UF / 9,414 FF DPS** under current rules. Moving just the 7.1% weapon art from Umbrella to Fan gives **48,850 / 7,654**. With the target corrections and both tested FF Jadebreak bonuses, a 14%/14% attunement split gives **48,147 / 11,100**, still below **57,766 / 12,328** in the video.

## Hit evidence for a video comparison

| UF activation | Projectiles | Jadebreak-covered | Exhausted | Simulated damage |
| ------------- | ----------: | ----------------: | --------: | ---------------: |
| 1             |          20 |                20 |         0 |          365,277 |
| 2             |          23 |                23 |         6 |          429,101 |
| 3             |          29 |                29 |        26 |          675,003 |
| 4             |          20 |                20 |         0 |          337,019 |
| 5             |          20 |                18 |         0 |          310,599 |
| 6             |          43 |                33 |        38 |          913,278 |

The FF ledger below gives the damage expected at each **impact**, not a prediction of an individual crit. The sensitivity column includes the separate target factor and assumes both FF Jadebreak branches qualify when the buff is active.

| FF time (s) | Jadebreak | Startling Spring stacks | Exhausted | Current expected damage | With both corrections |
| ----------: | --------- | ----------------------: | --------- | ----------------------: | --------------------: |
|       4.959 | yes       |                       0 | no        |                  26,303 |                36,972 |
|      21.754 | yes       |                       0 | yes       |                  43,472 |                61,163 |
|      23.284 | yes       |                       0 | yes       |                  43,472 |                61,163 |
|      32.389 | yes       |                       3 | no        |                  32,304 |                45,592 |
|      33.919 | yes       |                       3 | no        |                  32,304 |                45,592 |
|      35.449 | yes       |                       3 | no        |                  32,304 |                45,592 |
|      40.674 | no        |                       3 | no        |                  29,719 |                31,844 |
|      43.708 | yes       |                       5 | no        |                  31,445 |                44,273 |
|      50.863 | yes       |                       5 | yes       |                  44,505 |                62,661 |
|      53.543 | yes       |                       5 | yes       |                  44,505 |                62,661 |
|      56.370 | no        |                       5 | yes       |                  44,505 |                47,688 |
|      57.900 | no        |                       5 | no        |                  36,431 |                39,037 |

## What to verify next

1. **Test FF with and without Jadebreak**, keeping Combo, target, stats, exhaustion, attack outcome and target distance matched. The raw 1005 and 1006 filters predict that enabling Jadebreak increases FF while enabling Combo alone does not. Compare the same test on a dummy and an ordinary NPC to resolve the secondary 10% target condition.
2. **Check the expanded names of the 28% skill and 7.1% weapon boosts.** Then trace two identifiable FF hits in the video: the **first** (no Startling Spring, Disintegration or prior Bone grant) and one around **50.863–56.370s** (five SS stacks, five Disintegration stacks). Individual crit/affinity labels and active effects distinguish a missing FF bonus from a different combat state.
3. **Compare the rest of the gap after fixing known mechanics.** On current rules, forcing the highest modeled attack/outcome on each of the 12 FF hits gives **620,407** damage, below the recorded **739,717**. With both candidate corrections, that fixed-state ceiling rises to **821,301**, so the same observation no longer rules out a high roll by itself. In a seeded check of 2,500 runs sampling only these hits on the corrected fixed timeline, the 99th percentiles were **3,372,088 UF** and **668,123 FF** versus video totals **3,466,002** and **739,717**. Neither observed total was reached. This is a conditional roll check with fixed buff timing and assumed boost identities, not a probability for the live player's build.

The strongest implementation candidates are the eligible-target multiplier on both skills and the distinct Jadebreak/Combo hit filters on FF. The additional 10% target condition, the names of the two sheet boosts, and live buff coverage should remain explicit verification items. No unexplained remainder was fitted to a coefficient.
