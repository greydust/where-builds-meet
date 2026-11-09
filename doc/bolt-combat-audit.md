# Bolt combat audit — 9 November 2026

The public Preview no longer requires Dev mode. The latest Fully Relayed
layout swaps one greaves Affinity roll for Momentum, targeting Solo 19:
39.390607567567564% effective Affinity and 90,795.0264579321 DPS.
Historical comparisons below retain the exact layout used for each audit.
Equipped Arts now take the highest value per family; the current Bolt
layouts already contain only one Art of Spear, so that correction affects
their priority comparison rather than their baseline damage.

## Blue VC timing and Deflect

The exported 20205201 routes give ordinary Blue VC two primary contacts
at 0.341360/0.628932 seconds and interruption at 1.0 second. The 鋒銳
route gives three contacts at 0.334252/0.561166/0.957528 seconds and
interruption at 1.2 seconds. The simulator already uses these interruption
points rather than the routes' full 4/5-second end times. The 鋒銳 route
is selected when the buff is active or a VC begins with six 槍勢.

Spear Deflect costs 0.3 seconds. Even assuming an unverified cancel
immediately after the last required contact/proc, ordinary Blue VC could
save at most about 0.071 second; 鋒銳 Blue VC's last 載戈 at 0.973528
plus Deflect would take about 1.274 seconds and be slower. No earlier
Deflect-specific window or preserved VC continuation is established by
the imported timing routes. Adding ordinary Deflect rows does not itself
shorten the preceding cast, so the preset is unchanged.

The fully progressed Solo-25 result is recorded separately in
[the damage breakdown](reports/bolt-solo-25-2026-11-09.md).

## Scope and source

This audit covers outgoing PvE damage and the resource/buff lifecycle of the
Bolt preview, including the four equipped Inner Ways, selectable 歲星竊桃,
both martial-art talent tables, supported skill routes, all five attunements,
and 寒芒. The reference is CN Normal layer 1, manifest
`94a090d784fc4f1d5dd479ee818d024d3da0c1e6889f89a236da94cdb28f09d9`,
exported under
`local/datamine/2026-11-08_18-13-14-875_+0000-RWiW0j`.
The export is local investigation input, not a runtime dependency.

Primary records are `wwm-skills-normal-all.json`,
`wwm-skills-inner-way-all.json`, `wwm-martial-arts-normal.json`,
`wwm-inner-way-normal.json`, `wwm-attunements-cn.json`, `wwm-item-sets.json`,
`buff.json`, `buff_passive_data.json`, and `passive_skills.json`.
The source research repository's `notes/bolt-timings.md`,
`notes/yueyong-proc-timing.md`, and `notes/divinecraft.md` establish the
route, periodic-clock, and event-effect interpretations used here.

## Corrections

| Mechanic                   | Correct behavior and evidence                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 泉威                       | Source 4040171 grants 8% Physical/Bellstrike channel damage to the applier's damage generally. 4040172 adds another 6% to the VC series with 浮梁一夜 T3. Replaces 10% plus 4%, both formerly restricted to VCs.                                                                                       |
| 載戈 stacks                | 4040191 uses incoming adjustment event 1, 10% per stack, restricted to 鳴戈 2020420501 and the applier. This joins Category 1 (`hpDMGBonus`), separate from 鳴戈's 60% NPC base bonus and 鋒銳's base bonus. Explicit 1–15 stack effects are retained.                                                 |
| 通判 T6                    | 102753511–515 add two penetration per stack to the complete VC series, including 載戈 and 鳴戈, rather than primary VCs alone. The ordinary one per stack and base five remain.                                                                                                                        |
| Blue attack-scaling talent | 32320111/20211/20311 use **鋒銳 OR 鳴戈**, without a primary-VC restriction. Each complete 125 Maximum Physical Attack grants 1% Physical/Bellstrike channel damage, capped at 4%/8%/12% for ranks 2–5/6–7/8+. The formula remains live at the action snapshot.                                        |
| Red Affinity-damage talent | 32220111/20211/20311 grant 1.2% per complete 100 Maximum Physical Attack to the VC series, capped at 6%/12%/18% at the same rank boundaries. Previously missing lower-rank variants are present; continuous interpolation is removed.                                                                  |
| Rank-zero 鋒銳             | 322501 already grants the 15% NPC base bonus and 10% Affinity Damage. Abrasion immunity arrives with upgraded 322502 at rank 5. 神斷青鋒 T6 replaces the 15% base bonus with 30%.                                                                                                                      |
| 王行                       | 323501 uses 12 seconds; the simulator uses the authored 24 seconds for upgraded 323502 from talent rank 5. The native duration override remains untraced; both raw buff defaults are 12 seconds.                                                                                                       |
| No-flat proc enhancement   | 32250221/31 and subsequent ranks select the no-flat proc tags without a current-art condition. 載戈/鳴戈 retain this enhancement after switching to blue. Current-art gating remains on ordinary flat-attack bonuses.                                                                                  |
| 月湧方圓 T6 damage         | 10216014 writes `DAMAGE_UP` to the separate CN `targetCorrectionBonus` bracket, additive with native target correction and multiplicative with Category 1 / the event-34 ratio. Each complete percentage point of effective Affinity grants 1%, capped at 30%. This applies to both 潮湧 and 洪波萬仞. |

Event 1 maps to `_effect_event_adj_dmg`; incoming trigger 3 adjusts damage
parameters, including stack multiplication. It is the same additive family as
Soul-Shaken. In the current CN flow-one formula, `DAMAGE_UP` instead adds
with `TARGET_TAG_CORRECT` in its own later bracket. Both are represented
by `targetCorrectionBonus`, separate from Category 1 and cause-50/Mechanism.
Event 34's ratio adjustments remain in `baseDMGBonus`. The earlier Global
formula interpretation was superseded by the independent CN audit below.

## Verified behavior retained

| Area     | Audit result                                                                                                                                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 神斷青鋒 | Current-art Affinity Damage/leech, opposite-VC 明法/重道 bonuses, T3 enhancement, T4 duration/refill cooldown, and T6 cost/base-bonus replacement are represented.                                                                                                                                                    |
| 浮梁一夜 | Initial +2 槍勢, enhanced blue parry/refollow, exit +2, T3 duration and 泉威 extension, 王行 Direct Affinity, and T6 載戈/guaranteed-Affinity 鳴戈 are represented. All four preset detonations observe 15 stacks before consumption and retain 鋒銳 at damage settlement.                                            |
| 明非通判 | Base and stacked penetration, Affinity-dependent applications, T4 guaranteed VC/proc applications and 10-second duration, and T6 series enhancement are represented. Chance and guaranteed applications share the existing numeric outcome-stack tracker.                                                             |
| 月湧方圓 | 月相 activation, 月引 extension/HP cost, 暗潮, 潮信, 潮湧 carrier, initial direct-hit burst, and ten-Tide repeat counter are represented. The initial burst is additional and does not reset the repeat counter.                                                                                                      |
| 歲星竊桃 | Same-weapon martial-art bonus, Mystic penalty and immunity during 竊桃, on-Tab application/cooldown, Tab damage bonus, and T6 duration/additional martial damage are represented for Bolt's locked spear pair.                                                                                                        |
| T2/T5    | All five Inner Ways use the shared raw-stat pipeline and source Solo Level tables.                                                                                                                                                                                                                                    |
| Skills   | Level-100 ordinary Q/Special/Tab/charged and selectable basic coefficients match their source curves. Ordinary and 鋒銳 VC primary hits, contact 載戈, and 鳴戈 are separate identities. NPC Q/VC base corrections remain separate from ordinary damage bonuses. Zero-damage collision markers are not extra attacks. |
| Talents  | Rank-specific raw attributes, Momentum conversions, Bellstrike conversion, flat attack and no-flat proc enhancement are present. The shared Bellstrike primary-attribute multiplier already supplies the 50% attribute enhancement; it is not added twice.                                                            |
| Gear     | 寒芒 4 retains the two-piece Maximum Physical Attack plus its same-weapon HP-damage and VC/proc Affinity Damage bonuses. All five attunements use native category/tag matching; the build retains four VC attunements.                                                                                                |
| Rotation | Four 鋒銳 windows complete before the 60-second cutoff; 王行 covers the martial hits. Flute Cancel → Deflect follows the former #24 VC; Red Q → Blue VC is the legal closing chain.                                                                                                                                   |

## Model boundaries

This is an outgoing-DPS audit, not a claim that the simulator models every
defensive or control mechanic. Incoming attacks currently carry no martial-art,
Mystic, or multiplayer-boss classification. Consequently the conditional
defensive portions of 歲星竊桃, blue 王行's multiplayer-boss reduction, and
cast-only control/mitigation effects are not represented as unconditional
reductions. They do not raise this passive Dummy's outgoing damage.

The approved expected-value 月引 extension, whole-battle-second expected 潮湧
clock, and tiny 月相 probability promotion remain deliberate approximations;
sampled fights retain native extensions and carrier-relative ticks.
Animation/contact clocks remain source `audit-provisional`, with nominal
immediate eligible contact and no inferred native network delay.
Unsupported red basic-chain identities and the unactivated C3 collision are
not fabricated. The separate 240000113 threefold red-VC branch requires its
own buff; it is not applied to the ordinary preset.

`tests/bolt-audit.test.ts` verifies the corrected mechanics through observable
damage and buff duration. The existing Bolt combat, Moon, stats, and attunement
tests cover their shared integration. No accepted DPS snapshot is rewritten by
this audit.

The production calculator's Fully Relayed BT19 result on Dummy 1 Min changes
from 70,316.54681955876 to 74,016.13154807402 DPS (+5.2613%). This comparison
uses Simmering Fish Slices, no Script, Fire Divinecraft, the default global
debuff selections, and no skill overrides. Duration and primary red/blue VC
hit counts are unchanged. The four 鳴戈 detonations rise from 604,184.0093 to
736,223.6684 total damage, chiefly from the corrected stack category and T6
penetration. The other gains come from corrected damage scopes and proc talents;
the 月湧方圓 category correction is included in the same result.

## Independent CN audit follow-up

The internal repository's
`reports/bolt-damage-calculation-audit-2026-11-09.md` supersedes the
initial target-ratio, Moon-category and primary-only attunement claims.
Its native table/consumer audit confirms:

- `SKILL_XFQY_PSJ_ADD` maps primary VCs and calcpoints
  2020420301, 2020420401 and
  2020420501: ordinary/enhanced 載戈 and 鳴戈 all receive the VC attunement.
- 載戈 has a 50% NPC correction without changing its 0.276 coefficients.
- 鋒銳's event-34 ratio multiplies the separate NPC/`DAMAGE_UP` bracket.
  T6 enhanced VC is 1.30 × 1.50; 鳴戈 is 1.30 × 1.60.
- Moon T6's bonus belongs in that later correction bracket, not Category 1.
- Forced 鳴戈 Affinity is explicitly gated by 浮梁一夜 T6.

The implementation uses `BoltVCSeries` for attunement matching; both procs
already have `VariedCombo`. The distinct primary `BoltVC` trigger marker is
retained so proc hits do not consume extra 槍勢 or become additional cross-VC
casts. Skill-specific damage identities remain separate.

A fresh full production calculation with the same BT19 fixture gives
5,326,506.046557666 damage / 60 seconds = 88,775.1007759611 DPS,
up 19.9402% from 74,016.13154807402. All 426 damage rows remain, including
75 載戈 and four 鳴戈 contacts, and the rotation still consumes 24 槍勢.
This agrees with the independent fixed-leaf estimate within floating-point
rounding. A subsequent CN settlement trace supplied on 9 November 2026
supports early-Tab damage using the caster's current 載戈 stacks before
clearing them on the ordinary locally handled path: a sole queued 鳴戈
request settles immediately before the graph resumes. Each active stack
adds 10% in the event-damage bracket, capped at 150% for 15 stacks.
If another hit is already queued, processing can be deferred with a 1 ms
retry; queued or server-forwarded hits do not have a proven equivalent
stack snapshot. The observed fight's queue states are unknown. The model
retains damage before full stack consumption, without inventing queue
delays. 王行's native duration override, Fire settlement, and other
network/contact-clock qualifications remain unresolved.

The old HTML/JSON/ZIP report is preserved as the frozen pre-correction input,
not a live description of current damage. No accepted DPS snapshots are changed.
The corresponding BT18 result is 84,918.03800208846 DPS. The full build passes
2,005 tests, and lint/format checks pass. The DPS snapshot run reproduces all
existing accepted cases; its only failures are the missing initial Bolt BT18
and BT19 snapshots. Those remain pending explicit snapshot review.

## Later rotation update

Moving Flute Cancel / Deflect after the Blue VC formerly numbered #24 removes
the 0.8614-second cooldown wait. The second Flute starts at 22.6429 seconds;
the fourth 鋒銳 window completes at 58.8972 seconds. Red Q / Blue VC
then supplies two Q contacts and one ordinary Blue VC contact before 60 seconds,
with the last contact at 59.9486. 王行 coverage and all four 鋒銳 windows remain.
The final VC's resource-granting second hit falls outside the cutoff, leaving
槍勢 at two; consumed 槍勢 remains 24. A fresh VC entry requires Red Q,
Blue Special or Tab. The earlier Heavy 1 / Blue VC ending was invalid.

The updated BT19 fixture calculates 89,646.60923191169 DPS. The 74,016 and
88,775 figures above describe the earlier frozen rotation at their audit stages.
Qi uses authored 60%/40% thresholds before both hit-attached breaks, with the
first exhaust restoring Qi after ten seconds and a further four-second immunity
before the next depletion segment. This is an encounter model, not a native
Qi-damage calculation. See `doc/skill-data.md` for the timing policy.

## Wielded-art context follow-up

The damage requirement boundary previously omitted `currentMartialArt` and
`currentWeapon`, although timeline action snapshots already tracked them. This
suppressed 神斷青鋒 T0's red-spear Affinity Damage outside the T6 鋒銳 branch
and the spears' current-art flat-attack talents. The fields now reach damage
requirements and participate in prepared effect-state cache identity.

The same BT19 rotation now calculates 90,478.44162539956 DPS. A controlled
change of only the T6 鋒銳 ratio from 30% to 15%, keeping its resource effects,
loses 7,494.7738390032755 DPS (8.2835%). Before the detonation-guard correction below, removing the whole Inner Way
incorrectly lost only 4,126.713588204439 DPS (4.5610%). That result included
duplicate detonations, not merely a legitimate change of rotation/proc schedules.
The model still allows cross-spear VC execution without 神斷青鋒; a removal
comparison therefore does not price the loss of shared VC availability and
is not a validated legal alternative rotation. The conditional damage fix
does not claim to resolve this separate availability limitation.

Validation after this fix: 2,009 ordinary tests and the production build pass.
All previously accepted DPS snapshots remain unchanged; the snapshot gate
still reports only Bolt's missing initial BT18/BT19 baselines. No snapshots
were refreshed.

## Once-per-window 鳴戈 guard correction

Tracing 神斷青鋒 removal revealed four extra 鳴戈 events inside two of the
same 鋒銳 windows. `BoltMingGeSpent` incorrectly used `duration: -1`; the
ordinary tracked-effect engine computes `time + duration`, so that marker
expired immediately instead of persisting. A permanent ordinary marker must
omit `duration`. It is cleared explicitly when the next 鋒銳 window begins.

`BoltEarlyMingGe` also consumed only one 載戈 stack by default. It now uses
`stack: "all"` after damage settlement. Native coefficients and the current
T6 preset's four 15-stack detonations are unchanged. Cross-spear VC availability
is deliberately left unchanged at the user's request.

| Removal-run 鋒銳 start | Old 鳴戈 times            | Corrected 鳴戈 times |
| ---------------------- | ------------------------- | -------------------- |
| 3.374s                 | 9.294s                    | 9.294s               |
| 16.319s                | 16.757s, 18.759s, 25.483s | 16.757s              |
| 30.953s                | 36.873s                   | 36.873s              |
| 44.482s                | 44.792s, 46.826s, 51.737s | 44.792s              |
| 57.207s                | none before cutoff        | none before cutoff   |

The normal production comparison now gives 90,478.44162539956 DPS with
神斷青鋒 versus 70,504.86915962482 without it: a 19,973.572465774734 DPS
loss, or 22.0755% of the baseline. The earlier isolated T6 ratio test remains
a different experiment: it keeps every other tier/resource benefit and changes
only the 30% ratio to 15%, costing about 7,495 DPS (8.2835%). These percentages
are not additive.

The combat regression checks both equipped and removed variants. It limits
each mode window to one detonation and independently reconstructs target stacks
from 載戈 hits, the eight-second expiry, and full consumption after every 鳴戈.
