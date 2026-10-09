import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"

function input(): TimelineBuildInput {
  return {
    rotation: { name: "Prepared setup", steps: [{ type: "skill", skill: "Driver" }] },
    skills: {
      Driver: {
        castTime: 2,
        action: [
          { type: "apply", target: "self", value: "Bonus", time: 0 },
          { type: "damage", phyCoef: 1, time: 0.1 },
          { type: "consume", target: "self", value: "Gate", stack: "all", time: 0.5 },
          { type: "apply", target: "self", value: "Bonus", time: 1 },
          { type: "damage", phyCoef: 1, time: 1.1 },
        ],
      },
    },
    initialBuffs: [{ name: "Gate" }],
    effectDefinitions: { Gate: {}, Bonus: { duration: 2, refresh: true } },
    setupEffects: [
      { target: "Bonus", modify: { duration: 4 } },
      { target: "Bonus", requirement: [{ target: "self", value: "Gate" }], modify: { duration: 1 } },
    ],
    innerWayRules: [],
    innerWayConditions: [],
    weapons: [],
    dots: {},
    eventDefinitions: {},
  }
}

describe("simulation-start trigger preparation", () => {
  it("keeps modifier order across fixed and live requirements", () => {
    const data = input()
    data.innerWayRules = [{ source: "Fixed", tier: 6, effect: {}, target: "Bonus", modify: { duration: 3 } }]
    const first = buildRotationTimeline(data)[0]
    expect(first.actionStates[1].buffs.get("Bonus")?.expiresAt).toBe(3)
    expect(first.actionStates[4].buffs.get("Bonus")?.expiresAt).toBe(4)
    data.innerWayRules = []
    const second = buildRotationTimeline(data)[0]
    expect(second.actionStates[1].buffs.get("Bonus")?.expiresAt).toBe(1)
    expect(second.actionStates[4].buffs.get("Bonus")?.expiresAt).toBe(5)
  })

  it("reprepares fixed definitions after setup changes without modifying input definitions", () => {
    const data = input()
    data.setupEffects = [{ target: "Bonus", modify: { duration: 4 } }]
    expect(buildRotationTimeline(data)[0].actionStates[1].buffs.get("Bonus")?.expiresAt).toBe(4)
    data.setupEffects = [{ target: "Bonus", modify: { duration: 6 } }]
    expect(buildRotationTimeline(data)[0].actionStates[1].buffs.get("Bonus")?.expiresAt).toBe(6)
    expect(data.effectDefinitions.Bonus.duration).toBe(2)
  })

  it("preserves action order and checks later trigger ownership and requirements against live state", () => {
    const data = input()
    data.effectDefinitions.Marker = {}
    data.effectDefinitions.Wrong = {}
    data.effectDefinitions.Gate.trigger = { event: "damage", action: { type: "apply", target: "self", value: "Wrong" } }
    data.setupEffects = [
      {
        trigger: {
          event: "damage",
          action: [
            { type: "consume", target: "self", value: "Gate", stack: "all" },
            { type: "apply", target: "self", value: "Marker" },
          ],
        },
      },
    ]
    data.innerWayRules = [
      {
        source: "Live",
        tier: 1,
        effect: {},
        requirement: [{ target: "self", value: "Gate" }],
        trigger: { event: "damage", action: { type: "apply", target: "self", value: "Wrong" } },
      },
    ]
    const after = buildRotationTimeline(data)[0].actionStates[4].buffs
    expect(after.has("Gate")).toBe(false)
    expect(after.has("Marker")).toBe(true)
    expect(after.has("Wrong")).toBe(false)
  })
})
