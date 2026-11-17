import { rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { RotationCalculationCategory, RotationMetrics } from "@/calculations/rotationMetrics"
import { useDpsStore } from "@/stores/dpsStore"

import {
  baselineMetricsWithPreviousComparisons,
  combineComparisonVariantMetrics,
  comparisonCategoryOrder,
  comparisonVariantRequests,
  mergeComparisonCategory,
} from "./comparison"

/**
 * Resolving a rotation's results instead of running a sweep over them.
 *
 * Every part of a rotation's result is a cache entry keyed by the fingerprint of the bundle it
 * came from, and every merge of those parts is a pure function of them. So a result is a
 * derivation rather than a computation that has to be run in order: a caller asks for the
 * categories it displays, the store answers the ones it already holds, and the rest are
 * dispatched. Nothing needs to stay alive between the parts, which is what lets the rotation
 * editor be a view over the store rather than the thing that owns the calculation.
 *
 * A baseline is requested on every relevant input change. Only the Main tab requests comparison
 * categories; the Build tab and Rotation Editor do not need those variants.
 */

/** The headline number every other surface shows, so it outranks the editor's own work. */
const baselinePriority = 400
/** Below the baseline, because a category is only worth having once the total is known. */
const variantPriority = 350

export type ResolvedBaseline = {
  /** Kept alongside the result because a caller that displays the rotation also replays it. */
  bundle: RotationSimulationBundle
  cacheKey: string
  baseline: RotationSimulationBaseline
}

export async function resolveBaseline(
  bundle: RotationSimulationBundle,
  options: { priority?: number } = {},
): Promise<ResolvedBaseline> {
  const cacheKey = rotationBundleFingerprint(bundle)
  const baseline = await useDpsStore
    .getState()
    .ensure({ kind: "baseline", cacheKey, build: () => bundle, priority: options.priority ?? baselinePriority })
  return { bundle, cacheKey, baseline }
}

/**
 * Fraction of a category that is settled, counting a dispatched variant as part-settled by the
 * progress it reports. A count of finished variants alone would sit at zero for the whole first
 * category and then jump, which reads as a stall rather than as work.
 */
function createCategoryProgress(total: number, report: ((progress: number) => void) | undefined) {
  const inFlight = new Map<number, number>()
  let completed = 0
  const publish = () => {
    if (!report) return
    const partial = [...inFlight.values()].reduce((total, value) => total + value, 0)
    report(total === 0 ? 1 : Math.min(1, (completed + partial) / total))
  }
  return {
    started: (index: number) => (progress: number) => {
      inFlight.set(index, progress)
      publish()
    },
    settled: (index: number) => {
      inFlight.delete(index)
      completed += 1
      publish()
    },
  }
}

export type ComparisonResolution = {
  bundle: RotationSimulationBundle
  /** The baseline's own cache key, which every variant key is namespaced under. */
  baselineKey: string
  /** Resolved per variant as they are asked for, so the caller need not hold the baseline. */
  baseline: () => RotationSimulationBaseline
  categories?: readonly RotationCalculationCategory[]
  /** Queue position for these variants; lower runs after the interface's own work. */
  priority?: number
  /** Called as each category's work begins, so a panel can show itself as busy while it waits. */
  onCategoryStarted?: (category: RotationCalculationCategory) => void
  onCategoryProgress?: (category: RotationCalculationCategory, progress: number) => void
  /** Called as each category lands, so a caller can fill its panels in rather than at the end. */
  onCategoryResolved?: (metrics: RotationMetrics, category: RotationCalculationCategory) => void
}

/**
 * One category's contribution to the metrics.
 *
 * The variants are dispatched together and written into their own slots rather than appended in
 * completion order, because combining them sorts their rows, and a sort only reproduces against a
 * fixed input order. Resolving them one at a time is what made this the slowest thing in the
 * application while three of the four workers had nothing to do.
 */
export async function resolveComparisonCategory(
  resolution: ComparisonResolution,
  category: RotationCalculationCategory,
): Promise<RotationMetrics> {
  const empty = baselineMetricsWithPreviousComparisons(resolution.baseline().metrics)
  const variants = comparisonVariantRequests(resolution.bundle, category)
  if (variants.length === 0) return empty

  const progress = createCategoryProgress(variants.length, value => resolution.onCategoryProgress?.(category, value))
  const results: RotationMetrics[] = []
  await Promise.all(
    variants.map((variant, index) =>
      useDpsStore
        .getState()
        .ensure({
          kind: "comparisons",
          cacheKey: `${resolution.baselineKey}:${variant.key}`,
          build: () => variant.bundle,
          baseline: resolution.baseline,
          priority: resolution.priority ?? variantPriority,
          onProgress: progress.started(index),
        })
        .then(result => {
          results[index] = result.metrics
          progress.settled(index)
        }),
    ),
  )
  return combineComparisonVariantMetrics(empty, results, category)
}

/**
 * Every requested category, dispatched together.
 *
 * Each category owns a disjoint set of metric fields, so one landing never disturbs another's
 * and the categories need no ordering between them. The merge still walks them in the declared
 * order so that the object a caller ends up with does not depend on which category finished
 * first.
 */
export async function resolveComparisonMetrics(resolution: ComparisonResolution): Promise<RotationMetrics> {
  const categories = resolution.categories ?? comparisonCategoryOrder
  const contributions = new Map<RotationCalculationCategory, RotationMetrics>()
  let merged = baselineMetricsWithPreviousComparisons(resolution.baseline().metrics)
  const fold = (category: RotationCalculationCategory) => {
    const contribution = contributions.get(category)
    if (!contribution) return
    merged = mergeComparisonCategory(merged, contribution, category)
  }

  await Promise.all(
    categories.map(async category => {
      resolution.onCategoryStarted?.(category)
      const contribution = await resolveComparisonCategory(resolution, category)
      contributions.set(category, contribution)
      for (const settled of comparisonCategoryOrder) fold(settled)
      resolution.onCategoryResolved?.(merged, category)
    }),
  )
  return merged
}
