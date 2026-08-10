import { calculateRotationMetrics, calculateRotationSimulation, type RotationCalculationBundle, type RotationSimulationBundle } from "./rotationCalculator";

type WorkerRequest = { id: number; bundle: RotationCalculationBundle | RotationSimulationBundle; simulation?: boolean };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, bundle } = event.data;
  try {
    const result = event.data.simulation ? calculateRotationSimulation(bundle as RotationSimulationBundle) : { metrics: calculateRotationMetrics(bundle as RotationCalculationBundle) };
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
