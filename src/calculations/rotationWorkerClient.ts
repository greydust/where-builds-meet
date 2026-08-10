import type { RotationMetrics } from "./rotationMetrics";
import type { RotationCalculationBundle, RotationSimulationBundle } from "./rotationCalculator";
import type { TimelineRow } from "./rotationTimeline";
import type { DamageBreakdown } from "./damage";

export type RotationSimulationResult = { metrics: RotationMetrics; timeline: TimelineRow[]; anchorTime: number; duration: number; actionBreakdowns: Record<string, DamageBreakdown> };
type WorkerResult = RotationSimulationResult | { metrics: RotationMetrics };

type CalculationRequest = {
  bundle: RotationCalculationBundle | RotationSimulationBundle;
  simulation: boolean;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | undefined;
let requestId = 0;
let running: { id: number; request: CalculationRequest } | undefined;
let pending: CalculationRequest | undefined;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./rotationWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<{ id: number; metrics?: RotationMetrics; timeline?: TimelineRow[]; anchorTime?: number; duration?: number; actionBreakdowns?: Record<string, DamageBreakdown>; error?: string }>) => {
    if (!running || event.data.id !== running.id) return;
    const completed = running.request;
    running = undefined;
    if (event.data.error) completed.reject(new Error(event.data.error));
    else if (event.data.metrics) completed.resolve(completed.simulation ? {
      metrics: event.data.metrics,
      timeline: event.data.timeline ?? [],
      anchorTime: event.data.anchorTime ?? 0,
      duration: event.data.duration ?? 0,
      actionBreakdowns: event.data.actionBreakdowns ?? {},
    } : { metrics: event.data.metrics });
    if (pending) {
      const next = pending;
      pending = undefined;
      dispatch(next);
    }
  });
  worker.addEventListener("error", (event) => {
    if (!running) return;
    const completed = running.request;
    running = undefined;
    completed.reject(new Error(event.message || "Rotation calculation worker failed"));
    pending = undefined;
  });
  return worker;
}

function dispatch(request: CalculationRequest) {
  const id = ++requestId;
  running = { id, request };
  getWorker().postMessage({ id, bundle: request.bundle, simulation: request.simulation });
}

/**
 * Starts one calculation and coalesces later requests while it is running.
 * The pending request is replaced with the newest bundle, so stale state is
 * never calculated after the current worker job completes.
 */
export function requestRotationCalculation(bundle: RotationCalculationBundle) {
  return new Promise<RotationMetrics>((resolve, reject) => {
    const request: CalculationRequest = { bundle, simulation: false, resolve: (result) => resolve(result.metrics), reject };
    if (running) {
      if (pending) pending.reject(new Error("Calculation superseded by a newer request"));
      pending = request;
      return;
    }
    dispatch(request);
  });
}

export function requestRotationSimulation(bundle: RotationSimulationBundle) {
  return new Promise<RotationSimulationResult>((resolve, reject) => {
    const request: CalculationRequest = { bundle, simulation: true, resolve: (result) => resolve(result as RotationSimulationResult), reject };
    if (running) {
      if (pending) pending.reject(new Error("Calculation superseded by a newer request"));
      pending = request;
      return;
    }
    dispatch(request);
  });
}

export function disposeRotationCalculationWorker() {
  worker?.terminate();
  worker = undefined;
  if (pending) pending.reject(new Error("Calculation worker disposed"));
  if (running) running.request.reject(new Error("Calculation worker disposed"));
  pending = undefined;
  running = undefined;
}
