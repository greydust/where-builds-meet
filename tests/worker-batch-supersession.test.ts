import { assert, describe, it } from "vitest"

import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"

// Ported from script/probe/check-worker-batch-supersession.mjs.
describe("worker-batch-supersession", () => {
  it("runs independent batches in parallel and keeps each worker's baseline cache separate", async () => {
    const metrics = {
      totalDamage: 100,
      dps: 10,
      breakdown: { skills: [], casts: [], categories: [], damageTypes: [] },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }

    const workers: FakeWorker[] = []
    // A request whose bundle is marked `hold` stays in flight, which is how a test
    // keeps one worker busy while another picks up the next request.
    let respondWhen: (message: WorkerMessage) => boolean = () => true

    /** The request a fake worker receives; the spec reads its mode, cache key and bundle. */
    type WorkerMessage = { id: string; mode: string; cacheKey?: string; baseline?: unknown; bundle: { hold?: boolean } }

    class FakeWorker {
      listeners = new Map<string, Array<(event: unknown) => void>>()
      messages: WorkerMessage[] = []
      terminated = false

      constructor() {
        workers.push(this)
      }

      addEventListener(type: string, listener: (event: unknown) => void) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
      }

      postMessage(message: WorkerMessage) {
        this.messages.push(message as WorkerMessage)
        const settle = () => {
          if (this.terminated || !respondWhen(message)) return
          for (const listener of this.listeners.get("message") ?? []) {
            listener({ data: { id: message.id, metrics } })
          }
        }
        if (respondWhen(message)) queueMicrotask(settle)
        else held.push(settle)
      }

      terminate() {
        this.terminated = true
      }
    }

    const held: Array<() => void> = []
    globalThis.Worker = FakeWorker as unknown as typeof Worker

    // A request bundle the fake workers accept. `hold` is a marker only these
    // stubs read; the transport passes the request through without inspecting it.
    const bundle = {
      duration: 1,
      baseline: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    } as unknown as RotationSimulationBundle
    const holdingBundle = { ...bundle, hold: true } as RotationSimulationBundle
    const cachedBaseline = { metrics, timeline: [], anchorTime: 0, duration: 1, actionBreakdowns: {}, baseline: [] }
    const sent = (predicate: (message: WorkerMessage) => boolean) =>
      workers.flatMap(worker => worker.messages).filter(predicate)

    try {
      const { disposeCalculationWorkers, dispatchCalculation } =
        await import("@/calculations/rotationWorkerTransport.ts")
      const baseline = (cacheKey: string, key: string) =>
        dispatchCalculation({ mode: "baseline", bundle, cacheKey, key })
      const comparisons = (cacheKey: string, key: string, baseline?: unknown) =>
        dispatchCalculation({ mode: "comparisons", bundle, cacheKey, key, baseline } as never)
      const calculation = (key: string, held = bundle) =>
        dispatchCalculation({ mode: "baseline", bundle: held, key } as never)

      // Two independent batches are dispatched at once rather than queued behind one worker.
      const settled = await Promise.all([calculation("first"), calculation("second")])
      assert(workers.length === 2, `Expected the pool to run two batches at once, but made ${workers.length} workers.`)
      assert(
        settled.every(result => (result as { metrics: { dps: number } }).metrics.dps === metrics.dps),
        "Both parallel batches did not complete.",
      )

      disposeCalculationWorkers()

      // A worker caches the baseline for a key. While that same worker is busy, a request
      // for the key can only go to a different worker, which has no such cache. The worker
      // throws rather than recomputing one, so the client must send the baseline it was
      // handed even though another worker already holds that key. Affinity routing only
      // avoids this while the holding worker is free, so the case has to be built.
      await baseline("shared-key", "seed")
      respondWhen = message => !message.bundle?.hold
      const occupying = calculation("occupy", holdingBundle)
      const onOtherWorker = comparisons("shared-key", "elsewhere", cachedBaseline)
      respondWhen = () => true
      held.splice(0).forEach(settle => settle())
      await Promise.all([occupying, onOtherWorker])

      const carriers = sent(message => message.cacheKey === "shared-key" && message.mode === "comparisons")
      assert(carriers.length === 1, `Expected one comparisons batch for the key, sent ${carriers.length}.`)
      const baselineWorker = workers[workers.findIndex(worker => worker.messages.some(m => m.mode === "baseline"))]
      const comparisonWorker = workers[workers.findIndex(worker => worker.messages.includes(carriers[0]))]
      assert(
        baselineWorker !== comparisonWorker,
        "The batch was routed back to the worker holding the baseline, so the cross-worker case went untested.",
      )
      assert(
        carriers[0]?.baseline === cachedBaseline,
        "A comparisons batch was sent to a worker with no cached baseline and without the caller's copy.",
      )

      // A key no worker has must always be seeded from the caller's baseline.
      await comparisons("unseen-key", "unseen", cachedBaseline)
      const unseen = sent(message => message.cacheKey === "unseen-key")
      assert(unseen[0]?.baseline === cachedBaseline, "A comparisons batch for an uncached key was not seeded.")

      // Once nothing is in flight, a worker holding the key can serve a repeat request
      // from its own cache, so the baseline must not be cloned across the wire again.
      await comparisons("shared-key", "rerouted", cachedBaseline)
      const rerouted = sent(message => message.cacheKey === "shared-key" && message.mode === "comparisons").find(
        message => message !== carriers[0],
      )
      assert(rerouted !== undefined, "The repeat comparisons batch was never sent.")
      assert(rerouted?.baseline === undefined, "A worker that already cached the baseline was sent it again.")

      disposeCalculationWorkers()
    } finally {
      delete (globalThis as { Worker?: unknown }).Worker
    }
  })
})
