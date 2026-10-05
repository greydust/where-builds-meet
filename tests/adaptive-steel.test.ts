import { describe, expect, it } from "vitest"

import { defaultSkillMaps } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"

import buffs from "../data/buff/stonesplit-strength.json"

const general = defaultSkillMaps.General
import snowparting from "../data/skill/snowparting-blade.json"
import { calculateDamageBreakdown } from "../src/calculations/damage"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import {
  buildRotationTimeline,
  requirementsPass,
  type RotationStep,
  type TimelineBuildInput,
} from "../src/calculations/rotationTimeline"
import { effectState } from "../src/calculations/trackedEffectState"
import { emptyStats } from "../src/data/statDefinitions"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const delay = (duration: number): RotationStep => ({ type: "event", event: "Delay", duration })
const buffId = "AdaptiveSteelHengBlade"
function run(steps: RotationStep[], weapon = "HengBlade", enabled = true) {
  const input: TimelineBuildInput = {
    rotation: { name: "Adaptive Steel", ping: 0, steps },
    skills: { ...general, Observe: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] } },
    effectDefinitions: buffs,
    dots: {},
    eventDefinitions: {},
    innerWayConditions: enabled ? ["AdaptiveSteelT0"] : [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting"],
    martialArtState: { snowparting: { weapon } } as TimelineBuildInput["martialArtState"],
  }
  return buildRotationTimeline(input).filter(row => row.step.skill === "Observe")
}
describe("Adaptive Steel Heng Blade", () => {
  it.each([
    ["DeflectSuccessful", "HengBlade", true, true],
    ["Deflect", "HengBlade", true, false],
    ["PerfectDodge", "HengBlade", true, false],
    ["DeflectSuccessful", "MoBlade", true, false],
    ["DeflectSuccessful", "HengBlade", false, false],
  ])("%s with %s, equipped=%s", (defense, weapon, enabled, expected) => {
    const rows = run([cast(defense), cast("Observe")], weapon, enabled)
    expect(rows[0].actionStates[0].buffs.has(buffId)).toBe(expected)
  })
  it("expires at five seconds, rejects cooldown refreshes, and rearms at twenty seconds", () => {
    const rows = run([
      cast("DeflectSuccessful"),
      cast("Observe"),
      delay(1),
      cast("DeflectSuccessful"),
      cast("Observe"),
      delay(5 - 1 - 2 * 0.338),
      cast("Observe"),
      cast("DeflectSuccessful"),
      cast("Observe"),
      delay(20 - 5 - 0.338),
      cast("DeflectSuccessful"),
      cast("Observe"),
    ])
    expect(rows.map(row => row.actionStates[0].buffs.has(buffId))).toEqual([true, true, false, false, true])
    expect(rows[1].actionStates[0].buffs.get(buffId)?.expiresAt).toBeCloseTo(5)
    expect(rows[4].actionStates[0].buffs.get(buffId)?.expiresAt).toBeCloseTo(25)
  })
  it("adds five percentage points only to Heng Blade Light/Heavy Varied Combo damage", () => {
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, vsBossDmg: 0.2 }
    const enemy = {
      name: "Target",
      level: 100,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    for (const [tags, expected] of [
      [snowparting.SnowpartingHeavyVC.tags, 125],
      [snowparting.SnowpartingLightCharged.tags, 125],
      [snowparting.SnowpartingQ.tags, 120],
      [["MoBlade", "Heavy", "VariedCombo"], 120],
      [["HengBlade", "Heavy"], 120],
    ] as const) {
      const effects = buffs.AdaptiveSteelHengBlade.effect
        .filter(rule => requirementsPass(rule.requirement, effectState(), effectState(), [...tags], new Set()))
        .map(rule => rule.effect)
      const damage = calculateDamageBreakdown(
        { phyCoef: 1 },
        {
          stats,
          enemy,
          derivedStats: calculateDerivedStats(stats, 0),
          attunement: emptyAttunementStats,
          weapons: [],
          buffs: [],
          skillTags: [...tags],
          effects,
        },
      )
      expect(damage.total).toBeCloseTo(expected)
    }
  })
})
