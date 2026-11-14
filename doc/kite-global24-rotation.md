# Kite Global 2.4 four-HW End rotations

The regular Infinite Vitality and BP presets now land four enhanced, four-Heaven's-Will
Vile Condemned Ends within their sixty-second encounter. The user accepted these
sequences on November 14, 2026, after correcting the requirement that Celestial
Mandate must follow Heavenwill Declared. The BP Dragon Head preset is unchanged.

## Resource generation and timing

Each End refunds one Heaven's Will once per cast. Four-bar Ends apply a
25-second vulnerability after damage, refreshing and stacking it to two stacks.
The second End receives 8% HP damage and the third and fourth receive 16%.
Eligible charges are 0.32 seconds shorter; entering a charge during End cooldown
still uses the longer prefix. These existing mechanics are unchanged.

The new finishing sequence after the third End is shared by both presets:

1. All Under Justice, A5, A6 cancel.
2. Heavenwill Declared, Celestial Mandate, A5, A6 cancel.
3. Snaring Lash cancel, Deflect.
4. All Under Justice, A5, A6 cancel.
5. Sky Grasped, End [4 HW].

Regular Kite moves its third Heavenwill Declared immediately after the second
Soaring Spin, before Leaping Toad, making its next cast available during the
finish. The late Bursting Nine is replaced by resource generators. BP shortens
the Soaring Spin at the final Qi break from two stages to one, advancing its
third End while retaining five Disintegration stacks and Exhausted. Its former
final Soaring Spin is removed. Existing Qi event attachments are preserved.

Celestial Mandate's two-second cooldown does not make it independently
repeatable in game. Every Mandate in these presets consumes a preceding Declared
continuation; no extra standalone Mandates are used. Preset readiness tests
check that pairing and the resolved A5/A6 entry stages, because the shared
calculator currently allows explicit Mandate rows without enforcing this
prerequisite. This change does not alter that general calculator behavior.

## Accepted results and limits

These are fully relayed Min builds at breakthrough 19, Clay Oven Flatbread,
Fire, default global debuffs, Infinite Vitality, and 40 ms ping. Both encounter
durations remain sixty seconds.

| Preset  |      Previous DPS |      Accepted DPS |  Gain | End hit times (seconds)                   |
| ------- | ----------------: | ----------------: | ----: | ----------------------------------------- |
| Regular | 73946.66292438935 | 76787.18707630887 | 3.84% | 8.543182 / 28.139 / 47.019429 / 59.894429 |
| BP      | 82435.76041121784 | 83883.36299618313 | 1.76% | 9.4 / 28.1375 / 46.875 / 59.75            |

All twenty build/tier cases land four enhanced Ends at 40 ms: five builds for
each rotation at breakthroughs 18 and 19. Regular gains 3.7918–4.3349% and BP
gains 1.7191–3.1681%. Only these two rotations' snapshots are refreshed; the
Dragon Head cases remain unchanged.

These are tight dummy sequences, not latency-independent rotations. On the
matching Min builds, regular's fourth hit lands at 59.994429 seconds at 60 ms
and misses at 80 ms. BP lands its fourth hit at 59.75 seconds at 60 ms and
59.990293 seconds at 80 ms. The presets remain calibrated to 40 ms. The earlier
search results that repeated Mandate without Declared are invalid and are not
the accepted sequences.
