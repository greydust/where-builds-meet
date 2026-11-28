import sets from "@gamedata/gear-set.json"
import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { CriticalHealingBuffTracker } from "@/calculations/criticalHealingBuff"
import {
  calculateRotationBaseline,
  calculateRotationSimulation,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { effectForSoloLevel } from "@/data/soloLevelEffects"
import { emptyStats } from "@/data/statDefinitions"

function bundle(groupSize: 1 | 5 = 1, fullHP = false): RotationSimulationBundle {
  return {
    timeline: {
      rotation: { name: "Ivorybloom retention", ping: 0, groupSize, steps: [{ type: "skill", skill: "Observe" }] },
      skills: {
        Observe: {
          castTime: 7,
          group: true,
          action: [
            { type: "takeDamage", damage: fullHP ? 0 : 9000, time: 0 },
            { type: "heal", phyCoef: 0.01, time: 0.1 },
            { type: "damage", phyCoef: 1, time: 0.2 },
            { type: "heal", phyCoef: 0.01, time: 2 },
            { type: "damage", phyCoef: 1, time: 3.1 },
            { type: "damage", phyCoef: 1, time: 5 },
          ],
        },
      },
      setupEffects: sets.Ivorybloom.options["4"].effect.map(effect => effectForSoloLevel(effect, 17, "Ivorybloom")),
      effectDefinitions: {},
      eventDefinitions: {},
      dots: {},
      innerWayRules: [],
      innerWayConditions: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      maxHP: 10000,
    },
    startAnchor: { rowId: "rotation-0" },
    stats: { ...emptyStats, minPhys: 100, maxPhys: 100, maxHp: 10000, precision: 1, crit: 0.41 },
    enemy: {
      name: "Target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    attunement: emptyAttunementStats,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}

describe("Ivorybloom critical healing retention", () => {
  it.each([1, 5] as const)(
    "tracks refresh and expiry with %s recipients and active-state critical rates",
    groupSize => {
      const result = calculateRotationBaseline(bundle(groupSize))
      const first = 1 - 0.5 ** groupSize
      const refreshed = (1 - first) * (1 - 0.5 ** groupSize) + first * (1 - 0.45 ** groupSize)
      expect(result.actionBreakdowns["rotation-0:1"].healing!.criticalRate).toBeCloseTo(0.5, 12)
      expect(result.actionBreakdowns["rotation-0:2"].outcomeRates!.critical).toBeCloseTo(0.5 + first * 0.05, 12)
      expect(result.actionBreakdowns["rotation-0:3"].healing!.criticalRate).toBeCloseTo(0.5 + first * 0.05, 12)
      expect(result.actionBreakdowns["rotation-0:4"].outcomeRates!.critical).toBeCloseTo(0.5 + refreshed * 0.05, 12)
      expect(result.actionBreakdowns["rotation-0:5"].outcomeRates!.critical).toBeCloseTo(0.5, 12)
    },
  )

  it("weights complete damage and healing results, including the critical multipliers", () => {
    const input = bundle()
    input.stats.critDmgBonus = 0.5
    input.stats.criticalHealingBonus = 0.5
    const actual = calculateRotationBaseline(input)
    const inactiveInput = structuredClone(input)
    for (const effect of inactiveInput.timeline.setupEffects) delete effect.retainAfterCriticalHealing
    const inactive = calculateRotationBaseline(inactiveInput)
    const fullInput = structuredClone(input)
    fullInput.timeline.skills.Observe.action![0] = { type: "takeDamage", damage: 0, time: 0 }
    const full = calculateRotationBaseline(fullInput)
    const damage = (result: ReturnType<typeof calculateRotationBaseline>) =>
      result.actionBreakdowns["rotation-0:2"].total
    const healing = (result: ReturnType<typeof calculateRotationBaseline>) =>
      result.actionBreakdowns["rotation-0:3"].healing!.total
    expect(damage(actual)).toBeCloseTo((damage(inactive) + damage(full)) / 2, 12)
    expect(healing(actual)).toBeCloseTo((healing(inactive) + healing(full)) / 2, 12)
  })

  it("does not double the bonus at full HP", () => {
    const result = calculateRotationBaseline(bundle(5, true))
    const breakdowns = Object.values(result.actionBreakdowns)
    for (const breakdown of breakdowns.filter(value => value.outcomeRates))
      expect(breakdown.outcomeRates!.critical).toBeCloseTo(0.55, 12)
    for (const breakdown of breakdowns.filter(value => value.healing))
      expect(breakdown.healing!.criticalRate).toBeCloseTo(0.55, 12)
  })

  it("refreshes the sampled deadline and expires exactly three seconds after the last critical heal", () => {
    const result = calculateSimulatedRotationRun(bundle(), () => 0)
    const stack = (id: string) =>
      result.resolvedSequence.find(({ entry }) => entry.id === id)!.expectedBuffStacks!.Ivorybloom
    expect(stack("rotation-0:2")).toBe(1)
    expect(stack("rotation-0:4")).toBe(1)
    expect(stack("rotation-0:5")).toBe(0)
  })

  it("retains a critical heal performed at full HP after subsequent damage", () => {
    const input = bundle(1, true)
    input.timeline.skills.Observe.action!.splice(2, 0, { type: "takeDamage", damage: 9000, time: 0.15 })
    const result = calculateSimulatedRotationRun(input, () => 0)
    const hit = result.resolvedSequence.find(({ entry }) => entry.id === "rotation-0:3")!
    expect(hit.expectedBuffStacks!.Ivorybloom).toBe(1)
    expect(hit.entry.context.currentHPRatio).toBeCloseTo(0.1)
  })

  it("rebuilds stat comparisons with their own proc probabilities", () => {
    const input = bundle()
    const stronger = { ...input.stats, crit: 0.61 }
    input.statPriority = [{ label: "More critical", stats: stronger }]
    const actual = calculateRotationSimulation(input)
    const expected = calculateRotationBaseline({ ...input, stats: stronger, statPriority: [] })
    expect(actual.metrics.statPriority[0].dpsDifference).toBeCloseTo(expected.metrics.dps - actual.metrics.dps, 10)
    expect(actual.metrics.statPriority[0].hpsDifference).toBeCloseTo(expected.metrics.hps - actual.metrics.hps, 10)
  })

  it("preserves independent expiration masses when only some branches refresh", () => {
    const tracker = new CriticalHealingBuffTracker()
    tracker.refresh(0, 300, 0.5, 0.55)
    tracker.refresh(200, 300, 0.5, 0.55)
    expect(tracker.probability(299)).toBeCloseTo(0.75)
    expect(tracker.probability(300)).toBeCloseTo(0.525)
    expect(tracker.probability(500)).toBe(0)
  })

  it("samples teammate critical heals even when the self heal is normal", () => {
    const input = bundle(5)
    let rolls = 0
    const result = calculateSimulatedRotationRun(input, () => {
      // Each recipient rolls outcome then two attack multipliers; only the second recipient crits.
      const index = rolls++
      return index === 3 ? 0.1 : 0.9
    })
    const firstHeal = result.resolvedSequence.find(({ entry }) => entry.id === "rotation-0:1")!
    expect(firstHeal.breakdown.recipientHealing![0].outcome).toBe("normal")
    expect(firstHeal.breakdown.recipientHealing![1].outcome).toBe("critical")
    const afterHeal = result.resolvedSequence.find(({ entry }) => entry.id === "rotation-0:2")!
    expect(afterHeal.expectedBuffStacks!.Ivorybloom).toBe(1)
    const afterExpiry = result.resolvedSequence.find(({ entry }) => entry.id === "rotation-0:4")!
    expect(afterExpiry.expectedBuffStacks!.Ivorybloom).toBe(0)
  })
})
