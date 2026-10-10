import rotation from "@gamedata/rotation/bellstrike-umbra/dummy-1-min-38-bb.json"
import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { allSkillDefinitions, dotDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import {
  buildRotationTimeline,
  expandedSkillActionLayout,
  expandedSkillBaseCastTime,
  type RotationRecord,
  type RotationStep,
  type SkillRecord,
} from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { visibleTimelineEffects } from "@/rotationDisplay"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

const ways = [
  { innerWay: "SwordHorizon", tier: "T6" },
  { innerWay: "WolfchasersArt", tier: "T6" },
] as const

function run(
  steps: RotationStep[],
  bleed = 0,
  zenith = 0,
  selectedWays: typeof ways | [] = ways,
  skillOverrides: Record<string, SkillRecord> = {},
  procRoll?: (key: string) => number,
) {
  return buildRotationTimeline(
    {
      rotation: { name: "Umbra probe", ping: 0, steps: bleed ? [...casts("UmbraTestSetup"), ...steps] : steps },
      skills: {
        ...allSkillDefinitions,
        ...skillOverrides,
        UmbraTestSetup: {
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "UmbraBleeding", stack: bleed, time: 0 }],
        },
      },
      effectDefinitions,
      eventDefinitions: {},
      dots: { UmbraBleeding: dotDefinitions.UmbraBleeding },
      setupEffects: martialArtEffectsForRank(martialArtDefinitions, ["strategicSword", "heavenquakerSpear"], 13),
      weapons: ["strategicSword", "heavenquakerSpear"],
      innerWayConditions: [...innerWayConditionsFor([...selectedWays], undefined, "bellstrikeUmbra")],
      innerWayRules: innerWayEffectRulesFor([...selectedWays], 17, "bellstrikeUmbra"),
      initialBuffs: zenith ? [{ name: "SwordsZenith", stack: zenith, appliedAt: 0 }] : [],
      initialResources: { Endurance: 100, Vitality: 100 },
      resourceMaximums: { Endurance: 200, Vitality: 100 },
    },
    procRoll,
  )
}

function casts(...skills: string[]): RotationStep[] {
  return skills.map(skill => ({ type: "skill", skill }))
}

describe("Umbra draft behavior", () => {
  it("attributes composite component categories without changing damage or composite cast statistics", async () => {
    const fixtureCase = (await loadDpsSnapshotFixtures()).find(
      entry => entry.id === "bellstrikeUmbra/dummy-1-min-38-bb",
    )!
    const { fixture, pathId } = fixtureCase
    const bundle = buildPresetRotationBundle(
      {
        pathId,
        ...fixture,
        rotation: { name: "Category probe", ping: 0, steps: casts("InnerTrackSlash", "SecondTrackSlash2Casts1Hit") },
        skillOverrides: {},
        previewId: null,
      },
      fixture.build,
    )!
    const baseline = calculateRotationBaseline(bundle)
    const separated = calculateRotationBaseline({
      ...bundle,
      timeline: {
        ...bundle.timeline,
        skills: {
          ...bundle.timeline.skills,
          InnerTrackSlash: {
            ...bundle.timeline.skills.InnerTrackSlash,
            subAction: bundle.timeline.skills.InnerTrackSlash.subAction?.map(ref =>
              typeof ref === "string" ? ref : Object.assign({}, ref, { skillBreakdownCategory: undefined }),
            ),
          },
          InnerTrackSlash3: {
            ...bundle.timeline.skills.InnerTrackSlash3,
            skillBreakdownCategory: "Crisscross category probe",
          },
          SecondTrackSlash2Casts1Hit: {
            ...bundle.timeline.skills.SecondTrackSlash2Casts1Hit,
            subAction: [
              { value: "SecondTrackSlash1" },
              { value: "CrisscrossSecondTrackSlash1", skillBreakdownCategory: "Reference category probe" },
            ],
          },
          CrisscrossSecondTrackSlash1: {
            ...bundle.timeline.skills.CrisscrossSecondTrackSlash1,
            skillBreakdownCategory: "Overridden component category",
          },
        },
      },
    })
    expect(separated.metrics.totalDamage).toBe(baseline.metrics.totalDamage)
    expect(separated.metrics.breakdown.casts).toEqual(baseline.metrics.breakdown.casts)
    const group = separated.metrics.breakdown.groupedSkills.find(row => row.name === "Crisscross category probe")!
    expect(group.children?.map(row => row.id)).toEqual(["InnerTrackSlash3"])
    expect(group.hits).toBe(2)
    expect(group.damage).toBeGreaterThan(0)
    const referenceGroup = separated.metrics.breakdown.groupedSkills.find(
      row => row.name === "Reference category probe",
    )!
    expect(referenceGroup.hits).toBe(1)
    expect(referenceGroup.damage).toBeGreaterThan(0)
    expect(separated.metrics.breakdown.groupedSkills.some(row => row.name === "Overridden component category")).toBe(
      false,
    )
    expect(separated.metrics.breakdown.skills.reduce((sum, row) => sum + row.damage, 0)).toBeCloseTo(
      separated.metrics.totalDamage,
      8,
    )
  })

  it("starts the preset at full Zenith and extends Smolder on its first Blood Burst", async () => {
    const fixtureCase = (await loadDpsSnapshotFixtures()).find(
      entry => entry.id === "bellstrikeUmbra/dummy-1-min-38-bb",
    )!
    const { fixture, pathId } = fixtureCase
    const bundle = buildPresetRotationBundle(
      { pathId, ...fixture, rotation: rotation as RotationRecord, skillOverrides: {}, previewId: null },
      fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    const rows = result.timeline
    const first = rows.find(row => row.step.skill === "BloodBurstDamage")!
    expect(first.buffs.get("SwordsZenith")?.stack).toBe(5)
    const before = first.debuffs.get("Smolder")!.expiresAt!
    const next = rows.find(row => row.startTime > first.startTime && row.debuffs.has("Smolder"))!
    expect(next.debuffs.get("Smolder")!.expiresAt).toBeCloseTo(Math.min(before + 10, first.startTime + 16), 8)
  })

  it("keeps the Endurance readiness flag functional while hiding its timeline plate", () => {
    const rows = run(casts("InnerBalanceStrikeIII1"), 5)
    const special = rows.find(row => row.step.skill === "InnerBalanceStrikeIII1")!
    const effects = Array.from(special.actionStates[0].buffs.values())
    expect(effects.some(effect => effect.name === "StrategicBleedEnduranceReady")).toBe(true)
    expect(
      visibleTimelineEffects(effects, effectDefinitions).some(effect => effect.name === "StrategicBleedEnduranceReady"),
    ).toBe(false)
  })

  it("does not extend Smolder on the first two bursts before Zenith is full", () => {
    const rows = run(casts("SmolderSetup", "InnerBalanceStrikeIII2", "InnerTrackSlash1"), 4, 0, ways, {
      SmolderSetup: {
        castTime: 0,
        action: [{ type: "apply", target: "target", value: "Smolder", duration: 10, time: 0 }],
      },
    })
    const bursts = rows.filter(row => row.step.skill === "BloodBurstDamage")
    expect(bursts).toHaveLength(2)
    expect(bursts.map(row => row.buffs.get("SwordsZenith")?.stack ?? 0)).toEqual([0, 1])
    expect(rows.find(row => row.step.skill === "InnerTrackSlash1")!.debuffs.get("Smolder")?.expiresAt).toBe(10)
  })

  it("matches the confirmed special sequence: hits one and four burst from four starting stacks", () => {
    const rows = run(casts("InnerBalanceStrikeIII2", "InnerTrackSlash1"), 4)
    const special = rows.find(row => row.step.skill === "InnerBalanceStrikeIII2")!
    const checks = special.actions.flatMap((action, index) =>
      action.type === "trigger" && action.value === "StrategicSwordSpecialBloodBurst"
        ? [special.actionStates[index].debuffs.get("UmbraBleeding")?.stack]
        : [],
    )
    expect(checks).toEqual([5, 3, 4, 5])
    const bursts = rows.filter(row => row.step.skill === "BloodBurstDamage")
    expect(bursts.map(row => row.startTime)).toEqual([0.48, 1.158977982])
    const next = rows.find(row => row.step.skill === "InnerTrackSlash1")!
    expect(next.debuffs.get("UmbraBleeding")?.stack).toBe(2)
    expect(next.buffs.get("SwordsZenith")?.stack).toBe(2)
  })

  it("bursts when a Horizon hit reaches five, including the second hit of a two-hit follow-up", () => {
    const single = run(casts("CrisscrossSecondTrackSlash1", "InnerTrackSlash1"), 4)
    expect(single.filter(row => row.step.skill === "BloodBurstDamage")).toHaveLength(1)
    const two = run(casts("CrisscrossSecondTrackSlash2", "InnerTrackSlash1"), 3)
    const bursts = two.filter(row => row.step.skill === "BloodBurstDamage")
    expect(bursts).toHaveLength(1)
    expect(bursts[0].startTime).toBeCloseTo(0.68347914, 8)
    expect(two.find(row => row.step.skill === "InnerTrackSlash1")!.debuffs.get("UmbraBleeding")?.stack).toBe(2)
  })

  it("counts all direct hits inside each cast window and resets between casts", () => {
    const skill = allSkillDefinitions.SoberSorrow5Hits
    const rows = run(casts("SoberSorrow5Hits", "InnerTrackSlash1", "SoberSorrow5Hits", "InnerTrackSlash1"), 0, 0, [], {
      SoberSorrow5Hits: {
        ...skill,
        action: [...skill.action!, { type: "trigger", value: "DivinecraftSolidFoundationStrike", time: 0.6 }],
      },
    })
    const following = rows.filter(row => row.step.skill === "InnerTrackSlash1")
    expect(following.map(row => row.resources.SoberSorrowCombo)).toEqual([6, 6])
    expect(following.every(row => row.buffs.has("SpringSurge"))).toBe(true)
    expect(following.every(row => !row.buffs.has("SoberSorrowComboWindow"))).toBe(true)
  })

  it("guarantees the explicit ten-combo variant without Bleed or proc rolls", () => {
    const rows = run(casts("SoberSorrow5Hits10Combos", "InnerTrackSlash1"), 0, 0, ways, {}, () => 0.99)
    const next = rows.find(row => row.step.skill === "InnerTrackSlash1")!
    expect(next.resources.SoberSorrowCombo).toBe(10)
    expect(next.buffs.has("EmpoweredRiverFlow")).toBe(true)
    expect(next.startTime).toBeCloseTo(1.374300296, 8)
  })

  it("uses ninety-percent expected gains at four Bleed stacks and rolls them in simulation", () => {
    const steps = casts("SoberSorrow5Hits", "InnerTrackSlash1")
    const next = (rows: ReturnType<typeof run>) => rows.find(row => row.step.skill === "InnerTrackSlash1")!
    expect(next(run(steps, 4)).resources.SoberSorrowCombo).toBeCloseTo(9.5, 8)
    expect(next(run(steps, 4, 0, ways, {}, () => 0.899)).resources.SoberSorrowCombo).toBe(10)
    expect(next(run(steps, 4, 0, ways, {}, () => 0.9)).resources.SoberSorrowCombo).toBe(5)
    expect(next(run(steps, 4, 0, ways, {}, () => 0.899)).buffs.has("EmpoweredRiverFlow")).toBe(true)
    expect(next(run(steps, 4, 0, ways, {}, () => 0.9)).buffs.has("SpringSurge")).toBe(true)
  })

  it("fills Bleed with empowered Sweep All and guarantees ordinary five-hit combo", () => {
    const rows = run(
      casts("SoberSorrow5Hits10Combos", "SweepAll", "SoberSorrow5Hits", "InnerTrackSlash1"),
      0,
      0,
      ways,
      {},
      () => 0.999,
    )
    const sorrow = rows.find(row => row.step.skill === "SoberSorrow5Hits")!
    const next = rows.find(row => row.step.skill === "InnerTrackSlash1")!
    expect(sorrow.debuffs.get("UmbraBleeding")?.stack).toBe(5)
    expect(next.resources.SoberSorrowCombo).toBe(10)
    expect(next.buffs.has("EmpoweredRiverFlow")).toBe(true)
    expect(rows.some(row => row.step.skill === "BloodBurstDamage")).toBe(true)
  })

  it("selects conditional base duration without summing mutually exclusive branches", () => {
    expect(expandedSkillBaseCastTime("SweepAll", allSkillDefinitions)).toBeCloseTo(0.304, 8)
    const skills = {
      ...allSkillDefinitions,
      SweepAllRiverFlow: { ...allSkillDefinitions.SweepAllRiverFlow, castTime: 2 },
    }
    expect(expandedSkillBaseCastTime("SweepAll", skills)).toBeCloseTo(0.304, 8)
    expect(expandedSkillBaseCastTime("InnerBalanceStrikeIII2", skills)).toBeCloseTo(1.307, 8)
    expect(expandedSkillBaseCastTime("SecondTrackSlash2Casts1Hit", skills)).toBeCloseTo(1.67204647, 8)
  })

  it("reports the combined special duration consistently with the next cast", () => {
    const layout = expandedSkillActionLayout("InnerBalanceStrikeIII2", allSkillDefinitions)
    const rows = run(casts("InnerBalanceStrikeIII2", "InnerTrackSlash1"))
    expect(layout.conditional).toBe(false)
    expect(layout.castTime).toBeCloseTo(1.307, 8)
    expect(rows.find(row => row.step.skill === "InnerTrackSlash1")!.startTime).toBeCloseTo(layout.castTime, 8)
    expect(expandedSkillActionLayout("SweepAll", allSkillDefinitions).conditional).toBe(true)
  })

  it.each(["SweepAll", "SweepAllWaterDrop", "SweepAllSpringSurge", "SweepAllRiverFlow"])(
    "times %s's one hit and following cast at the selected cancel boundary",
    skill => {
      const rows = run(casts(skill, "InnerTrackSlash1"))
      const sweep = rows.find(row => row.step.skill === skill)!
      expect(sweep.actions.filter(action => action.type === "damage")).toHaveLength(1)
      expect(sweep.resourceConsumption?.Endurance).toBe(40)
      expect(rows.find(row => row.step.skill === "InnerTrackSlash1")!.resources.Endurance).toBe(60)
      expect(sweep.actions.find(action => action.type === "damage")!.time).toBeCloseTo(0.304, 8)
      expect(rows.find(row => row.step.skill === "InnerTrackSlash1")!.startTime).toBeCloseTo(0.304, 8)
    },
  )

  it("resolves timed Sober Sorrow hits and its full or five-hit cancel boundary", () => {
    const rows = run(casts("SoberSorrow5Hits", "SoberSorrow", "InnerTrackSlash1"))
    const castsOnly = rows.filter(
      row =>
        row.step.type === "skill" && ["SoberSorrow5Hits", "SoberSorrow", "InnerTrackSlash1"].includes(row.step.skill!),
    )
    expect(castsOnly[1].startTime).toBeCloseTo(1.374300296, 8)
    expect(castsOnly[2].startTime).toBeCloseTo(3.370300296, 8)
    const hits = castsOnly[1].actions.filter(action => action.type === "damage")
    expect(hits).toHaveLength(6)
    expect(hits[0].time).toBeCloseTo(0.232051435, 8)
    expect(hits[5].time).toBeCloseTo(1.640357722, 8)
  })

  it("preserves charge and follow-up hits, burst state and resources when merged", () => {
    const separate = run(casts("SecondTrackSlash1", "CrisscrossSecondTrackSlash1", "InnerTrackSlash1"), 5, 1)
    const merged = run(casts("SecondTrackSlash2Casts1Hit", "InnerTrackSlash1"), 5, 1)
    const hits = (rows: typeof separate) =>
      rows.flatMap(row =>
        row.kind === "dot"
          ? []
          : row.actions
              .filter(action => action.type === "damage")
              .map(action => ({ time: row.startTime + Number(action.time), coefficient: action.phyCoef })),
      )
    expect(hits(merged)).toEqual(hits(separate))
    const observe = (rows: typeof separate) => rows.find(row => row.step.skill === "InnerTrackSlash1")!
    expect(observe(merged).resources).toEqual(observe(separate).resources)
    const debuffState = (rows: typeof separate) =>
      Array.from(observe(rows).debuffs.values(), ({ sourceRowId: _sourceRowId, ...effect }) => effect)
    expect(debuffState(merged)).toEqual(debuffState(separate))
    const buffState = (rows: typeof separate) =>
      Array.from(observe(rows).buffs.values(), ({ name, stack, appliedAt, expiresAt }) => ({
        name,
        stack,
        appliedAt,
        expiresAt,
      }))
    expect(buffState(merged)).toEqual(buffState(separate))
  })

  it.each([0, 1])("runs charge drain and recovery across battle anchor %s", anchorStep => {
    const rows = buildRotationTimeline({
      rotation: {
        name: "Precombat Endurance",
        ping: 0,
        start: { step: anchorStep, action: anchorStep === 0 ? 1 : 2 },
        steps: casts("SecondTrackSlash1", "Observe"),
      },
      skills: {
        ...allSkillDefinitions,
        Observe: { castTime: 0.553, action: [0, 0.253, 0.553].map(time => ({ type: "damage", phyCoef: 1, time })) },
      },
      effectDefinitions,
      eventDefinitions: {},
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["strategicSword", "heavenquakerSpear"],
      initialResources: { Endurance: 80 },
      resourceMaximums: { Endurance: 100 },
      resourceRegeneration: { Endurance: 10 },
      resourceSpendRegenDelay: { Endurance: 1.2 },
    })
    const observe = rows.find(row => row.step.skill === "Observe")!
    // Pre-charge recovers 2; charging drains 4.2 and recovers 0.0003;
    // the direct 6 spend blocks recovery through absolute time 1.7.
    expect(observe.actionStates[0].resources.Endurance).toBeCloseTo(71.8003, 8)
    expect(observe.actionStates[1].resources.Endurance).toBeCloseTo(71.8003, 8)
    expect(observe.actionStates[2].resources.Endurance).toBeCloseTo(74.8003, 8)
  })

  it("drains 22.8 Endurance over a full 1.2-second charge hold", () => {
    const rows = run(casts("SecondTrackSlash1", "InnerTrackSlash1"), 0, 0, ways, {
      SecondTrackSlashCharge: { ...allSkillDefinitions.SecondTrackSlashCharge, castTime: 1.2 },
    })
    const next = rows.find(row => row.step.type === "skill" && row.step.skill === "InnerTrackSlash1")!
    expect(next.resources.Endurance).toBeCloseTo(77.2012, 8)
    expect(next.startTime).toBeCloseTo(2.347, 8)
  })

  it("spends the minimum charge cost and pays each special route once without enforcing its minimum", () => {
    const rows = run(
      casts("SecondTrackSlash1", "InnerBalanceStrikeIII2", "InnerBalanceStrikeIII1", "InnerBalanceStrikeIII1"),
    )
    const authored = rows.filter(
      row =>
        row.step.type === "skill" &&
        ["SecondTrackSlash1", "InnerBalanceStrikeIII2", "InnerBalanceStrikeIII1"].includes(row.step.skill!),
    )
    expect(authored[0].resourceConsumption?.Endurance).toBe(6)
    expect(authored[1].resources.Endurance).toBeCloseTo(89.8003, 8)
    const damage = authored[0].actions.find(action => action.type === "damage")!
    expect(damage.time).toBeCloseTo(0.595977982, 8)
    expect(authored[1].startTime).toBeCloseTo(1.447, 8)
    expect(authored[1].resourceConsumption?.Endurance).toBe(40)
    expect(authored[2].resourceConsumption?.Endurance).toBe(40)
    expect(authored).toHaveLength(4)
    expect(authored[3].resources.Endurance).toBeLessThan(50)
  })

  it("applies Soul-Shaken's empowered DOT multiplier through the centralized damage calculation", async () => {
    const fixtureCase = (await loadDpsSnapshotFixtures()).find(
      entry => entry.id === "bellstrikeUmbra/dummy-1-min-38-bb",
    )!
    const { fixture, pathId } = fixtureCase
    const bundle = buildPresetRotationBundle(
      {
        pathId,
        ...fixture,
        rotation: { name: "High Bleed damage probe", ping: 0, steps: casts("Probe") },
        skillOverrides: {},
        previewId: null,
      },
      fixture.build,
    )!
    const total = (tags: string[], soulShaken: boolean) =>
      calculateRotationBaseline({
        ...bundle,
        timeline: {
          ...bundle.timeline,
          initialDebuffs: soulShaken ? [{ name: "SoulShaken", stack: 5 }] : [],
          skills: {
            ...bundle.timeline.skills,
            Probe: {
              castTime: 1,
              martialArt: "strategicSword",
              tags,
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
            },
          },
        },
      }).actionBreakdowns["rotation-0:0"].total
    const tags = ["StrategicSword", "Bleed", "MartialArtEffect"]
    expect(total(tags, true)).toBe(total(tags, false))
    const dotTags = [...tags, "DirectDamage"]
    const highTags = [...dotTags, "HighBleed"]
    const ordinaryGain = total(dotTags, true) - total(dotTags, false)
    const highGain = total(highTags, true) - total(highTags, false)
    expect(ordinaryGain).toBe(0)
    expect(highGain).toBeGreaterThan(0)
    expect(total(highTags, true) / total(highTags, false)).toBeCloseTo(1.5, 8)
  })

  it.each([3, 4, 5])("refunds one special detonation per cast starting at %s Bleed stacks", bleed => {
    for (const skill of ["InnerBalanceStrikeIII1", "InnerBalanceStrikeIII2"]) {
      const rows = run(casts(skill, "Observe"), bleed, 1, ways, { Observe: { castTime: 0, action: [] } })
      const refunds = rows.filter(row => row.step.skill === "StrategicSwordSpecialBloodBurst")
      const accepted = refunds.flatMap(row =>
        row.actions.filter(
          (action, index) => action.type === "addResource" && row.actionStates[index]?.combatOrder !== undefined,
        ),
      )
      const refundsExpected = skill === "InnerBalanceStrikeIII2" && bleed >= 4 ? 2 : 1
      expect(accepted).toHaveLength(refundsExpected)
      expect(rows.find(row => row.step.skill === "Observe")!.resources.Endurance).toBe(
        60 + refundsExpected * 10 + (skill === "InnerBalanceStrikeIII2" ? 8 : 0),
      )
    }
  })

  it("preserves separate-cast refunds when the two special casts share one composite row", () => {
    const override = { Observe: { castTime: 0, action: [] } }
    const merged = run(casts("InnerBalanceStrikeIII2", "Observe"), 4, 1, ways, override)
    const separate = run(
      casts("InnerBalanceStrikeIII1ThreeHits", "CrisscrossInnerBalanceStrikeIIICancel", "Observe"),
      4,
      1,
      ways,
      override,
    )
    const observe = (rows: typeof merged) => rows.find(row => row.step.skill === "Observe")!
    expect(observe(merged).resources.Endurance).toBe(88)
    expect(observe(merged).resources.Endurance).toBe(observe(separate).resources.Endurance)
    expect(observe(merged).startTime).toBe(observe(separate).startTime)
  })

  it("does not refund a charged follow-up burst using readiness left by a non-detonating special", () => {
    const rows = run(casts("InnerBalanceStrikeIII1", "CrisscrossSecondTrackSlash1", "Observe"), 0, 1, ways, {
      Observe: { castTime: 0, action: [] },
    })
    expect(rows.filter(row => row.step.skill === "BloodBurst")).toHaveLength(1)
    expect(rows.filter(row => row.step.skill === "StrategicSwordSpecialBloodBurst")).toHaveLength(0)
    expect(rows.find(row => row.step.skill === "Observe")!.resources.Endurance).toBe(68)
  })

  it("restores talent Endurance once even when two special hits burst in the same cast", () => {
    const rows = run(casts("InnerBalanceStrikeIII1", "SecondTrackSlash1"), 5, 1)
    expect(rows.filter(row => row.step.type === "skill" && row.step.skill === "BloodBurst")).toHaveLength(2)
    const charge = rows.find(row => row.step.type === "skill" && row.step.skill === "SecondTrackSlash1")!
    expect(charge.actionStates[0].resources?.Endurance).toBeCloseTo(65.8003, 8)
  })

  it("extends retained Bleed at full Zenith while capping its remaining lifetime", () => {
    const rows = run(casts("CrisscrossSecondTrackSlash1", "SecondTrackSlash1"), 5, 5)
    const charge = rows.find(row => row.step.type === "skill" && row.step.skill === "SecondTrackSlash1")!
    expect(charge.debuffs.get("UmbraBleeding")?.expiresAt).toBeCloseTo(16.22504647, 8)
  })

  it("reschedules extended Smolder ticks only through the capped expiry", () => {
    const rows = buildRotationTimeline({
      rotation: { name: "Horizon extension probe", ping: 0, steps: casts("Setup", "BloodBurstDamage", "Wait") },
      skills: {
        ...allSkillDefinitions,
        Setup: { castTime: 0, action: [{ type: "apply", target: "target", value: "Smolder", duration: 10, time: 0 }] },
        Wait: { castTime: 20, action: [] },
      },
      effectDefinitions,
      dots: { Smolder: effectDefinitions.Smolder },
      eventDefinitions: {},
      setupEffects: [],
      innerWayRules: [],
      weapons: ["strategicSword", "heavenquakerSpear"],
      initialBuffs: [{ name: "SwordsZenith", stack: 5, appliedAt: 0 }],
      innerWayConditions: [...innerWayConditionsFor([...ways], undefined, "bellstrikeUmbra")],
    })
    const ticks = rows.filter(row => row.kind === "dot")
    expect(ticks).toHaveLength(31)
    expect(ticks.at(-1)?.startTime).toBeCloseTo(15.84, 10)
    expect(ticks.every(row => row.startTime <= 16)).toBe(true)
  })

  it("keeps the confirmed special prefix and distinguishes charged follow-up cancel variants", () => {
    const rows = run(
      casts(
        "InnerBalanceStrikeIII2",
        "CrisscrossSecondTrackSlash1",
        "CrisscrossSecondTrackSlash2",
        "SecondTrackSlash1",
      ),
    )
    const authored = rows.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(authored.slice(0, 3).map(row => row.actions.filter(action => action.type === "damage").length)).toEqual([
      4, 1, 2,
    ])
    expect(authored[1].startTime - authored[0].startTime).toBeCloseTo(1.307, 8)
    expect(authored[1].debuffs.get("UmbraBleeding")?.stack).toBe(4)
    expect(authored[2].startTime - authored[1].startTime).toBeCloseTo(0.22504647, 8)
    expect(authored[3].startTime - authored[2].startTime).toBeCloseTo(0.68347914, 8)
  })

  it("cancels QQQ immediately after both third-cast hits without dropping either hit", () => {
    const normal = run(casts("InnerTrackSlash", "Observe"), 0, 0, ways, { Observe: { castTime: 0, action: [] } })
    const cancelled = run(casts("InnerTrackSlashCancel", "Observe"), 0, 0, ways, {
      Observe: { castTime: 0, action: [] },
    })
    const q = cancelled.find(row => row.step.skill === "InnerTrackSlashCancel")!
    const hits = q.actions.filter(action => action.type === "damage")
    expect(hits).toHaveLength(7)
    expect(hits.map(action => action.time)).toEqual(
      normal
        .find(row => row.step.skill === "InnerTrackSlash")!
        .actions.filter(action => action.type === "damage")
        .map(action => action.time),
    )
    expect(cancelled.find(row => row.step.skill === "Observe")!.startTime).toBeCloseTo(Number(hits.at(-1)!.time), 10)
    expect(q.effectiveCastTime).toBeCloseTo(2.510104707, 10)
    expect(expandedSkillBaseCastTime("InnerTrackSlashCancel", allSkillDefinitions)).toBeCloseTo(2.510104707, 10)
  })

  it("advances all three Q animation clocks and resolves both Horizon hits before the next cast", () => {
    const rows = run(casts("InnerTrackSlash", "SecondTrackSlash1"))
    const q = rows.find(row => row.step.type === "skill" && row.step.skill === "InnerTrackSlash")!
    const charge = rows.find(row => row.step.type === "skill" && row.step.skill === "SecondTrackSlash1")!
    expect(charge.startTime - q.startTime).toBeCloseTo(2.7484, 8)
    const hits = q.actions.filter(action => action.type === "damage")
    expect(hits).toHaveLength(7)
    expect(hits.every(action => typeof action.phyCoef === "number" && action.phyCoef > 0)).toBe(true)
    const expectedTimes = [
      0.17471346000000001, 0.3904248768, 0.684907836, 0.8673584592, 1.0113996264, 1.850357654, 2.510104707,
    ]
    hits.forEach((action, index) => expect(action.time).toBeCloseTo(expectedTimes[index], 8))
  })

  it("calculates nonzero Blood Burst damage through the shared preset pipeline", async () => {
    const fixtureCase = (await loadDpsSnapshotFixtures()).find(
      entry => entry.id === "bellstrikeUmbra/dummy-1-min-38-bb",
    )!
    const { fixture, pathId } = fixtureCase
    const bundle = buildPresetRotationBundle(
      { pathId, ...fixture, rotation: fixtureCase.rotation, skillOverrides: {}, previewId: null },
      fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    expect(result.duration).toBeCloseTo(60, 8)
    for (const id of ["Hawkwing", "Concentration", "EmpoweredRiverFlow"]) {
      const coverage = result.metrics.breakdown.buffCoverage.find(row => row.id === id)
      expect(coverage?.averageStacks).toBeGreaterThan(0)
      expect(coverage!.averageStacks).toBeLessThanOrEqual(effectDefinitions[id].maxStack!)
    }
    const comboWindows = result.timeline
      .flatMap(row => [...row.buffs.values()])
      .filter(effect => effect.name === "SoberSorrowComboWindow")
    expect(comboWindows.length).toBeGreaterThan(0)
    expect(visibleTimelineEffects(comboWindows, effectDefinitions)).toEqual([])
    const authoredCasts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const exhaustCast = authoredCasts[34]
    expect(exhaustCast.step.skill).toBe("InnerBalanceStrikeIII2")
    const lastHit = exhaustCast.actions.findLastIndex(action => action.type === "damage")
    const breakTime = exhaustCast.startTime + Number(exhaustCast.actions[lastHit].time)
    const qiRows = result.timeline.filter(row => row.step.type === "event" && row.step.event === "Qi")
    const breakRow = qiRows.find(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
    )!
    expect(breakRow.sourceRowId).toBe(exhaustCast.id)
    expect(breakRow.startTime).toBeCloseTo(breakTime, 8)
    const relativeBreak = breakTime - result.anchorTime
    expect(qiRows.map(row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio)).toEqual([
      0.5999, 0.3999, 0, 0.5999,
    ])
    expect(qiRows.map(row => row.startTime - result.anchorTime)).toEqual(
      expect.arrayContaining([
        expect.closeTo(relativeBreak * 0.4, 8),
        expect.closeTo(relativeBreak * 0.6, 8),
        expect.closeTo(relativeBreak, 8),
        expect.closeTo(relativeBreak + 14 + relativeBreak * 0.4, 8),
      ]),
    )
    const afterRecovery = authoredCasts.find(row => row.startTime > breakTime + 10)!
    expect(afterRecovery.targetQiRatio).toBe(1)
    expect(afterRecovery.debuffs.has("Exhausted")).toBe(false)
    const duringExhaust = authoredCasts.find(row => row.startTime > breakTime && row.startTime < breakTime + 10)!
    expect(duringExhaust.debuffs.get("Exhausted")!.expiresAt).toBeCloseTo(breakTime + 10, 8)
    expect(result.metrics.totalDamage).toBeGreaterThan(0)
    const ordinary = result.timeline.filter(
      row => row.kind === "rotation" && ["SoberSorrow", "SoberSorrow5Hits"].includes(row.step.skill!),
    )
    expect(ordinary).toHaveLength(3)
    expect(
      ordinary
        .filter(row => row.step.skill === "SoberSorrow5Hits")
        .every(row => row.debuffs.get("UmbraBleeding")?.stack === 5),
    ).toBe(true)
    const full = ordinary.find(row => row.step.skill === "SoberSorrow")!
    expect(full.debuffs.get("UmbraBleeding")?.stack).toBe(5)
    expect(full.actionStates[full.actions.length - 1].resources?.SoberSorrowCombo).toBeGreaterThanOrEqual(10)
    const bursts = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "BloodBurstDamage")
    const sweeps = result.timeline.filter(row => row.kind === "rotation" && row.step.skill === "SweepAll")
    const secondSweepBurst = bursts.find(row => row.sourceRowId === sweeps[1].id)!
    const firstSweepBurst = bursts.find(row => row.sourceRowId === sweeps[0].id)!
    expect(secondSweepBurst).toBeDefined()
    expect(secondSweepBurst.startTime - firstSweepBurst.startTime).toBeGreaterThanOrEqual(12)
    const firstQ = result.timeline.find(row => row.kind === "rotation" && row.step.skill === "InnerTrackSlashCancel")!
    const ghostly = result.timeline.find(row => row.kind === "rotation" && row.step.skill === "GhostlyStepsUmbra")!
    expect(ghostly.rotationIndex).toBe(firstQ.rotationIndex! + 1)
    expect(ghostly.startTime - firstQ.startTime).toBeCloseTo(firstQ.effectiveCastTime + 0.04, 8)
    expect(secondSweepBurst.buffs.get("SwordsZenith")?.stack).toBe(4)
    const thirdSweepBurst = bursts.find(row => row.sourceRowId === sweeps[2].id)!
    const fourthSweepBurst = bursts.find(row => row.sourceRowId === sweeps[3].id)!
    expect(fourthSweepBurst).toBeDefined()
    expect(fourthSweepBurst.startTime - thirdSweepBurst.startTime).toBeGreaterThanOrEqual(12)
    const fifthSweepBurst = bursts.find(row => row.sourceRowId === sweeps[4].id)!
    expect(fifthSweepBurst).toBeDefined()
    expect(fifthSweepBurst.startTime - fourthSweepBurst.startTime).toBeGreaterThanOrEqual(12)
    const firstSpecial = result.timeline.find(
      row => row.kind === "rotation" && row.step.skill === "InnerBalanceStrikeIII2",
    )!
    expect(bursts.filter(row => row.sourceRowId === firstSpecial.id)).toHaveLength(2)
    expect(bursts).toHaveLength(38)
    const specialRefunds = result.timeline.flatMap(row =>
      row.step.skill === "StrategicSwordSpecialBloodBurst"
        ? row.actions.filter(
            (action, index) => action.type === "addResource" && row.actionStates[index]?.combatOrder !== undefined,
          )
        : [],
    )
    expect(specialRefunds).toHaveLength(21)
    expect(bursts.every(row => (result.actionBreakdowns[`${row.id}:0`]?.total ?? 0) > 0)).toBe(true)
  })

  it("executes the source-backed five sword Q hits before the Horizon follow-up burst", () => {
    const rows = run(casts("InnerTrackSlash", "SecondTrackSlash1"))
    const bursts = rows.filter(row => row.step.type === "skill" && row.step.skill === "BloodBurst")
    expect(bursts).toHaveLength(1)
    expect(bursts[0].debuffs.get("UmbraBleeding")?.stack).toBe(5)
    const charge = rows.find(row => row.step.type === "skill" && row.step.skill === "SecondTrackSlash1")!
    expect(charge.debuffs.get("UmbraBleeding")?.stack).toBe(3)
    expect(charge.buffs.get("SwordsZenith")?.stack).toBe(1)
  })

  it("retains two Bleed stacks with existing Zenith and resets full Zenith to 40 Spirit at T6", () => {
    const rows = run(casts("CrisscrossSecondTrackSlash1", "SecondTrackSlash1"), 5, 5)
    const charge = rows.find(row => row.step.type === "skill" && row.step.skill === "SecondTrackSlash1")!
    expect(charge.debuffs.get("UmbraBleeding")?.stack).toBe(2)
    expect(charge.buffs.get("SwordsZenith")?.stack).toBe(2)
    expect(charge.actionStates[0].resources?.Endurance).toBeCloseTo(103.8003, 8)
  })

  it("does not create a Horizon burst when the Inner Way is removed", () => {
    expect(
      run(casts("CrisscrossSecondTrackSlash1"), 5, 0, []).some(
        row => row.step.type === "skill" && row.step.skill === "BloodBurst",
      ),
    ).toBe(false)
  })

  it("applies Wine Gu after three Sober Sorrow hits and Soul-Shaken after every hit", () => {
    const rows = run(casts("SoberSorrow5Hits", "SecondTrackSlash1"))
    const charge = rows.find(row => row.step.type === "skill" && row.step.skill === "SecondTrackSlash1")!
    expect(charge.debuffs.get("SoulShaken")?.stack).toBe(5)
    expect(charge.debuffs.get("WineGu")?.expiresAt).toBeCloseTo(16.374300296, 8)
  })

  it("resolves every authored draft step and honors the sixty-second encounter end", () => {
    const draft = rotation as RotationRecord
    const rows = buildRotationTimeline({
      rotation: draft,
      skills: allSkillDefinitions,
      effectDefinitions,
      eventDefinitions: rotationEventDefinitions,
      dots: {},
      setupEffects: [],
      weapons: ["strategicSword", "heavenquakerSpear"],
      innerWayConditions: [...innerWayConditionsFor([...ways], undefined, "bellstrikeUmbra")],
      innerWayRules: innerWayEffectRulesFor([...ways], 17, "bellstrikeUmbra"),
    })
    const missingSkills = draft.steps.flatMap(step =>
      step.type === "skill" && !allSkillDefinitions[step.skill!] ? [step.skill] : [],
    )
    expect(missingSkills).toEqual([])
    expect(rows[0].timelineEndTime! - rows[0].battleStartTime!).toBeCloseTo(60, 8)
  })
})
