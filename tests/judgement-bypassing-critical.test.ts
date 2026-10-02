import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import windBuffsJson from "../data/buff/bamboocut-wind.json"
const windBuffs = asEffectDefinitions(windBuffsJson)
import sets from "../data/gear-set.json"
import infernalJson from "../data/skill/infernal-twinblades.json"
const infernal = asSkillRecords(infernalJson)
import mortalJson from "../data/skill/mortal-rope-dart.json"
const mortal = asSkillRecords(mortalJson)

import { calculateRotationBaseline, type RotationSimulationBundle } from "../src/calculations/rotationCalculator"
import type { RotationStep } from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
function bundle(judgementResistance: number): RotationSimulationBundle {
  return {
    timeline: {
      rotation: { name: "Judgment-bypassing critical bonuses", ping: 0, steps: [] },
      skills: { ...infernal, ...mortal },
      effectDefinitions: windBuffs,
      eventDefinitions: {},
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["infernalTwinblades", "mortalRopeDart"],
      initialResources: { Hellfire: 80 },
      resourceMaximums: { Hellfire: 80 },
      maxHP: 1000,
    },
    startAnchor: { rowId: "rotation-0" },
    stats: { ...emptyStats, minPhys: 100, maxPhys: 100, maxHp: 1000, precision: 2, crit: 0.33 },
    enemy: {
      name: "Critical rate target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance,
    },
    weapons: ["infernalTwinblades", "mortalRopeDart"],
    attunement: emptyAttunementStats,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}

describe("judgment-bypassing critical bonuses", () => {
  it.each([0, 0.65, 1])(
    "Flamelash adds ten points to Rodent and Heaven's Wrath at J=%s only while active",
    judgement => {
      const input = bundle(judgement)
      input.timeline.skills.EndFlamelash = {
        castTime: 0,
        action: [{ type: "consume", target: "self", value: "Flamelash", stack: "all", time: 0 }],
      }
      input.timeline.rotation.steps = [
        cast("Rodent"),
        cast("InfernalFlamelashLight1"),
        cast("Flamelash"),
        cast("Rodent"),
        cast("InfernalFlamelashLight1"),
        cast("EndFlamelash"),
        cast("Rodent"),
        cast("InfernalFlamelashLight1"),
      ]
      const result = calculateRotationBaseline(input)
      for (const entry of result.baseline) {
        const active = entry.context.buffs.includes("Flamelash")
        const breakdown = result.actionBreakdowns[entry.id!]
        expect(breakdown.outcomeRates!.critical).toBeCloseTo(0.33 / (1 + judgement) + (active ? 0.1 : 0), 10)
      }
      expect(result.baseline.some(entry => entry.context.buffs.includes("Flamelash"))).toBe(true)
      expect(result.baseline.at(-1)!.context.buffs).not.toContain("Flamelash")
    },
  )

  it.each([0, 0.65, 1])("Ivorybloom bypasses judgment for damage and healing only at full HP, J=%s", judgement => {
    for (const missingHP of [0, 1]) {
      const input = bundle(judgement)
      input.weapons = input.timeline.weapons = ["panaceaFan", "soulshadeUmbrella"]
      input.timeline.setupEffects = sets.Ivorybloom.options["4"].effect
      input.timeline.skills.Observe = {
        castTime: 1,
        action: [
          { type: "takeDamage", damage: missingHP, time: 0 },
          { type: "damage", phyCoef: 1, time: 0.1 },
          { type: "heal", phyCoef: 1, time: 0.2 },
        ],
      }
      input.timeline.rotation.steps = [cast("Observe")]
      const result = calculateRotationBaseline(input)
      const expected = (0.33 + 0.09) / (1 + judgement) + (missingHP === 0 ? 0.05 : 0)
      expect(result.actionBreakdowns["rotation-0:1"].outcomeRates!.critical).toBeCloseTo(expected, 10)
      expect(result.actionBreakdowns["rotation-0:2"].healing!.criticalRate).toBeCloseTo(expected, 10)
    }
  })

  it("keeps the effective critical cap and Direct Critical separate", () => {
    const input = bundle(0.65)
    input.stats.crit = 1.2375 // 75% after judgment; Flamelash reaches the 80% cap.
    input.stats.directCrit = 0.1
    input.timeline.rotation.steps = [cast("Flamelash"), cast("Rodent"), cast("InfernalFlamelashLight1")]
    const result = calculateRotationBaseline(input)
    expect(Object.values(result.actionBreakdowns).at(-1)!.outcomeRates!.critical).toBeCloseTo(0.9, 10)
  })
})
