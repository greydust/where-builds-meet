import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"

describe("Colorful Phoenix refill threshold", () => {
  it.each([
    ["colorfulphoenix2", 0.53, 97.61],
    ["ColorfulPhoenix35Blossoms", 0.63, 100],
  ] as const)("%s resolves the refill and stops after two damage hits", (skill, duration, blossoms) => {
    const rows = buildRotationTimeline({
      rotation: {
        name: "Phoenix refill",
        ping: 0,
        steps: [
          { type: "skill", skill },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: { ...allSkillDefinitions, Observe: { castTime: 0.2, action: [] } },
      effectDefinitions,
      eventDefinitions: {},
      dots: {},
      setupEffects: [],
      innerWayRules: [],
      innerWayConditions: [],
      weapons: ["vernalUmbrella", "inkwellFan"],
      initialResources: { Blossoms: 65.61 },
      resourceMaximums: { Blossoms: 100 },
    })
    const cast = rows.find(row => row.step.skill === skill)!
    const observe = rows.find(row => row.step.skill === "Observe")!
    expect(observe.startTime - cast.startTime).toBeCloseTo(duration, 9)
    expect(observe.resources.Blossoms).toBeCloseTo(blossoms, 9)
    expect(cast.actions.filter(action => action.type === "damage")).toHaveLength(2)
    expect(Math.max(...cast.actions.map(action => Number(action.time ?? 0)))).toBeLessThanOrEqual(duration)
  })
})
