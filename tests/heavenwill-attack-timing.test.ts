import { assert, describe, expect, it } from "vitest"

import { defaultSkillMaps } from "@/application/gameData/skills"

import buffs from "../data/buff/bamboocut-kite.json"

const skills = defaultSkillMaps.Heavenwill
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"
const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const delay = (duration: number): RotationStep => ({ type: "event", event: "Delay", duration })
const a4 = "RighteousReign4thHit",
  a5 = "RighteousReign5thHit"
function build(steps: RotationStep[], ping = 40, setupEffects: TimelineBuildInput["setupEffects"] = []) {
  const input: TimelineBuildInput = {
    rotation: { name: "Gauntlet timing", ping, steps },
    skills: { ...skills, Observe: { castTime: 0, action: [] } },
    eventDefinitions: {},
    effectDefinitions: buffs,
    dots: {},
    weapons: [],
    setupEffects,
    innerWayConditions: [],
    innerWayRules: [],
  }
  return buildRotationTimeline(input)
}
const find = (rows: ReturnType<typeof build>, skill: string) =>
  rows.filter(row => row.step.type === "skill" && row.step.skill === skill)
const hits = (row: ReturnType<typeof build>[number]) =>
  row.actions.filter(action => action.type === "damage").map(action => Number(action.time))

describe("Heavenwill attack timings", () => {
  it.each([
    ["AllUnderJustice", 1.018, [0.3, 0.435, 0.602, 0.935]],
    ["CelestialMandate", 1.4, [0.45, 0.6, 0.683, 0.833, 1.2]],
    ["HeavenwillDeclared", 0.625, [0.403, 0.471]],
    ["WickedDefiance", 0.9, [0.216, 0.66]],
    ["RighteousReign1stHit", 0.466, [0.21]],
    ["RighteousReign2ndHit", 0.462, [0.148, 0.32]],
    ["RighteousReign3rdHit", 0.333, [0.25]],
    [a4, 0.417, [0.194]],
    [a5, 0.512, [0.205, 0.423]],
    ["RighteousReign6thHit", 0.923, [0.256]],
    ["RighteousReign6thHitCancel", 0.256, [0.256]],
  ] as const)(
    "%s schedules hits and the next cast at the selected interrupt/cancel boundary",
    (skill, duration, hitTimes) => {
      const rows = build([cast(skill), cast("Observe")])
      const row = find(rows, skill)[0]
      expect(row.startTime).toBeCloseTo(0.04)
      expect(row.effectiveCastTime).toBeCloseTo(duration)
      expect(hits(row)).toEqual(hitTimes)
      expect(find(rows, "Observe")[0].startTime).toBeCloseTo(0.04 + duration + 0.04)
      for (const [index, action] of row.actions.entries())
        if (action.type === "damage")
          assert(row.actionStates[index] !== undefined, "Damage action must have a resolved state.")
      if (skill.startsWith("RighteousReign6"))
        assert(
          Math.abs(find(rows, "LightAttackFalcon")[0].startTime - (row.startTime + 0.256)) < 0.005,
          "Cancel follow-up must start 0.256s after the cast.",
        )
    },
  )
  it("applies A4 at cast end and snapshots the fast A5 timings before consuming the marker", () => {
    const rows = build([cast(a4), cast(a5), cast(a5), cast("Observe")])
    const fourth = find(rows, a4)[0]
    const [fast, normal] = find(rows, a5)
    expect(fourth.actionStates[0].buffs.has("HeavenwillGauntletsA4")).toBe(false)
    expect(fast.buffs.get("HeavenwillGauntletsA4")?.appliedAt).toBeCloseTo(fourth.startTime + 0.417)
    expect(fast.buffs.get("HeavenwillGauntletsA4")?.expiresAt).toBeCloseTo(fourth.startTime + 1.417)
    expect(fast.effectiveCastTime).toBeCloseTo(0.41)
    expect(hits(fast)[0]).toBeCloseTo(0.115)
    expect(hits(fast)[1]).toBeCloseTo(0.32)
    expect(fast.actionStates[0].buffs.has("HeavenwillGauntletsA4")).toBe(false)
    expect(normal.effectiveCastTime).toBeCloseTo(0.512)
    expect(hits(normal)).toEqual([0.205, 0.423])
    expect(normal.startTime).toBeCloseTo(fast.startTime + 0.41 + 0.04)
  })
  it.each([
    [0.95, 0.41],
    [0.96, 0.512],
    [1.1, 0.512],
  ])("expires the marker across a %ss delay, including ping", (gap, duration) => {
    const rows = build([cast(a4), delay(gap), cast(a5), cast("Observe")])
    expect(find(rows, a5)[0].effectiveCastTime).toBeCloseTo(duration)
  })
  it("does not consume the marker or speed up unrelated attacks, and caps reapplication at one stack", () => {
    const rows = build([cast(a4), cast(a4), cast("RighteousReign3rdHit"), cast(a5), cast("Observe")])
    const third = find(rows, "RighteousReign3rdHit")[0]
    expect(third.buffs.get("HeavenwillGauntletsA4")?.stack).toBe(1)
    expect(third.effectiveCastTime).toBeCloseTo(0.333)
    expect(find(rows, a5)[0].effectiveCastTime).toBeCloseTo(0.41)
  })
})

it("Wicked Defiance resolves two hit triggers and grants Heaven's Will after its final hit", () => {
  const rows = build([cast("WickedDefiance"), cast("Observe")], 40, [
    { trigger: { event: "damage", action: { type: "addResource", value: "HitCount", amount: 1 } } },
  ])
  const skill = find(rows, "WickedDefiance")[0]
  expect(skill.actionStates[1].resources.HitCount).toBe(1)
  expect(skill.actionStates[1].resources.HeavensWill ?? 0).toBe(0)
  expect(find(rows, "Observe")[0].resources.HitCount).toBe(2)
  expect(find(rows, "Observe")[0].resources.HeavensWill).toBeCloseTo(0.1)
  expect(skill.startTime + Number(skill.actions[2].time)).toBeCloseTo(0.7)
})
it.each([false, true])("Celestial Mandate grants Heaven's Will on its final hit with Unity=%s", unity => {
  const setupEffects: TimelineBuildInput["setupEffects"] = unity
    ? [
        {
          trigger: {
            event: "skillStart",
            requirement: [{ target: "skillTag", value: "CelestialMandate" }],
            action: { type: "apply", target: "self", value: "HeavensUnity" },
          },
        },
      ]
    : []
  const rows = build([cast("CelestialMandate"), cast("Observe")], 40, setupEffects)
  const row = find(rows, "CelestialMandate")[0]
  expect(row.actionStates[4].resources.HeavensWill ?? 0).toBe(0)
  expect(row.actionStates[6].resources.HeavensWill).toBeCloseTo(0.1)
  expect(find(rows, "Observe")[0].resources.HeavensWill).toBeCloseTo(unity ? 0.3 : 0.1)
  expect(row.actions.filter(action => action.type === "addResource").every(action => action.time === 1.2)).toBe(true)
})
