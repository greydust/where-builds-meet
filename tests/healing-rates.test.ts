import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateHealingBreakdown, calculateSimulatedHealingBreakdown } from "@/calculations/healing"
import { restrictedOutcomeRates } from "@/calculations/rateRoutes"
import { emptyStats } from "@/data/statDefinitions"

describe("healing rates", () => {
  it.each([0, 0.4, 0.8, 1])("ignores precision %s in expected and sampled healing", precision => {
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      crit: 0.2,
      directCrit: 0.1,
      criticalHealingBonus: 0.5,
      precision,
    }
    const context: DamageContext = {
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy: {
        name: "Healing rate test",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      weapons: [],
      skillTags: ["Heal"],
      buffs: [],
      effects: [],
      attunement: emptyAttunementStats,
    }
    const action = { type: "heal", phyCoef: 1 }
    const expected = calculateHealingBreakdown(action, context)
    expect(expected.criticalRate).toBeCloseTo(0.3, 12)
    expect(expected.normalRate).toBeCloseTo(0.7, 12)
    expect(expected.total).toBeCloseTo(115, 12)

    for (const [roll, outcome, total] of [
      [0.25, "critical", 150],
      [0.35, "normal", 100],
    ] as const) {
      let draws = 0
      const sampled = calculateSimulatedHealingBreakdown(action, context, () => (draws++ === 0 ? roll : 0.5))
      expect(sampled.outcome).toBe(outcome)
      expect(sampled.total).toBeCloseTo(total, 12)
    }
  })

  it.each([
    [-0.2, 0.1, 0],
    [0.9, 0.2, 1],
  ])("clamps critical probability for effective %s and direct %s", (effectiveCrit, directCrit, critRate) => {
    expect(restrictedOutcomeRates("healing", { effectiveCrit, directCrit })).toEqual({
      abrasionRate: 0,
      affinityRate: 0,
      critRate,
      normalRate: 1 - critRate,
    })
  })
})
