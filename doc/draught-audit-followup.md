# Draught source review follow-up

7 November 2026. This records the implementation response to the independent
[source review](../../where-datas-mine-internal/reports/draught-boost-audit-review.html).
The [original boost report](draught-boost-audit.md) and its JSON remain a historical
snapshot of the implementation inspected by the datamining agent. They have not
been regenerated to erase the discrepancies the review found.

## Confirmed corrections

| Finding                                                                   | Implementation                                                                                                                                                   | Observable checks                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Skystrike dynamic critical talent is stepwise                             | `floor(action minPhys / 50) * 0.02`, capped at 0.30                                                                                                              | At 749 the bonus is 28%; at 750 it is 30%                                                                                                 |
| Riven Inebriate channel talent is stepwise                                | `floor(action minPhys / 83.33) * 0.01`, capped at 0.09, independently for Physical and Bamboocut                                                                 | At 83.32 no step; at 83.33 one step; at 749 eight steps; at 750 nine steps                                                                |
| These two dynamic passives read combat attributes, not STEADY conversions | `formula.resolveAt: "action"` bypasses raw talent binding; shared formula resolver supports positive `step` inputs                                               | A low raw input does not freeze a later action's higher combat input                                                                      |
| Eonpour's exhausted-target tag includes Castlink                          | `DraughtExhaustedTrigger` marks ordinary and Jadeflush Peakfall/Castlink, representing native tag 1125                                                           | Each of the four authored skill routes triggers once against Exhausted; another admitted hit cannot bypass the 60-second cooldown         |
| Successful non-Arena parry restores Binge without Carouse                 | Skystrike's successful Deflect response grants 5 Binge, with a separate one-second trigger cooldown                                                              | Plain Deflect grants none; successful parries work without Carouse; rapid repeats share the cooldown                                      |
| Skyspeak's exit changes the drain rather than resetting the meter         | Deepdaze expiry drains 140 Binge with T1, otherwise 200, through the existing clamped resource action                                                            | 180 becomes 40 with T1; 200 becomes 60; 180 becomes zero without T1                                                                       |
| Skystrike's coefficient exception is source-tag scoped                    | `SkystrikeCoefficientEnhanced` represents tag 1123 on the supported Falcon effect; the coefficient rule is separate from the ordinary gauntlet Bonus Attack rule | Existing Falcon contribution remains unchanged; unmarked flat-free gauntlet effects no longer inherit the exception merely from their art |

Source rows: dynamic passives 32020311 and 32120311; exhausted-target passives
102701521/522; successful-parry passive 32050111 selected by buff 3205021;
Deepdaze-exit passives 2002651/2; coefficient passive 32050221. The existing dodge reward now also requires at least 100 Binge, Carouse and
active Skystrike Gauntlets, matching selected passive 2002631. It is separate
from the unconditional successful-parry reward. No orphan
32050112 or unselected 102702201 resource rule was activated.

## Target interpretation

The user confirms that the practice dummy counts as a boss and all current
simulator target profiles represent bosses for this mechanic. Eonpour therefore
retains its Exhausted and cooldown checks on the current Dummy, DummyAttack and
Boss profiles. The saved generic Dummy selection is preserved; it is not changed
to Boss merely to force the proc. An arbitrary future non-boss target is outside
this confirmation.

This also resolves the current comparison's assumption about the dummy accepting
boss damage. It does not establish Controlled state, native resistances, or native
missing-HP behavior; those remain separate from boss and non-player admission.

## Combat attribute assembly remains qualified

The native consumer calls `get_combat_attr(MIN_W_ATK)` and uses integer division.
The simulator now evaluates these two passives against ordinary action `minPhys`,
after current action stat contributions, instead of the immutable raw snapshot.
STEADY rank conversions continue using the original raw pipeline.

Exact native assembly of food/effective bonuses and percentage attack into
`MIN_W_ATK` remains unaudited. The new action binding is not a claim that ordinary
`minPhys` already reproduces every native assembly step. The chosen input mapping
is explicit in [stat-pipeline.md](stat-pipeline.md). No extra food or Tiltrim
percentage multiplier was invented for the dynamic talent input.

## Rotation results

The current BT18 Fully Relayed Min preset with food, Wraithstrike, Fire and no
Boss Talent remains **4,956,387.2649116935 total damage**, or
**82,606.4544151949 DPS**. It is bit-identical to the pre-review value in the
original machine-readable report.

The corrections do not increase this preset's damage: its dynamic talents already
hit their caps, its normal expiry starts at 200 Binge, and no newly eligible
Castlink beats the already admitted exhausted-target Peakfall to the cooldown.
All five saved Deflect steps remain plain authored Deflects; none is silently
converted into a successful native parry. The final ordinary Hero's Blood still
settles Drunkslay at **59.673466 seconds** under the current recording model.

The reported-attack diagnostic from the prior revision was **5,037,155.809165997**;
this follow-up's numerical rerun uses the actual preset sheet, not those endpoint
substitutions. The original 5.325M game screenshot also has a different rotation
contact count, so no new accepted DPS target is proposed.

## Recording diagnostics

[The diagnostic JSON](draught-audit-followup-data.json) exposes mark applications,
model settlement reasons, interval boundaries, recorded sums and contributing
source-action IDs. Times are battle-relative. Intervals include their start and
exclude their settlement instant for matching source damage.

| Recording start | Settlement time | Native mark application at settlement                 | Recorded hits | Recorded damage | Model payout |
| --------------: | --------------: | ----------------------------------------------------- | ------------: | --------------: | -----------: |
|        0.000000 |       15.758030 | Ordinary Hero's Blood explicitly removes then applies |            35 |     874,616.224 |  209,907.894 |
|       15.758030 |       32.605285 | Eonpour applies without an explicit remove            |            37 |   1,003,977.709 |  240,954.650 |
|       32.605285 |       43.031377 | Ordinary Hero's Blood explicitly removes then applies |            29 |     823,013.154 |  197,523.157 |
|       43.031377 |       59.673466 | Ordinary Hero's Blood explicitly removes then applies |            38 |     954,518.384 |  229,084.412 |

The second settlement remains **provisional**. The current shared recording engine
settles on reapplication; the review did not prove that Eonpour's plain native
application destroys and recreates the recording effect. Its four model payouts
must not be presented as proof of four game payouts. No blanket lifecycle change
was made to Drunkslay or the shared recording engine without that evidence.

## Findings retained without speculative changes

- Eonpour's separate numerical-ratio multiplier and the 10% / 20% / 40% PvE tier
  sums are supported. The correction already implemented is retained.
- Drunkslay's 0.20 HP fraction and Wildstride's 20% settlement adjustment remain
  24% when their conditions hold. The separate 0.12 parameter is Qi recording,
  not an additional 12% HP bonus. Qi replay remains outside the authored Qi model.
- The Inebriate-family 5% critical bonus remains counted once. No second 5% was
  added from Deepdaze's matching native family definition.
- Carouse remains 20 seconds with the selected Riven talent, not the bare buff's
  ten-second duration.
- Tiltrim's equal attack percentages already scale Formless after conversion to
  the primary channel; no second Formless attack boost is added. Replay/periodic
  trigger admission and same-hit stack ordering still need caller-level evidence.
- Mistwing's replacement families and zero missing-HP scaling at 99% are retained.
  Exact native equality boundaries remain unverified.
- Unmarked Quick Drink's gain is not source-certified as zero. The separate native
  resource nodes and the extra graph dispatch still need investigation. Existing
  25/50 marked-gain behavior and 0.301/0.315-second branches were not arbitrarily
  combined or changed.
- Sober-up is not presumed to drain this PvE run; the reviewed helper has PvP gates.
- Morale Chant, Breaking Point, Flute boundaries, complete native attribute assembly
  and Divinecraft were not newly certified by the bounded external review.

## Validation

Focused checks cover actual damage at below-cap dynamic talent boundaries,
raw-versus-action binding, successful-parry admission/cooldown, partial-meter
Deepdaze expiry, all four source-admitted Eonpour skill routes, and the saved
rotation's contacts and payout timing. Existing accepted DPS snapshots remain
unchanged; Draught's eight initial snapshots remain missing and unapproved.

Final validation: `npm run build` passed all 1,937 tests, TypeScript and Vite;
`npm run lint` and `npm run format:check` passed. The DPS guard reports only
the eight missing Draught snapshots; no accepted snapshot was updated.

## Falcon contact count remains provisional

The saved rotation has six quick drinks. `FalconsPursuit` currently authors one
nominal contact per drink, hence six damage contacts; that is not a validated
native contact count. The user expects three per drink, which would yield 18.
Current Quick Drink graph-6 BulletAttack nodes for gauntlet hit 2090200602 allow
six contacts per target with a 0.03-second repeat-admission interval. These are
collision limits, not a fixed count or an authored contact schedule. The matching
Physical/attribute coefficient is 0.487872 per admitted gauntlet contact, with no
stored target correction on this calcpoint. Native Riven projectile branches use
a different calcpoint and must not be conflated with the gauntlet branch.
Observed contact count and spacing are needed before replacing the provisional
single-contact model; do not turn the six-contact cap into six scheduled hits.
