# DPS regression snapshots

`npm run test:dps` compares every non-empty preset rotation, including WIP paths
against `tests/snapshots/rotation-dps.json`. The release deployment workflow
runs this guard before publishing, including manual deployments. Ordinary build,
tests, watch mode, and PR/main CI exclude the accepted-DPS comparison while
retaining its coverage, selector, and comparison-algorithm tests.

## Fixture selection

`tests/helpers/dps-snapshot-fixtures.ts` discovers rotation JSON files from each
path's existing rotation directory. Cases use stable `<pathId>/<rotationId>` keys.
Empty planner rotations are excluded. A durable coverage test checks all
non-empty rotation files against this catalog. The release guard compares the
catalog with accepted baseline keys, so new or removed presets cannot silently
escape review. A missing accepted baseline does not block ordinary builds.

Each rotation uses its path's default build unless an explicit build override
selects its corresponding variant: regular Kite uses the non-BP build, pure
Strength uses the pure build, and Double Stab uses the double-min build. The
remaining variants retain the path default. This covers all non-empty presets,
not every build/rotation combination.

Current calculations use breakthrough 17, each rotation's saved ping (40 ms
by default; 30 ms for Might), Simmering Fish Slices,
Fire Divinecraft, no Script, and no global or skill overrides. The rotation
supplies its martial arts and encounter flags; the build supplies its gear,
Inner Ways, and sets. Fixtures are passed to `src/application/graduation.ts`'s
`buildPresetRotationBundle` and `calculateRotationBaseline`, the production
calculation pipeline. No browser preferences or duplicate damage formulas enter
the check.

## Accepted values and review gate

The October 2026 Umbra release uses the user-approved current damage for all
presets. This includes the new WIP Umbra rotation, weapon-specific Deflect timing,
Endurance recovery before combat, and the approved Splendor Qi and Might Defense
alignment repairs. The snapshot JSON records the exact accepted values.

Schema version 2 replaces the old one-case-per-path file. Each case records its
fixture, DPS, total damage, and duration. The gate fails on:

- Any change beyond 4 units in the last place in DPS, total damage, or duration,
  independently for each rotation and in either direction.
- Missing or removed rotation coverage.
- A changed build, rotation, martial-art pair, or fixed environment.
- Non-finite, zero, or negative DPS, damage, or duration.

The budget is counted in ULPs rather than a percentage because the damage
pipeline is bit-deterministic: it uses only exactly specified IEEE-754
operations, accumulates in a fixed single-threaded order, and takes no
locale-, time-, or random-dependent input. The same inputs must therefore
reproduce the same bits. Four ULPs absorbs a single-representation shift from a
summation reassociation or an engine change and rejects every real change; a 1%
band was roughly 8x10^11 ULPs wide and silently accepted unreviewed edits. All
three stored numbers are compared, and changes accumulate against the last
accepted value, not the previous test run.

At the user's request, expanded non-Deluge baselines preserve the values from
before this session's ping, timing, and preset changes. They were reconstructed
using rotation and skill data from revision
`f13eee3e2c6bc5b1a547a54bff7679110418fdf9` with zero ping. The production
calculator reproduced the existing Kite, Might, and Strength accepted baselines
exactly before seeding their additional rotations. Their fixture ping is
explicitly 0; comparison with the current 40 ms environment intentionally flags
an environment change until each new result is reviewed.

All four Deluge rotations instead use the user-approved current data and 40 ms
ping. WTS Team's prior accepted value was reproduced exactly. These values cover
the Poet timing changes, aligned Deflects, revised Mystic timing, and opening WTS
delays where present. The existing Deluge acceptance is preserved.

Both Kite presets now use the user-approved current data and 40 ms ping:
regular Kite is 54,487.60 DPS and Kite BP is 60,168.91 DPS. These supersede
their pre-ping baselines and include the revised skill timings and damage,
VC readiness, defensive attack alignment, BP Qi-break anchor, and the updated
Light Attack Falcon coefficients.

Strength's Mixed Dummy 1 Min now uses its user-approved current result at 40 ms
ping: 65,625.29 DPS, replacing the previous 65,165.49 DPS snapshot (+0.71%).
Removing ping from Burning Heart's second and third charge stages accounts for
442.42 DPS of the increase; shortening Grave Frost's cast from 1.832 to 1.605
seconds accounts for the remaining 17.38 DPS. The General's Bane opener and
0.33-second delay before the later Legion Summon remain included.

Strength's Mixed Dummy Infinite Vitality 1 Min now uses its user-approved result
at 40 ms ping: 66,557.16 DPS, replacing 66,827.33 DPS at zero ping (-0.40%).
This includes the Burning Heart ping exemptions, paired dummy attacks, and the
combat-start anchor on the final hit of the first Fleeting Trace. Its dodge
activates Mystery DMG Boost on the 11.5-second dummy attack. The accepted value
was later raised to 66,557.16 DPS when the Heng Blade Varied Combo base damage
bonus was modelled explicitly instead of folded into its coefficient.

Strength's Mixed Dummy Smolder Poet 1 Min now uses its user-approved result at
40 ms ping with Infinite Vitality enabled: 66,371.50 DPS, replacing 63,485.87 DPS
at zero ping with finite Vitality (+4.55%). Infinite Vitality removes the previous
Mystic damage scaling from available Vitality. The current skill timings and
60-second cutoff remain, including the final Flute tick falling outside combat.

Strength's Pure Dummy 1 Min now uses its user-approved result at 40 ms ping:
63,888.11 DPS, replacing 64,359.42 DPS at zero ping (-0.73%). This includes
the 1.605-second base Heng LC cast (0.955 seconds with Forgetfulness),
the revised fillers that avoid immediate VC-to-Tab transitions, and the
additional LC/VC pair. All 13 LC casts are fast and land all four hits.
Might's Dummy 1 Min now uses its user-approved result at 30 ms ping:
77,276.26 DPS, replacing 76,333.79 DPS at zero ping (+1.23%). It includes the
current Avalanche timing and damage, first-hit battle-start anchor, revised
Cleave sequence, and attack-driven Defense holds. The added final Cleave lands
its first hit at 59.734 seconds for 68,063.54 damage; its Quake at 60.022 seconds
falls outside the 60-second combat window. This adds 1,134.39 DPS compared with
the preceding 76,141.87 DPS rotation.

Strength's Mixed Double Stab now uses its user-approved result at 40 ms ping:
65,564.25 DPS, replacing 65,244.22 DPS at zero ping (+0.51%). This includes
the revised opener and skill sequence, Burning Heart charge/slam ping exemptions,
and the later Heng LC timing update. Its accepted value was likewise raised from
65,563.95 DPS by the same Heng Blade Varied Combo rescaling. All current preset
snapshots have now completed the ping-transition review.

Wind's Dummy 1 Min Infinite Vitality uses the user-approved current rotation and
`wind-fully-relayed-min` build at 40 ms ping: 67,931.14 DPS over 60 seconds,
with 4,075,868.36 total damage. This user-approved refresh replaces the initial
67,575.85 DPS baseline after correcting Flamelash's judgment-bypassing critical
bonus and updating Wind's weapon affixes. It includes the current Hellfire,
Enhanced Rodent Rampage, delayed Rodent hits, and authored rotation adjustments.

Might's latest approved refresh is 78,121.61 DPS, replacing 77,276.26 DPS
(+1.09%). It includes Thundercry's restored Physical Attack Up talent and all
four added HP/defense enhancement entries in system progression. The added HP
also feeds Thundercry's charged/varied-combo talent scaling; the preset remains
at 30 ms ping with the same combat duration.

Dust's Dummy 1 Min keeps the 58,334.43 DPS baseline accepted with its
implementation, at the rotation's own 20 ms ping, with 3,500,065.96 total damage.
It is the path's only preset rotation, so promoting Dust from WIP to available
changed no snapshot.

Dust's Dummy 1 Min now uses its user-approved result at the rotation's own 35 ms
ping: 57,947.14 DPS, replacing 58,402.80 DPS (-0.78%), with 3,476,828.22 total
damage. Piercing Dart's seven sweep coefficients were corrected against the
`20702104` `timings.hitCoefficients` curves at level 100, which lowers the
seven-hit coefficient total from 9.5782 to 3.62181; the old values repeated one
coefficient across hits 4-7. The measured seven-hit marker series and the
four-hit release's cast time were also corrected, and the rotation's Qi steps
re-anchored so the exhaust stays on the second Scarlet Spin's sixth forward hit.
Timing and coefficients account for +0.085% and -0.843% respectively. Because
Piercing Dart is a small share of this rotation's damage, a 62% coefficient
correction moves total DPS by under 1%.

Dust's second rotation, `dust-dummy-1-min-100pc`, is the path default and uses its
user-approved result at its own 40 ms ping: 58,915.82 DPS with 3,534,949.26 total
damage over 60 seconds. It anchors battle start on the four-hit release's first
hit, which depends on the anchored action's own resolved time rather than its
position in the action array, so the release's own Soul Loss applications land in
combat and the opener breaks Soul Loss. Its whole sequence fits the window, so
unlike the first rotation it has no unreachable trailing step. Its exhaust sits on
the fifth forward hit of the second Scarlet Spin, which covers that spin's denser
middle instead of its tail and replaced 58,899.96 DPS (+0.027%) with the approved
value above.

Both Dust rotations then moved together when a Scarlet Spin throw was made to crit
the Resonances it summons, taking Dummy 1 Min to 59,450.02 DPS (3,567,001.03 total
damage) and the 100% Phantom Chime rotation to 59,121.24 DPS (3,547,274.56), each
+0.35% with an unchanged 60-second duration. Every 3rd catch grants Fragrant Song
and the throw that spends it summons two Resonances, so 12 throws per rotation
own 24 sites and 21 of them resolve before the fight ends. See
[skill-data.md](skill-data.md) for why the bonus needs a per-throw marker.

## Updating reviewed rotations

Run `npm run test:dps`, explain each affected rotation's old/new result and cause,
and obtain acceptance before updating it. `DPS_UPDATE_IDS` accepts an exact case
ID, a path ID to select all its rotations, or `all`. Unselected baselines remain
unchanged; unknown or overlapping selectors fail.

In PowerShell:

```powershell
$env:DPS_UPDATE_IDS = "bamboocutKite/dummy-1-min-iv-bp"
try {
  npm run snapshots:dps:update
} finally {
  Remove-Item Env:DPS_UPDATE_IDS
}
```

In a POSIX shell:

```sh
DPS_UPDATE_IDS="silkbindDeluge" npm run snapshots:dps:update
DPS_UPDATE_IDS="stonesplitStrength/pure-dummy-1-min stonesplitMight/dummy-1-min" npm run snapshots:dps:update
```

Use `all` only after every current rotation has been accepted; it also removes
obsolete baseline keys. Leave the variable unset during release checks. Inspect
the resulting diff and run formatting, build, and release snapshot checks before
publishing. Focused mechanic tests remain necessary when timing or buff changes
can offset each other in total DPS.

## Accepted: 33 ms DOT timer wheel

The timer-wheel data change adopts 528 ms burn intervals, 1,023 ms other DOT
intervals and adjusted positive initial delays, plus 132 ms Hellfire drains.
Smolder and Combustion now tick immediately; their initial lifetimes and
extensions preserve single-cast tick totals. Slower DOT cadence changes tick
counts and downstream trigger/resource feedback. Longer Hellfire retention
increases Wind damage. Umbra also uses the canceled Stage 1 Slash preset
and recalibrated Qi milestones. These results include the current working-tree changes.

The user accepted all 17 preset changes on 2026-10-11, and their snapshots
were refreshed after review. Every affected duration remains 60 seconds;
total damage is DPS multiplied by 60. Exact DPS values follow.

| Rotation path                                            |       Previous DPS |       Accepted DPS |
| -------------------------------------------------------- | -----------------: | -----------------: |
| `bamboocutDust/dust-dummy-1-min-100pc`                   |  59162.81970722088 | 63125.513140949406 | 3549769.1824332527 | 3787530.7884569643 |
| `bamboocutDust/dust-dummy-1-min`                         |  59428.59338014854 |  63328.31151211581 | 3565715.6028089123 | 3799698.690726949  |
| `bamboocutKite/dummy-1-min-infinite-vitality`            |    55737.139443286 |  57451.30293458791 | 3344228.36659716   | 3447078.1760752746 |
| `bamboocutKite/dummy-1-min-iv-bp`                        |  61467.81864820691 | 62596.641810462184 | 3688069.1188924145 | 3755798.508627731  |
| `bamboocutWind/wind-dummy-1-min-infinite-vitality`       |  69171.64928913544 |  69226.94478501238 | 4150298.9573481265 | 4153616.687100744  |
| `bellstrikeSplendor/dummy-1-min-81-waves`                |  65349.68233467729 |  65623.09394740312 | 3920980.940080637  | 3937385.636844187  |
| `bellstrikeUmbra/dummy-1-min-38-bb`                      |  79816.92602300833 |  79820.02675353442 | 4789015.5613805    | 4789201.605212065  |
| `silkbindDeluge/dummy-1-min-regular-fire`                | 29795.703973489002 |  29793.61498851086 | 1787742.2384093401 | 1787616.8993106517 |
| `silkbindDeluge/dummy-1-min-smolder`                     | 36504.170596575765 |  36654.94652217669 | 2190250.235794546  | 2199296.791330601  |
| `silkbindDeluge/dummy-1-min-wts-team`                    |   38839.4023092996 |  38486.36615934393 | 2330364.138557976  | 2309181.9695606357 |
| `silkbindDeluge/dummy-1-min-wts`                         | 35571.006125529166 | 35965.542258448586 | 2134260.36753175   | 2157932.5355069153 |
| `stonesplitMight/dummy-1-min`                            |  79503.85066834385 |  79486.75718449506 |
| `stonesplitStrength/mixed-dummy-1-min-double-stab`       |  66771.02076597798 |  66752.02424355024 |
| `stonesplitStrength/mixed-dummy-1-min`                   |  67395.84544895132 |  67395.58756016383 | 4043750.72693708   | 4043735.2536098287 |
| `stonesplitStrength/mixed-dummy-infinite-vitality-1-min` |  67757.04178633557 |   67759.9259617702 | 4065422.5071801343 | 4065595.5577062126 |
| `stonesplitStrength/mixed-dummy-smolder-poet-1-min`      |  67656.17965543146 |  67943.77984410097 | 4059370.779325888  | 4076626.7906460576 |
| `stonesplitStrength/pure-dummy-1-min`                    |  62302.13462491019 |  62120.66959661327 | 3738128.0774946115 | 3727240.175796796  |

## Wings Preview and Morale Chant healing review (2026-10-12)

The user confirmed that Morale Chant's T6 healing proc puts its damage proc on
the same 10-second cooldown, and accepted these four Deluge changes. Healing
also builds Yi River stacks. In WTS Team, healing takes the shared cooldown
before all five former damage procs; the lost 41,625 damage is partly offset by
earlier stack bonuses, producing a net loss of 38,012 damage over 60 seconds.

| Deluge rotation |      Previous DPS |       Accepted DPS |
| --------------- | ----------------: | -----------------: |
| Regular Fire    | 29803.73756241419 | 29795.703973489002 |
| Smolder         | 36628.55379060283 | 36504.170596575765 |
| WTS             | 35847.48213895326 | 35571.006125529166 |
| WTS Team        | 39472.94285759795 |   38839.4023092996 |

The user also accepted the initial Wings Preview snapshots: Jadebreaker at
50343.070273433346 DPS and Dawnsun at 35943.38925113531 DPS. Both use the
Fully Relayed Min Build and a 60-second encounter. Remaining Wings limitations
are tracked in `wings-implementation-audit.md`. All other accepted snapshots
remain unchanged.

## Wings attribute multiplier correction review (2026-10-12)

The user accepted the corrected Wings snapshots after reviewing the duplicated
primary-attribute multiplier. Both Wings skill files now retain equal Physical
and attribute coefficients; the shared damage calculator applies the 1.5 primary
Silkbind multiplier once. Flat damage, timing, and rotation sequences are unchanged.

At breakthrough 17 on Fully Relayed Min, Dawnsun changes from
35,943.38925113531 to 32,612.608937578592 DPS and from 2,156,603.355068119
to 1,956,756.5362547156 total damage. Jadebreaker changes from
50,343.070273433346 to 45,143.906152993135 DPS and from 3,020,584.216406001
to 2,708,634.3691795883 total damage. Both durations remain 60 seconds.
Only these two reviewed snapshots were refreshed.

The corrected comparisons retain Min as the best of the four Wings layouts at
both gear tiers. Double Min returns to Physical penetration, and Graduate uses
the winning non-relayed Min layout at both tiers. These preset changes do not
change the snapshot fixture, which continues to use Fully Relayed Min.

## Wings rotation and translation review (2026-10-13)

The user accepted the revised Wings presets after reviewing the opener, first-round
ordering, Qi break on the second Ripple's final hit, Smolder 2-hit cancel at skill
25, and infinite Vitality. Qi restores after ten seconds of Exhausted; the next
59.99% and 39.99% markers repeat the original depletion rate from that recovery.
The current first-round order retains the documented brief Cloudshear gap;
Smolder at skill 25 adds roughly 0.56 seconds without Cloudshear before the final Ripple.
End of Gale reapplies Driftbreeze. Skill translations and the EndOfGale and
RhythmOfAccord ID migrations preserve saved rotations and overrides.

| Preset      |       Previous DPS |      Accepted DPS | Previous total damage | Accepted total damage |
| ----------- | -----------------: | ----------------: | --------------------: | --------------------: |
| Jadebreaker | 46137.050187336594 | 49308.01325488668 |    2768223.0112401955 |    2958480.7952932008 |
| Dawnsun     |  33754.85510594089 | 36207.09043887357 |    2025291.3063564536 |     2172425.426332414 |

Both encounters remain 60 seconds and use the existing Fully Relayed Min fixture.
Only the two reviewed Wings snapshots were refreshed.

## Accepted: numerical balance patch and ping-independent skills (2026-10-15)

Scarlet Spin's parent ignores ping and its queued stages no longer request
trigger ping. All Mystic records, including composite components and cancel
variants, ignore ping. Both castable Deflect variants already ignored ping.
Dragonquench - Inebriate is deferred until its skill record exists.

The user approved these results for release on 2026-10-15 after reviewing the
numerical changes, Dust rotation repair, Deluge Intoxicated timing, and Pure
Strength Morale Chant cooldown effect. The affected snapshots are refreshed;
every encounter remains 60 seconds.

Every affected rotation retains its 60-second combat duration. Mystic latency changes affect event timing, buff coverage, periodic damage,
cooldown availability, and which attacks fit before Battle End. Dust additionally
starts 14 rather than 13 throws per full Scarlet Spin cast. Its 100% Phantom Chime
preset gains three Stage 2 throws and six Resonance rows. The regular Dust preset replaces the middle Soaring Spin with Dreamwrought Bubbles to preserve all 14 throws and all four Burn and Bury hits within Battle End. Soulbreak T6 settlement increases from 10% to 12% in both Dust presets. Kite additionally gains 12% Falcon base damage and the Bursting Nine decay floor increases from 10% to 20%; the latter also affects Pure Strength with infinite Vitality. Splendor gains the two Exhausted Qi Imbalance bonuses increasing from 8% to 10%. The BP CD marker has no damage effects.

The authored Qi ramps for Dust, Splendor, Umbra, and Wings have been recalibrated
to retain their documented hit anchors and depletion proportions. Might's first
three Defense durations gain 0.06, 0.03, and 0.03 seconds to retain the intended
dummy attack pairs; its accepted DPS remains unchanged. Deluge WTS's earlier
Mystic inputs can now reach the second manual Umbrella Special before its own
cooldown is ready; ordinary cooldown waiting keeps that cast valid.

| Rotation                                                 |       Previous DPS |       Accepted DPS | Previous total damage | Accepted total damage |
| -------------------------------------------------------- | -----------------: | -----------------: | --------------------: | --------------------: |
| `bamboocutDust/dust-dummy-1-min`                         |  59428.59338014854 |  63328.31151211581 |    3565715.6028089123 |     3799698.690726949 |
| `bamboocutDust/dust-dummy-1-min-100pc`                   |  59162.81970722088 | 63125.513140949406 |    3549769.1824332527 |    3787530.7884569643 |
| `bamboocutKite/dummy-1-min-infinite-vitality`            |    55737.139443286 |  57451.30293458791 |      3344228.36659716 |    3447078.1760752746 |
| `bamboocutKite/dummy-1-min-iv-bp`                        |  61467.81864820691 | 62596.641810462184 |    3688069.1188924145 |     3755798.508627731 |
| `bamboocutWind/wind-dummy-1-min-infinite-vitality`       |  69171.64928913544 |  69226.94478501238 |    4150298.9573481265 |     4153616.687100744 |
| `bellstrikeSplendor/dummy-1-min-81-waves`                |  65349.68233467729 |  65623.09394740312 |     3920980.940080637 |     3937385.636844187 |
| `bellstrikeUmbra/dummy-1-min-38-bb`                      |  79816.92602300833 |  79820.02675353442 |       4789015.5613805 |     4789201.605212065 |
| `silkbindDeluge/dummy-1-min-regular-fire`                | 29795.703973489002 |  29793.61498851086 |    1787742.2384093401 |    1787616.8993106517 |
| `silkbindDeluge/dummy-1-min-smolder`                     | 36504.170596575765 |  36654.94652217669 |     2190250.235794546 |     2199296.791330601 |
| `silkbindDeluge/dummy-1-min-wts`                         | 35571.006125529166 | 35965.542258448586 |      2134260.36753175 |    2157932.5355069153 |
| `silkbindDeluge/dummy-1-min-wts-team`                    |   38839.4023092996 |  38486.36615934393 |     2330364.138557976 |    2309181.9695606357 |
| `silkbindWings/wings-dummy-1-min-dawnsun`                |  36207.09043887357 | 36219.849963928216 |     2172425.426332414 |     2173190.997835693 |
| `silkbindWings/wings-dummy-1-min-jadebreaker`            |  49308.01325488668 |  49326.60872559312 |    2958480.7952932008 |    2959596.5235355874 |
| `stonesplitStrength/mixed-dummy-1-min`                   |  67395.84544895132 |  67395.58756016383 |      4043750.72693708 |    4043735.2536098287 |
| `stonesplitStrength/mixed-dummy-infinite-vitality-1-min` |  67757.04178633557 |   67759.9259617702 |    4065422.5071801343 |    4065595.5577062126 |
| `stonesplitStrength/mixed-dummy-smolder-poet-1-min`      |  67656.17965543146 |  67943.77984410097 |     4059370.779325888 |    4076626.7906460576 |
| `stonesplitStrength/pure-dummy-1-min`                    |  62302.13462491019 |  62120.66959661327 |    3738128.0774946115 |     3727240.175796796 |
| `stonesplitStrength/pure-dummy-1-min-infinite-vitality`  | 64326.782954570765 | 64908.049594465505 |    3859606.9772742465 |      3894482.97566793 |

Deluge Smolder waits 0.35s before its third Dragon’s Breath so Intoxicated expires before the cast. This avoids the subsequent Poet drink, restoring total Vitality consumption from 390 to 380 and raising DPS from 36123.50704105259 to 36654.94652217669. This corrected result is accepted for release.

## Reviewed intermediate results: Hawkwing and follow-up numerical corrections (2026-10-15)

Hawkwing changes from 2% Physical Attack to 1.8% Physical and Bellstrike Attack per stack. Bursting Nine’s second volley now uses the intended 20% decay floor at half strength. The rank-14 Phalanxbane/Mortal no-flat-attack compensation is 0.725%; Adaptive Steel’s stat bonus moves to T5; Seasonal Edge T0 lasts ten seconds. The latter changes do not alter the existing breakthrough-17/T6 preset fixtures.

| Rotation                                                |       Accepted DPS |        Current DPS |    Accepted damage |    Current damage | Duration |
| ------------------------------------------------------- | -----------------: | -----------------: | -----------------: | ----------------: | -------: |
| `bamboocutKite/dummy-1-min-infinite-vitality`           |  57451.30293458791 | 57742.087938329154 | 3447078.1760752746 | 3464525.276299749 |      60s |
| `bellstrikeUmbra/dummy-1-min-38-bb`                     |  79820.02675353442 |  80563.87172526262 |  4789201.605212065 | 4833832.303515757 |      60s |
| `stonesplitStrength/pure-dummy-1-min-infinite-vitality` | 64908.049594465505 |  65079.61639668009 |   3894482.97566793 | 3904776.983800805 |      60s |

All combat durations remain sixty seconds. Umbra changes through Hawkwing; Kite and Pure Strength infinite Vitality change through Bursting Nine. The other seventeen preset results remain bit-identical. These intermediate results isolate the combat corrections before the food replacement below.

## Accepted: Clay Oven Flatbread and numerical corrections (2026-10-15)

Clay Oven Flatbread replaces the previous attack food, increasing effective Physical Attack from 120–240 to 140–280. All presets use this selection. The following comparison includes the reviewed Hawkwing and Bursting Nine corrections above; Wings display translation changes do not alter combat. Every duration remains 60 seconds, so total damage changes by sixty times the DPS difference. The user approved all twenty results for release on October 15, 2026; the accepted snapshots now use these values.

| Rotation                                                 |       Accepted DPS |        Current DPS |   Change |
| -------------------------------------------------------- | -----------------: | -----------------: | -------: |
| `bamboocutDust/dust-dummy-1-min-100pc`                   | 63125.513140949406 |  63499.66835014831 | +0.5927% |
| `bamboocutDust/dust-dummy-1-min`                         |  63328.31151211581 | 63703.630174113605 | +0.5927% |
| `bamboocutKite/dummy-1-min-infinite-vitality`            |  57451.30293458791 |  58069.99291541508 | +1.0769% |
| `bamboocutKite/dummy-1-min-iv-bp`                        | 62596.641810462184 |  62952.31877288379 | +0.5682% |
| `bamboocutWind/wind-dummy-1-min-infinite-vitality`       |  69226.94478501238 |  69642.61567669724 | +0.6004% |
| `bellstrikeSplendor/dummy-1-min-81-waves`                |  65623.09394740312 |  66123.69995113375 | +0.7629% |
| `bellstrikeUmbra/dummy-1-min-38-bb`                      |  79820.02675353442 |   81247.4031684037 | +1.7882% |
| `silkbindDeluge/dummy-1-min-regular-fire`                |  29793.61498851086 | 29977.584872077234 | +0.6175% |
| `silkbindDeluge/dummy-1-min-smolder`                     |  36654.94652217669 |  36880.48631845998 | +0.6153% |
| `silkbindDeluge/dummy-1-min-wts-team`                    |  38486.36615934393 | 38722.801991740074 | +0.6143% |
| `silkbindDeluge/dummy-1-min-wts`                         | 35965.542258448586 |  36186.63847937145 | +0.6147% |
| `silkbindWings/wings-dummy-1-min-dawnsun`                | 36219.849963928216 |  36423.74732400038 | +0.5629% |
| `silkbindWings/wings-dummy-1-min-jadebreaker`            |  49326.60872559312 | 49600.968893796395 | +0.5562% |
| `stonesplitMight/dummy-1-min`                            |  79486.75718449506 |   80140.3390419006 | +0.8223% |
| `stonesplitStrength/mixed-dummy-1-min-double-stab`       |  66653.62193112556 |  67017.06987142487 | +0.5453% |
| `stonesplitStrength/mixed-dummy-1-min`                   |  67395.58756016383 |  67762.68828283051 | +0.5447% |
| `stonesplitStrength/mixed-dummy-infinite-vitality-1-min` |   67759.9259617702 |  68130.15507253766 | +0.5464% |
| `stonesplitStrength/mixed-dummy-smolder-poet-1-min`      |  67943.77984410097 |  68316.11098675086 | +0.5480% |
| `stonesplitStrength/pure-dummy-1-min-infinite-vitality`  | 64908.049594465505 |  65445.18119214224 | +0.8275% |
| `stonesplitStrength/pure-dummy-1-min`                    |  62120.66959661327 |  62468.47502452412 | +0.5599% |

## Accepted: arsenal attack correction (2026-10-15)

All five arsenals now grant 148–297 raw attack instead of 131–263. The user approved the resulting twenty preset snapshots on October 15, 2026. DPS increases approximately 0.97–1.10%; all durations remain 60 seconds. Dust's default rotation changes from 63703.630174113605 to 64339.4070867324 DPS. Its 100% catch variant changes from 63499.66835014831 to 64132.747779063146 DPS.

The additional minimum attack caps Dust's martial-art damage-bonus and penetration conversions before an affix is added. Both bundled Dust rotations consequently value a maximum Bamboocut affix above a minimum affix at breakthroughs 17 and 18.

The optimized-versus-live comparison test compares DPS deltas to eight decimal places, matching its existing penetration comparison. These paths regroup floating-point operations; reconstructing total damage from DPS introduced a five-ULP discrepancy after the arsenal correction. The deterministic release snapshot guard remains unchanged at four ULPs.

## Accepted: Solo Level Enhancement and Arsenal progression (2026-10-17)

The accepted fixtures all select breakthrough 17. Arsenal now selects 131–263
raw attack there instead of the previously accepted fixed 148–297, matching the
normal Solo 17 export. This reverses the attack increase accepted on October 15
for those fixtures; Solo 18 retains 148–297. Enhancement attack and defense stay
at 240–480 and 120 at Solo 17; its HP increases from 30,210 to 40,070. Arsenal
also supplies its previously omitted 27,300 HP (31,700 at Solo 18). These HP
corrections pass through the common stat pipeline and can affect HP-dependent
mechanics. All durations remain 60 seconds. Rank-14 talents are unchanged.

The user approved all twenty results on October 17, 2026. The accepted snapshots now use the corrected Solo Level progression.

| Rotation                                               |       Accepted DPS |            New DPS |   Change |    Accepted damage |         New damage | Duration |
| ------------------------------------------------------ | -----------------: | -----------------: | -------: | -----------------: | -----------------: | -------- |
| bamboocutDust/dust-dummy-1-min                         |   64339.4070867324 | 63703.630174113605 | -0.9882% | 3860364.4252039436 | 3822217.8104468165 | 60 → 60  |
| bamboocutDust/dust-dummy-1-min-100pc                   | 64132.747779063146 |  63499.66835014831 | -0.9871% | 3847964.8667437886 | 3809980.1010088986 | 60 → 60  |
| bamboocutKite/dummy-1-min-infinite-vitality            | 58661.018408877804 |  58069.99291541508 | -1.0075% | 3519661.1045326684 |  3484199.574924905 | 60 → 60  |
| bamboocutKite/dummy-1-min-iv-bp                        |  63580.78529882886 |  62952.31877288379 | -0.9885% | 3814847.1179297315 | 3777139.1263730275 | 60 → 60  |
| bamboocutWind/wind-dummy-1-min-infinite-vitality       |  70364.27708536509 |  69642.61567669724 | -1.0256% | 4221856.6251219055 |  4178556.940601835 | 60 → 60  |
| bellstrikeSplendor/dummy-1-min-81-waves                |  66765.03228676677 |  66123.69995113375 | -0.9606% |  4005901.937206006 | 3967421.9970680247 | 60 → 60  |
| bellstrikeUmbra/dummy-1-min-38-bb                      |  82054.94788575095 |   81247.4031684037 | -0.9842% |  4923296.873145057 |  4874844.190104222 | 60 → 60  |
| silkbindDeluge/dummy-1-min-regular-fire                |  30305.53361364531 | 29972.305634679007 | -1.0996% | 1818332.0168187188 | 1798338.3380807405 | 60 → 60  |
| silkbindDeluge/dummy-1-min-smolder                     |  37286.60947114474 |  36873.94978161095 | -1.1067% |  2237196.568268684 |  2212436.986896657 | 60 → 60  |
| silkbindDeluge/dummy-1-min-wts                         |   36584.0573371089 | 36180.063544133074 | -1.1043% |  2195043.440226534 | 2170803.8126479844 | 60 → 60  |
| silkbindDeluge/dummy-1-min-wts-team                    |   39149.1318370525 | 38715.724661035245 | -1.1071% | 2348947.9102231497 | 2322943.4796621148 | 60 → 60  |
| silkbindWing/wings-dummy-1-min-dawnsun                 |  36801.11222528141 |  36423.74732400038 | -1.0254% | 2208066.7335168845 |  2185424.839440023 | 60 → 60  |
| silkbindWing/wings-dummy-1-min-jadebreaker             | 50117.644204073214 | 49600.968893796395 | -1.0309% |  3007058.652244393 | 2976058.1336277835 | 60 → 60  |
| stonesplitMight/dummy-1-min                            |  80942.31111106317 |   80140.3390419006 | -0.9908% |   4856538.66666379 |  4808420.342514036 | 60 → 60  |
| stonesplitStrength/mixed-dummy-1-min                   |  68450.20165536168 |  67762.68828283051 | -1.0044% | 4107012.0993217006 |   4065761.29696983 | 60 → 60  |
| stonesplitStrength/mixed-dummy-1-min-double-stab       |  67697.63371836559 |  67017.06987142487 | -1.0053% | 4061858.0231019347 |  4021024.192285492 | 60 → 60  |
| stonesplitStrength/mixed-dummy-infinite-vitality-1-min |  68825.87877398261 |  68130.15507253766 | -1.0108% |  4129552.726438957 | 4087809.3043522593 | 60 → 60  |
| stonesplitStrength/mixed-dummy-smolder-poet-1-min      |   69015.3929252431 |  68316.11098675086 | -1.0132% | 4140923.5755145852 |  4098966.659205051 | 60 → 60  |
| stonesplitStrength/pure-dummy-1-min                    |  63110.35654269702 |  62468.47502452412 | -1.0171% | 3786621.3925618213 | 3748108.5014714473 | 60 → 60  |
| stonesplitStrength/pure-dummy-1-min-infinite-vitality  |  66124.73807374043 |  65445.18119214224 | -1.0277% |  3967484.284424426 | 3926710.8715285347 | 60 → 60  |

## Accepted: Mystic skill level 76 (2026-10-17)

Implemented offensive Mystic coefficients and flat attack bonuses now resolve
from source level 76 instead of 71, including the existing enlightened Smolder
and Dragon Head - Tide routes. This changes authored JSON only: hit multipliers,
cast and hit times, cooldowns, and effect mechanics are unchanged. Ghostly Steps
has identical values at both source levels. Combustion and Smolder DOT coefficients
use level 76 with their retained 0.0532 tick factor. The current damage formula
does not apply DOT flat bonuses. No runtime level-selection mechanism is added.

All twenty accepted fixtures remain at breakthrough 17. Mystic level is the
shared authored skill level, independent of that setting. Damage and DPS increase
in every preset; every duration remains 60 seconds. The user approved all twenty results on October 17, 2026; the accepted snapshots now use Mystic level 76.

| Rotation                                               |       Accepted DPS |            New DPS |  Change |    Accepted damage |         New damage | Duration |
| ------------------------------------------------------ | -----------------: | -----------------: | ------: | -----------------: | -----------------: | -------- |
| bamboocutDust/dust-dummy-1-min                         | 63703.630174113605 | 63734.250633261436 | 0.0481% | 3822217.8104468165 | 3824055.0379956863 | 60 → 60  |
| bamboocutDust/dust-dummy-1-min-100pc                   |  63499.66835014831 |  63530.30027333388 | 0.0482% | 3809980.1010088986 | 3811818.0164000327 | 60 → 60  |
| bamboocutKite/dummy-1-min-infinite-vitality            |  58069.99291541508 |  58100.60763869319 | 0.0527% |  3484199.574924905 | 3486036.4583215914 | 60 → 60  |
| bamboocutKite/dummy-1-min-iv-bp                        |  62952.31877288379 | 62981.141537984215 | 0.0458% | 3777139.1263730275 | 3778868.4922790527 | 60 → 60  |
| bamboocutWind/wind-dummy-1-min-infinite-vitality       |  69642.61567669724 |  69660.74696256213 | 0.0260% |  4178556.940601835 | 4179644.8177537285 | 60 → 60  |
| bellstrikeSplendor/dummy-1-min-81-waves                |  66123.69995113375 |  66144.19305033117 | 0.0310% | 3967421.9970680247 | 3968651.5830198703 | 60 → 60  |
| bellstrikeUmbra/dummy-1-min-38-bb                      |   81247.4031684037 |  81279.15623741267 | 0.0391% |  4874844.190104222 |   4876749.37424476 | 60 → 60  |
| silkbindDeluge/dummy-1-min-regular-fire                | 29972.305634679007 | 30047.698178324827 | 0.2515% | 1798338.3380807405 | 1802861.8906994895 | 60 → 60  |
| silkbindDeluge/dummy-1-min-smolder                     |  36873.94978161095 |  36963.91838572095 | 0.2440% |  2212436.986896657 |  2217835.103143257 | 60 → 60  |
| silkbindDeluge/dummy-1-min-wts                         | 36180.063544133074 |  36270.30696158508 | 0.2494% | 2170803.8126479844 |  2176218.417695105 | 60 → 60  |
| silkbindDeluge/dummy-1-min-wts-team                    | 38715.724661035245 |  38811.38525892662 | 0.2471% | 2322943.4796621148 |  2328683.115535597 | 60 → 60  |
| silkbindWing/wings-dummy-1-min-dawnsun                 |  36423.74732400038 |  36450.29858359722 | 0.0729% |  2185424.839440023 | 2187017.9150158335 | 60 → 60  |
| silkbindWing/wings-dummy-1-min-jadebreaker             | 49600.968893796395 |  49626.86992889119 | 0.0522% | 2976058.1336277835 | 2977612.1957334713 | 60 → 60  |
| stonesplitMight/dummy-1-min                            |   80140.3390419006 |  80160.26931425251 | 0.0249% |  4808420.342514036 |   4809616.15885515 | 60 → 60  |
| stonesplitStrength/mixed-dummy-1-min                   |  67762.68828283051 |  67780.81295646731 | 0.0267% |   4065761.29696983 | 4066848.7773880386 | 60 → 60  |
| stonesplitStrength/mixed-dummy-1-min-double-stab       |  67017.06987142487 |  67034.95167411004 | 0.0267% |  4021024.192285492 |  4022097.100446602 | 60 → 60  |
| stonesplitStrength/mixed-dummy-infinite-vitality-1-min |  68130.15507253766 |   68160.4634521545 | 0.0445% | 4087809.3043522593 |   4089627.80712927 | 60 → 60  |
| stonesplitStrength/mixed-dummy-smolder-poet-1-min      |  68316.11098675086 |   68354.2559063995 | 0.0558% |  4098966.659205051 |  4101255.354383969 | 60 → 60  |
| stonesplitStrength/pure-dummy-1-min                    |  62468.47502452412 |  62489.58348841498 | 0.0338% | 3748108.5014714473 |  3749375.009304899 | 60 → 60  |
| stonesplitStrength/pure-dummy-1-min-infinite-vitality  |  65445.18119214224 | 65475.613410428676 | 0.0465% | 3926710.8715285347 | 3928536.8046257207 | 60 → 60  |
