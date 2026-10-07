import { emptyStats } from "@/data/statDefinitions"
import type { CharacterStats } from "@/types"

export const unconditionalDamageEffectFields = [
  "physicalAttackBonus",
  "flatAttackBonus",
  "coefficientBonusWithoutFlatAttack",
  "bellstrikeAttackBonus",
  "stonesplitAttackBonus",
  "silkbindAttackBonus",
  "bamboocutAttackBonus",
  "bellstrikePenetration",
  "stonesplitPenetration",
  "silkbindPenetration",
  "bamboocutPenetration",
  "bellstrikeResistance",
  "stonesplitResistance",
  "silkbindResistance",
  "bamboocutResistance",
  "dmgBonus",
  "hpDMGBonus",
  "baseDMGBonus",
  "globalDmgBonus",
  "globalHPDMGBonus",
  "globalBellstrikeDMGBonus",
  "dotDamage",
  "physicalPenetration",
  "defenseBonus",
  "physicalResistance",
  "critDmgBonus",
  "affinityDmgBonus",
  "attributeDMGBonus",
] as const

export type UnconditionalDamageEffectField =
  | (typeof unconditionalDamageEffectFields)[number]
  | `stat.${keyof CharacterStats}`
  | `effectiveStat.${keyof CharacterStats}`
export type UnconditionalDamageEffects = Partial<Record<UnconditionalDamageEffectField, number>>

export type StaticDamageEffectSplit = { aggregated: UnconditionalDamageEffects; remaining?: Record<string, unknown> }

const unconditionalDamageEffectFieldSet = new Set<string>([
  ...unconditionalDamageEffectFields,
  ...Object.keys(emptyStats).map(key => `stat.${key}`),
  ...Object.keys(emptyStats).map(key => `effectiveStat.${key}`),
])

/** Preserve ordinary and effective contribution ownership through the lifecycle aggregate. */
export function collectUnconditionalStatEffects(effects: UnconditionalDamageEffects = {}) {
  const stat: Partial<CharacterStats> = {}
  const effectiveStat: Partial<CharacterStats> = {}
  for (const [key, value] of Object.entries(effects)) {
    const [stage, field] = key.split(".")
    switch (stage) {
      case "stat":
        stat[field as keyof CharacterStats] = value
        break
      case "effectiveStat":
        effectiveStat[field as keyof CharacterStats] = value
        break
    }
  }
  return { stat, effectiveStat }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function splitStaticDamageEffect(
  effect: Record<string, unknown>,
  weapons: readonly string[],
): StaticDamageEffectSplit {
  const aggregated: UnconditionalDamageEffects = {}
  const remaining = { ...effect }
  for (const field of unconditionalDamageEffectFields) {
    const value = effect[field]
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    if (
      field !== "hpDMGBonus" ||
      !Array.isArray(effect.hpDMGBonusWeapons) ||
      effect.hpDMGBonusWeapons.some(weapon => typeof weapon === "string" && weapons.includes(weapon))
    )
      aggregated[field] = value
    delete remaining[field]
  }
  if (!Object.hasOwn(remaining, "hpDMGBonus")) delete remaining.hpDMGBonusWeapons
  return { aggregated, ...(Object.keys(remaining).length ? { remaining } : {}) }
}

export function addUnconditionalDamageEffects(
  ...effects: Array<UnconditionalDamageEffects | undefined>
): UnconditionalDamageEffects {
  const result: UnconditionalDamageEffects = {}
  for (const effect of effects) {
    if (!effect) continue
    for (const [field, value] of Object.entries(effect)) {
      if (!unconditionalDamageEffectFieldSet.has(field)) continue
      if (typeof value !== "number" || !Number.isFinite(value) || value === 0) continue
      const typedField = field as UnconditionalDamageEffectField
      const total = (result[typedField] ?? 0) + value
      if (Math.abs(total) < 1e-12) delete result[typedField]
      else result[typedField] = total
    }
  }
  return result
}

export function subtractUnconditionalDamageEffects(
  total: UnconditionalDamageEffects | undefined,
  removed: UnconditionalDamageEffects | undefined,
): UnconditionalDamageEffects {
  if (!removed) return { ...total }
  const negative = Object.fromEntries(
    Object.entries(removed).map(([field, value]) => [field, -value]),
  ) as UnconditionalDamageEffects
  return addUnconditionalDamageEffects(total, negative)
}

export function splitUnconditionalDamageEffectRules(rules: unknown[] | undefined): {
  unconditional: UnconditionalDamageEffects
  remaining: unknown[]
} {
  const unconditional: UnconditionalDamageEffects = {}
  const remaining: unknown[] = []

  for (const rule of rules ?? []) {
    if (!isObject(rule) || Object.keys(rule).length !== 1 || !isObject(rule.effect)) {
      remaining.push(rule)
      continue
    }
    const fields = Object.entries(rule.effect).flatMap(([field, value]) =>
      (field === "stat" || field === "effectiveStat") && isObject(value)
        ? Object.entries(value).map(([key, amount]) => [`${field}.${key}`, amount] as const)
        : [[field, value] as const],
    )
    if (
      fields.length === 0 ||
      fields.some(
        ([field, value]) =>
          !unconditionalDamageEffectFieldSet.has(field) || typeof value !== "number" || !Number.isFinite(value),
      )
    ) {
      remaining.push(rule)
      continue
    }
    for (const [field, value] of fields) {
      const typedField = field as UnconditionalDamageEffectField
      unconditional[typedField] = (unconditional[typedField] ?? 0) + (value as number)
    }
  }

  return { unconditional, remaining }
}
