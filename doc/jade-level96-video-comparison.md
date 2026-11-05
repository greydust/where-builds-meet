# BT18 Jade character against the BT17 / level-96 target

The user requested restoring the 155-hit implementation used by this comparison.
The later [drain experiment](jade-uf-volley-drain-results.md) has been reverted;
its source findings remain relevant to further investigation.

This corrects the target mismatch in the preceding video comparisons. The
character remains BT18, with rank-14 martial-art talents and tier-100 gear.
Only target defenses and target Judgement Resistance change. The BT17 target
profile supplies **408 defense**, **65% Judgement Resistance**, and zero base
physical/attribute resistance. The previous calculations used BT18's 500/85%
profile even though `data/breakthrough.json` incorrectly labels that target 96.
The user identifies the BT18 target as level 100.

The screenshot inputs, Mistwillow, physical food, Wraithstrike, no Boss Talent,
Inner Ways, rotation and all accepted FF/UF fixes are unchanged. The base and
per-hit stat pipelines recalculate outcomes against 65% Judgement Resistance.
Final critical/affinity probabilities become **88.424242% / 11.575758%**, with
100% precision. The changed split matters because affinity uses maximum attack.
The lower crit probability does not imply lower expected damage overall.

| Skill         | Previous wrong-target DPS | Correct target DPS |  Video DPS | Remaining shortfall |
| ------------- | ------------------------: | -----------------: | ---------: | ------------------: |
| UF            |                54,059.472 |         55,195.892 | 57,766.700 |           2,570.808 |
| FF            |                10,463.177 |         10,711.057 | 12,328.617 |           1,617.560 |
| Spring Sorrow |                 7,305.909 |          7,466.298 |  8,150.167 |             683.869 |
| Soaring Spin  |                 5,564.786 |          5,702.741 |  6,778.067 |           1,075.326 |
| Full rotation |                92,795.591 |         94,875.073 |    100,585 |           5,709.927 |

Video skill DPS uses the exact displayed damage totals divided by 60. All four
hit counts remain 155 / 12 / 8 / 6. The corrected target explains **2,079.482
DPS** of the former 7,789.409 gap. The remaining total needs a **6.018%** uplift
above expectation to match the video's overall DPS.

The current calculation still assumes the unnamed 28% skill bonus is Vernal
frequent-projectile attunement and the unnamed 7.1% weapon bonus is Umbrella.
Those identities and any live buff-window differences remain unverified.

The subsequent [independent review](../../where-datas-mine-internal/reports/jade-ff-uf-review.html)
confirms the historical per-hit arithmetic, but flags the grounded UF
five-Blossom-per-shot payment as an unsupported substitution for a source-backed
timed base drain. The enhanced drain and tick phase remain unresolved. Therefore
the odds below remain conditional on an unvalidated resource/buff timeline,
even after correcting the target. The review's own numerical totals refer to
the older 500-defense export, not this 408-defense rerun.

## Corrected high-roll sample

The shared calculator sampled the full 328-damage-entry sequence 10,000 times
using seed 9618005. The timeline was rebuilt against the corrected target first;
timing, buff states and hit counts then remained fixed while outcomes and attack
ranges were sampled. Total damage includes the existing aggregate Mystic Vitality
penalty; individual skill rows follow the simulator's unscaled grouping convention.

| Threshold                                    | Runs at or above video | Observed proportion |
| -------------------------------------------- | ---------------------: | ------------------: |
| Full rotation, at least 100,585 DPS          |             1 / 10,000 |               0.01% |
| UF, at least 3,466,002 damage                |            33 / 10,000 |               0.33% |
| FF, at least 739,717 damage                  |            46 / 10,000 |               0.46% |
| Spring Sorrow, at least 489,010 damage       |         1,093 / 10,000 |              10.93% |
| Soaring Spin, at least 406,684 damage        |           146 / 10,000 |               1.46% |
| All four visible skill totals simultaneously |             0 / 10,000 | No observed matches |

The sampled mean was 94,880.293 DPS, close to the analytical expectation of
94,875.073. Total-DPS 99th and 99.9th percentiles were 98,210.040 and 99,318.411.
The best sampled run reached 100,980.060 DPS. Thus the total video DPS is
possible under this model, but one observed exceedance does not provide a
precise probability estimate. It should not be presented as an established
one-in-10,000 game probability. Zero matches for all four skill thresholds
likewise does not imply impossibility; the approximate 95% upper bound from
this sample is 0.03% under the fixed model.

The corrected target makes each video skill value more plausible. It does not
fully explain the comparison. Shared-roll behavior, buff timing, unidentified
bonuses and screenshot/food interpretation could still affect the conclusion.
No product of marginal probabilities is used to estimate the joint probability.

[Detailed current results](jade-level96-video-results.json) preserve the target,
resolved character sheet, every grouped skill result and sample statistics.
The sampling probe passed. Formatting checks passed. This investigation changes
documentation only, not combat data, builds, rotations or accepted DPS snapshots.
