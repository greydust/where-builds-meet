import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationDamageEntry, RotationSimulationBaseline } from "@/calculations/rotationCalculator"
import type { TimelineBuildInput } from "@/calculations/rotationTimeline"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"

/** The Affinity rate the sixth hit resolved, named when it resolved none. */
function affinityOnSixthHit(baseline: RotationSimulationBaseline) {
  const rates = baseline.actionBreakdowns["rotation-0:5"].outcomeRates
  assert(rates, "The sixth Insightful Strike hit must resolve its outcome rates.")
  return rates.affinity
}

// Ported from script/probe/check-insightful-strike.mjs.
describe("insightful-strike", () => {
  it("Insightful Strike Focus decay, reset, probability, timing, and damage checks passed", async () => {
    const {
      ExpectedInsightfulStrikeTracker,
      SimulatedInsightfulStrikeTracker,
      insightfulStrikeDirectAffinityBonus,
      insightfulStrikeEffectFor,
    } = await import("@/calculations/insightfulStrike.ts")
    const { calculateRotationBaseline, calculateRotationDamageSequence } = await probeLoad<
      typeof import("@/calculations/rotationCalculator")
    >("/src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("@/calculations/effectiveStats.ts")
    const { emptyStats } = await import("@/data/statDefinitions.ts")
    const { outcomeBuffTick } = await import("@/calculations/outcomeTriggeredBuffs.ts")
    const concentration = (await import("@gamedata/buff/bellstrike-umbra.json")).default.Concentration
    const insightfulStrikeDefinition = (await import("@gamedata/innerway/insightful-strike.json")).default

    const closeTo = (actual: number, expected: number, message: string, tolerance = 1e-9) =>
      assertClose(actual, expected, tolerance, message)
    const rule = {
      source: "InsightfulStrike",
      tier: 0,
      effect: {},
      trigger: {
        event: "damageOutcome",
        outcome: "affinity",
        target: "self",
        resource: insightfulStrikeDefinition.effect.InsightfulStrikeT0.trigger[0].resource,
        action: [{ type: "apply", target: "self", value: "Concentration", stack: 1, reapply: true }],
      },
    }
    const insightfulStrike = insightfulStrikeEffectFor([rule], { Concentration: concentration })
    assert(insightfulStrike, "Insightful Strike outcome-resource data was not recognized.")

    const simulated = new SimulatedInsightfulStrikeTracker()
    for (const second of [0, 1, 2]) simulated.resolveAffinity(insightfulStrike, outcomeBuffTick(second))
    closeTo(
      Number(simulated.concentrationActive(insightfulStrike, outcomeBuffTick(3))),
      0,
      "Three Affinity hits must not activate Concentration",
    )
    simulated.resolveAffinity(insightfulStrike, outcomeBuffTick(3))
    closeTo(
      Number(simulated.concentrationActive(insightfulStrike, outcomeBuffTick(3))),
      0,
      "Four one-second-spaced hits remain below the five-Focus threshold",
    )

    const immediate = new SimulatedInsightfulStrikeTracker()
    for (let hit = 0; hit < 5; hit += 1) immediate.resolveAffinity(insightfulStrike, outcomeBuffTick(0))
    closeTo(
      Number(immediate.concentrationActive(insightfulStrike, outcomeBuffTick(0))),
      1,
      "Five immediate Affinity hits must activate Concentration",
    )
    for (let hit = 0; hit < 3; hit += 1) immediate.resolveAffinity(insightfulStrike, outcomeBuffTick(1))
    closeTo(
      Number(immediate.concentrationActive(insightfulStrike, outcomeBuffTick(10))),
      0,
      "Three post-conversion hits prove Focus reset to zero and cannot refresh Concentration",
    )

    const t4Modifier = insightfulStrikeDefinition.effect.InsightfulStrikeT4.effect[0]
    const insightfulStrikeT4 = insightfulStrikeEffectFor(
      [rule, { source: "InsightfulStrike", tier: 4, effect: {}, ...t4Modifier }],
      { Concentration: concentration },
    )
    assert(insightfulStrikeT4, "Insightful Strike T4 Focus generation was not recognized.")
    const t4Simulation = new SimulatedInsightfulStrikeTracker()
    for (let hit = 0; hit < 4; hit += 1) t4Simulation.resolveAffinity(insightfulStrikeT4, outcomeBuffTick(0))
    closeTo(
      Number(t4Simulation.concentrationActive(insightfulStrikeT4, outcomeBuffTick(0))),
      1,
      "T4 must reach Concentration after four immediate Affinity outcomes",
    )

    const t3Modifier = insightfulStrikeDefinition.effect.InsightfulStrikeT3.effect[0]
    const t3Rule = { source: "InsightfulStrike", tier: 3, effect: {}, ...t3Modifier }
    const insightfulStrikeT3 = insightfulStrikeEffectFor([rule, t3Rule], { Concentration: concentration })
    assert(insightfulStrikeT3, "Insightful Strike T3 Concentration modifier was not recognized.")
    closeTo(
      insightfulStrikeDirectAffinityBonus(insightfulStrikeT3, { selfHPPercentage: 100, targetHPPercentage: 99 }),
      0.03,
      "T3 must grant both Direct Affinity bonuses when self HP is higher than target HP",
    )
    closeTo(
      insightfulStrikeDirectAffinityBonus(insightfulStrikeT3, { selfHPPercentage: 98, targetHPPercentage: 99 }),
      0.015,
      "T3 must retain only its base Direct Affinity bonus when self HP is not higher",
    )

    const expected = new ExpectedInsightfulStrikeTracker()
    for (let hit = 0; hit < 5; hit += 1) expected.resolveAffinity(insightfulStrike, outcomeBuffTick(0), 0.5)
    closeTo(
      expected.expectedConcentration(insightfulStrike, outcomeBuffTick(0)),
      0.03125,
      "Expected calculation must preserve the probability of five Affinity outcomes",
    )

    // Boundary timing, fractional decay, restarted timers, and complete depletion.
    for (const [times, active] of [
      [[0, 0, 0, 0, 3], true],
      [[0, 0, 0, 0, 3.0001], false],
      [[0, 0, 0, 0, 4, 4], true],
      [[0, 1, 2, 3, 6], true],
      [[0, 0, 0, 0, 12], false],
    ] as const) {
      const tracker = new SimulatedInsightfulStrikeTracker()
      for (const time of times) tracker.resolveAffinity(insightfulStrike, outcomeBuffTick(time))
      assert(tracker.concentrationActive(insightfulStrike, outcomeBuffTick(times.at(-1)!)) === active)
    }
    simulated.resolveAffinity(insightfulStrike, outcomeBuffTick(4))
    assert(
      simulated.concentrationActive(insightfulStrike, outcomeBuffTick(4)),
      "One-second-spaced hits must restart the delay and activate on the fifth hit",
    )

    // Compare the probability model against every concrete outcome history.
    // Failed hits must neither gain Focus nor restart its delay.
    const times = [0, 1, 2, 5.5, 6, 6.5, 7, 10.5, 11]
    const probabilityTracker = new ExpectedInsightfulStrikeTracker()
    for (const time of times) probabilityTracker.resolveAffinity(insightfulStrike, outcomeBuffTick(time), 0.4, 0.7)
    let enumerated = 0
    for (let mask = 0; mask < 2 ** times.length; mask += 1) {
      const tracker = new SimulatedInsightfulStrikeTracker()
      let probability = 1
      for (const [index, time] of times.entries()) {
        const tick = outcomeBuffTick(time)
        const chance = tracker.concentrationActive(insightfulStrike, tick) ? 0.7 : 0.4
        const affinity = Boolean(mask & (1 << index))
        probability *= affinity ? chance : 1 - chance
        if (affinity) tracker.resolveAffinity(insightfulStrike, tick)
      }
      if (tracker.concentrationActive(insightfulStrike, outcomeBuffTick(11))) enumerated += probability
    }
    closeTo(
      probabilityTracker.expectedConcentration(insightfulStrike, outcomeBuffTick(11)),
      enumerated,
      "Expected tracking must agree with all concrete histories across decay deadlines",
    )

    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, directAffinity: 1 }
    const enemy = {
      name: "Insightful Strike probe",
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
      rotation: { name: "Insightful Strike probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          name: "Six-hit probe",
          castTime: 0,
          tags: ["MartialArts"],
          action: Array.from({ length: 6 }, (_, index) => ({
            type: "damage",
            phyCoef: 1,
            attrCoef: 1,
            time: index < 5 ? 0 : 0.0001,
          })),
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Concentration: concentration },
      innerWayConditions: ["InsightfulStrikeT0"],
      innerWayRules: [rule],
      setupEffects: [],
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
    const concentrations = result.baseline.map((entry: RotationDamageEntry) =>
      entry.id ? result.expectedOutcomeBuffSchedule[entry.id]?.Concentration : undefined,
    )
    assert(
      JSON.stringify(concentrations) === JSON.stringify([0, 0, 0, 0, 0, 1]),
      `Concentration must begin after the fifth hit and affect the sixth; received ${concentrations}.`,
    )
    const simulatedDamage = calculateRotationDamageSequence(result.baseline, () => 0.5)
    assert(
      simulatedDamage[5].breakdown.total > simulatedDamage[4].breakdown.total,
      "Active Concentration must increase the sixth Affinity hit's damage.",
    )

    const withDot = structuredClone(result.baseline)
    withDot[0].context.isDot = true
    const dotSequence = calculateRotationDamageSequence(withDot, () => 0.5)
    closeTo(
      dotSequence[5].breakdown.total,
      dotSequence[4].breakdown.total,
      "A DOT Affinity outcome must not generate Focus",
    )

    const probabilisticStats = { ...stats, directAffinity: 0.5 }
    const probabilisticT0 = calculateRotationBaseline({
      timeline,
      startAnchor: { rowId: "rotation-0" },
      stats: probabilisticStats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(probabilisticStats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const probabilisticT3 = calculateRotationBaseline({
      timeline: {
        ...timeline,
        innerWayConditions: ["InsightfulStrikeT0", "InsightfulStrikeT1", "InsightfulStrikeT2", "InsightfulStrikeT3"],
        innerWayRules: [rule, t3Rule],
      },
      startAnchor: { rowId: "rotation-0" },
      stats: probabilisticStats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(probabilisticStats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const t0SixthAffinity = affinityOnSixthHit(probabilisticT0)
    const t3SixthAffinity = affinityOnSixthHit(probabilisticT3)
    closeTo(
      t3SixthAffinity - t0SixthAffinity,
      0.0009375,
      "Deterministic T3 damage must weight its 3% Direct Affinity by the 3.125% active Concentration branch",
    )
  })
})
