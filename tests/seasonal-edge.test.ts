import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, InnerWayEffectRule, TimelineBuildInput } from "@/calculations/rotationTimeline"
import type { InnerWayTierEffect } from "@/data/innerWayDefinitions"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"
import { asEffectDefinitions } from "./helpers/shippedData"

// Ported from script/probe/check-seasonal-edge.mjs.
describe("seasonal-edge", () => {
  it("Seasonal Edge chance branches, proc window, damage, simulation, and Vitality range checks passed", async () => {
    const { calculateRotationBaseline, calculateRotationDamageSequence } = await probeLoad<
      typeof import("../src/calculations/rotationCalculator")
    >("/src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { buildRotationTimeline, mergeCalculatedTimelineState } = await probeLoad<
      typeof import("../src/calculations/rotationTimeline")
    >("/src/calculations/rotationTimeline.ts")
    const { seasonalEdgeEffectFor, seasonalEdgeWindows } = await probeLoad<
      typeof import("../src/calculations/seasonalEdge")
    >("/src/calculations/seasonalEdge.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const generalBuffs = (await import("../data/buff/general.json")).default
    const seasonalDefinition = (await import("../data/innerway/seasonal-edge.json")).default
    const closeTo = (actual: number, expected: number, message: string, tolerance = 1e-8) =>
      assertClose(actual, expected, tolerance, message)

    const trigger = seasonalDefinition.effect.SeasonalEdgeT0.trigger[0]
    const noStatEffect: EditableObject = {}
    const rule: InnerWayEffectRule = { source: "SeasonalEdge", tier: 0, effect: noStatEffect, trigger }
    const seasonalTier = (tier: number) =>
      (seasonalDefinition.effect as Record<string, InnerWayTierEffect | undefined>)[`SeasonalEdgeT${tier}`]
    /**
     * Read a record out of an authored tier, or nothing when it is not one. A
     * tier's fields are read as `unknown`, so going from that to a record the
     * rule can hold needs one assertion; it is stated here rather than at each
     * field below.
     */
    const asAuthoredRecord = (value: unknown): EditableObject | undefined =>
      typeof value === "object" && value !== null && !Array.isArray(value) ? (value as EditableObject) : undefined

    /** A tier either names a stat directly or carries a nested effect record. */
    const statEffectOf = (entry: EditableObject): EditableObject =>
      entry.stat ? { stat: entry.stat } : (asAuthoredRecord(entry.effect) ?? noStatEffect)
    const rulesThroughTier = (tier: number): InnerWayEffectRule[] => [
      rule,
      ...Array.from({ length: tier }, (_, index) => index + 1).flatMap(currentTier =>
        (seasonalTier(currentTier)?.effect ?? []).map((effect: EditableObject) => ({
          source: "SeasonalEdge",
          tier: currentTier,
          effect: statEffectOf(effect),
          target: typeof effect.target === "string" ? effect.target : undefined,
          modify: asAuthoredRecord(effect.modify),
        })),
      ),
    ]
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Seasonal Edge probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const timeline: TimelineBuildInput = {
      rotation: {
        name: "Seasonal Edge probe",
        steps: [
          { type: "skill", skill: "Conversion" },
          { type: "event", event: "Delay", duration: 5 },
          { type: "skill", skill: "MartialHit" },
          { type: "skill", skill: "MysticHit" },
          { type: "event", event: "Delay", duration: 10 },
          { type: "skill", skill: "Conversion" },
          { type: "skill", skill: "MartialHit" },
        ],
      },
      skills: {
        Conversion: { name: "Conversion", castTime: 1, tags: ["Conversion"], action: [] },
        MartialHit: {
          name: "Martial hit",
          castTime: 0.1,
          tags: ["MartialArts"],
          action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 }],
        },
        MysticHit: {
          name: "Mystic hit",
          castTime: 0.1,
          tags: ["Mystic"],
          action: [
            { type: "consumeResource", value: "Vitality", amount: 20, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 },
          ],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: asEffectDefinitions(generalBuffs),
      innerWayConditions: ["SeasonalEdgeT0"],
      innerWayRules: [rule],
      setupEffects: [],
      weapons: [],
      initialResources: { Vitality: 10 },
      resourceMaximums: { Vitality: 100 },
    }
    const effectThroughTier = (tier: number) => {
      const effect = seasonalEdgeEffectFor(rulesThroughTier(tier), asEffectDefinitions(generalBuffs))
      assert(effect, `Seasonal Edge T${tier} must resolve an effect from its own rules.`)
      return effect
    }
    const t1 = effectThroughTier(1)
    closeTo(t1.duration, 12, "T1 must extend the shared season duration from eight to twelve seconds")
    const t3 = effectThroughTier(3)
    closeTo(
      t3.outcomes.filter(outcome => outcome.buffs.length === 2).reduce((total, outcome) => total + outcome.weight, 0),
      0.3,
      "T3 must grant two distinct seasons in 30% of proc branches",
    )
    if (t3.outcomes.some(outcome => new Set(outcome.buffs).size !== outcome.buffs.length))
      throw new Error("T3 must roll its second season without replacement.")
    const t4 = effectThroughTier(4)
    if (!t4.additionalSkills.includes("SereneBreeze"))
      throw new Error("T4 must allow Serene Breeze to trigger Seasonal Edge.")
    const t6 = effectThroughTier(6)
    if (t6.outcomes.some(outcome => outcome.buffs.includes("Frost")))
      throw new Error("T6 must remove Frost from every possible outcome.")
    closeTo(
      t6.outcomes.filter(outcome => outcome.buffs.length === 1).reduce((total, outcome) => total + outcome.weight, 0),
      0.5,
      "T6 must grant one season in 50% of proc branches",
    )
    closeTo(
      t6.outcomes.filter(outcome => outcome.buffs.length === 2).reduce((total, outcome) => total + outcome.weight, 0),
      0.3,
      "T6 must grant two seasons in 30% of proc branches",
    )
    closeTo(
      t6.outcomes.filter(outcome => outcome.buffs.length === 3).reduce((total, outcome) => total + outcome.weight, 0),
      0.2,
      "T6 must grant all three remaining seasons in 20% of proc branches",
    )
    const sereneTimeline = buildRotationTimeline({
      ...timeline,
      rotation: { name: "Serene Breeze T4 probe", steps: [{ type: "skill", skill: "SereneBreeze" }] },
      skills: { SereneBreeze: { name: "Serene Breeze", castTime: 1, tags: ["Mystic"], action: [] } },
    })
    if (seasonalEdgeWindows(sereneTimeline, t3).length !== 0 || seasonalEdgeWindows(sereneTimeline, t4).length !== 1)
      throw new Error("Serene Breeze must begin triggering Seasonal Edge at T4, and not before T4.")
    const result = calculateRotationBaseline({
      timeline,
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    closeTo(
      result.actionBreakdowns["rotation-2:0"].total,
      105,
      "The martial hit must average the neutral and 20% Flare branches",
    )
    closeTo(
      result.actionBreakdowns["rotation-3:1"].total,
      102.5,
      "The Mystic hit must average the neutral and 10% Yield branches",
    )
    closeTo(
      result.actionBreakdowns["rotation-6:0"].total,
      100,
      "A Conversion used during the 30-second cooldown must not open a new season window",
    )
    const cooldownPlate = result.timeline[1].buffs.get("SeasonalEdgeCooldown")
    if (!cooldownPlate) throw new Error("Seasonal Edge must expose its deterministic cooldown as a timeline buff.")
    closeTo(cooldownPlate.expiresAt ?? 0, 31, "Seasonal Edge cooldown must expire 30 seconds after the trigger")
    if (
      Object.values(result.actionBreakdowns).some(
        breakdown => breakdown.expectedBuffStacks?.SeasonalEdgeCooldown !== undefined,
      )
    )
      throw new Error("Seasonal Edge cooldown must not be represented as a probability-weighted buff plate.")
    const mysticState = result.timeline[3]!.actionStates[1]!
    const vitalityRange = mysticState.resourceRanges?.Vitality
    assert(vitalityRange, "A consumed resource must carry its range.")
    const closeRange = (field: "minimum" | "maximum" | "expected") => {
      const value = vitalityRange[field]
      assert(value !== undefined, `A resource range must carry its ${field}.`)
      return value
    }
    closeTo(mysticState.resources.Vitality, -10, "Vitality consumption must be allowed below zero")
    closeTo(closeRange("minimum"), -10, "The Vitality lower bound must exclude Yield")
    if (!(closeRange("maximum") > -10))
      throw new Error("The Vitality upper bound must include possible Yield regeneration.")
    if (!(closeRange("expected") > closeRange("minimum") && closeRange("expected") < closeRange("maximum")))
      throw new Error("Expected Vitality must probability-weight Yield between its lower and upper bounds.")
    closeTo(
      result.mysticVitalityDamageScale,
      0.625,
      "A resource-surplus Yield branch must not erase the Mystic damage loss from deficit branches",
    )
    const resourceBoostedResult = calculateRotationBaseline({
      timeline: {
        ...timeline,
        skills: {
          ...timeline.skills,
          Conversion: {
            ...timeline.skills.Conversion,
            action: [{ type: "heal", phyCoef: 0, silkbindCoef: 0, time: 0 }],
          },
        },
        setupEffects: [
          { trigger: { event: "heal", cooldown: 3, action: { type: "addResource", value: "Vitality", amount: 2 } } },
        ],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    if (
      resourceBoostedResult.mysticVitalityDamageScale <= result.mysticVitalityDamageScale ||
      resourceBoostedResult.metrics.totalDamage <= result.metrics.totalDamage
    )
      throw new Error("Healing-triggered Vitality must improve expected Mystic damage while deficit branches remain.")
    const displayedTimeline = mergeCalculatedTimelineState(buildRotationTimeline(timeline), result.timeline)
    const displayedMysticState = displayedTimeline[3]!.actionStates[1]!
    const displayedVitality = displayedMysticState.resourceRanges?.Vitality
    assert(displayedVitality, "The displayed Vitality consumption must carry its range.")
    closeTo(
      displayedVitality.minimum ?? 0,
      -10,
      "Calculated Vitality bounds must survive the editor's structural-timeline merge",
    )

    const flareSimulation = calculateRotationDamageSequence(result.baseline, () => 0.3)
    closeTo(flareSimulation[0].breakdown.total, 120, "A simulated Flare branch must persist through its proc window")
    closeTo(flareSimulation[1].breakdown.total, 100, "Flare must not increase Mystic Skill damage")
    closeTo(flareSimulation[2].breakdown.total, 100, "The cooldown-blocked Conversion must not reroll Flare")
    const yieldSimulation = calculateRotationDamageSequence(result.baseline, () => 0.6)
    closeTo(yieldSimulation[0].breakdown.total, 100, "Yield must not increase Martial Art damage")
    closeTo(yieldSimulation[1].breakdown.total, 110, "A simulated Yield branch must increase Mystic Skill damage")
    closeTo(yieldSimulation[2].breakdown.total, 100, "The cooldown-blocked Conversion must not reroll Yield")
  })
})
