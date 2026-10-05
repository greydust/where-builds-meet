import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import type { InnerWayEffectRule, TimelineBuildInput, TimelineRow } from "@/calculations/rotationTimeline"

import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { asEffectDefinitions } from "./helpers/shippedData"
import { actionStateAt } from "./helpers/timelineRows"

// Ported from script/probe/check-fury-harvest.mjs.
describe("fury-harvest", () => {
  it("Fury Harvest T1-T6 behavior checks passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const generalSkills = JSON.parse(await readFile("data/skill/general.json", "utf8"))
    const mysticSkills = JSON.parse(await readFile("data/skill/mystic.json", "utf8"))
    const generalBuffs = asEffectDefinitions(JSON.parse(await readFile("data/buff/general.json", "utf8")))
    const furyHarvest = JSON.parse(await readFile("data/innerway/fury-harvest.json", "utf8")) as {
      effect: Record<string, { trigger?: Array<{ target?: string; action?: unknown[] }> }>
    }
    const system = JSON.parse(await readFile("data/system.json", "utf8"))

    const activeTier = 5
    const activeTiers = Array.from({ length: activeTier + 1 }, (_, tier) => furyHarvest.effect[`FuryHarvestT${tier}`])

    const innerWayRules: InnerWayEffectRule[] = activeTiers.flatMap((definition, tier) =>
      (definition.trigger ?? []).map<InnerWayEffectRule>(trigger => ({
        trigger: { ...trigger, target: trigger.target ?? "self", action: trigger.action ?? [] },
        effect: {},
        source: "FuryHarvest",
        tier,
      })),
    )
    const innerWayConditions = Array.from({ length: activeTier + 1 }, (_, tier) => `FuryHarvestT${tier}`)
    /** The final row the builder scheduled. */
    const lastRow = (rows: TimelineRow[]) => {
      const row = rows.at(-1)
      expect(row, "The builder must schedule a final row.").toBeTruthy()
      return row!
    }
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Fury Harvest vitality probe",
        steps: [
          { type: "skill", skill: "PerfectDodgeCancel" },
          { type: "skill", skill: "DeflectSuccessful" },
          { type: "skill", skill: "Exchange" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: withImmediateAttacks({
        PerfectDodgeCancel: generalSkills.PerfectDodgeCancel,
        DeflectSuccessful: generalSkills.DeflectSuccessful,
        Exchange: {
          name: "Exchange",
          castTime: 1,
          action: [
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
            { type: "takeDamage", damage: 100, time: 1 },
          ],
          modifier: [],
          tags: ["General"],
        },
        Observe: {
          name: "Observe",
          castTime: 0,
          action: [{ type: "setResource", value: "Observed", amount: 1, time: 0 }],
          modifier: [],
          tags: ["General"],
        },
      }),
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions,
      innerWayRules,
      setupEffects: [],
      weapons: [],
      initialResources: { Vitality: 0 },
      resourceMaximums: { Vitality: 40 },
      resourceEvents: system.resourceEvents,
      maxHP: 1000,
    })

    expect(
      actionStateAt(lastRow(timeline), 0).resources.Vitality === 14.1,
      `Dodge and deflect grant 8 total; base damage recovery grants 2.1 and incoming damage retains its ordinary 4; actual ${lastRow(timeline).actionStates[0].resources.Vitality}.`,
    ).toBeTruthy()

    const recoveryInput: TimelineBuildInput = {
      rotation: { name: "Base recovery cooldown", steps: [{ type: "skill", skill: "Hits" }] },
      skills: {
        Hits: {
          name: "Hits",
          castTime: 4,
          tags: ["DirectDamage"],
          action: [
            ...[0, 0, 0.5, 1.999, 2, 2.1, 4].map(time => ({ type: "damage", phyCoef: 1, time })),
            { type: "setResource", value: "Observed", amount: 1, time: 4 },
          ],
        },
      },
      dots: {},
      eventDefinitions: {},
      effectDefinitions: {},
      setupEffects: [],
      weapons: [],
      innerWayConditions,
      innerWayRules,
      initialResources: { Vitality: 0 },
      resourceMaximums: { Vitality: 40 },
      resourceEvents: system.resourceEvents,
    }
    const recovery = (input: TimelineBuildInput) => {
      const hits = buildRotationTimeline(input).find(row => row.step.skill === "Hits")
      expect(hits, "The recovery probe must schedule its Hits skill.").toBeTruthy()
      return actionStateAt(hits!, 7).resources.Vitality
    }
    expect(
      recovery(recoveryInput) === 6.3,
      "Only the recovery events at 0, 2 and 4 seconds grant 2.1; intervening hits grant nothing.",
    ).toBeTruthy()
    expect(
      recovery({ ...recoveryInput, innerWayConditions: ["FuryHarvestT0", "FuryHarvestT1", "FuryHarvestT2"] }) === 6,
      "Below T3 the same cooldown grants the normal 2 Vitality.",
    ).toBeTruthy()
    expect(
      recovery({ ...recoveryInput, resourceEvents: [] }) === 0,
      "T3 has no independent damage-event resource gain.",
    ).toBeTruthy()
    expect(
      recovery({ ...recoveryInput, resourceMaximums: { Vitality: 4 } }) === 4,
      "The combined recovery respects the resource cap.",
    ).toBeTruthy()

    const turnaroundTimeline = buildRotationTimeline({
      rotation: {
        name: "Fury Harvest Turnaround probe",
        steps: [
          { type: "skill", skill: "SereneBreeze" },
          { type: "skill", skill: "DragonHeadTide" },
          { type: "skill", skill: "Wait" },
          { type: "skill", skill: "BurstingNine" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: {
        SereneBreeze: mysticSkills.SereneBreeze,
        DragonHeadTide: mysticSkills.DragonHeadTide,
        BurstingNine: mysticSkills.BurstingNine,
        Wait: { name: "Wait", castTime: 5.1, action: [], modifier: [], tags: ["General"] },
        Observe: {
          name: "Observe",
          castTime: 0,
          action: [{ type: "setResource", value: "Observed", amount: 1, time: 0 }],
          modifier: [],
          tags: ["General"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: generalBuffs,
      innerWayConditions: ["FuryHarvestT6"],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
    })
    const dragonHead = turnaroundTimeline.find(row => row.step.type === "skill" && row.step.skill === "DragonHeadTide")
    const burstingNine = turnaroundTimeline.find(row => row.step.type === "skill" && row.step.skill === "BurstingNine")
    expect(dragonHead && burstingNine, "Turnaround must be scheduled against both Mystic casts.").toBeTruthy()
    expect(
      actionStateAt(dragonHead!, 2).resources.Vitality === 30,
      "Turnaround from the preceding Mystic must cap an 80-Vitality skill's refund at 10.",
    ).toBeTruthy()
    expect(
      actionStateAt(burstingNine!, 2).resources.Vitality === 10 && turnaroundTimeline.at(-1)?.resources.Vitality === 10,
      "Turnaround must expire five seconds after its last refresh and stop refunding later Mystic casts.",
    ).toBeTruthy()
  })
})
