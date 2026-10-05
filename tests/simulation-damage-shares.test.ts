import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { RotationStep } from "@/calculations/rotationTimeline"
import type { CharacterStats } from "@/types"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"

const closeTo = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-8, message)

const enemy = {
  name: "Damage share probe",
  level: 96,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}

/** Two normal hits, one critical hit, then one affinity hit. */
const rolls = [0.1, 0.5, 0.9, 0.2]

/**
 * Minimum and maximum attack are equal, so every hit consumes exactly one random
 * draw and each outcome's damage is exactly 100 times its multiplier: Normal 100,
 * Critical 150, Affinity 200. Precision 1 removes abrasion, and the outcome rates
 * are 0 / 0.25 / 0.75 / 1, so the rolls select the four outcomes above.
 */
const shareStats = {
  minPhys: 100,
  maxPhys: 100,
  precision: 1,
  crit: 0.5,
  critDmgBonus: 0.5,
  directAffinity: 0.25,
  affinityDmgBonus: 1,
}

const createBundle = async (tags: string[] = []): Promise<RotationSimulationBundle> => {
  const { calculateDerivedStats } = await import("@/calculations/effectiveStats")
  const { emptyStats } = await import("@/data/statDefinitions")
  const stats: CharacterStats = { ...emptyStats, ...shareStats }
  return {
    timeline: {
      rotation: { name: "Damage share probe", steps: rolls.map((): RotationStep => ({ type: "skill", skill: "Hit" })) },
      skills: { Hit: { name: "Hit", castTime: 1, tags, action: [{ type: "damage", time: 1, phyCoef: 1 }] } },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
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
  }
}

describe("simulation damage shares", () => {
  it("Outcome shares must measure damage rather than hit count", async () => {
    const { simulateRotation } = await probeLoad<typeof import("../src/calculations/simulationCalculator")>(
      "/src/calculations/simulationCalculator.ts",
    )
    const bundle = await createBundle()
    let draws = 0
    const run = simulateRotation(bundle, 1, () => {
      assert(draws < rolls.length, "Each damage hit must consume exactly one outcome draw")
      return rolls[draws++]
    }).results.best
    assert(draws === rolls.length, "Every authored hit must consume one outcome draw")

    closeTo(run.totalDamage, 550, "The run must total the sampled outcome damages")
    closeTo(run.normalPercentage, (200 / 550) * 100, "Normal share must weight damage, not hit count")
    closeTo(run.criticalPercentage, (150 / 550) * 100, "Critical share must weight damage, not hit count")
    closeTo(run.affinityPercentage, (200 / 550) * 100, "Affinity share must weight damage, not hit count")
    closeTo(run.abrasionPercentage, 0, "Precision 1 leaves no abrasion damage")
    assert(Math.abs(run.normalPercentage - 50) > 1e-8, "A hit-count basis would report 50% normal for two of four hits")
    closeTo(
      run.normalPercentage + run.criticalPercentage + run.affinityPercentage,
      100,
      "The four damage shares must total the run's damage",
    )
  })

  it("A Mystic Vitality deficit must scale the shares and their denominator together", async () => {
    const { simulateRotation } = await probeLoad<typeof import("../src/calculations/simulationCalculator")>(
      "/src/calculations/simulationCalculator.ts",
    )
    const bundle = await createBundle(["Mystic"])
    bundle.timeline.skills.Hit = {
      name: "Hit",
      castTime: 1,
      tags: ["Mystic"],
      action: [
        { type: "consumeResource", value: "Vitality", amount: 20, time: 0 },
        { type: "damage", time: 1, phyCoef: 1 },
      ],
    }
    bundle.timeline.initialResources = { Vitality: 40 }
    let draws = 0
    const run = simulateRotation(bundle, 1, () => rolls[draws++] ?? 0).results.best

    // 80 consumed against 40 initial leaves 40 available, so every hit keeps half.
    assert(run.totalDamage < 550, "The Vitality deficit must reduce the sampled run's total damage")
    closeTo(run.totalDamage, 275, "A 0.5 Vitality deficit must halve the fully Mystic run")
    closeTo(run.normalPercentage, (200 / 550) * 100, "Uniform Mystic scaling must preserve the shares")
    closeTo(run.criticalPercentage, (150 / 550) * 100, "Uniform Mystic scaling must preserve the shares")
    closeTo(run.affinityPercentage, (200 / 550) * 100, "Uniform Mystic scaling must preserve the shares")
    closeTo(
      run.normalPercentage + run.criticalPercentage + run.affinityPercentage,
      100,
      "A deficit-scaled run must still report shares that total 100%",
    )
  })
})
