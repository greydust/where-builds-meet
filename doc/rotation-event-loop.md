# Incremental rotation event loop

The rotation is authored input, not a generated timeline. It stores ordered
skills, explicit delays and attachments, plus encounter events with timestamps.
Generated cooldown waits are output only; legacy automatic waits are removed at
the load/import boundary with fight-start indexes remapped.

## Four collections

1. Ordered input: skills and explicit delays, traversed with a cursor. Attachments
   belong to the following eligible anchor and expand with it.
2. Timed input: encounter events sorted once by timestamp and input order.
3. Expanded events: a stable priority queue of currently expanded actions, triggers,
   periodic ticks, expirations and next-ordered-item wakeups.
4. Final timeline: resolved rows/actions and the snapshots needed for calculation.

Compare the heads of timed input and expanded events. Resolve the earliest event;
causal ordering breaks equal-time ties, with Battle End preceding damage. Starting
an ordered item expands only that item and schedules its successor marker at its
resolved cast end. A queued trigger is the exception: accepting its earlier
`queueTime` reservation moves that successor marker when the queued skill starts,
so the owning row remains active through the queued skill's completion.
Subaction timing can adjust that marker, not future casts. Cooldown availability
is checked against live state. A cooldown reset wakes a waiting ordered skill
immediately; obsolete retry events must not start it twice. The readiness check
precedes attachment expansion so before-start effects do not run during a
cooldown wait. Once accepted, cast-start modifiers determine the new cooldown
window and cast duration.

DOTs keep only one upcoming tick, regardless of duration. After the tick's actions
and causal follow-ups resolve, a completion marker schedules its successor from
the original application cadence and current expiry. Expected DOTs use their
existing single tick wakeup and probability tracker. Both paths stop at the
combat endpoint rather than expanding the remaining lifetime.
When `resetOnRefresh` is false and the periodic definition is unchanged, a DOT
refresh updates expiry and ownership without invoking the scheduler while a tick
is pending. References to that tick's queued events update its causal ordering
without scanning the whole queue. Only strictly future ticks transfer ownership;
a refresh at the current tick boundary applies to subsequent ticks. Shortening
expiry cancels an ineligible pending tick, honoring `tickOnExpire`. Extending an
active DOT after its last eligible tick schedules the next cadence boundary.
Damage and effect state are captured when the tick starts, so retaining a row
does not freeze its buffs or stats. Cadence resets, changed periodic definitions,
and finite/indefinite lifetime transitions rebuild the pending tick. Consumption
invalidates the old successor chain, including across reapplication.

Non-DOT indefinite periodic effects retain their single-successor wakeup, while
finite non-DOT periodic effects retain their bounded schedule. Periodic resource
amounts can increase by a data-defined amount each tick, as used by Hellfire.

## Readiness after charging

A composite reference can set `waitForRequirement: true` after an unconditional
`silent: true` charging prefix. Silent components cannot define actions,
cooldowns, or attack responses and do not emit skill-start notifications.
The weapon switches at the earliest possible cast start. Explicit start
attachments also execute there; they are authored events, not charge emissions.

After the minimum charge duration and component ping, the release and remaining
cast events are held outside the queue. The same live traversal continues with
pending hits, resource changes, resets, and timed events. Between events, passive
resource thresholds and natural effect expiry supply readiness boundaries.
All events at a tied boundary resolve before readiness is accepted.

When ready, shift the existing row's displayed start by the extra wait and resume
its held events at the current clock. The charge duration stays unchanged, so
the displayed interval ends at release. No past event is inserted or replayed.
Rows are stable objects referenced by queued events; timestamp edits do not
require a linked-list timeline. Generated `automatic: "requirement"` Delay rows
describe the preceding wait. If combat ends first, no release is published. An
unreachable release without a combat endpoint is skipped. The ordinary Vile
Condemned fallback selection remains unchanged.

## Combat cutoff

With Battle End, exhausted ordered input does not end combat: process remaining
events until Battle End, excluding damage at that timestamp. Without Battle End,
the final ordered item's completion ends combat. Actions and their causal
follow-ups at its cast-end timestamp resolve before the completion marker. A
trailing explicit Delay extends this endpoint. Damage after it is discarded,
including DOTs and feedback loops. No last-damage discovery pass is needed.

## Damage and reuse

The live state also owns buff/debuff snapshots and their numeric aggregate.
Actions share unchanged immutable snapshots and consume prepared effects/stats
from the existing action resolver. Named effect requirements query the
authoritative maps directly; no parallel active-effect array is maintained. See
[stat-pipeline.md](stat-pipeline.md#sequential-prepared-combat-state) for reuse
keys, invalidation, historical ownership, and attribution behavior.

Each baseline and event-changing variant performs one chronological combat
traversal. A worker-local action resolver calls the shared damage/healing formulas
inside that traversal. HP, accumulators, recording settlements, and damage-event
listeners use each resolved result immediately. Generated replays enter the same
queue and reference resolved source damage. Collectors retain those results for
final aggregation; they never reconstruct or replay combat. Only event-invariant
variants may reuse stored action snapshots. Probability trackers remain effect-local.

Inner Way `damageOutcome` triggers require live traversal for comparisons, including
stat and attunement changes. Battle Anthem's outcome-dependent Endurance recovery
changes later payments and missing-Endurance bonuses; reusing the baseline meter
while recalculating outcomes cannot reproduce that feedback.

The internal clock begins at the first ordered item. Battle start is recorded once
as `battleStartTime` (`-1` until detected). Detection activates battle-relative
encounter events, passive regeneration for resources other than Endurance, the practice target's declared attack
patterns, and shared expected DOT ticks. Precombat DOT applications remain in their trackers until clock activation.
The worker publishes internal timestamps and battle start; the UI subtracts the
recorded start for display. There is no anchor-convergence or duration-discovery
pass. Auto HP is removed, so HP never depends on future rotation duration.

Endurance spending, continuous consumption, regeneration overrides, and passive
recovery run from the first ordered item, including before battle start. Battle
detection does not reset this resource clock.

The editor omits resolved actions rejected by their requirements or cooldowns.
Action snapshots alone do not indicate acceptance: only accepted actions receive
`combatOrder`. This keeps stack-dependent DOT damage alternatives from appearing
as multiple hits for one tick; pending calculation previews remain visible.

A composite component can declare `{ "type": "skillStart", "time": 0 }` when
it begins another actual cast. This action dispatches the existing skill-start
effect triggers using that component's tags. It does not start another rotation
row, pay another parent cost, or change cast duration. Umbra's Special follow-up
uses it to reset its once-per-cast Endurance refund allowance.

## Verification

### Stack-indexed periodic probability storage

Each temporary causal partition has an inactive-probability scalar and, per damage
owner, a numeric Map from stack count to sorted `(expiration, probability)` lists.
Tiny-state merging preserves each stack count.
For a hit, visit stack counts downward. Scale each entry's failure mass in place,
sum its success mass, then insert one destination entry at the refreshed expiration.
Equal expirations merge. Threshold-burst mass is published only after processing
the original application, so it cannot receive that same application again.
Conditional follow-ups transform only their partition; release merges it back.
Exact cadence weights and shared-grid pending-tick weights travel with the mass.

The default storage is an indexed linked list backed by parallel JavaScript numeric
arrays and a recycled-slot free list. Head removal, tail append and equal-tail
merging are O(1); finding an arbitrary insertion/merge position is still O(n).
Tiny-state merging collects released rare entries per stack across owners and
expiration times. It removes entries that actually merge and inserts their weighted
deadline, preserving sorted order; significant and singleton entries remain in place.
Branch release uses a forward-only sorted merge, O(n + m), with O(1) work per
visited node rather than O(n) insertion searches per source entry. Current-expiry
follow-ups use the tail directly. Fixed-duration chronological applications also
append or merge at the tail; the generic variable-duration application path retains
one ordered traversal when its new expiration precedes the tail.
These complexity guarantees apply to the default indexed backend; diagnostic packed
arrays still shift elements for middle edits. Exact-cadence payload maps additionally
require traversal of their cadence entries; shared-grid states have scalar payloads.
Each effect retains one pending expiry wakeup selected from its list heads, not
one wakeup for every future expiration. Due owners use the normal effect-action
executor. A dispatched-time cursor prevents duplicate wakeups while those actions
resolve. Tiny-state merging remains the only additional expiration approximation.

`TimelineBuildInput.expectedPeriodicStorage` accepts `"indexed"` (default) or
`"packed"` for diagnostics. Packed arrays use a head cursor and linear compaction,
with contiguous traversal but potentially shifting middle insertions.
`node script/probe/benchmark-periodic-state-storage.mjs 400` compares both against
committed reference `78537e2` using the same fixture, rotating run order, discarding
six warm-up rounds and reporting medians from six measured rounds. A local run:

| Storage              | Timeline | Total baseline |
| -------------------- | -------: | -------------: |
| Previous state maps  |   135 ms |         151 ms |
| Packed arrays        |    64 ms |          79 ms |
| Indexed linked lists |    63 ms |          80 ms |

All produced 1,342 timeline rows, 1,739 damage entries and 1,280 Piercing entries;
total damage was 56,551.976896 with relative differences below `3e-15` for both
total and Inner Way damage. These are machine-local timings, not latency guarantees.
An earlier paired run measured 164 / 104 / 92 ms total respectively. Both new
backends materially improve on the reference; their relative advantage varies
between runs. Indexed lists remain the default with constant-time unlinking and
slot reuse, while packed arrays remain available for comparison.
`tests/periodic-state-storage.test.ts` compares both backends to the committed tracker
across randomized owners, gains, refreshes, expirations, conditional follow-ups and
exact/shared cadences, and verifies sorted insertion and recycled-slot isolation.

### Tiny expected-state merging

Expected DOT trackers follow the shared policy in `probabilityStateMerging.ts` and
merge released states with individual absolute probability below `1e-5` and the
same stack count, regardless of expiration time. Stack counts remain unchanged;
pending-tick fractions and expiration times become probability-weighted means,
with expiration means rounded to the existing 0.0001-second clock. Different stacks
remain separate. Source ownership
is retained as a probability-weighted mixture. Application-relative cadence
entries also merge by probability without time buckets, weighting their
tick times. A singleton keeps its original values. There is no additional
active/expired timer eligibility test; chronological execution normally consumes
expired states before merging. Temporary causal branches enter the retained
distribution after their linked follow-ups finish. Significant states and
sampled simulation retain their original values.

Merging runs after ordinary applications or after conditional burst follow-ups
release their branch. The scheduler updates the effect's earliest-expiration
wakeup to reflect the merged lists. Probability is not
discarded; expiration timing and its interaction with later hits are approximated.
`TimelineBuildInput.expectedPeriodicStateMerging: false` disables this new
approximation for comparisons, without disabling the existing shared DOT grid.

An alternating baseline benchmark on 2026-10-08 used the Wind Fully Relayed Min
preset and Dummy 1 Min Infinite Vitality rotation with Fivefold Bleed replacing
Morale Chant. After four warm-up pairs, six measured pairs gave median baseline
times of 531 ms with the former time-bucket policy and 398 ms with same-stack
merging across deadlines. Damage entries fell from 1,852 to 1,413; expiration
Pierce entries fell from 826 to 387. Five-stack bursts stayed at 450 and DOT ticks
at 59. Expected DPS changed from 68,113.8785 to 68,096.9623 (−0.02484%). With
periodic merging disabled, DPS was 68,123.2593. These are fixture-specific
approximation differences, not a universal error bound. Sampled runs with fixed
rolls of 0.1 and 0.9 were identical under both policies.

The benchmark results below are historical and do not measure the current
same-stack policy without timing buckets.

`node script/probe/benchmark-fivefold-state-merging.mjs 400` alternates exact and
merged runs, discards four warm-up pairs, and reports medians of six measured
pairs. Initial results at the former `1e-6` threshold: timeline 255 → 158 ms; total baseline 299 → 181 ms;
rows 2,847 → 1,356; damage entries 3,244 → 1,753; Piercing Damage entries
2,785 → 1,294. Five-stack bursts remain 396 and shared DOT rows remain 59.
Total damage differs by about `1.8e-14` relative and Inner Way damage by
`1.3e-13` relative on this fixture, not a universal error bound.

Raising the threshold to `1e-5` reduces rows to 1,342, damage entries to 1,739,
and Piercing Damage entries to 1,280 (14 fewer than `1e-6`). Five-stack bursts
and DOT rows remain unchanged. Total/Inner Way relative damage differences remain
about `1.8e-14` / `1.3e-13`. One warmed run measured 167 ms timeline and 195 ms
total, versus 306 / 363 ms with merging disabled in that run. Between-run timing
variation does not establish an additional speedup over the former threshold.

### Incremental scheduling

`tests/incremental-timeline.test.ts` checks live cooldown-reset wakeups,
attachment timing, cast/Delay/Battle End cutoffs, lazy expansion, editable
unreached steps, timed-only encounters, and legacy wait migration.
The replay and healing probes give delayed follow-ups an explicit combat window.
Fivefold Bleed's grid and exhaustive branch-history probes continue to verify
probability behavior independently of the event-loop structure.

On the 400-hit Fivefold stress fixture, the warmed timeline-only median over the
last four of six runs changed from about 361 ms to 306 ms on the same machine.
Output remained 2,847 rows, including 59 DOT rows; tick checks fell from 118 to 59.
This is a construction improvement, not a claim that probability processing is
now cheap or that total calculation/UI latency equals timeline runtime.

## Incoming-attack readiness and success

After cooldown readiness, an ordered skill with `attackResponse` selects the
next unreserved manual Take Damage event or dummy attack before Battle End,
accounting for ping before window start. The scheduler waits until attack time
plus the configured end margin minus the resolved response duration. The window
uses this skill's timing or its `durationFrom` reference; blocking cast duration
remains independent. Previous casts and cooldowns remain lower bounds.

Selected attacks stay fixed through the wait. Reservations group simultaneous
hits, preventing consecutive zero-duration responses from selecting the same
attack. No next attack means no wait. Cooldown resets wake cooldown waits only.
Attachments expand after readiness. Response alignment can extend the ordered
rotation, and dummy attacks remain part of that same event loop.

Accepted casts register response windows. An incoming hit inside a window is
avoided and queues one causal `attackResponse` event per defensive cast, ahead
of later outgoing events at that timestamp. A Take Damage action with zero
resolved damage still counts as an incoming hit for this response path. A
manually authored zero-damage Take Damage event also runs the Take Damage
lifecycle; a positive attack reduced to zero by a defense does not count as
damage taken. When no attack is selected, a defensive skill with
`attackResponse.fallback` resolves its success at the skill start. The
`PerfectDodge` variants and `DeflectSuccessful` use this fallback; `Dodge` does
not. A defensive skill's fallback response is disabled when response alignment
selected a following attack, so that attack remains the sole success trigger.
Additional incoming hits remain avoided without duplicate success events. Setup talent hooks run on success; the configured success skill uses
the existing triggered-action executor.
A per-row response context preserves originating weapon and attribution through
success descendants without mutating the active weapon. Cancel windows remain
active while subsequent skills execute. Forecast replays use the same mechanism
with isolated windows, reservations, and contexts.
