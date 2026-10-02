import { describe, expect, it } from "vitest"

import buffsJson from "../data/buff/stonesplit-strength.json"
const buffs = asEffectDefinitions(buffsJson)
import generalJson from "../data/skill/general.json"
const general = asSkillRecords(generalJson)
import mightJson from "../data/skill/thundercry-blade.json"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
const might = asSkillRecords(mightJson)
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"
import { exportRotationEntries, mergeImportedRotationEntries } from "../src/rotationTransfer"

const cast = (duration: number): RotationStep => ({ type: "skill", skill: "Defense", duration })
const attack = (startTime: number): RotationStep => ({ type: "event", event: "TakeDamage", startTime, damage: 200 })
const end = (startTime: number): RotationStep => ({ type: "event", event: "BattleEnd", startTime })
const input = (steps: RotationStep[]): TimelineBuildInput => ({
  rotation: { name: "Defense", steps },
  skills: { ...general, ...might, Probe: { castTime: 0, action: [{ type: "damage", time: 0 }] } },
  eventDefinitions: { TakeDamage: { action: [{ type: "takeDamage", time: 0 }] }, BattleEnd: { action: [] } },
  dots: {},
  effectDefinitions: buffs,
  innerWayConditions: ["ExquisiteSceneryT0"],
  innerWayRules: [],
  setupEffects: [],
  weapons: ["thundercry", "stormbreaker"],
  maxHP: 10000,
})
const skillRows = (rows: ReturnType<typeof buildRotationTimeline>, skill: string) =>
  rows.filter(row => row.step.type === "skill" && row.step.skill === skill)

describe("held Defense", () => {
  it("protects through the hold end and excludes attacks during the preceding ping gap", () => {
    const data = input([cast(0.8), attack(0.02), attack(0.05), attack(0.84), attack(0.85), end(1)])
    data.rotation.ping = 40
    const rows = buildRotationTimeline(data)
    expect(
      rows.flatMap(row => row.actions.filter(action => action.type === "takeDamage").map(action => action.damage)),
    ).toEqual([200, 0, 0, 200])
    expect(skillRows(rows, "DefenseSuccess").map(row => row.startTime)).toEqual([0.05, 0.84])
  })
  it("blocks only within its entered duration and rewards each hit, with Riposte before Cadence", () => {
    const rows = buildRotationTimeline(
      input([cast(1.1), { type: "skill", skill: "Probe" }, attack(1), attack(1), attack(1.2), end(2)]),
    )
    expect(skillRows(rows, "Defense")[0].effectiveCastTime).toBe(1.1)
    expect(
      rows.flatMap(row => row.actions.filter(action => action.type === "takeDamage").map(action => action.damage)),
    ).toEqual([0, 0, 200])
    const successes = skillRows(rows, "DefenseSuccess")
    expect(successes).toHaveLength(2)
    expect(successes.map(row => row.startTime)).toEqual([1, 1])
    expect(successes[0].actionStates[0].buffs.size).toBe(0)
    expect(Array.from(successes[0].actionStates[1].buffs.values()).map(effect => effect.name)).toContain("Riposte")
    const state = skillRows(rows, "Probe")[0]
    expect(state.buffs.get("Cadence")?.stack).toBe(2)
    expect(state.buffs.has("Riposte")).toBe(true)
    expect(state.currentHP).toBe(10000)
  })
  it("grants no rewards without an attack or Exquisite Scenery", () => {
    const noAttack = buildRotationTimeline(input([cast(1), end(2)]))
    expect(skillRows(noAttack, "DefenseSuccess")).toHaveLength(0)
    const data = input([cast(1), attack(0.5), { type: "skill", skill: "Probe" }, end(2)])
    data.innerWayConditions = []
    const rows = buildRotationTimeline(data)
    expect(skillRows(rows, "Probe")[0].buffs.size).toBe(0)
    expect(skillRows(rows, "Probe")[0].currentHP).toBe(10000)
  })
  it.each([0, 40, 100])(
    "starts after %s ms ping and holds the exact requested duration without attack alignment",
    ping => {
      const data = input([cast(0.8), { type: "skill", skill: "Probe" }, attack(0.4), end(2)])
      data.rotation.ping = ping
      const rows = buildRotationTimeline(data)
      expect(skillRows(rows, "Defense")[0].startTime).toBeCloseTo(ping / 1000)
      expect(skillRows(rows, "Defense")[0].effectiveCastTime).toBeCloseTo(0.8)
      expect(skillRows(rows, "Probe")[0].startTime).toBeCloseTo(0.8 + ping / 500)
    },
  )
  it.each([false, true])("converts stored stacks on Riposte cooldown, including T4=%s", tier4 => {
    const cooldown = tier4 ? 5 : 10
    const data = input([cast(1.1), attack(1), attack(1), end(3 * cooldown + 2)])
    if (tier4) {
      data.innerWayConditions.push("ExquisiteSceneryT4")
      data.innerWayRules = [
        // The tier only lowers Riposte's cooldown, so it carries a modify rule and the
        // empty effect sheet the app's own inner-way builder gives a rule without one.
        { source: "ExquisiteScenery", tier: 4, target: "Riposte", modify: { cooldown: 5 }, effect: {} },
      ]
    }
    const rows = buildRotationTimeline(data)
    expect(skillRows(rows, "RiposteTrigger").map(row => row.startTime)).toEqual(tier4 ? [1, 6, 11] : [1, 11])
  })
  it("blocks further attacks during cooldown without consuming their new Cadence stack", () => {
    const rows = buildRotationTimeline(
      input([cast(1.1), attack(1), cast(1.1), attack(2), { type: "skill", skill: "Probe" }, end(3)]),
    )
    expect(skillRows(rows, "Probe")[0].buffs.get("Cadence")?.stack).toBe(2)
    expect(skillRows(rows, "RiposteTrigger")).toHaveLength(1)
  })
  it("reduces Avalanche timing and consumes Riposte when the cast starts", () => {
    const rows = buildRotationTimeline(
      input([cast(1.1), attack(1), { type: "skill", skill: "Avalanche" }, { type: "skill", skill: "Probe" }, end(5)]),
    )
    const avalanche = skillRows(rows, "Avalanche")[0]
    expect(avalanche.effectiveCastTime).toBeCloseTo(1.545)
    const hits = avalanche.actions.filter(action => action.type === "damage")
    expect(hits[0].time).toBeCloseTo(0.318)
    expect(hits[1].time).toBeCloseTo(1)
    expect(skillRows(rows, "Probe")[0].buffs.has("Riposte")).toBe(false)
  })
  it("preserves duration through export/import and migrates the old Defense action anchor", () => {
    const rotation = input([
      { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0.4 },
      cast(1.234),
    ]).rotation
    rotation.start = { step: 1, action: 0 }
    const exported = exportRotationEntries([{ id: "defense", rotation, martialArts: ["thundercry", "stormbreaker"] }])
    const imported = mergeImportedRotationEntries([], JSON.parse(exported)).entries[0].rotation
    expect(imported.steps[1]).toEqual(cast(1.234))
    expect(imported.start).toEqual({ step: 1 })
    expect(imported.steps[0]).toMatchObject({ before: { action: "start" } })
  })
})
