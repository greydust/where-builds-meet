import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"
import { visibleTimelineEffects } from "@/rotationDisplay"

function run(buff: string, persistent = false) {
  return buildRotationTimeline({
    rotation: {
      name: "Shattered Stone refresh",
      ping: 0,
      steps: ["SweepAll", "Observe", "Wait", "SweepAll", "Observe", "Expire", "Observe"].map(skill => ({
        type: "skill" as const,
        skill,
      })),
    },
    skills: {
      ...allSkillDefinitions,
      Observe: { castTime: 0.25, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      Wait: { castTime: 5, action: [] },
      Expire: { castTime: 11, action: [] },
    },
    effectDefinitions,
    dots: {},
    eventDefinitions: {},
    weapons: ["heavenquakerSpear"],
    setupEffects: [],
    innerWayConditions: [],
    innerWayRules: [],
    initialBuffs: [{ name: buff }],
    initialDebuffs: persistent ? [{ name: "ShatteredStone", stack: 1, persistent: true }] : [],
    initialResources: { Endurance: 200 },
    resourceMaximums: { Endurance: 200 },
  })
}

describe("Sweep All Shattered Stone", () => {
  it.each(["SpringSurge", "RiverFlow", "EmpoweredRiverFlow"])(
    "applies, refreshes and expires the visible debuff with %s",
    buff => {
      const rows = run(buff)
      const observations = rows.filter(row => row.step.skill === "Observe")
      const first = observations[0].debuffs.get("ShatteredStone")!
      const refreshed = observations[1].debuffs.get("ShatteredStone")!
      expect(first.stack).toBe(1)
      expect(first.expiresAt! - first.appliedAt!).toBeCloseTo(10, 8)
      expect(refreshed.expiresAt!).toBeGreaterThan(first.expiresAt!)
      expect(refreshed.stack).toBe(1)
      expect(observations[2].debuffs.has("ShatteredStone")).toBe(false)
      expect(
        visibleTimelineEffects([...observations[0].debuffs.values()], effectDefinitions).some(
          effect => effect.name === "ShatteredStone",
        ),
      ).toBe(true)
    },
  )

  it("does not apply with Water Drop", () => {
    expect(run("WaterDrop").every(row => !row.debuffs.has("ShatteredStone"))).toBe(true)
  })

  it("preserves the permanent global selection without adding stacks", () => {
    const observations = run("RiverFlow", true).filter(row => row.step.skill === "Observe")
    for (const row of observations) {
      expect(row.debuffs.get("ShatteredStone")?.persistent).toBe(true)
      expect(row.debuffs.get("ShatteredStone")?.stack).toBe(1)
    }
  })
})
