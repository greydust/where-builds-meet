# Documentation index

This index is the entry point for project documentation. The JSON under `data/` is authoritative for implemented game values; these documents explain semantics, formulas, workflows, and implementation status.

Start with [System architecture](system-architecture.md) and the documents for the area you are changing. [AGENTS.md](../AGENTS.md) contains the repository rules.

## Core references

| Document                                            | Use                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [System architecture](system-architecture.md)       | Runtime structure, source layout, state and persistence, calculation pipeline, and deployment. |
| [Damage formula](damage-formula.md)                 | Implemented damage formulas, calculation order, and category semantics.                        |
| [Skill and combat-effect data](skill-data.md)       | Skill and effect authoring constraints, source exceptions, and unresolved mechanics.           |
| [Gear data and inventory](gear-data.md)             | Gear slots, affixes, attunements, and inventory behavior.                                      |
| [Localization](localization.md)                     | Translation catalog ownership, generated locales, and fallback rules.                          |
| [Rotation event loop](rotation-event-loop.md)       | Authored rotation input and the incremental event loop.                                        |
| [Stat pipeline](stat-pipeline.md)                   | Authoritative stat-stage resolution specification.                                             |
| [DPS regression snapshots](dps-snapshots.md)        | Accepted DPS baselines, release guard, and review workflow.                                    |
| [Dodge and deflect timing](dodge-deflect-timing.md) | Cast-time recovery values used for dodge and missed-deflect actions.                           |

## Implementation and data audits

These documents describe current implementation status or deferred work. They are supporting evidence, not replacements for the core references.

| Document                                                    | Use                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| [Attunement audit](attunement-audit.md)                     | Deferred PvE attunement catalog work and identifier mappings.   |
| [Martial-art talent audit](martial-art-talent-audit.md)     | Rank-13 and rank-14 talent implementation status.               |
| [Weapon-set four-piece audit](weapon-set-four-piece.md)     | Four-piece set bonuses implemented through existing mechanisms. |
| [Wings implementation audit](wings-implementation-audit.md) | Wings Inner Way and martial-art status and limitations.         |

## Historical records

These are dated snapshots. They preserve investigation evidence and may describe data or code that has since changed; use the core references and the current source for behavior.

| Document                                                              | Record                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Datamine balance audit](datamine-balance-audit.md)                   | 2026-10-15 comparison against refreshed datamine exports.        |
| [Damage-boost category inventory](damage-boost-category-inventory.md) | 2026-10-21 inventory of path and skill damage-boost assignments. |
| [Export audit, 2026-10-23](export-audit-2026-10-23.md)                | 2026-10-23 structural comparison of sixteen export files.        |
| [Wind Inner Way performance audit](wind-innerway-performance.md)      | 2026-09-27 measurement of Wind Inner Way swap performance.       |
