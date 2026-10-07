import { describe, expect, it } from "vitest"

import {
  baseAttributeEffects,
  breakthroughProfile,
  defaultSettings,
  systemStatEffectsForSoloLevel,
  typedSystemStats,
} from "@/application/gameData/setup"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import type { StatEffectContainer } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"

describe("breakthrough", () => {
  it("replaces profile bonuses and applies shared attribute conversions", async () => {
    const { createBaseAttributeEffects } = await import("@/data/baseAttributeEffects.ts")
    const { emptyStats } = await import("@/data/statDefinitions.ts")
    const { calculateStatsWithEffects } = await import("@/calculations/statEffects.ts")
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

describe("Solo Level character talents", () => {
  it("replaces the cumulative reward and restores the previous level without stacking", () => {
    const calculate = (soloLevel: number) =>
      calculateStatsWithEffects(emptyStats, systemStatEffectsForSoloLevel(soloLevel), 0).rawStats
    const before = calculate(17)
    const after = calculate(18)
    expect(after.power - before.power).toBe(4)
    expect(after.agility - before.agility).toBe(4)
    expect(after.momentum - before.momentum).toBe(4)
    expect(after.body - before.body).toBe(4)
    expect(after.defense - before.defense).toBe(4)
    expect(after.minVoidAttack - before.minVoidAttack).toBeCloseTo(13.2, 10)
    expect(after.maxVoidAttack - before.maxVoidAttack).toBeCloseTo(13.2, 10)
    // Added attributes must still contribute through the shared conversion pipeline.
    const delta = calculateStatsWithEffects(
      emptyStats,
      [
        ...baseAttributeEffects,
        { rawStat: { power: 4, agility: 4, momentum: 4, body: 4, defense: 4, physicalDefense: 13.2 } },
      ],
      0,
    ).rawStats
    expect(after.maxHp - before.maxHp).toBeCloseTo(1000 + delta.maxHp, 10)
    expect(after.minPhys - before.minPhys).toBeCloseTo(delta.minPhys, 10)
    expect(after.physicalDefense - before.physicalDefense).toBeCloseTo(delta.physicalDefense, 10)
    expect(after.precision).toBe(before.precision)
    expect(calculate(17)).toEqual(before)
    expect(
      systemStatEffectsForSoloLevel(18).filter(effect => effect === typedSystemStats.talentStatsBySoloLevel["18"]),
    ).toHaveLength(1)
  })

  it("rejects missing talent totals and resolves removed breakthrough selections to the default", () => {
    expect(() => systemStatEffectsForSoloLevel(16)).toThrow(RangeError)
    expect(breakthroughProfile({ ...defaultSettings, breakthrough: "16" })).toBe(breakthroughProfile(defaultSettings))
  })
})
