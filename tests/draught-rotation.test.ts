import eonpour from "@gamedata/innerway/eonpour.json"
import skystrike from "@gamedata/martial-art/skystrike-gauntlets.json"
import rotation from "@gamedata/rotation/bamboocut-draught/draught-dummy-1-min.json"
import { describe, expect, it } from "vitest"

import { defaultBuildIdForPath } from "@/application/gameData/paths"
import { allSkillDefinitions, buffDefinitions, debuffDefinitions } from "@/application/gameData/skills"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
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
    const payouts = buildRotationTimeline(fixture).filter(row => row.step.skill === "DrunkslayDamage")
    expect(payouts.map(row => row.startTime)).toEqual([2, 22])
  })

  it("lists the BP presets first and defaults to Min BP", () => {
    const ids = defaultBuildPresets.filter(build => build.id.startsWith("draught-")).map(build => build.id)
    expect(ids).toEqual([
      "draught-fully-relayed-min-bp",
      "draught-fully-relayed-max-bp",
      "draught-fully-relayed-min",
      "draught-fully-relayed-max",
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

  it("does not charge input ping for any Dragonquench stage", () => {
    const steps = Array.from({ length: 13 }, (_, index) => castStep(`Dragonquench${(index % 4) + 1}`))
    const clocks = (ping: number) => {
      const fixture = input(steps, 200)
      fixture.rotation.ping = ping
      return buildRotationTimeline(fixture).map(row => ({
        start: row.startTime,
        cast: row.effectiveCastTime,
        hits: row.actions.filter(action => action.type === "damage").map(action => action.time),
      }))
    }
    expect(clocks(40)).toEqual(clocks(0))
    expect(clocks(150)).toEqual(clocks(0))
  })

  for (const build of [
    "draught-fully-relayed-min-bp",
    "draught-fully-relayed-max-bp",
    "draught-fully-relayed-min",
    "draught-fully-relayed-max",
  ]) {
    for (const breakthrough of ["17", "18", "19"]) {
      it(`${build} at BT${breakthrough} reaches its rate targets and resolves the authored rotation`, () => {
        const bundle = buildPresetRotationBundle(
          {
            ...dpsSnapshotEnvironment,
            breakthrough,
            pathId: "bamboocutDraught",
            martialArts: ["skystrikeGauntlets", "rivenTwinblades"],
            rotation: rotation as RotationRecord,
            skillOverrides: {},
            previewId: null,
          },
          build,
        )!
        const result = calculateRotationBaseline(bundle)
        const rates = calculateDerivedStats(bundle.stats, bundle.enemy.judgementResistance, {}, bundle.weapons)
        expect(rates.effectivePrecision).toBeGreaterThanOrEqual(0.99)
        expect(rates.effectivePrecision).toBeLessThanOrEqual(1)
        expect(rates.effectiveCrit).toBeGreaterThanOrEqual(0.79)
        expect(rates.effectiveCrit).toBeLessThanOrEqual(0.8)
        const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
        const heavies = casts.filter(row => row.step.skill?.startsWith("Dragonquench"))
        const qiRows = result.timeline
          .filter(row => row.step.type === "event" && row.step.event === "Qi")
          .sort((left, right) => left.startTime - right.startTime)
        const breaks = qiRows.filter(
          row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
        )
        expect(result.duration).toBe(60)
        expect(result.baseline.filter(entry => entry.replay)).toHaveLength(4)
        expect(result.metrics.dps).toBeGreaterThan(0)
        const dragonRows = result.metrics.breakdown.skills.filter(row => row.id.startsWith("Dragonquench"))
        const dragonGroups = result.metrics.breakdown.groupedSkills.filter(
          row => row.name === "Dragonquench - Inebriate",
        )
        expect(dragonGroups).toHaveLength(1)
        expect(dragonGroups[0].children).toHaveLength(4)
        expect(dragonGroups[0].damage).toBe(dragonRows.reduce((sum, row) => sum + row.damage, 0))
        expect(casts[0].resources.Binge).toBe(60)
        expect(heavies).toHaveLength(49)
        expect(
          heavies.reduce((count, row) => count + row.actions.filter(action => action.type === "damage").length, 0),
        ).toBe(73)
        expect(heavies.every(row => row.buffs.has("InebriateDeepdaze"))).toBe(true)
        const cutoff = result.timeline.find(row => row.step.event === "BattleEnd")!.startTime
        const bladeSpecials = casts.filter(row => row.step.skill === "HeroesBloodInebriate")
        expect(bladeSpecials).toHaveLength(4)
        expect(
          bladeSpecials.every(row =>
            row.actions
              .filter(action => action.type === "damage")
              .every(action => row.startTime + Number(action.time) < cutoff),
          ),
        ).toBe(true)
        expect(breaks).toHaveLength(1)
        expect(breaks[0].startTime).toBeCloseTo(heavies[21].startTime + Number(heavies[21].actions[0].time), 12)
        expect(
          qiRows.map(row =>
            row.step.type === "event" && row.step.event === "Qi" ? row.step.targetQiRatio : undefined,
          ),
        ).toEqual([0.5999, 0.3999, 0, 0.5999, 0.3999])
        const battleStart = result.timeline.find(row => row.battleStartTime !== undefined)!.battleStartTime!
        const depletionTime = breaks[0].startTime - battleStart
        const depletionResumes = breaks[0].startTime + 10 + 4
        expect(qiRows[0].startTime - battleStart).toBeCloseTo(depletionTime * 0.4, 10)
        expect(qiRows[1].startTime - battleStart).toBeCloseTo(depletionTime * 0.6, 10)
        expect(qiRows[3].startTime - depletionResumes).toBeCloseTo(depletionTime * 0.4, 10)
        expect(qiRows[4].startTime - depletionResumes).toBeCloseTo(depletionTime * 0.6, 10)
        expect(depletionResumes + depletionTime).toBeGreaterThan(cutoff)
        const finalSpecial = casts.findLast(row => row.step.skill === "HeroesBlood")!
        expect(finalSpecial.buffs.has("InebriateDeepdaze")).toBe(false)
        const finalPayout = result.baseline.findLast(entry => entry.replay)!
        expect(finalPayout.timelineTime! - battleStart).toBeCloseTo(59.67346603935133, 10)
        expect(finalPayout.timelineTime!).toBeLessThan(cutoff)

        expect(result.timeline.filter(row => row.step.skill === "EonpourExhausted")).toHaveLength(1)
      })
    }
  }
})
