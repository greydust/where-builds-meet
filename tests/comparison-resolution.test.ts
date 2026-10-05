import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/stores/dpsStore", async () => (await import("./helpers/dpsStoreMock")).mockDpsStore())

import {
  baselineMetricsWithPreviousComparisons,
  combineComparisonVariantMetrics,
  comparisonCategoryOrder,
  comparisonVariantRequests,
  mergeComparisonCategory,
} from "@/application/comparison"
import { resolveComparisonCategory, resolveComparisonMetrics } from "@/application/resolveRotationMetrics"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import type {
  RotationSimulationBaseline,
  RotationSimulationBundle,
  RotationSimulationVariant,
} from "@/calculations/rotationCalculator"
import type { RotationMetrics } from "@/calculations/rotationMetrics"
import { emptyRotationBreakdown } from "@/calculations/rotationMetrics"

import { dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

/**
 * A comparison resolves as many dispatches as a category has variants, and combining them sorts
 * their rows. A sort is only reproducible against a fixed input order, so the resolver has to
 * write each variant into its own slot rather than append in whatever order the workers finish.
 * These variants carry ties on purpose, because a tie is where an input order that leaked through
 * would change the output.
 */
const statVariants: RotationSimulationVariant[] = [
  { label: "Tied A", maxRoll: 10 },
  { label: "Highest", maxRoll: 10 },
  { label: "Tied B", maxRoll: 10 },
  { label: "Lowest", maxRoll: 10 },
  { label: "Tied C", maxRoll: 10 },
]

const baseMetrics = (): RotationMetrics => ({
  totalDamage: 1000,
  dps: 100,
  unscaledTotalDamage: 1000,
  unscaledDps: 100,
  totalHealing: 0,
  hps: 0,
  breakdown: emptyRotationBreakdown(),
  statPriority: [],
  attunementPriority: [],
  innerWayPriority: [],
  setupComparisons: {},
})

const bundle = {
  timeline: { rotation: {} },
  startAnchor: { rowId: "r0" },
  stats: {},
  attunement: emptyAttunementStats,
  enemy: {},
  statPriority: statVariants,
  attunementPriority: [],
  innerWayPriority: [],
  setupComparisons: {
    "weaponSets:one": [
      { label: "Set A", maxRoll: 5 },
      { label: "Set B", maxRoll: 5 },
    ],
    "armorSets:one": [{ label: "Armor A", maxRoll: 5 }],
  },
} as unknown as RotationSimulationBundle

const priorityRow = (label: string, dpsDifference: number, increase: number) => ({
  label,
  maxRoll: 10,
  dpsDifference,
  increase,
  hpsDifference: 0,
  healingIncrease: 0,
})

/**
 * A stand-in worker. It answers with the row the dispatched variant asked for, and it finishes
 * later variants first, so anything that lets completion order stand in for variant order shows
 * up as a difference rather than passing by luck.
 */
function registerWorker({ reversed = true }: { reversed?: boolean } = {}) {
  const variantIndex = new Map<string, number>()
  for (const [index, variant] of statVariants.entries()) variantIndex.set(variant.label, index)
  dpsResolves("comparisons", async request => {
    const dispatched = request.build()
    const setupVariants = Object.values(dispatched.setupComparisons).flat()
    const variant: RotationSimulationVariant | undefined = dispatched.statPriority[0] ?? setupVariants[0]
    const index = variantIndex.get(variant?.label ?? "") ?? 0
    if (reversed) await new Promise(done => setTimeout(done, (statVariants.length - index) * 5))
    else await Promise.resolve()
    if (dispatched.statPriority.length > 0) {
      // Deliberately not in label order, and with a tie between the first and third variant.
      const differences = [30, 90, 30, 10, 50]
      return {
        metrics: {
          ...baseMetrics(),
          statPriority: [priorityRow(variant!.label, differences[index], differences[index] / 100)],
        },
      }
    }
    const group = Object.keys(dispatched.setupComparisons)[0]
    return {
      metrics: {
        ...baseMetrics(),
        setupComparisons: {
          [group]: [{ ...variant, dpsDifference: 5, increase: 0.05, hpsDifference: 0, healingIncrease: 0 }],
        },
      },
    }
  })
}

/**
 * The precomputed baseline the sweep folds categories into.
 *
 * The store hands this to a worker rather than reading it here, so only the metrics
 * are populated; the rest of the result is what a worker would fill in.
 */
const baseline = { metrics: baseMetrics() } as RotationSimulationBaseline
const resolution = { bundle, baselineKey: "fp", baseline: () => baseline }

/** The sweep as it was written: one dispatch at a time, folding each category into the last. */
async function resolveSequentially() {
  const { useDpsStore } = await import("@/stores/dpsStore")
  let merged = baselineMetricsWithPreviousComparisons(baseline.metrics)
  for (const category of comparisonCategoryOrder) {
    const variants = comparisonVariantRequests(bundle, category)
    if (variants.length === 0) {
      merged = mergeComparisonCategory(merged, baseline.metrics, category)
      continue
    }
    const results: RotationMetrics[] = []
    for (const variant of variants) {
      // Dispatching one variant at a time is the behaviour this reference reproduces, so it
      // cannot become a parallel batch.
      // oxlint-disable-next-line no-await-in-loop
      const result = (await useDpsStore
        .getState()
        .ensure({
          kind: "comparisons",
          cacheKey: `fp:${variant.key}`,
          build: () => variant.bundle,
          baseline: () => baseline,
        })) as { metrics: RotationMetrics }
      results.push(result.metrics)
    }
    merged = combineComparisonVariantMetrics(merged, results, category)
  }
  return merged
}

describe("comparison resolution", () => {
  beforeEach(() => resetDpsMock())

  it("matches a sequential fold even when variants finish out of order", async () => {
    registerWorker()
    const concurrent = await resolveComparisonMetrics(resolution)
    resetDpsMock()
    registerWorker()
    const sequential = await resolveSequentially()
    expect(concurrent).toEqual(sequential)
  })

  it("sorts tied rows by the variant order rather than by completion order", async () => {
    registerWorker()
    const metrics = await resolveComparisonCategory(resolution, "statPriority")
    // Rows carry dpsDifferences of 30, 90, 30, 10, 50 in variant order, so the sort puts
    // Highest first, Lowest last, and leaves the two rows tied on 30 in variant order. A
    // resolver that appended in completion order would report the later of the pair first,
    // because the stand-in worker deliberately finishes the last variant first.
    expect(metrics.statPriority.map(row => row.label)).toEqual(["Highest", "Tied C", "Tied A", "Tied B", "Lowest"])
  })

  it("keeps each category's rows to itself", async () => {
    registerWorker()
    const metrics = await resolveComparisonMetrics(resolution)
    expect(Object.keys(metrics.setupComparisons).sort()).toEqual(["armorSets:one", "weaponSets:one"])
    expect(metrics.setupComparisons["weaponSets:one"].map(row => row.label)).toEqual(["Set A", "Set B"])
    expect(metrics.statPriority).toHaveLength(statVariants.length)
  })

  it("reports a category as settled once its last variant lands", async () => {
    registerWorker()
    const seen: number[] = []
    await resolveComparisonCategory({ ...resolution, onCategoryProgress: (_c, p) => seen.push(p) }, "statPriority")
    expect(seen.at(-1)).toBe(1)
    expect(seen.every(progress => progress > 0 && progress <= 1)).toBe(true)
  })
})
