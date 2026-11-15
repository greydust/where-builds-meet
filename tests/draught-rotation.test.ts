import eonpour from "@gamedata/innerway/eonpour.json"
import skystrike from "@gamedata/martial-art/skystrike-gauntlets.json"
import fastRotation from "@gamedata/rotation/bamboocut-draught/draught-dummy-1-min-10ms.json"
import bpRotation from "@gamedata/rotation/bamboocut-draught/draught-dummy-1-min-bp.json"
import { describe, expect, it } from "vitest"

import { defaultBuildIdForPath } from "@/application/gameData/paths"
import { allSkillDefinitions, buffDefinitions, debuffDefinitions } from "@/application/gameData/skills"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"
import type { RotationRecord, TimelineBuildInput } from "@/calculations/rotationTimeline"
import { defaultBuildPresets } from "@/gear"

import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"
import { castStep, delayStep } from "./helpers/rotationSteps"

function input(steps: TimelineBuildInput["rotation"]["steps"], binge: number): TimelineBuildInput {
  return {
    rotation: { name: "Draught timing", ping: 0, steps },
    skills: allSkillDefinitions,
    effectDefinitions: { ...buffDefinitions, ...debuffDefinitions },
    eventDefinitions: {},
    innerWayConditions: [],
    dots: {},
    innerWayRules: [],
    setupEffects: [],
    weapons: ["skystrikeGauntlets", "rivenTwinblades"],
    initialResources: { Binge: binge },
    resourceMaximums: { Binge: 200 },
    initialBuffs: [
      { name: "Carouse", stack: 1 },
      { name: "DraughtDrinkMarks", stack: 1 },
    ],
  }
}

describe("Draught timing", () => {
  it.each([
    [180, true, 40],
    [200, true, 60],
    [180, false, 0],
  ] as const)("drains Deepdaze exit Binge from %s with Skyspeak=%s", (binge, skyspeak, remaining) => {
    const fixture = input([castStep("StartDD"), delayStep(0.2), delayStep(0.01)], binge)
    fixture.effectDefinitions = {
      ...fixture.effectDefinitions,
      InebriateDeepdaze: { ...fixture.effectDefinitions.InebriateDeepdaze, duration: 0.1 },
    }
    fixture.initialBuffs = []
    fixture.skills = {
      ...fixture.skills,
      StartDD: { castTime: 0, action: [{ type: "apply", target: "self", value: "InebriateDeepdaze", time: 0 }] },
    }
    fixture.innerWayConditions = skyspeak ? ["SkyspeakT1"] : []
    expect(buildRotationTimeline(fixture).at(-1)!.resources.Binge).toBe(remaining)
  })

  it("awards Binge only for successful parries, without requiring Carouse, with a one-second cooldown", () => {
    const fixture = input(
      [
        castStep("Deflect"),
        castStep("DeflectSuccessful"),
        castStep("DeflectSuccessful"),
        delayStep(1),
        castStep("DeflectSuccessful"),
        delayStep(0.1),
      ],
      0,
    )
    fixture.initialBuffs = []
    fixture.setupEffects = skystrike.talent[14][0].effect
    const rows = buildRotationTimeline(fixture)
    expect(rows.find(row => row.step.skill === "DeflectSuccessful")!.resources.Binge).toBe(0)
    expect(rows.at(-1)!.resources.Binge).toBe(10)
  })

  it.each([
    [99, true, true, 99],
    [100, true, true, 105],
    [100, false, true, 100],
    [100, true, false, 100],
  ] as const)(
    "gates Inebriate dodge Binge by resource, Carouse and active art: %s/%s/%s",
    (binge, carouse, gauntlet, expected) => {
      const fixture = input([castStep("PerfectDodgeCancel"), delayStep(0.1)], binge)
      fixture.initialBuffs = carouse ? [{ name: "Carouse", stack: 1 }] : []
      fixture.setupEffects = skystrike.talent[14][0].effect
      fixture.weapons = gauntlet ? ["skystrikeGauntlets", "rivenTwinblades"] : ["rivenTwinblades", "skystrikeGauntlets"]
      expect(buildRotationTimeline(fixture).at(-1)!.resources.Binge).toBe(expected)
    },
  )

  it.each(["Castlink", "CastlinkJadeflush", "Peakfall", "PeakfallJadeflush"])(
    "admits %s into Eonpour's exhausted-target trigger and retains its cooldown",
    skill => {
      const fixture = input(
        [
          { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0 },
          castStep(skill),
          delayStep(0.01),
          castStep("Peakfall"),
          delayStep(0.1),
        ],
        60,
      )
      fixture.initialDebuffs = [{ name: "Exhausted", stack: 1, appliedAt: 0, expiresAt: 10 }]
      fixture.innerWayConditions = ["EonpourT6"]
      fixture.innerWayRules = eonpour.effect.EonpourT6.effect.map(effect =>
        Object.assign({}, effect, { source: "Eonpour", tier: 6, effect: effect.effect ?? effect }),
      )
      const rows = buildRotationTimeline(fixture)
      expect(rows.filter(row => row.step.skill === "EonpourExhausted")).toHaveLength(1)
      expect(rows.some(row => row.buffs.has("InebriateDeepdaze"))).toBe(true)
    },
  )

  it("settles Drunkslay only on mark replacement or expiry, filtering enhanced hits", () => {
    const fixture = input(
      [
        castStep("Mark"),
        castStep("Plain"),
        delayStep(1),
        castStep("Mark"),
        castStep("Enhanced"),
        delayStep(1),
        castStep("Mark"),
        castStep("Enhanced"),
        delayStep(21),
      ],
      0,
    )
    fixture.skills = {
      ...fixture.skills,
      Mark: { castTime: 0, action: [{ type: "apply", target: "target", value: "Drunkslay", time: 0 }] },
      Plain: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      Enhanced: { castTime: 0, tags: ["InebriateEnhanced"], action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    }
    const rows = buildRotationTimeline(fixture)
    const payouts = rows.filter(row => row.step.skill === "DrunkslayDamage")
    const finalMark = rows.findLast(row => row.step.skill === "Mark")!
    expect(payouts.map(row => row.sourceRowId)).toEqual([finalMark.id, finalMark.id])
    expect(payouts.map(row => row.startTime)).toEqual([2, 22])
  })

  it("preserves recorded hits across Eonpour refresh and ignores the previous expiry", () => {
    const fixture = input(
      [
        castStep("Mark"),
        castStep("Enhanced"),
        delayStep(10),
        castStep("EonpourExhausted"),
        castStep("Enhanced"),
        delayStep(21),
      ],
      0,
    )
    fixture.skills = {
      ...fixture.skills,
      Mark: { castTime: 0, action: [{ type: "apply", target: "target", value: "Drunkslay", time: 0 }] },
      Enhanced: { castTime: 0, tags: ["InebriateEnhanced"], action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    }
    const rows = buildRotationTimeline(fixture)
    const payouts = rows.filter(row => row.step.skill === "DrunkslayDamage")
    expect(payouts.map(row => row.startTime)).toEqual([30])
  })

  it("lists the ordinary presets first and defaults to Fully Relayed Min", () => {
    const ids = defaultBuildPresets.filter(build => build.id.startsWith("draught-")).map(build => build.id)
    expect(ids).toEqual([
      "draught-fully-relayed-min",
      "draught-fully-relayed-max",
      "draught-fully-relayed-min-bp",
      "draught-fully-relayed-max-bp",
      "draught-full-min",
      "draught-full-max",
      "draught-full-min-bp",
      "draught-full-max-bp",
    ])
    expect(defaultBuildIdForPath("bamboocutDraught")).toBe(ids[0])
  })
  it("applies Deepdaze at the full-meter grant, before quick-drink recovery ends", () => {
    const rows = buildRotationTimeline(input([castStep("Whaledraft"), delayStep(0.01)], 150))
    const check = rows.find(row => row.step.type === "skill" && row.step.skill === "DraughtBingeCheck")!
    expect(check.startTime).toBeCloseTo(0.315, 12)
    const after = rows.at(-1)!
    expect(after.buffs.has("InebriateDeepdaze")).toBe(true)
    const drink = rows.find(row => row.step.type === "skill" && row.step.skill === "Whaledraft")!
    expect(drink.effectiveCastTime).toBeCloseTo(0.68, 12)
    expect(after.resources.Binge).toBe(200)
  })

  it("keeps a partial-meter drink outside Deepdaze", () => {
    const rows = buildRotationTimeline(input([castStep("Whaledraft"), delayStep(0.01)], 100))
    expect(rows.at(-1)!.resources.Binge).toBe(150)
    expect(rows.at(-1)!.buffs.has("InebriateDeepdaze")).toBe(false)
  })

  it("uses the selected Q2 recovery and retains both hits", () => {
    const rows = buildRotationTimeline(input([castStep("Castlink")], 0))
    const cast = rows.find(row => row.step.type === "skill" && row.step.skill === "Castlink")!
    expect(cast.effectiveCastTime).toBeCloseTo(0.733, 12)
    expect(cast.actions.filter(action => action.type === "damage")).toHaveLength(2)
  })

  it("accelerates two completed four-hit cycles and resets after the third", () => {
    const fixture = input(
      Array.from({ length: 13 }, (_, index) => castStep(`Dragonquench${(index % 4) + 1}`)),
      200,
    )
    const rows = buildRotationTimeline(fixture).filter(row => row.kind === "rotation")
    expect(rows).toHaveLength(13)
    expect(rows[4].effectiveCastTime).toBeCloseTo(rows[0].effectiveCastTime / 1.15, 12)
    expect(rows[8].effectiveCastTime).toBeCloseTo(rows[0].effectiveCastTime / 1.3, 12)
    expect(rows[12].effectiveCastTime).toBeCloseTo(rows[0].effectiveCastTime, 12)
    for (let index = 4; index < rows.length; index += 1)
      expect(rows[index].actions.filter(action => action.type === "damage")).toHaveLength(
        rows[index % 4].actions.filter(action => action.type === "damage").length,
      )
  })

  it.each([40, 150])("ignores %sms input ping for every Dragonquench stage without stretching animations", ping => {
    const skills = [
      "Dragonquench1",
      "Dragonquench2",
      "Dragonquench3",
      "Dragonquench4",
      "Dragonquench1",
      "Dragonquench2",
      "Dragonquench3",
      "Dragonquench4Cancel",
      "Dragonquench1",
      "Dragonquench2",
      "Dragonquench3",
      "Dragonquench4Cancel",
    ]
    const clocks = (inputPing: number) => {
      const fixture = input(
        skills.map(skill => castStep(skill)),
        200,
      )
      fixture.rotation.ping = inputPing
      return buildRotationTimeline(fixture).filter(row => row.kind === "rotation")
    }
    const baseline = clocks(0)
    const delayed = clocks(ping)
    for (const [index, row] of delayed.entries()) {
      expect(row.startTime - baseline[index].startTime).toBeCloseTo(0, 12)
      expect(row.effectiveCastTime).toBe(baseline[index].effectiveCastTime)
      expect(row.actions.filter(action => action.type === "damage").map(action => action.time)).toEqual(
        baseline[index].actions.filter(action => action.type === "damage").map(action => action.time),
      )
    }
  })

  it.each([
    { preset: fastRotation, build: "draught-fully-relayed-min", procsAt: [], umbraAt: [], payout: 59.87748755396668 },
    {
      preset: bpRotation,
      build: "draught-fully-relayed-min-bp",
      procsAt: [5.5, 23.5, 53.5],
      umbraAt: [35.5, 53.5],
      payout: 59.76598291019327,
    },
  ])("lands all four accelerated chains and payouts in $preset.name", ({ preset, build, procsAt, umbraAt, payout }) => {
    const bundle = buildPresetRotationBundle(
      {
        ...dpsSnapshotEnvironment,
        breakthrough: "18",
        pathId: "bamboocutDraught",
        martialArts: ["skystrikeGauntlets", "rivenTwinblades"],
        rotation: preset as RotationRecord,
        skillOverrides: {},
        previewId: null,
      },
      build,
    )!
    const result = calculateRotationBaseline(bundle)
    const start = result.timeline.find(row => row.battleStartTime !== undefined)!.battleStartTime!
    const procs = result.timeline.filter(row => row.step.skill === "BreakingPointT6Dodge")
    const qiBreak = result.timeline.find(row => row.step.event === "Qi" && row.step.targetQiRatio === 0)!
    const firstThreshold = result.timeline.find(row => row.step.event === "Qi" && row.step.targetQiRatio === 0.5999)!
    expect(firstThreshold.startTime - start).toBeCloseTo((qiBreak.startTime - start) * 0.4, 10)
    const ordinary = result.timeline.filter(row => row.step.skill === "HeroesBlood")
    expect(ordinary.every(row => !row.buffs.has("InebriateDeepdaze"))).toBe(true)
    const umbraDodges = result.timeline.filter(row => row.step.skill?.startsWith("GhostlyStepsUmbraDodge"))
    expect(umbraDodges.map(row => row.startTime - start)).toEqual(umbraAt)
    expect(ordinary.at(-1)!.debuffs.has("Strayhunt")).toBe(preset === fastRotation)
    const heavies = result.timeline.filter(row => row.kind === "rotation" && row.step.skill?.startsWith("Dragonquench"))
    expect(heavies).toHaveLength(56)
    expect(heavies.every(row => row.buffs.has("InebriateDeepdaze"))).toBe(true)
    expect(heavies.flatMap(row => row.actions.filter(action => action.type === "damage"))).toHaveLength(80)
    expect(procs.map(row => row.startTime - start)).toEqual(procsAt)
    const enhanced = result.timeline.filter(row => row.step.skill === "HeroesBloodInebriate")
    expect(enhanced).toHaveLength(4)
    for (const row of enhanced) {
      const hits = row.actions.filter(action => action.type === "damage")
      expect(hits).toHaveLength(11)
      for (const hit of hits)
        expect(row.startTime + Number(hit.time)).toBeLessThan(row.buffs.get("InebriateDeepdaze")!.expiresAt!)
    }
    const counts = new Map<number, number>()
    for (const row of heavies) {
      const expiry = row.buffs.get("InebriateDeepdaze")!.expiresAt!
      counts.set(expiry, (counts.get(expiry) ?? 0) + 1)
      for (const hit of row.actions.filter(action => action.type === "damage"))
        expect(row.startTime + Number(hit.time)).toBeLessThan(expiry)
    }
    expect([...counts.values()]).toEqual([14, 14, 14, 14])
    expect(result.timeline.every(row => (row.resources.Vitality ?? 0) >= 0)).toBe(true)
    const payouts = result.baseline.filter(entry => entry.replay)
    expect(payouts).toHaveLength(3)
    expect(payouts.at(-1)!.timelineTime! - start).toBeCloseTo(payout, 8)
  })
})
