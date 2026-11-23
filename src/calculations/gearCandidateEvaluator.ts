import type { RotationSimulationBundle } from "./rotationCalculator"
import {
  calculateRotationBaseline,
  calculateRotationGearCandidate,
  rotationGearTimelineKey,
} from "./rotationCalculator"
import type { ThroughputReading } from "./rotationWorkerTransport"

/** Shared by inventory search and suggestion plans. Rebuild whenever events could change. */
export function createGearCandidateEvaluator(original: RotationSimulationBundle) {
  const baseline = calculateRotationBaseline(original)
  const originalKey = rotationGearTimelineKey(original, baseline)
  const evaluate = (bundle: RotationSimulationBundle): { fast: boolean; reading: ThroughputReading } => {
    const fast = originalKey !== undefined && rotationGearTimelineKey(bundle, baseline) === originalKey
    if (fast) {
      const result = calculateRotationGearCandidate(bundle, baseline)
      return {
        fast,
        reading: {
          dps: result.duration > 0 ? result.damage / result.duration : 0,
          hps: result.duration > 0 ? result.healing / result.duration : 0,
          totalDamage: result.damage,
        },
      }
    }
    const result = calculateRotationBaseline(bundle).metrics
    return { fast, reading: { dps: result.dps, hps: result.hps, totalDamage: result.totalDamage } }
  }
  return { baseline, originalKey, evaluate }
}
