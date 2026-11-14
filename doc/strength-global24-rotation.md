# Strength Global 2.4 rotation review

Global 2.4's Mixed Dummy 1 Min uses the user's sequence, including an explicit
switch to Phalanxbane before Dragon's Breath and **Infinite Vitality**. It
replaces Mixed and hides Double Stab, Mixed Infinite Vitality and Mixed Smolder
Poet only in this preview. Live presets, path defaults, accepted DPS snapshots,
custom rotations and build presets are unchanged.

The rotation retains fifteen Burning Heart casts and four Total Annihilation
casts. Under Global 2.4, each QQ resolves to Soul and refreshes Iron Guard.
Battle start is Fleeting Trace's sixth hit. The user-specified second-round break
attaches to the second charged strike, at about 28 seconds with the active preview clocks. Intermediate
Qi thresholds are proportional estimates, retaining ten-second exhaustion and
four-second recovery immunity. No automatic Qi-damage calculation is implied.

## Filler comparison before the CN timing update

These comparisons use Solo 19, Mixed Fully Relayed Min, 40 ms, the standard
snapshot food/debuff environment, Fire Divinecraft, and a fixed 60-second window.
These numbers retain the pre-datamine General's Bane timing and describe the
filler experiment, not the later preview timing revision. The Vitality columns
are finite-budget diagnostics, not limits on the installed
Infinite Vitality preset.

| Global 2.4 arrangement                                   |                DPS | Finite minimum Vitality | Finite final Vitality |
| -------------------------------------------------------- | -----------------: | ----------------------: | --------------------: |
| Installed user sequence                                  | 90,339.78491496266 |                      -9 |                     5 |
| Replace late Toad/Deflect with seven-arrow Bursting Nine | 90,372.82704973263 |                     -14 |                     0 |
| Omit the prep Drink, retaining the other user fillers    | 89,762.03059165619 |                       1 |                    15 |

The filler sweeps covered 3,934 arrangement evaluations, including different
LC/VC chain lengths, Mystic placements and endings. This is a bounded search,
not a claim of global optimality. Candidates that lost a charged hit or QQ were
excluded from the main comparison. The Bursting Nine gain is approximately
0.037%, so the user's sequence remains installed. Dropping Drink permits the
slower unenhanced Breath cast and avoids temporary borrowing in the tested
baseline, at approximately 0.640% lower damage. No unverified animation or
cancel timing was shortened to make a variant fit.

## Infinite Vitality

A finite-budget diagnostic starts with 100 Vitality, spends 155 and regenerates
60, ending at 5. Finite and infinite Vitality therefore give identical calculator
DPS because the current model discounts Mystic damage only for a final deficit.
That does not establish chronological affordability:

| Cast                | Battle time | Vitality before cast | Cost | Shortfall |
| ------------------- | ----------: | -------------------: | ---: | --------: |
| Second Flute cancel |    24.306 s |                   44 |   50 |         6 |
| Leaping Toad        |    45.679 s |                   16 |   25 |         9 |

These shortfalls explain the user's Infinite Vitality requirement. The preview
sets `infiniteVitality: true`; a positive ending balance cannot fund an earlier
cast retroactively. The simulator's aggregate budget model is unchanged.

## Scope and timings

After applying the mapped CN regular-Q/Slash timing changes, the same Solo 19
Mixed Fully Relayed Min fixture measures **90,617.11835831711 DPS** for the new
rotation, versus **88,463.89239577002** for old Mixed and **87,734.50006081148**
for old Double Stab, all using the updated Global 2.4 definitions. This is a
2.43% gain over old Mixed. These are preview comparisons, not accepted Current
snapshot replacements. The filler sweep above has not been rerun with these clocks.

Overrides live in `data/preview/cn-2.8.5/rotation/stonesplit-strength.json`.
A null entry hides that preset only in the selected preview. Only bundled default
entries resolve through this overlay; custom entries retain their saved record.
Preset views are not persisted as custom data. Returning to Current restores its
original list and saved selection. Current damage snapshots are unchanged.

Battle End remains at 60 seconds. The faster regular Q brings the final LC's
last hit inside the window (about 59.992 seconds) at baseline 40 ms. The final
VC was outside and has been removed from the Current Mixed preset, together
with its attached movement event. Mixed now ends with Grave Frost. At baseline
40 ms this removes no counted damage; lower-latency runs also use this shorter
sequence.

The subsequent CN report establishes branch-specific General's Bane/Slash clocks,
not a universal replacement timing or proof of Global activation. The preview now
uses .615384615 seconds for the regular Q and .576923077 for Slash; slower Q2 is
unchanged. The prep delay compensates for Q's shorter duration. Only the initial
19m movement attachment remains; the battle anchor follows the sixth Fleeting
Trace hit after the redundant attachments are removed. Current timings stay unchanged.

## Pure ending review (November 14, 2026)

Ordinary Pure now appends Snowbreak Spring after its existing final Grave Frost.
At Solo 19, Pure Fully Relayed Min, 40 ms and the snapshot environment, this
raises DPS from 84,261.44610330438 to 86,641.71613698362. The added VC's direct
hit lands at 59.15237352062631 seconds. At 60 ms it contributes no damage within
the fixed minute. Pure Infinite Vitality is unchanged.

The subsequent Pure spacing search treats Tab's VC enable as a roughly
five-second window, not an adjacency requirement. Intervening Fleeting Trace
and Stab casts are therefore allowed. Local moves, intact filler and summon/Tab
blocks, LC/VC insertions, and cooldown-aligned waits did not establish a damage
gain with both a fourteenth buffed LC and a twenty-fourth damaging VC. The
installed Solo 19 baseline retains thirteen buffed LCs out of sixteen and
twenty-three direct VC hits. This bounded search does not prove optimality.

One rearrangement measured 87,206.59518564648 DPS with the same cast counts,
but moved the attached exhaustion break roughly 33 ms earlier. Holding the
break at its original time instead left its earlier VC outside exhaustion,
preventing that VC from clearing Forgetfulness's cooldown. That arrangement is
not installed; its apparent gain depends on the authored Qi timing.
