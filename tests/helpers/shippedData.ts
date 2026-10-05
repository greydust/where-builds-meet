import type { EditableObject, EffectDefinition, SkillRecord } from "@/calculations/rotationTimeline"
import type { EffectiveStatEffectContainer, StatEffectContainer } from "@/calculations/statEffects"

/**
 * Narrow a shipped data file to the type the calculation takes.
 *
 * TypeScript infers a JSON module's shape literally, so a string the data means
 * as a member of a union widens to `string` and an object the data means as one
 * alternative widens to their common shape. The shipped content is right; only
 * the inferred type drifts from what the calculation declares. Specs that feed a
 * data file straight into a fixture pass it through here, so the one cast this
 * needs is stated once with its reason rather than repeated at every import.
 */
export function asSkillRecords(file: unknown): Record<string, SkillRecord> {
  return file as Record<string, SkillRecord>
}

export function asEffectDefinitions(file: unknown): Record<string, EffectDefinition> {
  return file as Record<string, EffectDefinition>
}

/**
 * A skill record's action list, which the record carries untyped.
 *
 * `SkillRecord.action` is `unknown[]`, because a skill's actions are read by
 * several different consumers that each want their own shape. Specs that index
 * an action's fields read them through this instead.
 */
export function skillActions(record: SkillRecord): EditableObject[] {
  return (record.action ?? []) as EditableObject[]
}

/**
 * One talent effect, which is a stat sheet, a damage-bonus sheet, or both.
 *
 * `MartialArtDefinition.talent` declares a talent effect as a stat sheet only,
 * so a damage-bonus sheet — the `hpDMGBonus` and `affinityDmgBonus` shape the
 * damage pipeline reads — has no declared type and neither pipeline can be handed
 * the declared table. Both halves are named here because the rank's effects go to
 * one pipeline or the other depending on which one the entry carries.
 */
export type TalentEffect = EditableObject &
  StatEffectContainer &
  EffectiveStatEffectContainer & { effect?: EditableObject; requirement?: unknown }

export function asTalentEffects(effects: unknown): TalentEffect[] {
  return effects as TalentEffect[]
}

/**
 * One rank of a martial art's talent effects, as a single list.
 *
 * A rank is a list of talents whose effect lists each carry a different shape, so
 * TypeScript infers the rank as a union of array types and no `flatMap` overload
 * reconciles them. Specs that read a whole rank use this to get one list first.
 */
export function rankTalentEffects(rank: unknown): TalentEffect[] {
  const talents = rank as Array<{ effect?: unknown[] }>
  return asTalentEffects(talents.flatMap(talent => talent.effect ?? []))
}
