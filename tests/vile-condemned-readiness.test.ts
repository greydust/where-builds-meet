import { assert, describe, expect, it } from "vitest"

import effects from "../data/debuff/bamboocut-kite.json"
import skills from "../data/skill/heavenwill-gauntlets.json"
import { buildRotationTimeline, type TimelineBuildInput, type RotationStep } from "../src/calculations/rotationTimeline"
import { migrateAutomaticDelays } from "../src/rotationEditing"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
function input(skill = "VileCondemnedEnd4"): TimelineBuildInput {
  return {
    rotation: { name: "Readiness", ping: 40, steps: [cast(skill)] },
    skills: structuredClone(asSkillRecords(skills)),
    eventDefinitions: {},
    dots: {},
    effectDefinitions: asEffectDefinitions(effects),
    innerWayConditions: ["SoaringHighT0", "SoaringHighT6"],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["heavenwill", "skygrasp"],
    initialResources: { HeavensWill: 2 },
    resourceMaximums: { HeavensWill: 4 },
    resourceRegeneration: { HeavensWill: 0.1 },
  }
}
const charged = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.find(row => row.step.type === "skill" && row.step.skill?.startsWith("VileCondemned"))!
const lead = 0.775 + 0.04
function verifyRelease(data: TimelineBuildInput, releaseTime: number, target: number) {
  const rows = buildRotationTimeline(data),
    row = charged(rows)
  expect(row.skipped).not.toBe(true)
  expect(row.startTime + lead).toBeCloseTo(releaseTime, 8)
  expect(row.actions.find(action => action.type === "damage")?.phyCoef).toBe(11.7527)
  expect(row.actionStates[0]?.resources.HeavensWill).toBeGreaterThanOrEqual(target)
  expect(row.effectiveCastTime).toBeCloseTo(lead + 2.8375, 8)
  return { rows, row }
}
describe("Vile Condemned pre-charge readiness", () => {
  it.each([
    { skill: "VileCondemnedEnd", target: 3, release: 10 },
    { skill: "VileCondemnedEnd4", target: 4, release: 20 },
  ])("$skill includes passive regeneration during charge", ({ skill, target, release }) => {
    const { rows, row } = verifyRelease(input(skill), release, target)
    const wait = rows.find(row => row.step.type === "event" && row.step.event === "Delay")!
    expect(wait.startTime).toBe(0)
    expect(wait.effectiveCastTime).toBeCloseTo(release - lead, 8)
    expect(row.startTime).toBeCloseTo(wait.effectiveCastTime, 8)
  })
  it("does not wait if charging alone reaches the target", () => {
    const data = input()
    data.initialResources = { HeavensWill: 3.95 }
    const { rows, row } = verifyRelease(data, lead, 4)
    expect(row.startTime).toBe(0)
    expect(rows.some(row => row.step.type === "event" && row.step.event === "Delay")).toBe(false)
  })
  it.each([
    { amount: 4, expiry: 18, ready: 18 },
    { amount: 2, expiry: 12, ready: 20 },
  ])("waits for both cooldown and HW: $amount HW, expiry $expiry", ({ amount, expiry, ready }) => {
    const data = input()
    data.initialResources = { HeavensWill: amount }
    data.skills.Cooldown = {
      castTime: 0,
      ignorePing: true,
      action: [{ type: "apply", target: "self", value: "VileCondemnedEndCooldown", duration: expiry, time: 0 }],
    }
    data.rotation.steps.unshift(cast("Cooldown"))
    const { row: cooldownRow } = verifyRelease(data, ready, 4)
    assert(!cooldownRow.skipped, "Cooldown and resource wait must release the cast.")
  })
  it("includes pending resource gains during the future charge", () => {
    const data = input()
    data.initialResources = { HeavensWill: 3 }
    data.resourceRegeneration = {}
    data.skills.Pending = {
      castTime: 0,
      ignorePing: true,
      action: [{ type: "addResource", value: "HeavensWill", amount: 1, time: 2 }],
    }
    data.rotation.steps.unshift(cast("Pending"))
    const { row: pendingRow } = verifyRelease(data, 2, 4)
    assert(!pendingRow.skipped, "Pending resource gain must release the cast.")
  })
  it("includes a queued Falcon cooldown reset through the ordinary trigger executor", () => {
    const data = input()
    data.initialResources = { HeavensWill: 4 }
    data.initialBuffs = [{ name: "VileCondemnedEndCooldown", stack: 1, expiresAt: 18 }]
    data.skills.Falcon = {
      castTime: 0,
      ignorePing: true,
      tags: ["Falcon"],
      action: [{ type: "damage", phyCoef: 1, time: 2 }],
    }
    data.innerWayRules = [
      {
        source: "SoaringHighT3",
        tier: 3,
        effect: {},
        trigger: {
          requirement: [{ target: "skillTag", value: "Falcon" }],
          action: [{ type: "consume", target: "self", value: "VileCondemnedEndCooldown", stack: "all" }],
        },
      },
    ]
    data.rotation.steps.unshift(cast("Falcon"))
    const { row: falconRow } = verifyRelease(data, 2, 4)
    assert(!falconRow.skipped, "Falcon cooldown reset must release the cast.")
  })
  it("processes same-time spending before accepting release readiness", () => {
    const data = input()
    data.initialResources = { HeavensWill: 3 }
    data.skills.Pending = {
      castTime: 0,
      ignorePing: true,
      action: [
        { type: "addResource", value: "HeavensWill", amount: 1, time: 2 },
        { type: "consumeResource", value: "HeavensWill", amount: 0.1, time: 2 },
      ],
    }
    data.rotation.steps.unshift(cast("Pending"))
    const { row: spendingRow } = verifyRelease(data, 3, 4)
    assert(!spendingRow.skipped, "Same-time spending must release the cast.")
  })
  it("resolves successive waits without losing the shared End Hit cooldown", () => {
    const data = input()
    data.rotation.steps.push(cast("VileCondemnedEnd"))
    const rows = buildRotationTimeline(data)
    const casts = rows.filter(row => row.step.type === "skill" && row.step.skill?.startsWith("VileCondemned"))
    expect(casts).toHaveLength(2)
    expect(casts[0].startTime + lead).toBeCloseTo(20, 8)
    // Four HW are spent at 20.375; without a refund, three recover at 50.375.
    expect(casts[1].startTime + lead).toBeCloseTo(50.375, 8)
    expect(casts.every(row => row.actions.some(action => action.type === "damage" && action.phyCoef === 11.7527))).toBe(
      true,
    )
  })
  it("executes explicit start attachments at the earliest possible start without backdating their effects", () => {
    const data = input()
    data.eventDefinitions = { Buff: { action: [{ type: "apply", target: "self", time: 0 }] } }
    data.effectDefinitions = { ...effects, Marker: { duration: 2, maxStack: 1 } }
    data.rotation.steps.unshift({ type: "event", event: "Buff", buff: "Marker", before: { action: "start" } })
    const { rows, row } = verifyRelease(data, 20, 4)
    expect(rows.find(row => row.rotationIndex === 0)?.startTime).toBe(0)
    expect(row.actionStates[0].buffs.has("Marker")).toBe(false)
  })
  it("does not replay pending actions and switches weapons before the displayed charge begins", () => {
    const data = input()
    data.weapons = ["skygrasp", "heavenwill"]
    data.skills.Pending = {
      ignorePing: true,
      castTime: 0,
      action: [
        { type: "damage", phyCoef: 1, time: 2 },
        { type: "addResource", value: "HeavensWill", amount: 2, time: 3 },
      ],
    }
    data.rotation.steps.unshift(cast("Pending"))
    data.setupEffects = [
      {
        trigger: {
          event: "skillStart",
          requirement: [{ target: "skillTag", value: "VileCondemned" }],
          action: { type: "addResource", value: "UnexpectedStart", amount: 1 },
        },
      },
    ]
    const calls: string[] = []
    const rows = buildRotationTimeline(data, undefined, () => (row, index) => {
      calls.push(`${row.id}:${index}`)
      return undefined
    })
    const row = charged(rows)
    expect(row.startTime + lead).toBeCloseTo(3, 8)
    expect(new Set(calls).size).toBe(calls.length)
    expect(rows.find(candidate => candidate.rotationIndex === 0)?.actionStates[0].currentMartialArt).toBe("heavenwill")
    expect(row.actionStates[0].resources.UnexpectedStart ?? 0).toBe(0)
  })
  it("rejects side effects in a silent charge instead of silently backdating them", () => {
    const data = input()
    data.skills.VileCondemnedCharge.action = [{ type: "addResource", value: "HeavensWill", amount: 1 }]
    expect(() => buildRotationTimeline(data)).toThrow("Silent skill VileCondemnedCharge")
  })
  it("stops the wait at Battle End without casting the weak fallback", () => {
    const data = input()
    data.rotation.steps.push({ type: "event", event: "BattleEnd", startTime: 10 })
    const rows = buildRotationTimeline(data)
    expect(rows.some(row => row.actions.some(action => action.type === "damage"))).toBe(false)
    expect(rows.find(row => row.step.type === "event" && row.step.event === "Delay")?.effectiveCastTime).toBe(10)
  })
  it("skips an unreachable release when no encounter end or pending gain can make it ready", () => {
    const data = input()
    data.resourceRegeneration = {}
    expect(charged(buildRotationTimeline(data)).skipped).toBe(true)
  })
  it("strips generated requirement waits on load and remaps the fight anchor", () => {
    const rotation = {
      name: "Stored",
      steps: [{ type: "event", event: "Delay", automatic: "requirement", duration: 5 }, cast("VileCondemnedEnd4")],
      start: { step: 1 },
    } as TimelineBuildInput["rotation"]
    const migrated = migrateAutomaticDelays(rotation)
    expect(migrated.steps).toEqual([cast("VileCondemnedEnd4")])
    expect(migrated.start?.step).toBe(0)
  })
})
