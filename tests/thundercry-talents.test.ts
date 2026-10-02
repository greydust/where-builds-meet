import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"

import { calculateStatsWithEffects, resolveFormulaValue } from "../src/calculations/statEffects"
import { martialArtEffectsForRank } from "../src/data/martialArtTalents"
import { emptyStats } from "../src/data/statDefinitions"

/** Rank 13's unconditional Thundercry talents. */
const effects = martialArtEffectsForRank(martialArtDefinitions, ["thundercry"], 13).filter(
  effect => !("requirement" in effect),
)

describe("Thundercry Physical Attack Up", () => {
  it.each([
    [0, 0, 0],
    [200, 100, 52.8],
    [100, 200, 52.8],
    [140, 140, 36.96],
    [280, 100, 73.92],
    [100, 560, 73.92],
  ])("uses Body %s and Power %s to add %s Max Physical Attack", (body, power, bonus) => {
    const base = { ...emptyStats, body, power, minPhys: 100, maxPhys: 200 }
    const result = calculateStatsWithEffects(base, effects, 0)
    expect(result.stats.maxPhys).toBeCloseTo(200 + bonus, 9)
    expect(result.stats.minPhys).toBe(100)
    expect(result.rawStats.maxPhys).toBe(200)
  })

  it("includes raw contributions but excludes later talent and food bonuses", () => {
    const base = { ...emptyStats, body: 100, power: 120, maxPhys: 200 }
    const additions = [{ rawStat: { body: 100 } }, { stat: { power: 200 } }, { effectiveStat: { maxPhys: 50 } }]
    const result = calculateStatsWithEffects(base, [...effects, ...additions], 0)
    expect(result.stats.maxPhys).toBeCloseTo(252.8, 9)
    expect(result.stats.effectiveMaxPhys).toBeCloseTo(302.8, 9)
    expect(calculateStatsWithEffects(base, [...additions, ...effects], 0)).toEqual(result)
  })

  it("does not apply a character-source formula twice outside the talent stage", () => {
    const result = calculateStatsWithEffects(
      { ...emptyStats, body: 200, power: 100 },
      [{ stat: { maxPhys: { formula: { source: { max: ["body", "power"] }, multiplier: 0.264 } } } }],
      0,
    )
    expect(result.stats.maxPhys).toBeCloseTo(52.8, 9)
  })

  it("rejects missing, nonfinite, and empty maximum sources", () => {
    for (const sources of [{ body: 100 }, { body: 100, power: NaN }, { body: 100, power: Infinity }]) {
      expect(resolveFormulaValue({ source: { max: ["body", "power"] } }, sources)).toBeUndefined()
    }
    expect(resolveFormulaValue({ source: { max: [] } }, {})).toBeUndefined()
  })
})
