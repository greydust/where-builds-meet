# Bolt · Hawkwing 鳴戈 damage audit at Solo 25

The third and fourth video detonations each add **437,133** to the skill meter. The calculator gives **502,999.38** for each, an excess of **65,866.38 (+15.07% relative to the video)**. Matching the video requires a 13.09% reduction from the simulated value. The near-1.15 ratio alone does not identify a 15% buff. [Video counter observations](bolt-video-damage-increments.md) · [Full numerical trace for the four hits](bolt-hawkwing-mingge-trace.json)

## Inputs

Dummy 1 Min, BT25, rank-21 spears, supplied tier-115 gear including maximum Formless Attack on both spears, **four-piece Hawkwing**, four T6 Inner Ways (神斷青鋒, 浮梁一夜, 明非通判, 月湧方圓), BT25 Food (+240–480 effective Physical Attack), Fire Divinecraft. Clearfall is modeled as its fully stacked +10 percentage points of Affinity damage throughout. The video does not establish its stack count at each hit. The modeled target has 687 Physical Defense, 25 Physical Resistance, 30 resistance to each attribute and 180% Judgement Resistance. The JSON includes the eight exact gear records, character stats, target, setup and settlement inputs.

## Four settlements

Times use battle start. Video timestamps use the clip clock. The meter exposes the first two 鳴戈 only as a combined total.

| Hit     | Battle s |    Modeled Qi |   Physical | Bellstrike |        Sim total | Video comparison                                        |
| ------- | -------: | ------------: | ---------: | ---------: | ---------------: | ------------------------------------------------------- |
| 1       |   12.274 |        59.99% | 399,531.10 | 106,927.69 |       506,458.80 | First two combined                                      |
| 2       |   31.443 | 0%, Exhausted | 439,484.22 | 117,620.46 |       557,104.68 | 1,063,563.47 simulated vs 912,103 observed for hits 1–2 |
| 3       |   41.053 |          100% | 396,802.07 | 106,197.31 |       502,999.38 | 437,133                                                 |
| 4       |   58.897 |        39.99% | 396,802.07 | 106,197.31 |       502,999.38 | 437,133                                                 |
| **All** |          |               |            |            | **2,069,562.23** | **1,786,369**                                           |

All four modeled hits settle at 15 載戈 stacks, five 通判 stacks, effectively five Hawkwing stacks and guaranteed Affinity. The first pair has an additional 0.020 in Category 1 relative to the late pair. The second hit also has the 1.10 Exhausted multiplier. Both late hits settle outside Exhausted. Clearfall has no Qi threshold. The third and fourth differ by less than 0.001 simulated damage because the expected Hawkwing stack counts differ slightly.

## Reconstructing the third hit

| Factor                  | Value and origin                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attack roll             | 浮梁一夜 T6 forces Affinity, which selects maximum attack. Physical **7,599.644**, Bellstrike **1,404.2**, including 277.2 Formless Attack. These are effective maxima before Hawkwing.                                         |
| Hawkwing attack scaling | 4.999999955 expected stacks × 1.8% gives effectively **1.09** on each attack input. Physical defense is subtracted after this multiplication.                                                                                   |
| Coefficients            | Calcpoint 2020420501 uses 1.8 Physical and 1.8 attribute. Handler 32250271 adds 5% to each coefficient, producing **1.89**. Both flat terms are zero.                                                                           |
| Penetration             | 通判 contributes **20** to both channels (5 unconditional + 5 ordinary stacks + 10 series increment). Physical penetration exceeds resistance by 72.6, giving **1.363**. Bellstrike exceeds resistance by 20, giving **1.100**. |
| Channel bonuses         | Physical **1.285** = 1 + 0.025 sheet + 0.08 泉威 + 0.06 泉威 series + 0.12 blue talent. Bellstrike **1.41** replaces the 0.025 sheet bonus with 0.15. Bellstrike also receives the **1.5** main-path factor.                    |
| Category 1              | **2.908** = 1 + 0.118 boss + 0.113 spear + 0.112 all martial arts + 1.50 載戈 + 0.05 月引 + 0.015 other unconditional HP damage. The recorded 明法 buff is gated to primary Blue VC.                                            |
| Other shared factors    | **1.30** T6 鋒銳 event-34 ratio × **1.60** NPC correction × **1.424** VC attunement (four 10.6% rolls). Including Category 1, the shared product is **8.61326336**.                                                             |
| Affinity outcome        | **1.832** = 1 + 0.402 sheet + 0.18 red maximum-Physical talent + 0.10 鋒銳 + 0.05 神斷 + 0.10 Clearfall. The hit has Affinity probability 1.                                                                                    |

Physical = (7,599.644 × 1.09 − 687) × 1.89 × 1.363 × 1.285 × 8.61326336 × 1.832 = **396,802.07**.

Bellstrike = 1,404.2 × 1.09 × 1.89 × 1.100 × 1.41 × 1.5 × 8.61326336 × 1.832 = **106,197.31**.

The two channels sum to **502,999.38**. The trace retains unrounded multipliers. I independently reconstructed the Physical and Bellstrike components for all four hits from those factors and checked each against the production settlement to within 0.000001 damage.

## Where the discrepancy could enter

These are sensitivity calculations on hit three. Each changes one input while holding the other inputs fixed. They are diagnostic values, not proposed changes to native mechanics.

| Single change                                   | Late 鳴戈 | Difference vs 437,133 |
| ----------------------------------------------- | --------: | --------------------: |
| Full modeled setup                              |   502,999 |               +65,866 |
| 12 載戈 stacks instead of 15                    |   451,108 |               +13,975 |
| 11 載戈 stacks instead of 15                    |   433,811 |                −3,322 |
| Zero Hawkwing stacks instead of five            |   458,504 |               +21,371 |
| Zero Clearfall stacks instead of ten            |   475,543 |               +38,410 |
| 1.15 鋒銳 factor instead of the audited T6 1.30 |   444,961 |                +7,828 |

Each 載戈 stack is worth **17,297.09** on this hit. The observed damage falls between 11 and 12 stacks, so changing the integer stack count alone cannot reproduce it exactly. Even removing the entire Hawkwing attack buff or the entire Clearfall bonus individually leaves the modeled hit high. Changing the coefficient alone would require **1.64251** on both channels versus the source-backed **1.89**.

For the next native comparison, the most discriminating observations are the caster-owned 載戈 count at each detonation, the character's effective maximum Physical and Bellstrike attack with the stated food and gear, and the native attack values immediately after Hawkwing is applied. For an eligibility audit, compare the actual target's correction and specific-skill attunement denominator, the 1.30 event-34 handler and the blue-talent/泉威 channel adjustments individually. The meter gives one combined number per late hit. It cannot recover separate physical and attribute damage or identify a unique erroneous multiplier.

[Proc definition](../../data/skill/boshan-quyue-spear.json) · [Hawkwing set](../../data/gear-set.json) · [Hawkwing tracker](../../src/calculations/hawkwing.ts) · [Settlement formula](../../src/calculations/damage.ts) · [Previous native coefficient and stack audit](bolt-solo25-proc-calculation.md)
