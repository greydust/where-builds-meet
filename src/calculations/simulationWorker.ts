/// <reference lib="webworker" />

import { simulateRotation } from "./simulationCalculator";
import type { RotationSimulationBundle } from "./rotationCalculator";

type SimulationRequest = { id: number; bundle: RotationSimulationBundle; runCount: number };

self.addEventListener("message", (event: MessageEvent<SimulationRequest>) => {
  const { id, bundle, runCount } = event.data;
  try {
    const summary = simulateRotation(bundle, runCount, Math.random, (completed, total) => {
      self.postMessage({ id, type: "progress", completed, total });
    });
    self.postMessage({ id, type: "complete", summary });
  } catch (error) {
    self.postMessage({ id, type: "error", error: error instanceof Error ? error.message : String(error) });
  }
});

export {};
