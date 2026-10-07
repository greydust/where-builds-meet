# Martial-art talent rank-13 audit

Source: `local/datamine/wwm-martial-arts-normal.json`, interpreted fields only.
Selection uses each art's `unlockLevel: 13` and its ordered `talentIds` resolved
against `definitions`. All 20 arts now contain their five selected talents at
`talent[13]`; ranks 0–12 remain empty. Runtime talents contain names and effects,
with no source IDs. Rank 14 is also implemented as a complete independent selection. It retains
the supported non-stat mechanics and deliberate source exceptions described
here, with upgraded stat caps and raw attribute attack. Additional Attack and
its coefficient exceptions are documented in `damage-formula.md`.

Panacea Fan has one additional rank-13 entry: **Mystic Precision Enhancement**.
The user confirmed that this behavior exists in the game even though it is
absent from the datamined talent list. Keep it represented as a talent: with
Soulshade Umbrella equipped, Mystic actions convert all Abrasion probability to
Normal probability. This is an intentional source-list exception, not deferred
work; future audits must preserve it.

## Numerical corrections

| Conversion                                                 | Exact rate | Rank-13 cap   |
| ---------------------------------------------------------- | ---------- | ------------- |
| Agility/Power/Momentum to Physical Attack, where specified | 0.264      | 73.92 at 280  |
| Agility to Critical Rate                                   | 0.000304   | 8.512% at 280 |
| Power/Momentum to Affinity Rate                            | 0.000152   | 4.256% at 280 |
| Minimum attribute attack to penetration                    | 0.0672     | 22            |
| Maximum attribute attack to penetration                    | 0.0336     | 22            |
| Minimum attribute attack to damage/healing bonus           | 0.000336   | 11%           |
| Maximum attribute attack to damage bonus                   | 0.000168   | 11%           |

Every attribute talent adds 98 minimum and 196 maximum raw attack before
conversions. Formula inputs use the existing immutable raw-stat stage. Food and
other talent conversion results do not feed another talent's formula. Source
thresholds such as 328 and 655 are rounded; rates and caps govern actual results.
Fixed bonuses and scaling bonuses are separate effects, without formula offsets
or lower bounds. Descriptions explicitly saying “for every” a fixed quantity use
the existing segment mechanism, including Nameless Sword's 100-attack steps and
Vernal/Inkwell's 50-attack steps.

## Deferred or unclear portions

The shared four attribute damage channels and primary-path 1.5 multiplier cover
every Attr. Attack DMG UP talent. Panacea/Soulshade's Attribute Attack Enhancement
also uses the existing Silkbind healing coefficient. Those entries intentionally
have empty effect arrays and do not apply a second multiplier.

| Martial art          | Deferred or unclear                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategic Sword      | Five-stack Bleed consumption and High Bleed burst need the actual Bleed and burst skill definitions. Endurance restoration requires tracked Endurance and a per-target/per-cast limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Nameless Sword       | Qi calculation and player/non-player target distinction are absent. HP bonus uses the current PvE calculation; the PvP Qi branch is not implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Heavenquaker Spear   | Actual Heavenquaker skills, Bleed/High Bleed payloads, and classification of any other empowered DoT effects remain pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Nameless Spear       | The below-60% Affinity damage condition and below-30% natural Endurance recovery bonus are implemented. The latter boosts only natural regeneration by 20%, not direct skill or Inner Way restores.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Panacea Fan          | Water Clone's +2 Dew/second needs clone proximity/ownership and Dew resource data; +50% healing below 30% ally HP needs recipient HP and clone identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Inkwell Fan          | Moon Shatter Spring skill/tag wiring is pending. Additional flat 5 Qi damage per critical hit lacks a calculated Qi-damage action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Stormbreaker Spear   | Higher of Body/Power to Max HP needs a max-of-two-stat expression (10 HP per point, cap 2800). Battle Will cap increases need base cap data and talent-dependent maximums. Three-second incoming Physical damage reduction needs typed incoming damage and reduction scaling.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Phalanxbane Blade    | Blade Momentum maximum and Anxi Soldier refunds need cap and gain/spending data; “four times per second” is not assumed equivalent to a 0.25-second cooldown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Infernal Twinblades  | Dodge success window and breath-hold are unmodeled. Automatic Flamelash entry/exit needs skill data. Earlier user-confirmed charge/reset semantics are retained.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Riven Twinblades     | Actual skill/tag wiring and Inebriate/Deepdaze entry/exit are pending. Whaledraft's increased Binge amount is unspecified, so no increase is guessed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Vernal Umbrella      | Ballistic skill classification and automatic control-state timing await skill data. Unfading Flower's three-Blossom refund needs resource data and boss/non-boss distinctions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Soulshade Umbrella   | Party-wide copies and Tenacity behavior/per-recipient 60-second lockout are not modeled. The supported 5% Exhausted-target damage bonus is an effect of Floating Grace and follows the parent buff's lifetime, including consumption.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Everspring Umbrella  | Implemented. Each Scarlet Spin stage consumes Fragrant Song for a 0.769x cast-time multiplier, an unconditional guaranteed critical, and 20% HP damage, so the accelerated flight is modelled; the Perfect Catch is queued with the throw it seeds, so that flight also carries its guaranteed catch and a cast cannot resolve a throw without its catch. Falling Blossoms transitions into one-use Fragrant Song after three catches, with Delicate from Phantom Rally T1 gating the Dreamwrought Bubbles charge. Tenacity damage is intentionally ignored by user instruction.                                                                                                |
| Mortal Rope Dart     | Rodent and Bone Corrosion application need actual skills; Qi bonuses remain inactive until Qi calculation exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Unfettered Rope Dart | Piercing Dart hit timing is measured: a seven-hit marker series from the side-button press, with the four-hit release truncating it (1.841 s full, 0.796 s interrupted). Soul Sweep's three hit timestamps are still unmeasured placeholders at 0 s. Token resource units are intentionally ignored by user instruction, so the text's mixed two-Token and ten-Token refund wording is not modelled. Charged Combo uses `clearCD.seconds` for 0.5 seconds per Piercing Dart damage hit with a 0.5-second trigger cooldown; activation awaits the damage events. Its seven sweep coefficients are read per ordinal from `20702104` `timings.hitCoefficients` rather than shared. |
| Skygrasp Rope Dart   | Initial resource/cap and Unity behavior remain in existing system/skill data rather than rank-dependent effects. The exact-one-bar comparison changed from `>= 1` to `> 1` to match the source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Snowparting Blade    | Tenacity interrupt, stagger, boss/mode distinctions, and General's Bane: Stab's 2/6-second Dread extension lack sufficient classification/state data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Heavenwill Gauntlets | Wider dodge window, Arena Tenacity, other-mode invincibility and dodge-gated combo availability are not modeled. “Small amount” of Endurance recovery has no numeric value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Skystrike Gauntlets  | Inebriate dodge/Bloombreak replacements and actual skill wiring are pending. Binge base/cap/spending data are missing; only the stated additive gain is authored. Deflect gain is non-Arena-specific and remains deferred because combat mode is unmodeled.                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Data wiring for pending skills

New tags use the existing skill-tag requirement mechanism; they do not create
castable skills or invent damage coefficients/timing:

- Strategic Bleed actions: `Bleed`; amplified burst: `HighBleed` and `DOT`.
- Heavenquaker charged hits: `HeavenQuakerSpear` and `Charged`. The existing
  martial-art tag's capital Q is retained and Soul-Shaken's old spelling fixed.
- Inkwell pursuit: `MoonShatterSpring`.
- Vernal projectiles: `VernalUmbrella` and `Ballistic`.
- Everspring return hits: `EverspringUmbrella` and `ReturningUmbrella`.
- Mortal rodent hits: `Rodent`.
- Riven Hero's Blood: `HeroesBlood`; its Inebriate version:
  `HeroesBloodInebriate`; Dragonquench's Inebriate version: `DragonquenchInebriate`.
- Skystrike's enhanced attacks: `InebriateEnhanced`.

Manual statuses `Inebriate`, `InebriateDeepdaze`, `Soulbreak`, `Immobilized`, and
`Airborne` have no guessed default duration. Apply with explicit duration or
remove through existing consume actions. Deepdaze does not automatically apply
Inebriate; both statuses must be represented when both conditions hold. Carouse
has its stated 20-second refreshable lifetime. `Binge` reuses numeric resources
without an invented starting value or cap. The user confirmed that Blade Momentum
and Battle Will start at `4`; `system.json.initialResources` supplies both values.
They remain fixed and hidden while generation, spending, and caps are unimplemented.
Snowparting's Critical DMG Up condition therefore activates in normal rotations.

## Verification

Focused probes cover stat conversions at intermediate values/caps, raw-stat
isolation, conditional damage and healing, resource thresholds, tag isolation,
debuff stacking/refresh, and new buff/trigger behavior. Existing affected probes
are revised for the datamined numbers and the confirmed Mystic Precision exception.
Formatting, localization extraction, and the production build remain the gates.

## Dust modelling notes

Dust's rotation uses explicitly successful catch variants. The
rank-13 Perfect Catch Enhancement accumulates five-second Falling Blossoms;
three stacks grant one-use Fragrant Song, with Delicate from Phantom Rally T1.
The next throw snapshots Fragrant Song damage and an unconditional guaranteed crit,
then consumes it. Charged umbrella consumes Delicate. Input-window detection
remains deferred. Tenacity damage is intentionally ignored by user instruction. Charged Combo partial cooldown reduction is
implemented but awaits Piercing Dart damage events. Fragrant Song's 30% faster
flight and accelerated-flight guaranteed catch are represented in the
source-faithful Scarlet Spin chain; the acceleration is applied to the next
throw's Stage 4 cadence. Each queued throw pays its own ping, and both the
outgoing and returning hit remain in the timeline.
The rotation only casts the four-hit opener, so sweeps five through seven are
modelled but unused; Tokens of Gratitude and Fading Crimson are intentionally
ignored by user instruction. Per-skill timing fallbacks are listed in
[skill-data](skill-data.md#bamboocut-dust-definitions).
