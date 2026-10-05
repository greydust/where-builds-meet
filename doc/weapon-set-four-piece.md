# Weapon-set four-piece audit

Source: `local/datamine/wwm-item-sets-weapon.json`. Two-piece bonuses remain
at the exact level-96 values. This pass adds only effects expressible through
existing setup rules, tracked buffs, skill actions, and damage/healing calculations.
It does not assign additional path eligibility or introduce runtime mechanisms.

## Implemented and retained

| Set             | Four-piece coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cleftpeak       | Retains one five-second stack per damage event, 1% HP damage per stack, up to five. Successful Deflect now applies five stacks immediately when four pieces are selected. At five stacks, the extra 8% applies to Light/Heavy Varied Combos of Snowparting Blade, Thundercry Blade, and Vernal Umbrella, plus existing Anxi Soldier and assist-trigger tags. Unlisted martial arts no longer receive the varied-combo bonus. Inkwell Fan's Moon Shatter Spring has no skill definition to attach its exception to and remains deferred. |
| Hawkwing        | Retains the existing Affinity-outcome trigger: 2% Physical Attack per stack, five stacks, five-second refreshing duration. Expected calculations use the existing probability tracker; simulations use sampled Affinity outcomes.                                                                                                                                                                                                                                                                                                       |
| Rain Whisper    | Retains 10% Critical DMG plus 15% while Shield is active. Adds the matching 10%/15% Critical Healing bonuses. These add to critical multipliers, not normal healing. Comparisons now rebuild timelines because healing can change overhealing and triggered events. Shield uses the existing player-shield state.                                                                                                                                                                                                                       |
| Ivorybloom      | Retains 5% Critical Rate and 15% Critical DMG/Critical Healing while at full HP.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Etherwrath      | Retains the previously confirmed Direct Damage stack generation: 1.2% to all five attack channels per stack, five stacks, eight-second refresh. At five stacks, Martial Art Effects gain six penetration in each channel. Both Perfect Dodge variants and the attack-gated Dodge grant five stacks. Existing target and direct-hit assumptions are preserved.                                                                                                                                                                           |
| Swaying Heights | Adds 5% HP damage strictly above 50% target HP, then another 1% at 55%, 60%, 65%, 70%, and 75%, capped at 10% total. Conditions resolve at each damage action.                                                                                                                                                                                                                                                                                                                                                                          |
| Swallowcall     | Light-tagged attacks and Rodent deal 12% more HP damage. Those actions also gain 6% Physical and Bamboocut damage below 40% target Qi, or while Bone Corrosion or Qi Imbalance is present. Matching multiple tags/statuses applies each bonus only once. Exact 40% Qi does not satisfy the low-Qi condition. The supported Wind light-attack effect is Rodent; unspecified future proc categories are not inferred.                                                                                                                     |

The simulator currently treats its encounter as a boss. This pass does not add
PvP or multiple-target hit tracking. Four-piece selections still include their
two-piece stats once; zero- and two-piece selections do not activate these rules.

## Jadeware and player Qi

Jadeware activates on Martial Art Skill casts, including canceled casts without a hit, for ten seconds with a twelve-second cooldown. While active, it always grants 10% Affinity DMG. Only its additional 7.5% Direct Affinity Rate requires Qi Imbalance, target Qi below player Qi, or target Qi below 40%. Conditions are evaluated at each hit.

For the Fully Relayed dummy encounter, player Qi is fixed at the user-confirmed 100%. The target-Qi comparison is therefore below 100%, which also covers the below-40% alternative. This is an explicit encounter assumption; player Qi is not tracked as a resource. The four-piece selection retains the two-piece Physical Attack bonus once.

`tests/jadeware.test.ts` verifies cast activation, selection gating, conditional rate boundaries, mid-cast Qi changes, damage, duration, and cooldown through the calculation pipeline.

## Target role and the Starweave gain condition

Starweave's source gain condition is a disjunction: hit at least two enemies
simultaneously, **or** hit a boss or a player. Both halves are expressible, and
both resolve to "always" for a different reason than a missing capability.

The `enemyCount` half is an existing requirement target. The boss half is
implicit rather than tested: both `Dummy` and `DummyAttack` count as a boss, so a
mechanic whose source says it works against a boss must not gate on
`targetType`, and matching `Boss` would exclude both dummies. `vsBossDmg` sets
the precedent by being added to the damage multiplier with no target check.

The trigger is therefore written unconditionally, which is the same expression
the boss half alone would produce. The `or` collapses, so the `enemyCount` branch
is redundant under this model. It is recorded here because the collapse is a
consequence of the target-role policy rather than of the source text: if the
implicit boss role ever stops holding, Starweave would need its `enemyCount`
branch restored to stay correct on single-target dummies, and the Dust
weapon-set choice would need revisiting, since Etherwrath's four-piece would
then be the stronger set.

## Deferred

| Set        | Why its four-piece effect remains unimplemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swift Gale | There is no implemented Airborne Heavy Attack classification or knockdown lifecycle with a confirmed duration. Existing target Airborne/Controlled markers do not establish the attack category or the knockdown's behavior. The ten-second trigger cooldown alone is supported.                                                                                                                                                                                                                                                                                                                                                  |
| Mistwillow | The upgraded Mistwillow description omits its damage percentage and does not settle whether the two-second refresh restriction is shared or per effect. Reciprocal buff merging and subsequent refresh ownership are also unclear. No replacement values or timer behavior are guessed.                                                                                                                                                                                                                                                                                                                                           |
| Starweave  | Implemented for the Dust path. Adds one five-second stack per damage event, up to five, granting Martial Art Skills 3% increased damage per stack plus a distance-scaled bonus beyond 4 meters reaching 1% per stack at 8 meters. Gains are limited to two per second via the setup-trigger cooldown, and taking damage consumes one stack. The distance ramp uses a `segment` on `distance` at one-meter granularity, because the source states a linear ramp without specifying interpolation. The gain condition is an `or` of two branches, and the boss half is treated as always satisfied; see the target-role note below. |
| Tiltrim    | The source mentions a bonus at five stacks but does not specify a maximum stack count. Flower Burial and its applicable skill mapping are absent, and the Inebriate-enhanced attack scope is not complete. The cap and missing enhancement semantics are not inferred.                                                                                                                                                                                                                                                                                                                                                            |

## Verification

`npm run test:sets` is available as a focused local check and is also included
in the ordinary Vitest suite run by `npm run build`. The probe exercises the real
calculation pipeline: Swaying Heights HP boundaries and cap, Swallowcall damage
channels/Qi boundaries/status alternatives and mid-cast state changes, Rain
Whisper critical versus normal healing, Cleftpeak Deflect selection and expiry,
its martial-art scope, and expected/sampled behavior.
