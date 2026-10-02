import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

import { build } from "esbuild"
import { describe, it } from "vitest"

import { ExpectedPeriodicTracker as Current, type MaxStackAction } from "../src/calculations/outcomeTriggeredBuffs"
import {
  mergePeriodicLists,
  mergeTinyPeriodicEntries,
  periodicStateListFactory,
  type PeriodicStateList,
} from "../src/calculations/periodicStateLists"
import { assertClose } from "./helpers/floatEquality"

// Ported from script/probe/check-periodic-state-storage.mjs. The reference
// model is committed source loaded from git history; shallow checkouts
// without that object skip only the reference comparison.
const REFERENCE_COMMIT = "78537e2"
const REFERENCE_PATH = "src/calculations/outcomeTriggeredBuffs.ts"

function referenceAvailable() {
  try {
    execFileSync("git", ["cat-file", "-e", `${REFERENCE_COMMIT}:${REFERENCE_PATH}`], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const close = (a: number, b: number) => assertClose(a, b, 1e-11)
const threshold: MaxStackAction = { consume: "all", trigger: "Burst" }

/**
 * The public surface of the tracker both the current and the reference model expose.
 *
 * The reference is loaded from a committed revision and compiled at runtime, so it
 * carries no static type; the current tracker's method names are the dispatch keys
 * and its results are what the reference is checked against.
 */
type TrackerMethodName = keyof Current
let seed = 20260908
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}

async function loadReferenceTracker() {
  const referenceSource = execFileSync("git", ["show", `${REFERENCE_COMMIT}:${REFERENCE_PATH}`], { encoding: "utf8" })
  const bundled = await build({
    stdin: { contents: referenceSource, loader: "ts", resolveDir: "src/calculations" },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
  })
  const source = bundled.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
}

describe("periodic-state-storage", () => {
  it("storage list operations", async () => {
    for (const storage of ["packed", "indexed"] as const) {
      const createList = periodicStateListFactory(storage)
      const a = createList(),
        b = createList()
      const read = (list: PeriodicStateList) => {
        const rows = []
        for (let i = list.head; i >= 0; i = list.next(i)) rows.push([list.expires[i], list.mass[i]])
        return rows
      }
      a.add(5, 0.1, 0)
      a.add(7, 0.2, 0)
      a.add(6, 0.3, 0)
      a.add(7, 0.4, 0)
      assert.deepEqual(read(a), [
        [5, 0.1],
        [6, 0.3],
        [7, 0.6000000000000001],
      ])
      a.shift()
      b.add(2, 0.8, 0) // Reuse must not corrupt another list's links.
      a.retain(i => a.expires[i] !== 6)
      a.add(6.5, 0.3, 0)
      a.add(8, 0.5, 0)
      assert.deepEqual(read(a), [
        [6.5, 0.3],
        [7, 0.6000000000000001],
        [8, 0.5],
      ])
      assert.deepEqual(read(b), [[2, 0.8]])
      a.retain(() => false)
      a.add(1, 1, 0)
      assert.deepEqual(read(a), [[1, 1]])

      for (let trial = 0; trial < 100; trial++) {
        const list = createList()
        const rows = []
        for (let expires = 1; expires < 200; expires++) {
          if (random() < 0.3) continue
          const mass = random() < 0.3 ? 0.1 : (1 + Math.floor(random() * 8)) * 1e-7
          const pending = mass * random()
          rows.push({ expires, mass, pending })
          list.add(expires, mass, pending)
        }
        // Independent reference: group original eligible entries, then sort once.
        const groups = new Map()
        for (const row of rows) {
          if (row.expires <= 15 || row.mass >= 1e-5) continue
          const bucket = Math.floor(row.expires / 10)
          if (!groups.has(bucket)) groups.set(bucket, [])
          groups.get(bucket).push(row)
        }
        const removed = new Set(),
          replacements = []
        for (const group of groups.values()) {
          if (group.length < 2) continue
          let mass = 0,
            pending = 0,
            weighted = 0
          for (const row of group) {
            removed.add(row)
            mass += row.mass
            pending += row.pending
            weighted += (row.expires - group[0].expires) * row.mass
          }
          replacements.push({ expires: group[0].expires + Math.round(weighted / mass), mass, pending })
        }
        const expected = new Map()
        for (const row of [...rows.filter(row => !removed.has(row)), ...replacements].sort(
          (a, b) => a.expires - b.expires,
        )) {
          const prior = expected.get(row.expires) ?? { mass: 0, pending: 0 }
          expected.set(row.expires, { mass: prior.mass + row.mass, pending: prior.pending + row.pending })
        }
        assert.equal(mergeTinyPeriodicEntries(list, 15, 1e-5, 10), replacements.length > 0)
        assert.equal(list.size, expected.size)
        let position = list.head
        for (const [expires, value] of expected) {
          assert.equal(list.expires[position], expires)
          close(list.mass[position], value.mass)
          close(list.pending[position], value.pending)
          position = list.next(position)
        }
        assert.equal(position, -1)
      }

      // Interleaved branch release must advance one cursor, not rescan every prefix.
      const destination = createList(),
        source = createList()
      for (let i = 0; i < 1000; i++) {
        destination.add(i * 2, 0.2, 0)
        source.add(i * 2 + 1, 0.3, 0)
      }
      let visits = 0
      const next = destination.next.bind(destination)
      destination.next = index => {
        visits++
        return next(index)
      }
      mergePeriodicLists(destination, source)
      assert.ok(visits <= 4000, `Branch merge must be linear, visited ${visits} links`)
      assert.equal(source.size, 0)
      assert.equal(destination.size, 2000)
      assert.deepEqual(
        read(destination),
        Array.from({ length: 2000 }, (_, i) => [i, i % 2 ? 0.3 : 0.2]),
      )
    }
  })

  it.skipIf(!referenceAvailable())("matches the committed reference model", async () => {
    const { ExpectedPeriodicTracker: Reference } = await loadReferenceTracker()
    for (const storage of ["packed", "indexed"] as const)
      for (const origin of [undefined, 0, 0.05])
        for (let trial = 0; trial < 12; trial++) {
          const expected = new Reference(1, 1.01, origin)
          const actual = new Current(1, 1.01, origin, storage)
          const both = (method: TrackerMethodName, ...args: unknown[]) => {
            const left = expected[method](...args)
            const right = (actual as unknown as Record<TrackerMethodName, (...callArgs: unknown[]) => unknown>)[method](
              ...args,
            )
            if (typeof left === "number") close(left, right as number)
            return left
          }
          let time = 0,
            serial = 0
          const followup = (branch: string, owner: string, at: number, guaranteed: boolean) => {
            both("apply", at, 0.15, 5, 5, 1, owner, threshold, `nested-${serial++}`, branch)
            if (guaranteed) both("apply", at, 1, 5, 5, 1, owner, threshold, `nested-${serial++}`, branch)
            both("releaseBranch", branch)
          }
          for (let hit = 0; hit < 40; hit++) {
            time += 0.05 + Math.floor(random() * 4) * 0.05
            let expiration
            while (
              (expiration = [...expected.expirationSchedule().values()]
                .filter(item => item.time <= time)
                .sort((a, b) => a.time - b.time)[0])
            ) {
              const branch = `expiry-${serial++}`
              both("expire", expiration.time, expiration.source, 0.2, branch)
              followup(branch, expiration.source, expiration.time, false)
            }
            const owner = random() < 0.5 ? "A" : "B"
            const chance = [0, 0.15, 0.4, 1][Math.floor(random() * 4)]
            const gain = Math.floor(random() * 3)
            const duration = [0.2, 0.7, 1.3, 5][Math.floor(random() * 4)]
            const branch = `hit-${serial++}`
            const probability = both("apply", time, chance, duration, 5, gain, owner, threshold, branch)
            if (probability > 0) followup(branch, owner, time, true)
            const schedule = [...expected.expirationSchedule().values()]
            const earliest = schedule.length ? Math.min(...schedule.map(item => item.time)) : undefined
            assert.equal(actual.nextExpiration(), earliest)
            for (const item of schedule) both("expirationProbability", item.time, item.source)
            const query = origin === undefined ? time + 1.01 : origin + Math.ceil(time - origin) * 1
            const left = expected.tickAt(query),
              right = actual.tickAt(query)
            close(left.probability, right.probability)
            for (const owner of ["A", "B"]) close(left.sources[owner] ?? 0, right.sources[owner] ?? 0)
          }
          close(both("apply", time + 0.01, 1, 5, 5, 5, "total", threshold, "all"), 1)
        }
  })
})
