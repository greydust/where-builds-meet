import drumTalents from "@gamedata/martial-art/museflow-waist-drum.json"
import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  calculateDamageBreakdown,
  calculateSimulatedDamageBreakdown,
  prepareDamageFormula,
  type DamageContext,
} from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

function context(): DamageContext {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    weapons: ["strategicSword"],
    buffs: [],
    skillTags: ["DirectDamage"],
    effects: [],
    enemy: {
      name: "Outcome target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
  }
}

describe("damage outcome factor limits", () => {
  it.each([2, 3, 4, 5, 6, 7])("enforces Museflow's early critical talent cap at rank %s", rank => {
    const input = context()
    input.stats = { ...input.stats, crit: 0.6, critDmgBonus: 0.5 }
    input.derivedStats = calculateDerivedStats(input.stats, 0)
    input.skillTags = ["DrumSeries"]
    input.effects = [{ GuaranteedCrit: true }]
    const action = { phyCoef: 1 }
    const baseline = calculateDamageBreakdown(action, input).total
    const entries = drumTalents.talent[rank].flatMap(
      talent => talent.effect as Array<{ effect?: Record<string, unknown> }>,
    )
    input.effects.push(...entries.flatMap(entry => (entry.effect?.critDmgBonus ? [entry.effect] : [])))
    const cap = rank < 6 ? 0.1 : 0.2
    expect(calculateDamageBreakdown(action, input).total / baseline).toBeCloseTo((1.5 + cap) / 1.5, 10)
  })
  it.each([
    ["critical", -1, 0, 1.35],
    ["critical", 0.45, 0.2, 1.65],
    ["critical", 1.45, 0.2, 2.5],
    ["critical", 2, 0, 2.5],
    ["affinity", -1, 0, 1.2],
    ["affinity", 0.4, 0.2, 1.6],
    ["affinity", 1.2, 0.2, 2.3],
  ] as const)("clamps %s after adding snapshot %s and effect %s", (outcome, snapshot, effect, expected) => {
    const input = context()
    const action = { phyCoef: 1, attrCoef: 1, phyBonus: 20, attrBonus: 10 }
    const normal = calculateDamageBreakdown(action, input)
    switch (outcome) {
      case "critical":
        input.derivedStats = { ...input.derivedStats, effectiveCritDmgBonus: snapshot }
        input.effects = [{ GuaranteedCrit: true, critDmgBonus: effect }]
        break
      case "affinity":
        input.stats = { ...input.stats, affinityDmgBonus: snapshot }
        input.effects = [{ GuaranteedAffinity: true, affinityDmgBonus: effect }]
        break
    }
    const expectedDamage = calculateDamageBreakdown(action, input)
    const sampled = calculateSimulatedDamageBreakdown(action, input, () => 0.5)
    expect(sampled.total).toBe(Math.ceil(expectedDamage.total))
    for (const result of [expectedDamage, prepareDamageFormula(action, input).evaluate(input.derivedStats)]) {
      expect(result.physical / normal.physical).toBeCloseTo(expected, 10)
      expect(result.bellstrike / normal.bellstrike).toBeCloseTo(expected, 10)
    }
  })
})
