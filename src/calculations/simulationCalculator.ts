import type { DamageOutcome } from "./damage";
import {
  calculateRotationBaseline,
  calculateRotationDamageSequence,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "./rotationCalculator";

export type SimulationRunResult = {
  totalDamage: number;
  dps: number;
  totalHealing: number;
  hps: number;
  abrasionPercentage: number;
  normalPercentage: number;
  criticalPercentage: number;
  affinityPercentage: number;
  healingNormalPercentage: number;
  healingCriticalPercentage: number;
};

export type SimulationSummary = {
  runCount: number;
  duration: number;
  runs: SimulationRunResult[];
  results: {
    best: SimulationRunResult;
    p99: SimulationRunResult;
    p95: SimulationRunResult;
    p90: SimulationRunResult;
    p75: SimulationRunResult;
    median: SimulationRunResult;
  };
};

const emptyRun = (): SimulationRunResult => ({
  totalDamage: 0,
  dps: 0,
  totalHealing: 0,
  hps: 0,
  abrasionPercentage: 0,
  normalPercentage: 0,
  criticalPercentage: 0,
  affinityPercentage: 0,
  healingNormalPercentage: 0,
  healingCriticalPercentage: 0,
});

export function selectSimulationPercentile(runs: SimulationRunResult[], percentile: number) {
  if (runs.length === 0) return emptyRun();
  return runs[Math.round((1 - percentile) * (runs.length - 1))];
}

/**
 * Builds combat events once, then samples only the damage choices that are
 * stochastic. This keeps timing, effects, and all damage formula logic shared
 * with the deterministic rotation calculator.
 */
export function simulateRotation(
  bundle: RotationSimulationBundle,
  runCount: number,
  random: () => number = Math.random,
  onProgress?: (completed: number, total: number) => void,
): SimulationSummary {
  const count = Math.max(1, Math.floor(runCount));
  const baseline = calculateRotationBaseline(bundle);
  const samplesHealingTimeline = baseline.metrics.totalHealing > 0;
  const runs: SimulationRunResult[] = [];
  const progressStep = Math.max(1, Math.floor(count / 100));

  for (let runIndex = 0; runIndex < count; runIndex += 1) {
    let totalDamage = 0;
    const outcomes: Record<DamageOutcome, number> = { abrasion: 0, normal: 0, critical: 0, affinity: 0 };
    let hitCount = 0;
    let totalHealing = 0;
    let normalHeals = 0;
    let criticalHeals = 0;
    let healCount = 0;
    let mysticDamage = 0;
    const simulated = samplesHealingTimeline ? calculateSimulatedRotationRun(bundle, random) : undefined;
    const resolvedSequence = simulated?.resolvedSequence ?? calculateRotationDamageSequence(baseline.baseline, random);
    resolvedSequence.forEach(({ entry, breakdown }) => {
      totalDamage += breakdown.total;
      if (entry.context.skillTags.includes("Mystic")) mysticDamage += breakdown.total;
      if (breakdown.outcome) {
        outcomes[breakdown.outcome] += 1;
        hitCount += 1;
      }
      if (breakdown.healing) {
        totalHealing += breakdown.healing.total;
        const recipients = entry.healingRecipients ?? { self: 1, teammates: 0 };
        const recipientCount = recipients.self + recipients.teammates;
        switch (breakdown.healing.outcome) {
          case "normal":
            normalHeals += recipientCount;
            healCount += recipientCount;
            break;
          case "critical":
            criticalHeals += recipientCount;
            healCount += recipientCount;
            break;
        }
      }
    });
    totalDamage -= mysticDamage * (1 - (simulated?.mysticVitalityDamageScale ?? baseline.mysticVitalityDamageScale));
    const percentage = (outcome: DamageOutcome) => (hitCount > 0 ? (outcomes[outcome] / hitCount) * 100 : 0);
    const runDuration = simulated?.duration ?? baseline.duration;
    runs.push({
      totalDamage,
      dps: runDuration > 0 ? totalDamage / runDuration : 0,
      totalHealing,
      hps: runDuration > 0 ? totalHealing / runDuration : 0,
      abrasionPercentage: percentage("abrasion"),
      normalPercentage: percentage("normal"),
      criticalPercentage: percentage("critical"),
      affinityPercentage: percentage("affinity"),
      healingNormalPercentage: healCount > 0 ? (normalHeals / healCount) * 100 : 0,
      healingCriticalPercentage: healCount > 0 ? (criticalHeals / healCount) * 100 : 0,
    });
    const completed = runIndex + 1;
    if (completed === count || completed % progressStep === 0) onProgress?.(completed, count);
  }

  runs.sort((left, right) => right.dps - left.dps);
  return {
    runCount: count,
    duration: baseline.duration,
    runs,
    results: {
      best: runs[0] ?? emptyRun(),
      p99: selectSimulationPercentile(runs, 0.99),
      p95: selectSimulationPercentile(runs, 0.95),
      p90: selectSimulationPercentile(runs, 0.9),
      p75: selectSimulationPercentile(runs, 0.75),
      median: selectSimulationPercentile(runs, 0.5),
    },
  };
}
