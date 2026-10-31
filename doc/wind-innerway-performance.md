# Wind Inner Way swap performance audit

> **Historical performance audit (2026-09-27).** Results describe an earlier calculator revision, not current performance. See the [documentation index](README.md) for current references.

Date: 2026-09-27. Calculator revision: `f0f40a7` before this audit.

The original measurements below precede the internal-buff counter change.
The implementation follow-up at the end corrects the original attribution of
the comparison rebuilds to Rodent counters alone.

## Reproduction and scope

Run `node script/probe/benchmark-wind-innerways.mjs` from the repository root.
The benchmark uses the production preset bundle factory, the Fully Relayed Min
Wind build, Dummy 1 Min Infinite Vitality rotation, breakthrough 17, 40 ms ping,
Simmering Fish Slices, Fire Divinecraft and no Script. It replaces only T6
Morale Chant with T6 Fivefold Bleed in the process-local preset object and
rebuilds the complete character sheet. Canonical JSON is unchanged.

The stat and attunement groups use the same eligibility, maximum-roll and base
stat inputs as RotationEditorTab. There are 26 stat variants and seven attunement
variants. Comparisons receive the uncompressed baseline, as on a warm worker
cache hit. Two alternating warm-up pairs are discarded before six measured
pairs; output includes individual timings, medians, row counts and DPS.

These are local Node 24.14.0/Vite SSR timings with the phase collector inactive,
not end-to-end browser latency or a production-bundle benchmark. Setup/set/Inner
Way comparisons, graduation calculations, inactive rotations, worker transport
and rendering are excluded. Therefore the measured comparison groups explain
only part of the full refresh. The user's exact saved build was not available.

## Findings

The final six-sample medians are:

| Work                     | Morale Chant | Fivefold Bleed |
| ------------------------ | -----------: | -------------: |
| Baseline                 |     62.11 ms |      235.03 ms |
| Publication compaction   |      0.69 ms |       30.06 ms |
| 26 stat comparisons      |  1,075.95 ms |    4,434.12 ms |
| 7 attunement comparisons |    289.33 ms |    1,156.55 ms |

The two comparison categories total 1.37 seconds versus 5.59 seconds, about
4.1 times as long with Fivefold, before the other categories finish.

Baseline output grows from 746 to 2,086 timeline rows. Publication compaction
costs about 30 ms for Fivefold and removes only three rows (2,083 remain), versus
less than 1 ms for Morale. Both have stable DPS across repeated runs:
67,544.2331265345 for Morale and 67,003.14845386177 for Fivefold. These are fixture
results, not advice about the user's own build.

A diagnostic run instrumenting ExpectedPeriodicTracker.apply observed a maximum
of 244 live states and 2,167 applications for Fivefold. The initial phase trace
reported 3,421 action-resolution calls and 3,480 damage-formula calls versus
1,253 and 906 with Morale. Formula calls also include attribution calculations;
these counts must not be interpreted as repeated combat traversals. A warmed
CPU sample likewise identifies damage calculation, combat traversal and generated
event handling as substantial costs. It does not establish a probability-state
explosion.

## Comparison with the design

- The battle-aligned DOT clock, indexed probability lists, tiny-state merging,
  and causal branch isolation remain enabled. No evidence of a fallback to
  individual exact tick cadences was found.
- Baselines use one live traversal. The existing single-pass, Wind and Fivefold
  tests pass (seven files, 13 cases).
- Worker baseline caching is present. Comparison requests do not resend the
  baseline when the worker already knows its cache key. Published compaction is
  separate from the full baseline retained in that cache.
- The practical mismatch is the broad statement that pure stat and attunement
  comparisons reuse a timeline. `calculateRotationComparisons` requires live
  resolution whenever the baseline contains an accumulator application, among
  other feedback conditions. Wind applies Rodent Rampage/Enhanced Rodent Rampage,
  which use accumulators, so even the seven attunement variants rebuild combat.
  Subsequent inspection also found Rodent Hunt recording/replays and World to
  Sword applications in this fixture. Each independently keeps the live guard
  active, so removing the Rodent counter blocker alone cannot enable reuse for
  the full preset. The guard has existed since September 16; this audit does not establish a new
  regression. Fivefold magnifies the cost of that existing conservative choice.
- Any supplied `setupEffects` also forces live resolution, even when the caller
  supplies no replacement timeline. The current fast-path description is thus
  more permissive than the actual implementation. The guard protects feedback
  correctness; simply deleting it is not a safe optimization.
- All comparison categories and their individual variants run sequentially.
  The baseline is published first, but the full refresh waits for much more than
  the displayed build's single DPS calculation.

## Improvements, in priority order

1. **Distinguish event-count feedback from damage-value feedback.** Audit whether
   an attunement-only variant can reuse Wind's event sequence when its accumulator
   depends on action tags/counts, not damage amount. Preserve rebuilds for damage
   recording, target HP, healing, conditional outcome/resource effects and compacted
   fallback baselines. Differential tests must compare complete live and reused
   results before relaxing the guard. This targets repeated combat work without
   changing Fivefold probability accuracy. No speedup is claimed until measured.
2. **Reduce repeated per-hit preparation.** The damage formula still iterates
   every attunement entry and checks its tags on each hit, including zero-valued
   entries. Prepare matching contributions per immutable attunement/tag context,
   and profile the remaining effect-field scan. Preserve summation order and
   invalidate on variant/overridden input changes. Validate against exact DPS
   snapshots and direct formula tests.
3. **Prioritize requested comparison panels.** The current eager sequential
   refresh is consistent with the documented UI design, but demand-driven or
   deferred categories could improve perceived responsiveness. This changes
   refresh behavior and should be an explicit product decision.
4. **Review publication compaction separately.** About 30 ms buys only three
   merged rows here because full contexts are serialized to identify duplicates.
   A cheaper eligibility/key path may help, but it is much smaller than the
   multi-second comparison cost and must preserve attribution/outcome equality.

Do not raise the probability-merging threshold, discard rare bursts or reuse
merged publication rows as combat inputs merely to improve this benchmark.
Those changes alter numerical behavior or causal semantics. No production
calculation changes or snapshot updates were made by this audit.

## Internal-buff counter implementation follow-up

Rodent Rampage and Enhanced Rodent Rampage now count coordinated attacks with
separate hidden buffs, using `onMaxStack` like Dust's summon cadence. Active
buff triggers reuse the setup-trigger action handler. The shared
`oncePerSkill` filter accepts the first damage action of each stage and rejects
probability-weighted expected rows. `additionalStack` supplies the second count
for Infernal/Mortal attacks. Each counter declares its `parentEffect` so refresh
preserves progress and updates expiry/attribution, while removal or replacement
clears the count. Other accumulator behavior and the comparison guard are
unchanged.

Differential tests use a coordinated-Rodent rotation without recording or
healing. Both Morale Chant and Fivefold Bleed variants reuse the timeline, and
all eligible attunement comparisons match forced live resolution. The full
dummy preset still takes the live path because of Rodent Hunt and World to
Sword; this change alone does not resolve its multi-second comparison cost.

A same-process before/after benchmark replaced only the Wind buff definitions
with their pre-change versions for the control cases. Each case discarded two
warm-ups and measured six samples, alternating forward/reverse order. Full-preset
medians (milliseconds) were:

| Work                     | Morale before | Morale after | Fivefold before | Fivefold after |
| ------------------------ | ------------: | -----------: | --------------: | -------------: |
| Baseline                 |        100.15 |       102.65 |          406.65 |         404.63 |
| 26 stat comparisons      |      1,818.43 |     1,930.75 |        7,341.00 |       7,523.15 |
| 7 attunement comparisons |        505.88 |       509.18 |        1,941.74 |       2,005.42 |

There is no measured full-preset speedup; combined comparison time was about
3–5% higher in this run. Baseline DPS and timeline row counts were unchanged.

An isolated rotation (Rampage, ten Infernal Light 3 casts, three-second delay,
40 ms ping) removes recording/healing casts while retaining the same build and
comparison groups. Its medians were:

| Work                     | Morale before | Morale after | Fivefold before | Fivefold after |
| ------------------------ | ------------: | -----------: | --------------: | -------------: |
| 26 stat comparisons      |         78.54 |        39.99 |          177.70 |          71.95 |
| 7 attunement comparisons |         18.06 |         7.27 |           45.69 |          16.40 |

This demonstrates the reuse benefit where Rodent was the only blocker. It does
not represent the full preset or browser latency. Differential tests additionally
cover attack, crit, and affinity stat variants; the accepted DPS snapshot guard
passes without refreshing any snapshot.

## Attunement matching cache follow-up

The damage formula now reuses an ordered list of matching attunement keys and
definitions, keyed by the immutable input object and complete effective tag
signature. Values and numerical totals are not cached. Every hit retains the
original multiplication/addition order, including its initial character-stat
Formless Penetration contribution. Weak ownership allows discarded inputs and
their cached lists to be collected together.

A same-process benchmark used separate Vite SSR module graphs for the previous
full-scan damage function and the cached function. Both used the full preset
fixture above, alternated forward/reverse case order, discarded two warm-ups,
and measured six samples. Medians in milliseconds:

| Work                     | Morale before | Morale after | Fivefold before | Fivefold after |
| ------------------------ | ------------: | -----------: | --------------: | -------------: |
| Baseline                 |         90.61 |       106.73 |          435.75 |         345.27 |
| 26 stat comparisons      |      1,594.39 |     1,667.87 |        6,710.41 |       6,318.05 |
| 7 attunement comparisons |        440.28 |       411.99 |        1,757.22 |       1,702.92 |

These initial measurements are confounded by the benchmark setup; see the
controlled investigation below. They should not be treated as implementation
speedup or regression estimates.

Fivefold's baseline was about 21% faster and the sum of the comparison-group
medians about 5% lower. Morale did not show an overall gain: its baseline was
about 18% slower and its combined comparison medians about 2% higher. These
local SSR measurements include runtime/GC variation and do not establish a
uniform or browser-level speedup. The full preset still needs live combat
resolution, so matching reuse does not remove the dominant repeated traversal.
Both versions produced exactly the same baseline DPS and timeline row counts.

Direct differential tests compare cached and uncached expected/sampled damage
with inclusion/exclusion/alternative tags, multiple matching bonuses, reversed
input orders, zero-to-nonzero values, changed tags, and replacement inputs.

## Morale timing investigation (2026-09-28)

The earlier 90.61 → 106.73 ms baseline result did not reproduce consistently
when each implementation ran alone in a fresh Node process. Four processes ran
in scan/cache/cache/scan order. Each used one Vite SSR module graph, 20 baseline
warm-ups and 40 measured baselines. Comparison groups used two warm-ups and four
measured samples. The full Morale fixture and calculations were unchanged.

| Fresh process     | Baseline median | All 33 comparisons median |
| ----------------- | --------------: | ------------------------: |
| Full scan, first  |        80.23 ms |               1,951.89 ms |
| Cache, first      |        83.38 ms |               1,883.13 ms |
| Cache, second     |        82.32 ms |               1,751.96 ms |
| Full scan, second |        88.47 ms |               2,028.57 ms |

Separate phase-instrumented runs (ten baselines per process) measured the same
906 attunement aggregations per baseline. Their median combined time was
6.90/7.63 ms for the full scan and 1.34/1.25 ms for the cache. These instrumented
times are diagnostic and are not substituted for the uninstrumented totals.

An isolated aggregation benchmark used all 457 retained Morale damage-entry
contexts, covering 16 tag signatures and 54 attunement keys. The cached list
averaged 3.86 matching entries. Across 12 alternating sample pairs after eight
warm-ups, 91,400 aggregations took a median 238.47 ms with the full scan and
54.45 ms with the cache (about 4.4 times faster). Outputs matched exactly.

The original four-case ordering was also unbalanced: in both forward and reverse
order, cached Morale always followed a heavy Fivefold comparison workload.
Uncached Morale followed another Morale case at alternate round boundaries.
Reversing case order therefore did not balance the preceding allocation/workload
history. The original comparison additionally shared a process between two
separate module graphs and used only two warm-up pairs. Its single median
difference is not reliable evidence of a Morale cache regression. The isolated
measurements show that matching is faster, while the few milliseconds saved in
that phase can be masked by variation in the rest of the calculation.

An identical-code control repeated the original two-graph, four-case ordering,
but loaded the same uncached damage implementation in both graphs. After two
warm-ups and six measured samples, graph A/B baseline medians were 96.67/128.69 ms
for Morale and 445.11/373.10 ms for Fivefold. The harness thus reported Morale
33% slower and Fivefold 16% faster without any implementation difference.
Morale's stat-comparison medians were 1,779.73/1,794.30 ms and attunement-comparison
medians were 481.20/473.94 ms. This demonstrates that the original baseline
comparison cannot isolate the cache's effect. It does not identify the exact
runtime cause of the historical difference; GC alone was not established as
the explanation. Future performance comparisons should isolate implementations
in fresh processes, balance run order, and report repeated runs and phase costs.
