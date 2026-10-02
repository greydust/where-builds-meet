import { assert, describe, it, vi } from "vitest"

/**
 * The worker keeps its baseline cache per instance and reads it by the cache key the
 * client sends, falling back to a baseline supplied in the message and throwing when
 * neither is present. This drives the real store and transport against a worker that
 * reproduces that behaviour exactly, so the number of variants a comparison sweep
 * produces is tested against the cache it has to fit in.
 */
function faithfulWorker() {
  const baselineCache = new Map<string, unknown>()
  return class FaithfulWorker {
    listeners = new Map()
    terminated = false
    sent: any[] = []
    /** The cache this worker keeps for itself, which is what a run must not occupy. */
    baselineCache = baselineCache
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      this.sent.push(message)
      queueMicrotask(() => {
        if (this.terminated) return
        try {
          if (message.mode === "baseline") {
            baselineCache.set(message.cacheKey, { metrics: { dps: 1, breakdown: {} } })
            if (baselineCache.size > 64) baselineCache.delete(baselineCache.keys().next().value!)
            this.reply(message, { metrics: { dps: 1, breakdown: {} } })
            return
          }
          if (message.mode === "throughput") {
            // A reading is compared against something and never displayed, so the run reports
            // throughput alone and leaves the baseline cache as it found it. A key that names a
            // baseline this worker already holds answers from it without running anything, which
            // the reported dps distinguishes: 1 is the cached baseline, 2 is a fresh run.
            const held = message.cacheKey ? baselineCache.get(message.cacheKey) : undefined
            this.reply(message, { throughput: { dps: held ? 1 : 2, hps: 0, totalDamage: 10 } })
            return
          }
          if (message.mode === "comparisons") {
            const baseline = baselineCache.get(message.cacheKey) ?? message.baseline
            if (!baseline) throw new Error(`No cached baseline exists for ${message.cacheKey}`)
            baselineCache.set(message.cacheKey, baseline)
            this.reply(message, { metrics: { dps: 2, breakdown: {} } })
            return
          }
          this.reply(message, {})
        } catch (error) {
          this.reply(message, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    }
    reply(message: any, payload: Record<string, unknown>) {
      for (const listener of this.listeners.get("message") ?? []) {
        listener({ data: { id: message.id, ...payload } })
      }
    }
    terminate() {
      this.terminated = true
    }
  }
}

async function loadStore() {
  vi.resetModules()
  const Worker = faithfulWorker()
  vi.stubGlobal("Worker", Worker)
  const workers: InstanceType<typeof Worker>[] = []
  const Original = Worker
  class Tracking extends Original {
    constructor() {
      super()
      workers.push(this as InstanceType<typeof Original>)
    }
  }
  vi.stubGlobal("Worker", Tracking)
  const transport = await import("@/calculations/rotationWorkerTransport.ts")
  const { useDpsStore } = await import("@/stores/dpsStore.ts")
  return { useDpsStore, workers, transport }
}

const bundle = { timeline: { rotation: { name: "Sweep", steps: [] } }, weapons: [] } as never
const baselineResult = { metrics: { dps: 1, breakdown: {} } } as never

/** The comparison result the sweep reads: the DPS each variant resolved with. */
type SweepResult = { metrics: { dps: number } }

async function sweep(
  // The store is loaded per test, so its hook type is not available at module scope;
  // only the comparison result each ensure settles is named here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDpsStore: any,
  variantCount: number,
  keyFor: (index: number) => string,
): Promise<SweepResult[]> {
  const store = () => useDpsStore.getState()
  const rotationKey = "rotation-fingerprint"
  await store().ensure({ kind: "baseline", cacheKey: rotationKey, build: () => bundle })
  // Sequential because that is how a comparison sweep runs: each variant's baseline is
  // the same, but the store's in-flight bookkeeping is only exercised in that order.
  return Array.from({ length: variantCount }, (_, index) => index).reduce(
    (previous, index) =>
      previous.then(results =>
        store()
          .ensure({
            kind: "comparisons" as const,
            cacheKey: `${rotationKey}:${keyFor(index)}`,
            build: () => bundle,
            baseline: () => baselineResult,
            priority: 350,
          })
          .then((result: SweepResult) => [...results, result]),
      ),
    Promise.resolve([] as Array<Promise<SweepResult>>),
  )
}

describe("calculation worker baseline provisioning", () => {
  it("serves a full comparison sweep when every variant keys the baseline separately", async () => {
    const { useDpsStore, workers } = await loadStore()
    const variantCount = 120
    const results = await sweep(useDpsStore, variantCount, index => `variant-${index}`)
    assert.equal(results.length, variantCount, "The sweep did not complete.")
    assert.ok(
      results.every(result => result.metrics.dps === 2),
      "A comparison variant resolved without a baseline.",
    )
    // Each per-variant key makes the client hold a baseline copy it will not send again.
    const seeded = workers
      .flatMap(worker => worker.sent)
      .filter(message => message.mode === "comparisons" && message.baseline)
    assert.ok(seeded.length > 0, "No variant carried a baseline, so this proved nothing.")
    useDpsStore.getState().reset()
  })

  it("serves a repeated variant from the store without reaching a worker again", async () => {
    const { useDpsStore, workers } = await loadStore()
    useDpsStore.getState().reset()
    await sweep(useDpsStore, 3, () => "shared-key")
    const sent = workers.flatMap(worker => worker.sent).filter(message => message.mode === "comparisons")
    assert.equal(
      sent.length,
      1,
      `A repeated variant reached a worker ${sent.length} times instead of being served from the store.`,
    )
    useDpsStore.getState().reset()
  })

  it("forgets held results and the workers holding them when the store is reset", async () => {
    const { useDpsStore, workers } = await loadStore()
    const store = () => useDpsStore.getState()
    const request = () => store().ensure({ kind: "baseline" as const, cacheKey: "key", build: () => bundle })
    const dispatches = () => workers.flatMap(worker => worker.sent).filter(message => message.mode === "baseline")

    await request()
    assert.equal(dispatches().length, 1, "The baseline should have reached a worker.")
    await request()
    assert.equal(dispatches().length, 1, "A repeated baseline should have been served from the store.")
    const held = [...workers]

    store().reset()
    await request()
    assert.equal(
      dispatches().length,
      2,
      "After a reset the baseline reached no worker, so a cached result survived the reset.",
    )
    // A worker's caches exist only inside the worker, so terminating it is the only way to
    // forget them. Termination is therefore part of the reset contract, not an aside.
    assert.ok(
      held.every(worker => worker.terminated),
      "A worker that cached a baseline before the reset was left running.",
    )
  })

  it("keeps a reading to its throughput and out of the baseline caches", async () => {
    const { useDpsStore, workers } = await loadStore()
    const key = "graduation:preset"
    const store = () => useDpsStore.getState()
    const cached = () => workers.flatMap(worker => Array.from(worker.baselineCache.keys()))

    const reading = await store().ensure({ kind: "throughput", cacheKey: key, build: () => bundle })
    assert.deepEqual(
      Object.keys(reading).sort(),
      ["dps", "hps", "totalDamage"],
      "A reading kept something other than the numbers it is compared by.",
    )
    assert.deepEqual(cached(), [], "A reading run left a baseline in a worker's cache.")

    // The control: a real baseline run does occupy one, so the assertion above is detecting a
    // difference rather than an empty cache everywhere.
    const controlKey = "rotation:preset"
    await store().ensure({ kind: "baseline", cacheKey: controlKey, build: () => bundle })
    assert.deepEqual(cached(), [controlKey], "A baseline run did not populate a worker's cache.")
    useDpsStore.getState().reset()
  })

  it("answers a reading of an already-calculated rotation from the baseline its worker holds", async () => {
    const { useDpsStore } = await loadStore()
    const key = "rotation:preset"
    const store = () => useDpsStore.getState()

    await store().ensure({ kind: "baseline", cacheKey: key, build: () => bundle })
    // The same key, so the reading names the baseline just calculated and is routed to the
    // worker holding it. dps 1 is that baseline, dps 2 would mean the rotation ran again.
    const reading = await store().ensure({ kind: "throughput", cacheKey: key, build: () => bundle })
    assert.equal(reading.dps, 1, "A reading of an already-calculated rotation ran the rotation again.")
    useDpsStore.getState().reset()
  })
})
