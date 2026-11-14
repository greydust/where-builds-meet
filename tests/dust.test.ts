import assert from "node:assert/strict"

import buffsJson from "@gamedata/buff/bamboocut-dust.json"
import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { effectForSoloLevel } from "@/data/soloLevelEffects"
import { weaponSetDefinitions } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
const buffs = asEffectDefinitions(buffsJson)
import mysticBuffsJson from "@gamedata/buff/mystic.json"
const mysticBuffs = asEffectDefinitions(mysticBuffsJson)
import debuffsJson from "@gamedata/debuff/bamboocut-dust.json"
const debuffs = asEffectDefinitions(debuffsJson)

import light from "@gamedata/innerway/light-anew.json"
import phantom from "@gamedata/innerway/phantom-rally.json"
import song from "@gamedata/innerway/song-of-tang.json"
import towline from "@gamedata/innerway/towline-sweep.json"
import pathData from "@gamedata/path.json"
import dustPhantomChimeRotation from "@gamedata/rotation/bamboocut-dust/dust-dummy-1-min-100pc.json"
import defaultDustRotation from "@gamedata/rotation/bamboocut-dust/dust-dummy-1-min.json"
import umbrellaJson from "@gamedata/skill/everspring-umbrella.json"
const umbrella = asSkillRecords(umbrellaJson)
import generalJson from "@gamedata/skill/general.json"
const general = asSkillRecords(generalJson)
import mysticJson from "@gamedata/skill/mystic.json"
const mystic = asSkillRecords(mysticJson)
import ropeJson from "@gamedata/skill/unfettered-rope-dart.json"
const rope = asSkillRecords(ropeJson)
import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { buildPresetRotationBundle } from "@/application/graduation"
import {
  calculateRotationBaseline,
  type RotationDamageEntry,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { TIMELINE_TIME_EPSILON, type InnerWayEffectRule, type EditableObject } from "@/calculations/rotationTimeline"
import type { RotationRecord, RotationStep, SkillRecord, TimelineRow } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"

import { castStep, delayStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
// Select the stage rows separately from their Resonance attacks.
const rotationRecord = defaultDustRotation as RotationRecord
// A skill step's own fields, so a rotation's cast durations and break flags read
// off the steps the spec filtered to casts.
const castsOf = (steps: RotationStep[], skill: string) =>
  steps.filter(
    (step): step is Extract<RotationStep, { type: "skill" }> => step.type === "skill" && step.skill === skill,
  )
const isThrow = (row: TimelineRow) => /^ScarletSpinStage\d$/.test(row.step.skill ?? "")
const isCatch = (row: TimelineRow) => row.step.skill === "EverspringPerfectCatch"
// A skill record carries its actions untyped; the specs read them as editable objects.
const skillActions = (record: SkillRecord): EditableObject[] => (record.action ?? []) as EditableObject[]
// Resolve the action state that observes an effect by name, so adding actions does
// not shift assertions. Row.actionStates holds pre-action snapshots, so the state
// that sees the effect applied is the one after its action.
const stateAfterEffect = (row: TimelineRow, skill: string, effect: string) => {
  const index = skillActions(umbrella[skill]).findIndex(action => action.value === effect && action.type !== "consume")
  expect(index).toBeGreaterThanOrEqual(0)
  return row.actionStates?.[index + 1]
}
const catalogs = { SongOfTang: song, PhantomRally: phantom, TowlineSweep: towline, LightAnew: light }
function bundle(selected: Partial<Record<keyof typeof catalogs, number>> = {}): RotationSimulationBundle {
  const rules: InnerWayEffectRule[] = []
  const conditions: string[] = []
  for (const [id, tier] of Object.entries(selected)) {
    const tiers = catalogs[id as keyof typeof catalogs].effect as Record<
      string,
      { effect?: EditableObject[]; trigger?: EditableObject[] }
    >
    for (let n = 0; n <= tier; n++) {
      conditions.push(`${id}T${n}`)
      const entry = tiers[`${id}T${n}`]
      for (const effect of entry.effect ?? [])
        rules.push({ ...effect, effect: (effect.effect ?? {}) as EditableObject, source: id, tier: n })
      for (const trigger of entry.trigger ?? [])
        rules.push({ requirement: trigger.requirement, trigger, effect: {}, source: id, tier: n })
    }
  }
  return {
    timeline: {
      rotation: { name: "Dust behavior", steps: [] },
      skills: {
        ...umbrella,
        ...rope,
        Hit: {
          name: "Hit",
          castTime: 1,
          tags: ["MartialArts", "MartialArt", "DirectDamage"],
          action: [{ type: "damage", time: 0, phyCoef: 1, attrCoef: 0 }],
        },
        Mark: {
          name: "Mark",
          castTime: 0,
          action: [
            { type: "apply", target: "target", value: "Soulbreak", time: 0 },
            { type: "apply", target: "self", value: "SoulReturn", time: 0 },
          ],
        },
        Resonate: {
          name: "Resonate",
          castTime: 1,
          tags: ["MartialArts", "MartialArtEffect", "PhantomResonance"],
          action: [{ type: "damage", phyCoef: 1.08, attrCoef: 1.08, time: 0 }],
        },
        Catch: { name: "Catch", castTime: 1, tags: ["EverspringUmbrella", "PerfectCatch"], action: [] },
        Candle: {
          name: "Candle",
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Candlelight", stack: 5, time: 0 }],
        },
      },
      effectDefinitions: { ...buffs, ...debuffs },
      maxHP: 10000,
      dots: {},
      eventDefinitions: {
        SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }] },
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] },
      },
      weapons: ["everspring", "unfettered"],
      innerWayConditions: conditions,
      innerWayRules: rules,
      setupEffects: [],
    },
    startAnchor: { rowId: "rotation-0" },
    stats: { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, crit: 1, maxHp: 10000, critDmgBonus: 0.5 },
    enemy: {
      name: "Dust target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["everspring", "unfettered"],
    attunement: emptyAttunementStats,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}
function stacks(result: ReturnType<typeof calculateRotationBaseline>, name: string) {
  return result.timeline
    .filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    .map(row => row.actionStates?.[0].buffs.get(name)?.stack ?? 0)
}

describe("Dust mechanics", () => {
  it.each([13, 14, 15])("limits rank %s umbrella channel scaling to Martial Art contexts in whole steps", rank => {
    const rules = martialArtEffectsForRank(martialArtDefinitions, ["everspring"], rank).filter(rule => {
      const effect = (rule as EditableObject).effect as EditableObject | undefined
      return (effect?.stat as EditableObject | undefined)?.physDmgBonus !== undefined
    })
    expect(rules).toHaveLength(1)
    for (const [skill, qualifies] of [
      ["ScarletSpinStage1", true],
      ["Resonance", true],
      ["DreamwroughtBubbles", false],
      ["BubblesResonance", false],
    ] as const) {
      for (const [attack, expected] of [
        [62.499, 0],
        [62.5, 0.01],
        [124.999, 0.01],
        [125, 0.02],
        [749.999, 0.11],
        [750, 0.12],
        [1000, 0.12],
      ]) {
        const calculate = (enabled: boolean) => {
          const input = bundle()
          input.stats.minPhys = attack
          input.stats.maxPhys = attack
          input.timeline.setupEffects = enabled ? rules : []
          input.timeline.rotation.steps = [castStep(skill), delayStep(3)]
          return calculateRotationBaseline(input)
        }
        const base = calculate(false)
        const boosted = calculate(true)
        expect(boosted.baseline.length).toBeGreaterThan(0)
        for (const entry of boosted.baseline) {
          const bonus = qualifies ? expected : 0
          expect(entry.context.stats.physDmgBonus).toBeCloseTo(bonus, 12)
          expect(entry.context.stats.bamboocutDmgBonus).toBeCloseTo(bonus, 12)
          expect(boosted.actionBreakdowns[entry.id!].total / base.actionBreakdowns[entry.id!].total).toBeCloseTo(
            1 + bonus,
            10,
          )
        }
      }
    }
  })
  it("applies Bubbles' non-player target correction to both release hits independently of Category 1", () => {
    const calculate = (withoutBonus: boolean) => {
      const input = bundle()
      input.stats.allMartialArts = 0.2
      input.timeline.skills = structuredClone(input.timeline.skills)
      if (withoutBonus) input.timeline.skills.DreamwroughtBubblesRelease.modifier = []
      input.timeline.rotation.steps = [castStep("DreamwroughtBubbles"), delayStep(1)]
      const result = calculateRotationBaseline(input)
      return result.baseline
        .filter(entry => entry.action.type === "damage")
        .map(entry => result.actionBreakdowns[entry.id!].total)
    }
    const base = calculate(true)
    const boosted = calculate(false)
    expect(base).toHaveLength(2)
    expect(boosted).toHaveLength(2)
    boosted.forEach((damage, index) => expect(damage / base[index]).toBeCloseTo(1.2, 10))
  })
  it.each([
    { tier: 0, count: undefined, active: false },
    { tier: 0, count: 2, active: false },
    { tier: 0, count: 3, active: true },
    { tier: 3, count: 2, active: false },
    { tier: 4, count: 1, active: false },
    { tier: 4, count: 2, active: true },
  ])("Light Anew T$tier uses enemy count $count independently of party size", ({ tier, count, active }) => {
    const input = bundle({ LightAnew: tier })
    input.timeline.rotation.enemyCount = count
    input.timeline.rotation.groupSize = 10
    input.timeline.rotation.steps = [castStep("Hit"), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].debuffs.has("Candlelight")).toBe(false)
    expect(hits[1].actionStates[0].debuffs.get("Candlelight")?.stack ?? 0).toBe(Number(active))
    const amounts = hits.map(row => result.actionBreakdowns[`${row.id}:0`].total)
    expect(amounts[1] / amounts[0]).toBeCloseTo(active ? 1.02 : 1)
  })
  it("rate-limits automatic Candlelight applications, caps stacks, and expires them", () => {
    const input = bundle({ LightAnew: 4 })
    input.timeline.rotation.enemyCount = 2
    input.timeline.skills.Hit.castTime = 0.25
    input.timeline.rotation.steps = [
      ...Array.from({ length: 12 }, () => castStep("Hit")),
      delayStep(5),
      castStep("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits.map(row => row.actionStates[0].debuffs.get("Candlelight")?.stack ?? 0)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 0,
    ])
  })
  it("adds Candlelight to Category 1 and retains it between 3 and 3.1 seconds", () => {
    const input = bundle()
    input.stats.allMartialArts = 0.2
    input.timeline.skills.Hit.tags = ["MartialArts", "DirectDamage"]
    input.timeline.skills.Hit.castTime = 0
    input.timeline.rotation.steps = [
      castStep("Hit"),
      castStep("Candle"),
      delayStep(3.05),
      castStep("Hit"),
      delayStep(0.1),
      castStep("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.skill === "Hit")
    const amounts = hits.map(row => result.actionBreakdowns[`${row.id}:0`].total)
    expect(hits[1].actionStates[0].debuffs.has("Candlelight")).toBe(true)
    expect(hits[2].actionStates[0].debuffs.has("Candlelight")).toBe(false)
    expect(amounts[1] / amounts[0]).toBeCloseTo(1.3 / 1.2, 10)
    expect(amounts[2]).toBeCloseTo(amounts[0], 10)
  })
  it.each([
    { tier: 3, count: 2, expected: [0, 1, 1, 2, 2, 3] },
    { tier: 4, count: 1, expected: [0, 1, 1, 2, 2, 3] },
    { tier: 4, count: 2, expected: [0, 2, 2, 4, 4, 5] },
    { tier: 6, count: 3, expected: [0, 2, 2, 4, 4, 5] },
  ])("Song of Tang T$tier uses enemy count $count for its additional stack", ({ tier, count, expected }) => {
    const input = bundle({ SongOfTang: tier })
    input.timeline.rotation.enemyCount = count
    input.timeline.skills.Hit.castTime = 0.25
    input.timeline.rotation.steps = Array.from({ length: 6 }, () => castStep("Hit"))
    expect(stacks(calculateRotationBaseline(input), "TangMelody")).toEqual(expected)
  })
  it.each([false, true])("applies Towline stacks per hit in the four-hit opener, Soulbound=%s", soulbound => {
    const input = bundle({ TowlineSweep: 0 })
    input.timeline.initialBuffs = soulbound ? [{ name: "Soulbound", stack: 1 }] : []
    const anchor = rotationRecord.start
    assert(anchor, "The rotation must declare its start anchor.")
    const opener = rotationRecord.steps[anchor.step]
    assert(opener, "The rotation's start anchor must name an existing step.")
    input.timeline.rotation.steps = [opener, castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const release = result.timeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill !== "Hit",
    )!
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    // One Soul Loss per hit, so the three hits before the last leave three stacks, or
    // six when cast-start Soulbound doubles each one. The last hit then reaches the
    // seven-stack cap and breaks Soul Loss away.
    const soulLoss = release.actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => action.type === "apply" && action.value === "SoulLoss")
      .map(({ index }) => index)
    expect(soulLoss).toHaveLength(12)
    expect(release.actionStates[soulLoss[9]].debuffs.get("SoulLoss")?.stack).toBe(soulbound ? 6 : 3)
    expect(hit.actionStates[0].debuffs.get("SoulLoss")?.stack ?? 0).toBe(soulbound ? 0 : 4)
    expect(hit.actionStates[0].debuffs.has("Soulbreak")).toBe(soulbound)
    expect(hit.actionStates[0].buffs.has("Soulbound")).toBe(false)
  })
  it("adds Soul Loss after each Soul Sweep hit and grants none for its cancel", () => {
    const input = bundle()
    input.timeline.rotation.steps = [castStep("SoulSweep"), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const sweep = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweep")!
    expect([1, 3, 5].map(index => sweep.actionStates[index].debuffs.get("SoulLoss")?.stack ?? 0)).toEqual([0, 1, 2])
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(hit.actionStates[0].debuffs.get("SoulLoss")?.stack).toBe(3)
    const canceled = bundle()
    canceled.timeline.rotation.steps = [castStep("SoulSweepCancel"), castStep("Hit")]
    const cancelHit = calculateRotationBaseline(canceled).timeline.find(
      row => row.step.type === "skill" && row.step.skill === "Hit",
    )!
    expect(cancelHit.actionStates[0].debuffs.has("SoulLoss")).toBe(false)
  })
  it.each([false, true])("snapshots Soulbound for all seven Piercing Dart sweep applications: %s", soulbound => {
    const input = bundle()
    input.timeline.initialBuffs = soulbound ? [{ name: "Soulbound", stack: 1 }] : []
    input.timeline.rotation.steps = [
      castStep("PiercingDartCharge"),
      castStep("Hit"),
      castStep("PiercingDart"),
      castStep("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].buffs.has("Soulbound")).toBe(soulbound)
    expect(hits[0].actionStates[0].debuffs.has("SoulLoss")).toBe(false)
    expect(hits[1].actionStates[0].buffs.has("Soulbound")).toBe(false)
    expect(hits[1].actionStates[0].debuffs.has("SoulLoss")).toBe(false)
    expect(hits[1].actionStates[0].debuffs.has("Soulbreak")).toBe(soulbound)
    expect(hits[1].actionStates[0].buffs.has("SoulReturn")).toBe(soulbound)
  })
  it("maps four- and seven-hit Piercing Dart releases to source-tagged sweep damage", () => {
    const input = bundle()
    input.timeline.rotation.steps = [castStep("PiercingDart4Hits"), castStep("PiercingDart")]
    const result = calculateRotationBaseline(input)
    const releases = result.timeline.filter(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill?.startsWith("PiercingDart"),
    )
    expect(releases).toHaveLength(2)
    for (const [releaseIndex, expectedCount] of [
      [0, 4],
      [1, 7],
    ] as const) {
      const release = releases[releaseIndex]
      const sweeps = result.timeline.filter(
        row =>
          row.kind === "trigger" &&
          row.sourceRowId === release.id &&
          row.step.type === "skill" &&
          row.skill?.tags?.some(tag => tag.startsWith("PiercingDartSweep")),
      )
      expect(sweeps).toHaveLength(expectedCount)
      expect(sweeps.map(row => row.step.skill)).toEqual(
        Array.from({ length: expectedCount }, (_, index) => `PiercingDartSweep${index + 1}`),
      )
      expect(sweeps.every((row, index) => row.skill?.tags?.includes(`PiercingDartSweep${index + 1}`))).toBe(true)
    }
  })
  it("lets Towline Sweep apply Soul Loss even on an unbound release", () => {
    const input = bundle({ TowlineSweep: 0 })
    input.timeline.rotation.steps = [castStep("PiercingDart"), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(hit.actionStates[0].debuffs.has("Soulbreak")).toBe(true)
  })
  it("shares the ten-second cooldown between normal and canceled Soul Sweep", () => {
    const input = bundle()
    input.timeline.rotation.steps = [castStep("SoulSweepCancel"), castStep("SoulSweep"), castStep("SoulSweepCancel")]
    const result = calculateRotationBaseline(input)
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(casts[1].startTime - casts[0].startTime).toBeCloseTo(10)
    expect(casts[2].startTime - casts[1].startTime).toBeCloseTo(10)
  })
  it("preserves Soulbound through time and charging, then consumes it on Piercing Dart cast", () => {
    const input = bundle()
    input.timeline.rotation.steps = [
      castStep("SoulSweepCancel"),
      delayStep(30),
      castStep("PiercingDartCharge"),
      castStep("Hit"),
      castStep("PiercingDart"),
      castStep("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].buffs.has("Soulbound")).toBe(true)
    expect(hits[0].actionStates[0].buffs.get("Soulbound")?.expiresAt).toBeUndefined()
    expect(hits[1].actionStates[0].buffs.has("Soulbound")).toBe(false)
  })
  it.each([0, 1])("converts seven Soul Loss stacks and respects base or Towline T%i durations", tier => {
    const input = bundle({ TowlineSweep: tier })
    input.timeline.skills.Loss = {
      name: "Loss",
      castTime: 1,
      action: [{ type: "apply", target: "target", value: "SoulLoss", time: 0 }],
    }
    input.timeline.rotation.steps = [
      ...Array.from({ length: 6 }, () => castStep("Loss")),
      castStep("Hit"),
      castStep("Loss"),
      castStep("Hit"),
      delayStep(22),
      castStep("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].debuffs.get("SoulLoss")?.stack).toBe(6)
    expect(hits[0].actionStates[0].debuffs.has("Soulbreak")).toBe(false)
    const active = hits[1].actionStates[0]
    expect(active.debuffs.has("SoulLoss")).toBe(false)
    const expectedDuration = [12, 21][tier]
    for (const state of [active.debuffs.get("Soulbreak")!, active.buffs.get("SoulReturn")!])
      expect(state.expiresAt! - state.appliedAt!).toBe(expectedDuration)
    expect(hits[2].actionStates[0].debuffs.has("Soulbreak")).toBe(false)
    expect(hits[2].actionStates[0].buffs.has("SoulReturn")).toBe(false)
    expect(
      result.actionBreakdowns[`${hits[1].id}:0`].total / result.actionBreakdowns[`${hits[0].id}:0`].total,
    ).toBeCloseTo(1.05)
  })
  it("expires unfinished Soul Loss stacks after five seconds", () => {
    const input = bundle()
    input.timeline.skills.Loss = {
      name: "Loss",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "SoulLoss", stack: 6, time: 0 }],
    }
    input.timeline.rotation.steps = [castStep("Loss"), delayStep(5), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(hit.actionStates[0].debuffs.has("SoulLoss")).toBe(false)
    expect(hit.actionStates[0].debuffs.has("Soulbreak")).toBe(false)
  })
  it("resolves the registered rotation's movement attachments and 60-second cutoff", () => {
    const rotation = rotationRecord
    const input = bundle()
    input.timeline.skills = { ...input.timeline.skills, ...general, ...mystic }
    input.timeline.effectDefinitions = { ...input.timeline.effectDefinitions, ...mysticBuffs }
    input.timeline.setupEffects = martialArtEffectsForRank(
      { everspring: martialArtDefinitions.everspring },
      ["everspring"],
      13,
    )
    input.timeline.rotation = rotation
    assert(rotation.start, "The rotation must declare its start anchor.")
    input.startAnchor = { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action }
    for (const step of rotation.steps.filter(step => step.type === "skill")) {
      expect(input.timeline.skills[step.skill!]).toBeDefined()
    }
    expect(rotation.start).toEqual({ step: 5, action: 0 })
    const scarletSteps = castsOf(rotation.steps, "ScarletSpin")
    expect(scarletSteps.map(step => step.duration)).toEqual([12, 12, 12])
    expect(scarletSteps.filter(step => step.causesBreak)).toHaveLength(1)
    expect(scarletSteps.findIndex(step => step.causesBreak)).toBe(1)
    const result = calculateRotationBaseline(input)
    expect(result.duration).toBe(60)
    expect(result.metrics.totalDamage).toBeGreaterThan(0)
    const battleEnd = result.timeline.find(
      row => row.kind === "rotation" && row.step.type === "event" && row.step.event === "BattleEnd",
    )!
    const timed = (entry: RotationDamageEntry) => {
      assert(typeof entry.timelineTime === "number", "Every resolved action must carry a timeline time.")
      return entry.timelineTime
    }
    expect(result.baseline.every(entry => timed(entry) < battleEnd.startTime)).toBe(true)
    expect(result.baseline.every(entry => timed(entry) - result.anchorTime < 60)).toBe(true)
    // The rotation ends on Burn and Bury: the closing Soul Sweep and seven-hit
    // Piercing Dart were dropped, so the four-hit opener is the only Dart cast.
    expect(rotation.steps.some(step => step.type === "skill" && step.skill === "PiercingDart")).toBe(false)
    expect(rotation.steps.some(step => step.type === "skill" && step.skill === "SoulSweep")).toBe(false)
    expect(
      rotation.steps.some(step => step.type === "event" && step.event === "BattleEnd" && step.startTime === 60),
    ).toBe(true)
    expect(result.timeline.find(row => row.step.type === "skill" && row.step.skill === "BurnAndBury")!.distance).toBe(9)
    const fullFlute = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "FluteOfTheTides")!
    expect(fullFlute.actionStates[2].distance).toBe(9)
    expect(fullFlute.actionStates[3].distance).toBe(9)
    for (const row of result.timeline.filter(
      row => row.step.type === "skill" && row.step.skill === "SoaringSpin2" && row.actionStates[3],
    )) {
      expect(row.actionStates[3].distance).toBe(1)
    }
  })
  it.each(
    ["18", "19"].flatMap(breakthrough => [
      { name: "100% PC", rotation: dustPhantomChimeRotation, expectedResonances: 85, breakthrough },
      { name: "regular", rotation: defaultDustRotation, expectedResonances: 86, breakthrough },
    ]),
  )(
    "resolves the expected Resonances in the $name preset at breakthrough $breakthrough",
    ({ rotation, expectedResonances, breakthrough }) => {
      const path = typedPathDefinitions.bamboocutDust
      const input = buildPresetRotationBundle(
        {
          pathId: "bamboocutDust",
          martialArts: path.lockedWeapons!,
          rotation: rotation as RotationRecord,
          breakthrough,
          food: "SimmeringFishSlices",
          divinecraft: "Fire",
          script: "None",
          skillOverrides: {},
          previewId: null,
          globalDebuffs: { ...defaultGlobalDebuffs },
        },
        path.defaultBuild,
      )!
      const result = calculateRotationBaseline(input)
      const rows = result.metrics.breakdown.groupedSkills
      expect(rows.find(row => row.name === "Scarlet Spin")!.hits).toBe(84)
      expect(rows.find(row => row.name === "Resonance")!.hits).toBe(expectedResonances)
      expect(result.duration).toBe(60)

      const burns = result.timeline.filter(row => row.kind === "rotation" && row.step.skill === "BurnAndBury")
      expect(burns).toHaveLength(4)
      for (const row of burns) {
        expect(row.actionStates[0].debuffs.has("Soulbreak")).toBe(true)
        const hitIndex = row.actions.findIndex(action => action.type === "damage" && action.phyCoef === 2.298686)
        expect(result.actionBreakdowns[`${row.id}:${hitIndex}`]?.total).toBeGreaterThan(0)
        expect(row.startTime + Number(row.actions[hitIndex].time) - result.anchorTime).toBeLessThan(60)
      }
    },
  )

  it("preserves every Burn and Bury connection and lands the closing hit before Battle End", () => {
    const path = typedPathDefinitions.bamboocutDust
    const input = buildPresetRotationBundle(
      {
        pathId: "bamboocutDust",
        martialArts: path.lockedWeapons!,
        rotation: rotationRecord,
        breakthrough: "17",
        food: "SimmeringFishSlices",
        divinecraft: "Fire",
        script: "None",
        skillOverrides: {},
        previewId: null,
        globalDebuffs: { ...defaultGlobalDebuffs },
      },
      path.defaultBuild,
    )!
    const result = calculateRotationBaseline(input)
    const burns = result.timeline.filter(row => row.kind === "rotation" && row.step.skill === "BurnAndBury")
    expect(burns).toHaveLength(4)
    for (const row of burns) {
      expect(row.actionStates[0].debuffs.has("Soulbreak")).toBe(true)
      const hitIndex = row.actions.findIndex(action => action.type === "damage" && action.phyCoef === 2.298686)
      expect(result.actionBreakdowns[`${row.id}:${hitIndex}`]?.total).toBeGreaterThan(0)
      expect(row.startTime + Number(row.actions[hitIndex].time) - result.anchorTime).toBeLessThan(60)
    }
    const spins = result.timeline.filter(row => row.kind === "rotation" && row.step.skill === "ScarletSpin")
    expect(
      spins.map(parent => result.timeline.filter(row => isThrow(row) && row.sourceRowId === parent.id).length),
    ).toEqual([14, 14, 14])
    const uncorrected = structuredClone(input)
    const fluteIndex = uncorrected.timeline.rotation.steps.findIndex(step => step.skill === "FluteOfTheTides")
    uncorrected.timeline.rotation.steps[fluteIndex - 2].skill = "SoaringSpin2"
    uncorrected.timeline.rotation.steps.splice(fluteIndex - 2, 0, {
      type: "event",
      event: "Move",
      before: { action: 2 },
      distance: 1,
    })
    const broken = calculateRotationBaseline(uncorrected)
    const missed = broken.timeline.filter(row => row.kind === "rotation" && row.step.skill === "BurnAndBury")[2]
    expect(missed.actionStates[0].debuffs.has("Soulbreak")).toBe(false)
    expect(result.metrics.dps).toBeGreaterThan(broken.metrics.dps)
  })

  it("registers the Dust 100% Phantom Chime rotation as the path default", () => {
    expect(pathData.bamboocutDust.defaultRotation).toBe("dust-dummy-1-min-100pc")
    expect(dustPhantomChimeRotation.name).toBe("Dummy 1 Min 100% PC")
    expect(dustPhantomChimeRotation.martialArts).toEqual(["everspring", "unfettered"])
    expect(dustPhantomChimeRotation.ping).toBe(40)
    expect(dustPhantomChimeRotation.steps.at(-1)).toEqual({ type: "event", event: "BattleEnd", startTime: 60 })
    // The default opens the fight on the four-hit release's first hit, so the
    // release's own applications are in combat and the opener breaks Soul Loss.
    expect(dustPhantomChimeRotation.start).toEqual({ step: 4, action: 4 })
    expect(dustPhantomChimeRotation.steps[4]).toEqual({ type: "skill", skill: "PiercingDart4Hits" })
  })

  it("limits Starweave to two stacks per second, caps at five, and drops one when hit", () => {
    const run = (tier: string, steps: RotationStep[]) => {
      const input = bundle()
      input.timeline.skills.MartialProbe = {
        name: "Martial Probe",
        castTime: 0.5,
        tags: ["MartialArts", "MartialArt"],
        action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.5 }],
      }
      input.timeline.skills.Reader = {
        name: "Reader",
        castTime: 0,
        tags: ["MartialArts"],
        action: [{ type: "heal", phyCoef: 0, attrCoef: 0, time: 0 }],
      }
      input.timeline.skills.FastProbe = {
        name: "Fast Probe",
        castTime: 0.1,
        tags: ["MartialArts", "MartialArt"],
        action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 }],
      }
      input.timeline.eventDefinitions = {
        ...input.timeline.eventDefinitions,
        TakeDamage: { name: "Take Damage", castTime: 0, action: [{ type: "takeDamage", time: 0 }] },
      }
      const effect = weaponSetDefinitions.Starweave.options[tier].effect
      const setupEffects = (Array.isArray(effect) ? effect : [effect]).map(entry =>
        effectForSoloLevel(entry, 17, "Starweave"),
      )
      input.timeline.setupEffects = setupEffects
      input.timeline.innerWayConditions = setupEffects.flatMap(entry =>
        typeof entry.condition === "string" ? [entry.condition] : [],
      )
      input.timeline.rotation.steps = steps
      return calculateRotationBaseline(input)
    }
    const hits = (count: number, skill = "MartialProbe") => Array.from({ length: count }, () => castStep(skill))
    const stacks = (tier: string, steps: RotationStep[]) => {
      const result = run(tier, steps)
      const reader = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Reader")!
      return reader.actionStates[0].buffs.get("Starweave")?.stack ?? 0
    }
    // Twenty half-second casts land twenty gains across ten seconds, so the
    // two-per-second limit is not binding and the five-stack cap is reached.
    expect(stacks("4", [...hits(20), castStep("Reader")])).toBe(5)
    // Twenty tenth-second casts all land inside two seconds, where the gain
    // limit allows only four stacks and the fifth is still out of reach.
    expect(stacks("4", [...hits(20, "FastProbe"), castStep("Reader")])).toBe(4)
    // Two pieces grant the flat attack bonus but never a stack.
    expect(stacks("2", [...hits(20), castStep("Reader")])).toBe(0)
    // Taking damage removes exactly one stack.
    expect(
      stacks("4", [
        ...hits(20),
        { type: "event", event: "TakeDamage", startTime: 10.5, damage: 200 },
        delayStep(0.5),
        castStep("Reader"),
      ]),
    ).toBe(4)
  })
  it("restricts the Starweave damage bonus to Martial Art skills", () => {
    const totalFor = (tier: string, skill: string) => {
      const input = bundle()
      input.timeline.skills = {
        ...input.timeline.skills,
        MartialProbe: {
          name: "Martial Probe",
          castTime: 0.5,
          tags: ["MartialArts", "MartialArt"],
          action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.5 }],
        },
        OtherProbe: {
          name: "Other Probe",
          castTime: 0.5,
          tags: ["MartialArts", "Special"],
          action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.5 }],
        },
      }
      const effect = weaponSetDefinitions.Starweave.options[tier].effect
      const setupEffects = (Array.isArray(effect) ? effect : [effect]).map(entry =>
        effectForSoloLevel(entry, 17, "Starweave"),
      )
      input.timeline.setupEffects = setupEffects
      input.timeline.innerWayConditions = setupEffects.flatMap(entry =>
        typeof entry.condition === "string" ? [entry.condition] : [],
      )
      input.timeline.rotation.steps = Array.from({ length: 20 }, () => castStep(skill))
      const result = calculateRotationBaseline(input)
      return Object.values(result.actionBreakdowns).reduce((sum, entry) => sum + entry.total, 0)
    }
    expect(totalFor("4", "MartialProbe")).toBeGreaterThan(totalFor("2", "MartialProbe"))
    expect(totalFor("4", "OtherProbe")).toBeCloseTo(totalFor("2", "OtherProbe"), 6)
  })
  it("scales the Starweave distance bonus using the authored movement anchors", () => {
    const gainOverTwoPiece = (rotation: RotationRecord) => {
      const input = bundle()
      input.timeline.skills = { ...input.timeline.skills, ...general, ...mystic, ...umbrella, ...rope }
      input.timeline.effectDefinitions = { ...input.timeline.effectDefinitions, ...mysticBuffs }
      input.timeline.setupEffects = martialArtEffectsForRank(
        { everspring: martialArtDefinitions.everspring },
        ["everspring"],
        13,
      )
      const measure = (tier: string) => {
        const effect = weaponSetDefinitions.Starweave.options[tier].effect
        const setupEffects = (Array.isArray(effect) ? effect : [effect]).map(entry =>
          effectForSoloLevel(entry, 17, "Starweave"),
        )
        input.timeline.setupEffects = [
          ...martialArtEffectsForRank({ everspring: martialArtDefinitions.everspring }, ["everspring"], 13),
          ...setupEffects,
        ]
        input.timeline.innerWayConditions = setupEffects.flatMap(entry =>
          typeof entry.condition === "string" ? [entry.condition] : [],
        )
        input.timeline.rotation = rotation
        input.startAnchor = { rowId: `rotation-${rotation.start!.step}`, actionIndex: rotation.start!.action }
        return calculateRotationBaseline(input).metrics.dps
      }
      return measure("4") / measure("2")
    }
    const rotation = rotationRecord
    const collapsed = {
      ...rotation,
      steps: rotation.steps.map(step =>
        step.type === "event" && step.event === "Move" ? { ...step, distance: 1 } : step,
      ),
    } as RotationRecord
    expect(gainOverTwoPiece(rotation)).toBeGreaterThan(gainOverTwoPiece(collapsed))
  })
  it("applies Soulbound at zero before the unmeasured Soul Sweep hits", () => {
    const input = bundle()
    input.timeline.rotation.steps = [castStep("SoulSweep"), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const sweep = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweep")!
    const hits = result.baseline.filter(entry => entry.context.skillTags.includes("SoulSweep"))
    expect(hits).toHaveLength(3)
    expect(hits.map(entry => entry.timelineTime)).toEqual([sweep.startTime, sweep.startTime, sweep.startTime])
    for (const index of [1, 2, 3])
      expect(sweep.actionStates[index].buffs.get("Soulbound")?.appliedAt).toBeCloseTo(sweep.startTime)
    const followup = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(followup.actionStates[0].buffs.get("Soulbound")?.appliedAt).toBeCloseTo(sweep.startTime)
    const amounts = hits.map(entry => result.actionBreakdowns[entry.id!].total)
    expect(amounts[1] / amounts[0]).toBeCloseTo(0.35 / 0.3)
    expect(amounts[2]).toBeCloseTo(amounts[1])
  })
  it("applies Soulbound at the start of a canceled Soul Sweep without damage", () => {
    const input = bundle()
    input.timeline.rotation.steps = [castStep("SoulSweepCancel"), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const cancel = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweepCancel")!
    const followup = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(followup.actionStates[0].buffs.get("Soulbound")?.appliedAt).toBeCloseTo(cancel.startTime)
    expect(result.baseline.filter(entry => entry.context.skillTags.includes("SoulSweep"))).toHaveLength(0)
  })
  it("uses the configured maximum for Flower Burial while queued throws extend the cast", () => {
    const input = bundle()
    input.timeline.rotation.steps = [castStep("ScarletSpin"), castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const parent = result.timeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "ScarletSpin",
    )!
    expect(parent.effectiveCastTime).toBeGreaterThan(12)
    expect(stateAfterEffect(parent, "ScarletSpin", "FlowerBurial")?.buffs.get("FlowerBurial")?.expiresAt).toBe(
      parent.startTime + 12,
    )
  })

  it("chains source-faithful Scarlet Spin stages through the queued final throw", () => {
    const input = bundle()
    input.timeline.setupEffects = martialArtEffectsForRank(
      { everspring: martialArtDefinitions.everspring },
      ["everspring"],
      13,
    )
    input.timeline.rotation.steps = [
      { type: "skill", skill: "ScarletSpin", duration: 12 },
      { type: "skill", skill: "ScarletSpin", duration: 12 },
      { type: "skill", skill: "ScarletSpin", duration: 12 },
    ]
    const result = calculateRotationBaseline(input)
    const parents = result.timeline.filter(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "ScarletSpin",
    )
    const expectedOrder = [
      "ScarletSpinStage1",
      "ScarletSpinStage2",
      "ScarletSpinStage3",
      "ScarletSpinStage4",
      "ScarletSpinStage2",
      "ScarletSpinStage3",
      "ScarletSpinStage4",
      "ScarletSpinStage2",
      "ScarletSpinStage3",
      "ScarletSpinStage4",
      "ScarletSpinStage2",
      "ScarletSpinStage3",
      "ScarletSpinStage4",
      "ScarletSpinStage2",
    ]
    expect(parents).toHaveLength(3)
    // Every throw past the first is seeded by a catch; the last throw happens
    // after Flower Burial ends and cannot be caught.
    for (const [index, parent] of parents.entries()) {
      const end = parents[index + 1]?.startTime ?? Infinity
      const throws = result.timeline.filter(
        row => row.kind === "trigger" && row.sourceRowId === parent.id && isThrow(row),
      ).length
      const catches = result.timeline.filter(
        row => isCatch(row) && row.startTime >= parent.startTime && row.startTime < end,
      ).length
      expect(catches).toBe(throws - 1)
    }
    const throwRows = result.timeline.filter(row => row.kind === "trigger" && isThrow(row))
    const throwRowIds = new Set(throwRows.map(row => row.id))
    expect(result.baseline.filter(entry => entry.id && throwRowIds.has(entry.id.split(":")[0]))).toHaveLength(84)
    for (const parent of parents) {
      const stages = result.timeline.filter(
        row => row.kind === "trigger" && row.step.type === "skill" && row.sourceRowId === parent.id && isThrow(row),
      )
      expect(stages.map(row => row.step.skill)).toEqual(expectedOrder)
      expect(stages).toHaveLength(14)
      expect(stages.every(row => !row.skill?.tags?.includes("PerfectCatch"))).toBe(true)
      expect(stages.every(row => row.actions.filter(action => action.type === "damage").length === 2)).toBe(true)
      expect(stages[0].startTime - parent.startTime).toBeCloseTo(0, 8)
      expect(stages[1].startTime - stages[0].startTime).toBeCloseTo(1.0769230769230769, 8)
      expect(stages[2].startTime - stages[1].startTime).toBeCloseTo(0.9583333333333333, 8)
      expect(stages[3].startTime - stages[2].startTime).toBeCloseTo(1.0909090909090908, 8)
      expect(stages[4].startTime - stages[3].startTime).toBeCloseTo(0.7692307692307692, 8)
      for (let index = 1; index < stages.length; index++)
        expect(stages[index].startTime).toBeLessThan(stages[index - 1].startTime + stages[index - 1].effectiveCastTime)
      expect(stages[3].modifierEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ castTimeMultiplier: 0.7692307692307692, GuaranteedCrit: true }),
        ]),
      )
      expect(stages[3].modifierEffects).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ SteadfastGuaranteedCrit: true })]),
      )
      expect(stages[2].modifierEffects).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ castTimeMultiplier: expect.any(Number) })]),
      )
      expect(stages.at(-1)!.startTime - parent.startTime).toBeCloseTo(12.350815850815852, 8)
      expect(parent.effectiveCastTime).toBeGreaterThan(12)
      expect(stages.at(-1)!.actions.filter(action => action.type === "damage")).toHaveLength(2)
    }
  })
  it.each([...Object.keys(mystic), "Deflect", "DeflectSuccessful"])("keeps %s independent of ping", skill => {
    const simulate = (ping: number) => {
      const input = bundle()
      input.timeline.rotation.ping = ping
      input.timeline.rotation.steps = [castStep(skill)]
      return calculateRotationBaseline(input)
    }
    const baseline = simulate(0)
    expect(baseline.timeline.some(row => row.step.skill === skill)).toBe(true)
    for (const ping of [40, 200]) {
      const result = simulate(ping)
      expect(result.timeline).toEqual(baseline.timeline)
      expect(result.baseline).toEqual(baseline.baseline)
    }
  })
  it("keeps Scarlet Spin throws, catches, damage, and duration independent of ping", () => {
    const spin = (ping: number) => {
      const input = bundle()
      input.timeline.setupEffects = martialArtEffectsForRank(
        { everspring: martialArtDefinitions.everspring },
        ["everspring"],
        13,
      )
      input.timeline.rotation.ping = ping
      input.timeline.rotation.steps = [{ type: "skill", skill: "ScarletSpin", duration: 12 }]
      return calculateRotationBaseline(input)
    }
    const baseline = spin(0)
    expect(baseline.timeline.filter(isThrow)).toHaveLength(14)
    for (const ping of [15, 40, 200]) {
      const result = spin(ping)
      expect(result.timeline).toEqual(baseline.timeline)
      expect(result.baseline).toEqual(baseline.baseline)
    }
  })
  it("caps Flower Burial at twelve seconds while queued throws extend Scarlet Spin", () => {
    const input = bundle()
    input.timeline.setupEffects = martialArtEffectsForRank(
      { everspring: martialArtDefinitions.everspring },
      ["everspring"],
      13,
    )
    input.timeline.rotation.steps = [{ type: "skill", skill: "ScarletSpin", duration: 99 }, castStep("Hit")]
    const result = calculateRotationBaseline(input)
    const parent = result.timeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "ScarletSpin",
    )!
    const stages = result.timeline.filter(
      row => row.kind === "trigger" && row.step.type === "skill" && row.sourceRowId === parent.id && isThrow(row),
    )
    expect(stateAfterEffect(parent, "ScarletSpin", "FlowerBurial")?.buffs.get("FlowerBurial")?.expiresAt).toBe(
      parent.startTime + 12,
    )
    expect(parent.effectiveCastTime).toBeGreaterThan(12)
    expect(stages).toHaveLength(14)
    expect(stages.at(-1)!.startTime).toBeGreaterThan(parent.startTime + 12)
    expect(stages.every(row => row.actions.filter(action => action.type === "damage").length === 2)).toBe(true)
    expect(
      result.timeline
        .find(row => row.step.type === "skill" && row.step.skill === "Hit")!
        .actionStates[0].buffs.has("FlowerBurial"),
    ).toBe(false)
  })
  it("does not start a new Scarlet Spin chain over an existing Flower Burial", () => {
    const input = bundle()
    input.timeline.initialBuffs = [{ name: "FlowerBurial", stack: 1, expiresAt: 12 }]
    input.timeline.rotation.steps = [{ type: "skill", skill: "ScarletSpin", duration: 12 }]
    const result = calculateRotationBaseline(input)
    const parent = result.timeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "ScarletSpin",
    )!
    const stages = result.timeline.filter(
      row => row.kind === "trigger" && row.sourceRowId === parent.id && isThrow(row),
    )
    expect(stages).toHaveLength(0)
  })

  it("selects Burn and Bury damage by target state without damaging an unmarked target", () => {
    const run = (state?: string) => {
      const input = bundle()
      if (state) input.timeline.initialDebuffs = [{ name: state, stack: 1 }]
      input.timeline.rotation.steps = [castStep("BurnAndBury"), delayStep(1)]
      return calculateRotationBaseline(input).metrics.totalDamage
    }
    expect(run()).toBe(0)
    expect(run("SoulLoss")).toBeGreaterThan(0)
    expect(run("Soulbreak") / run("SoulLoss")).toBeCloseTo((1.3 / 0.78) * 1.05)
  })
  it("adds Soulbreak to general damage bonus for martial arts and mystics", () => {
    for (const tags of [["MartialArts"], ["Mystic"]]) {
      const input = bundle()
      input.stats.vsBossDmg = 0.2
      input.timeline.skills.Hit.tags = tags
      input.timeline.rotation.steps = [castStep("Hit")]
      const base = calculateRotationBaseline(input).metrics.totalDamage
      input.timeline.initialDebuffs = [{ name: "Soulbreak", stack: 1 }]
      expect(calculateRotationBaseline(input).metrics.totalDamage / base).toBeCloseTo(1.25 / 1.2)
    }
  })
  it("adds Fragrant Song damage to its guaranteed-critical Resonance only while marked", () => {
    const input = bundle()
    input.timeline.skills.Resonance = umbrella.Resonance
    input.timeline.rotation.steps = [castStep("Resonance")]
    input.stats.vsBossDmg = 0.2
    input.stats.crit = 0
    const ordinary = calculateRotationBaseline(input).metrics.totalDamage
    input.timeline.initialBuffs = [{ name: "FragrantSongResonance", stack: 1 }]
    const marked = calculateRotationBaseline(input).metrics.totalDamage
    expect(marked / ordinary).toBeCloseTo(1.5 * 1.2)
    input.timeline.initialBuffs = []
    input.timeline.skills.MarkSong = {
      name: "Mark Song",
      castTime: 0,
      action: [{ type: "apply", target: "self", value: "FragrantSongResonance", time: 0 }],
    }
    input.timeline.skills.ClearSong = {
      name: "Clear Song",
      castTime: 0,
      action: [{ type: "consume", target: "self", value: "FragrantSongResonance", stack: "all", time: 0 }],
    }
    input.timeline.rotation.steps = [castStep("MarkSong"), delayStep(3), castStep("Resonance")]
    expect(calculateRotationBaseline(input).metrics.totalDamage).toBeCloseTo(marked)
    input.timeline.rotation.steps = [castStep("MarkSong"), castStep("ClearSong"), castStep("Resonance")]
    expect(calculateRotationBaseline(input).metrics.totalDamage).toBeCloseTo(ordinary)
  })
  it("limits Tang Melody to direct martial-art-skill contexts, including Scarlet Spin Resonance", () => {
    for (const [skill, tags, eligible] of [
      ["Probe", ["MartialArts", "MartialArt", "DirectDamage"], true],
      ["Probe", ["MartialArts", "Light", "DirectDamage"], false],
      ["Probe", ["MartialArts", "MartialArt", "DOT"], false],
      ["Resonance", umbrella.Resonance.tags!, true],
      ["DreamwroughtBubbles", umbrella.DreamwroughtBubbles.tags!, false],
    ] as const) {
      const input = bundle()
      input.timeline.skills.Probe = { castTime: 1, tags: [...tags], action: [{ type: "damage", phyCoef: 1, time: 0 }] }
      input.timeline.setupEffects.push({ effect: { GuaranteedCrit: true } })
      input.timeline.rotation.steps = [castStep("Probe")]
      input.timeline.rotation.name = skill
      const plain = calculateRotationBaseline(input).metrics.totalDamage
      input.timeline.initialBuffs = [{ name: "TangMelody", stack: 5 }]
      const boosted = calculateRotationBaseline(input).metrics.totalDamage
      expect(boosted / plain).toBeCloseTo(eligible ? 1.6 / 1.5 : 1, 10)
    }
  })
  it("applies Tang Melody after hits, rate limits it, caps it, and expires it", () => {
    const input = bundle({ SongOfTang: 0 })
    input.timeline.skills.Hit.castTime = 0.5
    input.timeline.rotation.steps = [
      ...Array.from({ length: 12 }, () => castStep("Hit")),
      delayStep(5),
      castStep("Hit"),
    ]
    expect(stacks(calculateRotationBaseline(input), "TangMelody")).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 0])
    const enhanced = bundle({ SongOfTang: 3 })
    enhanced.timeline.skills.Hit.castTime = 0.5
    enhanced.timeline.rotation.steps = [
      ...Array.from({ length: 6 }, () => castStep("Hit")),
      delayStep(5),
      castStep("Hit"),
    ]
    expect(stacks(calculateRotationBaseline(enhanced), "TangMelody")).toEqual([0, 1, 2, 3, 4, 5, 5])
  })
  it("restricts Tang Melody critical damage by HP until T5 and to direct martial-art-skill contexts", () => {
    const damage = (tier: number, hp: number, martial = true) => {
      const input = bundle({ SongOfTang: tier })
      input.timeline.rotation.steps = [
        { type: "event", event: "SelfHP", before: { action: "start" }, currentHPRatio: hp / 100 },
        castStep("Hit"),
        castStep("Hit"),
      ]
      if (!martial) input.timeline.skills.Hit.tags = ["Mystic"]
      const result = calculateRotationBaseline(input)
      return result.actionBreakdowns["rotation-2:0"].total / result.actionBreakdowns["rotation-1:0"].total
    }
    expect(damage(0, 100)).toBeCloseTo(1.52 / 1.5)
    expect(damage(0, 50)).toBe(1)
    expect(damage(0, 25)).toBe(1)
    for (const tier of [3, 4]) {
      expect(damage(tier, 50)).toBe(1)
      expect(damage(tier, 51)).toBeGreaterThan(1)
    }
    expect(damage(5, 25)).toBeGreaterThan(1)
    expect(damage(5, 25, false)).toBe(1)
    expect(damage(6, 25)).toBeGreaterThan(1)
    expect(damage(6, 25, false)).toBe(1)
  })
  it("applies Phantom Chime after resonance and increases its damage at T4", () => {
    const run = (tier: number) => {
      const input = bundle({ PhantomRally: tier })
      input.timeline.rotation.steps = Array.from({ length: 7 }, () => castStep("Resonate"))
      return calculateRotationBaseline(input)
    }
    const result = run(3)
    const hits = result.baseline.filter(entry => entry.context.skillTags.includes("PhantomResonance"))
    expect(hits.map(entry => entry.activeDebuffStacks?.PhantomChime ?? 0)).toEqual([0, 1, 2, 3, 4, 5, 5])
    const enhanced = run(4)
    expect(
      enhanced.actionBreakdowns[enhanced.baseline[0].id!].total / result.actionBreakdowns[hits[0].id!].total,
    ).toBeCloseTo(1.2)
    expect(run(2).baseline.every(entry => !entry.activeDebuffStacks?.PhantomChime)).toBe(true)
  })
  it("settles Soulbreak from final recorded damage on expiry and T6 refresh without replay recursion", () => {
    for (const tier of [4, 6]) {
      const input = bundle({ TowlineSweep: tier })
      input.timeline.skills.Snap = { ...input.timeline.skills.Hit, name: "Snap", tags: ["MartialArts", "BurnAndBury"] }
      input.timeline.rotation.steps = [
        castStep("Mark"),
        castStep("Hit"),
        castStep("Snap"),
        castStep("Hit"),
        delayStep(22),
      ]
      const result = calculateRotationBaseline(input)
      const payouts = result.baseline.filter(entry => entry.replay)
      expect(payouts).toHaveLength(tier === 6 ? 2 : 1)
      for (const [index, entry] of payouts.entries()) {
        // Snap records its hit before T6 refresh settles the first window.
        const windows =
          tier === 4
            ? [["rotation-1:0", "rotation-2:0", "rotation-3:0"]]
            : [["rotation-1:0", "rotation-2:0"], ["rotation-3:0"]]
        const sourceIds = windows[index]
        const expected =
          sourceIds.reduce((sum, id) => sum + result.actionBreakdowns[id].total, 0) * (tier === 6 ? 0.12 : 0.05)
        expect(result.actionBreakdowns[entry.id!].total).toBeCloseTo(expected)
      }
      expect(payouts.at(-1)!.timelineTime).toBe(tier === 6 ? 22 : 21)
    }
  })
  it("requires five Candlelight stacks and distance strictly above eight for the larger T6 bonus", () => {
    const damage = (distance: number, stack: number) => {
      const input = bundle({ LightAnew: 6 })
      skillActions(input.timeline.skills.Candle)[0].stack = stack
      input.timeline.rotation.steps = [
        castStep("Candle"),
        { type: "event", event: "Move", before: { action: "start" }, distance },
        castStep("Hit"),
      ]
      const result = calculateRotationBaseline(input)
      return result.actionBreakdowns["rotation-2:0"].total
    }
    expect(damage(9, 5) / damage(8, 5)).toBeCloseTo(1.06 / 1.03)
    expect(damage(9, 4)).toBe(damage(8, 4))
  })
  it("converts three timely Perfect Catches into Fragrant Song and caps Delicate at four", () => {
    const run = (rank: number, gap = 0) => {
      const input = bundle({ PhantomRally: 1 })
      input.timeline.setupEffects = martialArtEffectsForRank(
        { everspring: martialArtDefinitions.everspring },
        ["everspring"],
        rank,
      )
      input.timeline.rotation.steps = Array.from({ length: 15 }, () => [castStep("Catch"), delayStep(gap)]).flat()
      input.timeline.rotation.steps.push(castStep("Hit"))
      return calculateRotationBaseline(input).timeline.find(
        row => row.step.type === "skill" && row.step.skill === "Hit",
      )!.actionStates![0].buffs
    }
    expect(run(13).get("FallingBlossoms")).toBeUndefined()
    expect(run(13).get("FragrantSong")?.stack).toBe(1)
    expect(run(13).get("FragrantSongDelicate")?.stack).toBe(4)
    expect(run(0).get("FragrantSong")).toBeUndefined()
    expect(run(13, 5).get("FragrantSong")).toBeUndefined()
  })
  it("expires Falling Blossoms after five seconds and both Fragrant Song buffs after ten", () => {
    const input = bundle({ PhantomRally: 1 })
    input.timeline.setupEffects = martialArtEffectsForRank(
      { everspring: martialArtDefinitions.everspring },
      ["everspring"],
      13,
    )
    input.timeline.rotation.steps = [
      castStep("Catch"),
      castStep("Hit"),
      castStep("Catch"),
      castStep("Catch"),
      castStep("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    const blossoms = hits[0].actionStates[0].buffs.get("FallingBlossoms")!
    expect(blossoms.stack).toBe(1)
    expect(blossoms.expiresAt! - blossoms.appliedAt!).toBe(5)
    const granted = hits[1].actionStates[0].buffs
    expect(granted.has("FallingBlossoms")).toBe(false)
    for (const id of ["FragrantSong", "FragrantSongDelicate"]) {
      const state = granted.get(id)!
      expect(state.expiresAt! - state.appliedAt!).toBe(10)
    }
  })
})

describe("Dust confirmed damage and cooldown rules", () => {
  it.each([
    { times: [0, 0, 0, 0, 0, 0, 0], ready: 9.5 },
    { times: [0, 0.1, 0.49, 0.5, 0.99, 1, 1.5], ready: 8 },
  ])("Charged Combo rate-limits hits at $times", ({ times, ready }) => {
    const input = bundle()
    input.timeline.rotation.ping = 0
    input.timeline.cooldownPolicy = "wait"
    input.timeline.setupEffects = martialArtEffectsForRank(
      { unfettered: martialArtDefinitions.unfettered },
      ["unfettered"],
      13,
    )
    // Synthetic damage verifies the rule without inventing the real damage mapping or timing.
    input.timeline.skills.PiercingDart = {
      ...rope.PiercingDart,
      action: times.map(time => ({ type: "damage", time, phyCoef: 1, attrCoef: 0 })),
    }
    input.timeline.rotation.steps = [castStep("SoulSweepCancel"), castStep("PiercingDart"), castStep("SoulSweep")]
    const result = calculateRotationBaseline(input)
    const sweep = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweep")!
    expect(sweep.startTime).toBeCloseTo(ready)
  })
  it("Burn and Bury multiplies base damage separately from vs Boss", () => {
    const input = bundle()
    input.stats.vsBossDmg = 0.2
    input.timeline.rotation.steps = [castStep("Mark"), castStep("BurnAndBury")]
    const boosted = calculateRotationBaseline(input)
    input.timeline.skills.BurnAndBury = { ...rope.BurnAndBury, modifier: [] }
    const base = calculateRotationBaseline(input)
    const damage = (result: ReturnType<typeof calculateRotationBaseline>) => {
      const row = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "BurnAndBury")!
      return result.actionBreakdowns[`${row.id}:1`].total
    }
    expect(damage(boosted) / damage(base)).toBeCloseTo(1.3)
  })
})

it.each([15, 16])("Towline T6 refreshes target Soulbreak within 15m: distance %s", distance => {
  const input = bundle({ TowlineSweep: 6 })
  input.timeline.rotation.steps = [
    castStep("Mark"),
    castStep("Hit"),
    { type: "event", event: "Move", before: { action: "start" }, distance },
    castStep("BurnAndBury"),
    castStep("Hit"),
    delayStep(22),
  ]
  // The finger snap lands mid-cast, so the refresh it causes is offset by its hit
  // time. Out of range nothing is refreshed and the original expiry stands.
  const snap = skillActions(rope.BurnAndBury).find(action => action.type === "damage")!.time as number
  const inRange = distance === 15
  const result = calculateRotationBaseline(input)
  const payouts = result.baseline.filter(entry => entry.replay)
  expect(payouts).toHaveLength(inRange ? 2 : 1)
  expect(payouts.at(-1)!.timelineTime).toBeCloseTo(inRange ? 22 + snap : 21, 6)
  const lastHit = result.timeline.findLast(row => row.step.type === "skill" && row.step.skill === "Hit")!
  expect(lastHit.actionStates[0].buffs.get("SoulReturn")?.expiresAt).toBeCloseTo(22 + snap, 6)
})

describe("Phantom Umbrella summons and Resonance", () => {
  it.each([
    ["Resonance", "MartialArt", 1.2],
    ["Resonance", "Heavy", 1],
    ["Resonance", "Charged", 1],
    ["BubblesResonance", "MartialArt", 1],
    ["BubblesResonance", "Heavy", 1.2],
    ["BubblesResonance", "Charged", 1.2],
    ["Resonance", "ReturningUmbrella", 1.2],
    ["BubblesResonance", "ReturningUmbrella", 1.2],
    ["Resonance", "Umbrella", 1.2],
    ["BubblesResonance", "Umbrella", 1.2],
  ])("applies %s bonuses for %s with multiplier %s", (skill, tag, multiplier) => {
    const damage = (boost: boolean) => {
      const input = bundle()
      input.timeline.rotation.steps = [castStep(String(skill)), castStep("Hit")]
      input.timeline.setupEffects = boost
        ? [{ requirement: [{ target: "skillTag", value: tag }], effect: { dmgBonus: 0.2 } }]
        : []
      return calculateRotationBaseline(input).actionBreakdowns["rotation-0:0"].total
    }
    expect(damage(true) / damage(false)).toBeCloseTo(Number(multiplier), 9)
  })
  const run = (tier: number, steps: RotationStep[]) => {
    const selection = [{ innerWay: "PhantomRally", tier: `T${tier}` as const }]
    const input = bundle()
    input.timeline.setupEffects = martialArtEffectsForRank(
      { everspring: martialArtDefinitions.everspring },
      ["everspring"],
      13,
    )
    input.timeline.innerWayRules = innerWayEffectRulesFor(selection, 19, "bamboocutDust")
    input.timeline.innerWayConditions = [...innerWayConditionsFor(selection, undefined, "bamboocutDust")]
    input.timeline.rotation.steps = steps
    return calculateRotationBaseline(input)
  }
  const resonances = (result: ReturnType<typeof run>) =>
    result.timeline.filter(
      row => row.step.type === "skill" && ["Resonance", "BubblesResonance"].includes(row.step.skill ?? ""),
    )
  const summons = (result: ReturnType<typeof run>) =>
    result.timeline.filter(
      row =>
        row.step.type === "skill" &&
        ["PhantomUmbrellaSummon", "BubblesPhantomUmbrellaSummon"].includes(row.step.skill ?? ""),
    )
  // Resonance is a triggered attack published under its own row, so total only the
  // rows that are actually Resonance rather than every triggered row in the cast.
  const resonanceDamage = (result: ReturnType<typeof run>) => {
    const ids = resonances(result).map(row => row.id)
    return Object.entries(result.actionBreakdowns)
      .filter(([key]) => ids.some(id => key === id || key.startsWith(`${id}:`)))
      .reduce((sum, [, breakdown]) => sum + breakdown.total, 0)
  }
  // The cadence is anchored to a Scarlet Spin cast, so measure it on the real chain
  // and report which throw index, counting from one, each summon came from. Nested
  // triggers all report the rotation row as their source, so a returning throw is
  // matched by time: it lands partway through its stage, so a summon belongs to
  // the last stage of that cast that had already started.
  const throwIndexAt = (rows: ReturnType<typeof run>["timeline"], times: number[], from: number) => {
    const throws = rows.filter(row => row.kind === "trigger" && isThrow(row) && row.startTime >= from)
    return times.map(time => throws.filter(throwRow => throwRow.startTime <= time).length)
  }
  const cadence = (tier: number, duration = 12) => {
    const result = run(tier, [{ type: "skill", skill: "ScarletSpin", duration }])
    const stages = result.timeline.filter(row => row.kind === "trigger" && isThrow(row))
    return {
      throws: stages.length,
      onThrow: throwIndexAt(
        result.timeline,
        summons(result).map(row => row.startTime),
        0,
      ),
    }
  }

  it.each([3, 6])("classifies every Scarlet Spin Resonance at tier %s as Martial Art", tier => {
    const hits = resonances(run(tier, [{ type: "skill", skill: "ScarletSpin", duration: 12 }]))
    expect(hits.length).toBeGreaterThan(1)
    expect(hits.every(row => row.skill?.tags?.includes("MartialArt"))).toBe(true)
    expect(hits.some(row => row.skill?.tags?.includes("PerfectCatch"))).toBe(false)
  })

  it("crits both of a Fragrant Song throw's Resonances and only those", () => {
    // Catch pulses now resolve inside their owning throw, before the next stage.
    // Creation and deferred catch pulses may share a timestamp; classify each
    // actual pulse by its throw rather than by the helper that spawned it.
    const result = run(6, [{ type: "skill", skill: "ScarletSpin", duration: 12 }])
    const guaranteedCrit = (row: TimelineRow | undefined) =>
      (row?.modifierEffects ?? []).some(effect => effect?.GuaranteedCrit === true)
    const throws = result.timeline.filter(isThrow).sort((a, b) => a.startTime - b.startTime)
    const pulses = result.timeline.filter(row => row.step.skill === "Resonance")
    expect(pulses.some(guaranteedCrit)).toBe(true)
    expect(pulses.some(row => !guaranteedCrit(row))).toBe(true)
    for (const pulse of pulses) {
      const owner = throws.findLast(row => row.startTime <= pulse.startTime + TIMELINE_TIME_EPSILON)
      expect(owner).toBeDefined()
      expect(guaranteedCrit(pulse)).toBe(guaranteedCrit(owner))
    }
    // A critting Resonance really does out-damage an uncritted one.
    const average = (critted: boolean) => {
      const group = result.timeline.filter(row => row.step.skill === "Resonance" && guaranteedCrit(row) === critted)
      return group.reduce((sum, row) => sum + result.actionBreakdowns[`${row.id}:0`].total, 0) / group.length
    }
    expect(average(true)).toBeGreaterThan(average(false))
  })

  it.each([1, 2, 3, 4])("ends stage %s Resonance empowerment at recovery even without a following throw", stage => {
    const input = bundle({ PhantomRally: 6 })
    const id = `ScarletSpinStage${stage}`
    const skill = structuredClone(umbrella[id])
    const actions = skillActions(skill)
    const recovery = Number(
      actions.find(action => action.type === "trigger" && String(action.value).startsWith("ScarletSpinStage"))!.time,
    )
    // Probe actual damage on both sides of recovery, with no Flower Burial to
    // start another throw. Cleanup must work independently of the next throw.
    actions.push(
      { type: "trigger", value: "CleanupProbeResonance", time: recovery - 0.001 },
      { type: "trigger", value: "CleanupProbeResonance", time: recovery + 0.001 },
    )
    input.timeline.skills = {
      ...input.timeline.skills,
      [id]: skill,
      CleanupProbeResonance: structuredClone(umbrella.Resonance),
    }
    input.timeline.initialBuffs = [
      { name: "FragrantSong", stack: 1 },
      { name: "PhantomUmbrella", stack: 1 },
    ]
    input.timeline.rotation.steps = [{ type: "skill", skill: id }]
    const result = calculateRotationBaseline(input)
    expect(result.timeline.filter(isThrow)).toHaveLength(1)
    const probes = result.timeline.filter(row => row.step.skill === "CleanupProbeResonance")
    expect(probes).toHaveLength(2)
    const damage = probes.map(row => result.actionBreakdowns[`${row.id}:0`])
    expect(damage[0].outcomeRates?.critical).toBe(1)
    expect(probes[0].modifierEffects).toContainEqual({ GuaranteedCrit: true, targetCorrectionBonus: 0.2 })
    expect(probes[1].modifierEffects).not.toContainEqual({ GuaranteedCrit: true, targetCorrectionBonus: 0.2 })
    expect(damage[0].total).toBeGreaterThan(damage[1].total)
    expect(probes[1].actionStates?.[0].buffs.has("FragrantSongResonance")).toBe(false)
    expect(probes[1].actionStates?.[0].buffs.has("PhantomUmbrella")).toBe(true)
  })

  it("creates the first phantom before its returning hit and defers the early catch pulse", () => {
    const result = run(6, [{ type: "skill", skill: "ScarletSpin", duration: 2 }])
    const first = result.timeline.find(isThrow)!
    const catchRow = result.timeline.find(isCatch)!
    const summon = result.timeline.find(row => row.step.skill === "PhantomUmbrellaSummon")!
    const returning = first.actions.findLast(action => action.type === "damage")!
    expect(catchRow.startTime - first.startTime).toBeCloseTo(0.6153846153846154, 10)
    expect(summon.startTime - first.startTime).toBeCloseTo(0.7461538461538461, 10)
    expect(summon.startTime).toBeLessThan(first.startTime + Number(returning.time))
    const firstPulses = resonances(result).filter(row => row.startTime < first.startTime + 1.0769230769230769)
    expect(firstPulses).toHaveLength(2)
    expect(firstPulses.map(row => row.startTime - first.startTime)).toEqual([
      expect.closeTo(0.9769230769230769, 10),
      expect.closeTo(0.9769230769230769, 10),
    ])
  })

  it("uses the enhanced catch opening while retaining the continuation gate", () => {
    const input = bundle({ PhantomRally: 6 })
    input.timeline.setupEffects = martialArtEffectsForRank(
      { everspring: martialArtDefinitions.everspring },
      ["everspring"],
      13,
    )
    input.timeline.initialBuffs = [{ name: "FragrantSong", stack: 1 }]
    input.timeline.rotation.steps = [{ type: "skill", skill: "ScarletSpin", duration: 2 }]
    const result = calculateRotationBaseline(input)
    const throws = result.timeline.filter(isThrow).sort((a, b) => a.startTime - b.startTime)
    const caught = result.timeline.find(isCatch)!
    expect(caught.startTime - throws[0].startTime).toBeCloseTo(0.2958579881656805, 10)
    expect(throws[1].startTime - throws[0].startTime).toBeCloseTo(0.8284023668639053, 10)
  })

  it("groups both Resonance routes while preserving their individual damage totals", () => {
    const result = run(6, [{ type: "skill", skill: "ScarletSpin", duration: 2 }, castStep("DreamwroughtBubbles")])
    const flat = result.metrics.breakdown.skills.filter(row => ["Resonance", "BubblesResonance"].includes(row.id))
    expect(flat).toHaveLength(2)
    const group = result.metrics.breakdown.groupedSkills.find(row => row.name === "Resonance")!
    expect(group.children).toHaveLength(2)
    expect(group.damage).toBeCloseTo(
      flat.reduce((sum, row) => sum + row.damage, 0),
      9,
    )
    expect(group.hits).toBe(flat.reduce((sum, row) => sum + row.hits, 0))
  })

  it("leaves the final queued throw uncaught after Flower Burial ends", () => {
    const spin = (ping: number) => {
      const input = bundle()
      input.timeline.setupEffects = martialArtEffectsForRank(
        { everspring: martialArtDefinitions.everspring },
        ["everspring"],
        13,
      )
      input.timeline.innerWayConditions = ["PhantomRallyT3"]
      input.timeline.innerWayRules = []
      input.timeline.rotation.ping = ping
      input.timeline.rotation.steps = [{ type: "skill", skill: "ScarletSpin", duration: 12 }]
      return calculateRotationBaseline(input).timeline
    }
    for (const ping of [0, 40]) {
      const rows = spin(ping)
      const parent = rows.find(row => row.kind === "rotation" && row.step.skill === "ScarletSpin")!
      const throws = rows.filter(row => row.kind === "trigger" && row.sourceRowId === parent.id && isThrow(row))
      const catches = rows.filter(isCatch)
      expect(throws.length).toBeGreaterThan(1)
      expect(catches).toHaveLength(throws.length - 1)
      expect(catches.at(-1)!.startTime).toBeLessThan(parent.startTime + 12)
      expect(throws.at(-1)!.startTime).toBeGreaterThan(parent.startTime + 12)
      expect(throws).toHaveLength(14)
    }
  })
  it("does not let a raised skill satisfy its parent's start-of-cast trigger", () => {
    // Inheritance passes the raising skill's tags to the raised skill so the child is
    // matched by the parent's damage boosts. It must not also let the child impersonate
    // the parent for the parent's own start-of-cast trigger, or that trigger fires twice.
    const input = bundle()
    input.timeline.setupEffects = [
      {
        name: "Perfect Catch Enhancement",
        effect: [],
        trigger: {
          event: "skillStart",
          requirement: [{ target: "skillTag", value: "PerfectCatch" }],
          action: { type: "trigger", value: "Mark" },
        },
      },
    ]
    input.timeline.innerWayConditions = ["PhantomRallyT3"]
    input.timeline.innerWayRules = []
    input.timeline.rotation.steps = [{ type: "skill", skill: "ScarletSpin", duration: 12 }]
    const result = calculateRotationBaseline(input)
    // Resonance has its own damage category without the PerfectCatch identity.
    const inherited = result.timeline.filter(
      row =>
        ["Resonance", "BubblesResonance"].includes(row.step.skill ?? "") &&
        (row.skill?.tags ?? []).includes("PerfectCatch"),
    )
    expect(inherited).toHaveLength(0)
    // Each catch raises exactly one Mark, and nothing else does.
    expect(result.timeline.filter(row => row.step.skill === "Mark")).toHaveLength(
      result.timeline.filter(isCatch).length,
    )
  })
  it("summons on the first returning throw and every third throw after it", () => {
    const { throws: count, onThrow } = cadence(3)
    expect(count).toBe(14)
    // Throws one, four, seven, ten and thirteen of that cast.
    expect(onThrow).toEqual([1, 4, 7, 10, 13])
  })
  it("restarts the cadence on each cast so the first throw always summons", () => {
    const result = run(3, [
      { type: "skill", skill: "ScarletSpin", duration: 12 },
      { type: "skill", skill: "ScarletSpin", duration: 12 },
    ])
    const starts = result.timeline
      .filter(row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "ScarletSpin")
      .map(row => row.startTime)
    expect(starts).toHaveLength(2)
    const times = summons(result).map(row => row.startTime)
    for (const [index, start] of starts.entries()) {
      const end = starts[index + 1] ?? Infinity
      const withinCast = times.filter(time => time >= start && time < end)
      expect(withinCast).toHaveLength(5)
      expect(throwIndexAt(result.timeline, withinCast, start)).toEqual([1, 4, 7, 10, 13])
    }
  })
  it("keeps one phantom per player because a summon replaces rather than stacks", () => {
    const phantomStacks = run(3, [{ type: "skill", skill: "ScarletSpin", duration: 12 }])
      .timeline.flatMap(row => Object.values(row.actionStates ?? {}))
      .map(state => state.buffs.get("PhantomUmbrella")?.stack ?? 0)
    expect(Math.max(...phantomStacks)).toBe(1)
  })
  it("summons on every returning throw at Tier 6 without doubling the first", () => {
    const { throws: count, onThrow } = cadence(6)
    expect(onThrow).toEqual(Array.from({ length: count }, (_, index) => index + 1))
  })
  it("resonates on a Perfect Catch without replacing the phantom", () => {
    const result = run(3, [
      { type: "skill", skill: "ScarletSpin", duration: 2 },
      castStep("EverspringPerfectCatch"),
      castStep("EverspringPerfectCatch"),
    ])
    // Every catch resonates while the phantom is alive, and none of them replace it,
    // so the catch count and the summon count together account for every resonance.
    const caught = result.timeline.filter(
      row => row.step.type === "skill" && row.step.skill === "EverspringPerfectCatch",
    )
    expect(caught.length).toBeGreaterThan(2)
    expect(resonances(result)).toHaveLength(summons(result).length + caught.length)
    const phantomStacks = result.timeline
      .flatMap(row => Object.values(row.actionStates ?? {}))
      .map(state => state.buffs.get("PhantomUmbrella")?.stack ?? 0)
    expect(Math.max(...phantomStacks)).toBe(1)
  })
  it("resonates on a Perfect Catch only while a phantom is alive", () => {
    expect(resonances(run(3, [castStep("EverspringPerfectCatch")]))).toHaveLength(0)
  })
  it("applies Phantom Chime at Tier 3 and raises Resonance damage 20% at Tier 4", () => {
    const spin = [{ type: "skill", skill: "ScarletSpin", duration: 12 }] as RotationStep[]
    const chime = (tier: number) =>
      run(tier, spin)
        .timeline.flatMap(row => Object.values(row.actionStates ?? {}))
        .map(state => state.debuffs.get("PhantomChime")?.stack ?? 0)
        .reduce((highest, value) => Math.max(highest, value), 0)
    // Every resonance adds a stack, so a full cast reaches the five-stack cap.
    expect(chime(3)).toBe(debuffs.PhantomChime.maxStack)
    expect(chime(2)).toBe(0)
    // Tiers are cumulative, so Tier 4 is compared against Tier 3 to isolate the
    // damage bonus from the Tier 3 resistance shred that both share.
    const base = run(3, spin)
    const upgraded = run(4, spin)
    expect(resonanceDamage(base)).toBeGreaterThan(0)
    for (const row of resonances(base)) {
      const id = `${row.id}:0`
      expect(upgraded.actionBreakdowns[id].total / base.actionBreakdowns[id].total).toBeCloseTo(1.2, 6)
    }
  })
  it("resonates Dreamwrought Bubbles on return at Tier 6 only", () => {
    const steps = [castStep("DreamwroughtBubbles")] as RotationStep[]
    expect(summons(run(3, steps))).toHaveLength(0)
    expect(summons(run(6, steps))).toHaveLength(1)
  })
  it("charges Dreamwrought Bubbles for 0.603s and Delicate removes the charge", () => {
    const release = umbrella.DreamwroughtBubblesRelease
    const releaseCastTime = release.castTime
    assert(typeof releaseCastTime === "number", "The release must declare a fixed cast time.")
    const markers = skillActions(release)
      .filter(action => action.type === "damage")
      .map(action => action.time)
    assert(
      markers.every(time => typeof time === "number"),
      "Every release damage action must carry a numeric time.",
    )
    const markerTimes = markers as number[]
    // Both collider markers must land inside the release, which ends at the source
    // interrupt, or the actions would be scheduled as inactive.
    expect(releaseCastTime).toBe(1.0)
    expect(markerTimes.every(time => time < releaseCastTime)).toBe(true)
    const bubbles = (stacks: number, ping = 0) => {
      const input = bundle()
      input.timeline.setupEffects = martialArtEffectsForRank(
        { everspring: martialArtDefinitions.everspring },
        ["everspring"],
        13,
      )
      input.timeline.innerWayConditions = ["PhantomRallyT3"]
      input.timeline.innerWayRules = []
      input.timeline.rotation.ping = ping
      if (stacks) input.timeline.initialBuffs = [{ name: "FragrantSongDelicate", stack: stacks }]
      input.timeline.rotation.steps = [castStep("DreamwroughtBubbles"), castStep("Hit")]
      return calculateRotationBaseline(input).timeline.find(
        row => row.step.type === "skill" && row.step.skill === "DreamwroughtBubbles",
      )!
    }
    const charged = bubbles(0)
    const cancelled = bubbles(4)
    // The charge delays the release, and Delicate slides the markers back to their
    // raw offsets without dropping either hit.
    expect(charged.effectiveCastTime).toBeCloseTo(1.603, 6)
    expect(cancelled.effectiveCastTime).toBeCloseTo(1.0, 6)
    for (const row of [charged, cancelled]) {
      expect(row.actions.filter(action => action.type === "damage").map(action => action.time)).toHaveLength(2)
    }
    expect(charged.actions.filter(action => action.type === "damage").map(action => action.time)).toEqual(
      markers.map(time => time + 0.603),
    )
    expect(cancelled.actions.filter(action => action.type === "damage").map(action => action.time)).toEqual(markers)
    // Delicate is spent by the release, so a single remaining stack still cancels the
    // charge. Consuming it before the charge resolved left the last cast at 1.603 s.
    expect(bubbles(1).effectiveCastTime).toBeCloseTo(1.0, 6)
    // One button press pays input latency once, at dispatch. Each sub-action would
    // otherwise pay it again and stretch the skill by 2 x ping.
    expect(bubbles(0, 40).effectiveCastTime).toBeCloseTo(1.603, 6)
    expect(bubbles(4, 40).effectiveCastTime).toBeCloseTo(1.0, 6)
  })
})
