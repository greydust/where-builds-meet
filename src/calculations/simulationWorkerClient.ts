import type { RotationSimulationBundle } from "./rotationCalculator";
import type { SimulationSummary } from "./simulationCalculator";

type SimulationWorkerMessage = {
  id: number;
  type: "progress" | "complete" | "error";
  completed?: number;
  total?: number;
  summary?: SimulationSummary;
  error?: string;
};

export type SimulationTask = {
  promise: Promise<SimulationSummary>;
  cancel: () => void;
};

let requestId = 0;

/** Each task owns a worker so cancellation cannot interrupt the calculator queue. */
export function startSimulation(
  bundle: RotationSimulationBundle,
  runCount: number,
  onProgress: (completed: number, total: number) => void,
): SimulationTask {
  const id = ++requestId;
  const worker = new Worker(new URL("./simulationWorker.ts", import.meta.url), { type: "module" });
  let settled = false;
  let rejectTask: (error: Error) => void = () => {};
  const finish = () => {
    settled = true;
    worker.terminate();
  };
  const promise = new Promise<SimulationSummary>((resolve, reject) => {
    rejectTask = reject;
    worker.addEventListener("message", (event: MessageEvent<SimulationWorkerMessage>) => {
      if (event.data.id !== id || settled) return;
      if (event.data.type === "progress") {
        onProgress(event.data.completed ?? 0, event.data.total ?? runCount);
        return;
      }
      if (event.data.type === "error") {
        finish();
        reject(new Error(event.data.error || "Simulation worker failed"));
        return;
      }
      if (!event.data.summary) return;
      const summary = event.data.summary;
      finish();
      resolve(summary);
    });
    worker.addEventListener("error", (event) => {
      if (settled) return;
      finish();
      reject(new Error(event.message || "Simulation worker failed"));
    });
    worker.postMessage({ id, bundle, runCount });
  });
  return {
    promise,
    cancel: () => {
      if (settled) return;
      finish();
      rejectTask(new Error("Simulation cancelled"));
    },
  };
}
