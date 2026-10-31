# Refreshed datamine comparison, 2026-10-15

> **Historical audit (2026-10-15).** This records an earlier comparison, not a current source of truth. See the [documentation index](README.md) for current references.

This audit compares the current curated implementation with the refreshed
`local/datamine/` exports. No earlier export snapshot is retained, so a
disagreement establishes a current implementation difference, not when the game
changed. CN fallback records are accepted as evidence by user instruction;
edition/layer metadata still distinguishes conflicting records.

Hawkwing, Adaptive Steel's tier placement, Seasonal Edge T0 duration, Bursting Nine's second volley, and the missing rank-14 Phalanxbane/Mortal coefficient exceptions are changed in this work. Other entries below are findings, not implemented changes or approved DPS baselines.

## Coverage and limits

| Area                         | Coverage                                                                                                                                                                                                                   | Limits                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inner Ways                   | All 60 exported names map to all 60 runtime files; T0–T6 text/mechanic review and T2/T5 stat comparison.                                                                                                                   | A tier's behavior may live in skill/buff data rather than its Inner Way JSON. Empty tiers alone do not prove missing behavior.                                                  |
| Martial arts                 | All 22 exported names map to all 22 runtime talent definitions; rank-13/14 selections and additional-attack exceptions inspected.                                                                                          | Existing talent audit remains the detailed record for deferred combat/resource wiring. Higher ranks are not imported into breakthrough 17/18.                                   |
| Weapon/armor sets            | All 25 runtime sets map into the 77-entry source catalog; normal two-piece tables and four-piece descriptions inspected.                                                                                                   | The remaining 52 entries are not all comparable weapon/armor sets. Their absence is not automatically a regression.                                                             |
| Martial-art numerical skills | All 292 source records inventoried; 61 source records have exact display-name or ID-normalized runtime candidates. Representative damage baselines, multipliers, composite components and prior source exceptions checked. | Numerical-reference records share names with parents; exact-name matching does not identify their runtime component. No full per-hit parity claim is made for unmapped routes.  |
| Mystic numerical skills      | All 80 source records inventoried; eight source records have exact-name runtime candidates, plus manually traced Dragon's Breath / Poet sequences.                                                                         | The export includes movement, unsupported abilities and numerical components. Enlightenment selection, upgrades and trigger routes prevent a blanket array-to-array comparison. |
| Mechanism                    | The single exported Summon Lightning record matched.                                                                                                                                                                       | Summon Lightning cooldown differs; see below.                                                                                                                                   |
| Progression                  | Exported 17/18 player bonuses, cumulative talent bonuses and six Oddity region records inspected against `data/system.json` / `data/breakthrough.json`.                                                                    | Export default enemy-level profiles do not necessarily identify the simulator's selected practice target.                                                                       |
| Raw tables                   | Hawkwing buff 107031 numerical payload verified; selected passive/buff links and contradictory texts inspected.                                                                                                            | This is not a new interpreter for every raw numeric opcode or a claim that every raw row is modeled.                                                                            |
| Items                        | Tier-96/100 catalogs and runtime gear/attunement structures inspected for scope, tier handling and the Mystic-affix patch.                                                                                                 | No complete affix-ID/roll-range reimport or per-item equivalence assertion is made.                                                                                             |

The local guide `local/datamine.md` describes export schemas and investigation
paths. Export filenames are evidence references, not application imports.

## Changes implemented

| ID    | Source evidence                                                                                                                                         | Previous implementation                                           | Result                                                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HW-01 | Normal set 3; buff 107031 layer 0 has `MIN_W_ATK_RATE`, `MAX_W_ATK_RATE`, `MIN_PRO_ATK_A_RATE`, `MAX_PRO_ATK_A_RATE` all at `0.018`; duration 5, cap 5. | Five tracked stacks granted only Physical Attack at 2% per stack. | Buff data and expected/sampled stack resolution grant 1.8% Physical and Bellstrike Attack per stack. Same timing and Affinity trigger. WTS threshold/healing expectations reflect the smaller Physical bonus; Bellstrike does not enter the WTS threshold. |
| AS-01 | Adaptive Steel source 152 T5 gives 3% Bellstrike damage.                                                                                                | Bonus was placed at runtime T4; T5 was empty.                     | Bonus moved to T5. Cumulative T5/T6 retain it; T4 no longer does. Explicitly confirmed by the user.                                                                                                                                                        |
| SE-01 | Seasonal Edge source 82 T0 says 10s; T1 says 12s.                                                                                                       | T0 8s, T1 12s.                                                    | T0 changed to 10s. T1 and cooldown unchanged.                                                                                                                                                                                                              |

Seasonal Edge T6 is an intentional exception confirmed by the user during this
audit: retain 50% one / 30% two / 20% three effects and unconditional Winter
exclusion. Do not replace these with the export's 15% three / 5% four effects or
distance-conditioned Winter exclusion.

### Additional approved numerical fixes

- **MS-01, Bursting Nine:** fixed the seven low-damage arrows in the second volley to the 20% decay floor. The first volley totals 270% of the baseline and the second totals 135%, preserving its half-strength factor. The earlier update had left the second at 100%.
- **MA-01, Phalanxbane:** added 0.725% coefficient compensation at rank 14 for its own no-flat-attack actions, including its Anxi Soldier variants. Existing flat-attack scaling is unchanged.
- **MA-02, Mortal Rope Dart:** source talent 310601 also explicitly includes Rodent Rampage in the 0.725% coefficient exception. Added it at rank 14. Source 314601/3145022 covers Phalanxbane; 310601 covers Mortal. Strategic Sword, Heavenwill and Skystrike retain their existing exception without another layer of scaling.

## Confirmed remaining differences

| ID      | Area                               | Export / required behavior                                                                                                                                         | Current behavior                                                                                                                                                                                                                                                | Smallest implementation path                                                                                                                                                                                                                                                   |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MS-01   | Bursting Nine second volley        | Mystic 52 / skill 2300081: repeated arrows decay to 30%, then 20%; the second volley is half strength.                                                             | First volley is correctly 270% of the first-arrow baseline. Second volley remains 100% of that baseline, with seven 10%-floor arrows; it should total 135% after applying its 50% scale. The previous numerical update missed these seven half-strength arrows. | Data-only correction of second-volley Physical/Attribute coefficients and flat Physical terms; verify both volleys by calculated damage. Do not alter the second-volley 50% factor.                                                                                            |
| MA-01   | Phalanxbane additional attack      | Normal rank-14 talent 314601, buff 3145022: no-Bonus-Attack effects, including Anxi Army Assist, gain 0.725% Physical and Attribute coefficients.                  | Runtime rank 14 grants only `flatAttackBonus: 0.0725`; it lacks `coefficientBonusWithoutFlatAttack: 0.00725`.                                                                                                                                                   | Existing coefficient exception mechanism already handles this for other arts. Scope it to the correct Phalanxbane-owned effect records, then review Strength DPS.                                                                                                              |
| SET-01  | Ivorybloom                         | Normal set 29: full HP **or within 3s after Critical Healing** grants the four-piece bonuses.                                                                      | Implemented: full HP or three seconds after a critical heal, including teammate heals; expected expiry probabilities and sampled refreshes share the combat resolver.                                                                                           | Extend existing healing/outcome trigger support and a timed self buff; preserve full-HP activation. Expected and sampled proc behavior both need coverage. Raw buff 109564 still has older full-HP-only text, so that text alone must not override the normal set description. |
| SET-02  | Tier-dependent two-piece set stats | Exported tables distinguish tiers 96/100: flat attack 77.8/90.6, Precision 8%/9.3%, Affinity 4.5%/5.2%, Critical 9%/10.4%, Physical Defense 39/45.4, HP 2960/3440. | Runtime set options use fixed tier-96 values at both breakthroughs; equipment item bases are tier-aware, set definitions are not.                                                                                                                               | Extend existing set-effect selection with a verified equipped-set tier rule. Mixed-tier equipment semantics need a decision; do not simply scale all set bonuses from breakthrough.                                                                                            |
| MECH-01 | Summon Lightning                   | Skill 75120051 exports a normal 30s cooldown.                                                                                                                      | `data/skill/mechanism.json` has cast and application clocks but no cooldown.                                                                                                                                                                                    | Existing skill cooldown field can express this. Current duration/application clocks remain separately authored; do not derive them from the cooldown.                                                                                                                          |
| IW-01   | Breaking Point below T3            | Source 453 T0/T1 require Critical damage on an Exhausted target; T3 removes the Critical-only restriction.                                                         | T0 trigger checks only Exhausted at every tier.                                                                                                                                                                                                                 | Extend its existing trigger to outcome-gated behavior below T3, retaining ordinary hits from T3 and the independent T6 dodge proc/BP CD.                                                                                                                                       |
| IW-02   | Sky Gripped T3                     | Source 602 specifies the 30% Qi bonus to Falcon and Vile Condemned **against Bosses**.                                                                             | Current Qi-bonus requirement does not restrict target type.                                                                                                                                                                                                     | Existing Boss requirement; no calculated HP impact while Qi remains authored.                                                                                                                                                                                                  |
| IW-03   | Sky Gripped T6                     | Falcon damage against an Exhausted Boss resets Heaven's Might DOT trigger interval, once per 30s.                                                                  | Charged-hit replay has an 18s listener cooldown; there is no corresponding Falcon reset rule.                                                                                                                                                                   | Extend existing cooldown/reset wiring. Requires validating reset ownership for listener cooldowns, not a duplicate skill-specific timer.                                                                                                                                       |
| IW-04   | Mountain's Might T4                | Source 101: 1.5% Direct Affinity with the buff plus another 1.5% against Bosses.                                                                                   | Runtime grants 3% with Endless Gale without a Boss condition.                                                                                                                                                                                                   | Existing conditional stat effects can split base and Boss contributions. Verify target classification before changing dummy presets.                                                                                                                                           |

## Missing support versus newly changed values

These are existing scope gaps confirmed by the refreshed source. Without an old
export, they cannot all be called new balance changes.

- **Riptide Reflex:** T0/T1/T4 control-hit Martial Art cooldown reductions and T6
  Bone Grinding are absent. The supported Control list now explicitly includes
  Plumage Sweep. Merely adding that skill to a list would not implement Riptide;
  its core event rules must be authored first.
- **Gourd Toss, Thunderous Bloom, Star Reacher, Blossom Barrage:** currently
  passive-stat scaffolding; Jade combat skills and linked effect lifecycles are
  not wired. Lingering Bone raw buff 431307 has a five-second lifetime, but there
  is no corresponding current Jade target-effect implementation to update.
- **Royal Remedy, Restoring Blossom, Esoteric Revival, Mending Loom:** most
  resource, recipient, revive and Critical-Healing behavior remains absent.
  Restoring Blossom can share the eventual Critical-Healing outcome support
  needed by Ivorybloom rather than introducing another outcome mechanism.
- **Wildfire Spark, Divine Roulette, Evening Snow, Heart of Fire, Trapped Beast,
  and other utility/defensive Inner Ways:** exported active mechanics exist where
  runtime tiers contain mostly T2/T5 stats. These need feature-scoped work rather
  than copying tooltip percentages into unrelated damage categories.
- **Morale Chant:** below-T4 80% self-stack chance is still treated as guaranteed
  by current ordinary triggers. This was already documented in the Wings audit.
  The shared two-second application and ten-second damage/healing cooldowns exist.
- **Fivefold Bleed T6:** export says retain 1–2 stacks after piercing; runtime
  retains one. The distribution/selection rule is not supplied by this wording.
- **Sword Morph / Mountain's Might / Battle Anthem:** supported PvE calculation
  paths coexist with unmodeled target-mode restrictions, non-boss states and
  control behavior. See the existing skill/talent documentation before proposing
  wholesale replacements.
- **Volutefit, Eonpour, Skyspeak and much of Draught combat:** many effect tiers
  and combat skill maps are still pending; exported Binge/Inebriate behavior does
  not establish a complete currently runnable rotation.
- **Swift Gale, Mistwillow, Tiltrim and armor four-piece passives:** many runtime
  options retain only two-piece stats. Cleftpeak/Etherwrath/Starweave/Cloudshear
  have additional behavior in shared buffs and skill data; do not classify them
  as absent from their setup option alone.
- **Drunken Poet T5:** updated source upgrade 305 explicitly includes the final
  hit's extra four Vitality refund; current final-hit component omits it. The
  previously documented Mystic-tier eligibility question still applies.
- **Blinding Mist, Touch of Death and other absent Mystics:** source availability
  is not runtime availability. Their costs, cooldowns and damage interactions
  require actual skill records. The common damage/resource mechanisms cover most
  numeric behavior once eligibility and timing are established.
- **Calculated Qi damage:** delayed settlements and DOT Qi changes cannot move
  an authored Qi break until the shared Qi calculation/feedback pipeline exists.
  Existing HP replay behavior must not be replaced with normal attack rolls.
- **Tier-100 merged Mystic affix:** still pending from the supplied patch. The
  runtime retains Single-Target and Area Mystic stats; its migration/relay work
  remains separate from the present Hawkwing change.

## Numerical checks and source conflicts

- All 60 Inner Ways have matching names. After splitting exported min/max pairs
  and adding the runtime index-zero slot, existing T2 values through Solo Level
  21 match source tables; additional exported levels 22/23 are not uniformly
  filled in runtime arrays. Supported breakthrough 17/18 is not affected by
  these higher-level extensions. T5 passive values match, with Adaptive Steel's
  tier placement corrected above.
- Source skill 20380 now explicitly supplies Bleeding's 0.33 baseline and stack
  factors 0.4 / 0.5 / 0.6 / 0.8 / 1; these agree with runtime 0.132 / 0.165 /
  0.198 / 0.264 / 0.33. Source 20381 agrees with the existing 2.4 Blood Burst
  coefficients. Older documentation calling these source values missing is stale.
- Strategic Sword rank 14 / world breakthrough 18 selects talent 300601 and
  0.725% coefficient compensation, which runtime already has. Source talent rank
  18 instead requires world level 22 and selects 300605. Do not import its higher
  compensation into the existing breakthrough-18 setup.
- Soul Sweep, Burn and Bury's 0.78/1.3 branches, Qiankun's Lock, Sober Sorrow's
  0.15/0.25 hit weights, ordinary Fan Q's 0.8 scale, Jadebreaker ordinary/enhanced
  numerical ownership and Dawnsun 0.7225 branches have matching authored
  baselines in the inspected routes. Shared names are not interchangeable
  components: e.g. Jadebreaker normal and final beats reference different source
  numerical records.
- Some older Might records retain rounded or route-specific numbers: Storm Roar
  uses 0.3151 versus source 20103101's 0.31509. Thunder Shock has rounded boss-hit
  coefficients and flats. Stonebreaker Cleave's 1.7562 does not directly map to
  the exported 20401114 baseline 2.63428 and its listed route multipliers.
  These are precision/route reconciliation candidates, not an automatically
  verified new buff or nerf. Preserve existing behavior pending a route audit.
- Falcon's already-applied 12% patch scaling differs from the unscaled numerical
  curve/term combination still visible in some source records (e.g. Celestial
  Mandate 20901102). Do not undo the approved patch from that partial comparison;
  its full passive/attack-route chain needs reconciliation.
- Preserve documented user-confirmed Smolder and Dragon Head - Tide baselines,
  nominal Wings timing assumptions, and Panacea's intentional extra talent.
  Export text/curves are not a blanket authorization to overwrite observations.
- The normal Qi Imbalance raw tooltip still says 8%/8%, while the supplied patch
  requires the already-implemented 10%/10%. This is another reason not to equate
  every refreshed text field with the complete latest numerical behavior.
- Current progression 17/18 player attributes/Precision, cumulative character
  talent bonuses and six region Oddity values agree with inspected source rows.
  Source level/gear/rank extensions beyond those setups are not new selectable
  application progression by themselves.

## Verification and release review

Focused tests cover Hawkwing expected/sampled Physical and Bellstrike damage,
unchanged Silkbind damage, five-stack cap/expiry, WTS Physical-only threshold
feedback, Adaptive Steel T4/T5/T6 stat selection, and Seasonal Edge duration.

| Rotation                                                |       Accepted DPS |        Current DPS |    Accepted damage |    Current damage | Duration |
| ------------------------------------------------------- | -----------------: | -----------------: | -----------------: | ----------------: | -------: |
| `bamboocutKite/dummy-1-min-infinite-vitality`           |  57451.30293458791 | 57742.087938329154 | 3447078.1760752746 | 3464525.276299749 |      60s |
| `bellstrikeUmbra/dummy-1-min-38-bb`                     |  79820.02675353442 |  80563.87172526262 |  4789201.605212065 | 4833832.303515757 |      60s |
| `stonesplitStrength/pure-dummy-1-min-infinite-vitality` | 64908.049594465505 |  65079.61639668009 |   3894482.97566793 | 3904776.983800805 |      60s |

Umbra gains Bellstrike Attack from Hawkwing, partly offset by the smaller Physical Attack bonus. Kite and Pure Strength infinite-Vitality presets gain from the corrected second Bursting Nine volley. The other 17 preset results are unchanged. Existing release fixtures are breakthrough 17, so rank-14 Phalanxbane/Mortal compensation is covered by focused calculation tests rather than these baselines. Adaptive Steel T5+ and Seasonal Edge T1+ preset behavior is unchanged. The user subsequently approved the combined numerical corrections and Clay Oven Flatbread results for release; see doc/dps-snapshots.md.

The following appendices inventory all source skills and the Inner Way review
coverage. A candidate link is a discovery aid, not proof of a unique hit route.

## Inner Way inventory

“Stat-only file” describes the tier JSON, not a claim that shared skill code contains no behavior. T2 values through Solo Level 21 and T5 numbers were checked for every entry.

| Source ID | Inner Way              | Runtime file                                | Review note                                                                                   |
| --------- | ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1         | Wind Beneath Wings     | `data/innerway/wind-beneath-wings.json`     | Stat-only file; active mechanic not authored here.                                            |
| 2         | Evening Snow           | `data/innerway/evening-snow.json`           | Stat-only file; active mechanic not authored here.                                            |
| 3         | Steadfast Stance       | `data/innerway/steadfast-stance.json`       | Stat-only file; active mechanic not authored here.                                            |
| 4         | Shadow Assault         | `data/innerway/shadow-assault.json`         | Stat-only file; active mechanic not authored here.                                            |
| 5         | Fivefold Bleed         | `data/innerway/fivefold-bleed.json`         | T6 retains one stack; source says 1–2.                                                        |
| 6         | Sandswirl Tail         | `data/innerway/sandswirl-tail.json`         | Stat-only file; active mechanic not authored here.                                            |
| 41        | Envigorated Warrior    | `data/innerway/envigorated-warrior.json`    | Modeled target ownership cannot represent independent attackers.                              |
| 42        | Bitter Seasons         | `data/innerway/bitter-seasons.json`         | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 43        | Vital Leech            | `data/innerway/vital-leech.json`            | Stat-only file; active mechanic not authored here.                                            |
| 44        | Fury Harvest           | `data/innerway/fury-harvest.json`           | Turnaround and recovery behavior also live in shared skills/system.                           |
| 45        | Divine Roulette        | `data/innerway/divine-roulette.json`        | Stat-only file; active mechanic not authored here.                                            |
| 46        | Evasive Charge         | `data/innerway/evasive-charge.json`         | Stat-only file; active mechanic not authored here.                                            |
| 47        | Light and Shadow Alike | `data/innerway/light-and-shadow-alike.json` | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 48        | Heart of Fire          | `data/innerway/heart-of-fire.json`          | Stat-only file; active mechanic not authored here.                                            |
| 81        | Morale Chant           | `data/innerway/morale-chant.json`           | Below-T4 chance remains a documented gap.                                                     |
| 82        | Seasonal Edge          | `data/innerway/seasonal-edge.json`          | T0 corrected; T6 differences intentional.                                                     |
| 101       | Mountain's Might       | `data/innerway/mountains-might.json`        | T4 Boss split and non-boss branches need review.                                              |
| 102       | Wildfire Spark         | `data/innerway/wildfire-spark.json`         | Stat-only file; active mechanic not authored here.                                            |
| 103       | Battle Anthem          | `data/innerway/battle-anthem.json`          | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 104       | Sword Morph            | `data/innerway/sword-morph.json`            | Core cast/charge behavior also lives in Nameless Sword skill data.                            |
| 151       | Wolfchaser's Art       | `data/innerway/wolfchasers-art.json`        | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 152       | Adaptive Steel         | `data/innerway/adaptive-steel.json`         | T5 placement corrected; weapon mastery/dual-weapon behavior still partial.                    |
| 153       | Insightful Strike      | `data/innerway/insightful-strike.json`      | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 154       | Sword Horizon          | `data/innerway/sword-horizon.json`          | Bleed/Zenith behavior also lives in Strategic Sword skill data.                               |
| 301       | Gourd Toss             | `data/innerway/gourd-toss.json`             | Stat-only file; active mechanic not authored here.                                            |
| 302       | Thunderous Bloom       | `data/innerway/thunderous-bloom.json`       | Stat-only file; active mechanic not authored here.                                            |
| 303       | Star Reacher           | `data/innerway/star-reacher.json`           | Stat-only file; active mechanic not authored here.                                            |
| 304       | Blossom Barrage        | `data/innerway/blossom-barrage.json`        | Stat-only file; active mechanic not authored here.                                            |
| 351       | Royal Remedy           | `data/innerway/royal-remedy.json`           | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 352       | Restoring Blossom      | `data/innerway/restoring-blossom.json`      | Stat-only file; active mechanic not authored here.                                            |
| 353       | Esoteric Revival       | `data/innerway/esoteric-revival.json`       | Stat-only file; active mechanic not authored here.                                            |
| 354       | Mending Loom           | `data/innerway/mending-loom.json`           | Stat-only file; active mechanic not authored here.                                            |
| 401       | Exquisite Scenery      | `data/innerway/exquisite-scenery.json`      | Defense/Battle Will/Cadence behavior also lives in skills/buffs.                              |
| 402       | Trapped Beast          | `data/innerway/trapped-beast.json`          | Stat-only file; active mechanic not authored here.                                            |
| 403       | Art of Resistance      | `data/innerway/art-of-resistance.json`      | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 404       | Rock Solid             | `data/innerway/rock-solid.json`             | Stat-only file; active mechanic not authored here.                                            |
| 451       | Echoes of Oblivion     | `data/innerway/echoes-of-oblivion.json`     | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 452       | Vendetta               | `data/innerway/vendetta.json`               | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 453       | Breaking Point         | `data/innerway/breaking-point.json`         | BP CD already modeled; below-T3 Critical requirement pending.                                 |
| 454       | Riptide Reflex         | `data/innerway/riptide-reflex.json`         | Control cooldown and Bone Grinding missing.                                                   |
| 501       | Phantom Rally          | `data/innerway/phantom-rally.json`          | Shared catch/Resonance routes modeled; pull remains out of scope.                             |
| 502       | Towline Sweep          | `data/innerway/towline-sweep.json`          | 12% T6 agrees; explicit Token/control exclusions retained.                                    |
| 503       | Light Anew             | `data/innerway/light-anew.json`             | Damage mechanics modeled; control effects intentionally omitted.                              |
| 504       | Song of Tang           | `data/innerway/song-of-tang.json`           | Damage stacks modeled; HP drain intentionally omitted.                                        |
| 551       | Frost-Clad Night       | `data/innerway/frost-clad-night.json`       | Deflect, Forgetfulness and cooldown behavior also live in Snowparting skills/buffs.           |
| 552       | Steadfast Devotion     | `data/innerway/steadfast-devotion.json`     | Mountain Splitter/Charge Enhancement behavior also lives in shared skills/buffs.              |
| 553       | Throat-Piercing Art    | `data/innerway/throat-piercing-art.json`    | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 554       | Wildfire Surge         | `data/innerway/wildfire-surge.json`         | Stat-only file; active mechanic not authored here.                                            |
| 601       | Soaring High           | `data/innerway/soaring-high.json`           | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 602       | Sky Gripped            | `data/innerway/sky-gripped.json`            | Boss-only Qi requirement and T6 reset pending.                                                |
| 603       | Empirical Edge         | `data/innerway/empirical-edge.json`         | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 604       | Celestial Vigor        | `data/innerway/celestial-vigor.json`        | Stat-only file; active mechanic not authored here.                                            |
| 651       | Harmony Song           | `data/innerway/harmony-song.json`           | Existing Wings implementation audit applies.                                                  |
| 652       | Zephyr Whispers        | `data/innerway/zephyr-whispers.json`        | Existing Wings implementation audit applies.                                                  |
| 653       | Ink and Strings        | `data/innerway/ink-and-strings.json`        | Existing Wings implementation audit applies.                                                  |
| 654       | Blade's Will           | `data/innerway/blades-will.json`            | Existing Wings implementation audit applies.                                                  |
| 701       | Eonpour                | `data/innerway/eonpour.json`                | Stat-only file; active mechanic not authored here.                                            |
| 702       | Skyspeak               | `data/innerway/skyspeak.json`               | Stat-only file; active mechanic not authored here.                                            |
| 703       | Mistwing               | `data/innerway/mistwing.json`               | Active rules present; exported restrictions/unsupported branches require scoped verification. |
| 704       | Volutefit              | `data/innerway/volutefit.json`              | Stat-only file; active mechanic not authored here.                                            |

## Martial-art skill inventory

| Source skill ID | Description / resolved names                                       | Exact-name runtime candidates                                                                                    |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 20380           | Bleeding                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20381           | Blood Burst                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20390           | Resonance                                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20391           | 鼠鼠伤害                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 119001          | Guard Broken                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 10101019        | Long                                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 10305999        | Fan - Guarding Qi Core                                             | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101001        | Spear - Light Attack                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101005        | Spear - Heavy Attack                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101008        | Spear - Execute                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101017        | Spear - Airborne Light Attack                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101020        | Spear - Jump Strike                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101030        | Spear - Recovery                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101101        | Sober Sorrow                                                       | `data/skill/heavenquaker-spear.json#SoberSorrow`                                                                 |
| 20101102        | Drifting Thrust                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101103        | Spear - Dash                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101105        | Spear                                                              | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20101107        | Sweep All                                                          | `data/skill/heavenquaker-spear.json#SweepAll`                                                                    |
| 20102101        | Qiankun's Lock                                                     | `data/skill/nameless-spear.json#QiankunsLock`                                                                    |
| 20102102        | Storm Dance                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20102103        | Defensive Riposte                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20102105        | Cloudstep                                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20102110        | Legion Crusher                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20103005        | Spear - Heavy Attack                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20103101        | Storm Roar                                                         | `data/skill/stormbreaker-spear.json#StormRoar`                                                                   |
| 20103104        | Thunder Shock                                                      | `data/skill/stormbreaker-spear.json#ThunderShock`                                                                |
| 20201001        | Sword - Light Attack                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201006        | Sword - Heavy Attack                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201012        | Sword - Airborne Light Attack                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201013        | Sword - Jump Strike                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201020        | Sword - Recovery                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201101        | Daunting Strike                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201102        | Sword Slash Damage Boost; Vagrant Sword                            | `data/skill/nameless-sword.json#VagrantSword2`                                                                   |
| 20201103        | Defensive Riposte                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201105        | Sword - Dash                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201107        | Sword                                                              | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201110        | Shadow Step; Sword Slash Damage Boost                              | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20201113        | Sword - Dash                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20202101        | Inner Track Slash                                                  | `data/skill/strategic-sword.json#InnerTrackSlash`                                                                |
| 20202102        | Second Track Slash                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20202109        | Inner Balance Strike III                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301001        | Fan - Light Attack                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301005        | Fan - Heavy Attack                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301008        | Fan - Execute                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301009        | Fan - Execute                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301010        | Fan - Execute                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301011        | Fan - Defense                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301013        | Fan - Dodge                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301014        | Fan - Dodge                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301017        | Fan - Airborne Light Attack                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301019        | Fan - Airborne Light Attack                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301020        | Fan - Jump Strike                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301021        | Fan - Jump                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301030        | Fan - Recovery                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301051        | Fourfold Inquiry                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301055        | Emerald Dewtouch                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301098        | (unnamed numerical record)                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301101        | Cloudburst Healing                                                 | `data/skill/panacea-fan.json#CloudburstHealing`                                                                  |
| 20301102        | Morning Drizzle                                                    | `data/skill/panacea-fan.json#MorningDrizzle`                                                                     |
| 20301103        | Fan - Dash                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301104        | Defensive Riposte                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301105        | Fan                                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301106        | Fan - Dodge Counter                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301120        | Resurrection                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301121        | Endless Cloud                                                      | `data/skill/panacea-fan.json#EndlessCloud`                                                                       |
| 20301125        | Morning Drizzle                                                    | `data/skill/panacea-fan.json#MorningDrizzle`                                                                     |
| 20301130        | Fan                                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302101        | Peak's Springless Silence                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302103        | Moon Shatter Spring                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302104        | Glow & Flow                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302105        | Moon Shatter Spring                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302109        | Serene Breeze                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302111        | Forsaken Fame                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302116        | Emerald Barrier                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20302120        | Serene Breeze                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303006        | Fan - Heavy Attack                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303009        | Sweeping Shear                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303101        | Verdant Gust                                                       | `data/skill/willowbend-fan.json#VerdantGust`                                                                     |
| 20303102        | Boundless Bloom                                                    | `data/skill/willowbend-fan.json#BoundlessBloom`                                                                  |
| 20303105        | Boreal Sweep                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303206        | End of Gale                                                        | `data/skill/willowbend-fan.json#EndOfGale`                                                                       |
| 20401001        | Mo Blade - Light Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401004        | Mo Blade - Heavy Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401010        | Mo Blade - Execute                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401017        | Mo Blade - Airborne Light Attack                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401020        | Mo Blade - Jump Strike                                             | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401021        | Mo Blade - Dash                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401024        | Divine Counter                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401101        | Predator's Shield                                                  | `data/skill/thundercry-blade.json#PredatorsShield`                                                               |
| 20401102        | Galecloud Cleave                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401103        | Avalanche                                                          | `data/skill/thundercry-blade.json#Avalanche`                                                                     |
| 20401104        | Vitality Slash                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401107        | Sunrush Gale                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401108        | Mo Blade                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20401114        | Stonebreaker Cleave                                                | `data/skill/thundercry-blade.json#StonebreakerCleave`                                                            |
| 20402002        | Mo Blade - Heavy Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20402101        | Soul Burning                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20402102        | Legion Summoner                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20402103        | Soul Burning                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20402104        | Soul Burning                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501001        | Dual Blades - Light Attack                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501011        | Blade of Heaven's Wrath                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501301        | Dual Blades - Airborne Light Attack                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501305        | Dual Blades - Jump Strike                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501401        | Dual Blades - Dash                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501402        | Dual Blades - Recovery                                             | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501403        | Dual Blades                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501603        | Defensive Riposte                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20501605        | Dual Blades - Execute                                              | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20502001        | Addled Mind                                                        | `data/skill/infernal-twinblades.json#AddledMind`                                                                 |
| 20502002        | Calamity's Greed                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20502003        | Flamelash                                                          | `data/skill/infernal-twinblades.json#Flamelash`                                                                  |
| 20502004        | Greed Bane - Pursuit                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20502005        | Greed Bane - Soul                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20502006        | Flamelash                                                          | `data/skill/infernal-twinblades.json#Flamelash`                                                                  |
| 20503001        | Dual Blades - Light Attack                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503006        | Blade Vessel                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503101        | Reveldrift                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503102        | Realmplay                                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503105        | Hero's Blood                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503106        | Hero's Blood - Inebriate                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503201        | Blade Against Waves                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503202        | Tidepour                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20503206        | Boundvessel                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601001        | Umbrella - Light Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601005        | Umbrella - Heavy Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601010        | Umbrella - Execute                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601015        | Umbrella - Dash                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601016        | Umbrella                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601023        | Umbrella - Recovery                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601101        | Colorful Phoenix                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601102        | Apricot Heaven                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601103        | Unfading Flower                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601104        | Bamboo Breeze                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601105        | Cloud Reverie                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601107        | Umbrella - Jump Strike                                             | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601108        | Umbrella - Airborne Light Attack                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601110        | Defensive Riposte                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601112        | Spring Away                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601113        | Spring Sorrow                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601201        | Hidden Sword - Light Attack                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601206        | Hidden Sword - Heavy Attack                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601212        | Hidden Sword - Airborne Light Attack                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601213        | Hidden Sword - Jump Strike                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20601217        | Hidden Sword: Charged Attack                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20602050        | Umbrella                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20602101        | Floating Grace                                                     | `data/skill/soulshade-umbrella.json#FloatingGrace`                                                               |
| 20602102        | Pale Petal                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20602103        | Herbal Resonance                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20602104        | Umbrella - Heavy Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20603005        | Umbrella - Heavy Attack                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20603102        | Cyclone Waltz                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20603103        | Cyclone Waltz                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20603201        | Dreamwrought Bubbles                                               | `data/skill/everspring-umbrella.json#DreamwroughtBubbles`                                                        |
| 20603202        | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 20603203        | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 20603204        | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 20603205        | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 20700001        | Rope Dart - Light Attack                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700101        | Rodent's Resilience                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700102        | Rodent's Resilience                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700301        | Rope Dart - Airborne Light Attack                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700305        | Rope Dart - Jump Strike                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700401        | Rope Dart - Dash                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700402        | Rope Dart - Recovery                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700403        | Rope Dart                                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700603        | Defensive Riposte                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20700605        | Rope Dart - Execute                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20701001        | Rodent Rampage                                                     | `data/skill/mortal-rope-dart.json#RodentRampage`                                                                 |
| 20701002        | Bladebound Thread                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20701003        | Coiled Dragon                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20702001        | Soul Sweep                                                         | `data/skill/unfettered-rope-dart.json#SoulSweep`                                                                 |
| 20702002        | Burn and Bury                                                      | `data/skill/unfettered-rope-dart.json#BurnAndBury`                                                               |
| 20702101        | Piercing Dart                                                      | `data/skill/unfettered-rope-dart.json#PiercingDart`                                                              |
| 20702102        | Piercing Dart                                                      | `data/skill/unfettered-rope-dart.json#PiercingDart`                                                              |
| 20702103        | Piercing Dart                                                      | `data/skill/unfettered-rope-dart.json#PiercingDart`                                                              |
| 20702104        | Piercing Dart                                                      | `data/skill/unfettered-rope-dart.json#PiercingDart`                                                              |
| 20703006        | Boundless Whirl                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20703101        | Snaring Lash                                                       | `data/skill/skygrasp-rope-dart.json#SnaringLash`                                                                 |
| 20703102        | Snaring Lash: Sever                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20703105        | Sky Grasped                                                        | `data/skill/skygrasp-rope-dart.json#SkyGrasped`                                                                  |
| 20801001        | Heng Blade - Light Attack                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801006        | Heng Blade - Heavy Attack                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801010        | Heng Blade - Dash                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801011        | Heng Blade - Airborne Light Attack                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801012        | Heng Blade - Jump Strike                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801090        | Heng Blade - Execute                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801096        | Heng Blade - Recovery                                              | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801101        | General's Bane                                                     | `data/skill/snowparting-blade.json#SnowpartingQ`                                                                 |
| 20801102        | General's Bane                                                     | `data/skill/snowparting-blade.json#SnowpartingQ`                                                                 |
| 20801103        | General's Bane                                                     | `data/skill/snowparting-blade.json#SnowpartingQ`                                                                 |
| 20801104        | General's Bane                                                     | `data/skill/snowparting-blade.json#SnowpartingQ`                                                                 |
| 20801105        | Fleeting Trace                                                     | `data/skill/snowparting-blade.json#SnowpartingSpecial`                                                           |
| 20801110        | Heng Blade                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801111        | Heng Blade - Defensive Riposte                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801201        | Stygian Freeze                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20801206        | Snowbreak Spring                                                   | `data/skill/snowparting-blade.json#SnowpartingHeavyVC`                                                           |
| 20901001        | Righteous Reign                                                    | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901006        | Virtuous Enthroned                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901010        | Gauntlets - Dash                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901011        | Gauntlets - Airborne Light Attack                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901012        | Gauntlets - Jump Strike                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901013        | Gauntlets - Dodge                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901090        | Gauntlets - Execute                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901096        | Gauntlets - Get Up                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901098        | Gauntlets - Execute                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901101        | Heavenwill Declared                                                | `data/skill/heavenwill-gauntlets.json#HeavenwillDeclared`                                                        |
| 20901102        | Castlink; Castlink - Jadeflush; Heaven's Will; Heavenwill Declared | `data/skill/heavenwill-gauntlets.json#HeavenwillDeclared`                                                        |
| 20901108        | All Under Justice                                                  | `data/skill/heavenwill-gauntlets.json#AllUnderJustice`                                                           |
| 20901110        | Gauntlets                                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901111        | Gauntlets - Defensive Riposte                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20901201        | Wicked Defiance                                                    | `data/skill/heavenwill-gauntlets.json#WickedDefiance`                                                            |
| 20902011        | Bloombreak                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902101        | Peakfall                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902102        | Castlink                                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902103        | Peakfall - Jadeflush                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902104        | Castlink - Jadeflush                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902108        | Nightwick - Tipsylay                                               | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902109        | Nightwick - Grounddrift                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902110        | Nightwick - Primepick                                              | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902111        | Nightwick - Tri-strike                                             | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20902206        | Dragonquench - Inebriate                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21000999        | (unnamed numerical record)                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001001        | Waist Drum: Light Attack                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001005        | Sleeve Dance                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001006        | Waist Drum: Heavy Attack                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001010        | Waist Drum: Dash                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001011        | Waist Drum: Airborne Light Attack                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001012        | Waist Drum: Jump Strike                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001013        | Waist Drum: Dodge                                                  | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001089        | Waist Drum: Execute                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001090        | Waist Drum: Execute                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001091        | Waist Drum: Defense                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001092        | Waist Drum: Jump                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001094        | Serene Breeze                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001095        | Serene Breeze                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001096        | Waist Drum: Get Up                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001098        | Waist Drum: Execute                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001101        | Plumage Sweep                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001102        | Rhythm of Accord                                                   | `data/skill/museflow-waist-drum.json#RhythmOfAccord`; `data/skill/museflow-waist-drum.json#RibbonLightChargedVC` |
| 21001103        | Heaven's Will                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001104        | Plumage Sweep                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001105        | Rippling Dew                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001106        | Ripple: Jadebreaker                                                | `data/skill/museflow-waist-drum.json#RippleJadebreaker`                                                          |
| 21001107        | Ripple: Dawnsun                                                    | `data/skill/museflow-waist-drum.json#RippleDawnsun`                                                              |
| 21001108        | Ripple: Toneflux                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001109        | Cancel                                                             | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001110        | Waist Drum                                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001111        | Waist Drum: Defensive Riposte                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 102552101       | Heng Blade Anxi Soldier                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 102552102       | Mo Blade Anxi                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 102552103       | Mo Blade Anxi                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 102552104       | Mo Blade Anxi                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 102552105       | Mo Blade Anxi                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 201021021       | Storm Dance                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 202011021       | Sword Slash Damage Boost; Vagrant Sword                            | `data/skill/nameless-sword.json#VagrantSword2`                                                                   |
| 204020021       | Burning Heart                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 204020022       | Burning Heart                                                      | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 206032031       | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 206032041       | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 206032051       | Scarlet Spin                                                       | `data/skill/everspring-umbrella.json#ScarletSpin`                                                                |
| 208010011       | Grave Frost                                                        | `data/skill/snowparting-blade.json#SnowpartingLightCharged`                                                      |
| 209010011       | Gauntlets - Light Attack                                           | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 209010061       | Virtuous Enthroned                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 209011092       | Vile Condemned                                                     | `data/skill/heavenwill-gauntlets.json#VileCondemned`                                                             |
| 209011093       | Vile Condemned - End                                               | `data/skill/heavenwill-gauntlets.json#VileCondemnedEnd`                                                          |
| 209011094       | Vile Condemned - End                                               | `data/skill/heavenwill-gauntlets.json#VileCondemnedEnd`                                                          |
| 210011050       | Ripple: Dawnsun; Ripple: Jadebreaker; Ripple: Toneflux             | `data/skill/museflow-waist-drum.json#RippleJadebreaker`; `data/skill/museflow-waist-drum.json#RippleDawnsun`     |
| 2030310101      | Boundless Bloom; Verdant Gust                                      | `data/skill/willowbend-fan.json#VerdantGust`; `data/skill/willowbend-fan.json#BoundlessBloom`                    |
| 2050300701      | Blade Vessel                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 2050320701      | Boundvessel                                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 2090110911      | Falcon Pursuit                                                     | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 2090110912      | Sky Grasped Falcon                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 2100100101      | Sleeve Dance                                                       | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 2100100102      | 舞绫鼓新武学-舞绫鼓.起身-                                          | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 2100110501      | Ripple: Dawnsun; Ripple: Jadebreaker; Ripple: Toneflux             | `data/skill/museflow-waist-drum.json#RippleJadebreaker`; `data/skill/museflow-waist-drum.json#RippleDawnsun`     |
| 2100110691      | Ripple: Jadebreaker                                                | `data/skill/museflow-waist-drum.json#RippleJadebreaker`                                                          |
| 2100110791      | Ripple: Dawnsun                                                    | `data/skill/museflow-waist-drum.json#RippleDawnsun`                                                              |
| 2100110891      | Ripple: Toneflux                                                   | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20301102911     | #JMorning Drizzle: Valor#E                                         | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303206300     | Willowbend Fan: EX                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303206301     | Willowbend Fan: EX                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303206302     | Willowbend Fan: EX                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303206303     | Willowbend Fan: EX                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 20303206304     | Willowbend Fan: EX                                                 | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001105300     | Museflow Waist Drum: EX                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001105301     | Museflow Waist Drum: EX                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001105302     | Museflow Waist Drum: EX                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001105303     | Museflow Waist Drum: EX                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 21001105304     | Museflow Waist Drum: EX                                            | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 35020000087     | #JEmerald Dewtouch: Valor#E                                        | Requires explicit component/route mapping; not automatically a missing skill.                                    |
| 35020000122     | Snaring Lash: Sever                                                | Requires explicit component/route mapping; not automatically a missing skill.                                    |

## Mystic skill inventory

| Source skill ID | Description / resolved names | Exact-name runtime candidates                                                 |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| 118007          | Mighty Drop                  | Requires explicit component/route mapping; not automatically a missing skill. |
| 118101          | Meteor Flight                | Requires explicit component/route mapping; not automatically a missing skill. |
| 118201          | Wind Rider                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 118301          | Fan Glider                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 118401          | Thousand-Mile Flight         | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300032         | Dragon's Breath              | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300033         | 江湖奇术-神龙吐火-爆燃暗灼   | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300039         | Tai Chi                      | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300042         | Cloud Steps; Wolflike Frenzy | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300045         | Drunken Poet                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300053         | Leaping Toad                 | `data/skill/mystic.json#LeapingToad`                                          |
| 2300056         | Free Morph                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300057         | Wolflike Frenzy              | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300058         | Soaring Spin                 | `data/skill/mystic.json#SoaringSpin2`                                         |
| 2300061         | Yaksha Rush                  | `data/skill/mystic.json#YakshaRush`                                           |
| 2300062         | Flaming Meteor               | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300063         | Golden Body                  | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300064         | Dragon Head                  | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300065         | Ghostly Steps                | `data/skill/mystic.json#GhostlySteps`                                         |
| 2300067         | Contortion                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300074         | Honking Havoc                | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300075         | Flute of the Tides           | `data/skill/mystic.json#FluteOfTheTides`                                      |
| 2300076         | Goosy Slide                  | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300077         | Second Childhood             | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300080         | Ever-Cold Heart              | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300081         | Bursting Nine                | `data/skill/mystic.json#BurstingNine`                                         |
| 2300082         | World to Sword               | `data/skill/mystic.json#WorldToSword`                                         |
| 2300085         | Snow Lion Form               | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300092         | Inkwash Splendor             | Requires explicit component/route mapping; not automatically a missing skill. |
| 2300095         | Dear Sword                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 11200018        | Wealth Galore                | Requires explicit component/route mapping; not automatically a missing skill. |
| 20000103        | Divine Counter               | Requires explicit component/route mapping; not automatically a missing skill. |
| 20000104        | Serene Breeze                | `data/skill/mystic.json#SereneBreeze`                                         |
| 20101021        | Threefold Skywalk            | Requires explicit component/route mapping; not automatically a missing skill. |
| 20101024        | Skywalk Dash                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 21000001        | Meridian Touch               | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700002        | Lion's Roar                  | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700005        | Blinding Mist                | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700006        | Talon Strike                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700012        | Guardian Palm                | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700014        | Nightborne Glow              | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700016        | Ghost Bind                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700018        | Veil of Stillness            | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700022        | Paired Radiance              | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700024        | Cyclone Spin                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700100        | Phantom Bubble               | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791101        | Morph: Thunder Roar          | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791102        | Morph: Wild Storm            | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791103        | Morph: Death Stride          | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791104        | Morph: Serene Sanctuary      | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791105        | Morph: Fiery Kite            | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791106        | Morph: Frosty Feathers       | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791107        | Morph: Rolling Assault       | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791109        | Morph: Shattered Form        | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791110        | Morph: Fowl Play             | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791113        | Morph: Swordbound            | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791114        | Morph: Disorientation        | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791115        | Morph: Puppetry Legacy       | Requires explicit component/route mapping; not automatically a missing skill. |
| 23791117        | Morph: Gale Force Counter    | Requires explicit component/route mapping; not automatically a missing skill. |
| 31000001        | Celestial Seize              | Requires explicit component/route mapping; not automatically a missing skill. |
| 53001007        | Touch of Death               | Requires explicit component/route mapping; not automatically a missing skill. |
| 280011201       | Vortex Wheel                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 280011301       | Explosive Barrel             | Requires explicit component/route mapping; not automatically a missing skill. |
| 280011401       | Bladed Puppet                | Requires explicit component/route mapping; not automatically a missing skill. |
| 23000000901     | Lovey-Dovey Art              | Requires explicit component/route mapping; not automatically a missing skill. |
| 23700005911     | Blinding Mist                | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000003     | Veil of Stillness            | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000090     | Thunder Roar                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000091     | Wild Storm                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000092     | Death Stride                 | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000093     | Serene Sanctuary             | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000094     | Fiery Kite                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000095     | Frosty Feathers              | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000096     | Rolling Assault              | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000097     | Shattered Form               | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000098     | Fowl Play                    | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000099     | Swordbound                   | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000100     | Disorientation               | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000101     | Puppetry Legacy              | Requires explicit component/route mapping; not automatically a missing skill. |
| 35020000103     | Gale Force Counter           | Requires explicit component/route mapping; not automatically a missing skill. |
