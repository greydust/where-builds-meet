import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

// Ported from script/probe/check-skill-static-effect-aggregation.mjs.
describe("skill-static-effect-aggregation", () => {
  it("Skill-static effect aggregation checks passed", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { withCalculationBenchmark } = await import("../src/calculations/calculationBenchmark.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Skill-static effect aggregation probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    /** One row the benchmark reports: the phase it timed and how many calls it saw. */
    type BenchmarkRow = { phase: string; calls: number }
    const originalTable = console.table
    let benchmarkRows: BenchmarkRow[] = []
    console.table = rows => {
      benchmarkRows = rows.filter((row: unknown): row is BenchmarkRow => {
        if (typeof row !== "object" || row === null) return false
        const candidate = row as Partial<BenchmarkRow>
        return typeof candidate.phase === "string" && typeof candidate.calls === "number"
      })
    }
    const result = withCalculationBenchmark("skill-static aggregation probe", () =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Skill-static effect aggregation probe",
            steps: [
              { type: "skill", skill: "ChargedMultiHit" },
              { type: "skill", skill: "UntaggedHit" },
            ],
          },
          skills: {
            ChargedMultiHit: {
              name: "Charged Multi-hit",
              castTime: 0.2,
              action: [
                { type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 },
                { type: "apply", target: "target", value: "Vulnerable", time: 0.1 },
                { type: "damage", phyCoef: 1, attrCoef: 1, time: 0.2 },
              ],
              modifier: [],
              tags: ["DirectDamage", "Charged"],
            },
            UntaggedHit: {
              name: "Untagged Hit",
              castTime: 0.1,
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 }],
              modifier: [],
              tags: ["DirectDamage"],
            },
          },
          eventDefinitions: {},
          dots: {},
          effectDefinitions: {
            Vulnerable: { duration: 10, maxStack: 1, refresh: true, effect: [{ effect: { dmgBonus: 0.3 } }] },
          },
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects: [
            { stat: { minPhys: 10, maxPhys: 10 } },
            { requirement: [{ target: "skillTag", value: "Charged" }], stat: { minPhys: 10, maxPhys: 10 } },
            { requirement: [{ target: "skillTag", value: "Charged" }], effect: { dmgBonus: 0.2 } },
            { requirement: [{ target: "target", value: "Vulnerable" }], effect: { dmgBonus: 0.4 } },
          ],
          weapons: [],
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
      }),
    )
    console.table = originalTable

    assert(
      Math.abs(result.metrics.totalDamage - 559) < 1e-9,
      `Expected character-static, cached tag-static, and hit-time effects to total 559 damage; received ${result.metrics.totalDamage}.`,
    )
    assert(
      benchmarkRows.some(row => row.phase === "Skill-static effect aggregation (cache misses)" && row.calls === 2),
      "The calculator must resolve static effects once for each distinct effective action-tag signature.",
    )
    assert(
      benchmarkRows.some(row => row.phase === "Remaining per-hit effect field scan (parent)" && row.calls === 3),
      "The benchmark must still report one residual dynamic-effect scan per damage hit.",
    )
  })
})
