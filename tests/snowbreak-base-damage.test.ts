import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import innerWay from "../data/innerway/frost-clad-night.json"
import skills from "../data/skill/snowparting-blade.json"
import { calculateDamageBreakdown } from "../src/calculations/damage"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { requirementsPass } from "../src/calculations/rotationTimeline"
import { effectState } from "../src/calculations/trackedEffectState"
import { emptyStats } from "../src/data/statDefinitions"
import type { WeaponId } from "../src/types"

const enemy = {
  name: "Snowbreak target",
  level: 100,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}
const skill = skills.SnowpartingHeavyVC

describe("Snowbreak Spring base damage", () => {
  it.each([
    [false, false, false, 1.36],
    [true, false, false, 1.76],
    [false, false, true, 1.36],
    [false, true, true, 1.76],
    [true, true, true, 1.76],
  ])("passion=%s, T6=%s, exhausted=%s", (passion, t6, exhausted, multiplier) => {
    const conditions = new Set(t6 ? ["FrostCladNightT6"] : [])
    const self = effectState(passion ? [{ name: "InnerPassion", stack: 1 }] : [])
    const target = effectState(exhausted ? [{ name: "Exhausted", stack: 1 }] : [])
    const rules = [...innerWay.effect.FrostCladNightT4.effect, ...(t6 ? innerWay.effect.FrostCladNightT6.effect : [])]
    const effects = [
      ...skill.modifier.map(rule => rule.effect),
      ...rules
        .filter(rule => requirementsPass(rule.requirement, self, target, skill.tags, conditions))
        .map(rule => rule.effect),
      { hpDMGBonus: 0.25 },
    ]
    // Exercise attack-scaled and flat damage separately, across every channel.
    for (const attack of [0, 100]) {
      const stats = {
        ...emptyStats,
        minPhys: attack,
        maxPhys: attack,
        minBellstrike: attack,
        maxBellstrike: attack,
        minStonesplit: attack,
        maxStonesplit: attack,
        minSilkbind: attack,
        maxSilkbind: attack,
        minBamboocut: attack,
        maxBamboocut: attack,
        precision: 1,
      }
      const context = {
        stats,
        attunement: emptyAttunementStats,
        skillTags: skill.tags,
        weapons: ["snowparting"] as WeaponId[],
        buffs: [],
        enemy,
        derivedStats: calculateDerivedStats(stats, 0),
        effects: [],
      }
      const baseline = calculateDamageBreakdown(
        { phyCoef: 2.07686, attrCoef: 2.07686, phyBonus: 575, attrBonus: 313 },
        context,
      )
      const actual = calculateDamageBreakdown(skill.action[0], { ...context, effects })
      for (const channel of ["physical", "bellstrike", "stonesplit", "silkbind", "bamboocut", "total"] as const) {
        expect(actual[channel]).toBeCloseTo(baseline[channel] * multiplier * (1.25 + (t6 ? 0.1 : 0)), 8)
      }
    }
  })
})
