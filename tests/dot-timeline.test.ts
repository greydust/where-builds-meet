import { describe, expect, it } from "vitest"

import type { EditableObject } from "@/calculations/rotationTimeline"

import { buildRotationTimeline } from "../src/calculations/rotationTimeline"

describe("periodic effect lifecycle", () => {
  function build(followUp: EditableObject, periodicTags: string[] = ["DOT"]) {
    const pulse = {
      duration: 3,
      maxStack: 1,
      refresh: false,
      tags: periodicTags,
      periodic: { interval: 1, firstTick: 1, resetOnRefresh: false, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    }
    return buildRotationTimeline({
      rotation: {
        name: "Periodic lifecycle",
        steps: [
          { type: "skill", skill: "Apply" },
          { type: "skill", skill: "FollowUp" },
          { type: "event", event: "BattleEnd", startTime: 7 },
        ],
      },
      skills: {
        Apply: {
          name: "Apply",
          castTime: 1,
          tags: [],
          action: [{ type: "apply", target: "target", value: "Pulse", time: 0 }],
        },
        FollowUp: { name: "FollowUp", castTime: 1, tags: [], action: [followUp] },
      },
      eventDefinitions: { BattleEnd: { name: "Battle End", castTime: 0, action: [] } },
      effectDefinitions: { Pulse: pulse },
      dots: periodicTags.includes("DOT") ? { Pulse: pulse } : {},
      innerWayRules: [],
      innerWayConditions: [],
      setupEffects: [],
      weapons: [],
    })
  }

  it("extends expiration without resetting cadence and transfers only future tick attribution", () => {
    const timeline = build({ type: "extend", target: "target", value: "Pulse", duration: 3, time: 0.5 })
    const ticks = timeline.filter(row => row.kind === "dot")
    expect(ticks.map(row => row.startTime)).toEqual([1, 2, 3, 4, 5, 6])
    expect(ticks[0].sourceRowId).toBe("rotation-0")
    expect(ticks.slice(1).every(row => row.sourceRowId === "rotation-1")).toBe(true)
  })

  it.each([{ tags: ["DOT"] }, { tags: [] }])(
    "does not duplicate or refresh periodic applications with reapply:false (%j)",
    ({ tags }) => {
      const timeline = build({ type: "apply", target: "target", value: "Pulse", reapply: false, time: 0.5 }, tags)
      const ticks = timeline.filter(row => row.kind === (tags.includes("DOT") ? "dot" : "periodic"))
      expect(ticks.map(row => row.startTime)).toEqual([1, 2, 3])
      expect(ticks.every(row => row.sourceRowId === "rotation-0")).toBe(true)
    },
  )

  it("cancels future ticks when the effect is consumed without erasing resolved ticks", () => {
    const ticks = build({ type: "consume", target: "target", value: "Pulse", stack: "all", time: 0.5 }).filter(
      row => row.kind === "dot",
    )
    expect(ticks.map(row => row.startTime)).toEqual([1])
  })
})
