import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { HawkwingEffect } from "@/calculations/hawkwing"
import type { EditableObject, TimelineBuildInput } from "@/calculations/rotationTimeline"
import type { EffectiveStatEffectContainer, StatEffectContainer } from "@/calculations/statEffects"

import { assertClose } from "./helpers/floatEquality"

/**
 * A setup effect as both readers of it want it.
 *
 * The timeline takes any untyped object; the stat pipeline takes a stat sheet.
 * A setup effect that carries neither is inert for the stat pipeline, so both
 * readings are named here rather than casting at each call.
 */
type SetupEffect = EditableObject & StatEffectContainer & EffectiveStatEffectContainer

// Ported from script/probe/check-hawkwing.mjs.
describe("hawkwing", () => {
  it("Hawkwing probability, expiry, damage, and display-metric checks passed", async () => {
    const { calculateRotationBaseline, calculateRotationComparisons, calculateRotationDamageSequence } =
      await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { ExpectedHawkwingTracker } = await import("../src/calculations/hawkwing.ts")
    const { outcomeBuffTick } = await import("../src/calculations/outcomeTriggeredBuffs.ts")
    const closeTo = (actual: number | undefined, expected: number, message: string) =>
      assertClose(actual, expected, 1e-9, message)
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, affinity: 0.2 }
    const enemy = {
      name: "Hawkwing probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const skill = {
      name: "Three-hit probe",
      castTime: 1.5,
      tags: ["MartialArts"],
      action: [0.5, 1, 1.5].map(time => ({ type: "damage", phyCoef: 1, attrCoef: 1, time })),
    }
    const hawkwingDefinition = {
      name: "Hawkwing",
      duration: 5,
      maxStack: 5,
      refresh: true,
      stackEffects: Array.from({ length: 5 }, (_, index) => [{ effect: { physicalAttackBonus: (index + 1) * 0.02 } }]),
    }
    const affinityTrigger: SetupEffect = {
      trigger: {
        event: "damageOutcome",
        outcome: "affinity",
        action: { type: "apply", target: "self", value: "Hawkwing", stack: 1, reapply: true },
      },
    }
    const timeline: TimelineBuildInput = {
      rotation: { name: "Hawkwing probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: skill },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Hawkwing: hawkwingDefinition },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [affinityTrigger],
      weapons: [],
    }
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
    const scheduledStacks = result.baseline.map(entry => scheduleFor(result, entry.id))
    closeTo(scheduledStacks[0], 0, "The first hit must occur before Hawkwing can proc")
    closeTo(scheduledStacks[1], 0.2, "The second hit must use the first hit's Affinity probability")
    closeTo(scheduledStacks[2], 0.4, "Probability branches must merge into the third hit's expected stack")
    closeTo(result.metrics.expectedHawkwingStacks, 0.2, "The displayed stack metric must average the per-hit values")
    result.baseline.forEach((entry, index) =>
      closeTo(
        result.actionBreakdowns[rowIdOf(entry.id)]?.expectedBuffStacks?.Hawkwing,
        scheduledStacks[index],
        `Action ${index + 1} must expose its expected Hawkwing stack for the timeline buff plate`,
      ),
    )

    const resultWithNonDamageEntries = calculateRotationBaseline({
      timeline: {
        ...timeline,
        rotation: {
          name: "Hawkwing non-damage exclusion probe",
          steps: [
            { type: "event", event: "Delay", duration: 1 },
            { type: "skill", skill: "Heal" },
            { type: "skill", skill: "Probe" },
          ],
        },
        skills: {
          ...timeline.skills,
          Heal: {
            name: "Heal",
            castTime: 0,
            tags: ["Heal"],
            action: [{ type: "heal", phyCoef: 1, silkbindCoef: 1, time: 0 }],
          },
        },
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
    closeTo(
      resultWithNonDamageEntries.metrics.expectedHawkwingStacks,
      0.2,
      "The displayed stack metric must exclude delays and healing actions from its per-damage average",
    )

    const tracker = new ExpectedHawkwingTracker()
    const buff: HawkwingEffect = {
      name: "Hawkwing",
      outcome: "affinity",
      durationTicks: outcomeBuffTick(5),
      maxStack: 5,
      physicalAttackBonusPerStack: 0.02,
    }
    tracker.resolveAffinity(buff, outcomeBuffTick(0), 1)
    closeTo(tracker.expectedStack(buff, outcomeBuffTick(4.9999)), 1, "A stack must remain active before expiry")
    closeTo(tracker.expectedStack(buff, outcomeBuffTick(5)), 0, "A stack must expire exactly at its 0.1 ms tick")
    assert(result.metrics.totalDamage > 300, "Expected Hawkwing stacks must increase later physical hits.")

    /** The stack the simulation scheduled for the damage entry on `rowId`. */
    function scheduleFor(baseline: typeof result, rowId: string | undefined) {
      return baseline.expectedOutcomeBuffSchedule[rowIdOf(rowId)]?.Hawkwing
    }
    function rowIdOf(rowId: string | undefined) {
      assert(rowId, "Every simulated damage entry must carry the timeline row it was dealt on.")
      return rowId
    }

    const guaranteedAffinityStats = { ...stats, directAffinity: 1 }
    const guaranteedAffinityResult = calculateRotationBaseline({
      timeline,
      startAnchor: { rowId: "rotation-0" },
      stats: guaranteedAffinityStats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(guaranteedAffinityStats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const simulatedStacks = calculateRotationDamageSequence(guaranteedAffinityResult.baseline, () => 0.5).map(
      row => row.expectedBuffStacks?.Hawkwing,
    )
    assert(
      JSON.stringify(simulatedStacks) === JSON.stringify([0, 1, 2]),
      `Simulation must advance concrete Hawkwing stacks after sampled Affinity hits; received ${simulatedStacks}.`,
    )

    const momentumAffinityEffect: SetupEffect = {
      stat: { affinity: { formula: { source: "momentum", multiplier: 0.001 } } },
    }
    const rawFormulaStats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const formulaSetupEffects: SetupEffect[] = [momentumAffinityEffect, affinityTrigger]
    const formulaTimeline = { ...timeline, setupEffects: formulaSetupEffects }
    const formulaState = calculateStatsWithEffects(rawFormulaStats, formulaSetupEffects, 0)
    const formulaBundle = {
      timeline: formulaTimeline,
      startAnchor: { rowId: "rotation-0" },
      stats: rawFormulaStats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: formulaState.derivedStats,
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }
    const formulaBaseline = calculateRotationBaseline(formulaBundle)
    const momentumSetupEffects: SetupEffect[] = [...formulaSetupEffects, { stat: { momentum: 200 } }]
    const comparisonMetrics = calculateRotationComparisons(
      {
        ...formulaBundle,
        setupComparisons: { momentum: [{ label: "Momentum setup", setupEffects: momentumSetupEffects }] },
      },
      formulaBaseline,
    )
    const momentumState = calculateStatsWithEffects(rawFormulaStats, momentumSetupEffects, 0)
    const independentlyRebuilt = calculateRotationBaseline({
      ...formulaBundle,
      timeline: { ...formulaTimeline, setupEffects: momentumSetupEffects },
      derivedStats: momentumState.derivedStats,
    })
    closeTo(
      comparisonMetrics.setupComparisons.momentum[0].dpsDifference,
      independentlyRebuilt.metrics.dps - formulaBaseline.metrics.dps,
      "A setup variant that changes Affinity indirectly through Momentum must rebuild its Hawkwing schedule",
    )
  })
})
