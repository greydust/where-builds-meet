import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  calculateRotationMetrics,
  calculateRotationSimulation,
  type RotationCalculationBundle,
  type RotationSimulationBaseline,
  type RotationSimulationBundle,
} from "./rotationCalculator";
import { withCalculationBenchmark } from "./calculationBenchmark";

type WorkerRequest = {
  id: number;
  bundle: RotationCalculationBundle | RotationSimulationBundle;
  mode?: "calculation" | "simulation" | "baseline" | "comparisons";
  cacheKey?: string;
  baseline?: RotationSimulationBaseline;
};

const baselineCache = new Map<string, RotationSimulationBaseline>();

function benchmarkLabel(
  mode: NonNullable<WorkerRequest["mode"]>,
  bundle: RotationCalculationBundle | RotationSimulationBundle,
) {
  if (!("timeline" in bundle)) return `${mode}: legacy calculation bundle`;
  const rotationName = bundle.timeline.rotation.name || "Unnamed rotation";
  if (mode !== "comparisons") return `${mode}: ${rotationName}`;
  const variants = [
    ...bundle.statPriority,
    ...bundle.attunementPriority,
    ...bundle.innerWayPriority,
    ...Object.values(bundle.setupComparisons).flat(),
  ];
  const labels = variants.map((variant) => variant.label).filter(Boolean);
  return labels.length > 0 ? `${mode}: ${rotationName} — ${labels.join(", ")}` : `${mode}: ${rotationName}`;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, bundle, cacheKey } = event.data;
  try {
    const mode = event.data.mode ?? "calculation";
    const calculate = () => {
      switch (mode) {
        case "baseline": {
          if (!cacheKey) throw new Error("A baseline cache key is required");
          const calculated = calculateRotationBaseline(bundle as RotationSimulationBundle);
          baselineCache.set(cacheKey, calculated);
          if (baselineCache.size > 64) baselineCache.delete(baselineCache.keys().next().value!);
          return calculated;
        }
        case "comparisons": {
          if (!cacheKey) throw new Error("A comparison cache key is required");
          const baseline = baselineCache.get(cacheKey) ?? event.data.baseline;
          if (!baseline) throw new Error(`No cached baseline exists for ${cacheKey}`);
          baselineCache.set(cacheKey, baseline);
          return {
            metrics: calculateRotationComparisons(bundle as RotationSimulationBundle, baseline, (completed, total) => {
              self.postMessage({ id, progress: total > 0 ? completed / total : 1 });
            }),
          };
        }
        case "simulation":
          return calculateRotationSimulation(bundle as RotationSimulationBundle);
        case "calculation":
          return { metrics: calculateRotationMetrics(bundle as RotationCalculationBundle) };
      }
    };
    const result = import.meta.env.DEV
      ? withCalculationBenchmark(benchmarkLabel(mode, bundle), calculate)
      : calculate();
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
