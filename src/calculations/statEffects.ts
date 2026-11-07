import { emptyStats } from "@/data/statDefinitions"
import type { CharacterStats, WeaponId } from "@/types"

import { resolveSegmentValue, type SegmentMode } from "./dynamicValues"
import { calculateDerivedStats, type DerivedStats } from "./effectiveStats"
import { calculationStatMaximum } from "./statCaps"

export type StatFormula = {
  source: string | { max: string[] }
  multiplier?: number
  /** Divide the input into complete pieces before applying the multiplier. */
  step?: number
  /** Action formulas remain live instead of freezing against the raw talent snapshot. */
  resolveAt?: "action"
  offset?: number
  min?: number
  max?: number
  round?: number
}

export type FormulaStatValue = { formula: StatFormula }
export type SegmentStatValue = {
  function: "segment"
  mode?: SegmentMode
  param1: string | number
  param2: number[]
  param3: number[]
}
export type StatEffectValues = Partial<Record<keyof CharacterStats, number | FormulaStatValue | SegmentStatValue>>
export type StatEffectContainer = { rawStat?: StatEffectValues; stat?: StatEffectValues; statStage?: "talent" | "food" }
export type EffectiveStatEffectContainer = { effectiveStat?: StatEffectValues }
export type StatConversion = { from: string; to: string; ratio: number; max?: number }
export type StatConversionEffectContainer = { convert?: StatConversion | StatConversion[] }

const normalizeInternalValue = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000

export function applyStatConversions<T extends Record<string, number>>(
  currentStats: T,
  effects: StatConversionEffectContainer[],
) {
  const convertedStats: Record<string, number> = { ...currentStats }
  const conversions = effects.flatMap(effect => {
    if (Array.isArray(effect.convert)) return effect.convert
    return effect.convert ? [effect.convert] : []
  })

  for (const conversion of conversions) {
    const source = convertedStats[conversion.from]
    const target = convertedStats[conversion.to]
    if (
      typeof source !== "number" ||
      !Number.isFinite(source) ||
      typeof target !== "number" ||
      !Number.isFinite(target) ||
      typeof conversion.ratio !== "number" ||
      !Number.isFinite(conversion.ratio)
    )
      continue
    const maximum =
      typeof conversion.max === "number" && Number.isFinite(conversion.max)
        ? Math.max(0, conversion.max)
        : Number.POSITIVE_INFINITY
    const targetMaximum = calculationStatMaximum(conversion.to)
    const targetCapacity =
      targetMaximum !== undefined && conversion.ratio > 0
        ? Math.max(0, targetMaximum - target) / conversion.ratio
        : Number.POSITIVE_INFINITY
    const convertedAmount = Math.min(Math.max(0, source), maximum, targetCapacity)
    convertedStats[conversion.from] = normalizeInternalValue(source - convertedAmount)
    convertedStats[conversion.to] = normalizeInternalValue(
      Math.min(targetMaximum ?? Number.POSITIVE_INFINITY, target + convertedAmount * conversion.ratio),
    )
  }

  return convertedStats as T
}

export function resolveFormulaValue(formula: StatFormula, sources: Record<string, unknown>) {
  let source: unknown
  if (typeof formula.source === "string") {
    source = sources[formula.source]
  } else {
    const values = formula.source.max.map(key => sources[key])
    if (values.length === 0 || !values.every(value => typeof value === "number" && Number.isFinite(value)))
      return undefined
    source = Math.max(...(values as number[]))
  }
  if (typeof source !== "number" || !Number.isFinite(source)) return undefined
  let input = source
  if (formula.step !== undefined) {
    if (!Number.isFinite(formula.step) || formula.step <= 0) return undefined
    input = Math.floor(input / formula.step)
  }
  let value = input * (formula.multiplier ?? 1) + (formula.offset ?? 0)
  if (typeof formula.min === "number") value = Math.max(formula.min, value)
  if (typeof formula.max === "number") value = Math.min(formula.max, value)
  if (typeof formula.round === "number") {
    const precision = 10 ** formula.round
    value = Math.round(value * precision) / precision
  }
  return value
}

export function applyStatEffects(baseStats: CharacterStats, effects: StatEffectContainer[]) {
  const adjustedStats = Object.fromEntries(
    Object.keys(emptyStats).map(key => [key, baseStats[key as keyof CharacterStats]]),
  ) as CharacterStats
  const uncapped = (baseStats as Partial<ResolvedStats>).uncappedDirectCrit
  if (uncapped !== undefined) adjustedStats.directCrit = uncapped
  const statEffects = effects.flatMap(effect => (effect.stat ? [effect.stat] : []))

  // Apply fixed values first so formulas read the character's fully adjusted
  // source stat regardless of JSON ordering.
  statEffects.forEach(statEffect =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (key in adjustedStats && typeof value === "number") {
        const statKey = key as keyof CharacterStats
        adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + value)
      }
    }),
  )
  statEffects.forEach(statEffect =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (!(key in adjustedStats) || !value || typeof value !== "object") return
      const resolved =
        "formula" in value
          ? resolveFormulaValue((value as FormulaStatValue).formula, adjustedStats)
          : resolveSegmentValue(value, adjustedStats)
      if (resolved === undefined) return
      const statKey = key as keyof CharacterStats
      adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved)
    }),
  )
  return adjustedStats
}

export function applyDerivedStatEffects(
  baseStats: CharacterStats,
  effects: StatEffectContainer[],
  derivedStats: DerivedStats,
) {
  const adjustedStats = { ...baseStats }
  const statEffects = effects.flatMap(effect => (effect.stat ? [effect.stat] : []))
  statEffects.forEach(statEffect =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (!(key in adjustedStats) || !value || typeof value !== "object") return
      if ("formula" in value) {
        const formula = (value as FormulaStatValue).formula
        // Formulas backed by character stats were already handled by applyStatEffects.
        const sourceKeys = typeof formula.source === "string" ? [formula.source] : formula.source.max
        if (sourceKeys.every(key => key in baseStats)) return
        const resolved = resolveFormulaValue(formula, derivedStats as unknown as Record<string, unknown>)
        if (resolved === undefined) return
        const statKey = key as keyof CharacterStats
        adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved)
        return
      }
      const source = (value as SegmentStatValue).param1
      if (typeof source === "string" && source in baseStats) return
      const resolved = resolveSegmentValue(value, derivedStats as unknown as Record<string, number | undefined>)
      if (resolved === undefined) return
      const statKey = key as keyof CharacterStats
      adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved)
    }),
  )
  return adjustedStats
}

export function collectEffectiveStatEffects(stats: CharacterStats, effects: EffectiveStatEffectContainer[]) {
  const result: Partial<CharacterStats> = {}
  const effectiveStatEffects = effects.flatMap(effect => (effect.effectiveStat ? [effect.effectiveStat] : []))
  effectiveStatEffects.forEach(statEffect =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (!(key in stats)) return
      const statKey = key as keyof CharacterStats
      const resolved =
        typeof value === "number"
          ? value
          : value && typeof value === "object" && "formula" in value
            ? (resolveFormulaValue((value as FormulaStatValue).formula, stats) ?? 0)
            : (resolveSegmentValue(value, stats) ?? 0)
      result[statKey] = normalizeInternalValue((result[statKey] ?? 0) + resolved)
    }),
  )
  return result
}

export function requirementIsUnconditional(requirement: unknown) {
  return requirement === undefined || requirement === null || (Array.isArray(requirement) && requirement.length === 0)
}

export function calculateStatsWithEffects(
  baseStats: CharacterStats,
  effects: Array<StatEffectContainer & EffectiveStatEffectContainer>,
  judgementResistance: number,
  weapons: WeaponId[] = [],
) {
  const rawStats = calculateRawStats(baseStats, effects)
  const finalEffects = effects.map(effect =>
    effect.statStage === "talent" ? resolveRawStatFormulas(effect, rawStats) : effect,
  )
  const stats = calculateActionStats(rawStats, finalEffects, judgementResistance, weapons)
  return { rawStats, stats, derivedStats: stats }
}

/** Only explicitly declared raw contributions can feed the talent formula snapshot. */
export function calculateRawStats(baseStats: CharacterStats, effects: StatEffectContainer[]) {
  return applyStatEffects(
    baseStats,
    effects.map(effect => ({ stat: effect.rawStat })),
  )
}

export type ResolvedStats = CharacterStats &
  DerivedStats & { uncappedDirectCrit: number; effectiveStatBonuses: Partial<CharacterStats> }

export function resolveCompleteStats(
  stats: CharacterStats,
  judgementResistance: number,
  weapons: WeaponId[] = [],
  effectiveStatBonuses: Partial<CharacterStats> = {},
): ResolvedStats {
  return {
    ...stats,
    ...calculateDerivedStats(stats, judgementResistance, effectiveStatBonuses, weapons),
    uncappedDirectCrit: stats.directCrit,
    effectiveStatBonuses,
  }
}

/** STEADY talent formulas freeze against raw inputs; explicitly action-resolved passives stay live. */
export function resolveRawStatFormulas<T>(value: T, rawStats: CharacterStats): T {
  if (Array.isArray(value)) return value.map(item => resolveRawStatFormulas(item, rawStats)) as T
  if (!value || typeof value !== "object") return value
  const object = value as Record<string, unknown>
  if (object.formula && typeof object.formula === "object") {
    if ((object.formula as StatFormula).resolveAt === "action") return value
    const resolved = resolveFormulaValue(object.formula as StatFormula, rawStats)
    if (resolved !== undefined) return resolved as T
  }
  if (object.function === "segment" && typeof object.param1 === "string" && object.param1 in rawStats) {
    const resolved = resolveSegmentValue(object, rawStats)
    if (resolved !== undefined) return resolved as T
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, resolveRawStatFormulas(child, rawStats)]),
  ) as T
}

/** Copy the immutable skill baseline, add current uncapped contributions, then derive final fields. */
export function calculateActionStats(
  skillStats: CharacterStats,
  effects: Array<StatEffectContainer & EffectiveStatEffectContainer>,
  judgementResistance: number,
  weapons: WeaponId[],
): ResolvedStats {
  const ordinary = applyStatEffects(skillStats, effects)
  // Carry additive inputs, never normalized ranges, into the next immutable snapshot.
  // Every new effective formula reads ordinary stats before any effective bonus is applied.
  const effective = collectEffectiveStatEffects(ordinary, [
    { effectiveStat: (skillStats as Partial<ResolvedStats>).effectiveStatBonuses },
    ...effects,
  ])
  const initialDerived = calculateDerivedStats(ordinary, judgementResistance, effective, weapons)
  return resolveCompleteStats(
    applyDerivedStatEffects(ordinary, effects, initialDerived),
    judgementResistance,
    weapons,
    effective,
  )
}

export type CharacterStatOverrides = Partial<CharacterStats>

export function calculateStatsWithOverrides(
  baseStats: CharacterStats,
  effects: Array<StatEffectContainer & EffectiveStatEffectContainer>,
  judgementResistance: number,
  overrides: CharacterStatOverrides,
  weapons: WeaponId[] = [],
) {
  const adjustedBaseStats = { ...baseStats }
  const overrideEntries = Object.entries(overrides).filter(
    (entry): entry is [keyof CharacterStats, number] =>
      entry[0] in adjustedBaseStats && typeof entry[1] === "number" && Number.isFinite(entry[1]),
  )

  // Solve the raw input required to produce each requested final value. Re-running
  // the shared pipeline after every correction also lets an overridden source
  // stat feed formula effects before a dependent overridden stat is corrected.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const result = calculateStatsWithEffects(adjustedBaseStats, effects, judgementResistance, weapons)
    let largestCorrection = 0
    for (const [key, targetValue] of overrideEntries) {
      const correction = targetValue - result.stats[key]
      adjustedBaseStats[key] = normalizeInternalValue(adjustedBaseStats[key] + correction)
      largestCorrection = Math.max(largestCorrection, Math.abs(correction))
    }
    if (largestCorrection < 1e-9) return { baseStats: adjustedBaseStats, ...result }
  }

  return {
    baseStats: adjustedBaseStats,
    ...calculateStatsWithEffects(adjustedBaseStats, effects, judgementResistance, weapons),
  }
}
