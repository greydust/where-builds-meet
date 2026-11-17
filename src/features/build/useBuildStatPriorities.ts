import { useEffect, useMemo, useState } from "react"

import { resolveBaseline, resolveComparisonCategory } from "@/application/resolveRotationMetrics"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import { buildMeasurement, measurementSubject } from "@/calculations/rotationCalculationBundle"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import type { RotationPriority } from "@/calculations/rotationMetrics"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { BuildEntry, GearItem } from "@/gear"

/** Below every interface calculation: a stat priority is advice, not a number on screen. */
export const BUILD_FLAG_PRIORITY = 10

const emptyRows: RotationPriority[] = []

/**
 * The stat priorities for the build on screen, not necessarily the active one.
 *
 * The active build already has them published by the rotation result, so that reading is reused.
 * Another build gets its own baseline and a stat-priority sweep queued at the lowest priority:
 * a Build-tab visitor waits for the headline and the gear readings first.
 */
export function useBuildStatPriorities(input: {
  build: BuildEntry | undefined
  gearItems: readonly GearItem[]
  measurement: MeasurementContext
  rotation: RotationRecord | undefined
  isActive: boolean
  cached?: readonly RotationPriority[]
}): readonly RotationPriority[] {
  const { build, gearItems, measurement, rotation, isActive, cached } = input
  const useCached = isActive && Boolean(cached?.length)
  const prepared = useMemo(() => {
    if (!build || !rotation) return undefined
    const items = [...gearItems]
    const subject = measurementSubject({ build, gearItems: items, context: measurement, rotation })
    return {
      baseline: buildMeasurement({ build, gearItems: items, context: measurement, rotation }),
      comparison: buildRotationComparisonBundle(subject),
    }
  }, [build, gearItems, measurement, rotation])
  const key = prepared?.baseline.cacheKey
  const [computed, setComputed] = useState<{ key: string; rows: RotationPriority[] }>()

  useEffect(() => {
    if (!prepared || !key || useCached) return
    let current = true
    void (async () => {
      try {
        const baseline = await resolveBaseline(prepared.baseline.bundle)
        const metrics = await resolveComparisonCategory(
          {
            bundle: prepared.comparison,
            baselineKey: key,
            baseline: () => baseline.baseline,
            priority: BUILD_FLAG_PRIORITY,
          },
          "statPriority",
        )
        if (current) setComputed({ key, rows: metrics.statPriority })
      } catch {
        // A superseded or torn-down worker rejects; the advice simply stays absent until asked again.
      }
    })()
    return () => {
      current = false
    }
  }, [prepared, key, useCached])

  if (useCached) return cached ?? emptyRows
  return computed && computed.key === key ? computed.rows : emptyRows
}
