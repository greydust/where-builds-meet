import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "@/calculations/rotationTimeline"

import buffs from "../data/buff/bamboocut-wind.json"
import infernal from "../data/skill/infernal-twinblades.json"
import mortal from "../data/skill/mortal-rope-dart.json"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const input = (steps: RotationStep[]): TimelineBuildInput => ({
  rotation: { name: "RD charge", ping: 40, steps },
  skills: asSkillRecords({
    ...mortal,
    ...infernal,
    Observe: { ignorePing: true, castTime: 0, action: [{ type: "trigger", value: "Observation", time: 0 }] },
    Observation: {
      castTime: 0,
      tags: ["Triggered"],
      action: [1.539, 1.541].map(time => ({ type: "damage", time, phyCoef: 1 })),
    },
  }),
  effectDefinitions: asEffectDefinitions(buffs),
  eventDefinitions: {},
  dots: {},
  innerWayConditions: [],
  innerWayRules: [],
  setupEffects: [],
  weapons: ["mortalRopeDart", "infernalTwinblades"],
})
const stacks = (effects: ReadonlyMap<string, { name: string; stack?: number }>) =>
  effects.get("RodentRampageEnhancement")?.stack ?? 0

describe("Rodent's Resilience charge", () => {
  it.each([false, true])(
    "grants its two stacks only after the full hold and retains them across weapon changes (sampled=%s)",
    sampled => {
      const rows = buildRotationTimeline(
        input([cast("Observe"), cast("RodentsResilienceCharge"), cast("InfernalLight1")]),
        sampled ? () => 0.5 : undefined,
      )
      const observation = rows.find(row => row.step.type === "skill" && row.step.skill === "Observation")!
      expect(stacks(observation.actionStates[0].buffs)).toBe(0)
      expect(stacks(observation.actionStates[1].buffs)).toBe(2)
      const light = rows.find(row => row.step.type === "skill" && row.step.skill === "InfernalLight1")!
      expect(light.startTime).toBeCloseTo(1.54)
      expect(light.currentWeapon).toBe("DualBlades")
      expect(stacks(light.actionStates[0].buffs)).toBe(2)
    },
  )

  it("uses one enhancement per summon, replenishes to two, and allows unenhanced summons", () => {
    const rows = buildRotationTimeline(
      input([
        cast("RodentsResilienceCharge"),
        cast("RodentRampage"),
        cast("InfernalLight1"),
        cast("RodentsResilienceCharge"),
        cast("RodentRampage"),
        cast("InfernalLight1"),
        cast("RodentRampage"),
        cast("InfernalLight1"),
        cast("RodentRampage"),
        cast("InfernalLight1"),
      ]),
    )
    const lights = rows.filter(row => row.step.type === "skill" && row.step.skill === "InfernalLight1")
    expect(lights.map(row => stacks(row.actionStates[0].buffs))).toEqual([1, 1, 0, 0])
    expect(
      lights.map(row =>
        Array.from(row.actionStates[0].buffs.values())
          .filter(effect => ["RodentRampage", "EnhancedRodentRampage"].includes(effect.name))
          .map(effect => effect.name),
      ),
    ).toEqual([["EnhancedRodentRampage"], ["EnhancedRodentRampage"], ["EnhancedRodentRampage"], ["RodentRampage"]])
    // Every blade cast still triggers its coordinated Rodent, independently of automatic ticks.
    for (const light of lights) {
      expect(
        rows.some(
          row =>
            row.step.skill === "Rodent" &&
            Math.abs(row.startTime - light.startTime - Number(light.actions[0].time)) < 1e-6,
        ),
      ).toBe(true)
    }
  })
})
