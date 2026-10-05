import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { emptyStats } from "@/data/statDefinitions"

const weaponIds = ["namelessSword", "namelessSpear"] as never[]

const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
const enemy = {
  name: "Vagrant Sword probe",
  level: 96,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}

describe("Shadow Step cancel", () => {
  it("lands the cancel hit, spends Endurance, and opens the tier-gated three-wave window", async () => {
    const { defaultSkillMaps, defaultEditorMaps } = await import("@/application/gameData/skills")
    const run = (
      tiers: string[],
      shielded: boolean,
      holdSeconds = 5,
      prepull = false,
      followupGap: number | undefined = undefined,
      shadowStepGap: number | undefined = undefined,
      shadowOnly = false,
    ) =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Vagrant Sword",
            ...(prepull ? { start: { step: 0, action: 1 } } : {}),
            steps: shielded
              ? [
                  { type: "skill", skill: "RaiseShield" },
                  { type: "skill", skill: "VagrantSword2" },
                  { type: "event", event: "Delay", duration: holdSeconds },
                ]
              : [
                  ...(shadowStepGap === undefined
                    ? []
                    : [
                        { type: "skill" as const, skill: "ShadowStepCancel" },
                        { type: "event" as const, event: "Delay" as const, duration: shadowStepGap },
                      ]),
                  ...(shadowOnly ? [] : [{ type: "skill" as const, skill: "VagrantSword2" }]),
                  ...(followupGap === undefined
                    ? []
                    : Array.from({ length: 3 }, () => [
                        { type: "event" as const, event: "Delay" as const, duration: followupGap },
                        { type: "skill" as const, skill: "VagrantSword2" },
                      ]).flat()),
                  { type: "event", event: "Delay", duration: holdSeconds },
                ],
          },
          skills: {
            ...(defaultSkillMaps.NamelessSword as Record<string, unknown>),
            RaiseShield: {
              castTime: 0,
              tags: ["General"],
              action: [{ type: "apply", target: "self", value: "Shield", duration: 30, time: 0 }],
            },
          },
          effectDefinitions: { ...defaultEditorMaps.Buff, ...defaultEditorMaps.Debuff },
          initialResources: { Endurance: 100 },
          resourceMaximums: { Endurance: 100 },
          resourceRegeneration: { Endurance: 10 },
          resourceSpendRegenDelay: { Endurance: 1.2 },
          dots: {},
          eventDefinitions: {},
          innerWayRules: [],
          innerWayConditions: tiers,
          setupEffects: [],
          weapons: weaponIds,
        },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons: weaponIds,
        attunement: emptyAttunementStats,
        startAnchor: { rowId: "rotation-0", ...(prepull ? { actionIndex: 1 } : {}) },
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })

    const threeWaves = (result: ReturnType<typeof run>) =>
      result.timeline.flatMap(row =>
        row.actions.flatMap((action, index) => {
          const breakdown = result.actionBreakdowns[`${row.id}:${index}`]
          const tags = row.actionSkillTags?.[index] ?? []
          return action.type === "damage" && breakdown && tags.includes("SwordEnergy") && tags.includes("VagrantSword")
            ? [breakdown.total]
            : []
        }),
      )

    const shadowTiers = ["SwordMorphT0", "SwordMorphT1"]
    const shadow = run(shadowTiers, false, 5, false, undefined, 0)
    const shadowRow = shadow.timeline[0]
    assert.equal(shadowRow.effectiveCastTime, 0.287)
    const hit = shadowRow.actions.findIndex(action => action.type === "damage")
    assert.equal(shadowRow.actions[hit].time, 0.287)
    assert.ok(shadow.actionBreakdowns[shadowRow.id + ":" + hit].total > 0)
    assert.equal(
      run([], false, 0, false, undefined, 0, true).timeline[0].timelineResourceSummary?.Endurance?.consumed,
      20,
    )
    assert.equal(threeWaves(shadow).length, 3, "Shadow Step enables unshielded three-wave release at T1")
    assert.equal(threeWaves(run(["SwordMorphT0"], false, 5, false, undefined, 0)).length, 0)
    assert.equal(threeWaves(run(shadowTiers, false, 5, false, undefined, 5)).length, 0, "Shadow Step window expires")
    assert.equal(threeWaves(run(shadowTiers, false, 5, false, 0, 0)).length, 6, "T1 releases cannot refresh the window")
    assert.equal(
      threeWaves(run([...shadowTiers, "SwordMorphT4"], false, 5, false, 0, 0)).length,
      12,
      "T4 sustains the Shadow Step chain",
    )
  })
})
