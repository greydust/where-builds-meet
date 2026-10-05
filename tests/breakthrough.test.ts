import { describe, expect, it } from "vitest"

import type { StatEffectContainer } from "@/calculations/statEffects"

describe("breakthrough", () => {
  it("replaces profile bonuses and applies shared attribute conversions", async () => {
    const { createBaseAttributeEffects } = await import("../src/data/baseAttributeEffects.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    // Controlled profiles exercise the pipeline without freezing shipped level bonuses.
    const profiles = [{ rawStat: { power: 10, precision: 0.1 } }, { rawStat: { power: 25, precision: 0.2 } }]
    const conversions = createBaseAttributeEffects({
      power: { minPhys: 2, maxPhys: 3 },
      body: {},
      defense: {},
      agility: {},
      momentum: {},
    })
    const calculate = (profile: StatEffectContainer) =>
      calculateStatsWithEffects(emptyStats, [...conversions, profile], 0).stats
    const first = calculate(profiles[0])
    const second = calculate(profiles[1])
    expect(first.power).toBe(10)
    expect(second.power).toBe(25)
    expect(first.precision).toBe(0.1)
    expect(second.precision).toBe(0.2)
    expect(second.minPhys - first.minPhys).toBe(30)
    expect(second.maxPhys - first.maxPhys).toBe(45)
    expect(calculate(profiles[0])).toEqual(first)
  })
})
