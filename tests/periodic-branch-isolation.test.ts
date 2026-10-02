import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type { MaxStackAction } from "../src/calculations/outcomeTriggeredBuffs"
import { assertClose } from "./helpers/floatEquality"

// Ported from script/probe/check-periodic-branch-isolation.mjs.
describe("periodic-branch-isolation", () => {
  it("Periodic branch isolation passed: independent owners, cadences, expiry, global attacks, conditional masses, release and conservation", async () => {
    const { ExpectedPeriodicTracker } = await import("../src/calculations/outcomeTriggeredBuffs.ts")
    const threshold: MaxStackAction = { consume: "all", trigger: "Burst" }
    const close = (actual: number, expected: number) => assertClose(actual, expected, 1e-12)
    const fork = (origin: number | undefined) => {
      const tracker = new ExpectedPeriodicTracker(1, 1.01, origin)
      // Two mutually exclusive burst histories, with absolute masses .6 and .4.
      close(tracker.apply(0, 1, 5, 2, 2, "initial", threshold, "A"), 1)
      close(tracker.apply(0, 0.4, 5, 2, 2, "initial", threshold, "B", "A"), 0.4)
      return tracker
    }

    for (const origin of [undefined, 0]) {
      const tracker = fork(origin)
      tracker.apply(0.1, 1, 5, 2, 1, "ownerA", threshold, "unused", "A")
      tracker.apply(0.2, 1, 5, 2, 1, "ownerB", threshold, "unused", "B")
      close(tracker.expirationProbability(5.1, "ownerA"), 0.6)
      close(tracker.expirationProbability(5.2, "ownerB"), 0.4)

      // Refresh A without adding stacks: B must retain its expiry, owner and cadence.
      tracker.apply(0.3, 1, 5, 2, 0, "ownerA", threshold, "unused", "A")
      close(tracker.expirationProbability(5.1, "ownerA"), 0)
      close(tracker.expirationProbability(5.3, "ownerA"), 0.6)
      close(tracker.expirationProbability(5.2, "ownerB"), 0.4)
      const firstA = origin === undefined ? 1.11 : 1
      const firstB = origin === undefined ? 1.21 : 1
      close(tracker.tickAt(firstA).sources.ownerA, 0.6)
      close(tracker.tickAt(firstB).sources.ownerB, 0.4)
      const before = tracker.tickAt(firstA)
      close(tracker.apply(0.4, 1, 5, 2, 2, "missing", threshold, "unused", "missing"), 0)
      tracker.releaseBranch("missing")
      assert.deepEqual(tracker.tickAt(firstA), before)

      // Ordinary attacks still affect both pending branches; conditional follow-up
      // uses its own chance, not the burst's absolute probability a second time.
      close(tracker.apply(0.4, 0.25, 5, 2, 1, "ordinary", threshold, "C"), 0.25)
      close(tracker.expirationProbability(5.3, "ownerA"), 0.45)
      close(tracker.expirationProbability(5.2, "ownerB"), 0.3)
      tracker.apply(0.4, 1, 5, 2, 1, "ownerC", threshold, "unused", "C")
      close(tracker.expirationProbability(5.4, "ownerC"), 0.25)
      tracker.releaseBranch("A")
      tracker.releaseBranch("B")
      tracker.releaseBranch("C")
      close(tracker.expirationProbability(5.3, "ownerA"), 0.45)
      close(tracker.tickAt(firstB).sources.ownerB, 0.3)
      tracker.consumeTick(firstA)
      close(tracker.tickAt(firstA).probability, 0)
    }

    const expiration = fork(undefined)
    expiration.apply(0.1, 1, 5, 2, 1, "ownerA", threshold, "unused", "A")
    expiration.apply(0.1, 1, 5, 2, 1, "ownerB", threshold, "unused", "B")
    close(expiration.expire(5.1, "ownerA", 0.2, "expiryA"), 0.12)
    close(expiration.expirationProbability(5.1, "ownerB"), 0.4)
    expiration.apply(5.1, 0.15, 5, 2, 1, "renewedA", threshold, "unused", "expiryA")
    close(expiration.expirationProbability(10.1, "renewedA"), 0.018)
    close(expiration.expirationProbability(5.1, "ownerB"), 0.4)
    close(expiration.expire(5.1, "ownerB", 0.2, "expiryB"), 0.08)
    expiration.releaseBranch("expiryA")
    expiration.releaseBranch("expiryB")
    close(expiration.tickAt(6.11).probability, 0.018)
    // Every history, including failed expiration rolls, remains represented.
    close(expiration.apply(6.2, 1, 5, 2, 2, "all", threshold, "total"), 1)
  })
})
