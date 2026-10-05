import { assert, describe, it, vi } from "vitest"

/**
 * `supersede` tears down the workers and forgets in-flight work, but the requests it
 * rejects are still awaiting inside the store and still settle afterwards. These drive
 * the real store and transport through a supersede to check that a batch starting while
 * the previous one is being torn down is not disturbed by the older batch's fallout.
 */
function controllableWorker() {
  return class ControllableWorker {
    listeners = new Map()
    terminated = false
    pending: any[] = []
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      if (this.terminated) throw new Error("posted to a terminated worker")
      this.pending.push(message)
    }
    /** Complete every request this worker is holding, oldest first. */
    flush(payload: (message: any) => Record<string, unknown> = () => ({ metrics: { dps: 1, breakdown: {} } })) {
      const queued = this.pending
      this.pending = []
      for (const message of queued) {
        if (this.terminated) continue
        for (const listener of this.listeners.get("message") ?? []) {
          listener({ data: { id: message.id, ...payload(message) } })
        }
      }
    }
    terminate() {
      this.terminated = true
    }
  }
}

async function loadStore() {
  vi.resetModules()
  const Worker = controllableWorker()
  vi.stubGlobal("Worker", Worker)
  const workers: any[] = []
  class Tracking extends Worker {
    constructor() {
      super()
      workers.push(this)
    }
  }
  vi.stubGlobal("Worker", Tracking)
  const { useDpsStore } = await import("@/stores/dpsStore.ts")
  return { useDpsStore, workers }
}

const bundle = { timeline: { rotation: { name: "Supersede", steps: [] } }, weapons: [] } as never
const baseline = { metrics: { dps: 1, breakdown: {} } } as never
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

async function comparison(store: () => any, key: string) {
  return store().ensure({
    kind: "comparisons",
    cacheKey: key,
    build: () => bundle,
    baseline: () => baseline,
    priority: 350,
  })
}

describe("calculation store supersession", () => {
  it("lets a batch started during a teardown finish without being disturbed", async () => {
    const { useDpsStore, workers } = await loadStore()
    const store = () => useDpsStore.getState()
    const key = "rotation-fp:variant-fp"

    // A previous batch is still in flight when the next one supersedes it.
    const abandoned = comparison(store, key).catch((error: Error) => ({ rejected: error.message }))
    await settle()
    assert.equal(workers.length, 1, "The first request did not reach a worker.")

    store().supersede()
    const fresh = comparison(store, key)
    await settle()
    assert.equal(workers.length, 2, "The replacement batch did not get a fresh worker.")

    // The superseded request settles after the replacement is already running. Its
    // cleanup must not untrack the replacement.
    const abandonedResult = await abandoned
    assert.ok("rejected" in abandonedResult, "The superseded request was not rejected.")
    const stillTracked = store().entry("comparisons", key)?.status
    assert.equal(stillTracked, "pending", `The replacement was lost to the older batch: ${stillTracked}`)

    workers[workers.length - 1].flush()
    const result = await fresh
    assert.equal(result.metrics.dps, 1, "The replacement batch did not complete.")
    assert.equal(store().entry("comparisons", key)?.status, "ready", "The replacement did not settle as ready.")
    store().reset()
  })

  it("lets a comparison sweep run to completion while a newer batch supersedes it", async () => {
    const { useDpsStore, workers } = await loadStore()
    const store = () => useDpsStore.getState()
    const variants = Array.from({ length: 6 }, (_, index) => `rotation-fp:variant-${index}`)

    // Sequential because that is how a sweep runs, and the point is that a superseded
    // sweep in the middle of one does not disturb the batch that replaced it.
    const sweep = (keys: string[]) =>
      keys.reduce(
        (previous, key) => previous.then(done => comparison(store, key).then(() => [...done, key])),
        Promise.resolve([] as string[]),
      )

    // The first sweep is abandoned part way, exactly as editing a rotation does.
    const abandoned = sweep(variants).catch((error: Error) => ({ rejected: error.message }))
    await settle()
    store().supersede()
    const fresh = sweep(variants)
    await settle()
    // The editor treats any rejection as a failed batch, so the replacement must not
    // inherit one from the batch it replaced.
    const freshOutcome = await Promise.race([
      fresh,
      (async () => {
        // Each variant is a separate worker job, so keep answering until the sweep ends.
        await Array.from({ length: variants.length * 2 }).reduce((previous: Promise<void>) => {
          return previous.then(async () => {
            await settle()
            workers.filter(worker => !worker.terminated).forEach(worker => worker.flush())
          })
        }, Promise.resolve() as Promise<void>)
        return { rejected: "the replacement sweep never finished" } as const
      })(),
    ])
    assert.ok(!("rejected" in freshOutcome), `The replacement sweep failed: ${JSON.stringify(freshOutcome)}`)
    assert.equal(freshOutcome.length, variants.length, "The replacement sweep did not finish every variant.")
    assert.deepEqual(
      variants.map(key => store().entry("comparisons", key)?.status),
      variants.map((): "ready" => "ready"),
      "A variant in the replacement sweep did not settle as ready.",
    )
    const abandonedResult = await abandoned
    assert.ok(
      "rejected" in abandonedResult,
      `The superseded sweep was expected to fail, but resolved: ${JSON.stringify(abandonedResult).slice(0, 80)}`,
    )
    store().reset()
  })

  it("keeps a superseded entry from being served as a result", async () => {
    const { useDpsStore, workers } = await loadStore()
    const store = () => useDpsStore.getState()
    const key = "rotation-fp:variant-fp"

    const abandoned = comparison(store, key).catch((error: Error) => ({ rejected: error.message }))
    await settle()
    store().supersede()
    await abandoned
    await settle()

    const fresh = comparison(store, key)
    await settle()
    workers[workers.length - 1].flush()
    await fresh
    // A failure left by the older batch must not shadow the real result.
    assert.equal(store().entry("comparisons", key)?.status, "ready")
    assert.equal(store().peek("comparisons", key)?.metrics.dps, 1)
    store().reset()
  })
})
