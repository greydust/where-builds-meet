import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline, type EditableObject, type SkillRecord } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"

const setupEffects = martialArtEffectsForRank(martialArtDefinitions, ["namelessSpear"], 13)
const hit = (time: number) => ({ type: "damage", phyCoef: 1, time })

function run({
  initial = 10,
  maximum = 100,
  duration = 1,
  endurance,
  actions = [hit(0), hit(duration)],
  talent = true,
  suppression = 0,
}: {
  initial?: number
  maximum?: number
  duration?: number
  endurance?: SkillRecord["endurance"]
  actions?: EditableObject[]
  talent?: boolean
  suppression?: number
} = {}) {
  return buildRotationTimeline({
    rotation: { name: "Natural recovery", ping: 0, steps: [{ type: "skill", skill: "Probe" }] },
    skills: { Probe: { castTime: duration, endurance, action: actions } },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: talent ? setupEffects : [],
    weapons: ["namelessSpear"],
    initialResources: { Endurance: initial, HeavensWill: 0 },
    resourceMaximums: { Endurance: maximum },
    resourceRegeneration: { Endurance: 10, HeavensWill: 0.1 },
    resourceSpendRegenDelay: { Endurance: suppression },
  })[0]
}

describe("Nameless Spear natural Endurance recovery", () => {
  it.each([
    { initial: 10, expected: 22 },
    { initial: 30, expected: 40 },
    { initial: 40, expected: 50 },
    { initial: 24, expected: 35 },
    { initial: 95, expected: 100 },
  ])("regenerates from $initial to $expected across one second", ({ initial, expected }) => {
    const row = run({ initial })
    expect(row.actionStates[1].resources.Endurance).toBeCloseTo(expected, 8)
    expect(row.actionStates[1].resources.HeavensWill).toBeCloseTo(0.1, 8)
  })

  it("requires the talent and uses the current maximum for its threshold", () => {
    expect(run({ talent: false }).actionStates[1].resources.Endurance).toBe(20)
    expect(run({ initial: 40, maximum: 200 }).actionStates[1].resources.Endurance).toBe(52)
  })

  it("splits a draining span when it falls below the threshold", () => {
    const row = run({ initial: 35, duration: 2, endurance: { consumption: 20 } })
    // Half a second at -10/s, followed by 1.5 seconds at -8/s.
    expect(row.actionStates[1].resources.Endurance).toBe(18)
  })

  it("does not depend on unrelated events subdividing a regeneration span", () => {
    const whole = run({ initial: 24, duration: 3 })
    const split = run({ initial: 24, duration: 3, actions: [hit(0), hit(0.25), hit(0.5), hit(1), hit(3)] })
    expect(split.actionStates[4].resources.Endurance).toBe(whole.actionStates[1].resources.Endurance)
  })

  it("holds at the threshold when drain falls between the two natural rates", () => {
    for (const initial of [29, 30, 31]) {
      expect(run({ initial, duration: 3, endurance: { consumption: 11 } }).actionStates[1].resources.Endurance).toBe(30)
    }
  })

  it("applies to a cast's natural rate override without increasing its drain", () => {
    const row = run({ endurance: { regeneration: 0.001, consumption: 2 } })
    expect(row.actionStates[1].resources.Endurance).toBeCloseTo(8.0012, 8)
  })

  it("respects suppression after a direct spend", () => {
    const row = run({
      initial: 20,
      duration: 2,
      suppression: 1.2,
      actions: [{ type: "consumeResource", value: "Endurance", amount: 10, time: 0 }, hit(1), hit(2)],
    })
    expect(row.actionStates[1].resources.Endurance).toBe(10)
    expect(row.actionStates[2].resources.Endurance).toBeCloseTo(19.6, 8)
  })

  it("leaves Spear Q and Mountain's Might direct restores unchanged below 30%", () => {
    const ways = [{ innerWay: "MountainsMight", tier: "T6" }] as const
    for (const skill of ["QiankunsLock", "QiankunsLockCancel", "ChargedHit"]) {
      const rows = buildRotationTimeline({
        rotation: { name: "Direct recovery", ping: 0, steps: [{ type: "skill", skill }] },
        skills: { ...allSkillDefinitions, ChargedHit: { castTime: 0, tags: ["Charged"], action: [hit(0)] } },
        eventDefinitions: {},
        dots: {},
        effectDefinitions,
        innerWayConditions: [...innerWayConditionsFor([...ways], undefined, "bellstrikeSplendor")],
        innerWayRules: innerWayEffectRulesFor([...ways], 17, "bellstrikeSplendor"),
        setupEffects,
        weapons: ["namelessSword", "namelessSpear"],
        initialDebuffs: [{ name: "QiImbalance", stack: 1, appliedAt: 0 }],
        initialResources: { Endurance: 0 },
        resourceMaximums: { Endurance: 100 },
      })
      expect(rows[0].timelineResourceSummary?.Endurance.final).toBe(skill === "ChargedHit" ? 8 : 60)
    }
  })
})
