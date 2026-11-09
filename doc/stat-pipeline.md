# Stat snapshot pipeline

This is the authoritative stat-stage specification. Timeline scheduling follows
[rotation-event-loop.md](rotation-event-loop.md); damage and healing formulas
follow [damage-formula.md](damage-formula.md).

```text
base inputs / solved override offsets
  -> rawStats
  -> stats
  -> buffedStats
  -> skillStats
  -> actionStats
  -> damage / healing
```

## Stage ownership

1. `rawStats` adds permanent character progression, gear, set stats, arsenal,
   bow/ring, Inner Ways, martial-art flat min/max attribute bonuses, and
   five-attribute conversions through explicit `rawStat` effects. It contains ordinary
   stats, without effective ranges or final outcome rates.
2. `stats` adds the remaining martial-art `stat` bonuses to ordinary fields and
   collects `effectiveStat` bonuses, including food, as effective-only inputs.
   This is the second martial-art pass: STEADY rank-conversion formulas read the
   same immutable `rawStats`, including conditional conversions. Dynamic native
   combat passives explicitly marked `formula.resolveAt: "action"` remain live
   for the action snapshot instead of binding here. All raw flat attribute bonuses
   are present before STEADY conversions; physical-attack conversion results and
   food do not feed another STEADY conversion. Talent and food order cannot
   change those bound amounts. Effective bonuses do not
   change ordinary fields or feed formulas that read ordinary stats. Effective
   attack ranges and final rates are fields on this complete object, not a
   separate runtime stat map. This is the character-sheet and worker snapshot.
3. `buffedStats` copies `stats` and adds fixed unconditional contributions from
   the selected global buffs/debuffs. It is the baseline for skill calculations.
   Conditional global rules still require action context and are resolved there.
4. `skillStats` adds stat effects whose conditions depend only on effective
   action tags or equipped martial arts. Cache one immutable snapshot per tag
   signature. Multi-action components can have different signatures.
5. `actionStats` copies the skill baseline and adds the current combat-effect
   contribution. Action-resolved formula effects read these ordinary combat
   fields; `formula.step` divides and floors the input before multiplication.
   It recalculates effective fields and final rates, then damage and healing
   consume this snapshot through a shared resolution boundary.

The `derivedStats` property retained by compatibility callers aliases the same
complete object as `stats`. It must not become a separately maintained map.
The complete snapshot retains additive `effectiveStatBonuses` alongside ordinary
and derived fields. Later stages carry those inputs forward, collect their own
effective bonuses, then derive ranges/rates from ordinary values plus the combined
bonuses. They never add bonuses to an already-normalized attack range. Food
therefore survives skill and temporary-buff passes without changing ordinary stats.
For example, ordinary physical attack of `2000 / 1900` with food's `120 / 240`
stays `2000 / 1900`, while effective attack becomes `2120 / 2140` before the
minimum/maximum check. All effective entries in a stage resolve against the same
ordinary snapshot before any are applied.

`rawStat` is an unconditional character contribution, not a temporary combat
effect. Inner Way T2/T5 bonuses, arsenal, two-piece weapon/armor sets, bow/ring
sets, progression, gear inputs, and attribute conversions use it. Inner Way
modifiers of temporary buffs (for example Concentration's Direct Affinity)
remain ordinary `stat` effects on those buffs, not permanent raw contributions.
Each effect may contain both `rawStat` and `stat`; each field is applied only in
its own stage. Source selection is explicit: `minBamboocut` includes all raw
bonuses but not Formless Attack, which is folded into effective attack later.

## Combat contributions and expiration

The existing tracked-effect aggregate also carries finite numeric `stat` and
`effectiveStat` contributions, flattened separately as `stat.<field>` and
`effectiveStat.<field>`. Update these amounts
when effects are applied, change stacks, are consumed, or expire. Damage and
healing do not re-evaluate each unconditional rule on every action. Conditional,
formula-valued, or content-modified rules retain contextual evaluation.

Global stat contributions already in `buffedStats` are subtracted from the
action aggregate before applying the remainder, preventing double application.
Global damage multipliers retain their normal damage-effect handling.

When a buff expires, its contribution is absent from the next aggregate. Never
subtract a buff from the previous action's capped result: copy `skillStats`, add
the currently active contributions, and derive the result. Equal consecutive
contribution signatures reuse the resolved snapshot for that baseline, including
when an attribution calculation temporarily excludes a buff. Immutable effect
lists and aggregates prepare their stat contributions once. Resolved numerical
signatures are stored under weak baseline keys, so releasing a calculation also
allows its prepared stat snapshots to be released.

## Sequential prepared combat state

Build the timeline once per calculation run. Its chronological event loop owns
the evolving buffs, debuffs, resources, HP, and effect aggregate. There is no
second buff or stat reconstruction pass over the completed timeline.

Prepare unmodified effect definitions once per name and stack count. Applying,
refreshing, consuming, or expiring an effect publishes a new immutable snapshot;
unchanged effects and snapshots are shared with later actions. Historical rows
retain their original state, including source ownership and expiration times.

The action resolver prepares contextual effect lists once per distinct semantic
state: skill tag signature, effect identities/stacks/maxima/recipients,
action modifiers, and numeric requirement outcomes. Numeric predicates include
resource, distance, HP, and Qi comparisons, including predicates nested inside
modified definitions. Numeric predicates in action and component modifiers are
indexed with those modifiers too, so a resource-dependent guaranteed outcome
cannot leak across its threshold through the cache. Remaining within a threshold
region reuses the prepared list; crossing a threshold or changing effect
membership selects another state.
The preparation cache belongs to one resolver/run. Attribution excludes its buff
before resolving requirements, so dependent buffs are handled correctly.

Formula-valued contributions remain formula inputs; each damage/healing action
still evaluates its own formula and outcomes. Reusing prepared contributions
does not reuse damage results or skip combat events. Event-changing variants and
Monte Carlo samples own separate live traversals and preparation caches.

Active buffs/debuffs and historical snapshots are authoritative read-only maps.
The self/target key is the effect ID; a teammate key encodes effect ID and recipient
index. An omitted player recipient and recipient zero both identify self. There
is one entry per identity, with no parallel ordered array or lookup index.
Presence and stack queries use direct map lookup in amortized O(1) time.
Lifecycle changes publish new maps while prior snapshots stay unchanged. Map
copying and enumerating active effects remain O(n).

Map insertion order has no selection meaning. The `first` resolver traverses
the candidate IDs declared by the skill and queries map membership. Prepared
state identities are canonicalized independently of map insertion order.
Workers use structured cloning, which preserves native maps. Display code can
enumerate values at its boundary; history does not require array serialization.
Authored initial-effect lists are converted once on entry to the live loop.

Direct Critical Rate shares an ordinary and final field name. Complete snapshots
therefore retain `uncappedDirectCrit` for subsequent contribution changes, while
the visible/calculated `directCrit` remains capped at 20%. Other effective rates
have separate field names and retain their ordinary inputs naturally.

## Comparison variants and overrides

Comparison variants copy the resolved `stats`, apply the changed contribution
delta separately for ordinary stats and effective bonuses, and recompute effective
fields and final rates. They do not rerun the
baseline unconditional stat pass. For changes to source attributes or setup
effects, compute old/new raw and talent contribution differences before applying
the delta. Each variant then gets its own global and skill baselines.

Timeline reuse is independent of stat copying: reuse only when timing, triggers,
effects, stacks, cooldowns, and DOTs cannot change. Otherwise rebuild events.

Persisted Main-tab overrides remain final-value overrides of the editable ordinary
fields; food increases their effective counterparts without changing those overrides.
The shared override
solver determines input offsets before producing the sheet. Worker inputs carry
the complete sheet plus raw stats and these base offsets for variant deltas.
Legacy raw-input diagnostic bundles are normalized once at the worker boundary.

## Implementation and verification

- `statEffects.ts`: raw/sheet stages, talent formula binding, derived fields,
  contribution application, and override solving.
- `rotationCalculator.ts`: variant deltas, global baseline, and skill cache.
- `unconditionalDamageEffects.ts`: shared lifecycle contribution aggregate.
- `actionStats.ts`: shared damage/healing action snapshot and cache.
- `tests/stat-stages.test.ts`: observable stage boundaries, food
  retention, raw talent sources, global application, buff expiration, comparisons,
  healing, and uncapped-input preservation.

### Draught dynamic passive inputs

Skystrike's enhanced critical damage and Riven's Inebriate channel bonuses
are dynamic combat passives, not STEADY rank conversions. They evaluate
`minPhys` on the action snapshot with `resolveAt: "action"`: complete 50-point
pieces grant 2% critical damage, capped at 30%; complete 83.33-point pieces
grant 1% to each specified channel, capped at 9%. The current native consumer
uses `get_combat_attr(MIN_W_ATK)` and integer division. This corrects raw-stage
freezing and continuous interpolation. Exact native assembly of food/effective
bonuses and percentage attack into that combat attribute remains unaudited;
ordinary action `minPhys` is the current explicit simulator mapping.

## Wielded-art effect conditions

Damage effect requirements receive the action snapshot's `currentMartialArt`
and `currentWeapon`, matching timeline requirements. The fallback row snapshot
provides the same fields. Prepared effect-state cache keys include both values,
so a switch cannot reuse another art/family's conditional bonuses when tags and
buffs otherwise match. This covers shared Bolt VCs as well as other art-gated
flat-attack and damage bonuses.
