# Unfading Flower per-hit damage audit

**Grounded Dummy 1 Min, BT18, 5 November 2026.** The simulator credits 149 UF projectiles with **2,770,050.88 damage** (46,167.51 DPS). The runner recorded **2,898,151** from 149 attempts (48,302 DPS displayed). The difference is **128,100.12**, or **4.62%** above the model. Equal totals of attempts establish a count match. The video provides 149 individual UF meter increases. One exceeds the modeled maximum for its cast.

[149-hit calculation ledger (CSV)](jade-grounded-bt18-149-uf.csv) · [Exact rotation, resolved sheet, enemy, source rows and input hashes (JSON)](jade-grounded-bt18-149-uf-inputs.json)

## Comparison setup

Use Grounded Dummy 1 Min with the Q / Heavy / two-hit Light / Q opener, the fourth-UF Qi break, a passive dummy, and a 60s window anchored to the first Umbrella Q impact. The assumed runner build is Fully Relayed Max BP Mystic with its Rain Whisper set replaced by four-piece Mistwillow. All gear affixes, attunements and T6 Inner Ways come from the Mystic preset. The sim uses tier-100 gear, rank-14 martial-art talents, Clay Oven Flatbread, Fire Divinecraft and Wraithstrike. The BT18 target profile has 500 defense, zero starting channel resistances, and 85% Judgement Resistance. Its stored level label is 96. Level 100 was reported for the run; the runner's exact sheet, target defenses and live buff history were not supplied. The modeled rotation includes 12 FF hits versus the runner's 11; the identity and timing of the missed FF are unknown and could affect Bone coverage.

Only the scoreboard category **Unfading Flower** is included. The UF activation Heavy Attack and damage that other effects trigger have separate categories. The expected projectile mean is **18,590.95** versus **19,450.68** observed. The whole modeled rotation gives 80,301.89 DPS.

## The seven UF windows

Times are seconds from battle start. Contacts in the ledger are sequential simulation events; shots sharing a timestamp each have their own row. The ledger numbers shots in simulator order without assigning a native calcpoint identity to each shot.

| UF cast | Cast starts | First-last impact | Hits | While Exhausted | Expected UF damage |
| ------: | ----------: | ----------------: | ---: | --------------: | -----------------: |
|       1 |       2.615 |       3.765-8.915 |   20 |               0 |          317,378.3 |
|       2 |      11.393 |     12.543-17.193 |   20 |               0 |          325,907.2 |
|       3 |      19.564 |     20.714-25.364 |   20 |               0 |          339,767.0 |
|       4 |      27.735 |     28.885-39.385 |   43 |              38 |        1,021,930.5 |
|       5 |      40.587 |     41.737-44.737 |   13 |               0 |          229,862.0 |
|       6 |      47.108 |     48.258-52.908 |   20 |               0 |          324,367.2 |
|       7 |      54.109 |     55.259-58.259 |   13 |               0 |          210,838.7 |

**38 hits during Exhausted** contribute 921,062.29; the other 111 contribute 1,848,988.59. This split describes modeled timing; the screenshot has no corresponding split.

## Live footage comparison, 6 November 2026

The supplied clip `pp02yqUYGv3KMYCbSoTPVA.mp4` shows the cumulative Unfading Flower counter in the upper left. The seven source frames listed below fall on plateaus between casts or after the last volley. Subtracting successive readings gives damage for each live window. These are file timestamps; the training timer first appears around 00:02.2. The final reading agrees exactly with the results screen.

|  UF | Video timestamp | Live cumulative UF | Live window | Simulated window | Live minus sim |
| --: | --------------: | -----------------: | ----------: | ---------------: | -------------: |
|   1 |         00:13.5 |            332,638 |     332,638 |          317,378 |        +15,260 |
|   2 |         00:22.0 |            668,298 |     335,660 |          325,907 |         +9,753 |
|   3 |         00:31.0 |          1,043,452 |     375,154 |          339,767 |        +35,387 |
|   4 |         00:44.0 |          2,094,951 |   1,051,499 |        1,021,931 |        +29,568 |
|   5 |         00:50.0 |          2,352,942 |     257,991 |          229,862 |        +28,129 |
|   6 |         00:58.0 |          2,694,748 |     341,806 |          324,367 |        +17,439 |
|   7 |         01:02.5 |          2,898,151 |     203,403 |          210,839 |         -7,436 |

The lead is already 60,399 damage (47% of the final gap) at the end of UF three. UF four contributes 29,568 (23%), and UF five contributes 28,129 despite being a partial refill. UF seven finishes 7,436 below the model. The frame audit below resolves the projectile counts for each cast.

The target HUD identifies a level-100 Sword Trial Boss. Near video 00:32.2 the Qi bar has a sliver remaining; by about 00:32.6 it has switched to its depleted/recovery display. The fight clock reads about 30 seconds remaining. That places the visible break around 30s into combat, roughly two seconds later than the modeled 28.33s. HUD timing and the displayed countdown do not identify the exact server event or the projectile that caused it.

At video 00:39.0 the HUD shows an insufficient-Vitality warning. Poet has already reached its final 242,579 damage on the live meter. The warning shows an attempted input during UF four; it does not identify the rejected skill. The final FF counter increases from 470,622 after UF six to 505,155 during UF seven. This is consistent with the runner's reported missed FF in the final window, where the preset schedules two. The HUD can batch damage, so the counter alone does not identify a particular cancel.

### Frame-by-frame damage limits

The [live hit ledger](jade-grounded-bt18-149-uf-live-hits.csv) lists the first video frame displaying each new UF total, its file timestamp, the difference from the preceding total, and compatible modeled outcomes. I followed the named UF row through its change of position on the HUD. Its 149 distinct increases reconcile to the final 149 attempts and 2,898,151 damage. The amounts are manual readings of compressed video frames. A timestamp marks a HUD update and can lag contact.

**148 of 149 increases fit at least one modeled state in the corresponding cast.** Hit 49, the eighth hit of UF three, is the exception. At 25.716 seconds the meter advances from 801,322 to 826,828, an increase of **25,506**. Even the highest critical roll among all 20 modeled hits of UF three reaches only **24,313.04**. The live hit exceeds that ceiling by **1,192.96 (4.91%)**, several seconds before the visible Qi break.

| UF cast | Live hits | Modeled hits |
| ------: | --------: | -----------: |
|       1 |        21 |           20 |
|       2 |        20 |           20 |
|       3 |        20 |           20 |
|       4 |        42 |           43 |
|       5 |        14 |           13 |
|       6 |        20 |           20 |
|       7 |        12 |           13 |

For each modeled projectile, evaluate the two damage channels shown below at minimum and maximum attack. Use that interval for normal damage, scale both endpoints by the critical multiplier for critical damage, and evaluate affinity at maximum attack with its affinity multiplier. Compare each live increase with the union of these outcomes across the same cast, allowing one damage point for integer display rounding. The CSV gives the outer cast bounds and the outcomes that actually passed this check. A passing hit may fit only some of the cast's buff states. The recording does not independently identify its exact attack roll or buff stack.

UF three makes the cleanest comparison. Both sides land 20 hits, yet the live cast averages 18,757.70 damage against about 16,988 modeled. Its excess of 35,387 includes variation on the other 19 hits. The single ceiling violation establishes a discrepancy under the assumed build, but does not distinguish stronger live stats from a buff or coefficient difference.

### Supreme and the pre-break Qi threshold

The ledgers above preserve the original comparison, in which every UF3 projectile saw 39.99% target Qi. Star Reacher tier 3 selects Supreme when an eligible grant occurs while the target is Exhausted or strictly below 30% Qi. Grounded Lingering Bone grants 15% physical attack in this state (ordinary 7.5%); the airborne route grants 25%. Tier 4 extends the buff to 12 seconds. The grant has a shared one-second cooldown.

At video 25.716s, the target Qi bar fills approximately 159 of 684 pixels (23%). The clip also shows the grounded Supreme popup during UF3. Substituting Supreme alone raises the original UF3 critical ceiling from 24,313 to 25,677. The Grounded Dummy 1 Min preset now includes the missing pre-break 30% crossing at 19.832s on its own clock, using the same linear decline toward its fourth-UF break as its existing 60% and 40% events.

## From datamine row to one projectile

| Native field or record                                                  |                         Value | Simulator treatment                                                                              |
| ----------------------------------------------------------------------- | ----------------------------: | ------------------------------------------------------------------------------------------------ |
| Rank-100 numerical row 20601103100, physical and attribute power        |                  4.08663 each | Multiply by the individual calcpoint ratio.                                                      |
| Same row, physical / main-attribute flat attack                         |                    1131 / 616 | Apply the same per-projectile ratio to each.                                                     |
| Calcpoints 2060110301 and 2060110302, numerical skill / reporting owner |                      20601103 | Both carry ratio 0.125; each admitted shot contributes one damage event.                         |
| Per-hit coefficients and flats                                          | 0.51082875 each; 141.375 / 77 | Products above, before the martial-art talent.                                                   |
| Rank-14 flat-bonus effect                                               |                        1.0725 | Effective flats become 151.6246875 / 82.5825. Coefficients stay 0.51082875.                      |
| Target correction on each calcpoint                                     |             selector 8, +0.15 | The sim treats this dummy as eligible and applies 1.15 once to both channels.                    |
| Matching frequent-projectile attunement on this sheet                   |                          +28% | One factor of 1.28. UF is Martial Arts and Ballistic; All Mystic damage does not enter this hit. |

The inputs JSON contains the three extracted rows with their native fields, snapshot ID, packet locations and row hashes. They were taken from the retained source review. That evidence directly supports the curve, ratio, ownership and target-correction fields. The earlier independent review used a **different 155-hit rotation and sheet**. Its live comparison totals do not apply here. [Source review evidence](../../where-datas-mine-internal/reports/jade-ff-uf-review-evidence.json) · [Hit-scaling consumer evidence](../../where-datas-mine-internal/notes/skill-hit-scaling-evidence.md)

## Which effects change the hit

| Ledger factor                              | Observed across the 149 hits | What to check against the source or combat log                                                                                                                                                                                                                        |
| ------------------------------------------ | ---------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical attack multiplier                 |                 1.00 to 1.15 | Star Reacher's grounded Bone grants change the Physical attack range. Compare the buff at impact, especially around the missed FF.                                                                                                                                    |
| Physical penetration factor                |             1.3265 to 1.4815 | Yi River and Disintegration stacks change penetration. Resistance ignore enters the opposing resistance term.                                                                                                                                                         |
| Category 1 bonus                           |           0.89368 to 1.02368 | The fixed boss, Martial Arts and weapon-art portions sum to 0.20868. The ledger's `innerWayDmgBonus` column includes other eligible effects, including Jadebreak, Combo, Blossom Barrage and Fire. The name is an internal bucket and includes non-Inner-Way effects. |
| Physical / Silkbind channel damage factors |        1.10 / 1.218 on hit 1 | Mistwillow affects both channels. The main-path factor of 1.5 is separate and applies only to Silkbind.                                                                                                                                                               |
| Critical outcome multiplier                |                 1.86 to 2.21 | Check the Umbrella talent, Disintegration stacks and the Wraithstrike threshold. Affinity uses maximum attack and its own 1.35 multiplier.                                                                                                                            |
| Global damage factor                       |                 1.00 to 1.10 | Check target Exhausted at projectile contact; compare its flag and the Qi fraction independently.                                                                                                                                                                     |

For a discrepant hit, first match its cast, time, outcome and marks, then compare its attack range and multipliers. A higher crit result can come from a higher Physical attack roll even with identical buffs. [Skill and talent definitions](../data/skill/vernal-umbrella.json) · [Star Reacher](../data/innerway/star-reacher.json) · [Blossom Barrage](../data/innerway/blossom-barrage.json) · [Mistwillow](../data/gear-set.json) · [Wraithstrike](../data/script.json) · [Damage implementation](../src/calculations/damage.ts)

## Replaying any ledger row

All rates and bonuses in the CSV are decimal ratios. Fields ending in `Multiplier` and the two `SharedBonus` fields are **factors** (for example 1.10). The ledger's `pMin/pMax` and `sMin/sMax` already include applicable attack buffs. The two flat bonuses already include the rank talent.

1. Select the outcome. Use midpoint Physical and Silkbind attack for **expected normal** and **expected critical** damage. For **affinity**, use both maximum attacks. Abrasion probability is zero throughout this run. Live normal and critical attacks can roll within their ranges.
2. Calculate the shared Physical factor as `damageScale × (1 + baseDmgBonus) × (1 + damageBonusCategory1) × (1 + attunementBonus)`. Silkbind adds `attributeDmgBonus` inside the Category 1 bracket. Category 1 includes boss-unit, All Martial Arts, the eligible weapon-art stat and applicable damage effects. Mistwillow changes channel damage multipliers; Wraithstrike changes the critical multiplier below 40% target Qi.
3. Apply the channel equations below. Physical defense comes out before penetration. Penetration factors use `1 + (penetration − resistance)/200` for a nonnegative difference, otherwise divide by 100. Silkbind receives the 1.5 main-path factor once.
4. Weight each outcome by its row probability. Add expected Physical and expected Silkbind. Round for display only.

```text
M = 1 for normal, critMultiplier for critical, affinityMultiplier for affinity
physical = max(0, (coefficient × (P − adjustedEnemyDefense) + physicalBonus)
                  × physicalPenetrationMultiplier × physicalDamageMultiplier
                  × physicalSharedBonus × globalMultiplier × M)
silkbind = (attributeCoefficient × S + attributeBonus)
           × silkPen × silkBonus × pathMultiplier × attributeSharedBonus × globalMultiplier × M
expected = sum over outcomes of probability × (physical + silkbind)
```

### Worked first hit and two cross-checks

At **3.764841s**, hit 1 has Physical attack **1672.95408–4234.00944** and Silkbind **386.4–795.716**. The Physical and Silkbind penetration factors are **1.3265** and **1.118**. Mistwillow is active, with channel damage factors **1.10** and **1.218**. Category 1 is **0.89368** and the shared factor is **1.15 × 1.89368 × 1.28 = 2.78749696**. The normal, critical and affinity probabilities are **1.9043%, 87.7681%, 10.3276%**. Hit 1 uses outcome multipliers **1, 1.86, 1.35** respectively. The first three damage columns below are alternative outcome totals; the last three are probability-weighted.

| Hit |   Time |    Normal |  Critical |  Affinity | Expected Physical | Expected Silkbind | Expected total |
| --: | -----: | --------: | --------: | --------: | ----------------: | ----------------: | -------------: |
|   1 |  3.765 |  7,903.69 | 14,700.86 | 15,065.37 |         10,605.15 |          4,003.92 |  **14,609.07** |
|  61 | 28.885 | 10,406.46 | 21,957.64 | 19,891.51 |         16,252.93 |          5,271.35 |  **21,524.28** |
| 149 | 58.259 |  8,773.01 | 16,317.79 | 16,746.22 |         12,087.58 |          4,130.78 |  **16,218.36** |

A separate arithmetic replay from the ledger factors checked both channels and their total for **all 149 hits**. Largest absolute difference from the production action breakdown was **3.64e-12 damage**. This verifies the export and arithmetic; the runner's individual hits and native live multiplier order still require comparison.

## Where to compare the live run

- **First compare attack ranges and attunements.** The first ledger row gives a pre-exhaust reference. Check the runner's food-adjusted attacks, the named frequent-projectile boost and the weapon-art bonus before changing a coefficient.
- **Then align Qi, outcome and buff coverage.** Compare a pre-break hit, an exhausted hit and a post-recovery hit with the same outcome type. Each ledger row records the two channels, active stacks, Qi fraction, effective crit multiplier and exhausted flag. Use the UF Details view for the actual crit/affinity split; an expectation is not a prediction for one particular hit.
- **Separate contact cadence from damage per hit.** The source review now identifies a 10 Blossoms/s base drain and an extra five per grounded owned-Bone volley. The historical simulator representation and exact native depletion/contact ordering warrant a separate timeline audit. Matching 149 hits does not prove the same shots landed during Exhausted. [Source resource findings](../../where-datas-mine-internal/reports/jade-blossoms.md)
