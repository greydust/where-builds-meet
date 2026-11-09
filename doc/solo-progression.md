# Solo Level 20–25 progression

The selector supports 18–25. Existing 17–19 profiles, gear tiers,
presets, Inner Way bonuses, and martial-art ranks are preserved.

| Solo Level | Equipment | Enhancement | Martial-art rank | Level Precision | Each base attribute | Judgement Resistance |
| ---------- | --------- | ----------- | ---------------- | --------------- | ------------------- | -------------------- |
| 20         | 105       | 80          | 16               | 20.7%           | 192                 | 115%                 |
| 21         | 105       | 85          | 17               | 22.3%           | 208                 | 115%                 |
| 22         | 110       | 90          | 18               | 23.9%           | 224                 | 145%                 |
| 23         | 110       | 95          | 19               | 25.6%           | 242                 | 145%                 |
| 24         | 115       | 100         | 20               | 27.4%           | 262                 | 180%                 |
| 25         | 115       | 105         | 21               | 29.3%           | 282                 | 180%                 |

## Source and selection

The November 9, 2026 export is
`2026-11-09_03-40-17-988_+0000-rY5rT3`. Its CN manifest is
`94a090d784fc4f1d5dd479ee818d024d3da0c1e6889f89a236da94cdb28f09d9`;
the Global manifest is
`48ce04bade699fdbea157e4b5bb1b197ba14e421c31595ccb412d0ff029f23e9`.
The export stays under ignored `local/datamine/`; runtime data is in `data/`.

Player bonuses use the Normal Solo profile. Enhancement and Arsenal use
the complete exported Normal values. Character talents prefer the exported
Grey cumulative progression at the same level, then the stored Normal
progression when Grey is absent. Level 25 has a complete Normal talent row;
no lower-level talent fallback is used.

New profiles use the existing fixed Dummy: level 96, defense 500 and
zero channel resistance. Their `enemyProfileSource` records this choice.
Judgement Resistance uses the selected Solo Level's exported combat profile.
This is a progression comparison against that Dummy, not a claim about a
level-25 NPC's defense. The export has no Solo-24/25 enemy cap row.

## Gear and talents

Tier-115 items come from the export's complete CN catalog. The Global
tier-105/110 downloads omit some fields, weapon families and joins, so
original pinned CN `equip_items`, `equip_affix_config`, `equip_toning_group`,
and `equip_determin_group` tables supply complete 105/110 gear. Normal
records at their highest stored layer are used. The datamine project's item
processor interprets those records; no lower-tier base stats are substituted.

All presets have explicit 105/110/115 inventories. They preserve relative
roll quality, including the existing 0.94 relay multiplier. Relay-only
choices retain the established eligibility model and use the new tier's
original affix budgets. Attunements use their native maxima without the
relay multiplier:

| Tier | Physical Penetration | Formless Penetration | Armor damage attunement |
| ---- | -------------------- | -------------------- | ----------------------- |
| 105  | 14.6                 | 17.4                 | 8%                      |
| 110  | 16.8                 | 20                   | 9.2%                    |
| 115  | 19.4                 | 23                   | 10.6%                   |

CN gear uses separate single-target and area Mystic rolls. New presets
restore the tier-96 choice when legal; otherwise they use the legal Mystic
type for the slot (area on Helmet/Chestpiece, single-target on
Greaves/Bracer). Tier-100 combined Mystic rolls and stored user gear remain
unchanged. These are scaled layouts, not newly optimized builds.

Set and bow/ring values use original CN `suit_affix_config` curves at the
actual equipment tier. At tier 115, 寒芒 supplies 139.6 Maximum Physical
Attack and the Affinity bow/ring supplies 4% Affinity. Existing effect targets
and four-piece behavior are retained; only new-level amounts are added.

Inner Way T2 uses complete same-level exported curves where available.
Original CN `xinfa_uprank_info` tag-2 references join
`xinfa_uprank_world_lv` and `xinfa_uprank_attr_effect` for missing higher
levels. Alternate CN curves are selected, not added together. Missing
Global 24/25 cells are not interpreted as zero or copied from level 19.

Original CN `kongfu_up_rank` rows provide ranks 16–21, their Solo gates,
raw attributes, conversion ladders and Bonus Attack ratio. Existing fixed
specialty effects and the higher-Body/Power choice remain in place.
Rank 21 supplies 176–352 attribute attack, the applicable conversion cap
of 528 input attributes, and 72.5% Bonus Attack enhancement; supported
no-flat attacks receive 7.25% coefficient enhancement. Each equipped art
uses one complete rank, not cumulative ranks.

## Verification

Tests exercise stat aggregation, production bundles, conversion-cap changes,
every preset inventory at all five preset tiers, and gear round trips.
Bolt's combat lifecycle is tested at both 19 and 25. Accepted DPS snapshots
are not refreshed by importing progression data.
