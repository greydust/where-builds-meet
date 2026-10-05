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
    const mistwing = (await import("../data/innerway/mistwing.json")).default
    const windBuffs = (await import("../data/buff/bamboocut-wind.json")).default
    const { innerWayAvailableForTag, innerWayDefinitions, innerWayDefinitionForSoloLevel } =
      await import("../src/data/innerWayDefinitions.ts")
    const { calculateRotationBaseline } = await probeLoad<typeof import("../src/calculations/rotationCalculator")>(
      "/src/calculations/rotationCalculator.ts",
    )
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")

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

    // T0 grants one Physical Penetration per completed 20% of missing target HP, capped at four.
    for (const [targetHPRatio, expected] of [
      [1, 1],
      [0.8, 1],
      [0.79, 2],
      [0.6, 2],
      [0.59, 3],
      [0.4, 3],
      [0.39, 4],
      [0.2, 4],
      [0, 4],
    ]) {
      close(penetration("physical", 0, targetHPRatio), expected, `T0 at ${targetHPRatio * 100}% target HP`)
    }

    // A target at 90% HP leaves 10% missing, the smallest band every tier still resolves.
    const nearFull = 0.9
    close(penetration("physical", 1, nearFull), 1 + 3, "T1 adds three flat Physical Penetration")
    close(penetration("bamboocut", 1, nearFull), 0, "T0 and T1 never grant attribute penetration")
    close(penetration("physical", 3, nearFull), 1 + 3, "T3 is inert without a Martial Art Special Enhancement")
    close(penetration("physical", 3, nearFull, ["Flamelash"]), 1 + 3 + 2, "T3 grants two per 10% under Flamelash")
    close(penetration("physical", 3, 0.6, ["Flamelash"]), 2 + 3 + 8, "T3 caps its Special Enhancement scaling at eight")
    for (const enhancement of ["Flamelash", "FlowerBurial", "Inebriate"]) {
      close(
        penetration("physical", 3, nearFull, [enhancement]),
        1 + 3 + 2,
        `${enhancement} must count as a Martial Art Special Enhancement at T3`,
      )
    }
    close(penetration("physical", 4, nearFull), 1 + 3 + 6, "T4 adds six Physical Penetration")
    close(penetration("bamboocut", 4, nearFull), 6, "T4 adds six of every attribute penetration")
    // T3's scaling is a Physical-only effect, so the enhancement can raise the
    // physical channel without touching T4's flat all-type penetration.
    close(penetration("physical", 4, nearFull, ["Inebriate"]), 1 + 3 + 6 + 2, "T4 retains the T3 scaling")
    close(penetration("bamboocut", 4, nearFull, ["Inebriate"]), 6, "T4's flat penetration does not scale")
    close(penetration("physical", 5, nearFull), 1 + 3 + 6, "T5 keeps the T4 penetration")

    // T6 replaces the base 20% step with a 10% step instead of stacking both.
    close(penetration("physical", 5, 0.8), 1 + 3 + 6, "T5 grants one base step at 20% missing")
    close(penetration("physical", 6, 0.8), 2 + 3 + 6, "T6 grants two base steps at 20% missing")
    close(penetration("physical", 6, 0.61), 4 + 3 + 6, "T6 base scaling still caps at four")
    close(penetration("bamboocut", 6, nearFull), 6, "T6 keeps six of every attribute penetration by default")
    // Inebriate is both a Special Enhancement and T6's own doubling condition, so it
    // adds the T3 scaling and one more six of every penetration on top of T4.
    close(
      penetration("physical", 6, nearFull, ["Inebriate"]),
      1 + 3 + 6 + 6 + 2,
      "T6 doubles every flat penetration in Inebriate",
    )
    close(penetration("bamboocut", 6, nearFull, ["Inebriate"]), 12, "T6 doubles attribute penetration in Inebriate")
    for (const enhancement of ["Flamelash", "FlowerBurial"]) {
      close(
        penetration("physical", 6, nearFull, [enhancement]),
        1 + 3 + 6 + 2,
        `T6 must not double penetration outside Inebriate (${enhancement})`,
      )
      close(
        penetration("bamboocut", 6, nearFull, [enhancement]),
        6,
        `T6 must not double attribute penetration outside Inebriate (${enhancement})`,
      )
    }
  })
})
