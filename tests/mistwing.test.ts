import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, InnerWayEffectRule, TrackedEffect } from "@/calculations/rotationTimeline"
import type { WeaponId } from "@/types"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"
import { asEffectDefinitions } from "./helpers/shippedData"

describe("mistwing", () => {
  it("Mistwing missing-HP penetration, enhancement tiers, all-type T4/T6, and path eligibility passed", async () => {
    const mistwing = (await import("@gamedata/innerway/mistwing.json")).default
    const windBuffs = (await import("@gamedata/buff/bamboocut-wind.json")).default
    const { innerWayAvailableForTag, innerWayDefinitions, innerWayDefinitionForSoloLevel } =
      await import("@/data/innerWayDefinitions.ts")
    const { calculateRotationBaseline } = await probeLoad<typeof import("@/calculations/rotationCalculator")>(
      "/src/calculations/rotationCalculator.ts",
    )
    const { calculateDerivedStats } = await import("@/calculations/effectiveStats.ts")
    const { emptyStats } = await import("@/data/statDefinitions.ts")

    assert.equal(innerWayDefinitions.Mistwing, mistwing, "Mistwing must be registered as an Inner Way.")
    const definition = innerWayDefinitionForSoloLevel(mistwing, 17)
    for (const pathTag of ["BamboocutWind", "BamboocutDraught"]) {
      assert.ok(innerWayAvailableForTag("Mistwing", pathTag), `Mistwing must be selectable on ${pathTag}.`)
    }
    assert.ok(
      !innerWayAvailableForTag("Mistwing", "BamboocutKite"),
      "Mistwing must stay unavailable where the game does not offer it.",
    )
    assert.ok(innerWayAvailableForTag("EmpiricalEdge", "BamboocutWind"), "Empirical Edge must be selectable on Wind.")
    assert.ok(innerWayAvailableForTag("EmpiricalEdge", "BamboocutKite"), "Empirical Edge must stay selectable on Kite.")

    const weapons: WeaponId[] = ["infernalTwinblades", "mortalRopeDart"]
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, minBamboocut: 1000, maxBamboocut: 1000, precision: 1 }
    const enemy = {
      name: "Mistwing target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    // Mirrors the production adapter: a tier entry is either a damage rule or a stat rule.
    const statEffectFor = (item: Record<string, unknown>) =>
      Object.fromEntries(
        ["rawStat", "stat", "effectiveStat"]
          .filter(field => item[field] !== undefined)
          .map(field => [field, item[field]]),
      )
    // Each run carries the selected tier's complete cumulative rules. Dropping the
    // damage rules leaves the stat tiers, so T2's Solo Level attack bonus lands in
    // both snapshots and the channel ratio isolates the penetration contribution.
    const run = (tier: number, targetHPRatio: number, buffs: string[], damageRules: boolean) =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Mistwing probe",
            steps: [
              { type: "event", event: "HP", before: { action: 0 }, targetHPRatio },
              { type: "skill", skill: "Hit" },
            ],
          },
          skills: {
            Hit: {
              name: "Hit",
              castTime: 1,
              tags: ["DirectDamage"],
              action: [{ type: "damage", time: 0, phyCoef: 1, attrCoef: 1 }],
            },
          },
          eventDefinitions: {
            HP: { name: "Target HP", castTime: 0, action: [{ type: "setTargetHP", time: 0 }], tags: ["Event"] },
          },
          dots: {},
          effectDefinitions: asEffectDefinitions(windBuffs),
          weapons,
          innerWayConditions: Array.from({ length: tier + 1 }, (_, currentTier) => `MistwingT${currentTier}`),
          innerWayRules: Array.from({ length: tier + 1 }, (_, currentTier) =>
            (definition.effect[`MistwingT${currentTier}`].effect ?? []).flatMap((item): InnerWayEffectRule[] => {
              if (!damageRules && Object.keys(statEffectFor(item)).length === 0) return []
              return [
                {
                  requirement: item.requirement,
                  effect: (item.effect as EditableObject | undefined) ?? statEffectFor(item),
                  source: "Mistwing",
                  tier: currentTier,
                },
              ]
            }),
          ).flat(),
          setupEffects: [],
          initialBuffs: buffs.map((name): TrackedEffect => ({ name, stack: 1 })),
        },
        startAnchor: { rowId: "rotation-1" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons,
        attunement: emptyAttunementStats,
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }).actionBreakdowns["rotation-1:0"]
    // One resolved point of penetration is worth 1/200 of its channel.
    const penetration = (
      channel: "physical" | "bamboocut",
      tier: number,
      targetHPRatio: number,
      buffs: string[] = [],
    ) => {
      const baseline = run(tier, targetHPRatio, buffs, false)[channel]
      return (run(tier, targetHPRatio, buffs, true)[channel] / baseline - 1) * 200
    }
    const close = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-6, message)

    // Normal raw passives grant nothing until a completed missing-HP interval.
    for (const [hp, expected] of [
      [1, 0],
      [0.81, 0],
      [0.79, 1],
      [0.59, 2],
      [0.39, 3],
      [0.19, 4],
      [0, 4],
    ]) {
      close(penetration("physical", 0, hp), expected, `T0 at ${hp * 100}% target HP`)
    }
    for (const [tier, hp, enhancement, physical, attribute] of [
      [1, 0.99, "", 3, 0],
      [3, 0.79, "", 4, 0],
      [3, 0.79, "Flamelash", 5, 0],
      [3, 0.19, "Flamelash", 11, 0],
      [4, 0.99, "", 6, 6],
      [4, 0.79, "", 7, 7],
      [4, 0.79, "Inebriate", 8, 8],
      [5, 0.79, "", 7, 7],
      [6, 0.99, "Inebriate", 12, 12],
      [6, 0.89, "", 7, 7],
      [6, 0.79, "Inebriate", 16, 16],
      [6, 0.59, "Inebriate", 20, 20],
    ] as const) {
      const buffs = enhancement ? [enhancement] : []
      close(penetration("physical", tier, hp, buffs), physical, `T${tier} Physical at ${hp} HP`)
      close(penetration("bamboocut", tier, hp, buffs), attribute, `T${tier} Bamboocut at ${hp} HP`)
    }
    for (const enhancement of ["Flamelash", "FlowerBurial", "Inebriate"]) {
      close(penetration("physical", 3, 0.79, [enhancement]), 5, `${enhancement} doubles T3 HP scaling`)
      const flat = enhancement === "Inebriate" ? 12 : 6
      close(penetration("physical", 6, 0.79, [enhancement]), flat + 4, `${enhancement} T6 Physical scaling`)
      close(penetration("bamboocut", 6, 0.79, [enhancement]), flat + 4, `${enhancement} T6 attribute scaling`)
    }
  })
})
