import { describe, it, expect } from "vitest"

import buffsJson from "../data/buff/bamboocut-wind.json"
const buffs = asEffectDefinitions(buffsJson)
import events from "../data/event.json"
import echoes from "../data/innerway/echoes-of-oblivion.json"
import skillsJson from "../data/skill/infernal-twinblades.json"
const skills = asSkillRecords(skillsJson)
import { buildRotationTimeline, type TimelineBuildInput, type RotationStep } from "../src/calculations/rotationTimeline"
import { exportRotationEntries, mergeImportedRotationEntries, serializeRotationEntries } from "../src/rotationTransfer"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowCasting } from "./helpers/timelineRows"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
function input(steps: RotationStep[], initial = 0, times: number[] = []): TimelineBuildInput {
  return {
    rotation: { name: "Hellfire", ping: 0, steps },
    skills: {
      ...skills,
      Observe: { castTime: 0, action: [{ type: "trigger", value: "Observation", time: 0 }] },
      Observation: {
        castTime: 0,
        tags: ["Triggered"],
        action: times.map(time => ({ type: "damage", phyCoef: 1, time })),
      },
      End: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      Refill: { castTime: 0, action: [{ type: "addResource", value: "Hellfire", amount: 80, time: 0 }] },
    },
    effectDefinitions: buffs,
    dots: {},
    eventDefinitions: events,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["infernalTwinblades"],
    initialResources: { Hellfire: initial },
    resourceMaximums: { Hellfire: 80 },
  }
}
const active = (state: { buffs: ReadonlyMap<string, { name: string }> }) => state.buffs.has("Flamelash")
const observer = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.find(row => row.step.type === "skill" && row.step.skill === "Observation")!

describe("Hellfire", () => {
  it.each([false, true])(
    "applies signed timed changes, preserves the ramp, and stops Flamelash at zero (sampled=%s)",
    sampled => {
      const data = input(
        [
          cast("Observe"),
          cast("Flamelash"),
          { type: "event", event: "Delay", duration: 2 },
          { type: "event", event: "Hellfire", startTime: 0.9, amount: 100 },
          { type: "event", event: "Hellfire", startTime: 1.1, amount: -20 },
          { type: "event", event: "Hellfire", startTime: 1.2, amount: -100 },
          { type: "event", event: "Hellfire", startTime: 1.3, amount: 5.5 },
        ],
        80,
        [0.901, 1.001, 1.101, 1.201, 1.301, 2],
      )
      const rows = buildRotationTimeline(data, sampled ? () => 0.5 : undefined)
      const states = Object.values(observer(rows).actionStates)
      ;[80, 78.7, 57.35, 0, 5.5, 5.5].forEach((value, index) =>
        expect(states[index].resources.Hellfire).toBeCloseTo(value),
      )
      expect(states.map(active)).toEqual([true, true, true, false, false, false])
      expect(rows.filter(row => row.step.event === "Hellfire").map(row => row.effectiveCastTime)).toEqual([0, 0, 0, 0])
    },
  )

  it("preserves signed amounts and prepull timestamps through save and export/import", () => {
    const entry = {
      id: "hellfire-events",
      martialArts: ["infernalTwinblades"] as const,
      rotation: input([
        { type: "event", event: "Hellfire", startTime: -0.5, amount: 20.25 },
        cast("InfernalLight1"),
        { type: "event", event: "Hellfire", startTime: 1, amount: -10.5 },
      ]).rotation,
    }
    const entries = [{ ...entry, martialArts: [...entry.martialArts] }]
    const saved = JSON.parse(serializeRotationEntries(entries))
    expect(saved[0].rotation.steps).toEqual(entry.rotation.steps)
    const imported = mergeImportedRotationEntries([], JSON.parse(exportRotationEntries(entries)))
    expect(imported.entries[0].rotation.steps).toEqual(entry.rotation.steps)
  })
  it.each([false, true])(
    "drains in increasing 0.13-second ticks and ends immediately at zero (sampled=%s)",
    sampled => {
      const rows = buildRotationTimeline(
        input(
          [cast("Observe"), cast("Flamelash"), { type: "event", event: "Delay", duration: 5 }],
          80,
          [0.001, 0.129, 0.131, 0.261, 5.201, 5.331],
        ),
        sampled ? () => 0.5 : undefined,
      )
      const states = Object.values(observer(rows).actionStates)
      ;[80, 80, 79, 77.95, 1, 0].forEach((value, index) => expect(states[index].resources.Hellfire).toBeCloseTo(value))
      expect(states.map(active)).toEqual([true, true, true, true, true, false])
      const ticks = rows.filter(
        row => row.kind === "periodic" && row.actions.some(action => action.type === "consumeResource"),
      )
      expect(ticks).toHaveLength(41)
      expect(ticks[40].startTime).toBeCloseTo(5.33)
      expect(rows[0].timelineResourceSummary!.Hellfire.consumed).toBeCloseTo(80)
    },
  )
  it.each([
    "InfernalLight1",
    "InfernalLight2",
    "InfernalLight3",
    "InfernalLight4",
    "InfernalLight4Cancel",
    "InfernalFlamelashLight1",
    "InfernalFlamelashLight3",
    "InfernalFlamelashLight5",
    "InfernalFlamelashLight5Cancel",
  ])("generates ten Hellfire when all hits land: %s", skill => {
    const rows = buildRotationTimeline(input([cast(skill), cast("End")]))
    expect(rows.find(row => row.step.type === "skill" && row.step.skill === "End")!.resources.Hellfire).toBeCloseTo(10)
  })
  it("grants FA4 and Addled Mind per hit, retains canceled-hit gains, and caps at 80", () => {
    const stages = [
      "InfernalFlamelashLight2",
      "InfernalFlamelashLight4",
      "AddledMind",
      "InfernalLight1Rodent",
      "InfernalLight3Rodent",
      "InfernalLight4Rodent",
      "InfernalFlamelashLight4Rodent",
    ]
    const rows = buildRotationTimeline(input([...stages.map(cast), cast("End")]))
    expect(rowCasting(rows, "End")!.resources.Hellfire).toBeCloseTo(5 + 6.25 + 12)
    const capped = buildRotationTimeline(input([cast("AddledMind"), cast("End")], 75))
    expect(rowCasting(capped, "End")!.resources.Hellfire).toBe(80)
    expect(capped[0].timelineResourceSummary!.Hellfire.regenerated).toBe(5)
  })
  it("grants only landed hits before Battle End", () => {
    const data = input([cast("InfernalLight2"), { type: "event", event: "BattleEnd", startTime: 0.26 }])
    const rows = buildRotationTimeline(data)
    expect(rows[0].timelineResourceSummary!.Hellfire.final).toBe(5)
  })
  it("keeps the drain ramp when replenished and resets it on another activation", () => {
    const data = input(
      [
        cast("Observe"),
        cast("Flamelash"),
        cast("Refill"),
        cast("Flamelash"),
        { type: "event", event: "Delay", duration: 1 },
      ],
      80,
      [0.849, 0.851, 0.981, 1.111],
    )
    const states = Object.values(observer(buildRotationTimeline(data)).actionStates)
    ;[73.25, 80, 79, 77.95].forEach((value, index) => expect(states[index].resources.Hellfire).toBeCloseTo(value))
    // Refill alone must keep the seventh tick's accumulated cost (1.3), not restart at 1.
    data.rotation.steps.splice(3, 1)
    const refilled = Object.values(observer(buildRotationTimeline(data)).actionStates)
    expect(refilled[2].resources.Hellfire).toBeCloseTo(78.7)
  })
  it("allows editor casts below 80, ends a zero-resource activation, and never extends the rotation", () => {
    const zero = buildRotationTimeline(input([cast("Flamelash"), cast("End")]))
    expect(active(rowCasting(zero, "End")!)).toBe(false)
    const partial = buildRotationTimeline(input([cast("Flamelash"), cast("End")], 20))
    expect(active(rowCasting(partial, "End")!)).toBe(true)
    const alone = buildRotationTimeline(input([cast("Flamelash")], 80))
    expect(alone.every(row => row.startTime <= 0.85)).toBe(true)
  })
  it.each([false, true])("Echoes T3 grants one per damage hit only while Samsara is active (sampled=%s)", sampled => {
    const data = input([cast("Observe"), { type: "event", event: "Delay", duration: 1 }], 0, [0.1, 0.2, 0.3, 0.4])
    data.skills.SamsaraStart = {
      castTime: 0,
      action: [{ type: "apply", target: "self", value: "Samsara", duration: 0.25, time: 0 }],
    }
    data.rotation.steps.unshift(cast("SamsaraStart"))
    data.innerWayRules = [
      { source: "EchoesOfOblivion", tier: 3, effect: {}, trigger: echoes.effect.EchoesOfOblivionT3.trigger[0] },
    ]
    const rows = buildRotationTimeline(data, sampled ? () => 0.5 : undefined)
    expect(Object.values(observer(rows).actionStates).map(state => state.resources.Hellfire)).toEqual([0, 1, 2, 2])
    expect(rows[0].timelineResourceSummary!.Hellfire.final).toBe(2)
  })
})
