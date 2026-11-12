import delugeBuffs from "@gamedata/buff/silkbind-deluge.json"
import fanTalents from "@gamedata/martial-art/panacea-fan.json"
import fan from "@gamedata/skill/panacea-fan.json"
import umbrella from "@gamedata/skill/soulshade-umbrella.json"
import system from "@gamedata/system.json"
import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateRotationBaseline, type RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EditableObject, InnerWayEffectRule, TimelineRow } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

function bundle(ids: string[], royalTier?: number, loomTier?: number): RotationSimulationBundle {
  const selected = [
    ...(royalTier === undefined ? [] : [{ innerWay: "RoyalRemedy", tier: `T${royalTier}` }]),
    ...(loomTier === undefined ? [] : [{ innerWay: "MendingLoom", tier: `T${loomTier}` }]),
  ]
  return {
    timeline: {
      rotation: { name: "Dew", ping: 0, groupSize: 1, steps: ids.map(skill => ({ type: "skill", skill })) },
      skills: asSkillRecords({ ...fan, ...umbrella, Wait: { castTime: 8, action: [] } }),
      setupEffects: martialArtEffectsForRank<EditableObject>({ panaceaFan: fanTalents }, ["panaceaFan"], 13),
      effectDefinitions: asEffectDefinitions(delugeBuffs),
      eventDefinitions: {},
      dots: {},
      innerWayRules: innerWayEffectRulesFor(selected, 17, "silkbindDeluge"),
      innerWayConditions: [...innerWayConditionsFor(selected, undefined, "silkbindDeluge")],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      initialResources: system.initialResources,
      resourceMaximums: system.resourceMaximums,
      maxHP: 10000,
    },
    startAnchor: { rowId: "rotation-0" },
    stats: { ...emptyStats, minPhys: 100, maxPhys: 100, maxHp: 10000, maxVitality: 40 },
    enemy: {
      name: "Target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    attunement: emptyAttunementStats,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}

function ledger(input: RotationSimulationBundle) {
  return calculateRotationBaseline(input).timeline[0].timelineResourceSummary!.Dew
}

function casting(rows: TimelineRow[], skill: string) {
  return rows.find(row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === skill)!
}

describe("Deluge Dew", () => {
  it.each([false, true])(
    "integrates separate prepull/combat natural rates through the shared modifiers (bonus=%s)",
    bonus => {
      const input = bundle(["Wait", "Observe", "CombatWait"])
      input.timeline.skills.Wait.castTime = 4
      input.timeline.skills.Observe = { castTime: 0, action: [] }
      input.timeline.skills.CombatWait = { castTime: 6, action: [] }
      input.timeline.rotation.start = { step: 1 }
      input.startAnchor = { rowId: "rotation-1" }
      input.timeline.resourceRegeneration = system.resourceRegeneration
      input.timeline.resourceRegenerationOutOfCombat = system.resourceRegenerationOutOfCombat
      if (bonus)
        input.timeline.setupEffects.push({
          resourceRegenerationBonus: { resource: "Dew", belowRatio: 0.5, bonus: 0.5 },
        })
      const result = calculateRotationBaseline(input)
      expect(casting(result.timeline, "Observe").resources.Dew).toBe(bonus ? 12 : 8)
      expect(result.timeline[0].timelineResourceSummary!.Dew.final).toBe(bonus ? 21 : 14)
    },
  )

  it.each([false, true])("waits for natural regeneration to fund a required cost exactly (prepull=%s)", prepull => {
    const input = bundle(prepull ? ["MorningDrizzle"] : ["Observe", "MorningDrizzle"])
    input.timeline.skills.Observe = { castTime: 0, action: [] }
    input.timeline.initialResources = { Dew: 40 }
    input.timeline.resourceRegeneration = system.resourceRegeneration
    input.timeline.resourceRegenerationOutOfCombat = system.resourceRegenerationOutOfCombat
    if (prepull) input.timeline.rotation.start = { step: 0 }
    const result = calculateRotationBaseline(input)
    expect(casting(result.timeline, "MorningDrizzle").startTime).toBeCloseTo(prepull ? 5 : 10, 10)
    expect(casting(result.timeline, "MorningDrizzle").resourceConsumption!.Dew).toBe(50)
  })

  it("includes regeneration modifiers when funding a wait and caps natural recovery at 100", () => {
    const input = bundle(["Observe", "MorningDrizzle", "Wait"])
    input.timeline.skills.Observe = { castTime: 0, action: [] }
    input.timeline.initialResources = { Dew: 40 }
    input.timeline.resourceRegeneration = system.resourceRegeneration
    input.timeline.resourceRegenerationOutOfCombat = system.resourceRegenerationOutOfCombat
    input.timeline.setupEffects.push({ resourceRegenerationBonus: { resource: "Dew", belowRatio: 0.5, bonus: 0.5 } })
    expect(casting(calculateRotationBaseline(input).timeline, "MorningDrizzle").startTime).toBeCloseTo(20 / 3, 9)
    const capped = bundle(["Wait"])
    capped.timeline.initialResources = { Dew: 95 }
    capped.timeline.resourceRegeneration = system.resourceRegeneration
    expect(ledger(capped).final).toBe(100)
  })

  it("adds natural recovery to Herbal Resonance grants rather than replacing either clock", () => {
    const input = bundle(["EchoesOfAThousandPlantsCancel", "Wait"], undefined, 0)
    input.timeline.skills.Wait.castTime = 3
    input.timeline.resourceRegeneration = system.resourceRegeneration
    input.timeline.resourceRegenerationOutOfCombat = system.resourceRegenerationOutOfCombat
    expect(ledger(input).final).toBeCloseTo(5 + 3.625 + 2, 10)
  })
  it("starts empty and grants 3/5/12 Dew from the fan's three heavy contacts", () => {
    const input = bundle(["EmeraldDewtouch1", "EmeraldDewtouch2Cancel", "EmeraldDewtouch3Cancel"])
    const result = calculateRotationBaseline(input)
    expect(casting(result.timeline, "EmeraldDewtouch1").resources.Dew).toBe(0)
    expect(casting(result.timeline, "EmeraldDewtouch2Cancel").resources.Dew).toBe(3)
    expect(casting(result.timeline, "EmeraldDewtouch3Cancel").resources.Dew).toBe(8)
    expect(result.timeline[0].timelineResourceSummary!.Dew.final).toBe(20)
  })

  it.each([undefined, 0, 1] as const)(
    "combines Cloudburst's cast gain, talent, and Royal Remedy T%s once per self tick",
    tier => {
      const input = bundle(["CloudburstHealing", "Wait"], tier)
      input.timeline.rotation.groupSize = 10
      expect(ledger(input).final).toBe(20 + 7 * (2 + (tier === undefined ? 0 : tier === 0 ? 1 : 3)))
    },
  )

  it.each([undefined, 3, 4, 6] as const)("spends the confirmed Endless Cloud cost at Royal Remedy T%s", tier => {
    const input = bundle(["EndlessCloudCancel"], tier)
    input.timeline.initialResources = { Dew: 100 }
    const result = ledger(input)
    expect(result.consumed).toBe(tier !== undefined && tier >= 4 ? 50 : 100)
    expect(result.final).toBe(tier !== undefined && tier >= 4 ? 50 : 0)
  })

  it("waits for real Cloudburst ticks to fund Endless Cloud instead of spending a partial meter", () => {
    const input = bundle(["CloudburstHealing", "EndlessCloudCancel", "Wait"], 4)
    const result = calculateRotationBaseline(input)
    const cloud = casting(result.timeline, "EndlessCloudCancel")
    expect(cloud.startTime).toBeCloseTo(5.9, 10)
    expect(cloud.resourceConsumption!.Dew).toBe(50)
    expect(
      result.timeline.some(
        row => row.step.type === "event" && row.step.event === "Delay" && row.step.automatic === "requirement",
      ),
    ).toBe(true)
  })

  it("skips an unfundable cast, preserves its meter, and does not heal", () => {
    const input = bundle(["MorningDrizzle", "Wait"])
    input.timeline.initialResources = { Dew: 40 }
    const result = calculateRotationBaseline(input)
    expect(casting(result.timeline, "MorningDrizzle").skipped).toBe(true)
    expect(result.metrics.totalHealing).toBe(0)
    expect(result.timeline[0].timelineResourceSummary!.Dew.final).toBe(40)
  })

  it("caps generation at 100 and allows explicit infinite-Dew calculations", () => {
    const capped = bundle(["CloudburstHealing", "Wait"], 1)
    capped.timeline.initialResources = { Dew: 95 }
    expect(ledger(capped).final).toBe(100)
    const infinite = bundle(["EndlessCloudCancel"])
    infinite.timeline.infiniteResources = ["Dew"]
    expect(calculateRotationBaseline(infinite).metrics.totalHealing).toBeGreaterThan(0)
    expect(ledger(infinite).final).toBe(100)
  })

  it("grants Mending Loom's cast refund and reduces every Herbal Resonance alias to one shared cooldown", () => {
    const input = bundle(["EchoesOfAThousandPlantsCancel", "EchoesOfAThousandPlants", "Wait"], undefined, 1)
    const result = calculateRotationBaseline(input)
    expect(casting(result.timeline, "EchoesOfAThousandPlants").startTime).toBeCloseTo(1, 10)
    expect(casting(result.timeline, "EchoesOfAThousandPlants").resources.Dew).toBe(5)
    expect(result.timeline[0].timelineResourceSummary!.Dew.final).toBeGreaterThanOrEqual(10)
  })

  it("dispatches resource-spend accumulators from actual clamped spending and preserves threshold remainders", () => {
    const input = bundle(["Spend"])
    input.timeline.initialResources = { Dew: 100 }
    input.timeline.setupEffects = []
    input.timeline.skills.Spend = {
      castTime: 1,
      action: [
        { type: "consumeResource", value: "Dew", amount: 30, time: 0 },
        { type: "addResource", value: "Dew", amount: 30, time: 0.1 },
        { type: "consumeResource", value: "Dew", amount: 80, time: 0.2 },
        { type: "addResource", value: "Dew", amount: 30, time: 0.3 },
        { type: "consumeResource", value: "Dew", amount: 40, time: 0.4 },
      ],
    }
    input.timeline.skills.Payout = { castTime: 0, action: [{ type: "heal", phyBonus: 1, time: 0 }] }
    input.timeline.effectDefinitions.Counter = {
      hidden: true,
      maxStack: 1,
      accumulator: { event: "resourceSpent:Dew", threshold: 50, checkEvent: "Paid", preserveRemainder: true },
      listen: [{ event: "Paid", action: { type: "trigger", value: "Payout" } }],
    }
    input.timeline.innerWayRules = [
      {
        source: "Probe",
        tier: 0,
        effect: {},
        trigger: {
          event: "skillStart",
          requirement: [{ operator: "not", operand: [{ target: "self", value: "Counter" }] }],
          action: [{ type: "apply", target: "self", value: "Counter", stack: 1 }],
        },
      },
    ] as InnerWayEffectRule[]
    const result = calculateRotationBaseline(input)
    expect(result.metrics.totalHealing).toBe(3)
    expect(result.timeline[0].timelineResourceSummary!.Dew.consumed).toBe(150)
  })

  it.each([0, 3, 6])("pays Mending Loom T%s's combined recovery for actual cumulative spending", tier => {
    const input = bundle(["Spend"], undefined, tier)
    input.timeline.initialResources = { Dew: 100 }
    input.timeline.rotation.groupSize = 5
    input.stats.crit = 0.8
    input.stats.directCrit = 0.2
    input.stats.criticalHealingBonus = 1
    input.timeline.setupEffects = [{ healingBonus: 2 }]
    input.timeline.skills.Spend = {
      castTime: 1,
      action: [
        { type: "consumeResource", value: "Dew", amount: 30, time: 0 },
        { type: "addResource", value: "Dew", amount: 30, time: 0.1 },
        { type: "consumeResource", value: "Dew", amount: 80, time: 0.2 },
        { type: "addResource", value: "Dew", amount: 30, time: 0.3 },
        { type: "consumeResource", value: "Dew", amount: 40, time: 0.4 },
      ],
    }
    const result = calculateRotationBaseline(input)
    const procs = Object.values(result.actionBreakdowns).filter(value => value.healing)
    expect(procs.length).toBe(tier < 3 ? 1 : 3)
    for (const proc of procs) {
      expect(proc.healing!.total).toBeGreaterThan(1000)
      expect(proc.healing!.total).toBeLessThan(1100)
      expect(proc.healing!.criticalRate).toBe(1)
      expect(proc.recipientHealing!.length).toBe(1)
    }
  })

  it("does not credit unavailable or infinite Dew toward Mending Loom's threshold", () => {
    const input = bundle(["Spend"], undefined, 3)
    input.timeline.initialResources = { Dew: 20 }
    input.timeline.skills.Spend = {
      castTime: 1,
      action: [{ type: "consumeResource", value: "Dew", amount: 100, time: 0 }],
    }
    expect(calculateRotationBaseline(input).metrics.totalHealing).toBe(0)
    input.timeline.infiniteResources = ["Dew"]
    expect(calculateRotationBaseline(input).metrics.totalHealing).toBe(0)
  })

  it.each([0, 6])("uses the exported Herbal Resonance Dew clock independently of T%s's healing recipients", tier => {
    const input = bundle(["EchoesOfAThousandPlantsCancel", "Wait"], undefined, tier)
    input.timeline.skills.Wait.castTime = 61
    input.timeline.rotation.groupSize = 10
    const result = calculateRotationBaseline(input)
    expect(result.timeline[0].timelineResourceSummary!.Dew.final).toBe(64)
    const ticks = result.timeline.filter(
      row =>
        row.kind === "periodic" &&
        row.step.type === "skill" &&
        row.step.skill === "EchoesOfAThousandPlants" &&
        row.actions.some(action => action.type === "heal"),
    )
    expect(ticks.length).toBe(60)
    const dewTicks = result.timeline.filter(row => row.kind === "periodic" && row.step.skill === "HerbalResonanceDew")
    expect(dewTicks.length).toBe(59)
    const applicationTime = 0.625
    dewTicks.forEach((row, index) => expect(row.startTime).toBeCloseTo(applicationTime + 1.113 + index, 10))
    expect(ticks[0].startTime).toBeCloseTo(applicationTime + 1, 10)
    const healing = Object.values(result.actionBreakdowns).filter(value => value.healing)
    expect(healing.length).toBe(60)
    expect(healing.every(value => value.recipientHealing!.length === (tier === 6 ? 2 : 1))).toBe(true)
    // Floating Grace recalls the umbrella and cancels its pending recovery/generation.
    input.timeline.rotation.steps.splice(1, 0, { type: "skill", skill: "FloatingGrace" })
    expect(ledger(input).final).toBe(5)
  })

  it("grants weapon-switch Dew only on an explicit change into Soulshade Umbrella", () => {
    const input = bundle(["Switch", "Switch", "Wait"])
    input.timeline.martialArtState = { panaceaFan: { weapon: "Fan" }, soulshadeUmbrella: { weapon: "Umbrella" } }
    input.timeline.skills.Switch = {
      castTime: 0,
      action: [{ type: "switchMartialArt", martialArt: "soulshadeUmbrella", time: 0 }],
    }
    input.timeline.skills.Wait.castTime = 16
    input.timeline.setupEffects.push(...delugeBuffs.SoulshadeDewRules.effect)
    const result = calculateRotationBaseline(input)
    expect(result.timeline[0].timelineResourceSummary!.Dew.final).toBe(30)
    const ticks = result.timeline.filter(row => row.kind === "periodic" && row.step.skill === "ChillBeneathTheCloak")
    expect(ticks).toHaveLength(15)
    ticks.forEach((row, index) => expect(row.startTime).toBeCloseTo(index, 10))
  })
})
