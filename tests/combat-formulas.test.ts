import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, calculateSimulatedDamageBreakdown, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateHealingBreakdown, calculateSimulatedHealingBreakdown } from "@/calculations/healing"
import { RotationDamageResponse } from "@/calculations/rotationDamageResponse"
import { emptyStats } from "@/data/statDefinitions"
import { deserializeSkillOverrides } from "@/skillOverrides"
import type { CharacterStats, EnemyProfile } from "@/types"

function context(stats: Partial<CharacterStats> = {}, enemy: Partial<EnemyProfile> = {}): DamageContext {
  const character = { ...emptyStats, minPhys: 100, maxPhys: 200, precision: 1, ...stats }
  return {
    stats: character,
    derivedStats: calculateDerivedStats(character, 0),
    enemy: {
      name: "Formula test",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
      ...enemy,
    },
    attunement: emptyAttunementStats,
    weapons: [],
    skillTags: [],
    buffs: [],
    effects: [],
  }
}

describe("ordinary combat formulas", () => {
  it("floors attack before the coefficient and flat damage, including in comparisons", () => {
    const input = context({}, { defense: 170 })
    const action = { phyCoef: 2, phyBonus: 7 }
    const damage = calculateDamageBreakdown(action, input)
    expect(damage.total).toBe(27)

    const response = new RotationDamageResponse()
    response.addDamage(action, input)
    expect(response.evaluate({ minPhys: 10, maxPhys: 10 })).toBeCloseTo(2)
    expect(response.evaluate({ maxPhys: 70 })).toBeUndefined()
    expect(calculateDamageBreakdown(action, context({ maxPhys: 270 }, input.enemy)).total).toBe(37)
  })

  it.each([
    [-10, 1.05],
    [75, 0.25],
    [100, 0.2],
  ])("applies the resistance curve to physical and attribute damage at a gap of %s", (resistance, factor) => {
    const input = context(
      { maxPhys: 100, minSilkbind: 100 },
      { physicalResistance: resistance, silkbindResistance: resistance },
    )
    const damage = calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, input)
    expect(damage.physical).toBeCloseTo(100 * factor)
    expect(damage.silkbind).toBeCloseTo(100 * factor)
    expect(damage.total).toBeCloseTo(200 * factor)
  })

  it("falls back when a penetration comparison starts on the nonlinear branch", () => {
    const input = context({}, { physicalResistance: 100 })
    const response = new RotationDamageResponse()
    response.addDamage({ phyCoef: 1 }, input)
    expect(response.evaluateAttunement("physicalPenetration", 1)).toBeUndefined()
  })

  it("applies added rates and target resistances before caps, with a 5% Precision floor", () => {
    const input = context(
      { precision: 1, crit: 0.85, affinity: 0.55, effectivePrecisionBonus: 0.1, effectiveAffinityBonus: 0.1 },
      { addedPrecisionResistance: 1.5, addedCriticalResistance: 0.15, addedAffinityResistance: 0.4 },
    )
    const damage = calculateDamageBreakdown({ phyCoef: 1 }, input)
    expect(damage.outcomeRates?.affinity).toBeCloseTo(0.25)
    expect(damage.outcomeRates?.critical).toBeCloseTo(0.7 * 0.05)
    expect(damage.outcomeRates?.abrasion).toBeCloseTo(0.95 * 0.75)
  })

  it("converts failed-precision abrasion to Normal, and applies the abrasion multiplier before settlement", () => {
    const input = context({ precision: 0.5, crit: 0.4, affinity: 0.2 })
    input.effects = [
      { abrasionDamageBonus: 0.25, convert: { from: "abrasionRate", to: "normalRate", ratio: 1, fraction: 0.5 } },
    ]
    const action = { phyCoef: 1, phyBonus: 0.1 }
    const expected = calculateDamageBreakdown(action, input)
    expect(expected.outcomeRates?.abrasion).toBeCloseTo(0.2)
    expect(expected.outcomeRates?.normal).toBeCloseTo(0.4)
    expect(expected.outcomeRates?.critical).toBeCloseTo(0.2)
    const abrasion = calculateSimulatedDamageBreakdown(action, input, () => 0.1)
    expect(abrasion.outcome).toBe("abrasion")
    expect(abrasion.total).toBe(126)
    const normal = calculateSimulatedDamageBreakdown(action, input, () => 0.3)
    expect(normal.outcome).toBe("normal")
    expect(normal.total).toBe(131)
    input.effects = [{ convert: { from: "abrasionRate", to: "normalRate", ratio: 1 } }]
    const immune = calculateDamageBreakdown(action, input)
    expect(immune.outcomeRates?.abrasion).toBe(0)
    expect(immune.outcomeRates?.normal).toBeCloseTo(0.6)
    expect(immune.outcomeRates?.critical).toBeCloseTo(0.2)
  })

  it("preserves abrasion immunity in saved skill modifiers", () => {
    const saved = deserializeSkillOverrides({
      version: 4,
      overrides: { Mystic: { OldSkill: { name: "Old Skill", modifier: [{ effect: { NoAbrasion: true } }] } } },
    })
    const modifiers = saved.Mystic?.OldSkill.modifier as { effect: Record<string, unknown> }[]
    const input = context({ precision: 0.5, crit: 0.4 })
    input.effects = modifiers.map(modifier => modifier.effect)
    const damage = calculateDamageBreakdown({ phyCoef: 1 }, input)
    expect(damage.outcomeRates?.abrasion).toBe(0)
    expect(damage.outcomeRates?.critical).toBeCloseTo(0.2)
    expect(damage.outcomeRates?.normal).toBeCloseTo(0.8)
  })

  it("divides type bonuses separately and rounds sampled damage once across channels", () => {
    const input = context({ maxPhys: 100, minSilkbind: 100, vsBossDmg: 0.15 }, { typeBonusDivisor: 1.15 })
    input.effects = [{ dmgBonus: 0.2 }]
    const action = { phyCoef: 0.003, attrCoef: 0.003 }
    const expected = calculateDamageBreakdown(action, input)
    expect(expected.total).toBeCloseTo(0.6 * (1 + 0.15 / 1.15 + 0.2))
    const sampled = calculateSimulatedDamageBreakdown(action, input, () => 0)
    expect(sampled.total).toBe(1)
    expect(sampled.physical + sampled.silkbind).toBeCloseTo(1)
  })

  it("uses the recipient's correctable healing penetration divisor independently of damage resistance", () => {
    const input = context(
      { minPhys: 100, maxPhys: 100, physicalPenetration: -40 },
      { correctablePenetrationDivisor: 1.25, physicalResistance: 100, addedCriticalResistance: 0.5 },
    )
    input.attunement = { ...emptyAttunementStats, physicalPenetration: 16 }
    const action = { phyCoef: 1 }
    expect(calculateHealingBreakdown(action, input).total).toBeCloseTo(90)
    input.healingTarget = { healingPenetrationDivisor: 2 }
    expect(calculateHealingBreakdown(action, input).total).toBeCloseTo(85)
  })

  it("rolls each healing attack channel independently while leaving flat bonuses fixed", () => {
    const input = context({ minSilkbind: 50, maxSilkbind: 150 })
    const action = { phyCoef: 1, silkbindCoef: 1, phyBonus: 23, attrBonus: 37 }
    const rolls = [0, 0, 0.99]
    const sample = calculateSimulatedHealingBreakdown(action, input, () => rolls.shift()!)
    expect(sample.physical).toBeCloseTo(158)
    expect(sample.silkbind).toBeCloseTo(146.8)
    expect(sample.total).toBeCloseTo(304.8)
    expect(calculateHealingBreakdown(action, input).total).toBe(310)
  })
})
