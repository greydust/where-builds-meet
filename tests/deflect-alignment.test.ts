import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { migrateAutomaticDelays } from "@/rotationEditing"

import general from "../data/skill/general.json"
import { asSkillRecords } from "./helpers/shippedData"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const attack = (startTime: number): RotationStep => ({ type: "event", event: "TakeDamage", startTime, damage: 200 })
const end = (startTime: number): RotationStep => ({ type: "event", event: "BattleEnd", startTime })
function input(steps: RotationStep[]): TimelineBuildInput {
  return {
    rotation: { name: "Deflect alignment", ping: 40, steps },
    skills: asSkillRecords({ ...general, Lead: { castTime: 1, ignorePing: true, action: [] } }),
    eventDefinitions: {
      TakeDamage: { action: [{ type: "takeDamage", time: 0 }] },
      BattleEnd: { action: [] },
      Buff: { action: [{ type: "apply", target: "self", time: 0 }] },
    },
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    maxHP: 10000,
  }
}
const successful = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.filter(row => row.step.type === "skill" && row.step.skill === "DeflectSuccessful")
const damage = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.flatMap(row => row.actions.filter(action => action.type === "takeDamage").map(action => action.damage))

describe("Successful Deflect attack alignment", () => {
  it("waits for each upcoming manual attack and delays start attachments", () => {
    const data = input([
      cast("Lead"),
      { type: "event", event: "Buff", buff: "Marker", before: { action: "start" } },
      cast("DeflectSuccessful"),
      cast("DeflectSuccessful"),
      attack(5),
      attack(8),
      end(10),
    ])
    data.effectDefinitions = { Marker: { duration: 1, maxStack: 1 } }
    const rows = buildRotationTimeline(data)
    const deflects = successful(rows)
    expect(deflects).toHaveLength(2)
    expect(deflects.map(row => row.startTime + row.effectiveCastTime)).toEqual([5.1, 8.1])
    expect(rows.find(row => row.rotationIndex === 1)?.startTime).toBeCloseTo(4.762)
    expect(deflects[0].buffs.has("Marker")).toBe(true)
    expect(damage(rows)).toEqual([0, 0])
    const waits = rows.filter(row => row.step.type === "event" && row.step.event === "Delay")
    expect(waits).toHaveLength(2)
    expect(waits[0].effectiveCastTime).toBeCloseTo(3.762)
    expect(waits[1].effectiveCastTime).toBeCloseTo(2.662)
    expect(data.rotation.steps.some(step => step.type === "event" && step.event === "Delay")).toBe(false)
  })
  it("uses the earlier of manual and paired dummy attacks, on the battle-relative clock", () => {
    const data = input([cast("Lead"), cast("DeflectSuccessful"), cast("DeflectSuccessful"), attack(3), end(9)])
    data.rotation = {
      ...data.rotation,
      targetType: "DummyAttack",
      eventTimeReference: "battleStart",
      start: { step: 0 },
    }
    const rows = buildRotationTimeline(data)
    const deflects = successful(rows)
    expect(deflects[0].startTime + deflects[0].effectiveCastTime).toBeCloseTo(3.1)
    expect(deflects[1].startTime + deflects[1].effectiveCastTime).toBeCloseTo(5.6)
    expect(damage(rows)).toEqual([0, 0, 0])
  })
  it("starts immediately if a previous cast leaves less than the ideal lead time", () => {
    const data = input([cast("Lead"), cast("DeflectSuccessful"), attack(5), end(6)])
    data.skills.Lead.castTime = 4.9
    const rows = buildRotationTimeline(data)
    expect(successful(rows)[0].startTime).toBeCloseTo(4.9)
    expect(successful(rows)[0].startTime + successful(rows)[0].effectiveCastTime).toBeCloseTo(5.238)
    expect(damage(rows)).toEqual([0])
  })
  it.each([[], [attack(0.5)], [attack(8), end(6)], [attack(6), end(6)]].map(events => ({ events })))(
    "casts normally without another attack before combat ends: $events",
    ({ events }) => {
      const data = input([cast("Lead"), cast("DeflectSuccessful"), ...(events as RotationStep[])])
      const rows = buildRotationTimeline(data)
      expect(successful(rows)[0].startTime).toBeCloseTo(1)
    },
  )
  it("leaves ordinary Deflect unaligned and makes both variants ignore ping", () => {
    const rows = buildRotationTimeline(
      input([cast("Lead"), cast("Deflect"), cast("DeflectSuccessful"), attack(5), end(6)]),
    )
    expect(rows.find(row => row.rotationIndex === 1)?.startTime).toBeCloseTo(1)
    expect(successful(rows)[0].startTime).toBeCloseTo(4.762)
  })
  it("uses the current weapon and cast modifiers when determining the lead time", () => {
    const data = input([cast("Lead"), cast("DeflectSuccessful"), attack(5), end(6)])
    data.weapons = ["heavenwill"]
    data.martialArtState = { heavenwill: { weapon: "Gauntlet" } } as TimelineBuildInput["martialArtState"]
    data.skills.DeflectSuccessful = {
      ...asSkillRecords(general).DeflectSuccessful,
      modifier: [{ effect: { castTimeMultiplier: 0.5 } }],
    }
    const deflect = successful(buildRotationTimeline(data))[0]
    expect(deflect.effectiveCastTime).toBeCloseTo(0.15)
    expect(deflect.startTime).toBeCloseTo(4.95)
    expect(deflect.startTime + deflect.effectiveCastTime).toBeCloseTo(5.1)
  })
  it("respects cooldown readiness and does not let a later reset bypass the attack wait", () => {
    const data = input([cast("DeflectSuccessful"), cast("DeflectSuccessful"), attack(0.1), attack(5), end(6)])
    data.skills.DeflectSuccessful = {
      ...asSkillRecords(general).DeflectSuccessful,
      cooldown: 10,
      action: [{ type: "trigger", value: "Reset", time: 0 }],
    }
    data.skills.Reset = {
      castTime: 0,
      action: [
        { type: "clearCD", value: "DeflectSuccessful", time: 2 },
        { type: "clearCD", value: "DeflectSuccessful", time: 3 },
      ],
    }
    const rows = buildRotationTimeline(data)
    const deflect = successful(rows)[1]
    expect(deflect.startTime).toBeCloseTo(4.762)
    expect(deflect.cooldownWait).toBeCloseTo(1.662)
    const waits = rows.filter(row => row.step.type === "event" && row.step.event === "Delay")
    expect(waits.map(row => row.step.type === "event" && row.step.event === "Delay" && row.step.automatic)).toEqual([
      "cooldown",
      "attack",
    ])
    expect(damage(rows)).toEqual([0, 0])
  })
  it("does not avoid earlier attacks while waiting for cooldown", () => {
    const data = input([
      cast("DeflectSuccessful"),
      cast("DeflectSuccessful"),
      attack(0.1),
      attack(1),
      attack(5),
      end(6),
    ])
    data.skills.DeflectSuccessful = { ...asSkillRecords(general).DeflectSuccessful, cooldown: 3 }
    expect(damage(buildRotationTimeline(data))).toEqual([0, 200, 0])
  })
  it("ends at the aligned response when no Battle End is specified", () => {
    const data = input([cast("Lead"), cast("DeflectSuccessful")])
    data.rotation = {
      ...data.rotation,
      targetType: "DummyAttack",
      eventTimeReference: "battleStart",
      start: { step: 0 },
    }
    const rows = buildRotationTimeline(data)
    expect(rows[0].timelineEndTime).toBeCloseTo(5.6)
    const attacks = rows.filter(row => row.step.type === "event" && row.step.event === "TakeDamage")
    expect(attacks).toHaveLength(2)
    expect(attacks.every(row => row.startTime === 5.5)).toBe(true)
  })
  it("strips both kinds of generated waits and preserves the authored start anchor", () => {
    const rotation = {
      name: "Legacy waits",
      start: { step: 3 },
      steps: [
        cast("Lead"),
        { type: "event", event: "Delay", automatic: "cooldown", duration: 1 } as RotationStep,
        { type: "event", event: "Delay", automatic: "attack", duration: 2 } as RotationStep,
        cast("DeflectSuccessful"),
      ],
    }
    const migrated = migrateAutomaticDelays(rotation)
    expect(migrated.steps).toEqual([cast("Lead"), cast("DeflectSuccessful")])
    expect(migrated.start).toEqual({ step: 1 })
  })
})
