import { assert, describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-worker-recovery.mjs.
describe("worker-recovery", () => {
  it("Worker recovery probe passed", async () => {
    const metrics = {
      totalDamage: 100,
      dps: 10,
      breakdown: { skills: [], casts: [], categories: [], damageTypes: [] },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    };

    let workersCreated = 0;

    class RecoveringWorker {
      listeners = new Map();

      constructor() {
        workersCreated += 1;
        this.instance = workersCreated;
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      postMessage(message) {
        queueMicrotask(() => {
          const type = this.instance === 1 ? "error" : "message";
          const event =
            type === "error" ? { message: "Worker load interrupted" } : { data: { id: message.id, metrics } };
          for (const listener of this.listeners.get(type) ?? []) listener(event);
        });
      }

      terminate() {}
    }

    globalThis.Worker = RecoveringWorker;

    try {
      const { disposeRotationCalculationWorker, requestRotationCalculation } = await probeLoad(
        "/src/calculations/rotationWorkerClient.ts",
      );
      const result = await requestRotationCalculation({
        duration: 1,
        baseline: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      });
      assert(result.dps === metrics.dps, "The interrupted calculation did not recover.");
      assert(workersCreated === 2, `Expected one replacement worker, but created ${workersCreated}.`);
      disposeRotationCalculationWorker();
    } finally {
      delete globalThis.Worker;
    }
  });
});
