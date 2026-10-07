import { describe, expect, it } from "vitest"

import { ExpectedInsightfulStrikeTracker, type InsightfulStrikeEffect } from "@/calculations/insightfulStrike"
import { outcomeBuffTick } from "@/calculations/outcomeTriggeredBuffs"

const effect: InsightfulStrikeEffect = {
  outcome: "affinity",
  resourceName: "Focus",
  concentrationName: "Concentration",
  focusGainUnits: 20000,
  focusThresholdUnits: 20000,
  focusDecayUnitsPerTick: 1,
  focusDecayDelayTicks: 30000,
  concentrationDurationTicks: 100000,
  affinityDamageBonus: 0.1,
  directAffinityRules: [],
}

describe("Insightful Strike category queues", () => {
  it("merges rare Concentration histories across distant time buckets", () => {
    const tracker = new ExpectedInsightfulStrikeTracker()
    const chance = 2e-6
    tracker.resolveAffinity(effect, 0, chance)
    tracker.resolveAffinity(effect, outcomeBuffTick(2), chance)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(10.9))).toBeCloseTo(2 * chance - chance ** 2, 15)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(11.01))).toBe(0)
  })

  it("expires an averaged deadline before later significant entries", () => {
    const tracker = new ExpectedInsightfulStrikeTracker()
    tracker.resolveAffinity(effect, 0, 2e-6)
    tracker.resolveAffinity(effect, outcomeBuffTick(2), 0.9)
    tracker.resolveAffinity(effect, outcomeBuffTick(4), 1e-8)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(11.9))).toBeCloseTo((1 - 2e-6) * 0.9 * (1 - 1e-8), 15)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(12))).toBe(0)
  })

  it("uses each category's own affinity chance and refreshes active expiry", () => {
    const tracker = new ExpectedInsightfulStrikeTracker()
    tracker.resolveAffinity(effect, 0, 0.4)
    tracker.resolveAffinity(effect, outcomeBuffTick(2), 0, 1)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(11))).toBe(0.4)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(12))).toBe(0)
    tracker.resolveAffinity(effect, outcomeBuffTick(12), 1, 0)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(12))).toBeCloseTo(1, 15)
  })
})
