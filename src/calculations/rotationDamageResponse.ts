import type { CharacterStats } from "@/types"

import { resolveActionStatContext } from "./actionStats"
import {
  attunementDamageMultiplier,
  attunementPenetrationMultiplier,
  matchingAttunementEntries,
} from "./attunementStats"
import type { PreparedRateResponse } from "./damage"
import type { AttunementStats } from "./damage"
import { attackFields, prepareDamageFormula, type AttackField, type DamageAction, type DamageContext } from "./damage"
import { mainAttributeForWeapons } from "./effectiveStats"
import { calculateActionStats } from "./statEffects"
import type { ResolvedStats } from "./statEffects"
import { collectUnconditionalStatEffects } from "./unconditionalDamageEffects"

export const attackStatFields = {
  minPhys: "effectiveMinPhys",
  maxPhys: "effectiveMaxPhys",
  minBellstrike: "effectiveMinBellstrike",
  maxBellstrike: "effectiveMaxBellstrike",
  minStonesplit: "effectiveMinStonesplit",
  maxStonesplit: "effectiveMaxStonesplit",
  minSilkbind: "effectiveMinSilkbind",
  maxSilkbind: "effectiveMaxSilkbind",
  minBamboocut: "effectiveMinBamboocut",
  maxBamboocut: "effectiveMaxBamboocut",
} as const

export const rateStatFields = new Set([
  "precision",
  "crit",
  "affinity",
  "directCrit",
  "directAffinity",
  "effectiveCritBonus",
  "effectivePrecision",
  "effectiveCrit",
  "effectiveAffinity",
  "finalCrit",
  "finalAffinity",
  "abrasionRate",
  "normalRate",
  "critRate",
  "affinityRate",
  "uncappedDirectCrit",
])
const rateFields = ["abrasionRate", "normalRate", "critRate", "affinityRate"] as const

export const attackInputFields = new Set([...Object.keys(attackStatFields), "minVoidAttack", "maxVoidAttack"])
export type AttackStatField = keyof typeof attackStatFields | "minVoidAttack" | "maxVoidAttack"

/** Formula sources, segments, conversions and stat requirements must remain independent of changed inputs. */
export function referencesChangedInput(value: unknown, fields: Set<string>): boolean {
  if (typeof value === "string") return fields.has(value)
  if (Array.isArray(value)) return value.some(child => referencesChangedInput(child, fields))
  return Boolean(
    value && typeof value === "object" && Object.values(value).some(child => referencesChangedInput(child, fields)),
  )
}

/** Index exact string values once; object keys are not formula references. */
export function referencedInputs(value: unknown): Set<string> {
  const references = new Set<string>()
  const visited = new Set<object>()
  const visit = (child: unknown) => {
    if (typeof child === "string") {
      references.add(child)
      return
    }
    if (!child || typeof child !== "object" || visited.has(child)) return
    visited.add(child)
    for (const nested of Object.values(child)) visit(nested)
  }
  visit(value)
  return references
}

/** An affine response around the baseline, valid only within the recorded clamp/normalization region. */
export class RotationDamageResponse {
  private readonly includeRates: boolean
  constructor(includeRates = false) {
    this.includeRates = includeRates
  }
  readonly coefficients = Object.fromEntries([...attackInputFields].map(field => [field, 0])) as Record<
    AttackStatField,
    number
  >
  private rateGroups = new Map<
    string,
    { context: DamageContext; resolved: DamageContext; response: PreparedRateResponse }
  >()

  evaluateRates(delta: Partial<CharacterStats>, effectiveDelta: Partial<CharacterStats>): number | undefined {
    let difference = 0
    for (const { context, resolved, response } of this.rateGroups.values()) {
      const stats = calculateActionStats(
        context.stats,
        [{ stat: delta, effectiveStat: effectiveDelta }],
        context.enemy.judgementResistance,
        context.weapons,
      )
      const next = resolveActionStatContext({ ...context, stats, derivedStats: stats })
      // Rate changes must leave all damage inputs unchanged, including formula/conversion effects.
      const fixed = Object.keys(resolved.derivedStats).filter(
        key => !rateStatFields.has(key) && key !== "effectiveStatBonuses",
      )
      if (
        fixed.some(
          key =>
            (resolved.derivedStats as unknown as Record<string, unknown>)[key] !==
            (next.derivedStats as unknown as Record<string, unknown>)[key],
        )
      )
        return undefined
      const rates = response.resolveRates(next.derivedStats)
      for (let i = 0; i < rateFields.length; i++)
        difference += response.coefficients[i] * (rates[rateFields[i]] - response.baselineRates[rateFields[i]])
    }
    return difference
  }

  private addRateGroup(
    key: string,
    group: { context: DamageContext; resolved: DamageContext; response: PreparedRateResponse },
    weight: number,
  ) {
    const previous = this.rateGroups.get(key)
    if (previous)
      for (let i = 0; i < rateFields.length; i++)
        previous.response.coefficients[i] += group.response.coefficients[i] * weight
    else
      this.rateGroups.set(key, {
        ...group,
        response: { ...group.response, coefficients: group.response.coefficients.map(value => value * weight) },
      })
  }

  private attunementCoefficients = new Map<keyof AttunementStats, number>()
  private penetration = new Map<keyof AttunementStats, { coefficient: number; lower: number; upper: number }>()
  private attunementBounds = new Map<keyof AttunementStats, number>()

  addAttunementDamage(damage: number, context: DamageContext) {
    const matches = matchingAttunementEntries(context.attunement, context.skillTags)
    const factor =
      1 +
      matches.reduce((sum, { key, stat }) => {
        const multiplier = stat?.attunementDMGBonus
        return (
          sum +
          (typeof multiplier === "number" && Number.isFinite(multiplier) ? context.attunement[key] * multiplier : 0)
        )
      }, 0)
    for (const { key } of matches) {
      const multiplier = attunementDamageMultiplier(key)
      if (multiplier === undefined) continue
      // A sign change can move physical damage across its zero clamp.
      this.attunementBounds.set(key, factor > 0 ? -factor : Infinity)
      this.attunementCoefficients.set(key, factor > 0 ? (damage / factor) * multiplier : 0)
    }
  }

  evaluateAttunement(key: keyof AttunementStats, delta: number): number | undefined {
    const multiplier = attunementDamageMultiplier(key)
    if (multiplier === undefined) {
      if (!attunementPenetrationMultiplier(key)) return undefined
      const response = this.penetration.get(key)
      if (!response) return 0
      return delta > response.lower && delta < response.upper ? response.coefficient * delta : undefined
    }
    if (!(delta * multiplier > (this.attunementBounds.get(key) ?? -Infinity))) return undefined
    return (this.attunementCoefficients.get(key) ?? 0) * delta
  }

  private bounds = new Map<number, { lower: number; upper: number }>()
  private ranges = new Map<
    string,
    { weights: Partial<Record<AttackStatField, number>>; lower: number; upper: number }
  >()
  add(other: RotationDamageResponse, weight = 1) {
    if (weight === 0) return
    for (const field of attackInputFields as Set<AttackStatField>)
      this.coefficients[field] += other.coefficients[field] * weight
    for (const [key, group] of other.rateGroups) this.addRateGroup(key, group, weight)
    for (const [key, coefficient] of other.attunementCoefficients)
      this.attunementCoefficients.set(key, (this.attunementCoefficients.get(key) ?? 0) + coefficient * weight)
    for (const [key, lower] of other.attunementBounds)
      this.attunementBounds.set(key, Math.max(this.attunementBounds.get(key) ?? -Infinity, lower))
    for (const [key, response] of other.penetration) this.addPenetration(key, response, weight)
    for (const [minimumWeight, bound] of other.bounds) this.bound(minimumWeight, bound.lower, bound.upper)
    for (const bound of other.ranges.values()) this.range(bound.weights, bound.lower, bound.upper)
  }

  private addPenetration(
    key: keyof AttunementStats,
    response: { coefficient: number; lower: number; upper: number },
    weight: number,
  ) {
    const previous = this.penetration.get(key)
    this.penetration.set(key, {
      coefficient: (previous?.coefficient ?? 0) + response.coefficient * weight,
      lower: Math.max(previous?.lower ?? -Infinity, response.lower),
      upper: Math.min(previous?.upper ?? Infinity, response.upper),
    })
  }

  private range(weights: Partial<Record<AttackStatField, number>>, lower: number, upper: number) {
    const key = JSON.stringify(weights)
    const previous = this.ranges.get(key)
    this.ranges.set(key, {
      weights,
      lower: Math.max(previous?.lower ?? -Infinity, lower),
      upper: Math.min(previous?.upper ?? Infinity, upper),
    })
  }

  private bound(minimumWeight: number, lower: number, upper: number) {
    const previous = this.bounds.get(minimumWeight)
    this.bounds.set(minimumWeight, {
      lower: Math.max(previous?.lower ?? -Infinity, lower),
      upper: Math.min(previous?.upper ?? Infinity, upper),
    })
  }

  addDamage(action: DamageAction, context: DamageContext, weight = 1) {
    if (weight === 0) return
    const [distribution, ...remaining] = context.expectedEffects ?? []
    if (distribution) {
      for (const outcome of distribution)
        this.addDamage(
          action,
          { ...context, effects: [...context.effects, ...outcome.effects], expectedEffects: remaining },
          weight * outcome.probability,
        )
      return
    }
    const resolved = resolveActionStatContext(context)
    const formula = prepareDamageFormula(action, resolved)
    const response = formula.response()
    if (this.includeRates) {
      const rateResponse = formula.rateResponse()
      const rateKey = JSON.stringify([
        rateResponse.key,
        context.stats,
        context.effects.filter(effect => effect.stat || effect.effectiveStat),
        collectUnconditionalStatEffects(context.unconditionalDamageEffects),
      ])
      this.addRateGroup(rateKey, { context, resolved, response: rateResponse }, weight)
    }
    for (const { key } of matchingAttunementEntries(resolved.attunement, resolved.skillTags)) {
      const definition = attunementPenetrationMultiplier(key)
      if (!definition) continue
      const penetration = response.penetration[definition.field]
      this.addPenetration(
        key,
        {
          coefficient: penetration.coefficient * definition.multiplier,
          lower: penetration.lower / definition.multiplier,
          upper: penetration.upper / definition.multiplier,
        },
        weight,
      )
    }
    const bonuses = (resolved.stats as Partial<ResolvedStats>).effectiveStatBonuses ?? {}
    let physicalMaximumUsesMinimum = false
    for (const [channel, [minimum, maximum]] of Object.entries(attackFields) as Array<
      [keyof typeof attackFields, readonly [AttackField, AttackField]]
    >) {
      const rawMinimum = Object.entries(attackStatFields).find(
        ([, field]) => field === minimum,
      )![0] as keyof typeof attackStatFields
      const rawMaximum = Object.entries(attackStatFields).find(
        ([, field]) => field === maximum,
      )![0] as keyof typeof attackStatFields
      const minAttack = resolved.stats[rawMinimum] + (bonuses[rawMinimum] ?? 0)
      const maxAttack = resolved.stats[rawMaximum] + (bonuses[rawMaximum] ?? 0)
      const gap = maxAttack - minAttack
      const firstClamped = gap < 0
      const rawWeights = { [rawMinimum]: 1, [rawMaximum]: -1 }
      this.range(rawWeights, firstClamped ? gap : -Infinity, firstClamped ? Infinity : gap)
      let secondClamped = false
      const primary = mainAttributeForWeapons(resolved.weapons) === channel
      if (primary) {
        const voidMin = resolved.stats.minVoidAttack + (bonuses.minVoidAttack ?? 0)
        const voidMax = resolved.stats.maxVoidAttack + (bonuses.maxVoidAttack ?? 0)
        const secondGap = Math.max(minAttack, maxAttack) + voidMax - minAttack - voidMin
        secondClamped = secondGap < 0
        this.range(
          { ...(firstClamped ? {} : rawWeights), minVoidAttack: 1, maxVoidAttack: -1 },
          secondClamped ? secondGap : -Infinity,
          secondClamped ? Infinity : secondGap,
        )
      }
      const maximumUsesMinimum = firstClamped || secondClamped
      this.coefficients[rawMinimum] +=
        (response.coefficients[minimum] + (maximumUsesMinimum ? response.coefficients[maximum] : 0)) * weight
      if (!maximumUsesMinimum) this.coefficients[rawMaximum] += response.coefficients[maximum] * weight
      if (primary) {
        this.coefficients.minVoidAttack +=
          (response.coefficients[minimum] + (secondClamped ? response.coefficients[maximum] : 0)) * weight
        if (!secondClamped) this.coefficients.maxVoidAttack += response.coefficients[maximum] * weight
      }
      if (channel === "physical") physicalMaximumUsesMinimum = maximumUsesMinimum
    }
    for (const bound of response.physicalBounds)
      this.bound(physicalMaximumUsesMinimum ? 1 : bound.minimumWeight, bound.lower, bound.upper)
  }

  evaluate(delta: Partial<Record<AttackStatField, number>>): number | undefined {
    for (const [minimumWeight, { lower, upper }] of this.bounds) {
      const change = (delta.minPhys ?? 0) * minimumWeight + (delta.maxPhys ?? 0) * (1 - minimumWeight)
      // Strict interior avoids zero-damage transitions that could alter outcome-trigger feedback.
      if (!(change > lower && change < upper)) return undefined
    }
    for (const { weights, lower, upper } of this.ranges.values()) {
      const fields = Object.keys(weights) as AttackStatField[]
      if (!fields.some(field => field in delta)) continue
      const change = fields.reduce((sum, field) => sum + weights[field]! * (delta[field] ?? 0), 0)
      if (!(change > lower && change < upper)) return undefined
    }
    return ([...attackInputFields] as AttackStatField[]).reduce(
      (total, field) => total + this.coefficients[field] * (delta[field] ?? 0),
      0,
    )
  }
}
