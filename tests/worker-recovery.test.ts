import { assert, describe, it } from "vitest"

import { probeLoad } from "./helpers/probe-loader.js"

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
    }

    let workersCreated = 0

    class RecoveringWorker {
      listeners = new Map<string, Array<(event: unknown) => void>>()
      /** Which worker this is; the first one fails to load, as a real one would. */
      instance: number

      constructor() {
        workersCreated += 1
        this.instance = workersCreated
      }

      addEventListener(type: string, listener: (event: unknown) => void) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
      }

      postMessage(message: { id: string }) {
        queueMicrotask(() => {
          const type = this.instance === 1 ? "error" : "message"
          const event =
            type === "error" ? { message: "Worker load interrupted" } : { data: { id: message.id, metrics } }
          for (const listener of this.listeners.get(type) ?? []) listener(event)
        })
      }

      terminate() {}
    }

    globalThis.Worker = RecoveringWorker as unknown as typeof Worker

    try {
      const { disposeCalculationWorkers, dispatchCalculation } = await probeLoad<
        typeof import("../src/calculations/rotationWorkerTransport")
      >("/src/calculations/rotationWorkerTransport.ts")
      const result = (await dispatchCalculation({
        mode: "baseline",
        key: "recovery",
        duration: 1,
        baseline: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      } as never)) as { metrics: { dps: number } }
      assert(result.metrics.dps === metrics.dps, "The interrupted calculation did not recover.")
      assert(workersCreated === 2, `Expected one replacement worker, but created ${workersCreated}.`)
      disposeCalculationWorkers()
    } finally {
      Reflect.deleteProperty(globalThis, "Worker")
    }
  })
})
