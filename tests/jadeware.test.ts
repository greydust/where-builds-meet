import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateRotationBaseline, type RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EditableObject, RotationStep } from "@/calculations/rotationTimeline"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"
import { weaponSetDefinitions } from "@/gear"

function bundle(
  pieces: 0 | 2 | 4,
  actions: EditableObject[],
  steps: RotationStep[] = [
    { type: "skill", skill: "QiankunsLockCancel" },
    { type: "skill", skill: "Probe" },
  ],
): RotationSimulationBundle {
  const setup = weaponSetDefinitions.Jadeware.options[pieces].effect
  const setupEffects = Array.isArray(setup) ? setup : [setup]
  const stats = calculateStatsWithEffects(
    { ...emptyStats, minPhys: 100, maxPhys: 200, precision: 1, affinity: 0.2, affinityDmgBonus: 0.4 },
    setupEffects,
    0,
  ).stats
  return {
    timeline: {
      rotation: { name: "Jadeware", ping: 0, steps },
      skills: {
        ...allSkillDefinitions,
        Probe: { name: "Probe", castTime: 1, tags: ["DirectDamage", "Light"], action: actions },
        MartialArtProbe: { name: "Martial Art probe", castTime: 0, tags: ["MartialArt"] },
        NineSeconds: { name: "Nine seconds", castTime: 9, tags: [] },
        TwoSeconds: { name: "Two seconds", castTime: 2, tags: [] },
      },
      dots: {},
      effectDefinitions,
      eventDefinitions: {},
      setupEffects,
      innerWayConditions: [],
      innerWayRules: [],
      weapons: ["namelessSword", "namelessSpear"],
    },
    stats,
    enemy: {
      name: "Test",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["namelessSword", "namelessSpear"],
    attunement: emptyAttunementStats,
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}
const hit = (time: number) => ({ type: "damage", phyCoef: 1, time })
const qi = (ratio: number, time = 0) => ({ type: "setQi", targetQiRatio: ratio, time })

describe("Jadeware four-piece", () => {
  it("activates on a cancelled Martial Art cast without a hit and grants unconditional Affinity damage", () => {
    const before = calculateRotationBaseline(bundle(2, [hit(0.5)]))
    const after = calculateRotationBaseline(bundle(4, [hit(0.5)]))
    expect(after.actionBreakdowns["rotation-1:0"].outcomeRates?.affinity).toBe(0.2)
    expect(after.metrics.totalDamage - before.metrics.totalDamage).toBeCloseTo(
      after.baseline[0].context.stats.maxPhys * 0.2 * 0.1,
      8,
    )
    for (const pieces of [0, 2] as const) {
      const result = calculateRotationBaseline(bundle(pieces, [hit(0.5)]))
      expect(result.timeline[1].buffs.has("Jadeware")).toBe(false)
    }
  })

  it.each([
    ["QiankunsLock", "QiankunsLockCancel"],
    ["QiankunsLockCancel", "QiankunsLock"],
    ["DauntingStrikeCancel", "DauntingStrikeCancel"],
  ])("waits twelve seconds between %s and %s and reactivates Jadeware", (first, second) => {
    const result = calculateRotationBaseline(
      bundle(
        4,
        [hit(0.5)],
        [
          { type: "skill", skill: first },
          { type: "skill", skill: second },
          { type: "skill", skill: "Probe" },
        ],
      ),
    )
    const firstRow = result.timeline.find(row => row.id === "rotation-0")!
    const secondRow = result.timeline.find(row => row.id === "rotation-1")!
    expect(secondRow.startTime - firstRow.startTime).toBeCloseTo(12, 8)
    expect(result.timeline.find(row => row.id === "rotation-2")!.actionStates[0].buffs.has("Jadeware")).toBe(true)
  })

  it.each([
    { ratio: 1, expected: 0.2 },
    { ratio: 0.9999, expected: 0.275 },
    { ratio: 0.4, expected: 0.275 },
    { ratio: 0.3999, expected: 0.275 },
  ])("gates Direct Affinity at target Qi $ratio", ({ ratio, expected }) => {
    const result = calculateRotationBaseline(bundle(4, [qi(ratio), hit(0.5)]))
    expect(result.actionBreakdowns["rotation-1:1"].outcomeRates?.affinity).toBeCloseTo(expected, 10)
  })

  it("grants Direct Affinity for Qi Imbalance at full target Qi", () => {
    const result = calculateRotationBaseline(
      bundle(4, [{ type: "apply", target: "target", value: "QiImbalance", time: 0 }, hit(0.5)]),
    )
    expect(result.actionBreakdowns["rotation-1:1"].outcomeRates?.affinity).toBeCloseTo(0.275, 10)
  })

  it("reevaluates the target condition on each hit", () => {
    const result = calculateRotationBaseline(bundle(4, [hit(0.1), qi(0.5, 0.2), hit(0.3), qi(1, 0.4), hit(0.5)]))
    expect([0, 2, 4].map(index => result.actionBreakdowns[`rotation-1:${index}`].outcomeRates?.affinity)).toEqual([
      0.2, 0.275, 0.2,
    ])
  })

  it("expires after ten seconds and rejects recasts until the twelve-second cooldown ends", () => {
    const result = calculateRotationBaseline(
      bundle(
        4,
        [hit(0.5)],
        [
          { type: "skill", skill: "MartialArtProbe" },
          { type: "skill", skill: "NineSeconds" },
          { type: "skill", skill: "MartialArtProbe" },
          { type: "skill", skill: "TwoSeconds" },
          { type: "skill", skill: "MartialArtProbe" },
          { type: "skill", skill: "Probe" },
          { type: "skill", skill: "MartialArtProbe" },
          { type: "skill", skill: "Probe" },
        ],
      ),
    )
    expect(result.timeline.find(row => row.id === "rotation-5")!.actionStates[0].buffs.has("Jadeware")).toBe(false)
    expect(result.timeline.find(row => row.id === "rotation-7")!.actionStates[0].buffs.has("Jadeware")).toBe(true)
  })
})
