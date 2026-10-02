import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type { MaxStackAction } from "@/calculations/outcomeTriggeredBuffs"

import { assertClose } from "./helpers/floatEquality"

// Ported from script/probe/check-periodic-state-merging.mjs.
describe("periodic-state-merging", () => {
  it("periodic-state-merging checks", async () => {
    const { ExpectedPeriodicTracker } = await import("../src/calculations/outcomeTriggeredBuffs.ts")
    const threshold: MaxStackAction = { consume: "all", trigger: "Burst" }
    const close = (actual: number, expected: number) => assertClose(actual, expected, 1e-15)
    const fixture = ({
      origin = 0,
      mass = 5e-7,
      firstTime = 0.11,
      secondTime = 0.16,
      secondSource = "owner",
      secondStack = 1,
    } = {}) => {
      const tracker = new ExpectedPeriodicTracker(1, 1.01, origin)
      tracker.apply(0, mass, 5, 5, 5, "owner", threshold, "A")
      tracker.apply(0, 0.6, 5, 5, 5, "owner", threshold, "B", "A")
      tracker.apply(firstTime, 1, 5, 5, 1, "owner", threshold, "unused", "A")
      tracker.apply(secondTime, 1, 5, 5, secondStack, secondSource, threshold, "unused", "B")
      return tracker
    }
    const merged = fixture()
    assert.equal(merged.mergeTinyExpirations(0.2), false, "Pending conditional branches must not merge")
    merged.releaseBranch("A")
    assert.equal(merged.mergeTinyExpirations(0.2), false, "One released state cannot absorb an unresolved branch")
    merged.releaseBranch("B")
    const before = merged.tickAt(1).probability
    assert.equal(merged.mergeTinyExpirations(0.2), true)
    close(merged.tickAt(1).probability, before)
    close(merged.expirationProbability(5.14, "owner"), 5e-7)
    close(merged.expirationProbability(5.11, "owner"), 0)
    close(merged.expirationProbability(5.16, "owner"), 0)
    assert.equal(merged.nextExpiration(), 5.14)
    assert.deepEqual([...merged.expirationSources(5.14)], ["owner"])
    close(merged.apply(0.3, 1, 5, 5, 4, "owner", threshold, "burst"), 5e-7)
    close(merged.apply(0.4, 1, 5, 5, 5, "owner", threshold, "all"), 1)

    for (const options of [{ secondSource: "different" }, { secondStack: 2 }, { secondTime: 0.26 }, { mass: 0.01 }]) {
      const tracker = fixture(options)
      tracker.releaseBranch("A")
      tracker.releaseBranch("B")
      assert.equal(
        tracker.mergeTinyExpirations(0.3),
        false,
        `Must keep incompatible or significant states: ${JSON.stringify(options)}`,
      )
    }
    const exact = new ExpectedPeriodicTracker(1, 1.01)
    const newlyEligible = fixture({ mass: 5e-6 })
    newlyEligible.releaseBranch("A")
    newlyEligible.releaseBranch("B")
    assert.equal(
      newlyEligible.mergeTinyExpirations(0.2),
      true,
      "States between the former and current thresholds now merge",
    )
    close(newlyEligible.expirationProbability(5.14, "owner"), 5e-6)
    close(newlyEligible.apply(0.3, 1, 5, 5, 5, "owner", threshold, "all"), 1)

    exact.apply(0.11, 2e-7, 5, 5, 1, "owner")
    exact.apply(0.16, 3e-7, 5, 5, 1, "owner")
    assert.equal(exact.mergeTinyExpirations(0.2), false, "Exact-cadence trackers are unchanged")
    close(exact.tickAt(1.12).probability, 2e-7)

    const pending = fixture({ origin: 0.05, firstTime: 1.01, secondTime: 1.05 })
    pending.releaseBranch("A")
    pending.releaseBranch("B")
    assert.equal(pending.mergeTinyExpirations(1.05), true)
    close(pending.tickAt(1.05).probability, 2e-7)
    pending.consumeTick(1.05)
    close(pending.tickAt(2.05).probability, 5e-7)

    const expired = fixture()
    expired.releaseBranch("A")
    expired.releaseBranch("B")
    assert.equal(expired.mergeTinyExpirations(5.12), false, "Merging must not resurrect already expired mass")
  })
})
