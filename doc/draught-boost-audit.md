# Draught damage boost audit

**Historical audit snapshot.** This report and its JSON companion capture the
implementation supplied to the datamining review. Subsequent confirmed
corrections and qualifications are recorded in
[draught-audit-followup.md](draught-audit-followup.md). The original source-file
hashes and diagnostic data are preserved as evidence and are not assertions
about the post-review working tree.

Prepared 7 November 2026 for an independent datamining audit of Where Builds Meet. This is a description of the current working-tree implementation and its evidence, not a claim that every mechanic has been validated in game. Audit the native consumers and filters before changing values to match a damage screenshot.

The principal correction in this revision is Eonpour: its PvE bonus changes the direct hit numerical ratio and now uses the separate `baseDMGBonus` multiplier. Earlier revisions incorrectly added it to the ordinary damage-bonus category. The remaining difference from the user's screenshot is unresolved.

## Files to send

Send this report with [the machine-readable evidence](draught-boost-audit-data.json). The JSON contains exact selected definitions, SHA-256 hashes of their source files, all four complete build presets, the rotation, two diagnostic character profiles, representative resolved hit effects, and grouped damage. Its decimals are internal ratios: `0.1` means 10%. The JSON is audit evidence, not an accepted DPS snapshot or runtime import.

Repository: `C:/Users/greyd/Desktop/greydust/Projects/where-builds-meet`.

Primary export: `C:/Users/greyd/Desktop/greydust/Projects/where-datas-mine-internal/export/whaledraft-confirmed/2026-11-06_21-48-04-839_+0000-HH96uF`.

Raw snapshot: `48ce04bade699fdbea157e4b5bb1b197ba14e421c31595ccb412d0ff029f23e9`.

Relevant native evidence in the datamine checkout:

- `working/whaledraft-resource-consumers.json`: current passive constants and resource consumers.
- `working/dust-current-helpers.json`: passive formula adjustment and recorded-damage consumers.
- `working/dust-wildstride-settlement-proof.json`: recorded-damage adjustment.
- `extracted/hd/research-tables.json`: calcpoints, buffs, passives, and numerical data. Nightwick calcpoints below were checked against the current MANIFEST and raw packet hashes.
- `notes/action-booleans-and-healing.md`, `notes/data-mappings.md`, and `notes/strayhunt.md`: supporting formula and consumer analysis. Recheck their version scope rather than treating notes as current raw data.

## Comparison setup

| Input            | Current comparison                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Breakthrough     | 18, Solo Level 18, martial-art talent rank 14, equipment tier 100                                                                  |
| Weapons          | Skystrike Gauntlets and Riven Twinblades                                                                                           |
| Build            | Fully Relayed Min Build, ordinary Mistwing version                                                                                 |
| Inner Ways       | Eonpour, Skyspeak, Morale Chant, Mistwing; all T6                                                                                  |
| Sets             | Tiltrim four-piece, Precision bow/ring, Bamboocut arsenal                                                                          |
| Food             | Internal ID `SimmeringFishSlices`; current display name Clay Oven Flatbread; effective Physical Attack +140 minimum / +280 maximum |
| Script           | Wraithstrike: +10% critical damage while target Qi is below 40%                                                                    |
| Divinecraft      | Fire                                                                                                                               |
| Target           | Dummy; defense 500; level 96; Judgement Resistance 85%; base channel resistances zero                                              |
| Encounter        | 60 seconds, 40 ms ping, target HP ratio fixed at 99%, default distance 1                                                           |
| Support switches | Boss Talent 0%; all global support/debuff switches disabled                                                                        |
| Initial Binge    | 60, user-confirmed; maximum 200                                                                                                    |

The path default is **Min BP**, whereas this damage comparison explicitly uses **Min with Mistwing**. Do not silently substitute the default build. Min BP and Max BP replace Mistwing with Breaking Point; ordinary Min and Max retain Mistwing. Build orders are 0, 1, 10, 11 respectively.

The user reports these attack ranges **without food**, with other settings matching the build:

| Attack    |      Preset sheet | User report |
| --------- | ----------------: | ----------: |
| Physical  | 2865.4912–2271.62 |   2905–2204 |
| Bamboocut |        360–962.58 |     360–866 |
| Silkbind  |               0–0 |        89–0 |
| Formless  |         26.4–26.4 |       26–75 |

The preset sheet also contains 54% Critical DMG Bonus before combat buffs,
35% Affinity DMG Bonus, 9.2% Direct Critical Rate, and 147.493248% raw Critical
Rate. Against the selected 85% Judgement Resistance, its effective Critical Rate
is about 79.72608% before the separate direct-critical contribution. Inebriate,
the enhanced-skill talent, Wraithstrike and Breaking Point must not be folded
into this sheet a second time. The JSON preserves the complete raw and derived
rate fields for the actual branch calculations.

The diagnostic substitutes only these attack endpoints, preserves the food's effective-stat additions, and retains the preset's other stats. It does not create new gear or change a saved build. The shared calculator normalizes a maximum below its minimum for damage calculation; the user-supplied reversed ranges are preserved as inputs. In the diagnostic, Physical Attack with food normalizes to 3045–3045. Formless is added to the primary Bamboocut channel.

## Damage categories

These categories must not be merged merely because tooltips all say damage increase.

| Category                   | Draught examples                                                                     | Current combination                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Sheet attack               | Gear, arsenal, T2 Inner Way stats, martial-art raw bonuses                           | Shared raw/stat/effective-stat pipeline                                                |
| Attack percentage          | Tiltrim's 1–5% Physical and attribute attack                                         | Attack-channel percentage effects                                                      |
| Direct-hit numerical ratio | Eonpour                                                                              | `1 + baseDMGBonus`, separate from ordinary bonuses                                     |
| Ordinary damage bonus      | All Martial Arts, weapon art, relevant boss/HP bonuses, Yi River, Flute, Fire's 1.5% | Shared Category 1 additions under existing formula rules                               |
| Critical damage            | Base sheet, Skyspeak T5, Inebriate, gauntlet enhancement talent, BP, Wraithstrike    | Applies on the critical branch; rate weighting remains separate                        |
| Channel damage             | Twinblade Inebriate talent, gauntlet Bamboocut conversion, Strayhunt                 | Physical/Bamboocut or corresponding channel modifiers                                  |
| Penetration                | Weapon/accessory attunement, twinblade conversion, Mistwing/BP/Yi River              | Channel penetration versus resistance; primary attribute receives Formless Penetration |
| Attunement damage          | Deepdaze armor attunements                                                           | Separate matching attunement bucket                                                    |
| Recorded replay            | Drunkslay and Wildstride                                                             | Records resolved source damage, then settles once without a new critical roll          |
| Action timing              | Dragonquench cycle acceleration and ping exemption                                   | Changes event clocks, not damage coefficients                                          |

Formula reference: [damage-formula.md](damage-formula.md). The primary Bamboocut channel has the existing 1.5 path multiplier; the empty Attr. Attack DMG UP talent entries do not add a second 50% multiplier.

## Martial art talents

Complete selections are independent per rank; they are not cumulative across rank indices. Formula inputs use the immutable raw-stat stage. Food and another talent's conversion output do not feed the conversion a second time.

### Skystrike Gauntlets

Source: [skystrike-gauntlets.json](../data/martial-art/skystrike-gauntlets.json).

| Boost                            | Rule                                                                          |        Rank 13 | Rank 14 used here |        Rank 15 |
| -------------------------------- | ----------------------------------------------------------------------------- | -------------: | ----------------: | -------------: |
| Minimum Physical Attack          | Agility × 0.264, capped                                                       |          73.92 |              79.2 |           85.8 |
| Enhanced critical damage         | Raw minimum Physical Attack × 0.0004; only `InebriateEnhanced` hits           |        max 30% |           max 30% |        max 30% |
| Raw Bamboocut Attack             | Adds minimum / maximum                                                        |       98 / 196 |         106 / 212 |      114 / 228 |
| Bamboocut damage bonus           | Raw minimum Bamboocut × 0.000336, capped                                      |            11% |             11.8% |          12.6% |
| Bonus Attack increase            | Gauntlet-tagged art's flat skill attack                                       |           none |             7.25% |            15% |
| Effect without flat skill attack | Additional coefficient ratio for supported gauntlet effects, including Falcon |           none |            0.725% |           1.5% |
| Primary attribute talent         | Existing Bamboocut primary-channel rule                                       | 1.5 multiplier |    1.5 multiplier | 1.5 multiplier |

The Perfect Dodge trigger while Carouse is active restores 5 Binge with a one-second cooldown. The equivalent non-Arena Deflect gain is currently deferred. Audit that omission's resource impact; it is not a missing direct damage multiplier.

Native enhanced-crit passive: `32020311`, `cond_self [[26,1121]]`, dynamic `W_ATK_CRI_UP` capped at 0.3. Rank-14 talent IDs include `320114`, `320203`, `320312`, `320401`, `320502`, `320601`.

### Riven Twinblades

Source: [riven-twinblades.json](../data/martial-art/riven-twinblades.json).

| Boost                     | Rule                                                                 |        Rank 13 | Rank 14 used here |        Rank 15 |
| ------------------------- | -------------------------------------------------------------------- | -------------: | ----------------: | -------------: |
| Critical Rate             | Agility × 0.000304, capped                                           |         8.512% |             9.12% |          9.88% |
| Inebriate channel bonuses | Raw minimum Physical Attack × 0.00012; Physical and Bamboocut damage |    max 9% each |       max 9% each |    max 9% each |
| Raw Bamboocut Attack      | Adds minimum / maximum                                               |       98 / 196 |         106 / 212 |      114 / 228 |
| Bamboocut penetration     | Raw minimum Bamboocut × 0.0672, capped                               |             22 |              23.6 |           25.2 |
| Bonus Attack increase     | Twinblade-tagged art's flat skill attack                             |           none |             7.25% |            15% |
| Deepdaze outcome rule     | Dragonquench and enhanced Hero's Blood cannot Abrade                 |        enabled |           enabled |        enabled |
| Carouse                   | Ordinary Hero's Blood grants Carouse for 20 seconds                  |        enabled |           enabled |        enabled |
| Primary attribute talent  | Existing Bamboocut primary-channel rule                              | 1.5 multiplier |    1.5 multiplier | 1.5 multiplier |

The no-Abrasion rule currently converts Abrasion probability to Normal. It does not force Critical or Affinity. Native Inebriate channel passive `32120311` changes `W_ATK_SCALE` and `PRO_ATK_E_SCALE`. Rank-14 IDs include `321114`, `321203`, `321312`, `321401`, `321502`, `321601`.

## Inner Ways

### Eonpour

Source: [eonpour.json](../data/innerway/eonpour.json).

| Tier | Implemented addition or replacement                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0   | During Inebriate, Draught direct skills gain 10% PvE base damage                                                                                                                           |
| T1   | Gauntlet light-attack Binge mechanics are not fully implemented in this rotation model                                                                                                     |
| T2   | +84 raw minimum Physical Attack at Solo 18                                                                                                                                                 |
| T3   | Replaces 10% with 20% PvE base damage during Inebriate                                                                                                                                     |
| T4   | Light-attack and incoming-hit Binge mechanics remain outside this preset's supported skill set                                                                                             |
| T5   | +4.6% Direct Critical Rate                                                                                                                                                                 |
| T6   | During Deepdaze, replaces 20% with 40% PvE base damage; Peakfall hitting an Exhausted boss can activate/extend Deepdaze and apply Wildstride, Strayhunt and Drunkslay, once per 60 seconds |

The bonuses above are not summed as 10% + 20% + 40%. Native event `34` maps to `_effect_event_adj_formula_data`. Its target `4` maps through `FORMULA_DATA_ADJ_TARGET` to `SKILL.jm_numerial_ratio`; the handler adds to the ratio adjustment, and the native hit formula multiplies by that numerical ratio separately from ordinary damage bonuses. Current consumer: `buff_passive_misc` child 130 in `dust-current-helpers.json`. The source passives distinguish general and non-player target contributions. Audit their sum at each tier, particularly `102701121–124`, `102701301–304`, and `102701501–504`.

T6's Exhausted route uses a hidden 60-second cooldown. If already in Deepdaze it extends the state by six seconds; otherwise it fills Binge and enters it. Current trigger requires a Peakfall-tagged damage event on Exhausted. Native passives `102701521` and `102701522` use the source Peakfall filter and boss/Exhausted conditions.

### Skyspeak

Source: [skyspeak.json](../data/innerway/skyspeak.json).

| Tier | Implemented boost or state change                                                                   |
| ---- | --------------------------------------------------------------------------------------------------- |
| T0   | Enables authored Hero's Blood–Inebriate skill                                                       |
| T1   | Restores 60 Binge when Deepdaze expires                                                             |
| T2   | +8.7% raw Critical Rate at Solo 18                                                                  |
| T3   | Deepdaze duration increases from 5 to 10 seconds                                                    |
| T4   | Boundvessel slash-speed and held-slash drinking behavior not implemented; absent from this rotation |
| T5   | +4% Critical DMG Bonus                                                                              |
| T6   | Ordinary Hero's Blood applies the 20-second Drunkslay mark                                          |

The T6 JSON tier itself is empty because its condition enables the skill's mark application; the damage-recording behavior belongs to the Drunkslay mark. Do not interpret the empty tier as absent T6 support.

### Morale Chant

Sources: [morale-chant.json](../data/innerway/morale-chant.json), `YiRiver` in [general buffs](../data/buff/general.json), `MoraleChant` in [general skills](../data/skill/general.json).

Qualifying direct hits or heals gain Yi River stacks through the shared trigger and a two-second buff cooldown. Maximum five stacks. Each stack grants 1% ordinary damage and healing bonus. T1 adds two Physical Penetration per stack, up to ten. T3 adds an extra stack and doubles the damage/healing bonus against Controlled targets. The ordinary dummy is not assumed Controlled merely because it is Exhausted. T4 increases the buff duration from eight to twelve seconds. T2 adds 28–56 raw Physical Attack at Solo 18; T5 adds 4.6% Direct Critical Rate.

At T6, a qualifying direct hit at five stacks triggers the Morale Chant damage skill, with a ten-second skill cooldown. It has Physical and attribute coefficients of 1. A second equal hit requires Controlled. The healing trigger shares the cooldown group. Verify stack gain timing, trigger admission, and whether controlled/exhausted target state should differ on this dummy.

### Mistwing

Source: [mistwing.json](../data/innerway/mistwing.json).

| Tier | Implemented penetration rule                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0   | Physical only: +1 per completed 20% missing target HP, capped at 4                                                                                                    |
| T1   | +3 flat Physical Penetration                                                                                                                                          |
| T2   | +25.2–50.4 raw Physical Attack at Solo 18                                                                                                                             |
| T3   | During a Martial Art Special Enhancement, doubles the HP-scaling part: total +2 per 20% missing HP, cap 8                                                             |
| T4   | Replaces the flat 3 Physical with 6 of every penetration type; HP scaling and its enhancement addition also affect every type                                         |
| T5   | +2.5% raw Physical DMG Bonus                                                                                                                                          |
| T6   | HP interval becomes 10%; baseline +1 per interval, plus +1 per interval during enhancement, each capped at 4. Inebriate adds another flat 6 of every penetration type |

Enhancements currently recognized: Inebriate, Deepdaze, Flamelash and Flower Burial. At 99% target HP, T6 in Inebriate grants 12 of each penetration type and **zero** missing-HP scaling. Native Normal buffs `10270350` / `10270351` and passives `102703501–510` support this replacement structure. Earlier implementation retained the obsolete +3 physical and started HP bands too early. Boundary admission and any additional valid enhancement states remain audit topics.

### Breaking Point variants

Sources: [breaking-point.json](../data/innerway/breaking-point.json), `Disintegration` in [Wind buffs](../data/buff/bamboocut-wind.json).

Qualifying triggers against an Exhausted target apply Disintegration. Each stack grants five Physical Penetration and 5% critical damage. Base maximum three stacks and three-second duration; T1 extends duration to five seconds; T4 raises maximum to five, for 25 penetration and 25% critical damage. T2 adds 7.8% raw Precision at Solo 18; T5 adds 4.1% Direct Critical Rate. A successful T6 dodge has a separate authored five-stack grant with a 15-second cooldown. The current preset contains Deflects, not Perfect Dodges, so do not assume this route occurs.

## Combat buffs and target marks

Sources: [Draught buffs](../data/buff/bamboocut-draught.json), [Draught target marks](../data/debuff/bamboocut-draught.json).

| Effect             | Current implementation                                                                                                              | Native evidence or audit point                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Inebriate, Ine     | +5% critical damage; enabled at 100 Binge; no authored duration                                                                     | Buff 200256; native resource threshold 50% of the 200 cap                                                                                   |
| Deepdaze, DD       | Enables enhanced skills; T3 duration 10 seconds; expiry clears Inebriate/speed, consumes 200 Binge and restores 60 with Skyspeak T1 | Buff 200257 shares the Inebriate family and native +5% critical damage. Current model represents that +5% once through Inebriate, not twice |
| Carouse, Car       | 20 seconds; ordinary and enhanced Hero's Blood maintain it; doubles eligible quick-drink gain from 25 to 50                         | No direct damage multiplier                                                                                                                 |
| Drink mark         | Two-second eligibility mark set by linked Q/followup skills and consumed by quick drinking                                          | Whaledraft grants Binge only while this mark is present; audit gain admission                                                               |
| Dragonquench Speed | Two acceleration levels: 15%, then 30%; third completed four-stage cycle resets it                                                  | Cast multipliers 1/1.15 and 1/1.30; stage hit clocks scale with cast time                                                                   |
| Strayhunt          | +2% Physical and each attribute damage bonus for 20 seconds                                                                         | Passive 2210051 uses `W_ATK_SCALE` and `PRO_ATK_*_SCALE`                                                                                    |
| Wildstride         | While Strayhunt exists, +20% recorded replay damage at settlement, for 20 seconds                                                   | Passive 2210041, trigger 145, event 129 `[3,20]`; native recorded-damage ratio adjustment                                                   |
| Drunkslay, DS      | Records eligible source damage; settles 20% on mark replacement or 20-second expiry                                                 | Native mark 10270252, passives 102702521/522; pending records do not flush at Battle End                                                    |

A Drunkslay payout currently equals `sum(eligible resolved damage) × 0.20 × (1 + applicable replay bonus)`. With only Wildstride, this is 24% of recorded damage. It does not roll Critical/Affinity again or reapply source damage bonuses. Eonpour's base multiplier is inherited through the source damage.

Native ordinary Hero's Blood passive `102702501` explicitly removes the old mark (event 23) then applies a new mark (event 4). Eonpour's mark route applies it without the same explicit remove. **Independently verify whether these two routes should have identical replacement/settlement behavior.** The shared recording engine currently settles on every reapplication. This is a concrete unresolved behavior, not proof that the engine matches native refresh semantics.

The PvE Drunkslay event contains `[17, 0.2, 0.12]`; the PvP event contains `[17, 0.2]`. The current native helper uses the third parameter for recorded Qi/resource damage, not an additional 12% HP replay. The simulator does not calculate that Qi replay; encounter Qi is authored. Recheck this distinction before changing the HP coefficient to 32%.

## Gear and external boosts

| Source                              | Current boost                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tiltrim two-piece                   | +90.6 raw minimum Physical Attack at tier 100; included in four-piece selection                                                                                                                                      |
| Tiltrim four-piece attack buff, Til | Each qualifying damage trigger while in Inebriate/Deepdaze, Flamelash or Flower Burial adds a stack, maximum five; refreshes a 5.1-second buff. Each stack adds 1% Physical and each elemental attack, for 5% at cap |
| Tiltrim enhanced bonus              | At five stacks, +5% HP damage for `InebriateEnhanced` hits                                                                                                                                                           |
| Precision bow/ring                  | +4% raw Precision at Solo 18                                                                                                                                                                                         |
| Bamboocut arsenal                   | +148 minimum / +297 maximum Bamboocut Attack and +31,700 maximum HP at Solo 18                                                                                                                                       |
| Weapon/accessory attunements        | Preset calculation Physical Penetration contribution 51.2                                                                                                                                                            |
| Armor attunements                   | 28% Deepdaze skill damage, separate attunement bucket, requires `Deepdaze` tag                                                                                                                                       |
| Art of Gauntlet                     | Preset sheet 6.956% weapon-art damage for `Gauntlet` hits                                                                                                                                                            |
| Art of Twinblade                    | Preset sheet 6.956% weapon-art damage for `DualBlades` hits                                                                                                                                                          |
| All Martial Arts                    | Preset sheet 6.768%; tag-filtered                                                                                                                                                                                    |
| Damage versus Boss                  | Preset sheet 7.144%; audit actual dummy target eligibility in the shared formula                                                                                                                                     |
| Food                                | +140–280 effective Physical Attack; does not feed raw talent conversions                                                                                                                                             |
| Wraithstrike                        | +10% critical damage below 40% target Qi                                                                                                                                                                             |
| Flute buff                          | 12.5 seconds; distance-dependent ordinary bonus; the current segment implementation resolves distance 1 to 2% (the 1–2 band). Exact segment table is in the JSON; verify its native distance boundaries              |
| Fire passive                        | +1.5% HP damage in the ordinary bonus category                                                                                                                                                                       |
| Fire burn                           | Four-second refreshed DOT, first tick 0.528 seconds, interval 1.023 seconds, Physical coefficient 0.26; average attack and normal-only Divinecraft rate route                                                        |
| Solid Foundation                    | Five direct hits build the grant; regrant cooldown ten seconds; next admitted direct hit triggers Physical coefficient 0.4, average attack and Divinecraft rate route                                                |

All exact equipment rolls for tiers 96 and 100, setup selections and underlying definitions are included in the JSON. These sheet totals overlap their contributing gear and stat pipeline; do not add them again on top of the already resolved sheet.

Boss Talent, external Qi Imbalance, Phantom Chime, Soul-Shaken, Vulnerable, Fearful Blade, Qingyi's Charm, Floating Grace and Wings support are disabled in this comparison. They are not inferred from the damage screenshot.

## Skill eligibility and fixed damage scaling

| Skill family                     | Relevant admission and scaling                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dragonquench stages 1–4          | `InebriateEnhanced`, `Deepdaze`, `DragonquenchInebriate`, `Heavy`, `Gauntlet`, `SkystrikeGauntlets`, `BamboocutDraught`; PvE damageScale 1.4; ignores ping                 |
| Hero's Blood–Inebriate           | `InebriateEnhanced`, `Deepdaze`, `HeroesBloodInebriate`, `DualBlades`, `RivenTwinblades`, `BamboocutDraught`; PvE damageScale 1.5; eleven damage contacts                  |
| Peakfall/Castlink Jadeflush      | Inebriate-enhanced Q routes; ordinary and enhanced routes are selected against active state                                                                                |
| Nightwick–Tipsylay and Primepick | Now carry `InebriateEnhanced`, matching native calcpoint tags `[1121]`; gain gauntlet critical damage, Tiltrim enhanced bonus and Drunkslay admission; PvE damageScale 1.4 |
| Ordinary Hero's Blood            | Grants 40 Binge; applies Drunkslay with Skyspeak T6; not an enhanced hit                                                                                                   |
| Reveldrift cancel                | Ordinary Q route; applies Strayhunt; not automatically enhanced merely because cast during Deepdaze                                                                        |
| Falcon's Pursuit                 | Separate Martial Art Effect; does not inherit the drinking action's Heavy tag. Supported Additional Attack coefficient exception; no Inebriate-enhanced tag inferred       |
| Drunkslay payout                 | `Triggered`, `Replayed`; replay coefficient 0.2; no repeated source-bonus application                                                                                      |

Native Dragonquench fourth-stage contacts occur at 0.248999982, 0.364998788 and 0.481998055 seconds before acceleration, using numerical ratios 0.3, 0.3 and 0.4. The middle contact was missing in an earlier revision. Full thirteen-cast chains yield nineteen contacts each. Exact coefficients, flat bonuses, clocks and tags for every authored Draught skill are in the JSON.

## Rotation and measurement

The saved rotation now has twelve heavies in rounds one through three and thirteen in round four: **49 casts and 73 Dragonquench damage contacts**. All four enhanced Hero's Blood casts retain their **44 contacts**. Reveldrift cancel is moved before the ordinary Hero's Blood following rounds one and three, and added before the final ordinary Hero's Blood. The final ordinary hit settles Drunkslay at **59.673466 seconds** with 40 ms ping; recovery extends past the cutoff. Current simulation produces four Drunkslay payouts.

The first Exhausted state is attached to the tenth heavy in round two at 26.838021 seconds. Threshold events at 59.99% and 39.99% Qi are placed at 40% and 60% of that depletion interval. After ten seconds of Exhausted and four seconds of Qi immunity, the same measured depletion rate resumes. The next break is outside 60 seconds. This is an authored encounter approximation, not native Qi damage simulation.

The original screenshot showed 76 Dragonquench contacts, 44 enhanced Hero's Blood contacts and three Drunkslay attempts. It predates the current three-heavy removal and final ordinary special. Do not treat its aggregate total as the expected output of the newly edited rotation.

| Damage row             | Original game screenshot |   Current preset sheet | Current reported attack ranges |
| ---------------------- | -----------------------: | ---------------------: | -----------------------------: |
| Total damage           |  approximately 5,325,000 |              4,956,387 |                      5,037,156 |
| DPS                    |                   88,762 |                 82,606 |                         83,953 |
| Dragonquench–Inebriate |   2,200,442, 76 contacts | 2,019,315, 73 contacts |         2,052,063, 73 contacts |
| Hero's Blood–Inebriate |   1,280,953, 44 contacts | 1,218,153, 44 contacts |         1,237,913, 44 contacts |
| Drunkslay              |  931,960, three attempts |  877,470, four payouts |          891,702, four payouts |
| Castlink               | 216,547, twelve attempts |                204,026 |                        207,337 |

These are expected-value calculations. The screenshot is one observed run; it is not a joint sampled comparison. The attack substitution is a diagnostic, not a new accepted preset.

Measured corrections on the current rotation and preset sheet:

| Change                                                                    |                                      Total damage effect |
| ------------------------------------------------------------------------- | -------------------------------------------------------: |
| Restore Nightwick enhanced eligibility                                    |                                                  +51,260 |
| Correct Mistwing replacement and missing-HP bands                         |                                                  −71,919 |
| Change Eonpour from ordinary additive bonus to direct-hit base multiplier | +309,006 on preset sheet; +314,021 with reported attacks |

## Questions for the datamining audit

1. Verify Eonpour's event-34 consumer, `FORMULA_DATA_ADJ_TARGET[4]`, the downstream numerical-ratio formula, and the PvE tier sums. Confirm its interaction with other direct-hit numerical-ratio modifiers and target corrections.
2. Verify Drunkslay replacement versus refresh, particularly ordinary Hero's Blood's explicit remove/reapply versus Eonpour's plain application. Identify the correct number of payouts and interval boundaries for both the original and edited rotations.
3. Enumerate every calcpoint carrying tag 1121 and map it to simulator skills. Confirm that tag 1122 or state inheritance is not required for any additional bonus. Audit Nightwick and all Jadeflush hits, not just the two largest damage rows.
4. Verify whether Deepdaze inherits the base Inebriate +5% critical damage once, whether entering it replaces the base buff, and whether all bonuses keyed to Inebriate should admit the Deepdaze tag without a separate base buff.
5. Verify Tiltrim hit admission, refresh behavior, whether incoming replay/periodic events can build stacks, attack-percentage scope including Formless, and the five-stack enhanced bonus category.
6. Confirm Mistwing's native HP-band boundaries, the replacement of obsolete tiers, all-type scaling and enhanced-state list. In particular, do not assume any HP-band bonus at 99% HP.
7. Confirm the primary-attribute 1.5 factor, Additional Attack versus coefficient exceptions, the raw-stat inputs/caps of both martial arts, and that neither weapon's talent is accidentally applied twice or restricted to only its own damage when native filters are broader.
8. Confirm how the native dummy admits boss damage, non-player target corrections, Controlled and Exhausted, and missing-HP bonuses. The user confirms no 15% Boss Talent in the recorded run.
9. Verify the third Drunkslay event parameter as Qi replay and the extent to which it changes actual exhaustion timing; check the four-second immunity interval. The authored Qi approximation currently does not calculate this damage.
10. Audit remaining resource mechanics: non-Arena Deflect's Binge gain, unmarked quick-drink admission, light/held-drink gain and sober-up drain. Identify which can affect this precise sequence rather than changing unrelated mechanics.

For each finding, return the native table/row/layer, source hash or current-byte check, relevant consumer function and field, confirmed eligibility, stacking category, expected numeric behavior, and the smallest simulator correction. Separate source-confirmed corrections from hypotheses requiring a client recording. Do not tune coefficients solely to force the screenshot total.

## Reproduction and validation

- `npx vitest run tests/draught-damage-effects.test.ts tests/draught-rotation.test.ts tests/mistwing.test.ts --pool=threads`
- `npm run format:check`
- `npm run lint`
- `npm run build`
- `npm run test:dps`

The focused tests verify enhanced eligibility, Eonpour's 1.4 multiplier independently of additional ordinary damage bonus, Mistwing's actual channel damage, rotation contacts and final payout timing. The full build passes 1,916 tests after the Eonpour correction. Existing accepted DPS snapshots are unchanged. The DPS guard still rejects Draught's eight missing initial snapshots; none have been refreshed or accepted.
