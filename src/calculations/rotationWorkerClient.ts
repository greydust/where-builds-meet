import type { RotationMetrics } from "./rotationMetrics";
import type {
  RotationCalculationBundle,
  RotationSimulationBundle,
  RotationSimulationResult,
} from "./rotationCalculator";
import type { TimelineRow } from "./rotationTimeline";
import type { DamageBreakdown } from "./damage";

type WorkerResult = RotationSimulationResult | { metrics: RotationMetrics };
type RequestMode = "calculation" | "simulation" | "baseline" | "comparisons";
type RequestOptions = { key?: string; priority?: number; onProgress?: (progress: number) => void };

type CalculationRequest = {
  bundle: RotationCalculationBundle | RotationSimulationBundle;
  mode: RequestMode;
  cacheKey?: string;
  key: string;
  priority: number;
  sequence: number;
  retryCount: number;
  onProgress?: (progress: number) => void;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | undefined;
let requestId = 0;
let requestSequence = 0;
let running: { id: number; request: CalculationRequest } | undefined;
let pending: CalculationRequest[] = [];

function dispatchNext() {
  if (running || pending.length === 0) return;
  pending.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
  dispatch(pending.shift()!);
}

function getWorker() {
  if (worker) return worker;
  const createdWorker = new Worker(new URL("./rotationWorker.ts", import.meta.url), { type: "module" });
  worker = createdWorker;
  createdWorker.addEventListener(
    "message",
    (
      event: MessageEvent<{
        id: number;
        metrics?: RotationMetrics;
        timeline?: TimelineRow[];
        anchorTime?: number;
        duration?: number;
        actionBreakdowns?: Record<string, DamageBreakdown>;
        progress?: number;
        error?: string;
      }>,
    ) => {
      if (!running || event.data.id !== running.id) return;
      if (typeof event.data.progress === "number") {
        running.request.onProgress?.(event.data.progress);
        return;
      }
      const completed = running.request;
      running = undefined;
      if (event.data.error) completed.reject(new Error(event.data.error));
      else if (event.data.metrics)
        completed.resolve(
          completed.mode === "simulation" || completed.mode === "baseline"
            ? {
                metrics: event.data.metrics,
                timeline: event.data.timeline ?? [],
                anchorTime: event.data.anchorTime ?? 0,
                duration: event.data.duration ?? 0,
                actionBreakdowns: event.data.actionBreakdowns ?? {},
              }
            : { metrics: event.data.metrics },
        );
      dispatchNext();
    },
  );
  const recoverFromWorkerFailure = (message: string) => {
    if (worker !== createdWorker) return;
    createdWorker.terminate();
    worker = undefined;
    const interrupted = running?.request;
    running = undefined;
    if (interrupted) {
      if (interrupted.retryCount < 1) pending.push({ ...interrupted, retryCount: interrupted.retryCount + 1 });
      else interrupted.reject(new Error(message));
    }
    dispatchNext();
  };
  createdWorker.addEventListener("error", (event) => {
    recoverFromWorkerFailure(event.message || "Rotation calculation worker failed");
  });
  createdWorker.addEventListener("messageerror", () => {
    recoverFromWorkerFailure("Rotation calculation worker returned an unreadable result");
  });
  return createdWorker;
}

function dispatch(request: CalculationRequest) {
  const id = ++requestId;
  running = { id, request };
  try {
    getWorker().postMessage({ id, bundle: request.bundle, mode: request.mode, cacheKey: request.cacheKey });
  } catch (error) {
    const failed = running?.request;
    running = undefined;
    worker?.terminate();
    worker = undefined;
    if (failed && failed.retryCount < 1) pending.push({ ...failed, retryCount: failed.retryCount + 1 });
    else failed?.reject(error instanceof Error ? error : new Error("Rotation calculation worker failed"));
    dispatchNext();
  }
}

function enqueue(
  request: Omit<CalculationRequest, "key" | "priority" | "sequence" | "retryCount">,
  options: RequestOptions = {},
) {
  const queued: CalculationRequest = {
    ...request,
    key: options.key ?? `${request.mode}:${++requestSequence}`,
    priority: options.priority ?? 0,
    sequence: ++requestSequence,
    retryCount: 0,
    onProgress: options.onProgress,
  };
  const replacedIndex = pending.findIndex((candidate) => candidate.key === queued.key);
  if (replacedIndex >= 0) {
    pending[replacedIndex].reject(new Error("Calculation superseded by a newer request"));
    pending.splice(replacedIndex, 1);
  }
  pending.push(queued);
  dispatchNext();
}

/** Queue requests by priority and replace stale pending work with the same key. */
export function requestRotationCalculation(bundle: RotationCalculationBundle, options?: RequestOptions) {
  return new Promise<RotationMetrics>((resolve, reject) => {
    enqueue({ bundle, mode: "calculation", resolve: (result) => resolve(result.metrics), reject }, options);
  });
}

export function requestRotationSimulation(bundle: RotationSimulationBundle, options?: RequestOptions) {
  return new Promise<RotationSimulationResult>((resolve, reject) => {
    enqueue(
      { bundle, mode: "simulation", resolve: (result) => resolve(result as RotationSimulationResult), reject },
      options,
    );
  });
}

export function requestRotationBaseline(bundle: RotationSimulationBundle, cacheKey: string, options?: RequestOptions) {
  return new Promise<RotationSimulationResult>((resolve, reject) => {
    enqueue(
      { bundle, mode: "baseline", cacheKey, resolve: (result) => resolve(result as RotationSimulationResult), reject },
      options,
    );
  });
}

export function requestRotationComparisons(
  bundle: RotationSimulationBundle,
  cacheKey: string,
  options?: RequestOptions,
) {
  return new Promise<RotationMetrics>((resolve, reject) => {
    enqueue({ bundle, mode: "comparisons", cacheKey, resolve: (result) => resolve(result.metrics), reject }, options);
  });
}

export function disposeRotationCalculationWorker() {
  worker?.terminate();
  worker = undefined;
  pending.forEach((request) => request.reject(new Error("Calculation worker disposed")));
  if (running) running.request.reject(new Error("Calculation worker disposed"));
  pending = [];
  running = undefined;
}
