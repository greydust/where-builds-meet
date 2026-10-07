import { afterEach, describe, expect, it, vi } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import * as timeline from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"

function fixture(): RotationSimulationBundle {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    attunement: emptyAttunementStats,
    enemy: {
      name: "Reuse",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    startAnchor: { rowId: "rotation-0" },
    statPriority: [
      { label: "Higher attack", stats: { ...stats, minPhys: 200, maxPhys: 200 } },
      { label: "Zero attack", stats: { ...stats, minPhys: 0, maxPhys: 0 } },
    ],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
    timeline: {
      rotation: {
        name: "Reuse",
        steps: [
          { type: "skill", skill: "Apply" },
          { type: "skill", skill: "Hit" },
          { type: "event", event: "Delay", duration: 3 },
        ],
      },
      skills: {
        Apply: { castTime: 0, action: [{ type: "apply", target: "self", value: "Collector", time: 0 }] },
        Hit: { castTime: 0, tags: ["Recorded"], action: [{ type: "damage", phyCoef: 1, time: 0 }] },
        Payout: { castTime: 0, tags: ["Replayed"], action: [{ type: "replay", coef: 0.3, time: 0 }] },
        Heal: { castTime: 0, action: [{ type: "heal", phyCoef: 1, time: 0 }] },
        Proc: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      },
      effectDefinitions: {
        Collector: {
          duration: 2,
          maxStack: 1,
          recording: {
            event: "damage",
            requirement: [{ target: "skillTag", value: "Recorded" }],
            action: { type: "trigger", value: "Payout" },
          },
          action: [{ type: "resolveRecording", target: "self", value: "Collector", time: "expire" }],
        },
      },
      dots: {},
      eventDefinitions: {},
      weapons: [],
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
    },
  }
}

function checkAgainstRebuild(bundle: RotationSimulationBundle, rebuilds: number) {
  const baseline = calculateRotationBaseline(bundle)
  const saved = JSON.stringify(baseline)
  const build = vi.spyOn(timeline, "buildRotationTimeline")
  const reused = calculateRotationComparisons(bundle, baseline)
  expect(build).toHaveBeenCalledTimes(rebuilds)
  build.mockRestore()
  const forced = calculateRotationComparisons(
    {
      ...bundle,
      statPriority: bundle.statPriority.map(variant => ({ ...variant, timeline: bundle.timeline })),
      attunementPriority: bundle.attunementPriority.map(variant =>
        Object.assign({}, variant, { timeline: bundle.timeline }),
      ),
    },
    baseline,
  )
  expect(reused).toEqual(forced)
  expect(JSON.stringify(baseline)).toBe(saved)
  return baseline
}

afterEach(() => vi.restoreAllMocks())

describe("comparison timeline reuse", () => {
  it("recalculates damage-only recordings, including zero-damage variants", () => {
    const baseline = checkAgainstRebuild(fixture(), 0)
    expect(baseline.baseline.some(entry => entry.replay)).toBe(true)
  })

  it("includes prepull source damage without counting it as combat damage", () => {
    const bundle = fixture()
    bundle.timeline.rotation.steps.splice(
      2,
      0,
      { type: "event", event: "Delay", duration: 1 },
      { type: "skill", skill: "Hit" },
    )
    bundle.startAnchor = { rowId: "rotation-3" }
    const baseline = checkAgainstRebuild(bundle, 0)
    expect(baseline.baseline.some(entry => entry.id === "rotation-1:0")).toBe(false)
    expect(baseline.baseline.find(entry => entry.replay)?.replay?.sourceActionIds).toContain("rotation-1:0")
  })

  it("keeps replacement recording windows separate", () => {
    const bundle = fixture()
    bundle.timeline.effectDefinitions.Collector.refresh = true
    bundle.timeline.rotation.steps.splice(
      2,
      0,
      { type: "event", event: "Delay", duration: 1 },
      { type: "skill", skill: "Apply" },
      { type: "skill", skill: "Hit" },
    )
    const baseline = checkAgainstRebuild(bundle, 0)
    const payouts = baseline.baseline.filter(entry => entry.replay)
    expect(payouts).toHaveLength(2)
    expect(payouts.map(entry => entry.replay?.sourceActionIds)).toEqual([["rotation-1:0"], ["rotation-4:0"]])
  })

  it("recalculates prepull outcome buffs before recorded attunement comparisons", () => {
    const bundle = fixture()
    bundle.stats.affinity = 0.5
    bundle.derivedStats = calculateDerivedStats(bundle.stats, 0)
    bundle.statPriority = []
    bundle.attunementPriority = [
      { label: "Penetration", attunement: { ...bundle.attunement, physicalPenetration: 0.1 } },
    ]
    bundle.timeline.setupEffects = [
      {
        trigger: {
          event: "damageOutcome",
          outcome: "affinity",
          action: { type: "apply", target: "self", value: "Hawkwing", stack: 1, reapply: true },
        },
      },
    ]
    bundle.timeline.effectDefinitions.Hawkwing = {
      duration: 5,
      maxStack: 5,
      refresh: true,
      stackEffects: Array.from({ length: 5 }, (_, index) => [{ effect: { physicalAttackBonus: (index + 1) * 0.02 } }]),
    }
    bundle.timeline.rotation.steps = [
      { type: "skill", skill: "Apply" },
      { type: "skill", skill: "Hit" },
      { type: "event", event: "Delay", duration: 0.5 },
      { type: "skill", skill: "Hit" },
      { type: "event", event: "Delay", duration: 0.5 },
      { type: "skill", skill: "Hit" },
      { type: "event", event: "Delay", duration: 3 },
    ]
    bundle.startAnchor = { rowId: "rotation-5" }
    const baseline = checkAgainstRebuild(bundle, 0)
    expect(baseline.baseline.find(entry => entry.replay)?.replay?.sourceActionIds).toHaveLength(3)
  })

  it("preserves the combat cutoff when recording settlement occurs later", () => {
    const bundle = fixture()
    bundle.timeline.rotation.steps[2] = { type: "event", event: "Delay", duration: 1 }
    const baseline = checkAgainstRebuild(bundle, 0)
    expect(baseline.baseline.some(entry => entry.replay)).toBe(false)
  })

  it("reuses an overheal accumulator when no healing action can feed it", () => {
    const bundle = fixture()
    bundle.timeline.effectDefinitions.Collector = {
      duration: 2,
      maxStack: 1,
      accumulator: { event: "overheal", threshold: { physical: 12, silkbind: 18 }, checkEvent: "Check" },
      listen: [{ event: "Check", action: { type: "trigger", value: "Proc" } }],
    }
    const baseline = checkAgainstRebuild(bundle, 0)
    expect(baseline.timeline.some(row => row.step.skill === "Proc")).toBe(false)
  })

  it("rebuilds when healing can feed the accumulator", () => {
    const bundle = fixture()
    bundle.timeline.effectDefinitions.Collector = {
      duration: 2,
      maxStack: 1,
      accumulator: { event: "overheal", threshold: 10, checkEvent: "Check" },
      listen: [{ event: "Check", maxTriggers: 1, action: { type: "trigger", value: "Proc" } }],
    }
    bundle.timeline.rotation.steps.splice(1, 0, { type: "skill", skill: "Heal" })
    const baseline = checkAgainstRebuild(bundle, 2)
    expect(baseline.timeline.some(row => row.step.skill === "Proc")).toBe(true)
  })

  it("rebuilds a recording whose payout changes combat state", () => {
    const bundle = fixture()
    bundle.timeline.skills.Payout.action!.push({ type: "addResource", value: "Vitality", amount: 10, time: 0 })
    const baseline = checkAgainstRebuild(bundle, 2)
    expect(baseline.baseline.some(entry => entry.replay)).toBe(true)
  })

  it("rebuilds when recorded damage changes target HP", () => {
    const bundle = fixture()
    bundle.timeline.rotation.targetHP = 10000
    const baseline = checkAgainstRebuild(bundle, 2)
    expect(baseline.baseline.find(entry => entry.replay)?.context.targetHPRatio).toBeLessThan(1)
  })
})
