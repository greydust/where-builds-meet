import morale from "@gamedata/innerway/morale-chant.json"
import { describe, expect, it } from "vitest"

import { effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline, type EditableObject } from "@/calculations/rotationTimeline"
import { weaponSetDefinitions } from "@/gear"

import { rowWithId } from "./helpers/timelineRows"

describe("prepull hit buffs", () => {
  it.each([false, true])("gates weapon sets and Morale Chant at the hit time (action anchor=%s)", actionAnchor => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Prepull hit buffs",
        start: actionAnchor ? { step: 0, action: 2 } : { step: 1 },
        steps: [
          { type: "skill", skill: "Prepare" },
          { type: "skill", skill: "Hit" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: {
        Prepare: {
          castTime: 3,
          tags: ["DirectDamage"],
          action: [
            { type: "apply", target: "self", value: "Shield", time: 0 },
            { type: "damage", phyCoef: 1, time: 0.2 },
            { type: "damage", phyCoef: 1, time: 0.8 },
          ],
        },
        Hit: { castTime: 1, tags: ["DirectDamage"], action: [{ type: "damage", phyCoef: 1, time: 0 }] },
        Observe: { castTime: 1, action: [] },
      },
      effectDefinitions,
      eventDefinitions: {},
      dots: {},
      weapons: [],
      innerWayConditions: [],
      innerWayRules: morale.effect.MoraleChantT0.trigger.map(trigger => ({
        trigger,
        effect: {},
        source: "MoraleChant",
        tier: 0,
      })),
      setupEffects: [weaponSetDefinitions.Cleftpeak.options[4].effect as EditableObject],
    })
    const beforeHit = rowWithId(timeline, "rotation-1")
    const afterHit = rowWithId(timeline, "rotation-2")
    const stack = (row: typeof beforeHit, name: string) =>
      [...row.buffs.values()].find(effect => effect.name === name)?.stack ?? 0

    expect(stack(beforeHit, "Shield")).toBe(1)
    for (const name of ["Cleftpeak", "YiRiver"]) {
      expect(stack(beforeHit, name)).toBe(actionAnchor ? 1 : 0)
      expect(stack(afterHit, name)).toBe(actionAnchor ? 2 : 1)
    }
  })
})
