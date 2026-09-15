import { assert, describe, it } from "vitest";

// Ported from script/probe/check-worker-batch-supersession.mjs.
describe("worker-batch-supersession", () => {
  it("Worker batch supersession probe passed", async () => {
    const metrics = {
      totalDamage: 100,
      dps: 10,
      breakdown: { skills: [], casts: [], categories: [], damageTypes: [] },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    };

    const workers = [];

    class BatchWorker {
      listeners = new Map();
      messages = [];
      terminated = false;

      constructor() {
        workers.push(this);
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      postMessage(message) {
        this.messages.push(message);
        if (workers.length === 1) return;
        queueMicrotask(() => {
          if (this.terminated) return;
          for (const listener of this.listeners.get("message") ?? []) listener({ data: { id: message.id, metrics } });
        });
      }

      terminate() {
        this.terminated = true;
      }
    }

    globalThis.Worker = BatchWorker;

    const bundle = {
      duration: 1,
      baseline: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    };

    try {
      const {
        disposeRotationCalculationWorker,
        requestRotationCalculation,
        requestRotationComparisons,
        supersedeRotationCalculationRequests,
      } = await import("../src/calculations/rotationWorkerClient.ts");

      const running = requestRotationCalculation(bundle, { key: "old-running" });
      const pending = requestRotationCalculation(bundle, { key: "old-pending" });
      supersedeRotationCalculationRequests();
      const oldResults = await Promise.allSettled([running, pending]);
      const replacement = await requestRotationCalculation(bundle, { key: "replacement" });

      assert(workers[0]?.terminated, "The superseded batch worker was not terminated.");
      assert(
        !oldResults.some((result) => result.status !== "rejected" || !result.reason.message.includes("superseded")),
        "The superseded batch did not reject all running and pending work.",
      );
      assert(workers.length === 2, `Expected a fresh replacement worker, but created ${workers.length}.`);
      assert(replacement.dps === metrics.dps, "The replacement batch did not complete.");

      const cachedBaseline = {
        metrics,
        timeline: [],
        anchorTime: 0,
        duration: 1,
        actionBreakdowns: {},
        baseline: [],
      };
      await requestRotationComparisons(bundle, "setup-a", cachedBaseline, { key: "variant-a" });
      await requestRotationComparisons(bundle, "setup-a", cachedBaseline, { key: "variant-b" });
      const comparisonMessages = workers[1].messages.filter((message) => message.mode === "comparisons");
      assert(
        comparisonMessages[0]?.baseline === cachedBaseline,
        "A fresh worker was not seeded from the main-thread baseline cache.",
      );
      assert(
        comparisonMessages[1]?.baseline === undefined,
        "The cached baseline was redundantly sent after the worker had been seeded.",
      );

      disposeRotationCalculationWorker();
    } finally {
      delete globalThis.Worker;
    }
  });
});
