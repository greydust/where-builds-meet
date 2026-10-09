import { expect, it } from "vitest"

import { allSkillDefinitions, dotDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { SkillRecord } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"
import { buildTimelineDisplayEntries } from "@/rotationDisplay"

function calculate(actions: SkillRecord["action"], duration: number, innerWayConditions: string[] = []) {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  }
  return calculateRotationBaseline({
    timeline: {
      rotation: {
        name: "Bleed timer",
        steps: [
          { type: "skill", skill: "Probe" },
          { type: "event", event: "BattleEnd", startTime: duration },
        ],
      },
      skills: { ...allSkillDefinitions, Probe: { castTime: duration, action: actions } },
      dots: dotDefinitions,
      effectDefinitions,
      eventDefinitions: { BattleEnd: { castTime: 0, action: [] } },
      innerWayConditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: ["strategicSword"],
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    weapons: ["strategicSword"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  })
}

it("Bleed ticks select exactly one current-stack coefficient without multiplying by stacks", () => {
  for (const [index, coefficient] of [0.132, 0.165, 0.198, 0.264, 0.33].entries()) {
    const result = calculate(
      [{ type: "apply", target: "target", value: "UmbraBleeding", stack: index + 1, time: 0 }],
      1,
    )
    const tick = result.timeline.find(row => row.kind === "dot" && row.step.skill === "UmbraBleeding")!
    const hits = tick.actions.flatMap((_, actionIndex) =>
      result.actionBreakdowns[`${tick.id}:${actionIndex}`]
        ? [result.actionBreakdowns[`${tick.id}:${actionIndex}`]]
        : [],
    )
    expect(hits).toHaveLength(1)
    expect(tick.startTime).toBe(0.5)
    expect(hits[0].physical).toBeCloseTo(100 * coefficient, 10)
    expect(hits[0].bellstrike).toBeCloseTo(150 * coefficient, 10)
    expect(result.metrics.breakdown.groupedSkills.find(row => row.name === "Bleeding")?.hits).toBe(1)
    const displayedTicks = buildTimelineDisplayEntries(result.timeline, () => true, { rowId: "rotation-0" }).filter(
      entry => entry.row.step.skill === "UmbraBleeding" && entry.time === 0.5,
    )
    expect(displayedTicks).toHaveLength(1)
    expect(result.actionBreakdowns[`${tick.id}:${displayedTicks[0].actionIndex}`]).toBeDefined()
  }
})

it("adding or consuming some stacks preserves cadence, while clearing and reapplying restarts it", () => {
  const result = calculate(
    [
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, time: 0 },
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, time: 0.75 },
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 3, time: 1.75 },
      { type: "consume", target: "target", value: "UmbraBleeding", stack: 3, time: 2.75 },
      { type: "consume", target: "target", value: "UmbraBleeding", stack: "all", time: 3.75 },
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, time: 4.1 },
    ],
    6,
  )
  const ticks = result.timeline.filter(row => row.kind === "dot" && row.step.skill === "UmbraBleeding")
  expect(ticks.map(row => row.startTime)).toEqual([0.5, 1.5, 2.5, 3.5, 4.6, 5.6])
  expect(ticks.map(row => row.debuffs.get("UmbraBleeding")?.stack)).toEqual([1, 2, 5, 2, 1, 1])
})

it("Bleed expiry stops ticks and reapplication starts a new timer", () => {
  const result = calculate(
    [
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, duration: 2, time: 0 },
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, time: 3.1 },
    ],
    5,
  )
  expect(result.timeline.filter(row => row.kind === "dot").map(row => row.startTime)).toEqual([0.5, 1.5, 3.6, 4.6])
})

it("adding stacks refreshes expiry while preserving the original tick cadence", () => {
  const result = calculate(
    [
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, duration: 1, time: 0 },
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, duration: 2, time: 0.75 },
    ],
    4,
  )
  expect(result.timeline.filter(row => row.kind === "dot").map(row => row.startTime)).toEqual([0.5, 1.5, 2.5])
})

it("Blood Burst clears and reapplies two stacks, restarting the tick delay", () => {
  const result = calculate(
    [
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 5, time: 0 },
      { type: "trigger", value: "BloodBurst", time: 1.1 },
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 1, time: 1.3 },
    ],
    3,
    ["SwordHorizonT3", "SwordHorizonT6"],
  )
  const ticks = result.timeline.filter(row => row.kind === "dot" && row.step.skill === "UmbraBleeding")
  expect(ticks.map(row => row.startTime)).toEqual([0.5, 1.6, 2.6])
  expect(ticks.map(row => row.debuffs.get("UmbraBleeding")?.stack)).toEqual([5, 3, 3])
})

it("Sweep All's High Bleed preserves five stacks and the existing tick timer", () => {
  const result = calculate(
    [
      { type: "apply", target: "target", value: "UmbraBleeding", stack: 2, time: 0 },
      { type: "apply", target: "self", value: "EmpoweredRiverFlow", stack: 1, time: 0 },
      { type: "trigger", value: "SweepAllRiverFlow", time: 0.6 },
    ],
    2,
    ["SwordHorizonT3", "SwordHorizonT6", "WolfchasersArtT4"],
  )
  expect(result.timeline.filter(row => row.step.skill === "BloodBurstDamage")).toHaveLength(1)
  const ticks = result.timeline.filter(row => row.kind === "dot" && row.step.skill === "UmbraBleeding")
  expect(ticks.map(row => row.startTime)).toEqual([0.5, 1.5])
  expect(ticks.map(row => row.debuffs.get("UmbraBleeding")?.stack)).toEqual([2, 5])
})
