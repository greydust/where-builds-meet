import { resolveActionStatContext } from "./actionStats"
import { attackFields, prepareDamageFormula, type AttackField, type DamageAction, type DamageContext } from "./damage"
import { mainAttributeForWeapons } from "./effectiveStats"
import type { ResolvedStats } from "./statEffects"

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

export type AttackStatField = keyof typeof attackStatFields

/** Formula sources, segments, conversions and stat requirements must remain independent of changed inputs. */
export function referencesChangedInput(value: unknown, fields: Set<string>): boolean {
  if (typeof value === "string") return fields.has(value)
  if (Array.isArray(value)) return value.some(child => referencesChangedInput(child, fields))
  return Boolean(
    value && typeof value === "object" && Object.values(value).some(child => referencesChangedInput(child, fields)),
  )
}

/** An affine response around the baseline, valid only within the recorded clamp/normalization region. */
export class RotationAttackResponse {
  readonly coefficients = Object.fromEntries(Object.keys(attackStatFields).map(field => [field, 0])) as Record<
    AttackStatField,
    number
  >
  private bounds = new Map<number, { lower: number; upper: number }>()
  private ranges = new Map<keyof typeof attackFields, { lower: number; upper: number }>()

  add(other: RotationAttackResponse, weight = 1) {
    if (weight === 0) return
    for (const field of Object.keys(attackStatFields) as AttackStatField[])
      this.coefficients[field] += other.coefficients[field] * weight
    for (const [minimumWeight, bound] of other.bounds) this.bound(minimumWeight, bound.lower, bound.upper)
    for (const [channel, bound] of other.ranges) this.range(channel, bound.lower, bound.upper)
  }

  private range(channel: keyof typeof attackFields, lower: number, upper: number) {
    const previous = this.ranges.get(channel)
    this.ranges.set(channel, {
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
    const response = prepareDamageFormula(action, resolved).attackResponse()
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
      let maximumUsesMinimum = gap < 0
      this.range(channel, maximumUsesMinimum ? gap : -Infinity, maximumUsesMinimum ? Infinity : gap)
      if (mainAttributeForWeapons(resolved.weapons) === channel) {
        const voidMin = resolved.stats.minVoidAttack + (bonuses.minVoidAttack ?? 0)
        const voidMax = resolved.stats.maxVoidAttack + (bonuses.maxVoidAttack ?? 0)
        const secondGap = Math.max(minAttack, maxAttack) + voidMax - minAttack - voidMin
        if (!maximumUsesMinimum) {
          const secondClamped = secondGap < 0
          this.range(channel, secondClamped ? secondGap : -Infinity, secondClamped ? Infinity : secondGap)
          maximumUsesMinimum = secondClamped
        }
      }
      this.coefficients[rawMinimum] +=
        (response.coefficients[minimum] + (maximumUsesMinimum ? response.coefficients[maximum] : 0)) * weight
      if (!maximumUsesMinimum) this.coefficients[rawMaximum] += response.coefficients[maximum] * weight
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
    for (const [channel, { lower, upper }] of this.ranges) {
      const [minimum, maximum] = attackFields[channel]
      const rawMinimum = Object.entries(attackStatFields).find(([, field]) => field === minimum)![0] as AttackStatField
      const rawMaximum = Object.entries(attackStatFields).find(([, field]) => field === maximum)![0] as AttackStatField
      if (!(rawMinimum in delta || rawMaximum in delta)) continue
      const change = (delta[rawMinimum] ?? 0) - (delta[rawMaximum] ?? 0)
      if (!(change > lower && change < upper)) return undefined
    }
    return (Object.keys(attackStatFields) as AttackStatField[]).reduce(
      (total, field) => total + this.coefficients[field] * (delta[field] ?? 0),
      0,
    )
  }
}
