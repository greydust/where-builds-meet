import breakthroughs from "@gamedata/breakthrough.json"
import { describe, expect, it } from "vitest"

import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

describe("effective precision", () => {
  it.each(["17", "18"] as const)("preserves the 65% baseline at breakthrough %s", breakthrough => {
    const result = calculateDerivedStats(
      { ...emptyStats, precision: 0.65 },
      breakthroughs[breakthrough].judgementResistance,
    )
    expect(result.effectivePrecision).toBe(0.65)
    expect(result.abrasionRate).toBeCloseTo(0.35, 12)
  })

  it("reduces precision above the baseline when judgement resistance increases", () => {
    const stats = { ...emptyStats, precision: 1 }
    const previous = calculateDerivedStats(stats, breakthroughs["17"].judgementResistance)
    const current = calculateDerivedStats(stats, breakthroughs["18"].judgementResistance)
    expect(previous.effectivePrecision).toBeCloseTo(0.8621212121212122, 12)
    expect(current.effectivePrecision).toBeCloseTo(0.8391891891891892, 12)
    expect(current.abrasionRate).toBeGreaterThan(previous.abrasionRate)
  })

  it.each(["17", "18"] as const)("caps precision at 100% at breakthrough %s", breakthrough => {
    const result = calculateDerivedStats(
      { ...emptyStats, precision: 2 },
      breakthroughs[breakthrough].judgementResistance,
    )
    expect(result.effectivePrecision).toBe(1)
    expect(result.abrasionRate).toBe(0)
  })
})
