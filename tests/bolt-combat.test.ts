import preset from "@gamedata/build/bellstrike-bolt/bolt-fully-relayed.json"
// @vitest-environment jsdom
import rotation from "@gamedata/rotation/bellstrike-bolt/bolt-dummy-1-min.json"
import { expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor, setupConditionsFor } from "@/application/characterComposition"
import { effectDefinitions } from "@/application/gameData/skills"
import { buildPresetRotationBundle } from "@/application/graduation"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { calculateStatsWithEffects, requirementIsUnconditional } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

function boltBundle(breakthrough = "19") {
  const bundle = buildPresetRotationBundle(
    {
      pathId: "bellstrikeBolt",
      martialArts: ["jueyuXuanfengSpear", "boshanQuyueSpear"],
      rotation: rotation as RotationRecord,
      breakthrough,
      globalDebuffs: defaultGlobalDebuffs,
      food: "SimmeringFishSlices",
      script: "None",
      divinecraft: "Fire",
      skillOverrides: {},
      previewId: null,
    },
    "bolt-fully-relayed",
  )
  if (!bundle) throw new Error("Missing Bolt build")
  return bundle
}

it.each(["19", "25"])(
  "runs Bolt's authored Dummy 1 Min at Solo %s through the centralized calculator",
  breakthrough => {
    const bundle = boltBundle(breakthrough)
    const result = calculateRotationBaseline(bundle)
    expect(result.duration).toBe(60)
    expect(result.metrics.totalDamage).toBeGreaterThan(0)
    for (const skill of ["BoltMoonTide", "BoltMoonBurst"]) {
      const procs = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === skill)
      expect(procs.length).toBeGreaterThan(0)
      expect(procs.some(row => Object.keys(row.actionStates).length > 0)).toBe(true)
    }
    const tides = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "BoltMoonTide")
    expect(new Set(tides.map(row => row.startTime)).size).toBe(tides.length)
    for (const row of tides) {
      const combatTime = row.startTime - result.anchorTime
      expect(combatTime).toBeCloseTo(Math.round(combatTime), 4)
    }
    const ledger = result.timeline[0].timelineResourceSummary?.SpearMomentum
    expect(ledger?.initial).toBe(4)
    expect(ledger?.consumed).toBe(24)
    expect(ledger?.final).toBe(2)
    const ordered = result.timeline.filter(row => row.kind === "rotation")
    const finalSkill = ordered.findLast(row => row.step.type === "skill")!
    const finalCastEnd = finalSkill.startTime + finalSkill.effectiveCastTime - result.anchorTime
    expect(finalSkill.startTime - result.anchorTime).toBeLessThan(60)
    expect(finalCastEnd).toBeGreaterThan(60)
    const finalContacts = finalSkill.actions
      .filter((action, index) => action.type === "damage" && finalSkill.actionStates[index])
      .map(action => finalSkill.startTime + Number(action.time ?? 0) - result.anchorTime)
    expect(finalContacts).toHaveLength(1)
    const skillRows = ordered.filter(row => row.step.type === "skill")
    expect(skillRows.at(-2)?.step.skill).toBe("BoltRedQ")
    expect(finalSkill.step.skill).toBe("BoltBlueVC")
    expect(Math.max(...finalContacts)).toBeGreaterThan(59.5)
    expect(finalContacts.every(time => time < 60)).toBe(true)
    const charging = ordered.filter(
      row => row.skill?.tags?.includes("BoltVC") && !row.resourceConsumption?.SpearMomentum && row.id !== finalSkill.id,
    )
    for (const row of charging.slice(1)) {
      const firstHit = row.actions.findIndex((action, index) => action.type === "damage" && row.actionStates[index])
      const crossBuff = row.skill!.tags!.includes("BoltBlueVC") ? "BoltMingFa" : "BoltZhongDao"
      expect([...row.actionStates[firstHit].buffs.values()].some(buff => buff.name === crossBuff)).toBe(true)
    }
    expect(ordered.filter(row => row.cooldownWait)).toHaveLength(0)
    const flutes = ordered.filter(row => row.step.skill === "FluteOfTheTidesCancel")
    expect(flutes).toHaveLength(2)
    const secondFlute = ordered.indexOf(flutes[1])
    expect(ordered[secondFlute - 1].step.skill).toBe("BoltBlueVC")
    expect(ordered[secondFlute + 1].step.skill).toBe("Deflect")
    expect(flutes[1].startTime - flutes[0].startTime).toBeGreaterThanOrEqual(
      Number(bundle.timeline.skills.FluteOfTheTidesCancel.cooldown),
    )
    for (const row of ordered) {
      if (row.step.type !== "skill") continue
      row.actions.forEach((action, index) => {
        const state = row.actionStates[index]
        if (action.type !== "damage" || !state || row.startTime + Number(action.time ?? 0) < result.anchorTime) return
        expect([...state.buffs.values()].some(buff => buff.name === "BoltWangXing")).toBe(true)
      })
    }
    const qiEvents = ordered.filter(row => row.step.type === "event" && row.step.event === "Qi")
    const breaks = qiEvents.filter(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
    )
    expect(breaks).toHaveLength(2)
    const thresholds = qiEvents.filter(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio > 0,
    )
    expect(thresholds).toHaveLength(4)
    const firstBreak = breaks[0].startTime
    const secondBreak = breaks[1].startTime
    const recoveryEnd = firstBreak + 10
    const immunityEnd = recoveryEnd + 4
    for (const [start, end, expected] of [
      [result.anchorTime, firstBreak, thresholds.slice(0, 2)],
      [immunityEnd, secondBreak, thresholds.slice(2)],
    ] as const) {
      for (const [index, row] of expected.entries())
        expect(row.startTime).toBeCloseTo(start + (end - start) * [0.4, 0.6][index], 9)
    }
    const hits = result.timeline.flatMap(row =>
      row.actions.flatMap((action, index) => {
        const state = row.actionStates[index]
        return action.type === "damage" && state
          ? [{ time: row.startTime + Number(action.time ?? 0), qi: state.targetQiRatio }]
          : []
      }),
    )
    const restored = hits.filter(hit => hit.time > recoveryEnd && hit.time < immunityEnd)
    expect(restored.length).toBeGreaterThan(0)
    expect(restored.every(hit => hit.qi === 1)).toBe(true)
    for (const start of [firstBreak, secondBreak]) {
      const exhausted = hits.filter(hit => hit.time > start && hit.time < Math.min(start + 10, result.anchorTime + 60))
      expect(exhausted.length).toBeGreaterThan(0)
      expect(exhausted.every(hit => hit.qi === 0)).toBe(true)
    }
    const firstBurst = ordered.find(row => row.id === "rotation-7")!
    expect(firstBurst.resources.SpearMomentum).toBe(6)
    expect(firstBurst.resourceConsumption?.SpearMomentum).toBe(1)
    const refill = ordered.find(row => row.id === "rotation-32")!
    expect(refill.resources.SpearMomentum).toBe(6)
  },
)

it.each([false, true])(
  "detonates 鳴戈 at most once per 鋒銳 and consumes every 載戈 stack (remove 神斷=%s)",
  removed => {
    const bundle = boltBundle()
    if (removed) {
      const selected = preset.setup.innerWays.filter(way => way.innerWay !== "ShenDuanQingFeng")
      const rules = innerWayEffectRulesFor(selected, 19, "bellstrikeBolt")
      const conditions = [
        ...innerWayConditionsFor(selected, undefined, "bellstrikeBolt"),
        ...setupConditionsFor(bundle.timeline.setupEffects),
      ]
      const contributions = [
        ...bundle.timeline.setupEffects.filter(effect => requirementIsUnconditional(effect.requirement)),
        ...rules
          .filter(
            rule =>
              requirementIsUnconditional(rule.requirement) &&
              (rule.effect.rawStat || rule.effect.stat || rule.effect.effectiveStat),
          )
          .map(rule => rule.effect),
      ]
      const sheet = calculateStatsWithEffects(
        bundle.baseStats!,
        contributions,
        bundle.enemy.judgementResistance,
        bundle.weapons,
      )
      bundle.stats = sheet.stats
      bundle.rawStats = sheet.rawStats
      bundle.timeline.innerWayRules = rules
      bundle.timeline.innerWayConditions = conditions
    }
    const result = calculateRotationBaseline(bundle)
    const rows = new Map(result.timeline.map(row => [row.id, row]))
    const windows = result.timeline.filter(row => row.step.skill === "BoltEnterFengRui").map(row => row.startTime)
    const detonations = new Map<number, number>()
    const stackChecks: { actual: number; expected: number; window: number }[] = []
    let stacks = 0
    let lastStackTime = -Infinity
    for (const entry of result.baseline) {
      const rowId = entry.id!.slice(0, entry.id!.lastIndexOf(":"))
      const skill = rows.get(rowId)!.step.skill
      if (skill !== "BoltZaige" && skill !== "BoltMingGe") continue
      const time = entry.timelineTime!
      if (time >= lastStackTime + 8) stacks = 0
      switch (skill) {
        case "BoltZaige":
          stacks = Math.min(15, stacks + 1)
          lastStackTime = time
          break
        case "BoltMingGe": {
          const window = windows.findLastIndex(start => start <= time)
          stackChecks.push({ actual: entry.activeDebuffStacks?.BoltZaigeStacks ?? 0, expected: stacks, window })
          detonations.set(window, (detonations.get(window) ?? 0) + 1)
          stacks = 0
          lastStackTime = -Infinity
          break
        }
      }
    }
    for (const check of stackChecks) {
      expect(check.actual).toBe(check.expected)
      expect(check.window).toBeGreaterThanOrEqual(0)
    }
    expect(detonations.size).toBeGreaterThan(0)
    expect([...detonations.values()].every(count => count === 1)).toBe(true)
  },
)

it("applies Affinity-triggered 通判 after the triggering hit, including fractional outcomes", () => {
  const damage = (casts: number, affinity: number, resistance = 0, interval = 1) => {
    const innerWays = [{ innerWay: "MingFeiTongPan", tier: "T0" }]
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, directAffinity: affinity }
    return calculateRotationBaseline({
      timeline: {
        rotation: {
          name: "通判 probe",
          steps: Array.from({ length: casts }, () => ({ type: "skill" as const, skill: "Hit" })),
        },
        skills: {
          Hit: { castTime: interval, tags: ["DirectDamage"], action: [{ type: "damage", phyCoef: 1, time: 0 }] },
        },
        dots: {},
        eventDefinitions: {},
        effectDefinitions,
        innerWayConditions: [...innerWayConditionsFor(innerWays, undefined, "bellstrikeBolt")],
        innerWayRules: innerWayEffectRulesFor(innerWays, 19, "bellstrikeBolt"),
        setupEffects: [],
        weapons: ["jueyuXuanfengSpear", "boshanQuyueSpear"],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      attunement: emptyAttunementStats,
      enemy: {
        name: "Probe",
        level: 1,
        defense: 0,
        physicalResistance: resistance,
        bellstrikeResistance: 0,
        silkbindResistance: 0,
        stonesplitResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      weapons: ["jueyuXuanfengSpear", "boshanQuyueSpear"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }).metrics.totalDamage
  }
  // Physical Penetration contributes 1/200 per point above this target's resistance.
  expect(damage(2, 1) - 2 * damage(1, 1)).toBeCloseTo((100 * 1.2 * 0.6) / 200, 10)
  expect(damage(2, 0.5) - 2 * damage(1, 0.5)).toBeCloseTo((110 * 0.5 * 0.6) / 200, 10)
  // Some states cross the resistance breakpoint; averaging penetration first is incorrect.
  expect(damage(2, 0.5, 2.3) - 2 * damage(1, 0.5, 2.3)).toBeCloseTo(110 * 0.5 * (1.0015 - 0.997), 10)
  expect(damage(2, 1, 0, 6)).toBeCloseTo(2 * damage(1, 1), 10)
})
