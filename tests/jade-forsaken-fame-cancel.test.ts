import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"

describe("Forsaken Fame damage cancel", () => {
  it.each(["Deflect", "EmeraldBarrier", "PeaksSpringlessSilenceCancel"])(
    "resolves damage, Lingering Bone and Endurance before %s starts",
    skill => {
      const rows = buildRotationTimeline({
        rotation: {
          name: "FF cancel",
          ping: 0,
          steps: [
            { type: "skill", skill: "ForsakenFameCancel" },
            { type: "skill", skill },
          ],
        },
        skills: allSkillDefinitions,
        effectDefinitions,
        eventDefinitions: {},
        dots: {},
        setupEffects: [],
        innerWayRules: [],
        innerWayConditions: [],
        weapons: ["vernalUmbrella", "inkwellFan"],
        initialResources: { Endurance: 0 },
        resourceMaximums: { Endurance: 100 },
      })
      const cancel = rows.find(row => row.step.skill === "ForsakenFameCancel")!
      const next = rows.find(row => row.step.skill === skill)!
      expect(next.startTime - cancel.startTime).toBeCloseTo(1.19, 9)
      expect(cancel.actions.filter(action => action.type === "damage")).toHaveLength(1)
      expect(cancel.actionStates[0]).toBeDefined()
      expect(next.debuffs.has("LingeringBone")).toBe(true)
      expect(next.resources.Endurance).toBeGreaterThanOrEqual(10)
    },
  )
})
