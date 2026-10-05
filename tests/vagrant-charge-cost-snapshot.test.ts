import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline, type SkillRecord } from "@/calculations/rotationTimeline"

function run(galeExpiresAt: number | undefined, gainGaleDuringCharge = false) {
  const ways = [
    { innerWay: "SwordMorph", tier: "T4" },
    { innerWay: "MountainsMight", tier: "T0" },
    { innerWay: "BattleAnthem", tier: "T4" },
  ] as const
  const skills: Record<string, SkillRecord> = {
    ...allSkillDefinitions,
    Prepare: {
      castTime: 0,
      action:
        galeExpiresAt === undefined
          ? []
          : [{ type: "apply", target: "self", value: "EndlessGale", duration: galeExpiresAt, time: 0 }],
    },
  }
  if (gainGaleDuringCharge) {
    skills.VagrantSwordCharge = {
      ...skills.VagrantSwordCharge,
      action: [{ type: "apply", target: "self", value: "EndlessGale", time: 0.4 }],
    }
  }
  const rows = buildRotationTimeline({
    rotation: {
      name: "Charge cost snapshot",
      ping: 0,
      steps: [
        { type: "skill", skill: "Prepare" },
        { type: "skill", skill: "VagrantSword2" },
      ],
    },
    skills,
    effectDefinitions,
    eventDefinitions: {},
    dots: {},
    setupEffects: [],
    weapons: ["namelessSword", "namelessSpear"],
    innerWayConditions: [...innerWayConditionsFor([...ways], undefined, "bellstrikeSplendor")],
    innerWayRules: innerWayEffectRulesFor([...ways], 17, "bellstrikeSplendor"),
    initialBuffs: [{ name: "Shield", stack: 1, appliedAt: 0 }],
    initialResources: { Endurance: 200 },
    resourceMaximums: { Endurance: 200 },
    resourceSpendRegenDelay: { Endurance: 1.2 },
  })
  return { ...rows[1], timelineResourceSummary: rows[0].timelineResourceSummary }
}

describe("Vagrant charge cost snapshot", () => {
  it.each([
    { expiry: 0.1, charge: 26.4, release: 20 },
    { expiry: 0.2, charge: 26.4, release: 20 },
    { expiry: 0.8, charge: 19.2, release: 20 },
    { expiry: 1.4, charge: 19.2, release: 20 },
    { expiry: 1.5, charge: 19.2, release: 16 },
  ])("snapshots charge separately from release when Gale expires at $expiry", ({ expiry, charge, release }) => {
    const row = run(expiry)
    expect(row.resourceConsumption?.Endurance).toBe(release)
    // Only the 1.2-second charge drains; its tiny natural regeneration offsets 0.0012.
    expect(row.timelineResourceSummary?.Endurance.consumed).toBeCloseTo(charge + release - 0.0012, 8)
    expect(row.baseResourceConsumption?.Endurance).toBe(20)
  })

  it("does not retroactively discount a charge when Gale arrives, but discounts its release", () => {
    const row = run(undefined, true)
    expect(row.resourceConsumption?.Endurance).toBe(16)
    expect(row.timelineResourceSummary?.Endurance.consumed).toBeCloseTo(26.4 + 16 - 0.0012, 8)
  })
})
