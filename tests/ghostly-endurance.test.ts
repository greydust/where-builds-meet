import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline, type RotationStep } from "@/calculations/rotationTimeline"

function run(ghostly: string, gale: boolean, surge = false, delay = 0) {
  const ways = [
    { innerWay: "SwordMorph", tier: "T0" },
    { innerWay: "MountainsMight", tier: "T0" },
  ] as const
  const steps: RotationStep[] = [{ type: "skill", skill: ghostly }]
  if (delay) steps.push({ type: "event", event: "Delay", duration: delay })
  steps.push({ type: "skill", skill: "VagrantSword2" })
  return buildRotationTimeline({
    rotation: { name: "Ghostly Endurance", ping: 0, steps },
    skills: allSkillDefinitions,
    effectDefinitions,
    eventDefinitions: {},
    dots: {},
    setupEffects: [],
    weapons: ["namelessSword", "namelessSpear"],
    innerWayConditions: [...innerWayConditionsFor([...ways], undefined, "bellstrikeSplendor")],
    innerWayRules: innerWayEffectRulesFor([...ways], 17, "bellstrikeSplendor"),
    initialBuffs: [
      { name: "Shield", stack: 1, appliedAt: 0 },
      ...(gale ? [{ name: "EndlessGale", stack: 1, appliedAt: 0 }] : []),
      ...(surge ? [{ name: "EnergySurge", stack: 1, appliedAt: 0 }] : []),
    ],
    initialResources: { Endurance: 200, Vitality: 100 },
    resourceMaximums: { Endurance: 200, Vitality: 100 },
  })
}

describe("Ghostly Step Endurance costs", () => {
  it.each(["GhostlySteps", "GhostlyStepsUmbra"])("combines %s with Gale additively for charge and release", skill => {
    const rows = run(skill, true)
    const cast = rows.at(-1)!
    expect(cast.resourceConsumption?.Endurance).toBeCloseTo(14, 8)
    expect(cast.baseResourceConsumption?.Endurance).toBeCloseTo(20, 8)
    expect(rows[0].timelineResourceSummary?.Endurance.consumed).toBeCloseTo(15.12 + 14 - 0.0012, 8)
  })
  it("discounts charge and release without Gale", () => {
    const rows = run("GhostlyStepsUmbra", false)
    expect(rows.at(-1)!.resourceConsumption?.Endurance).toBeCloseTo(18, 8)
    expect(rows[0].timelineResourceSummary?.Endurance.consumed).toBeCloseTo(21.6 + 18 - 0.0012, 8)
  })
  it("discounts the instant cast cost without crediting it as damage payment", () => {
    const cast = run("GhostlyStepsUmbra", true, true).at(-1)!
    expect(cast.effectiveCastTime).toBeCloseTo(0.85, 8)
    expect(cast.resourceConsumption?.Endurance).toBeCloseTo(14.63, 8)
    expect(cast.baseResourceConsumption?.Endurance).toBeCloseTo(20, 8)
  })
  it("stops discounting when Mystery expires", () => {
    const rows = run("GhostlyStepsUmbra", true, false, 30)
    expect(rows.at(-1)!.resourceConsumption?.Endurance).toBeCloseTo(16, 8)
    expect(rows[0].timelineResourceSummary?.Endurance.consumed).toBeCloseTo(17.28 + 16 - 0.0012, 8)
  })
})
