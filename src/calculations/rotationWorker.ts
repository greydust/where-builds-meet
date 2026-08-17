import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  calculateRotationMetrics,
  calculateRotationSimulation,
  type RotationCalculationBundle,
  type RotationSimulationBaseline,
  type RotationSimulationBundle,
} from "./rotationCalculator";

type WorkerRequest = {
  id: number;
  bundle: RotationCalculationBundle | RotationSimulationBundle;
  mode?: "calculation" | "simulation" | "baseline" | "comparisons";
  cacheKey?: string;
  baseline?: RotationSimulationBaseline;
};

const baselineCache = new Map<string, RotationSimulationBaseline>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, bundle, cacheKey } = event.data;
  try {
    const mode = event.data.mode ?? "calculation";
    let result;
    if (mode === "baseline") {
      if (!cacheKey) throw new Error("A baseline cache key is required");
      const calculated = calculateRotationBaseline(bundle as RotationSimulationBundle);
      baselineCache.set(cacheKey, calculated);
      if (baselineCache.size > 64) baselineCache.delete(baselineCache.keys().next().value!);
      result = calculated;
    } else if (mode === "comparisons") {
      if (!cacheKey) throw new Error("A comparison cache key is required");
      const baseline = baselineCache.get(cacheKey) ?? event.data.baseline;
      if (!baseline) throw new Error(`No cached baseline exists for ${cacheKey}`);
      baselineCache.set(cacheKey, baseline);
      result = {
        metrics: calculateRotationComparisons(bundle as RotationSimulationBundle, baseline, (completed, total) => {
          self.postMessage({ id, progress: total > 0 ? completed / total : 1 });
        }),
      };
    } else if (mode === "simulation") {
      result = calculateRotationSimulation(bundle as RotationSimulationBundle);
    } else {
      result = { metrics: calculateRotationMetrics(bundle as RotationCalculationBundle) };
    }
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
