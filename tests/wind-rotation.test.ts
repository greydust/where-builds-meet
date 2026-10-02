import assert from "node:assert/strict"

import { describe, expect, it } from "vitest"

import windBuffs from "../data/buff/bamboocut-wind.json"
import rotation from "../data/rotation/bamboocut-wind/wind-dummy-1-min-infinite-vitality.json"
import { buildPresetRotationBundle } from "../src/application/graduation"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import type { RotationRecord } from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"
import { rowCasting } from "./helpers/timelineRows"

function bundleFor(full = false) {
  const preset = structuredClone(rotation) as RotationRecord
  if (full) preset.steps = preset.steps.filter(step => step.type !== "event" || step.event !== "BattleEnd")
  const bundle = buildPresetRotationBundle(
    {
      ...dpsSnapshotEnvironment,
      pathId: "bamboocutWind",
      martialArts: ["infernalTwinblades", "mortalRopeDart"],
      rotation: preset,
      skillOverrides: {},
      previewId: null,
    },
    "wind-fully-relayed-min",
  )
  if (!bundle) throw new Error("Missing Wind production bundle")
  return bundle
}

describe("Wind dummy preset", () => {
  it("omits the passive from other paths' calculation setup", () => {
    const wind = bundleFor()
    const kite = buildPresetRotationBundle(
      {
        ...dpsSnapshotEnvironment,
        pathId: "bamboocutKite",
        martialArts: ["heavenwill", "skygrasp"],
        rotation: { name: "Equipment scope", steps: [] },
        skillOverrides: {},
        previewId: null,
      },
      "kite-fully-relayed-min",
    )!
    const passive = windBuffs.InfernalLightAttackPveBonus.effect[0]
    expect(wind.timeline.setupEffects).toContain(passive)
    expect(kite.timeline.setupEffects).not.toContain(passive)
  })
  it("applies the persistent PvE bonus only to Infernal Light Attack damage", () => {
    const bundle = bundleFor()
    bundle.enemy = { ...bundle.enemy, defense: 0, physicalResistance: 0, judgementResistance: 0 }
    const passive = windBuffs.InfernalLightAttackPveBonus.effect[0]
    const productionRules = bundle.timeline.setupEffects!.filter(rule => rule === passive)
    const ids = ["InfernalLight1", "InfernalFlamelashLight1", "InfernalFlamelashLight5Cancel", "AddledMind", "Rodent"]
    bundle.stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    bundle.derivedStats = calculateDerivedStats(bundle.stats, 0)
    delete bundle.rawStats
    delete bundle.baseStats
    bundle.startAnchor = { rowId: "rotation-0" }
    bundle.timeline = {
      ...bundle.timeline,
      initialBuffs: [],
      initialDebuffs: [],
      innerWayRules: [],
      innerWayConditions: [],
      setupEffects: [...productionRules, { effect: { hpDMGBonus: 0.2 } }],
      rotation: {
        name: "Persistent Light Attack bonus",
        ping: 0,
        steps: [...ids, "OtherLight"].map(skill => ({ type: "skill" as const, skill })),
      },
      skills: Object.fromEntries(
        [...ids, "OtherLight"].map(id => [
          id,
          {
            castTime: 1,
            tags: id === "OtherLight" ? ["MartialArts", "MortalRopeDart", "Light"] : bundle.timeline.skills[id].tags,
            action: [{ type: "damage", time: 0, phyCoef: 1 }],
          },
        ]),
      ),
    }
    const boosted = calculateRotationBaseline(bundle)
    bundle.timeline.setupEffects = [{ effect: { hpDMGBonus: 0.2 } }]
    const control = calculateRotationBaseline(bundle)
    for (let index = 0; index < 6; index++) {
      const key = `rotation-${index}:0`
      expect(boosted.actionBreakdowns[key].total / control.actionBreakdowns[key].total).toBeCloseTo(
        index < 3 ? 1.3 / 1.2 : 1,
      )
    }
  })

  it("anchors combat to RD Q damage and preserves the authored sequence with a 60-second cutoff", () => {
    const bundle = bundleFor()
    const result = calculateRotationBaseline(bundle)
    const full = calculateRotationBaseline(bundleFor(true))
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const fullCasts = full.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const firstQ = casts.find(row => row.step.type === "skill" && row.step.skill === "BladeboundThreadCancel")!
    const fightStart = firstQ.startTime + Number(firstQ.actions[0].time)
    expect(result.duration).toBeCloseTo(60)
    expect(Math.min(...result.baseline.map(entry => entry.timelineTime!))).toBeCloseTo(fightStart)
    expect(result.baseline.every(entry => entry.timelineTime! <= fightStart + 60)).toBe(true)
    const activations = fullCasts.filter(row => row.step.skill === "Flamelash")
    expect(activations).toHaveLength(4)
    const rodentCancels = fullCasts.filter(row => row.step.skill?.endsWith("Rodent"))
    expect(rodentCancels.length).toBeGreaterThan(0)
    for (const row of rodentCancels) {
      expect(row.effectiveCastTime).toBe(0)
      expect(row.actions.some(action => action.type === "damage")).toBe(false)
    }
    // Flamelash may expire during a cast, but must be active when that cast starts.
    for (const row of casts.filter(
      row =>
        row.step.skill?.startsWith("InfernalFlamelashLight") && row.actions.some(action => action.type === "damage"),
    )) {
      expect(row.buffs.has("Flamelash")).toBe(true)
    }
    for (const [index, row] of fullCasts.entries()) {
      if (!row.step.skill?.includes("PerfectDodge")) continue
      const cancel = fullCasts[index - 1]
      expect(cancel.step.skill?.endsWith("Rodent")).toBe(true)
      expect(
        full.timeline.filter(trigger => trigger.sourceRowId === cancel.id && trigger.step.skill === "Rodent"),
      ).toHaveLength(1)
      expect(cancel.startTime).toBeLessThanOrEqual(row.startTime)
    }
    expect(fullCasts.length).toBe(bundle.timeline.rotation.steps.filter(step => step.type === "skill").length)
    expect(casts.map(row => row.id)).toEqual(
      fullCasts.filter(row => row.startTime < fightStart + 60).map(row => row.id),
    )
    expect(result.metrics.totalDamage).toBeGreaterThan(0)
    expect(Number.isFinite(result.metrics.dps)).toBe(true)
  })

  it("resolves paired dummy attacks, infinite Vitality, and the break after FA1 damage", () => {
    const bundle = bundleFor()
    const { timeline } = calculateRotationBaseline(bundle)
    const attacks = timeline.filter(row => row.step.type === "event" && row.step.event === "TakeDamage")
    expect(attacks).toHaveLength(20)
    for (let index = 0; index < attacks.length; index += 2) {
      expect(attacks[index].startTime).toBeCloseTo(attacks[index + 1].startTime)
    }
    const states = timeline.flatMap(row => Object.values(row.actionStates))
    expect(states.every(state => state.resources.Vitality === bundle.timeline.resourceMaximums!.Vitality)).toBe(true)
    const breakIndex = bundle.timeline.rotation.steps.findIndex(
      step => step.type === "event" && step.event === "Qi" && step.targetQiRatio === 0,
    )
    const fa1 = timeline.find(row => row.id === "rotation-" + (breakIndex + 1))!
    const fa2 = timeline.find(row => row.id === "rotation-" + (breakIndex + 2))!
    expect(fa1.actionStates[1].targetQiRatio).toBe(0.3999)
    expect(fa2.actionStates[0].targetQiRatio).toBe(0)
    expect(
      timeline.some(row => row.step.type === "skill" && row.step.skill === "GhostlyStepsUmbraDodgeDualBlades"),
    ).toBe(true)
  })

  it("depletes Qi before the first break and toward a second break beyond Battle End", () => {
    const { timeline } = calculateRotationBaseline(bundleFor())
    const firstQ = rowCasting(timeline, "BladeboundThreadCancel")!
    const fightStart = firstQ.startTime + Number(firstQ.actions[0].time)
    const qiRows = timeline.filter(row => row.step.type === "event" && row.step.event === "Qi")
    expect(qiRows).toHaveLength(5)
    const breakTime = qiRows[2].startTime - fightStart
    expect(breakTime).toBeCloseTo(21.062, 2)
    const recoveryTime = breakTime + 10
    const nextBreak = 61
    const expectedTimes = [
      breakTime * 0.4,
      breakTime * 0.6,
      breakTime,
      recoveryTime + (nextBreak - recoveryTime) * 0.4,
      recoveryTime + (nextBreak - recoveryTime) * 0.6,
    ]
    const ratios = [0.5999, 0.3999, 0, 0.5999, 0.3999]
    qiRows.forEach((row, index) => {
      expect(Math.abs(row.startTime - fightStart - expectedTimes[index])).toBeLessThan(0.2)
      const actionIndex = row.actions.findIndex(action => action.type === "setQi")
      expect(row.actionStates[actionIndex + 1].targetQiRatio).toBe(ratios[index])
    })
    const afterRecovery = timeline
      .flatMap(row =>
        row.actions.map((action, index) => ({
          time: row.startTime + Number(action.time ?? 0) - fightStart,
          state: row.actionStates[index],
        })),
      )
      .filter(entry => entry.time > recoveryTime + 0.01 && entry.time < expectedTimes[3] - 0.2)
    expect(afterRecovery.length).toBeGreaterThan(0)
    expect(afterRecovery.every(entry => entry.state.targetQiRatio === 1)).toBe(true)
  })
  it("applies base Flamelash bonuses at cast start and removes them on Hellfire depletion", () => {
    const bundle = bundleFor()
    bundle.stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, critDmgBonus: 0.5 }
    bundle.derivedStats = calculateDerivedStats(bundle.stats, 0)
    delete bundle.rawStats
    delete bundle.baseStats
    bundle.enemy = { ...bundle.enemy, defense: 0, physicalResistance: 0, judgementResistance: 0 }
    bundle.startAnchor = { rowId: "rotation-0" }
    bundle.timeline = {
      ...bundle.timeline,
      initialResources: { Hellfire: 80 },
      setupEffects: [],
      innerWayRules: [],
      innerWayConditions: [],
      rotation: {
        name: "Flamelash lifecycle",
        ping: 0,
        steps: [
          { type: "skill", skill: "Observe" },
          { type: "event", event: "Delay", duration: 0.2 },
          { type: "skill", skill: "Flamelash" },
          { type: "event", event: "Delay", duration: 5 },
        ],
      },
      skills: {
        ...bundle.timeline.skills,
        Observe: { castTime: 0, ignorePing: true, action: [{ type: "trigger", value: "Observation", time: 0 }] },
        Observation: {
          castTime: 0,
          tags: ["Triggered"],
          action: [0.199, 0.201, 5.529, 5.531].map(time => ({ type: "damage", phyCoef: 1, time })),
        },
      },
    }
    const result = calculateRotationBaseline(bundle)
    const row = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Observation")
    assert(row, "The wind probe must schedule its Observation skill.")
    const damage = [0, 1, 2, 3].map(index => result.actionBreakdowns[`${row?.id ?? ""}:${index}`])
    const criticalRateOf = (index: number) => damage[index]?.outcomeRates?.critical
    expect([0, 1, 2, 3].map(criticalRateOf)).toEqual([0, 0.1, 0.1, 0])
    expect(damage[1].total / damage[0].total).toBeCloseTo(1.07)
    expect(damage[2].total).toBeCloseTo(damage[1].total)
    expect(damage[3].total).toBeCloseTo(damage[0].total)
  })
})
