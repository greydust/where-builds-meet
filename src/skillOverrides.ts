import umbrellaSkills from "@gamedata/skill/everspring-umbrella.json"

import type { EditableObject, EffectDefinition, SkillRecord } from "./calculations/rotationTimeline"
import { validateUnknown } from "./schemas/json"
import { skillOverridesInputSchema } from "./schemas/skillOverrides"
import { migrateSkillId } from "./skillIdMigrations"

export type SkillMap = Record<string, SkillRecord>
export type SkillCategory =
  | "Snowparting"
  | "Phalanxbane"
  | "Thundercry"
  | "Stormbreaker"
  | "Heavenwill"
  | "Skygrasp"
  | "Panacea"
  | "Soulshade"
  | "Infernal"
  | "Mortal"
  | "Everspring"
  | "Unfettered"
  | "NamelessSword"
  | "NamelessSpear"
  | "StrategicSword"
  | "HeavenQuakerSpear"
  | "Mystic"
  | "General"
  | "Mechanism"
export type EditorCategory = SkillCategory | "Buff" | "Debuff" | "DOT"
export type SkillOverrides = Partial<Record<EditorCategory, SkillMap>>

export function deserializeSkillOverrides(value: unknown): SkillOverrides {
  const validated = validateUnknown(skillOverridesInputSchema, value)
  if (!validated.success) return {}
  const stored = value as Record<string, unknown>
  const currentCoefficients = stored.version === 2 || stored.version === 3 || stored.version === 4
  const exclusiveSegments = stored.version === 3 || stored.version === 4
  const migrate = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(migrate)
    if (!entry || typeof entry !== "object") return entry
    const record = Object.fromEntries(
      Object.entries(entry).map(([key, child]) => [migrateSkillId(key), migrate(child)]),
    )
    if (typeof record.value === "string") record.value = migrateSkillId(record.value)
    if (typeof record.fallback === "string") record.fallback = migrateSkillId(record.fallback)
    if (Array.isArray(record.tags))
      record.tags = record.tags.map(tag => (typeof tag === "string" ? migrateSkillId(tag) : tag))
    if (Array.isArray(record.subAction))
      record.subAction = record.subAction.map(child => (typeof child === "string" ? migrateSkillId(child) : child))
    if (record.durationInput !== undefined) {
      record.editableCastTime =
        record.durationInput && typeof record.durationInput === "object" ? record.durationInput : true
      delete record.durationInput
    }
    if (record.value === "VendettaToken" && record.target === "self") record.target = "target"
    if (record.stackDamage !== undefined) {
      if (record.stackDamage === true && record.tickOnExpire === undefined) record.tickOnExpire = false
      delete record.stackDamage
    }
    if (
      !exclusiveSegments &&
      record.function === "segment" &&
      Array.isArray(record.param2) &&
      Array.isArray(record.param3)
    ) {
      // The next representable number preserves every finite input of the old <= comparison.
      const bytes = new DataView(new ArrayBuffer(8))
      const maxIndex = record.param2.indexOf(Number.MAX_VALUE)
      if (maxIndex >= 0) {
        record.param2 = record.param2.slice(0, maxIndex)
        record.param3 = record.param3.slice(0, maxIndex + 1)
      }
      record.param2 = (record.param2 as unknown[]).map(threshold => {
        if (typeof threshold !== "number" || !Number.isFinite(threshold)) return threshold
        if (threshold === 0) return Number.MIN_VALUE
        bytes.setFloat64(0, threshold)
        bytes.setBigUint64(0, bytes.getBigUint64(0) + (threshold > 0 ? 1n : -1n))
        return bytes.getFloat64(0)
      })
    }
    switch (record.type) {
      case "trigger":
        delete record.inheritTags
        if (record.queueSourceEffect !== undefined) {
          record.sourceEffect = record.queueSourceEffect ?? record.sourceEffect
          delete record.queueSourceEffect
        }
        break
      case "damage":
        if (!currentCoefficients && record.attrCoef === undefined) record.attrCoef = record.phyCoef ?? 0
        break
      case "heal":
        // Healing has always resolved at the average of its attack range; stored
        // overrides written before the field existed inherit that contract.
        if (record.averageAttack === undefined) record.averageAttack = true
        if (!currentCoefficients && record.silkbindCoef === undefined) record.silkbindCoef = record.phyCoef ?? 0
        break
    }
    return record
  }
  const overrides = migrate(currentCoefficients ? (stored.overrides ?? {}) : value) as SkillOverrides
  if (stored.version !== 4 && overrides.Everspring) {
    const skills = overrides.Everspring
    if (skills.Resonance) {
      const original = skills.Resonance
      skills.Resonance = {
        ...original,
        tags: [...new Set([...(original.tags ?? []), ...umbrellaSkills.Resonance.tags])],
        skillBreakdownCategory: "Resonance",
      }
      skills.BubblesResonance ??= {
        ...original,
        name: umbrellaSkills.BubblesResonance.name,
        tags: [...new Set([...(original.tags ?? []), ...umbrellaSkills.BubblesResonance.tags])],
        skillBreakdownCategory: "Resonance",
      }
    }
    if (skills.PhantomUmbrellaSummon) {
      skills.BubblesPhantomUmbrellaSummon ??= {
        ...skills.PhantomUmbrellaSummon,
        name: umbrellaSkills.BubblesPhantomUmbrellaSummon.name,
        action: skills.PhantomUmbrellaSummon.action?.map(action =>
          (action as EditableObject)?.type === "trigger" && (action as EditableObject).value === "Resonance"
            ? Object.assign({}, action, { value: "BubblesResonance" })
            : action,
        ),
      }
    }
    if (skills.DreamwroughtBubblesRelease?.action) {
      skills.DreamwroughtBubblesRelease.action = skills.DreamwroughtBubblesRelease.action.map(action =>
        (action as EditableObject)?.type === "trigger" && (action as EditableObject).value === "PhantomUmbrellaSummon"
          ? Object.assign({}, action, { value: "BubblesPhantomUmbrellaSummon" })
          : action,
      )
    }
  }
  const legacyToken = overrides.Buff?.VendettaToken
  if (legacyToken) {
    overrides.Debuff = {
      ...overrides.Debuff,
      VendettaToken: overrides.Debuff?.VendettaToken ?? { ...legacyToken, shared: false },
    }
    delete overrides.Buff!.VendettaToken
  }
  return overrides
}

export function serializeSkillOverrides(overrides: SkillOverrides) {
  return JSON.stringify({ version: 4, overrides })
}

export function resolveSkillCalculationDefinitions(
  defaultSkillMaps: Record<SkillCategory, SkillMap>,
  defaultEffectDefinitions: Record<string, EffectDefinition>,
  defaultDotDefinitions: SkillMap,
  overrides: SkillOverrides,
) {
  const skills = Object.assign(
    {},
    ...(Object.entries(defaultSkillMaps) as Array<[SkillCategory, SkillMap]>).map(([category, definitions]) =>
      Object.assign({}, definitions, overrides[category]),
    ),
  ) as SkillMap
  const dots = { ...defaultDotDefinitions, ...overrides.DOT }
  const effectDefinitions = {
    ...defaultEffectDefinitions,
    ...overrides.Buff,
    ...overrides.Debuff,
    ...overrides.DOT,
  } as Record<string, EffectDefinition>
  return { skills, dots, effectDefinitions }
}
