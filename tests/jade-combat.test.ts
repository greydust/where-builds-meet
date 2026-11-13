import events from "@gamedata/event.json"
import vernal from "@gamedata/martial-art/vernal-umbrella.json"
import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildPresetRotationBundle } from "@/application/graduation"
import { migrateRotation } from "@/application/rotationCatalog"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import {
  buildRotationTimeline,
  requirementsPass,
  type EditableObject,
  type RotationStep,
  type TimelineBuildInput,
} from "@/calculations/rotationTimeline"
import { defaultBuildPresets } from "@/gear"
import { exportRotationEntries, mergeImportedRotationEntries, serializeRotationEntries } from "@/rotationTransfer"

import { loadDpsSnapshotFixtures, loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

const selected = ["BlossomBarrage", "StarReacher", "ThunderousBloom"].map(innerWay => ({ innerWay, tier: "T6" }))
function input(steps: RotationStep[], blossoms = 0): TimelineBuildInput {
  return {
    rotation: { name: "Jade", ping: 0, steps },
    skills: allSkillDefinitions,
    effectDefinitions,
    eventDefinitions: {},
    dots: {},
    setupEffects: [],
    innerWayRules: innerWayEffectRulesFor(selected, 19, "silkbindJade"),
    innerWayConditions: [...innerWayConditionsFor(selected, undefined, "silkbindJade")],
    weapons: ["vernalUmbrella", "inkwellFan"],
    initialResources: { Blossoms: blossoms },
    resourceMaximums: { Blossoms: 100 },
    resourceRegeneration: { Blossoms: 0.3 },
  }
}
const cast = (skill: string): RotationStep => ({ type: "skill", skill })

describe("Jade combat", () => {
  it.each([true, false])(
    "extends Combo from exhausted Spring Away at most once per half-second (marked=%s)",
    marked => {
      const data = input([
        cast("Mark"),
        cast("Shots"),
        { type: "event", event: "Delay", duration: 0.7 },
        cast("Observe"),
      ])
      data.skills = {
        ...data.skills,
        Mark: {
          castTime: 0,
          action: [
            { type: "apply", target: "target", value: "Exhausted", time: 0 },
            ...(marked ? [{ type: "apply", target: "target", value: "JadeCombo", duration: 1, time: 0 }] : []),
          ],
        },
        Shots: {
          castTime: 0,
          tags: ["SpringAway"],
          action: [0, 0.1, 0.6].map(time => ({ type: "damage", phyCoef: 1, time })),
        },
        Observe: { castTime: 0, action: [] },
      }
      const row = buildRotationTimeline(data).find(r => r.step.skill === "Observe")!
      expect(row.debuffs.get("JadeCombo")?.expiresAt ?? 0).toBe(marked ? 3 : 0)
      const bonuses = (data.innerWayRules ?? [])
        .filter(
          r =>
            r.source === "BlossomBarrage" &&
            r.tier === 4 &&
            requirementsPass(r.requirement, row.buffs, row.debuffs, ["SpringAway"], new Set(data.innerWayConditions)),
        )
        .reduce((sum, r) => sum + Number(r.effect?.hpDMGBonus ?? 0), 0)
      expect(bonuses).toBe(marked ? 0.1 : 0)
    },
  )
  it("lets airborne SR suppress a later grounded grant until its expiry", () => {
    const data = input([
      cast("StarReacherAirborneGrant"),
      { type: "event", event: "Delay", duration: 2 },
      cast("StarReacherGrant"),
      cast("Observe"),
      { type: "event", event: "Delay", duration: 11 },
      cast("StarReacherGrant"),
      cast("Observe"),
    ])
    data.skills = { ...data.skills, Observe: { castTime: 0, action: [] } }
    const rows = buildRotationTimeline(data).filter(r => r.step.skill === "Observe")
    expect(rows[0].buffs.has("StarReacherAirborne")).toBe(true)
    expect(rows[0].buffs.has("StarReacherBone")).toBe(false)
    expect(rows[1].buffs.has("StarReacherAirborne")).toBe(false)
    expect(rows[1].buffs.has("StarReacherBone")).toBe(true)
  })

  it.each([
    ["T0", 0.1, 0.05],
    ["T1", 0.2, 0.075],
    ["T6", 0.2, 0.075],
  ] as const)("selects replacement Combo and SR bonuses at %s, including refresh", (tier, combo, attack) => {
    const ways = [
      { innerWay: "BlossomBarrage", tier },
      { innerWay: "StarReacher", tier },
    ]
    const data = input([
      cast("Mark"),
      cast("StarReacherGrant"),
      cast("Observe"),
      { type: "event", event: "Delay", duration: 2 },
      cast("Mark"),
      cast("StarReacherGrant"),
      cast("Observe"),
    ])
    data.innerWayConditions = [...innerWayConditionsFor(ways, undefined, "silkbindJade")]
    data.innerWayRules = innerWayEffectRulesFor(ways, 19, "silkbindJade")
    data.skills = {
      ...data.skills,
      Mark: { castTime: 0, action: [{ type: "apply", target: "target", value: "JadeCombo", time: 0 }] },
      Observe: { castTime: 0, action: [] },
    }
    const rows = buildRotationTimeline(data).filter(r => r.step.skill === "Observe")
    for (const row of rows) {
      const sum = (name: string, key: string) => {
        const effect = row.buffs.get(name) ?? row.debuffs.get(name)
        return ((effect?.perHitEffectRules ?? []) as Array<{ requirement: unknown; effect: Record<string, unknown> }>)
          .filter(rule =>
            requirementsPass(rule.requirement, row.buffs, row.debuffs, ["Ballistic"], new Set(data.innerWayConditions)),
          )
          .reduce((total, rule) => total + Number(rule.effect[key] ?? 0), 0)
      }
      expect(sum("JadeCombo", "hpDMGBonus")).toBe(combo)
      expect(sum("StarReacherBone", "physicalAttackBonus")).toBe(attack)
    }
  })
  it.each([
    [false, false, 0.075],
    [false, true, 0.15],
    [true, false, 0.15],
    [true, true, 0.25],
  ] as const)("keeps SR routes distinct (airborne=%s exhausted=%s)", (airborne, exhausted, attack) => {
    const data = input([
      cast("Mark"),
      cast(airborne ? "StarReacherAirborneGrant" : "StarReacherGrant"),
      cast("Observe"),
    ])
    data.skills = {
      ...data.skills,
      Mark: {
        castTime: 0,
        action: [...(airborne ? ["Airborne"] : []), ...(exhausted ? ["Exhausted"] : [])].map(value => ({
          type: "apply",
          target: "target",
          value,
          time: 0,
        })),
      },
      Observe: { castTime: 0, action: [] },
    }
    const row = buildRotationTimeline(data).find(r => r.step.skill === "Observe")!
    const active = [...row.buffs.values()].filter(b => b.name.startsWith("StarReacher"))
    expect(active).toHaveLength(1)
    const bonus = (
      (active[0].perHitEffectRules ?? []) as Array<{ requirement: unknown; effect: Record<string, unknown> }>
    )
      .filter(rule => requirementsPass(rule.requirement, row.buffs, row.debuffs, [], new Set(data.innerWayConditions)))
      .reduce((total, rule) => total + Number(rule.effect.physicalAttackBonus ?? 0), 0)
    expect(bonus).toBe(attack)
  })
  it.each([
    [false, [0, 0.15]],
    [true, [0, 0.1, 0.2]],
  ] as const)("locks UF volley choice before target marks disappear (airborne=%s)", (airborne, times) => {
    const data = input(
      [cast("Mark"), cast("UnfadingFlowerCancel"), cast("Remove"), { type: "event", event: "Delay", duration: 1.3 }],
      100,
    )
    data.skills = {
      ...data.skills,
      Mark: {
        castTime: 0,
        action: [{ type: "apply", target: "target", value: airborne ? "Airborne" : "LingeringBone", time: 0 }],
      },
      Remove: {
        castTime: 0,
        action: [
          {
            type: "consume",
            target: "target",
            value: airborne ? "Airborne" : "LingeringBone",
            stack: "all",
            time: 0.6,
          },
        ],
      },
    }
    const hits = buildRotationTimeline(data).filter(r => r.step.skill === "UnfadingFlowerProjectile")
    expect(hits.slice(0, times.length).map(row => +(row.startTime - hits[0].startTime).toFixed(3))).toEqual([...times])
  })

  it("separates UF activation damage and limits projectile attunement to follow-up hits", async () => {
    const fixture = (await loadDpsSnapshotFixtures("19")).find(entry => entry.id === "silkbindJade/jade-three-rounds")!
    const bundle = buildPresetRotationBundle(
      { pathId: fixture.pathId, ...fixture.fixture, rotation: fixture.rotation, skillOverrides: {}, previewId: null },
      fixture.fixture.build,
    )!
    const plain = calculateRotationBaseline({ ...bundle, attunement: emptyAttunementStats })
    const boosted = calculateRotationBaseline({
      ...bundle,
      attunement: { ...emptyAttunementStats, vernalProjectile280304Boost: 0.28 },
    })
    const heavy = (result: typeof plain) =>
      result.metrics.breakdown.groupedSkills.find(row => row.name === "Unfading Flower Heavy Attack")!
    const projectiles = (result: typeof plain) =>
      result.metrics.breakdown.groupedSkills.find(row => row.name === "Unfading Flower")!
    expect(heavy(plain).hits).toBe(3)
    expect(heavy(boosted).damage).toBe(heavy(plain).damage)
    expect(projectiles(boosted).damage).toBeGreaterThan(projectiles(plain).damage)
    expect(projectiles(boosted).hits).toBe(projectiles(plain).hits)
  })
  it("funds both Grounded Soaring Spins on a passive dummy", async () => {
    const fixtures = (await loadDpsSnapshotCases()).filter(entry => entry.id.startsWith("silkbindJade/jade-grounded/"))
    expect(fixtures).toHaveLength(18)
    for (const fixture of fixtures) {
      const result = calculateRotationBaseline(
        buildPresetRotationBundle(
          {
            pathId: fixture.pathId,
            ...fixture.fixture,
            rotation: fixture.rotation,
            skillOverrides: {},
            previewId: null,
          },
          fixture.fixture.build,
        )!,
      )
      const opener = result.timeline.find(row => row.step.skill === "SpringSorrow")!
      expect(opener.buffs.has("Jadebreak")).toBe(true)
      expect(opener.buffs.has("Windrider")).toBe(true)
      const firstHit = opener.actions.findIndex(action => action.type === "damage")
      expect(opener.startTime + Number(opener.actions[firstHit].time)).toBeCloseTo(result.anchorTime, 8)
      expect(opener.actionStates[firstHit + 1].resources.Vitality).toBe(
        opener.actionStates[firstHit].resources.Vitality,
      )
      const smolder = result.timeline.find(row => row.step.skill === "DragonsBreathSmolder2")!
      const poet = result.timeline.find(row => row.step.skill === "DrunkenPoet5HitsCancel")!
      expect(smolder.buffs.has("Intoxicated")).toBe(false)
      const impacts = smolder.actions.flatMap((action, index) =>
        action.type === "damage" && result.actionBreakdowns[`${smolder.id}:${index}`] ? [Number(action.time)] : [],
      )
      expect(new Set(impacts).size).toBe(2)
      expect(poet.startTime).toBeCloseTo(smolder.startTime + Math.max(...impacts), 8)
      const vitality = result.timeline
        .flatMap(row => [row, ...Object.values(row.actionStates)])
        .map(state => state.resourceRanges?.Vitality?.minimum ?? state.resources.Vitality)
        .filter(value => typeof value === "number")
      expect(vitality.length).toBeGreaterThan(0)
      expect(Math.min(...vitality)).toBeGreaterThanOrEqual(0)
      expect(result.timeline.some(row => row.step.event === "TakeDamage")).toBe(false)
      const spins = result.timeline.filter(row => row.step.skill === "SoaringSpin2")
      expect(spins).toHaveLength(2)
      for (const spin of spins) {
        expect(spin.resources.Vitality).toBeGreaterThanOrEqual(15)
        expect(
          spin.actions.filter(
            (action, index) => action.type === "damage" && result.actionBreakdowns[`${spin.id}:${index}`],
          ),
        ).toHaveLength(2)
      }
    }
  })
  it.each([
    ["ColorfulPhoenix", 0.3, true],
    ["ColorfulPhoenix", 0.41, false],
    ["colorfulphoenix2", 0.3, true],
    ["EmeraldBarrier", 0.3, true],
    ["EmeraldBarrier", 0.41, false],
    ["EmeraldBarrierCancel", 0.1, true],
    ["EmeraldBarrierCancel", 0.2, false],
    ["SoaringSpin1", 0.4, true],
    ["SoaringSpin1", 0.51, false],
    ["SoaringSpin2", 0.4, true],
  ] as const)("resolves %s dodge window at %s", (skill, time, succeeds) => {
    const data = input([cast(skill), { type: "event", event: "TakeDamage", startTime: time, damage: 200 }])
    data.rotation.ping = 0
    data.eventDefinitions = { TakeDamage: { action: [{ type: "takeDamage", time: 0 }] } }
    data.innerWayConditions = ["BreakingPointT6"]
    const rows = buildRotationTimeline(data)
    expect(rows.some(row => row.step.skill === "BreakingPointT6Dodge")).toBe(succeeds)
  })
  it("uses the attacking dummy to trigger BP from Soaring and lands Tide during Exhausted", async () => {
    const fixtures = (await loadDpsSnapshotCases()).filter(
      entry =>
        entry.id.startsWith("silkbindJade/jade-three-rounds/") &&
        defaultBuildPresets
          .find(build => build.id === entry.fixture.build)
          ?.setup?.innerWays.some(way => way.innerWay === "BreakingPoint"),
    )
    expect(fixtures).toHaveLength(12)
    for (const fixture of fixtures) {
      const result = calculateRotationBaseline(
        buildPresetRotationBundle(
          {
            pathId: fixture.pathId,
            ...fixture.fixture,
            rotation: fixture.rotation,
            skillOverrides: {},
            previewId: null,
          },
          fixture.fixture.build,
        )!,
      )
      const soaring = result.timeline.find(row => row.step.skill === "SoaringSpin2")!
      const forsaken = result.timeline.find(row => row.step.skill === "ForsakenFame")!
      expect(soaring.startTime).toBeGreaterThanOrEqual(forsaken.startTime + forsaken.effectiveCastTime)
      expect(
        result.timeline
          .filter(row => row.step.skill === "PerfectDodgeSuccess")
          .map(row => row.startTime - result.anchorTime),
      ).toEqual([5.5, 11.5, 17.5, 23.5])
      const dodge = result.timeline.find(row => row.step.skill === "Dodge")!
      const insertedPoet = result.timeline.find(
        row => row.step.skill === "DrunkenPoet1Hit" && row.startTime < dodge.startTime,
      )!
      expect(insertedPoet).toBeDefined()
      const insertedPoetHit = insertedPoet.actions.findIndex(action => action.type === "damage")
      expect(result.actionBreakdowns[`${insertedPoet.id}:${insertedPoetHit}`]).toBeDefined()
      expect(insertedPoet.startTime + insertedPoet.effectiveCastTime).toBeLessThanOrEqual(dodge.startTime)
      const dodgeSuccess = result.timeline.find(
        row => row.step.skill === "PerfectDodgeSuccess" && row.sourceRowId === dodge.id,
      )!
      expect(dodgeSuccess.startTime - result.anchorTime).toBeCloseTo(17.5, 9)
      const nextQ = result.timeline.find(
        row => row.step.skill === "SpringSorrow" && row.startTime > dodgeSuccess.startTime,
      )!
      expect(nextQ.buffs.has("MysteryDMGBoost")).toBe(true)
      expect(
        result.timeline.some(row => row.step.skill === "PerfectDodgeSuccess" && row.sourceRowId === soaring.id),
      ).toBe(true)
      expect(result.timeline.some(row => row.step.skill === "BreakingPointT6Dodge")).toBe(true)
      const tide = result.timeline.find(row => row.step.skill === "DragonHeadTide")!
      const damageIndex = tide.actions.findIndex(action => action.type === "damage")
      expect(tide.actionStates[damageIndex].debuffs.has("Exhausted")).toBe(true)
      expect(tide.actionStates[damageIndex].buffs.has("Shield")).toBe(true)
      expect(tide.startTime + Number(tide.actions[damageIndex].time)).toBeLessThan(result.anchorTime + 30)
      const goldenBodies = result.timeline.filter(row => row.step.skill === "GoldenBodyCancel")
      expect(goldenBodies).toHaveLength(2)
      expect(goldenBodies[1].startTime - goldenBodies[0].startTime).toBeGreaterThanOrEqual(20)
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      const lateSmolder = casts[casts.indexOf(goldenBodies[1]) + 1]
      expect(lateSmolder.step.skill).toBe("DragonsBreathSmolder1")
      expect(lateSmolder.startTime).toBeCloseTo(goldenBodies[1].startTime + 0.5, 9)
      const smolderHit = lateSmolder.actions.findIndex(action => action.type === "damage")
      expect(lateSmolder.actionStates[smolderHit].buffs.has("Shield")).toBe(true)
      const latePoet = casts.findLast(row => row.step.skill === "DrunkenPoet2Hits")!
      const poetHits = latePoet.actions.flatMap((action, index) =>
        action.type === "damage" && latePoet.actionStates[index]?.combatOrder !== undefined
          ? [latePoet.actionStates[index]]
          : [],
      )
      expect(poetHits).toHaveLength(2)
      for (const hit of poetHits) expect(hit.buffs.has("Shield")).toBe(true)
      expect(result.actionBreakdowns[tide.id + ":" + damageIndex]).toBeDefined()
      expect(result.duration).toBeCloseTo(30, 9)
    }
  })
  it("executes an immediate legal follow-up for every Jade preset cancel", async () => {
    const fixtures = (await loadDpsSnapshotCases()).filter(entry => entry.pathId === "silkbindJade")
    for (const fixture of fixtures) {
      const result = calculateRotationBaseline(
        buildPresetRotationBundle(
          {
            pathId: fixture.pathId,
            ...fixture.fixture,
            rotation: fixture.rotation,
            skillOverrides: {},
            previewId: null,
          },
          fixture.fixture.build,
        )!,
      )
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      for (const [index, row] of casts.entries()) {
        if (!String(row.skill?.name).includes("[Cancel]") || row.step.skill === "GoldenBodyCancel") continue
        if (row.startTime + row.effectiveCastTime >= result.anchorTime + result.duration) continue
        const next = casts[index + 1]
        expect(next).toBeDefined()
        // Sober Smolder reaches its normal cancel window before the second impact.
        if (row.step.skill === "DragonsBreathSmolder2" && !row.buffs.has("Intoxicated")) continue
        let legalFollowUp: boolean
        switch (row.step.skill) {
          case "ForsakenFameCancel":
            legalFollowUp =
              !["ForsakenFame", "ForsakenFameCancel"].includes(next.step.skill ?? "") &&
              next.skill?.weapon !== "Umbrella"
            break
          case "EmeraldBarrierCancel":
          case "PeaksSpringlessSilenceCancel":
            legalFollowUp = next.step.skill === "MoonShatterSpring"
            break
          default:
            legalFollowUp = [
              "Deflect",
              "EmeraldBarrier",
              "EmeraldBarrierMiss",
              "EmeraldBarrierCancel",
              "MoonShatterSpring",
            ].includes(next.step.skill ?? "")
        }
        expect(legalFollowUp).toBe(true)
        expect(next.startTime).toBeLessThanOrEqual(row.startTime + row.effectiveCastTime + 0.040001)
      }
    }
  })
  it("uses Flying's opener, Peak gap closure, Endurance recovery and legal buff refreshes across builds", async () => {
    const fixtures = (await loadDpsSnapshotCases()).filter(entry => entry.id.startsWith("silkbindJade/jade-flying/"))
    expect(fixtures).toHaveLength(18)
    for (const fixture of fixtures) {
      const result = calculateRotationBaseline(
        buildPresetRotationBundle(
          {
            pathId: fixture.pathId,
            ...fixture.fixture,
            rotation: fixture.rotation,
            skillOverrides: {},
            previewId: null,
          },
          fixture.fixture.build,
        )!,
      )
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      const flowers = casts.filter(row => row.step.skill === "UnfadingFlowerCancel")
      expect(flowers).toHaveLength(3)
      for (const flower of flowers) {
        const channel = casts[casts.indexOf(flower) - 1]
        expect(channel.step.skill).toBe("SpringAway")
        expect(channel.step.type === "skill" ? channel.step.duration : undefined).toBe(10)
        expect(channel.effectiveCastTime).toBeCloseTo(10 + 0.74 + 0.5909090909090908, 8)
        expect(flower.resources.Blossoms).toBe(100)
      }
      const openingQ = casts.find(row => row.step.skill === "SpringSorrow")!
      expect(casts[0].distance).toBe(9)
      expect(openingQ.distance).toBe(9)
      expect(openingQ.actionStates[0].distance).toBe(9)
      const qi = result.timeline.filter(row => row.step.event === "Qi")
      const exhaustion = qi.find(row => row.step.event === "Qi" && row.step.targetQiRatio === 0)!
      expect(exhaustion.sourceRowId).toBe(flowers[1].id)
      const breakTime = exhaustion.startTime - result.anchorTime
      expect(qi[0].startTime - result.anchorTime).toBeCloseTo(breakTime * 0.4, 8)
      expect(qi[1].startTime - result.anchorTime).toBeCloseTo(breakTime * 0.6, 8)
      expect(casts.filter(row => row.step.skill === "FluteOfTheTidesCancel")).toHaveLength(2)
      expect(casts.filter(row => row.step.skill?.startsWith("ForsakenFame"))).toHaveLength(0)
      for (const peak of casts.filter(row =>
        ["PeaksSpringlessSilence", "PeaksSpringlessSilenceCancel"].includes(row.step.skill ?? ""),
      )) {
        expect(peak.distance).toBe(9)
        expect(peak.actionStates[0].distance).toBe(9)
        expect(peak.actionStates[0].combatOrder).toBeUndefined()
        expect(peak.actionStates[1].distance).toBe(1)
        expect(result.actionBreakdowns[`${peak.id}:0`]).toBeUndefined()
        expect(result.actionBreakdowns[`${peak.id}:1`]).toBeDefined()
        const previous = casts[casts.indexOf(peak) - 1]
        expect(previous.distance).toBe(9)
      }
      for (const row of result.timeline)
        for (const state of Object.values(row.actionStates))
          expect(state.resourceRanges?.Vitality?.minimum ?? state.resources.Vitality ?? 0).toBeGreaterThanOrEqual(0)
      const enduranceMaximum = casts[0].resources.Endurance
      for (const flower of casts.filter(row => row.step.skill === "UnfadingFlowerCancel")) {
        const nextChannel = casts.find(row => row.startTime > flower.startTime && row.step.skill === "SpringAway")
        const recovery = casts.filter(
          row =>
            row.startTime >= flower.startTime &&
            row.startTime <= (nextChannel?.startTime ?? result.anchorTime + result.duration),
        )
        expect(
          recovery.filter(row =>
            ["PeaksSpringlessSilence", "PeaksSpringlessSilenceCancel"].includes(row.step.skill ?? ""),
          ),
        ).toHaveLength(nextChannel ? 1 : 0)
        expect(recovery.filter(row => row.step.skill === "MoonShatterSpring")).toHaveLength(nextChannel ? 2 : 0)
        for (const row of recovery) {
          expect(row.resourceConsumption?.Endurance ?? 0).toBe(0)
          expect(row.resources.Endurance).toBeCloseTo(
            Math.min(enduranceMaximum, flower.resources.Endurance + 10 * (row.startTime - flower.startTime)),
            8,
          )
        }
      }
      for (const row of casts.filter(row => row.step.skill === "SpringAway")) {
        expect(row.distance).toBe(9)
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(false)
      }
      for (const row of casts.filter(row => row.step.skill === "MoonShatterSpring")) {
        expect(row.distance).toBe(1)
        const previous = casts[casts.indexOf(row) - 1].step.skill
        expect(["EmeraldBarrier", "PeaksSpringlessSilence", "PeaksSpringlessSilenceCancel"]).toContain(previous)
        expect(row.effectiveCastTime).toBeCloseTo(previous === "EmeraldBarrier" ? 2.433 : 1.557, 9)
      }
      for (const row of result.timeline.filter(row => row.step.skill === "SpringAwayProjectile"))
        for (const [index, action] of row.actions.entries()) {
          if (row.startTime + Number(action.time ?? 0) > result.anchorTime + result.duration) continue
          expect(row.actionStates[index]?.distance).toBe(9)
        }
      expect(result.duration).toBe(60)
    }
  })
  it("keeps Hybrid refills, buff coverage and cancel follow-ups legal across supported builds", async () => {
    const fixtures = (await loadDpsSnapshotCases()).filter(entry => entry.id.startsWith("silkbindJade/jade-hybrid/"))
    expect(fixtures).toHaveLength(18)
    for (const fixture of fixtures) {
      const result = calculateRotationBaseline(
        buildPresetRotationBundle(
          {
            pathId: fixture.pathId,
            ...fixture.fixture,
            rotation: fixture.rotation,
            skillOverrides: {},
            previewId: null,
          },
          fixture.fixture.build,
        )!,
      )
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      const flowers = casts.filter(row => row.step.skill === "UnfadingFlowerCancel")
      for (const pursuit of casts.filter(row => row.step.skill === "MoonShatterSpring")) {
        const previous = casts[casts.indexOf(pursuit) - 1]
        expect(pursuit.distance).toBe(Object.values(previous.actionStates).at(-1)?.distance ?? previous.distance)
      }
      for (const peak of casts.filter(row =>
        ["PeaksSpringlessSilence", "PeaksSpringlessSilenceCancel"].includes(row.step.skill ?? ""),
      )) {
        expect(peak.distance).toBe(9)
        expect(peak.actionStates[0].combatOrder).toBeUndefined()
        expect(peak.actionStates[1].distance).toBe(1)
        expect(result.actionBreakdowns[`${peak.id}:0`]).toBeUndefined()
        expect(result.actionBreakdowns[`${peak.id}:1`]).toBeDefined()
      }
      for (const index of [0, 3]) {
        expect(casts[casts.indexOf(flowers[index]) - 1].step.skill).toBe("SpringAway")
        expect(flowers[index].resources.Blossoms).toBe(100)
      }
      for (const row of result.timeline)
        for (const state of Object.values(row.actionStates))
          expect(state.resourceRanges?.Vitality?.minimum ?? state.resources.Vitality ?? 0).toBeGreaterThanOrEqual(0)
      expect(flowers).toHaveLength(6)
      expect(result.timeline.find(row => row.step.event === "Qi" && row.step.targetQiRatio === 0)?.sourceRowId).toBe(
        flowers[3].id,
      )
      for (const flower of flowers) {
        expect(casts[casts.indexOf(flower) + 1].step.skill).toBe("Deflect")
      }
      for (const row of casts.filter(row => row.skill?.weapon === "Umbrella"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(false)
      const firstBone = casts.find(row => row.step.skill?.startsWith("ForsakenFame"))!
      for (const row of result.timeline)
        for (const [index, action] of row.actions.entries()) {
          if (action.type !== "damage" || !result.actionBreakdowns[`${row.id}:${index}`]) continue
          expect(row.actionStates[index].buffs.has("Jadebreak")).toBe(true)
          if (row.startTime + Number(action.time ?? 0) <= firstBone.startTime + 1.19 + 1e-9) continue
          expect(row.actionStates[index].debuffs.has("LingeringBone")).toBe(true)
        }
      expect(result.duration).toBe(60)
    }
  })
  it.each([
    [0.051, 1],
    [1, 6],
    [10, 60],
  ])("shoots for %ss, retaining launched projectiles during recovery", (duration, hits) => {
    const data = input([{ type: "skill", skill: "SpringAway", duration }, cast("VernalHeavy")])
    data.initialResources = { Endurance: 1000, Blossoms: 0 }
    data.resourceMaximums = { Endurance: 1000, Blossoms: 100 }
    const rows = buildRotationTimeline(data)
    expect(rows.filter(row => row.step.skill === "SpringAwayProjectile")).toHaveLength(hits)
    expect(rows.find(row => row.step.skill === "VernalHeavy")!.startTime).toBeCloseTo(
      duration + 0.74 + 0.5909090909090908,
      9,
    )
  })
  it("enters recovery immediately when channel Endurance is depleted", () => {
    const data = input([{ type: "skill", skill: "SpringAway", duration: 10 }, cast("VernalHeavy")])
    data.initialResources = { Endurance: 20, Blossoms: 0 }
    data.resourceMaximums = { Endurance: 100, Blossoms: 100 }
    const rows = buildRotationTimeline(data)
    expect(rows.filter(row => row.step.skill === "SpringAwayProjectile")).toHaveLength(12)
    expect(rows.find(row => row.step.skill === "VernalHeavy")!.startTime).toBeCloseTo(2.74 + 0.5909090909090908, 9)
  })
  it("includes pursuit's charged cost bonus and resumes Endurance regeneration during recovery", () => {
    const data = input([cast("Prepare"), { type: "skill", skill: "SpringAway", duration: 10 }, cast("VernalHeavy")])
    data.skills = {
      ...data.skills,
      Prepare: {
        castTime: 0,
        action: [{ type: "apply", target: "self", value: "StartlingSpring", stack: 5, time: 0 }],
      },
    }
    data.initialResources = { Endurance: 12, Blossoms: 0 }
    data.resourceMaximums = { Endurance: 12, Blossoms: 100 }
    data.resourceRegeneration = { Endurance: 10, Blossoms: 0 }
    const rows = buildRotationTimeline(data)
    const next = rows.find(row => row.step.skill === "VernalHeavy")!
    expect(rows.filter(row => row.step.skill === "SpringAwayProjectile")).toHaveLength(6)
    expect(next.startTime).toBeCloseTo(1.74 + 0.5909090909090908, 9)
    expect(next.resources.Endurance).toBeCloseTo(0.5909090909090908 * 10, 8)
  })
  it("pays input latency once for pursuit rather than for its internal route selection", () => {
    const data = input([cast("ForsakenFame"), cast("EmeraldBarrier"), cast("MoonShatterSpring"), cast("ForsakenFame")])
    data.rotation.ping = 40
    const casts = buildRotationTimeline(data).filter(row => row.kind === "rotation" && row.step.type === "skill")
    const pursuit = casts.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.effectiveCastTime).toBeCloseTo(2.433, 9)
    expect(casts.at(-1)!.startTime - pursuit.startTime).toBeCloseTo(2.433 + 0.04, 9)
  })
  it.each([
    [2, 2],
    [3, 1],
  ])("admits Peak's preliminary hit only below 2.5m (%s)", (distance, hits) => {
    const data = input([cast("Position"), cast("PeaksSpringlessSilence")])
    data.skills = { ...data.skills, Position: { castTime: 0, action: [{ type: "move", distance, time: 0 }] } }
    const row = buildRotationTimeline(data).find(row => row.step.skill === "PeaksSpringlessSilence")!
    expect(
      row.actions.filter(
        (action, index) => action.type === "damage" && row.actionStates[index]?.combatOrder !== undefined,
      ),
    ).toHaveLength(hits)
  })
  it.each([
    ["PeaksSpringlessSilence", 1.1133333333333333],
    ["PeaksSpringlessSilenceCancel", 0.557581475],
  ])("uses %s to refresh Bone and enable the five-hit pursuit", (skill, duration) => {
    const rows = buildRotationTimeline(input([cast("ForsakenFame"), cast(skill as string), cast("MoonShatterSpring")]))
    const special = rows.find(row => row.step.skill === skill)!
    const pursuit = rows.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.startTime - special.startTime).toBeCloseTo(duration as number, 9)
    expect(pursuit.buffs.get("Windrider")?.expiresAt).toBeCloseTo(special.startTime + 0.557581475 + 3, 9)
    expect(pursuit.debuffs.get("LingeringBone")?.expiresAt).toBeCloseTo(special.startTime + 0.557581475 + 5, 9)
    expect(pursuit.effectiveCastTime).toBeCloseTo(2.433, 9)
  })
  it("shares Peak cooldown across variants and does not grant Windrider on an unmarked target", () => {
    const rows = buildRotationTimeline(
      input([cast("PeaksSpringlessSilenceCancel"), cast("MoonShatterSpring"), cast("PeaksSpringlessSilence")]),
    )
    const pursuit = rows.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.buffs.has("Windrider")).toBe(false)
    expect(pursuit.effectiveCastTime).toBeCloseTo(1.557, 9)
    expect(rows.find(row => row.step.skill === "PeaksSpringlessSilence")!.startTime).toBe(12)
  })
  it("keeps the selected five-hit pursuit when Windrider expires during its cast", () => {
    const rows = buildRotationTimeline(
      input([
        cast("EmeraldBarrier"),
        { type: "event", event: "Delay", duration: 3 },
        cast("ForsakenFame"),
        cast("MoonShatterSpring"),
        cast("ForsakenFame"),
      ]),
    )
    const pursuit = rows.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.buffs.has("Windrider")).toBe(true)
    expect(pursuit.effectiveCastTime).toBeCloseTo(2.433, 9)
    expect(rows.at(-1)!.buffs.has("Windrider")).toBe(false)
    expect(rows.at(-1)!.buffs.get("StartlingSpring")?.stack).toBe(5)
  })
  it.each([
    ["EmeraldBarrierCancel", 3, 1.557],
    ["EmeraldBarrier", 5, 2.433],
  ])("selects the pursuit from Windrider after %s and buffs subsequent charged attacks", (barrier, hits, duration) => {
    const rows = buildRotationTimeline(
      input([
        cast("ForsakenFame"),
        cast(barrier as string),
        cast("MoonShatterSpring"),
        cast("ForsakenFame"),
        cast("MoonShatterSpring"),
      ]),
    )
    const pursuits = rows.filter(row => row.step.skill === "MoonShatterSpring")
    expect(
      pursuits[0].actions.filter(
        (action, index) => action.type === "damage" && pursuits[0].actionStates[index]?.combatOrder !== undefined,
      ),
    ).toHaveLength(hits as number)
    expect(pursuits[0].effectiveCastTime).toBeCloseTo(duration as number, 9)
    expect(pursuits[1].startTime - pursuits[0].startTime).toBeCloseTo(6, 9)
    const charged = rows.filter(row => row.step.skill === "ForsakenFame")[1]
    expect(charged.buffs.get("StartlingSpring")?.stack).toBe(hits)
    expect(charged.startTime).toBeCloseTo(pursuits[0].startTime + (duration as number), 9)
  })
  it.each([
    ["EmeraldBarrier", 1.02, true],
    ["EmeraldBarrierCancel", 0.167, false],
  ])("applies Jadebreak after the opening hit of %s", (skill, duration, windrider) => {
    const rows = buildRotationTimeline(input([cast(skill as string), cast("ForsakenFame")]))
    const barrier = rows.find(row => row.step.skill === skill)!
    const hit = barrier.actions.findIndex(action => action.type === "damage")
    expect(barrier.actionStates[hit].buffs.has("Jadebreak")).toBe(false)
    const next = rows.find(row => row.step.skill === "ForsakenFame")!
    expect(next.startTime).toBeCloseTo(duration as number, 9)
    expect(next.buffs.get("Jadebreak")!.expiresAt).toBeCloseTo(15.167, 9)
    expect(next.buffs.has("Windrider")).toBe(windrider)
  })
  it("shares sequential charges between full and cancelled Fan Q", () => {
    const rows = buildRotationTimeline(
      input([cast("EmeraldBarrierCancel"), cast("EmeraldBarrier"), cast("EmeraldBarrierCancel")]),
    ).filter(row => row.step.skill === "EmeraldBarrier" || row.step.skill === "EmeraldBarrierCancel")
    expect(rows.map(row => row.startTime)).toEqual([0, 0.167, 15])
  })
  it.each(["SpringSorrow", "VernalHeavy", "colorfulphoenix2"])(
    "holds %s until Flower depletes while allowing its projectiles to continue",
    skill => {
      const rows = buildRotationTimeline(input([cast("UnfadingFlowerCancel"), cast(skill), cast("ForsakenFame")], 100))
      const umbrella = rows.find(row => row.step.skill === skill)!
      const removal = rows.find(row =>
        row.actions.some(action => action.type === "consume" && action.value === "UnfadingFlowerMode"),
      )!
      expect(removal.startTime).toBeCloseTo(10.65, 8)
      expect(umbrella.startTime).toBeCloseTo(removal.startTime, 8)
      expect(umbrella.buffs.has("UnfadingFlowerMode")).toBe(false)
      expect(umbrella.resources.Blossoms).toBeCloseTo(0, 8)
      const projectiles = rows.filter(row => row.step.skill === "UnfadingFlowerProjectile")
      expect(projectiles).toHaveLength(20)
      expect(projectiles.at(-1)!.startTime).toBeCloseTo(removal.startTime, 8)
      expect(rows.at(-1)!.buffs.has("UnfadingFlowerMode")).toBe(false)
    },
  )
  it("cancels Flower at buff application and keeps its projectiles through Deflect", () => {
    const normal = buildRotationTimeline(
      input([cast("UnfadingFlower"), cast("ForsakenFame"), { type: "event", event: "Delay", duration: 1 }], 100),
    )
    const cancelled = buildRotationTimeline(
      input(
        [
          cast("UnfadingFlowerCancel"),
          cast("Deflect"),
          cast("ForsakenFame"),
          { type: "event", event: "Delay", duration: 1.193 },
        ],
        100,
      ),
    )
    const deflect = cancelled.find(row => row.step.skill === "Deflect")!
    expect(deflect.buffs.has("UnfadingFlowerMode")).toBe(true)
    expect(deflect.startTime).toBeCloseTo(0.6, 9)
    expect(
      normal.find(row => row.step.skill === "ForsakenFame")!.startTime -
        cancelled.find(row => row.step.skill === "ForsakenFame")!.startTime,
    ).toBeCloseTo(0.193, 9)
    expect(cancelled.filter(row => row.step.skill === "UnfadingFlowerVolley").map(row => row.startTime)).toEqual(
      normal.filter(row => row.step.skill === "UnfadingFlowerVolley").map(row => row.startTime),
    )
  })
  it("migrates saved Phoenix selections without losing user timing", () => {
    const rotation = migrateRotation({
      name: "Saved Jade",
      steps: [{ type: "skill", skill: "colorfulphoenix3", duration: 0.6 }],
    })
    expect(rotation.steps[0]).toMatchObject({ skill: "ColorfulPhoenix", duration: 0.6 })
    expect(migrateRotation(rotation)).toEqual(rotation)
  })
  it("applies signed Blossom events within the resource cap and preserves them through transfer", () => {
    const data = input([
      { type: "event", event: "Blossoms", before: { action: 0 }, amount: 200 },
      cast("Observe"),
      { type: "event", event: "Blossoms", startTime: 0.2, amount: -150 },
      { type: "event", event: "Blossoms", startTime: 0.4, amount: 12.5 },
    ])
    data.eventDefinitions = events
    data.resourceRegeneration = {}
    data.skills = {
      Observe: { castTime: 1, action: [0.1, 0.3, 0.5].map(time => ({ type: "damage", phyCoef: 1, time })) },
    }
    const observer = buildRotationTimeline(data).find(row => row.step.skill === "Observe")!
    expect(Object.values(observer.actionStates).map(state => state.resources.Blossoms)).toEqual([100, 0, 12.5])
    const entries = [{ id: "blossom-events", martialArts: ["vernalUmbrella" as const], rotation: data.rotation }]
    expect(JSON.parse(serializeRotationEntries(entries))[0].rotation.steps).toEqual(data.rotation.steps)
    expect(
      mergeImportedRotationEntries([], JSON.parse(exportRotationEntries(entries))).entries[0].rotation.steps,
    ).toEqual(data.rotation.steps)
  })
  it.each([true, false])("refreshes only an existing Lingering Bone mark (marked: %s)", marked => {
    const data = input(
      [
        ...(marked ? [cast("ForsakenFame")] : []),
        cast("UnfadingFlower"),
        { type: "event", event: "Delay", duration: 12 },
        cast("Observe"),
      ],
      100,
    )
    data.skills = { ...data.skills, Observe: { castTime: 0, action: [] } }
    const rows = buildRotationTimeline(data)
    const projectiles = rows.filter(row => row.step.skill === "UnfadingFlowerVolley")
    expect(projectiles.length).toBeGreaterThan(2)
    for (let index = 1; index < projectiles.length; index++) {
      const bone = projectiles[index].debuffs.get("LingeringBone")
      expect(bone?.expiresAt ?? -1).toBeCloseTo(marked ? projectiles[index - 1].startTime + 5 : -1, 9)
    }
    const grants = rows.filter(row => row.step.skill === "StarReacherGrant")
    expect(grants.length > 2).toBe(marked)
    expect((grants.at(-1)?.startTime ?? -1) > projectiles[0].startTime).toBe(marked)
    for (let index = 1; index < grants.length; index++)
      expect(grants[index].startTime - grants[index - 1].startTime).toBeGreaterThanOrEqual(1 - 1e-9)
    // The original charged-light grant has expired; projectile refreshes keep it alive.
    expect(rows.find(row => row.step.skill === "Observe")!.buffs.has("StarReacherBone")).toBe(marked)
    expect(rows.find(row => row.step.skill === "Observe")!.debuffs.has("LingeringBone")).toBe(false)
  })
  it.each(["18", "19"])(
    "maintains the Jade cycle and buffs for thirty seconds at breakthrough %s",
    async breakthrough => {
      const fixture = (await loadDpsSnapshotFixtures(breakthrough)).find(
        entry => entry.id === "silkbindJade/jade-three-rounds",
      )!
      const bundle = buildPresetRotationBundle(
        { pathId: fixture.pathId, ...fixture.fixture, rotation: fixture.rotation, skillOverrides: {}, previewId: null },
        fixture.fixture.build,
      )!
      const result = calculateRotationBaseline(bundle)
      const authoredSkills = fixture.rotation.steps.filter(step => step.type === "skill")
      for (const [index] of Array.from(authoredSkills.entries()).filter(([, step]) =>
        ["EmeraldBarrierCancel", "PeaksSpringlessSilenceCancel"].includes(step.skill ?? ""),
      ))
        expect(authoredSkills[index + 1]?.skill).toBe("MoonShatterSpring")
      for (const [index] of Array.from(authoredSkills.entries()).filter(([, step]) =>
        ["UnfadingFlowerCancel", "LeapingToad"].includes(step.skill ?? ""),
      ))
        expect(["Deflect", "EmeraldBarrier"]).toContain(authoredSkills[index + 1]?.skill)
      for (const [index, step] of authoredSkills.entries()) {
        if (!["DragonsBreath1", "DrunkenPoet5HitsCancel"].includes(step.skill ?? "")) continue
        expect([
          "Deflect",
          "EmeraldBarrier",
          "EmeraldBarrierMiss",
          "EmeraldBarrierCancel",
          "MoonShatterSpring",
        ]).toContain(authoredSkills[index + 1]?.skill)
      }
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      for (const [index, row] of Array.from(casts.entries()).filter(([, row]) =>
        ["PeaksSpringlessSilenceCancel", "EmeraldBarrierCancel", "DragonsBreath1", "DrunkenPoet5HitsCancel"].includes(
          row.step.skill ?? "",
        ),
      ))
        expect(casts[index + 1].startTime).toBeLessThanOrEqual(row.startTime + row.effectiveCastTime + 0.04 + 1e-8)
      expect(casts.slice(0, 6).map(row => row.step.skill)).toEqual([
        "DrunkenPoetDrinkCancel",
        "Deflect",
        "FluteOfTheTidesCancel",
        "Deflect",
        "GhostlyStepsUmbra",
        "EmeraldBarrier",
      ])
      for (const poet of casts.filter(row => row.step.skill === "DrunkenPoet5HitsCancel"))
        expect(poet.debuffs.has("Combustion") || poet.debuffs.has("Smolder")).toBe(true)
      const openingQ = casts.find(row => row.step.skill === "SpringSorrow")!
      const goldenBody = casts.find(row => row.step.skill === "GoldenBodyCancel")!
      const openingFanQ = casts[casts.indexOf(goldenBody) - 1]
      expect(openingFanQ.step.skill).toBe("EmeraldBarrier")
      expect(goldenBody.startTime).toBeCloseTo(openingFanQ.startTime + openingFanQ.effectiveCastTime, 9)
      expect(openingQ.startTime).toBeCloseTo(goldenBody.startTime + 0.5 + 0.04, 9)
      expect(openingQ.buffs.has("Shield")).toBe(true)
      const shieldedHit = openingQ.actionStates[0].buffs.get("Shield")
      expect(shieldedHit?.expiresAt).toBeCloseTo(goldenBody.startTime + 0.5 + 10, 8)
      const withoutShield = calculateRotationBaseline({
        ...bundle,
        timeline: {
          ...bundle.timeline,
          skills: {
            ...bundle.timeline.skills,
            GoldenBodyCancel: { ...bundle.timeline.skills.GoldenBodyCancel, action: [] },
          },
        },
      })
      expect(result.metrics.totalDamage).toBeGreaterThan(withoutShield.metrics.totalDamage)
      expect(result.duration).toBe(withoutShield.duration)
      expect(openingQ.resources.Blossoms).toBe(0)
      expect(openingQ.actionStates[0].resources.Blossoms).toBe(0)
      const flowers = casts.filter(row => row.step.skill === "UnfadingFlowerCancel")
      expect(flowers.length).toBeGreaterThanOrEqual(3)
      const flutes = casts.filter(row => row.step.skill === "FluteOfTheTidesCancel")
      expect(flutes).toHaveLength(1)
      for (const flute of flutes.slice(1)) expect(flute.buffs.has("UnfadingFlowerMode")).toBe(true)
      const fanQs = casts.filter(row => row.step.skill === "EmeraldBarrier")
      for (let index = 1; index < fanQs.length; index++) {
        expect(fanQs[index].startTime).toBeLessThan(fanQs[index - 1].startTime + 15.5)
        expect(fanQs[index].buffs.has("Jadebreak")).toBe(fanQs[index].startTime - fanQs[index - 1].startTime <= 15)
      }
      expect(result.duration).toBeCloseTo(30, 9)
      const battleEnd = result.timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")!
      expect(battleEnd.startTime - openingQ.startTime - Number(openingQ.actions[0].time)).toBeCloseTo(30, 9)
      const hits = result.timeline.flatMap(row =>
        row.actions.flatMap((action, index) =>
          action.type === "damage" && result.actionBreakdowns[`${row.id}:${index}`]
            ? [row.startTime + Number(action.time ?? 0)]
            : [],
        ),
      )
      expect(Math.max(...hits)).toBeLessThan(battleEnd.startTime)
      expect(Math.max(...hits)).toBeGreaterThan(battleEnd.startTime - 2)
      for (const flower of flowers) {
        expect(flower.resources.Blossoms).toBe(100)
        expect(flower.buffs.has("Jadebreak")).toBe(true)
        expect(flower.debuffs.has("JadeCombo")).toBe(true)
      }
      const phoenixCasts = casts.filter(row => row.step.skill === "colorfulphoenix2")
      expect(phoenixCasts.every(row => row.effectiveCastTime < 0.7442)).toBe(true)
      for (const phoenix of phoenixCasts) {
        const next = casts[casts.indexOf(phoenix) + 1]
        expect(next.step.skill).toBe("UnfadingFlowerCancel")
        expect(next.startTime).toBeCloseTo(phoenix.startTime + phoenix.effectiveCastTime + 0.04, 8)
      }
      for (const row of casts.filter(row => row.startTime > flowers[0].startTime && row.skill?.weapon === "Fan"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(true)
      for (const row of result.timeline.filter(row => row.step.type === "event" && row.step.event === "Delay"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(true)
      for (const row of casts.filter(row => row.skill?.weapon === "Umbrella"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(false)
      const qiBreak = result.timeline.find(row => row.step.event === "Qi" && row.step.targetQiRatio === 0)!
      expect(qiBreak.startTime - (openingQ.battleStartTime ?? result.timeline[0].battleStartTime ?? 0)).toBeCloseTo(
        flowers[2].startTime +
          Number(flowers[2].actions[0].time) -
          (openingQ.battleStartTime ?? result.timeline[0].battleStartTime ?? 0),
        8,
      )
      expect(flowers[2].actionStates[0].debuffs.has("Exhausted")).toBe(true)
      const firstBone = casts.find(row => ["ForsakenFame", "ForsakenFameCancel"].includes(row.step.skill ?? ""))!
      for (const row of casts.filter(row => row.startTime > firstBone.startTime))
        expect(row.debuffs.has("LingeringBone")).toBe(true)
      for (const row of result.timeline) {
        for (const [index, action] of row.actions.entries()) {
          if (action.type !== "damage" || !result.actionBreakdowns[`${row.id}:${index}`]) continue
          expect(row.step.skill === "EmeraldBarrier" || row.actionStates[index].buffs.has("Jadebreak")).toBe(true)
          if (row.startTime + Number(action.time ?? 0) <= firstBone.startTime + 1.19 + 1e-9) continue
          expect(row.actionStates[index].debuffs.has("LingeringBone")).toBe(true)
          expect(
            row.actionStates[index].buffs.has("StarReacherBone") ||
              row.actionStates[index].buffs.has("StarReacherBoneEnhanced"),
          ).toBe(true)
        }
      }
      expect(result.metrics.totalDamage).toBeGreaterThan(0)
    },
  )
  it.each([
    [1, 0.3251, 16],
    [2, 0.53, 32],
    [3, 0.7442, 40],
  ])("plays the selected %s Phoenix hits regardless of the Blossom cap", (hits, duration, gain) => {
    for (const blossoms of [0, 96, 100]) {
      const data = input(
        [cast(hits === 3 ? "ColorfulPhoenix" : "colorfulphoenix" + hits), cast("ForsakenFame")],
        blossoms,
      )
      data.resourceRegeneration = {}
      const rows = buildRotationTimeline(data)
      expect(rows[0].effectiveCastTime).toBeCloseTo(duration, 9)
      expect(rows[0].actions.filter(action => action.type === "damage")).toHaveLength(hits)
      expect(rows[1].resources.Blossoms).toBe(Math.min(100, blossoms + gain))
    }
  })

  it("adds target-check grants independently of damage hits without adding damage triggers", () => {
    const data = input([cast("ColorfulPhoenix"), cast("ForsakenFame")])
    data.resourceRegeneration = {}
    const rows = buildRotationTimeline(data)
    expect(rows[0].actions.filter(action => action.type === "damage")).toHaveLength(3)
    expect(rows[0].actions.filter(action => action.type === "addResource")).toHaveLength(10)
    expect(rows.find(row => row.step.skill === "ForsakenFame")!.resources.Blossoms).toBe(40)
  })

  it("uses accepted Q projectile timing and grants its extra Blossoms only against existing Combo", () => {
    const rows = buildRotationTimeline(input([cast("SpringSorrow"), cast("SpringSorrow"), cast("ForsakenFame")]))
    expect(rows[0].effectiveCastTime).toBeCloseTo(1.1217948717948718, 9)
    expect(rows[0].actions[0].time).toBeCloseTo(0.7779487179487179, 12)
    expect(rows[1].resources.Blossoms).toBeCloseTo(20 + 0.3 * rows[1].startTime, 8)
    expect(rows[2].resources.Blossoms).toBeCloseTo(65 + 0.3 * rows[2].startTime, 8)
  })

  it.each([
    [undefined, 1],
    ["BlossomBarrageT0", 2],
    ["BlossomBarrageT5", 2],
    ["BlossomBarrageT6", 3],
  ])("uses %s charge capacity for both cast readiness and recovery", (condition, capacity) => {
    const data = input(Array.from({ length: capacity + 1 }, () => cast("SpringSorrow")))
    data.innerWayConditions = condition ? ["BlossomBarrageT0", condition] : []
    data.innerWayRules = []
    data.skills = {
      ...data.skills,
      SpringSorrowNormal: { ...data.skills.SpringSorrowNormal, action: [] },
      SpringSorrowBarrage: { ...data.skills.SpringSorrowBarrage, action: [] },
    }
    const casts = buildRotationTimeline(data).filter(row => row.step.skill === "SpringSorrow")
    expect(casts[capacity - 1].startTime).toBeLessThan(15)
    expect(casts[capacity].startTime).toBe(15)
  })

  it.each([
    [[], 2],
    [["LingeringBone"], 4],
    [["Airborne"], 3.5],
    [["LingeringBone", "Airborne"], 3.5],
  ] as const)("refunds each UF hit independently with target marks %j", (marks, netDrain) => {
    const data = input([cast("Mark"), cast("UnfadingFlower"), { type: "event", event: "Delay", duration: 10 }], 100)
    data.skills = {
      ...data.skills,
      Mark: {
        castTime: 0,
        action: ["Exhausted", ...marks].map(value => ({
          type: "apply",
          target: "target",
          value,
          duration: 20,
          time: 0,
        })),
      },
    }
    data.setupEffects = vernal.talent[13].flatMap<EditableObject>(talent => talent.effect)
    const volleys = buildRotationTimeline(data).filter(row => row.step.skill === "UnfadingFlowerVolley")
    expect(volleys[1].resources.Blossoms).toBeCloseTo(volleys[0].resources.Blossoms - netDrain, 9)
    expect(volleys.at(-1)!.startTime).toBeGreaterThan(7)
  })

  it.each([
    [100, false, 20],
    [53, true, 25],
  ] as const)("fires only funded marked shots from %s Blossoms (exhausted=%s)", (blossoms, exhausted, expectedHits) => {
    const data = input(
      [cast("Mark"), cast("UnfadingFlowerCancel"), { type: "event", event: "Delay", duration: 14 }],
      blossoms,
    )
    data.skills = {
      ...data.skills,
      Mark: {
        castTime: 0,
        action: (exhausted ? ["LingeringBone", "Exhausted"] : ["LingeringBone"]).map(value => ({
          type: "apply",
          target: "target",
          value,
          duration: 20,
          time: 0,
        })),
      },
    }
    data.setupEffects = vernal.talent[13].flatMap<EditableObject>(talent => talent.effect)
    data.resourceRegeneration = {}
    const rows = buildRotationTimeline(data)
    const hits = rows.filter(
      row =>
        row.step.skill === "UnfadingFlowerProjectile" &&
        row.actions.some(
          (action, index) => action.type === "damage" && row.actionStates[index]?.combatOrder !== undefined,
        ),
    )
    expect(hits).toHaveLength(expectedHits)
    const lastVolley = rows.findLast(row => row.step.skill === "UnfadingFlowerVolley")!
    expect(hits.at(-1)!.startTime - lastVolley.startTime).toBeCloseTo(exhausted ? 0 : 0.15, 9)
  })

  it("uses a spare Fan Q charge to refresh Jadebreak before expiry", () => {
    const data = input([
      cast("EmeraldBarrier"),
      { type: "event", event: "Delay", duration: 10 },
      cast("EmeraldBarrier"),
      cast("EmeraldBarrier"),
    ])
    const casts = buildRotationTimeline(data).filter(row => row.step.skill === "EmeraldBarrier")
    expect(casts[1].startTime).toBeCloseTo(11.02, 9)
    expect(casts[1].buffs.has("Jadebreak")).toBe(true)
    expect(casts[2].startTime).toBeCloseTo(15, 9)
    expect(casts[2].buffs.has("Jadebreak")).toBe(true)
  })

  it("ends Unfading Flower across filler casts and refunds Blossoms after 0.2 seconds", () => {
    const rows = buildRotationTimeline(
      input([cast("UnfadingFlower"), ...Array.from({ length: 7 }, () => cast("ForsakenFame"))], 100),
    )
    const removal = rows.find(row =>
      row.actions.some(action => action.type === "consume" && action.value === "UnfadingFlowerMode"),
    )!
    expect(removal).toBeDefined()
    expect(removal.startTime).toBeGreaterThan(5)
    expect(removal.startTime).toBeLessThan(7)
    const projectiles = rows.filter(row => row.step.skill === "UnfadingFlowerProjectile")
    expect(projectiles[0].startTime).toBeCloseTo(1.15, 9)
    expect(projectiles.at(-1)!.startTime).toBeLessThanOrEqual(removal.startTime)
    expect(rows.at(-1)!.resources.Blossoms).toBeGreaterThan(15)
  })

  it("grants Thunder stacks at cast completion and spends once per damage-bonus window", () => {
    const rows = buildRotationTimeline(input([cast("EmeraldBarrier"), cast("colorfulphoenix2"), cast("ForsakenFame")]))
    expect(rows[0].actionStates[1].buffs.has("SpringThunder")).toBe(false)
    expect(rows[1].resources).toBeDefined()
    expect(rows[1].buffs.get("SpringThunder")?.stack).toBe(5)
    expect(rows[2].buffs.get("SpringThunder")?.stack).toBe(4)
  })
})
