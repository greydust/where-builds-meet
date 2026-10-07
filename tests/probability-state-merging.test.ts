import { describe, expect, it } from "vitest"

import { ExpectedHawkwingTracker, type HawkwingEffect } from "@/calculations/hawkwing"
import { ExpectedInsightfulStrikeTracker, type InsightfulStrikeEffect } from "@/calculations/insightfulStrike"
import { ExpectedPeriodicTracker, OutcomeCooldownTracker, outcomeBuffTick } from "@/calculations/outcomeTriggeredBuffs"
import { mergeTinyProbabilityStates } from "@/calculations/probabilityStateMerging"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"
import { applySeasonalVitalityRanges } from "@/calculations/seasonalEdge"

describe("shared tiny probability-state merging", () => {
  it("weights differing Focus amounts and both deadlines using only chance and time buckets", () => {
    const states = [
      { focus: 2, decay: 30100, expiry: 101100, probability: 2e-6 },
      { focus: 4, decay: 30600, expiry: 101600, probability: 6e-6 },
      { focus: 3, decay: 30200, expiry: 101200, probability: 1e-5 },
      { focus: 6, decay: 30300, expiry: 101300, probability: 2e-6 },
      { focus: 3, decay: 31100, expiry: 101300, probability: 2e-6 },
      { focus: 3, decay: 30300, expiry: 102100, probability: 2e-6 },
    ]
    const merged = mergeTinyProbabilityStates(states, ["decay", "expiry"], ["focus"])
    expect(merged).toHaveLength(4)
    const weighted = merged.find(state => state.decay === 30440)!
    expect(weighted.focus).toBeCloseTo(4, 15)
    expect(weighted.expiry).toBe(101440)
    expect(weighted.probability).toBeCloseTo(1e-5, 15)
    expect(merged).toContainEqual(states[2])
    expect(merged.reduce((sum, state) => sum + state.probability, 0)).toBeCloseTo(
      states.reduce((sum, state) => sum + state.probability, 0),
      15,
    )
  })

  it("does not add an active-timer restriction and preserves singleton timestamps", () => {
    const states = [
      { deadline: 10010, probability: 2e-6 },
      { deadline: 10060, probability: 3e-6 },
      { deadline: 11010, probability: 2e-6 },
      { deadline: -Infinity, probability: 2e-6 },
    ]
    const merged = mergeTinyProbabilityStates(states, ["deadline"], [])
    expect(merged).toHaveLength(3)
    expect(merged[0].deadline).toBe(10040)
    expect(merged[0].probability).toBeCloseTo(5e-6, 15)
    expect(merged).toEqual(expect.arrayContaining([states[2], states[3]]))
  })

  const focusEffect: InsightfulStrikeEffect = {
    outcome: "affinity",
    resourceName: "Focus",
    concentrationName: "Concentration",
    focusGainUnits: 20000,
    focusThresholdUnits: 40000,
    focusDecayUnitsPerTick: 1,
    focusDecayDelayTicks: 30000,
    concentrationDurationTicks: 100000,
    affinityDamageBonus: 0.1,
    directAffinityRules: [],
  }

  it("uses the merged Focus decay deadline when a later hit crosses the conversion threshold", () => {
    const tracker = new ExpectedInsightfulStrikeTracker()
    const chance = 2e-6
    tracker.resolveAffinity(focusEffect, outcomeBuffTick(0.01), chance)
    tracker.resolveAffinity(focusEffect, outcomeBuffTick(0.06), chance)
    tracker.resolveAffinity(focusEffect, outcomeBuffTick(3.04), 1)
    // Both rare one-Focus histories now decay from 3.035s, so neither converts.
    expect(tracker.expectedConcentration(focusEffect, outcomeBuffTick(3.04))).toBeCloseTo(chance ** 2, 15)
  })

  it("uses weighted differing Focus amounts for subsequent conversion decisions", () => {
    const tracker = new ExpectedInsightfulStrikeTracker()
    const effect = { ...focusEffect, focusThresholdUnits: 60000 }
    const chance = 2e-6
    tracker.resolveAffinity(effect, outcomeBuffTick(0.01), chance)
    tracker.resolveAffinity(effect, outcomeBuffTick(0.06), chance)
    // One- and two-Focus rare branches share one weighted state below two Focus.
    tracker.resolveAffinity(effect, outcomeBuffTick(0.07), 1)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(0.07))).toBe(0)
    tracker.resolveAffinity(effect, outcomeBuffTick(0.07), 1)
    expect(tracker.expectedConcentration(effect, outcomeBuffTick(0.07))).toBeCloseTo(2 * chance - chance ** 2, 15)
  })

  it("merges Concentration expiry and Hawkwing expiry without losing activation probability", () => {
    const focus = { ...focusEffect, focusThresholdUnits: focusEffect.focusGainUnits }
    const hawkwing: HawkwingEffect = {
      name: "Hawkwing",
      outcome: "affinity",
      durationTicks: 100000,
      maxStack: 1,
      physicalAttackBonusPerStack: 0.02,
    }
    const focusTracker = new ExpectedInsightfulStrikeTracker()
    const hawkwingTracker = new ExpectedHawkwingTracker()
    const chance = 2e-6
    for (const time of [0.01, 0.06]) {
      focusTracker.resolveAffinity(focus, outcomeBuffTick(time), chance)
      hawkwingTracker.resolveAffinity(hawkwing, outcomeBuffTick(time), chance)
    }
    const mass = 2 * chance - chance ** 2
    expect(focusTracker.expectedConcentration(focus, outcomeBuffTick(10.034))).toBeCloseTo(mass, 15)
    expect(hawkwingTracker.expectedStack(hawkwing, outcomeBuffTick(10.034))).toBeCloseTo(mass, 15)
    expect(focusTracker.expectedConcentration(focus, outcomeBuffTick(10.0351))).toBe(0)
    expect(hawkwingTracker.expectedStack(hawkwing, outcomeBuffTick(10.0351))).toBe(0)
  })

  it("uses a weighted cooldown deadline for subsequent resource proc readiness", () => {
    const tracker = new OutcomeCooldownTracker()
    tracker.resolve(0.01, 2e-6, 3)
    tracker.resolve(0.06, 2e-6, 3)
    expect(tracker.resolve(3.04, 1, 3)).toBeCloseTo(1, 15)
  })

  it("weights rare Yield histories while preserving expected Vitality recovery", () => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Rare Yield",
        steps: [
          { type: "event", event: "Delay", duration: 1 },
          { type: "event", event: "Delay", duration: 1 },
          { type: "event", event: "Delay", duration: 0 },
        ],
      },
      skills: {},
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      initialResources: { Vitality: 10 },
    })
    const chance = 2e-6
    const windows = [0, 1].map(time => ({
      id: String(time),
      sourceRowId: String(time),
      startsAt: time,
      expiresAt: time + 1,
      cooldownExpiresAt: time + 1,
      yieldProbability: chance,
    }))
    const result = applySeasonalVitalityRanges(timeline, windows, 100)!
    expect(result.endingDistribution).toHaveLength(2)
    expect(result.endingDistribution.reduce((sum, state) => sum + state.probability, 0)).toBeCloseTo(1, 15)
    expect(result.endingDistribution.reduce((sum, state) => sum + state.vitality * state.probability, 0)).toBeCloseTo(
      10 + 4 * chance,
      12,
    )
  })

  it.each(["packed", "indexed"] as const)("weights differing application-relative cadences in %s storage", storage => {
    const tracker = new ExpectedPeriodicTracker(1, 1.01, undefined, storage)
    const chances = [2e-6, 6e-6, 2e-6]
    for (const [index, time] of [0.11, 0.16, 0.17].entries()) tracker.apply(time, chances[index], 5, 1, 1, "owner")
    const mass = chances.reduce((total, chance) => total + (1 - total) * chance, 0)
    expect(tracker.mergeTinyExpirations(0.2)).toBe(true)
    expect(tracker.stateCount).toBe(2)
    expect(tracker.nextTick(0.2)).toBe(1.162)
    expect(tracker.tickAt(1.162).probability).toBeCloseTo(mass, 15)
    expect(tracker.tickAt(1.162).sources.owner).toBeCloseTo(mass, 15)
  })
})
