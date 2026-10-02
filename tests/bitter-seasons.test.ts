import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import debuffs from "../data/debuff/innerway.json"
import dots from "../data/dot/innerway.json"
import way from "../data/innerway/bitter-seasons.json"
import { withExpectedDebuffPlates } from "../src/application/gameData/skills"
import { calculateDamageBreakdown } from "../src/calculations/damage"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { ExpectedPeriodicTracker } from "../src/calculations/outcomeTriggeredBuffs"
import {
  calculateRotationBaseline,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "../src/calculations/rotationCalculator"
import {
  buildRotationTimeline,
  effectsForTrackedEffect,
  mergeCalculatedTimelineState,
  type TimelineBuildInput,
} from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { defaultGlobalDebuffs, globalDebuffTimelineEffects } from "../src/globalDebuffs"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowWithId } from "./helpers/timelineRows"

function inputFor(times: number[], tier = 0): TimelineBuildInput {
  const conditions = Array.from({ length: tier + 1 }, (_, index) => `BitterSeasonsT${index}`)
  const rules = conditions.flatMap((id, tier) => {
    const definition = way.effect[id as keyof typeof way.effect] as { trigger?: Record<string, unknown>[] }
    return (definition.trigger ?? []).map(trigger => ({ source: "BitterSeasons", tier, effect: {}, trigger }))
  })
  return {
    rotation: { name: "Bitter Seasons", steps: [{ type: "skill", skill: "Hits" }] },
    skills: {
      Hits: {
        name: "Hits",
        castTime: Math.max(...times, 0) + 12,
        tags: ["DirectDamage"],
        action: times.map(time => ({ type: "damage", phyCoef: 1, time })),
      },
    },
    dots: asSkillRecords(dots),
    effectDefinitions: asEffectDefinitions({ ...dots, ...debuffs }),
    eventDefinitions: {},
    innerWayConditions: conditions,
    innerWayRules: rules,
    setupEffects: [],
    weapons: [],
  }
}
const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 }
const enemy = {
  name: "Target",
  level: 96,
  defense: 408,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}
function bundleFor(input: TimelineBuildInput): RotationSimulationBundle {
  return {
    timeline: input,
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
const poisonRows = (input: TimelineBuildInput, roll?: () => number) =>
  buildRotationTimeline(input, roll).filter(row => row.kind === "dot")

describe("Bitter Seasons", () => {
  it.each([0, 1, 6])("preserves expected debuff badges through the editor timeline merge at tier %s", tier => {
    const input = inputFor([0, 1, 12], tier)
    const result = calculateRotationBaseline(bundleFor(input))
    const structural = buildRotationTimeline(input)
    for (const row of structural) {
      for (const state of Object.values(row.actionStates)) delete state.expectedDebuffStacks
    }
    const displayed = mergeCalculatedTimelineState(structural, result.timeline)
    const cast = rowWithId(displayed, "rotation-0")!
    const name = ({ 0: "QingyisCharmT0", 1: "QingyisCharmT1", 6: "QingyisCharmT6" } as Record<number, string>)[tier]
    const platesAt = (index: number) => {
      const state = cast.actionStates[index]
      return withExpectedDebuffPlates(Array.from(state.debuffs.values()), state.expectedDebuffStacks)
    }
    expect(platesAt(0).find(effect => effect.name === name)).toBeUndefined()
    expect(platesAt(1).find(effect => effect.name === name)).toEqual({
      name,
      stack: tier === 6 ? 0.15 : 0.1,
      maxStack: 5,
      hideRemainingTime: true,
      averageStackOnly: true,
    })
    expect(platesAt(2).find(effect => effect.name === name)).toBeUndefined()
  })

  it("keeps concrete debuff badges when no expected state replaces them", () => {
    const effects = [{ name: "QingyisCharmT6", stack: 5, maxStack: 5, persistent: true }]
    expect(withExpectedDebuffPlates(effects, {})).toEqual(effects)
    expect(withExpectedDebuffPlates(effects, undefined)).toEqual(effects)
  })

  it("reports expected debuff stacks and uptime, including expiration after the final damage tick", () => {
    const result = calculateRotationBaseline(bundleFor(inputFor([0])))
    const coverage = rowWithId(result.metrics.breakdown.debuffCoverage, "QingyisCharmT0")!
    // One application cannot reach the five-stack maximum.
    expect(coverage.maxStackCoverage).toBeCloseTo(0, 10)
    // Triggering hit precedes the proc; the five possible DOT output rows each see 0.1 expected stacks.
    expect(coverage.averageStacks).toBeCloseTo(0.5 / 6, 10)
  })

  it("integrates refreshed debuff probability and clips it to the combat cutoff", () => {
    const input = inputFor([0, 5])
    input.skills.Hits.castTime = 12
    const coverage = calculateRotationBaseline(bundleFor(input)).metrics.breakdown.debuffCoverage.find(
      row => row.id === "QingyisCharmT0",
    )!
    // Two applications cannot reach maximum stacks, with or without the start anchor.
    expect(coverage.maxStackCoverage).toBeCloseTo(0, 10)
    input.rotation.start = { step: 0, action: 1 }
    const bundle = bundleFor(input)
    bundle.startAnchor = { rowId: "rotation-0", actionIndex: 1 }
    const anchored = calculateRotationBaseline(bundle).metrics.breakdown.debuffCoverage.find(
      row => row.id === "QingyisCharmT0",
    )!
    expect(anchored.maxStackCoverage).toBeCloseTo(0, 10)
  })

  it.each([5, 6])("integrates the probability of reaching five stacks from %i simultaneous hits", count => {
    const input = inputFor(Array(count).fill(0))
    const probabilityAtMax = count === 5 ? 0.1 ** 5 : 6 * 0.1 ** 5 * 0.9 + 0.1 ** 6
    const coverage = calculateRotationBaseline(bundleFor(input)).metrics.breakdown.debuffCoverage.find(
      row => row.id === "QingyisCharmT0",
    )!
    expect(coverage.maxStackCoverage).toBeCloseTo((100 * probabilityAtMax * 10) / 12, 12)
  })

  it("clips maximum-stack probability to the combat window after a partial-stack ramp", () => {
    // The fight starts on the first hit, so all five apply: a prepull hit could
    // not put the debuff on the target. Five stacks at 4s inside a 6s window.
    const input = inputFor([0, 1, 2, 3, 4])
    input.skills.Hits.castTime = 6
    const coverage = calculateRotationBaseline(bundleFor(input)).metrics.breakdown.debuffCoverage.find(
      row => row.id === "QingyisCharmT0",
    )!
    expect(coverage.maxStackCoverage).toBeCloseTo((100 * 0.1 ** 5 * 2) / 6, 12)
  })

  it("reports permanent global Bitter Seasons as five stacks and full uptime", () => {
    const input = inputFor([0], 6)
    input.initialDebuffs = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, qingyisCharm: "T6" })
    const coverage = calculateRotationBaseline(bundleFor(input)).metrics.breakdown.debuffCoverage.find(
      row => row.id === "QingyisCharmT6",
    )!
    expect(coverage.averageStacks).toBe(5)
    expect(coverage.maxStackCoverage).toBe(100)
    input.initialDebuffs = []
    input.skills.Hits.tags = ["DOT"]
    expect(calculateRotationBaseline(bundleFor(input)).metrics.breakdown.debuffCoverage).toEqual([])
  })

  it("ticks five times at a constant coefficient and shares one roll with the defense debuff", () => {
    let rolls = 0
    const rows = poisonRows(inputFor([0]), () => {
      rolls++
      return 0
    })
    expect(rolls).toBe(1)
    expect(rows.map(row => row.startTime)).toEqual([1, 2, 3, 4, 5])
    expect(rows.every(row => row.actions[0].phyCoef === 0.02 && row.actions[0].damageScale === 1)).toBe(true)
    expect(rows.every(row => row.actionStates[0].debuffs.get("QingyisCharmT0")?.stack === 1)).toBe(true)
    expect(poisonRows(inputFor([0]), () => 0.1)).toHaveLength(0)
    const expected = poisonRows(inputFor([0]))
    expect(expected.map(row => row.startTime)).toEqual([1, 2, 3, 4, 5])
    expect(expected.every(row => Math.abs(Number(row.actions[0].damageScale) - 0.1) < 1e-12)).toBe(true)
  })

  it("uses battle-second ticks for expected Poison and exact cadence for sampled Poison", () => {
    const input = inputFor([0.25])
    expect(poisonRows(input).map(row => row.startTime)).toEqual([1, 2, 3, 4, 5])
    expect(poisonRows(input, () => 0).map(row => row.startTime)).toEqual([1.25, 2.25, 3.25, 4.25, 5.25])
    const baseline = calculateRotationBaseline(bundleFor(input))
    // On every Poison tick the defense debuff is present because both share the proc.
    expect(baseline.metrics.totalDamage).toBeCloseTo(592 + 5 * 0.1 * 0.02 * (1000 - 408 * 0.994), 9)
  })

  it("keeps shared tick rows bounded by combat seconds under dense applications", () => {
    const times = Array.from({ length: 196 }, (_, index) => index * 0.037)
    const rows = poisonRows(inputFor(times, 6))
    expect(rows.length).toBe(Math.floor(times.at(-1)! + 5))
    expect(rows.every(row => Number.isInteger(row.startTime))).toBe(true)
    expect(new Set(rows.map(row => row.startTime)).size).toBe(rows.length)
  })

  it("excludes fresh boundary applications from that tick while preserving linked debuff stacks", () => {
    const input = inputFor([0.25, 1])
    const rows = poisonRows(input)
    const first = rows.find(row => row.startTime === 1)!
    expect(first.actions[0].hitProbability).toBeCloseTo(0.1, 12)
    const effects = first.actionStates[0].expectedEffects![0]
    const reductions = effects.map(outcome => [outcome.effects[0].defenseBonus, outcome.probability])
    expect(reductions[0][0]).toBe(-0.006)
    // This timeline resolves the earlier application's tick before the boundary hit.
    expect(reductions[0][1]).toBeCloseTo(1, 12)
    // Also cover the opposite causal ordering in the shared tracker itself.
    const linked = new ExpectedPeriodicTracker(1, 1, 0, "indexed", true, 5)
    linked.apply(0.25, 0.1, 10, 5, 1, "debuff")
    linked.apply(1, 0.1, 10, 5, 1, "debuff")
    expect(linked.tickStackProbabilities(1)[1]).toBeCloseTo(0.9, 12)
    expect(linked.tickStackProbabilities(1)[2]).toBeCloseTo(0.1, 12)
    const gap = new ExpectedPeriodicTracker(1, 1, 0, "indexed", true, 5)
    gap.apply(0.25, 0.1, 10, 5, 1, "debuff")
    gap.apply(6, 0.1, 10, 5, 1, "debuff")
    // The remaining debuff can survive after Poison; fresh applications at a
    // boundary must not make previously inactive Poison tick immediately.
    expect(gap.tickStackProbabilities(6)).toEqual([])
    const reapplied = poisonRows(inputFor([0.25, 6]))
    expect(reapplied.some(row => row.startTime === 6)).toBe(false)
    expect(reapplied.find(row => row.startTime === 7)!.actions[0].hitProbability).toBeCloseTo(0.1, 12)
  })

  it("caps stacks, refreshes both lifetimes at the cap, and preserves tick cadence", () => {
    const input = inputFor([0, 0.1, 0.2, 0.3, 0.4, 4.5], 6)
    input.skills.Hits.action!.push({ type: "damage", phyCoef: 1, time: 10 }, { type: "damage", phyCoef: 1, time: 14.5 })
    let rolls = 0
    const rows = buildRotationTimeline(input, () => (rolls++ < 6 ? 0 : 1))
    const ticks = rows.filter(row => row.kind === "dot")
    expect(ticks.map(row => row.startTime)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(ticks.every(row => row.actions[0].phyCoef === 0.02)).toBe(true)
    expect(ticks.every(row => row.actionStates[0].debuffs.get("QingyisCharmT6")?.stack === 5)).toBe(true)
    const cast = rowWithId(rows, "rotation-0")!
    expect(cast.actionStates[6].debuffs.has("QingyisPoison")).toBe(false)
    expect(cast.actionStates[6].debuffs.get("QingyisCharmT6")?.stack).toBe(5)
    expect(cast.actionStates[7].debuffs.has("QingyisCharmT6")).toBe(false)
  })

  it("upgrades outgoing chance at T4, enables incoming procs at T3, and excludes recursive DOT procs", () => {
    expect(poisonRows(inputFor([0], 3), () => 0.12)).toHaveLength(0)
    expect(poisonRows(inputFor([0], 4), () => 0.12)).toHaveLength(5)
    for (const tier of [2, 3, 6]) {
      const input = inputFor([], tier)
      input.skills.Hits.action = [{ type: "takeDamage", damage: 1, time: 0 }]
      expect(poisonRows(input, () => 0)).toHaveLength(tier >= 3 ? 5 : 0)
      expect(poisonRows(input, () => 0.1)).toHaveLength(0)
    }
    for (const tags of [[], ["DOT"], ["Triggered"]]) {
      const input = inputFor([0], 6)
      input.skills.Hits.tags = tags
      expect(poisonRows(input, () => 0)).toHaveLength(0)
      expect(poisonRows(input)).toHaveLength(0)
    }
  })

  it.each(
    [0, 1, 6].flatMap(tier =>
      [
        [0, 0.2, 0.4, 0.6, 0.8, 6.5],
        [0, 1, 5, 10.2],
      ].map(times => ({ tier, times })),
    ),
  )("matches exhaustive proc histories for damage, stack thresholds, and expiry (%j)", ({ tier, times }) => {
    const input = inputFor(times, tier)
    // The exact-cadence diagnostic remains an oracle for the shared probability transitions.
    const exactDots = structuredClone(dots)
    delete (exactDots.QingyisPoison.periodic as { expectedTickAlignment?: string }).expectedTickAlignment
    input.dots = asSkillRecords(exactDots)
    input.effectDefinitions = asEffectDefinitions({ ...exactDots, ...debuffs })
    const bundle = bundleFor(input)
    const chance = tier >= 4 ? 0.15 : 0.1
    let oracle = 0
    for (let mask = 0; mask < 2 ** times.length; mask++) {
      let index = 0,
        probability = 1
      const rows = buildRotationTimeline(input, () => {
        const success = Boolean(mask & (1 << index++))
        probability *= success ? chance : 1 - chance
        return success ? 0 : 1
      })
      const total = rows.reduce(
        (sum, row) =>
          sum +
          row.actions.reduce((damage, action, index) => {
            if (action.type !== "damage") return damage
            const state = row.actionStates[index]
            const effects = Array.from(state.debuffs.values())
              .flatMap(tracked => effectsForTrackedEffect(tracked.stack, input.effectDefinitions[tracked.name]))
              .map(rule => (rule as { effect: Record<string, unknown> }).effect)
            return (
              damage +
              calculateDamageBreakdown(action, {
                stats,
                derivedStats: bundle.derivedStats ?? calculateDerivedStats(stats, 0),
                attunement: emptyAttunementStats,
                enemy,
                weapons: [],
                buffs: [],
                skillTags: row.skill?.tags ?? [],
                effects,
                isDot: row.kind === "dot",
              }).total
            )
          }, 0),
        0,
      )
      oracle += total * probability
      expect(rows.filter(row => row.kind === "dot").every(row => row.actions[0].phyCoef === 0.02)).toBe(true)
    }
    expect(calculateRotationBaseline(bundle).metrics.totalDamage).toBeCloseTo(oracle, 7)
  })

  it("does not add global and local defense reductions, while local T6 can supply resistance", () => {
    const input = inputFor([0, 0, 0, 0, 0, 1], 6)
    const local = calculateSimulatedRotationRun(bundleFor(input), () => 0)
    for (const tier of ["T1", "T6"] as const) {
      input.initialDebuffs = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, qingyisCharm: tier })
      const run = calculateSimulatedRotationRun(bundleFor(input), () => 0)
      const last = run.resolvedSequence.findLast(item => !item.entry.context.isDot)!
      const localLast = local.resolvedSequence.findLast(item => !item.entry.context.isDot)!
      expect(last.breakdown.total).toBeCloseTo(localLast.breakdown.total, 10)
    }
  })
})
