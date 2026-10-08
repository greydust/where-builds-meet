import { describe, expect, it } from "vitest"

import {
  buildRotationTimeline,
  type EditableObject,
  type TimelineBuildInput,
  type TimelineRow,
} from "@/calculations/rotationTimeline"

function fixture(duration = 4, resetOnRefresh = false, tickOnExpire = true): TimelineBuildInput {
  const dot = {
    name: "Test burn",
    duration: 2,
    maxStack: 1,
    refresh: true,
    tags: ["DOT"],
    periodic: {
      interval: 1,
      firstTick: 0.5,
      resetOnRefresh,
      tickOnExpire,
      action: [{ type: "damage", phyCoef: 1, time: 0 }],
    },
  }
  return {
    rotation: {
      name: "Periodic refresh",
      steps: [
        { type: "skill", skill: "Apply" },
        { type: "skill", skill: "Refresh" },
        { type: "event", event: "BattleEnd", startTime: 5 },
      ],
    },
    skills: {
      Apply: { castTime: 0.25, action: [{ type: "apply", target: "target", value: "Burn", time: 0 }] },
      Refresh: {
        castTime: 4.75,
        action: [
          { type: "apply", target: "target", value: "Burn", duration, time: 0 },
          { type: "apply", target: "self", value: "Boost", time: 0.5 },
        ],
      },
    },
    dots: { Burn: dot },
    effectDefinitions: { Burn: dot, Boost: { duration: 5, effect: [{ dmgBonus: 0.5 }] } },
    eventDefinitions: { BattleEnd: { action: [] } },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
}

function observe(input: TimelineBuildInput) {
  let pending: TimelineRow[] = []
  const rows = buildRotationTimeline(input, undefined, (_input, liveRows) => (row, actionIndex) => {
    if (row.step.skill === "Refresh" && actionIndex === 0)
      pending = liveRows.filter(candidate => candidate.kind === "dot")
    return undefined
  })
  return { pending, ticks: rows.filter(row => row.kind === "dot") }
}

describe("periodic refresh", () => {
  it("retains tick rows and cadence, extends expiry, updates ownership, and reads buffs at tick time", () => {
    const { pending, ticks } = observe(fixture())
    expect(ticks.map(row => row.startTime)).toEqual([0.5, 1.5, 2.5, 3.5])
    expect(ticks[0]).toBe(pending[0])
    expect(ticks[1]).toBe(pending[1])
    expect(ticks.every(row => row.sourceRowId === "rotation-1")).toBe(true)
    expect(ticks[0].actionStates[0].buffs.has("Boost")).toBe(false)
    expect(ticks[1].actionStates[0].buffs.has("Boost")).toBe(true)
  })

  it.each([true, false])("reconciles a shortened expiry with tickOnExpire=%s", tickOnExpire => {
    const { pending, ticks } = observe(fixture(1.25, false, tickOnExpire))
    expect(ticks.map(row => row.startTime)).toEqual(tickOnExpire ? [0.5, 1.5] : [0.5])
    expect(ticks[0]).toBe(pending[0])
  })

  it("rebuilds rows and restarts cadence when resetOnRefresh is true", () => {
    const { pending, ticks } = observe(fixture(4, true))
    expect(ticks.map(row => row.startTime)).toEqual([0.75, 1.75, 2.75, 3.75])
    expect(ticks.some(row => pending.includes(row))).toBe(false)
  })

  it("retains an indefinite cadence without duplicating successor wakeups", () => {
    const input = fixture()
    delete input.effectDefinitions.Burn.duration
    const refresh = input.skills.Refresh.action!
    ;(refresh[0] as EditableObject).duration = undefined
    refresh.push({ type: "apply", target: "target", value: "Burn", time: 0.5 })
    const { pending, ticks } = observe(input)
    expect(ticks.map(row => row.startTime)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5])
    expect(ticks[0]).toBe(pending[0])
  })

  it("rebuilds future actions when a refresh changes the periodic definition", () => {
    const input = fixture()
    input.skills.Refresh.action!.unshift({ type: "apply", target: "self", value: "Changed", time: 0 })
    input.effectDefinitions.Changed = { duration: 5 }
    input.innerWayRules.push({
      effect: {},
      source: "ChangedBurn",
      tier: 0,
      requirement: [{ target: "buff", value: "Changed" }],
      target: "Burn",
      modify: { periodic: { interval: 0.5 } },
    })
    const ticks = buildRotationTimeline(input).filter(row => row.kind === "dot")
    expect(ticks.map(row => row.startTime)).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4])
  })
})
