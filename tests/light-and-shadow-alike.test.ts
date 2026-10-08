import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { buildRotationTimeline, type EditableObject } from "@/calculations/rotationTimeline"
import { innerWayEntriesForTag } from "@/data/innerWayDefinitions"
import { emptyStats } from "@/data/statDefinitions"

function bundle(
  tier: number,
  actions: EditableObject[],
  tags = ["DirectDamage"],
  enabled = true,
): RotationSimulationBundle {
  const selected = enabled ? [{ innerWay: "LightAndShadowAlike", tier: `T${tier}` }] : []
  const stats = { ...emptyStats, maxHp: 10000, minPhys: 1000, maxPhys: 1000, precision: 1 }
  return {
    timeline: {
      rotation: { name: "Light and Shadow", steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: { castTime: 12, tags, action: actions } },
      effectDefinitions,
      dots: {},
      eventDefinitions: {},
      setupEffects: [],
      weapons: [],
      maxHP: stats.maxHp,
      innerWayConditions: [...innerWayConditionsFor(selected, undefined, "silkbindDeluge")],
      innerWayRules: innerWayEffectRulesFor(selected, 21, "silkbindDeluge"),
    },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
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
    weapons: [],
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}
const hit = (time: number): EditableObject => ({ type: "damage", time, phyCoef: 1 })

describe("Light and Shadow Alike", () => {
  it("is selectable for Deluge and contributes through its shared rules", () => {
    expect(innerWayEntriesForTag("SilkbindDeluge").some(([id]) => id === "LightAndShadowAlike")).toBe(true)
    const result = calculateRotationBaseline(bundle(0, [hit(0)]))
    const baseline = calculateRotationBaseline(bundle(0, [hit(0)], undefined, false))
    expect(result.metrics.totalDamage / baseline.metrics.totalDamage).toBeCloseTo(1.03, 12)
  })

  it.each([0, 1, 3, 6])("uses exact target-HP thresholds and caps at tier %s", tier => {
    const step = tier < 3 ? 20 : 15
    const base = tier === 6 ? 0.05 : 0.03
    const increment = tier === 6 ? 0.01 : 0.005
    for (const [hp, stacks] of [
      [1, 0],
      [(100 - step + 0.001) / 100, 0],
      [(100 - step) / 100, 1],
      [0.01, 4],
    ]) {
      const actions = [{ type: "setTargetHP", time: 0, targetHPRatio: hp }, hit(1)]
      const result = calculateRotationBaseline(bundle(tier, actions))
      // Keep tier stat bonuses in the reference; remove only the effect rules.
      const reference = bundle(tier, actions)
      reference.timeline.innerWayRules = reference.timeline.innerWayRules.filter(rule =>
        Object.keys(rule.effect).includes("rawStat"),
      )
      expect(result.metrics.totalDamage / calculateRotationBaseline(reference).metrics.totalDamage).toBeCloseTo(
        1 + base + stacks * increment,
        12,
      )
    }
  })

  it("excludes indirect damage and leaves tier-zero healing unchanged", () => {
    for (const tags of [["DOT"], []]) {
      const result = calculateRotationBaseline(bundle(0, [hit(0)], tags))
      const reference = calculateRotationBaseline(bundle(0, [hit(0)], tags, false))
      expect(result.metrics.totalDamage).toBe(reference.metrics.totalDamage)
    }
    const actions = [{ type: "heal", time: 0, phyCoef: 1 }]
    expect(calculateRotationBaseline(bundle(0, actions)).metrics.totalHealing).toBe(
      calculateRotationBaseline(bundle(0, actions, undefined, false)).metrics.totalHealing,
    )
  })

  it.each([1, 3, 6])("uses pre-hit self HP for reduction and live self HP for healing at tier %s", tier => {
    const actions = [
      { type: "setHP", time: 0, currentHP: 1000 },
      { type: "takeDamage", time: 1, damage: 100 },
      { type: "heal", time: 2, phyCoef: 1 },
    ]
    const input = bundle(tier, actions)
    const result = calculateRotationBaseline(input)
    const reference = bundle(tier, actions)
    reference.timeline.innerWayRules = reference.timeline.innerWayRules.filter(rule =>
      Object.keys(rule.effect).includes("rawStat"),
    )
    const bonus = tier === 6 ? 0.09 : 0.05
    expect(result.metrics.totalHealing / calculateRotationBaseline(reference).metrics.totalHealing).toBeCloseTo(
      1 + bonus,
      12,
    )
    const row = buildRotationTimeline(input.timeline)[0]
    expect(row.actions[1].damage).toBeCloseTo(100 * (1 - bonus), 12)
    expect(row.actionStates[2].currentHP).toBeCloseTo(1000 - 100 * (1 - bonus), 12)
  })

  it("builds and caps Light, consumes it on incoming hits, and expires after five seconds", () => {
    const actions = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(hit)
    actions.push({ type: "takeDamage", time: 0.6, damage: 100 }, hit(0.7), hit(6))
    const input = bundle(4, actions)
    for (const roll of [undefined, () => 0.5]) {
      const row = buildRotationTimeline(input.timeline, roll)[0]
      const light = (index: number) => row.actionStates[index].buffs.get("RighteousLight")?.stack ?? 0
      expect(light(0)).toBe(0)
      expect(light(5)).toBe(5)
      expect(light(7)).toBe(4)
      expect(row.actionStates[7].buffs.get("RighteousDarkness")?.stack).toBe(1)
      expect(light(8)).toBe(0)
    }
    const result = calculateRotationBaseline(input)
    expect(result.actionBreakdowns["rotation-0:5"].total / result.actionBreakdowns["rotation-0:0"].total).toBeCloseTo(
      1.045 / 1.03,
      12,
    )
  })

  it("boosts healing and reduction with Darkness, while T6 stops stack generation", () => {
    const actions: EditableObject[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(time => ({
      type: "takeDamage",
      time,
      damage: 100,
    }))
    actions.push({ type: "heal", time: 1, phyCoef: 1 })
    const input = bundle(4, actions)
    const row = buildRotationTimeline(input.timeline)[0]
    expect(row.actions[0].damage).toBeCloseTo(97, 12)
    expect(row.actions[5].damage).toBeCloseTo(95.5, 12)
    const result = calculateRotationBaseline(input)
    const reference = bundle(4, actions)
    reference.timeline.innerWayRules = reference.timeline.innerWayRules.filter(rule =>
      Object.keys(rule.effect).includes("rawStat"),
    )
    expect(result.metrics.totalHealing / calculateRotationBaseline(reference).metrics.totalHealing).toBeCloseTo(
      1.045,
      12,
    )
    const upgraded = bundle(6, [...actions, hit(2)])
    for (const roll of [undefined, () => 0.5]) {
      const upgradedRow = buildRotationTimeline(upgraded.timeline, roll)[0]
      expect(upgradedRow.actionStates[7].buffs.size).toBe(0)
    }
    expect(
      calculateSimulatedRotationRun(upgraded, () => 0.5).resolvedSequence.some(entry => entry.breakdown.total > 0),
    ).toBe(true)
  })
})
