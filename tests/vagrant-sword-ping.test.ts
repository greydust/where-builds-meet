import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"

describe("Vagrant Sword latency", () => {
  it.each([
    { name: "single wave", buffs: [], tiers: [], hits: 1 },
    { name: "three waves", buffs: ["Shield"], tiers: ["SwordMorphT0"], hits: 3 },
    { name: "Energy Surge", buffs: ["EnergySurge"], tiers: ["SwordMorphT0"], hits: 3 },
  ])("ignores ping throughout $name", ({ buffs, tiers, hits }) => {
    const run = (ping: number) =>
      buildRotationTimeline({
        rotation: {
          name: "Vagrant latency",
          ping,
          steps: [
            { type: "skill", skill: "VagrantSword2" },
            { type: "skill", skill: "VagrantSword2" },
          ],
        },
        skills: allSkillDefinitions,
        effectDefinitions,
        eventDefinitions: {},
        dots: {},
        weapons: ["namelessSword", "namelessSpear"],
        setupEffects: [],
        innerWayConditions: tiers,
        innerWayRules: [],
        initialBuffs: buffs.map(name => ({ name, stack: 1, appliedAt: 0 })),
      })
    const timing = (rows: ReturnType<typeof run>) =>
      rows.map(row => ({
        start: row.startTime,
        duration: row.effectiveCastTime,
        actions: row.actions.map(action => ({ type: action.type, time: action.time })),
      }))
    const baseline = run(0)
    expect(baseline[0].actions.filter(action => action.type === "damage")).toHaveLength(hits)
    expect(baseline[0].startTime).toBe(0)
    expect(baseline[1].startTime).toBeCloseTo(baseline[0].effectiveCastTime)
    for (const ping of [40, 200]) expect(timing(run(ping))).toEqual(timing(baseline))
  })
})
