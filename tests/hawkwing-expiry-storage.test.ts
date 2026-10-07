import { describe, expect, it } from "vitest"

import { ExpectedHawkwingTracker, type HawkwingEffect } from "@/calculations/hawkwing"
import { outcomeBuffTick } from "@/calculations/outcomeTriggeredBuffs"

const effect: HawkwingEffect = {
  name: "Hawkwing",
  outcome: "affinity",
  durationTicks: outcomeBuffTick(5),
  maxStack: 5,
  physicalAttackBonusPerStack: 0.02,
}

describe("Hawkwing cached expiry storage", () => {
  it("expires only earlier histories and keeps repeated reads stable", () => {
    const tracker = new ExpectedHawkwingTracker()
    tracker.resolveAffinity(effect, 0, 0.5)
    tracker.resolveAffinity(effect, outcomeBuffTick(2), 0.5)
    expect(tracker.expectedStack(effect, outcomeBuffTick(4))).toBe(1)
    expect(tracker.expectedStack(effect, outcomeBuffTick(4))).toBe(1)
    expect(tracker.expectedStack(effect, outcomeBuffTick(5))).toBe(0.75)
    expect(tracker.expectedStack(effect, outcomeBuffTick(5))).toBe(0.75)
    expect(tracker.expectedStack(effect, outcomeBuffTick(7))).toBe(0)
    tracker.resolveAffinity(effect, outcomeBuffTick(7), 1)
    expect(tracker.expectedStack(effect, outcomeBuffTick(7))).toBe(1)
  })
})
