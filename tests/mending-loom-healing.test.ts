import umbrella from "@gamedata/skill/soulshade-umbrella.json"
import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateHealingBreakdown, calculateSimulatedHealingBreakdown } from "@/calculations/healing"
import { emptyStats } from "@/data/statDefinitions"

function context(): DamageContext {
  const stats = {
    ...emptyStats,
    maxHp: 100000,
    minPhys: 100,
    maxPhys: 100,
    minSilkbind: 50,
    maxSilkbind: 50,
    crit: 0.5,
    criticalHealingBonus: 0.5,
    physicalHealingBonus: 0.1,
    silkbindHealingBonus: 0.2,
  }
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0, {}, ["panaceaFan", "soulshadeUmbrella"]),
    enemy: {
      name: "Healing",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    attunement: emptyAttunementStats,
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    buffs: [],
    skillTags: ["Heal", "InnerWay"],
    effects: [{ healingBonus: 0.2 }],
  }
}

const action = umbrella.MendingLoomHealing.action[0]

describe("Mending Loom's two healing components", () => {
  it("adds fixed Max-HP recovery after applying ordinary bonuses and critical probability to attack healing", () => {
    // Ordinary base: (100 × .01 × 1.1 + 50 × .01 × 1.2) × 1.2 = 2.04.
    const result = calculateHealingBreakdown(action, context())
    expect(result.total).toBeCloseTo(10000 + 2.04 * 1.25, 10)
    expect(result.criticalRate).toBeCloseTo(0.5, 12)
    expect(result.physical + result.silkbind).toBeCloseTo(result.total, 10)
  })

  it.each([false, true])(
    "rolls the attack component once without multiplying the percentage part (critical=%s)",
    critical => {
      const rolls = [critical ? 0.25 : 0.75, 0.5]
      let calls = 0
      const result = calculateSimulatedHealingBreakdown(action, context(), () => rolls[calls++])
      expect(calls).toBe(2)
      expect(result.outcome).toBe(critical ? "critical" : "normal")
      expect(result.total).toBeCloseTo(10000 + 2.04 * (critical ? 1.5 : 1), 10)
    },
  )

  it("keeps received-healing bonuses and sampled fluctuation off the Max-HP term", () => {
    const input = context()
    input.effects.push({ healingReceivedBonus: 0.3 })
    expect(calculateHealingBreakdown(action, input).total).toBeCloseTo(10000 + 2.04 * 1.25 * 1.3, 10)
    const sampled = calculateSimulatedHealingBreakdown(action, input, () => 0)
    expect(sampled.total).toBeCloseTo(10000 + 2.04 * 1.5 * 1.3 * 0.92, 10)
  })

  it("still supports a pure percentage recovery without inventing a critical-heal event", () => {
    const input = context()
    let rolls = 0
    const result = calculateSimulatedHealingBreakdown({ maxHPRatio: 0.1 }, input, () => {
      rolls++
      return 0
    })
    expect(result.total).toBe(10000)
    expect(result.criticalRate).toBe(0)
    expect(rolls).toBe(0)
  })
})
