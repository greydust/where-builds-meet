import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type { MaxStackAction } from "@/calculations/outcomeTriggeredBuffs"

import { assertClose } from "./helpers/floatEquality"

// Ported from script/probe/check-periodic-state-merging.mjs.
describe("periodic-state-merging", () => {
  it("periodic-state-merging checks", async () => {
    const { ExpectedPeriodicTracker } = await import("@/calculations/outcomeTriggeredBuffs.ts")
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

    for (const secondTime of [0.26, 3.16]) {
      const tracker = fixture({ secondTime })
      tracker.releaseBranch("A")
      tracker.releaseBranch("B")
      assert.equal(tracker.mergeTinyExpirations(secondTime), true, "Same-stack rare states merge across deadlines")
      const expiry = Math.round((5 + 0.11 * 0.4 + secondTime * 0.6) * 10_000) / 10_000
      close(tracker.expirationProbability(expiry, "owner"), 5e-7)
      close(tracker.stackProbabilities(secondTime).get(1)!, 5e-7)
      close(tracker.apply(secondTime + 0.01, 1, 5, 5, 4, "owner", threshold, "burst"), 5e-7)
    }
    {
      const tracker = fixture({ mass: 0.01 })
      tracker.releaseBranch("A")
      tracker.releaseBranch("B")
      assert.equal(tracker.mergeTinyExpirations(0.3), false, "Significant states retain their deadlines")
    }
    const differing = fixture({ secondSource: "different" })
    differing.releaseBranch("A")
    differing.releaseBranch("B")
    assert.equal(differing.mergeTinyExpirations(0.3), true)
    close(differing.stackProbabilities(1).get(1)!, 5e-7)
    close(differing.tickAt(1).sources.owner, 2e-7)
    close(differing.tickAt(1).sources.different, 3e-7)
    close(differing.expirationProbability(5.14, "owner"), 2e-7)
    close(differing.expirationProbability(5.14, "different"), 3e-7)
    const differingStacks = fixture({ secondStack: 2 })
    differingStacks.releaseBranch("A")
    differingStacks.releaseBranch("B")
    assert.equal(differingStacks.mergeTinyExpirations(0.3), false, "Different bleed stacks remain separate")
    close(differingStacks.stackProbabilities(1).get(1)!, 2e-7)
    close(differingStacks.stackProbabilities(1).get(2)!, 3e-7)
    close(differingStacks.expirationProbability(5.11, "owner"), 2e-7)
    close(differingStacks.expirationProbability(5.16, "owner"), 3e-7)
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
    assert.equal(exact.mergeTinyExpirations(0.2), true)
    // Both successful applications retain a separate two-stack history and its
    // original cadence; only the one-stack histories share the mean deadline.
    close(exact.tickAt(1.12).probability, 2e-7 * 3e-7)
    close(exact.tickAt(1.15).probability, 2e-7 + 3e-7 - 2 * 2e-7 * 3e-7)
    assert.equal(exact.nextTick(0.2), 1.12)

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
    assert.equal(
      expired.mergeTinyExpirations(5.12),
      true,
      "Probability and stack determine merge eligibility, not time buckets",
    )
    assert.equal(expired.nextExpiration(), 5.14)
  })
})
