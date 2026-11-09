# DPS regression snapshots

## Bolt Hawkwing presets (November 9, 2026)

The user requested release of the Hawkwing variants and selected Fully Relayed Max Build Hawkwing as the default. Each variant uses four-piece Hawkwing and replaces only the right weapon additional Affinity with Max Void Attack. All existing snapshots remain unchanged. The four new 60-second baselines are:

| Build                            |       Solo 18 DPS |       Solo 19 DPS |
| -------------------------------- | ----------------: | ----------------: |
| Full Max Build Hawkwing          | 90020.32271020804 |   94366.836061932 |
| Fully Relayed Max Build Hawkwing | 86611.19095330361 | 91331.16241962161 |

## Bolt public Preview acceptance (November 9, 2026)

The user accepted Bolt's completed Dummy 1 Min calculation and requested
release with the Preview badge retained and no Dev-mode requirement.
The default preset and its public non-relayed graduate counterpart are accepted:

| Build             | Solo Level | DPS               | Total damage       | Duration |
| ----------------- | ---------- | ----------------- | ------------------ | -------- |
| Full Max          | 18         | 89552.46117118334 | 5373147.670271001  | 60s      |
| Full Max          | 19         | 93852.33120780764 | 5631139.8724684585 | 60s      |
| Fully Relayed Max | 18         | 86112.86359537291 | 5166771.815722374  | 60s      |
| Fully Relayed Max | 19         | 90795.0264579321  | 5447701.587475926  | 60s      |

All 326 previously accepted fixtures remain bit-identical. Only Bolt's
records were added. The user's subsequent Affinity-to-Momentum request
replaces the greaves' additional Affinity roll in both layouts. At Solo 19,
Fully Relayed changes from 90,478.44162539956 to 90,795.0264579321 DPS and
39.390607567567564% effective Affinity; Full Max remains capped at 40%.
The highest-only Art rule does not change these presets' baseline damage,
because neither has duplicate Arts of the same family.
The release guard retains its existing baseline
levels 18/19; progression and preset tests cover the added levels through 25. The fully progressed Solo-25 result and per-skill breakdown are retained
in [the Level 25 report](reports/bolt-solo-25-2026-11-09.md).

## Draught Max Mistwing acceptance (November 8, 2026)

The user approved replacing T6 Envigorated Warrior with T6 Mistwing in the
ordinary Full Max and Fully Relayed Max builds. Min builds retain Envigorated
Warrior, and BP builds retain Breaking Point. Across both one-minute rotations
and breakthroughs 18/19, the eight affected Max cases lose 0.634–0.915% DPS.
Durations remain 60 seconds; all other snapshots are unchanged.

| Build / rotation            |   BT18 DPS before | BT18 DPS accepted |   BT19 DPS before | BT19 DPS accepted |
| --------------------------- | ----------------: | ----------------: | ----------------: | ----------------: |
| Full Max / regular          | 87407.01121148147 |  86651.9669841891 |  92197.3689254502 | 91400.72626228178 |
| Fully Relayed Max / regular | 84873.49795000324 | 84097.25312916964 | 89968.16207997708 | 89144.69541584094 |
| Full Max / BP               | 89337.11799987682 |  88770.5361606794 | 94225.54903068783 | 93627.77043914614 |
| Fully Relayed Max / BP      | 86782.60940614161 | 86192.15091273491 | 91982.92475952947 | 91356.48075041253 |

## Pre-battle hit correction acceptance (November 5, 2026)

The user approved the lower damage results caused by excluding pre-battle hits
from on-hit processing, including weapon-set buffs and Morale Chant stacks.
Direct skill buffs remain available before battle. The accepted changes cover
192 cases across Wind, Jade, Wings, Might, and Strength, with unchanged durations.
DPS decreases range from 0.054–0.121% for Wind, 0.027–0.254% for Jade,
0.036–0.262% for Wings, 0.378–0.380% for Might, and 0.152–0.992% for Strength.
These snapshots use the committed presets; subsequent uncommitted Jade edits
are excluded from this acceptance.

## Jade acceptance (November 3, 2026)

The user approved the current Jade snapshots for commit and release. The accepted
catalog covers all four rotations, nine builds, and breakthroughs 18/19 (72 cases).
It includes the Thunderous, BP, and BP Mystic families, legal FF/UF cancel chains,
the 35-Blossom Phoenix refill, and the consolidated Vernal frequent-projectile
attunement. Grounded retains 146 UF projectile hits with its final UF at
51.686921s and the Toad / Fan Q cancel / extra FF refresh sequence. The 30-second
IV rotation uses Serene Breeze between FF cancel and Soaring to preserve dodges.
The reviewed combat corrections and existing Flying/Hybrid presets are included;
further Flying/Hybrid optimization requires a new snapshot review. Other paths'
accepted values are not refreshed by this approval.

`npm run test:dps` compares every non-empty preset rotation, including WIP paths
against `tests/snapshots/rotation-dps.json`. The release deployment workflow
runs this guard before publishing, including manual deployments. Ordinary build,
tests, watch mode, and PR/main CI exclude the accepted-DPS comparison while
retaining its coverage, selector, and comparison-algorithm tests.

## Fixture selection

`tests/helpers/dps-snapshot-fixtures.ts` discovers rotation JSON files from each
path's existing rotation directory and every build JSON in the same build group.
Every non-empty rotation is paired with every build in that group, at breakthroughs
18 and 19, including builds with different weapon configurations. The production
bundle uses the build's configured weapons and the rotation's recorded actions.
Cases use stable `<pathId>/<rotationId>/<buildId>/<breakthrough>` keys, so changing
a path's default build does not change the snapshot catalog or calculation inputs.
Empty planner rotations are excluded. The coverage test independently enumerates
the build/rotation cross product. The release guard detects missing and obsolete
baseline keys. Rotation and path update selectors include every matching build;
including a build ID selects only that build's cases.

On October 21, 2026, the user approved expanding coverage to every build/rotation
pair and accepting their current calculated values. This replaces the previous
default-build cases and Deluge-only additional build cases. The shared behavioral
fixture loader still selects defaults and explicit rotation overrides; only the
release case loader expands to all builds.

Current snapshot calculations use breakthroughs 18 and 19, each rotation's saved ping (40 ms
by default; 30 ms for Might), Simmering Fish Slices,
Fire Divinecraft, no Script, and no global or skill overrides. The rotation
supplies its actions and encounter flags; the build supplies its weapons, gear,
Inner Ways, and sets. Fixtures are passed to `src/application/graduation.ts`'s
`buildPresetRotationBundle` and `calculateRotationBaseline`, the production
calculation pipeline. No browser preferences or duplicate damage formulas enter
the check.

The shared rotation-fixture loader retains its breakthrough-17 default for
existing behavioral tests. `loadDpsSnapshotCases` explicitly selects 18 and 19
for the release guard and its coverage checks; that default cannot select the
snapshot environment.

## Accepted values and review gate

On October 26, 2026, the user accepted the defense correction from 446 to 500
for breakthroughs 18 and 19 and approved refreshing all 222 preset baselines.
The higher enemy defense lowers DPS and total damage by 0.95–1.50%, with no
duration changes. For example, `bamboocutDust/dust-dummy-1-min-100pc/dust-full-min/18`
changes from 78,106.31550827304 to 77,037.10483776833 DPS. Enemy level,
Judgement Resistance, and HP are unchanged by this correction.

The current baseline set replaces the twenty breakthrough-17 cases with forty
cases at breakthroughs 18 and 19, as requested. These use the corrected flat
breakthrough rewards as well as each level's gear, Enhancement, Arsenal, sets,
Inner Ways, and martial-art talents. Earlier numerical acceptance notes in this
document describe historical breakthrough-17 baselines unless stated otherwise;
the snapshot JSON contains the current exact values.

The October 2026 Umbra release uses the user-approved current damage for all
presets. This includes the new WIP Umbra rotation, weapon-specific Deflect timing,
Endurance recovery before combat, and the approved Splendor Qi and Might Defense
alignment repairs. The snapshot JSON records the exact accepted values.

Schema version 2 replaces the old one-case-per-path file. Each case records its
fixture, DPS, total damage, HPS, total healing, and duration. HPS and total
healing come directly from the production calculation metrics. Cases without
healing record zero for both fields. The gate fails on:

- Any change beyond 4 units in the last place in DPS, total damage, HPS, total healing, or duration,
  independently for each rotation and in either direction.
- Missing or removed rotation coverage.
- A changed build, rotation, martial-art pair, or fixed environment.
- Non-finite, zero, or negative DPS, damage, or duration.
- Missing, non-finite, or negative HPS or total healing.

The budget is counted in ULPs rather than a percentage because the damage
pipeline is bit-deterministic: it uses only exactly specified IEEE-754
operations, accumulates in a fixed single-threaded order, and takes no
locale-, time-, or random-dependent input. The same inputs must therefore
reproduce the same bits. Four ULPs absorbs a single-representation shift from a
summation reassociation or an engine change and rejects every real change; a 1%
band was roughly 8x10^11 ULPs wide and silently accepted unreviewed edits. All
five stored numbers are compared, and changes accumulate against the last
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
ID, a `<pathId>/<rotationId>` prefix to select both breakthroughs, a path ID to
select all its rotations and breakthroughs, or `all`. Unselected baselines remain
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
| silkbindWings/wings-dummy-1-min-dawnsun                |  36801.11222528141 |  36423.74732400038 | -1.0254% | 2208066.7335168845 |  2185424.839440023 | 60 → 60  |
| silkbindWings/wings-dummy-1-min-jadebreaker            | 50117.644204073214 | 49600.968893796395 | -1.0309% |  3007058.652244393 | 2976058.1336277835 | 60 → 60  |
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
| silkbindWings/wings-dummy-1-min-dawnsun                |  36423.74732400038 |  36450.29858359722 | 0.0729% |  2185424.839440023 | 2187017.9150158335 | 60 → 60  |
| silkbindWings/wings-dummy-1-min-jadebreaker            | 49600.968893796395 |  49626.86992889119 | 0.0522% | 2976058.1336277835 | 2977612.1957334713 | 60 → 60  |
| stonesplitMight/dummy-1-min                            |   80140.3390419006 |  80160.26931425251 | 0.0249% |  4808420.342514036 |   4809616.15885515 | 60 → 60  |
| stonesplitStrength/mixed-dummy-1-min                   |  67762.68828283051 |  67780.81295646731 | 0.0267% |   4065761.29696983 | 4066848.7773880386 | 60 → 60  |
| stonesplitStrength/mixed-dummy-1-min-double-stab       |  67017.06987142487 |  67034.95167411004 | 0.0267% |  4021024.192285492 |  4022097.100446602 | 60 → 60  |
| stonesplitStrength/mixed-dummy-infinite-vitality-1-min |  68130.15507253766 |   68160.4634521545 | 0.0445% | 4087809.3043522593 |   4089627.80712927 | 60 → 60  |
| stonesplitStrength/mixed-dummy-smolder-poet-1-min      |  68316.11098675086 |   68354.2559063995 | 0.0558% |  4098966.659205051 |  4101255.354383969 | 60 → 60  |
| stonesplitStrength/pure-dummy-1-min                    |  62468.47502452412 |  62489.58348841498 | 0.0338% | 3748108.5014714473 |  3749375.009304899 | 60 → 60  |
| stonesplitStrength/pure-dummy-1-min-infinite-vitality  |  65445.18119214224 | 65475.613410428676 | 0.0465% | 3926710.8715285347 | 3928536.8046257207 | 60 → 60  |

## Tailwind attack-value category correction (2026-10-19)

The user approved the corrected Wings results for release. Tailwind's base
buff, paired Fan talents, and Zephyr Whispers T6 now use the shared attribute
attack-value bonuses after Void conversion, matching Hawkwing. The paired 6%
and T6 6% contributions add to 12% instead of compounding.

| Rotation                                    |      Previous DPS |       Accepted DPS | Previous total damage | Accepted total damage |
| ------------------------------------------- | ----------------: | -----------------: | --------------------: | --------------------: |
| silkbindWings/wings-dummy-1-min-dawnsun     | 36450.29858359722 |  36434.99885039597 |    2187017.9150158335 |     2186099.931023758 |
| silkbindWings/wings-dummy-1-min-jadebreaker | 49626.86992889119 | 49620.402274184016 |    2977612.1957334713 |     2977224.136451041 |

Both durations remain 60 seconds. All other release fixtures are unchanged.

## Umbra Zenith resource (2026-10-19)

The user approved the 40/100 Zenith resource and revised 38-Blood-Burst rotation.
Zenith starts at 40 rather than five prepared buff stacks, and gains 20 per burst.
Smolder follows the first Sweep All so full Zenith extends it; the second Sweep
All wait is shortened to preserve River Flow and all 38 bursts.

The accepted `bellstrikeUmbra/dummy-1-min-38-bb` result changes from
81279.15623741267 to 79390.39767233716 DPS, and total damage from
4876749.37424476 to 4763423.860340229 over the same 60 seconds. Blood Burst
damage decreases by approximately 90610 as full-Zenith and buff alignment change;
Smolder decreases by approximately 27924 with 104 ticks instead of 112.
All other preset snapshots remain unchanged.

## Umbra action-modifier cache correction (2026-10-20)

The user approved the resource-predicate cache correction for release. Blood
Burst's full-Zenith guaranteed Affinity now follows the action's current resource
condition instead of reusing a cached result from the other side of its threshold.
This restores eligible guaranteed-Affinity hits and removes spurious bow/ring
comparison gains when Affinity is already capped.

| Breakthrough |      Previous DPS |       Accepted DPS | Previous total damage | Accepted total damage |
| ------------ | ----------------: | -----------------: | --------------------: | --------------------: |
| 18           |  93882.4712814389 |  95163.45897986703 |     5632948.276886335 |    5709807.5387920225 |
| 19           | 98795.44321255597 | 100119.09485414634 |     5927726.592753358 |     6007145.691248781 |

Both cases use `bellstrikeUmbra/dummy-1-min-38-bb` and retain their 60-second
duration. All other preset snapshots remain unchanged.

## Dust damage bonus categories (2026-10-21)

The user approved Soulbreak's move to Category 1, Burn and Bury's move to
base damage, Fragrant Song's 20% bonus on eligible Resonances, and Tang Melody's
HP restriction removal at T5. Settlement retains the shared replay adjustments.

| Rotation               | Breakthrough |      Previous DPS |      Accepted DPS | Previous total damage | Accepted total damage |
| ---------------------- | -----------: | ----------------: | ----------------: | --------------------: | --------------------: |
| dust-dummy-1-min-100pc |           18 | 75762.06418324591 | 75378.65890896872 |     4545723.850994755 |     4522719.534538123 |
| dust-dummy-1-min-100pc |           19 | 79184.49742802598 | 78781.63492472706 |     4751069.845681558 |     4726898.095483623 |
| dust-dummy-1-min       |           18 | 76001.99657216367 | 75645.22735018363 |      4560119.79432982 |     4538713.641011018 |
| dust-dummy-1-min       |           19 | 79435.57971811047 | 79060.62177416348 |     4766134.783086629 |     4743637.306449808 |

All durations remain 60 seconds; all other preset snapshots are unchanged.

## Reviewed damage bonus corrections (2026-10-21)

The user approved the multiplier audit corrections and these resulting snapshots.
Soul-Shaken joins Category 1, Cloudshear joins channel damage scales, and
Candlelight, Blade of Grass, and End of Gale T3 join Category 1. Tang Melody
uses direct martial-art-skill eligibility; Vulnerable grants 8% plus 10% HP
damage with zero Qi contribution under the selected layer-0 policy. Base Yi
River uses Category 1, early Museflow formula caps are enforced, Critical and
Affinity outcome factors are clamped, and Ripple corrections cover all supported
PvE targets. See damage-formula.md for the implemented scopes and remaining
stepped-talent and target-reduction limitations.

| Preset / breakthrough                          |       Previous DPS |       Accepted DPS | Previous total damage | Accepted total damage |
| ---------------------------------------------- | -----------------: | -----------------: | --------------------: | --------------------: |
| bamboocutDust/dust-dummy-1-min-100pc/18        |  75378.65890896872 |  75052.69588297587 |     4522719.534538123 |     4503161.752978552 |
| bamboocutDust/dust-dummy-1-min-100pc/19        |  78781.63492472706 |  78440.19900757818 |     4726898.095483623 |     4706411.940454691 |
| bamboocutDust/dust-dummy-1-min/18              |  75645.22735018363 |  75218.61406855253 |     4538713.641011018 |     4513116.844113152 |
| bamboocutDust/dust-dummy-1-min/19              |  79060.62177416348 |  78613.83531516723 |     4743637.306449808 |     4716830.118910034 |
| bellstrikeUmbra/dummy-1-min-38-bb/18           |  95163.45897986703 |  85334.27364913882 |    5709807.5387920225 |     5120056.418948329 |
| bellstrikeUmbra/dummy-1-min-38-bb/19           | 100119.09485414634 |  89769.16730002478 |     6007145.691248781 |     5386150.038001487 |
| silkbindWings/wings-dummy-1-min-dawnsun/18     | 43736.632758129155 | 43977.495233684975 |    2624197.9654877493 |    2638649.7140210983 |
| silkbindWings/wings-dummy-1-min-dawnsun/19     |   45787.3473306048 |  46034.37102098257 |    2747240.8398362882 |     2762062.261258954 |
| silkbindWings/wings-dummy-1-min-jadebreaker/18 | 59269.205061193956 | 59631.270792308605 |    3556152.3036716375 |    3577876.2475385163 |
| silkbindWings/wings-dummy-1-min-jadebreaker/19 |  62089.81204533403 | 62462.147083776756 |     3725388.722720042 |    3747728.8250266053 |
| stonesplitMight/dummy-1-min/18                 |  93998.91147957309 |  94833.29806850525 |    5639934.6887743855 |     5689997.884110315 |
| stonesplitMight/dummy-1-min/19                 |  99308.74329065508 |  100190.5834583792 |     5958524.597439305 |     6011435.007502752 |

All durations remain 60 seconds. Other preset snapshots are unchanged.

## Reviewed Umbra rotation endings (2026-10-21)

The user approved extending both dummy presets through their remaining in-battle
hits and adding the Dragon Head variant. Dummy 1 Min 39 BB retains the
`dummy-1-min-38-bb` internal ID so saved preset selections continue to resolve.
Its ending continues Special 1 into Second Track Slash [2 Casts, 1 Hit], Deflect,
and the in-battle portion of Inner Track Slash.

Dummy 1 Min 37 BB DH uses Special 2, Deflect, Special 1, Second Track Slash
[2 Casts, 1 Hit], and Deflect after the second flute. Its first two full
Sober Sorrow casts use the five-hit cancel; the last remains full. Dragon Head
hits during Exhausted, Smolder stays connected, and the final charge follow-up
lands at 59.73390950863632 seconds. The authored Qi break follows the final
Special 1 hit in the changed post-flute sequence. Both presets measure 60 seconds.

| Preset / breakthrough                   |      Previous DPS |      Accepted DPS | Previous total damage | Accepted total damage |
| --------------------------------------- | ----------------: | ----------------: | --------------------: | --------------------: |
| bellstrikeUmbra/dummy-1-min-37-bb-dh/18 |        New preset | 89702.39142504496 |            New preset |    5382143.4855026975 |
| bellstrikeUmbra/dummy-1-min-37-bb-dh/19 |        New preset | 94326.03108977214 |            New preset |     5659561.865386328 |
| bellstrikeUmbra/dummy-1-min-38-bb/18    | 85334.27364913882 |  87699.8570634879 |     5120056.418948329 |     5261991.423809274 |
| bellstrikeUmbra/dummy-1-min-38-bb/19    | 89769.16730002478 | 92262.43970756652 |     5386150.038001487 |     5535746.382453991 |

## Reviewed Umbra hit markers (2026-10-21)

The user accepted the October 21 14:51 export's hit timing corrections while
preserving cast and cancel durations. The opening charge hit starts battle
0.00099033 seconds earlier. In Dummy 1 Min 39 BB (`dummy-1-min-38-bb`), the final
Bleed tick consequently moves from 59.999569962636336 to 60.000560292636336
seconds and falls outside Battle End: 59 ticks remain instead of 60. Other
preset snapshots are unchanged, including the Dragon Head variant. Duration
remains 60 seconds.

| Preset / breakthrough                |      Previous DPS |      Accepted DPS | Previous total damage | Accepted total damage |
| ------------------------------------ | ----------------: | ----------------: | --------------------: | --------------------: |
| bellstrikeUmbra/dummy-1-min-38-bb/18 |  87699.8570634879 | 87569.14402156408 |     5261991.423809274 |     5254148.641293844 |
| bellstrikeUmbra/dummy-1-min-38-bb/19 | 92262.43970756652 | 92124.45752802271 |     5535746.382453991 |     5527467.451681362 |

## Accepted Deluge Ivorybloom builds (October 21, 2026)

The user accepted both new Ivorybloom builds for release. Sixteen additional
cases cover min/max gear on regular-fire, Smolder, solo WTS, and team WTS at
breakthroughs 18 and 19. These replace the selectable Rainwhisper presets,
not the existing Etherwrath default or its accepted snapshots. The accepted
builds retain Moonflare and the original Inner Ways, with affixes adjusted
for approximately 100% Effective Precision and 80% Effective Critical while
Ivorybloom's full-HP bonus is active.

All existing accepted cases remain unchanged. Exact DPS, total damage, and
duration are recorded in the snapshot JSON; all sixteen added cases last
60 seconds.

## Ivorybloom critical-heal retention, 2026-10-21

The user approved these sixteen snapshot updates after reviewing the DPS changes.
Ivorybloom now retains its four-piece bonuses for three seconds after critically
healing any recipient, refreshing on further critical heals. The full-HP route
remains active independently and never doubles the bonus. Expected calculations
track separate active/inactive refresh chances and expiration probabilities;
sampled runs use actual recipient outcomes.

All affected rotations last 60 seconds. Total damage therefore changes in the
same proportion as DPS. Other accepted cases remain unchanged within the guard.

| Snapshot                                                                 |       Previous DPS |       Accepted DPS |   Change |
| ------------------------------------------------------------------------ | -----------------: | -----------------: | -------: |
| `silkbindDeluge/dummy-1-min-regular-fire/deluge-fully-relayed-max-ib/18` | 34154.271108904621 | 34419.476600049267 | +0.7765% |
| `silkbindDeluge/dummy-1-min-regular-fire/deluge-fully-relayed-max-ib/19` | 36126.350932557201 | 36394.898919326319 | +0.7434% |
| `silkbindDeluge/dummy-1-min-regular-fire/deluge-fully-relayed-min-ib/18` | 34024.376017966533 | 34294.680172308152 | +0.7944% |
| `silkbindDeluge/dummy-1-min-regular-fire/deluge-fully-relayed-min-ib/19` | 35730.807140748620 | 36000.000433415174 | +0.7534% |
| `silkbindDeluge/dummy-1-min-smolder/deluge-fully-relayed-max-ib/18`      | 43788.954096832902 | 43844.295719366710 | +0.1264% |
| `silkbindDeluge/dummy-1-min-smolder/deluge-fully-relayed-max-ib/19`      | 46239.449019446925 | 46295.470572964128 | +0.1212% |
| `silkbindDeluge/dummy-1-min-smolder/deluge-fully-relayed-min-ib/18`      | 43683.101666054536 | 43739.554320807685 | +0.1292% |
| `silkbindDeluge/dummy-1-min-smolder/deluge-fully-relayed-min-ib/19`      | 45779.463487253292 | 45835.688006727702 | +0.1228% |
| `silkbindDeluge/dummy-1-min-wts-team/deluge-fully-relayed-max-ib/18`     | 49006.665014782695 | 49329.753525098415 | +0.6593% |
| `silkbindDeluge/dummy-1-min-wts-team/deluge-fully-relayed-max-ib/19`     | 51736.926212988343 | 52063.843777481867 | +0.6319% |
| `silkbindDeluge/dummy-1-min-wts-team/deluge-fully-relayed-min-ib/18`     | 48467.157855578545 | 48796.284414440073 | +0.6791% |
| `silkbindDeluge/dummy-1-min-wts-team/deluge-fully-relayed-min-ib/19`     | 49862.409659208381 | 50190.198179494218 | +0.6574% |
| `silkbindDeluge/dummy-1-min-wts/deluge-fully-relayed-max-ib/18`          | 44207.254618297433 | 44530.341973720002 | +0.7308% |
| `silkbindDeluge/dummy-1-min-wts/deluge-fully-relayed-max-ib/19`          | 46668.002105197767 | 46994.918602951031 | +0.7005% |
| `silkbindDeluge/dummy-1-min-wts/deluge-fully-relayed-min-ib/18`          | 43235.397874059483 | 43564.523359419632 | +0.7612% |
| `silkbindDeluge/dummy-1-min-wts/deluge-fully-relayed-min-ib/19`          | 45295.031911131497 | 45622.819362330840 | +0.7237% |

## Kite IV BP rotation acceptance (2026-10-22)

The user accepted the IV BP A5/A6 filler and the separate IV BP Dragon Head
rotation. Refresh only `bamboocutKite/dummy-1-min-iv-bp` and
`bamboocutKite/dummy-1-min-iv-bp-dh` across all five Kite builds at breakthroughs
18 and 19. Both rotations retain the 60-second battle cutoff, 40 ms ping,
and infinite Vitality.

IV BP completes A5/A6 after the late All Under Justice. This reduces the
Soaring cooldown wait from 1.262707s to 0.414707s without moving Q1 or changing
Soaring, exhaustion, or Vile End timing. Fully Relayed Min BP DPS changes from
75173.98480041238 to 76078.12616062301 at breakthrough 18 and from
78884.19443715914 to 79836.34235770653 at breakthrough 19.

IV BP DH uses complete gauntlet combos before one-hit Soaring breaks Qi at
44.447990s. Exhaustion applies after that hit and lasts until 54.447990s.
Vile End lands at 47.550111s, then Snaring Lash's Falcon resets its cooldown.
Dragon Head lands at 53.930111s while Exhausted is active. Sky Grasped and
Snaring Lash refill Heaven's Will for the final Vile End at 59.425111s.
All four Vile End casts land before battle end. Fully Relayed Min BP DPS is
79254.00654687747 at breakthrough 18 and 83138.63044461497 at breakthrough 19.
Gauntlet A5/A6 requires its combo opener; it cannot follow Vile End directly.

## Dragon Head Tide Abrasion acceptance (2026-10-23)

The user accepted unconditional zero Abrasion for Dragon Head Tide on every
path and the resulting six DPS increases. Durations remain 60 seconds. The
skill's `NoAbrasion` modifier removes its precision failures independently of
Deluge's Mystic Precision talent; other release fixtures are unchanged.

| Rotation / build                     | Breakthrough | Previous DPS      | Accepted DPS      |
| ------------------------------------ | ------------ | ----------------- | ----------------- |
| Kite IV BP DH / Fully Relayed Max BP | 18           | 75491.81772108369 | 75497.99991281683 |
| Kite IV BP DH / Fully Relayed Min BP | 18           | 78529.4908863814  | 78534.43712045073 |
| Umbra 37 BB DH / Full                | 18           | 91974.89335942702 | 92249.58624260272 |
| Umbra 37 BB DH / Full                | 19           | 96624.33911549249 | 96897.05539421894 |
| Umbra 37 BB DH / Fully Relayed       | 18           | 89702.39142504496 | 89969.71360581621 |
| Umbra 37 BB DH / Fully Relayed       | 19           | 94326.03108977214 | 94591.70122128044 |

## Dust opening-catch timing — initial review (October 23, 2026)

The user requested the exported Scarlet Spin timing update with 87 Resonance
hits in the 100% PC preset. Creation and its Resonance request now use separate
clocks; accepted catches use the normal/enhanced opening, and a deferred first
catch resolves once at the creation request if no Phantom existed at input.
Admitted throws complete their final catch after Flower Burial ends without
admitting another throw. This changes 100% PC Resonances from 84 to 87 and
Regular from 86 to 89. Direct Scarlet hits remain 84 and throw-start clocks,
Qi markers, coefficients, and 60-second durations are unchanged.

The following table records the initial twelve proposed values. The October 24
acceptance below supersedes these preliminary values with the final reviewed
working-tree results.

| Rotation / build / breakthrough                    |      Previous DPS |      Proposed DPS |   Change | Previous total damage | Proposed total damage |
| -------------------------------------------------- | ----------------: | ----------------: | -------: | --------------------: | --------------------: |
| `dust-dummy-1-min-100pc/dust-full-min/18`          |  77305.3868340634 | 78039.81467726089 | +0.9500% |     4638323.210043805 |     4682388.880635654 |
| `dust-dummy-1-min-100pc/dust-full-min/19`          | 81119.84030432547 | 81890.52934056774 | +0.9501% |    4867190.4182595275 |     4913431.760434064 |
| `dust-dummy-1-min-100pc/dust-fully-relayed-max/18` | 73156.42294133201 | 73865.51221524917 | +0.9693% |     4389385.376479921 |      4431930.73291495 |
| `dust-dummy-1-min-100pc/dust-fully-relayed-max/19` | 77054.66009997776 | 77800.93258543861 | +0.9685% |     4623279.605998665 |     4668055.955126316 |
| `dust-dummy-1-min-100pc/dust-fully-relayed-min/18` | 75052.69588297587 | 75778.37636077964 | +0.9669% |     4503161.752978552 |     4546702.581646779 |
| `dust-dummy-1-min-100pc/dust-fully-relayed-min/19` | 78440.19900757818 | 79197.27720519452 | +0.9652% |     4706411.940454691 |     4751836.632311671 |
| `dust-dummy-1-min/dust-full-min/18`                | 77588.88247245115 | 78379.82199171977 | +1.0194% |     4655332.948347069 |     4702789.319503186 |
| `dust-dummy-1-min/dust-full-min/19`                |  81419.2773617976 | 82248.82810563916 | +1.0189% |     4885156.641707856 |     4934929.686338349 |
| `dust-dummy-1-min/dust-fully-relayed-max/18`       | 73319.79848869996 | 74087.15533096775 | +1.0466% |     4399187.909321997 |     4445229.319858065 |
| `dust-dummy-1-min/dust-fully-relayed-max/19`       | 77227.28372145865 | 78034.42549369467 | +1.0452% |     4633637.023287519 |      4682065.52962168 |
| `dust-dummy-1-min/dust-fully-relayed-min/18`       | 75218.61406855253 | 75999.54241513587 | +1.0382% |     4513116.844113152 |     4559972.544908153 |
| `dust-dummy-1-min/dust-fully-relayed-min/19`       | 78613.83531516723 | 79428.13376215902 | +1.0358% |     4716830.118910034 |     4765688.025729542 |

## Toad cancel and Dust snapshot acceptance (October 24, 2026)

The user accepted the 108 reviewed snapshot changes: 96 cases across Bamboocut
Kite, Silkbind Wings, Stonesplit Might, and Stonesplit Strength following the
Leaping Toad cancel change from 1.25 to 1.15 seconds, plus twelve Dust cases
from the existing umbrella timing work. The accepted values are recorded in
`tests/snapshots/rotation-dps.json`; duration and healing remain unchanged.

Kite IV BP gains primarily because its final Vile Condemned End retains five
Disintegration stacks. Wings changes only slightly through Divinecraft Fire's
buff coverage. Snapshot acceptance does not resolve the separate Might Defense
and Wings Qi alignment checks, which still report three failures.

The new seven-arrow Bursting Nine variants do not replace existing preset skills
and therefore introduce no further snapshot changes.

## Strength mixed Mystic filler acceptance (October 25, 2026)

The ordinary Mixed, Double Stab, and Infinite Vitality presets replace selected
Tab/VC or LC/VC fillers with seven-arrow Bursting Nine 2 Shots and Leaping
Toad/Deflect. All fifteen Mo Blade charged casts and their thirty direct hits
remain inside the sixty-second battle; VC/Tab prerequisites are preserved.

The user accepted the current three rotations and all forty-two changed
build/rotation/breakthrough snapshots. The mixed builds improve at
both Solo levels. The mixed-full-min results are:

| Rotation          | Solo |      Previous DPS |      Accepted DPS |
| ----------------- | ---: | ----------------: | ----------------: |
| Ordinary Mixed    |   18 | 83603.73949081561 | 84127.29719152386 |
| Ordinary Mixed    |   19 |  87681.1597907847 | 88216.85282984885 |
| Double Stab       |   18 | 82810.64338264748 |  84465.2414247234 |
| Double Stab       |   19 | 86847.15082300674 | 88577.24794485883 |
| Infinite Vitality |   18 |   83882.128012811 |   84639.521220197 |
| Infinite Vitality |   19 |  87952.8985750452 | 88730.89572011077 |

The snapshot matrix also evaluates these mixed rotations with pure builds.
Those combinations improve about 1.07–1.12% for Double Stab but regress about
0.49–0.51% for Ordinary Mixed and 1.01–1.08% for Infinite Vitality. Pure rotations
are unchanged. The accepted snapshots include these pure-build combinations.

Repeated LC/VC filler alternatives, including redistribution toward Exhausted,
did not improve on the accepted Double Stab Mystic sequence while preserving all
fifteen Mo Blade charged casts. The accepted first filler retains Mo QQ/Tab/VC
before Bursting Nine 2 Shots [7 hits], Leaping Toad, and Deflect.

## Might and Wings timing repair acceptance (October 25, 2026)

The user approved restoring the first Might Defense hold from 0.260075 to
0.360075 seconds after the shorter Toad cancel. Defense again covers the
intended dummy attack pair. The four Might snapshots are accepted:

| Build                   | Solo |       Previous DPS |       Accepted DPS |
| ----------------------- | ---: | -----------------: | -----------------: |
| might-full-max          |   18 |  97412.27314402927 |  97489.05541713296 |
| might-fully-relayed-max |   18 |  94758.28707058546 |  94833.51884322167 |
| might-full-max          |   19 | 102902.85267662379 | 102984.18949757682 |
| might-fully-relayed-max |   19 | 100111.18345810732 | 100190.82379965615 |

Both Wings presets move their four fixed Qi threshold times earlier by 0.04,
0.06, 0.14, and 0.16 seconds to retain proportional depletion around the earlier
break and recovery. Wings DPS and all other snapshots are unchanged. These
repairs resolve the three alignment failures noted in the earlier acceptance.

## Strength Mixed rotation acceptance (October 27, 2026)

The user accepted the revised ordinary Mixed, Double Stab, and Infinite Vitality
rotations and their 42 build/rotation/breakthrough snapshots. Ordinary Mixed and
Infinite Vitality place Leaping Toad, Deflect, then seven-arrow Bursting Nine in
that order. Ordinary Mixed's third second-round charged strike now exhausts the
boss at about 32.169 seconds. Double Stab also exhausts on its third
second-round charged strike, at about 31.649 seconds; its second Flute stays
after the second charge so the last VC's linked hits land by 59.5 seconds.

| Rotation          | Solo |      Previous DPS |      Accepted DPS |
| ----------------- | ---: | ----------------: | ----------------: |
| Ordinary Mixed    |   18 | 83050.72376735933 | 83456.22794182469 |
| Ordinary Mixed    |   19 | 87135.74937051283 | 87516.29149668838 |
| Double Stab       |   18 | 83385.74968058772 | 83330.54058106004 |
| Double Stab       |   19 | 87493.15847002153 | 87388.11644673634 |
| Infinite Vitality |   18 |  83553.5962516165 | 83496.96156463119 |
| Infinite Vitality |   19 |  87640.3186069428 | 87580.53906814677 |

The table uses Mixed Full Min; the accepted snapshot matrix also includes the
pure-build combinations. Every reviewed case retains a sixty-second duration,
and no other preset snapshot changes.

## Strength Mixed Double Stab follow-up (October 27, 2026)

The user accepted the Double Stab sequence with Leaping Toad/Deflect/Bursting
Nine, LC/VC after the first Tab/VC, Heng Q before the late Heng Special, and a
final Tab/VC/LC. It retains fifteen charged casts and exhausts on the third
second-round strike at about 33.791 seconds. The last direct hit lands at about
59.851 seconds with Mixed Full Min at Solo 18 and 19.

| Solo |      Previous DPS |      Accepted DPS |
| ---: | ----------------: | ----------------: |
|   18 | 83330.54058106004 | 83664.47808757986 |
|   19 | 87388.11644673634 | 87742.55442362059 |

The Double Stab snapshots for its mixed and pure build combinations change
because the extra Deflect and revised filler order alter timing and damage.
Other preset rotations retain their previous snapshots.

## Dust final catch correction (October 27, 2026)

The user approved removing the Perfect Catch and its Resonance from the final
queued throw of each Scarlet Spin. Each cast retains fourteen throws and 28
direct hits. The three-cast 100% PC preset now has 84 Resonances, and the
regular preset has 86, including their Bubbles Resonances. The twelve Dust
snapshots for both rotations, three builds, and breakthroughs 18 and 19 were
updated after review. At breakthrough 18 with Dust Full Min, 100% PC changes
from 77037.10483776833 to 76324.02843243226 DPS and regular changes from
77418.34869882601 to 76699.5753785789 DPS. Duration remains 60 seconds.

## Local snapshot reconciliation (October 28, 2026)

The user accepted the 40 outstanding local Dust and Strength Mixed cases:
both Dust presets (12 build/level combinations), Ordinary Mixed (14), and
Mixed Infinite Vitality (14). These account for the Flower Burial catch and
Resonance cleanup, Ordinary Mixed filler/Qi alignment, and Infinite Vitality's
Toad/Deflect/Bursting Nine ordering described in the skill-data reference.

All 40 regenerated records exactly match the already-released snapshots at
`3da8c84`. Strength's acceptance was committed remotely in `dc310e3`, and Dust's
final-catch acceptance in `3da8c84`. The local branch had the combat changes but
retained older snapshots. GitHub deployment run `40541053926` passed its release
DPS snapshot check on October 27; this reconciliation fixes local divergence,
not a bypass of the deployment gate. The Jade resource-rate and shared cast-end
extensions leave all 222 preset DPS results unchanged.

## Jade initial release baselines (October 29, 2026)

The reviewed 60-second Jade rotation spends Blossoms with Unfading Flower and
refills to 100 before its next activation. The user selected Fully Relayed Max
as the default and requested a matching non-relayed Graduate build for release.
These six cases are new coverage; all existing accepted cases are unchanged.

| Build             | Breakthrough 18 DPS | Breakthrough 19 DPS |
| ----------------- | ------------------: | ------------------: |
| Fully Relayed Min |  53510.384995774904 |  56014.237630177675 |
| Fully Relayed Max |   54469.20256012464 |   57452.54104213089 |
| Graduate          |  55823.534181683666 |   58770.95973991257 |

Each duration is 60 seconds; total damage is DPS multiplied by 60.

## Jade projectile attunement acceptance (October 29, 2026)

The user approved replacing the inherited Snowparting armor attunements on all
Jade builds with Vernal Umbrella Frequent Projectile and tagging Unfading Flower
projectiles for that bonus. The six accepted DPS values below retain the
60-second rotation; other paths are unchanged.

| Build             | Breakthrough 18 DPS | Breakthrough 19 DPS |
| ----------------- | ------------------: | ------------------: |
| Fully Relayed Min |   61702.41845532281 |  64592.436968280206 |
| Fully Relayed Max |  62790.019462148346 |   66232.75025976947 |
| Graduate          |   64350.09308954911 |   67750.33082174494 |

## Jade charge-aware rotation acceptance (October 29, 2026)

The user approved the corrected Fan Q two-charge and Umbrella Q two-charge
(three with Blossom Barrage) capacities, Star Reacher refreshes from Flower's
Lingering Bone refresh, and the optimized Mystic filler sequence. Jadebreak
has full coverage. The opener establishes Mistwillow with Heavy/Light VC;
subsequent refills use Umbrella QQ and immediately activate Flower at 100 Blossoms.

| Build             | Breakthrough 18 DPS | Breakthrough 19 DPS |
| ----------------- | ------------------: | ------------------: |
| Fully Relayed Min |   78972.27981860402 |   82575.79698052563 |
| Fully Relayed Max |   80388.34332468435 |   84709.45536687472 |
| Graduate          |   82377.87206481808 |   86643.52449195577 |

All six cases remain 60 seconds; total damage is DPS multiplied by 60.
Other paths retain their accepted snapshots. Fan pursuit is excluded pending
confirmed complete cast/cancel timing.
