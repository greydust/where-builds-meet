import { assert, describe, it, vi } from "vitest"

/**
 * The store is the only caller of the worker pool, so these cover the behaviour the
 * removed main-thread cache used to provide: one dispatch per distinct calculation,
 * isolation between fingerprints, and a bound on how many results are held.
 */
async function loadStore() {
  vi.resetModules()
  const dispatched: any[] = []
  class FakeWorker {
    listeners = new Map()
    terminated = false
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      dispatched.push(message)
      queueMicrotask(() => {
        if (this.terminated) return
        // A reading is answered with a reading; every other mode is answered with metrics.
        const payload =
          message.mode === "throughput"
            ? { throughput: { dps: 1, hps: 2, totalDamage: 3 } }
            : { metrics: { dps: 1, breakdown: {} } }
        for (const listener of this.listeners.get("message") ?? []) {
          listener({ data: { id: message.id, ...payload } })
        }
      })
    }
    terminate() {
      this.terminated = true
    }
  }
  vi.stubGlobal("Worker", FakeWorker)
  const { useDpsStore } = await import("@/stores/dpsStore.ts")
  return { useDpsStore, dispatched }
}

const bundle = { timeline: { rotation: { name: "Store probe", steps: [] } }, weapons: [] } as never
describe("dps-store", () => {
  it("runs one worker job per distinct calculation and serves repeats from the result", async () => {
    const { useDpsStore, dispatched } = await loadStore()
    const store = () => useDpsStore.getState()
    // Read through a call so each comparison sees a plain number: asserting on
    // `dispatched.length` twice would otherwise narrow the first check's literal
    // into the second and report the later count as an impossible comparison.
    const jobs = () => dispatched.length
    let builds = 0
    const build = () => {
      builds += 1
      return bundle
    }

    const first = await store().ensure({ kind: "baseline", cacheKey: "a", build })
    const second = await store().ensure({ kind: "baseline", cacheKey: "a", build })

    assert(jobs() === 1, `A repeated calculation dispatched ${jobs()} jobs.`)
    assert(builds === 1, `A repeated calculation built its bundle ${builds} times.`)
    assert(first === second, "A repeated calculation did not return the held result.")
    assert(store().peek("baseline", "a") === first, "The held result was not readable without scheduling.")

    await store().ensure({ kind: "baseline", cacheKey: "b", build })
    assert(jobs() === 2, "A distinct calculation reused another fingerprint's job.")
    assert(store().peek("baseline", "a") === first, "A new calculation evicted an unrelated held result.")
    store().reset()
  })

  it("joins concurrent requests for one calculation instead of queueing both", async () => {
    const { useDpsStore, dispatched } = await loadStore()
    const store = () => useDpsStore.getState()
    const [left, right] = await Promise.all([
      store().ensure({ kind: "baseline", cacheKey: "shared", build: () => bundle }),
      store().ensure({ kind: "baseline", cacheKey: "shared", build: () => bundle }),
    ])
    assert(dispatched.length === 1, `Concurrent requests for one calculation dispatched ${dispatched.length} jobs.`)
    assert(left === right, "Concurrent requests for one calculation produced different results.")
    store().reset()
  })

  it("holds no editor timeline, so a later revision cannot read an earlier one", async () => {
    const { useDpsStore, dispatched } = await loadStore()
    const store = () => useDpsStore.getState()
    await store().ensure({ kind: "editorTimeline", cacheKey: "editor:one", build: () => bundle })
    await store().ensure({ kind: "editorTimeline", cacheKey: "editor:one", build: () => bundle })
    assert(
      dispatched.length === 2,
      "An editor timeline was held, so a second revision of the same rotation reused the first timeline.",
    )
    assert(store().peek("editorTimeline", "editor:one") === undefined, "An editor timeline was retained in the store.")
    store().reset()
  })

  it("keeps two kinds apart when they choose the same cache key", async () => {
    const { useDpsStore, dispatched } = await loadStore()
    const store = () => useDpsStore.getState()
    // Both a reading and a baseline are fingerprinted bundles, so the same key can honestly
    // name work of two different shapes. One must not answer for the other.
    const baseline = await store().ensure({ kind: "baseline", cacheKey: "shared", build: () => bundle })
    const reading = await store().ensure({ kind: "throughput", cacheKey: "shared", build: () => bundle })

    assert.equal(dispatched.length, 2, "A reading joined the baseline's job instead of running its own.")
    assert.deepEqual(reading, { dps: 1, hps: 2, totalDamage: 3 }, "A reading was answered with a baseline's result.")
    assert.equal(store().peek("baseline", "shared"), baseline, "A reading displaced the baseline held under its key.")
    assert.deepEqual(
      store().peek("throughput", "shared"),
      { dps: 1, hps: 2, totalDamage: 3 },
      "The reading was not readable under its own kind.",
    )
    store().reset()
  })

  it("bounds how many baselines it holds, dropping the oldest first", async () => {
    const { useDpsStore } = await loadStore()
    const store = () => useDpsStore.getState()
    const limit = 64
    await Promise.all(
      Array.from({ length: limit + 5 }, (_, index) =>
        store().ensure({ kind: "baseline", cacheKey: `key-${index}`, build: () => bundle }),
      ),
    )
    assert(store().peek("baseline", "key-0") === undefined, "The oldest baseline survived past the retention bound.")
    assert(store().peek("baseline", "key-1") === undefined, "Eviction did not continue past the oldest entry.")
    assert(store().peek("baseline", `key-${limit + 4}`) !== undefined, "The newest baseline was evicted.")
    store().reset()
  })
})
