// @vitest-environment jsdom
import blue from "@gamedata/skill/boshan-quyue-spear.json"
import red from "@gamedata/skill/jueyu-xuanfeng-spear.json"
import { expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor, setupConditionsFor } from "@/application/characterComposition"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  calculateDamageBreakdown,
  calculateDamageWithAdditiveResponse,
  takeAdditiveDamageBonusResponse,
  prepareDamageFormula,
} from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline, type RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EditableObject, SkillRecord } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"
import type { WeaponId } from "@/types"

function probe(
  options: {
    art?: WeaponId
    currentArt?: WeaponId
    rank?: number
    tags?: string[]
    conditions?: string[]
    marks?: Array<{ name: string; stack?: number; target?: string }>
    innerWays?: Array<{ innerWay: string; tier: string }>
    maxPhys?: number
    minPhys?: number
    precision?: number
    affinity?: number
    sheetAffinity?: number
    extraEffects?: EditableObject[]
    skill?: SkillRecord
  } = {},
) {
  const weapons: WeaponId[] = ["jueyuXuanfengSpear", "boshanQuyueSpear"]
  const stats = {
    ...emptyStats,
    minPhys: options.minPhys ?? options.maxPhys ?? 1000,
    maxPhys: options.maxPhys ?? 1000,
    precision: options.precision ?? 1,
    directAffinity: options.affinity ?? 0,
    affinity: options.sheetAffinity ?? 0,
    affinityDmgBonus: 0.2,
  }
  const innerWays = options.innerWays ?? []
  const setupEffects = [
    ...(options.art ? martialArtEffectsForRank(martialArtDefinitions, [options.art], options.rank ?? 15) : []),
    ...(options.extraEffects ?? []),
  ]
  const bundle: RotationSimulationBundle = {
    timeline: {
      rotation: {
        name: "Bolt audit",
        steps: [
          { type: "skill", skill: "Mark" },
          { type: "skill", skill: "Hit" },
        ],
      },
      skills: {
        Mark: {
          castTime: 0.01,
          ignorePing: true,
          action: [
            ...(options.currentArt ? [{ type: "switchMartialArt", martialArt: options.currentArt, time: 0 }] : []),
            ...(options.marks ?? []).map(mark => ({
              type: "apply",
              value: mark.name,
              stack: mark.stack ?? 1,
              target: mark.target ?? "self",
              time: 0,
            })),
          ],
        },
        Hit: options.skill ?? {
          castTime: 1,
          tags: ["DirectDamage", ...(options.tags ?? [])],
          action: [{ type: "damage", phyCoef: 1, time: 0 }],
        },
      },
      effectDefinitions,
      dots: {},
      eventDefinitions: {},
      weapons,
      martialArtState: { jueyuXuanfengSpear: { weapon: "Spear" }, boshanQuyueSpear: { weapon: "Spear" } },
      innerWayConditions: [
        ...innerWayConditionsFor(innerWays, undefined, "bellstrikeBolt"),
        ...setupConditionsFor(setupEffects),
        ...(options.conditions ?? []),
      ],
      innerWayRules: innerWayEffectRulesFor(innerWays, 19, "bellstrikeBolt"),
      setupEffects,
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    weapons,
    enemy: {
      name: "Audit",
      level: 1,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
  return calculateRotationBaseline(bundle)
}

it("applies 泉威 to ordinary damage and adds its T3 enhancement only to VC-series hits", () => {
  const marks = [{ name: "BoltQuanWei", target: "target" }]
  expect(probe({ marks }).metrics.totalDamage / probe().metrics.totalDamage).toBeCloseTo(1.08, 12)
  for (const tags of [["BoltVCSeries"], []]) {
    const conditions = ["FuLiangYiYeT3"]
    const multiplier = tags.length ? 1.14 : 1.08
    expect(probe({ marks, tags, conditions }).metrics.totalDamage / probe({ tags }).metrics.totalDamage).toBeCloseTo(
      multiplier,
      12,
    )
  }
})

it("adds 載戈 stacks to Category 1 independently of 鳴戈's base-damage bonus", () => {
  const options = { tags: ["BoltMingGe"], extraEffects: [{ effect: { baseDMGBonus: 0.6, hpDMGBonus: 0.2 } }] }
  for (const stack of [1, 5, 15]) {
    const marked = probe({ ...options, marks: [{ name: "BoltZaigeStacks", target: "target", stack }] })
    expect(marked.metrics.totalDamage / probe(options).metrics.totalDamage).toBeCloseTo((1.2 + stack * 0.1) / 1.2, 12)
  }
  expect(probe({ marks: [{ name: "BoltZaigeStacks", target: "target", stack: 15 }] }).metrics.totalDamage).toBe(
    probe().metrics.totalDamage,
  )
})

it.each([2, 6, 8, 15])("applies the blue rank %s talent to all 鋒銳 damage and to 鳴戈 outside 鋒銳", rank => {
  const options = { art: "boshanQuyueSpear" as const, rank, maxPhys: 1249 }
  const cap = rank < 6 ? 0.04 : rank < 8 ? 0.08 : 0.12
  const bonus = Math.min(0.09, cap)
  for (const tags of [[], ["BoltVCSeries"], ["Mystic"]]) {
    expect(
      probe({ ...options, tags, marks: [{ name: "BoltFengRui" }] }).metrics.totalDamage /
        probe({ ...options, tags }).metrics.totalDamage,
    ).toBeCloseTo(1 + bonus, 12)
  }
  expect(
    probe({ ...options, tags: ["BoltMingGe"] }).metrics.totalDamage / probe(options).metrics.totalDamage,
  ).toBeCloseTo(1 + bonus, 12)
  expect(
    probe({ ...options, maxPhys: 1250, tags: ["BoltMingGe"] }).metrics.totalDamage /
      probe({ ...options, maxPhys: 1250 }).metrics.totalDamage,
  ).toBeCloseTo(1 + Math.min(0.1, cap), 12)
})

it.each([
  [2, 0.06],
  [6, 0.12],
  [8, 0.18],
  [15, 0.18],
])("applies red rank %s Affinity scaling in complete 100-attack steps", (rank, cap) => {
  const options = { art: "jueyuXuanfengSpear" as const, rank, affinity: 1, maxPhys: 999 }
  expect(
    probe({ ...options, tags: ["BoltVCSeries"] }).metrics.totalDamage / probe(options).metrics.totalDamage,
  ).toBeCloseTo((1.2 + Math.min(0.108, cap)) / 1.2, 12)
})

it("grants the low-rank 鋒銳 damage bonus without prematurely preventing Abrasion", () => {
  const base = { art: "jueyuXuanfengSpear" as const, rank: 0, precision: 0, minPhys: 500, tags: ["BoltVCSeries"] }
  const marks = [{ name: "BoltFengRui" }]
  expect(probe({ ...base, marks }).metrics.totalDamage / probe(base).metrics.totalDamage).toBeCloseTo(1.15, 12)
  expect(probe({ ...base, rank: 5, marks }).metrics.totalDamage).toBeGreaterThan(
    probe({ ...base, marks }).metrics.totalDamage,
  )
})

it("uses the upgraded 王行 duration only from talent rank five", () => {
  for (const [rank, duration] of [
    [0, 12],
    [4, 12],
    [5, 24],
    [15, 24],
  ]) {
    const result = probe({ art: "boshanQuyueSpear", rank, skill: blue.BoltBlueSpecial as SkillRecord })
    const row = result.timeline.find(entry => entry.step.skill === "Hit")!
    const hit = row.actions.findIndex(action => action.type === "damage")
    const wang = row.actionStates[hit].buffs.get("BoltWangXing")!
    expect(wang.expiresAt! - wang.appliedAt!).toBe(duration)
  }
})

it("retains red's no-flat proc enhancement while wielding blue", () => {
  const base = { art: "jueyuXuanfengSpear" as const, currentArt: "boshanQuyueSpear" as const, rank: 15 }
  expect(probe({ ...base, tags: ["BoltNoFlat"] }).metrics.totalDamage / probe(base).metrics.totalDamage).toBeCloseTo(
    1.015,
    12,
  )
})

it("applies 神斷青鋒's T0 Affinity bonus only while red is wielded", () => {
  const options = { innerWays: [{ innerWay: "ShenDuanQingFeng", tier: "T0" }], tags: ["BoltVCSeries"], affinity: 1 }
  const redDamage = probe({ ...options, currentArt: "jueyuXuanfengSpear" }).metrics.totalDamage
  const blueDamage = probe({ ...options, currentArt: "boshanQuyueSpear" }).metrics.totalDamage
  expect(redDamage / blueDamage).toBeCloseTo(1.25 / 1.2, 12)
})

it.each(["jueyuXuanfengSpear", "boshanQuyueSpear"] as const)(
  "applies %s's flat talent from the wielded-art damage snapshot",
  art => {
    const skill = {
      castTime: 1,
      tags: ["DirectDamage", "Bolt"],
      action: [{ type: "damage", phyCoef: 1, phyBonus: 100, time: 0 }],
    }
    const otherArt = art === "jueyuXuanfengSpear" ? "boshanQuyueSpear" : "jueyuXuanfengSpear"
    expect(probe({ art, currentArt: art, skill }).metrics.totalDamage).toBeCloseTo(1115, 10)
    expect(probe({ art, currentArt: otherArt, skill }).metrics.totalDamage).toBeCloseTo(1100, 10)
  },
)

it("grants T6 通判's extra penetration to 載戈 and 鳴戈 as well as primary VCs", () => {
  const innerWays = [{ innerWay: "MingFeiTongPan", tier: "T6" }]
  const marks = [{ name: "BoltTongPan", stack: 5 }]
  for (const tags of [
    ["BoltVCSeries", "BoltZaige"],
    ["BoltVCSeries", "BoltMingGe"],
    ["BoltVCSeries", "BoltVC"],
  ]) {
    expect(
      probe({ innerWays, marks, tags }).metrics.totalDamage / probe({ innerWays, marks }).metrics.totalDamage,
    ).toBeCloseTo(1.1 / 1.05, 12)
  }
})

it.each([0.125, 0.4])(
  "keeps 月湧方圓's PvE correction separate from Category 1 at %s effective Affinity",
  sheetAffinity => {
    for (const skill of [blue.BoltMoonTide, blue.BoltMoonBurst]) {
      const base = {
        skill,
        sheetAffinity,
        extraEffects: [{ effect: { hpDMGBonus: 0.2, baseDMGBonus: 0.5, targetCorrectionBonus: 0.1 } }],
      }
      const bonus = sheetAffinity < 0.3 ? 0.12 : 0.3
      const enhanced = probe({ ...base, conditions: ["YueYongFangYuanT6"] })
      expect(enhanced.metrics.totalDamage / probe(base).metrics.totalDamage).toBeCloseTo((1.1 + bonus) / 1.1, 12)
    }
  },
)

it.each([
  [blue.BoltZaige, 1.5],
  [blue.BoltMingGe, 1.6],
  [red.BoltRedVCBase, 1.3],
  [red.BoltRedVCSharp, 1.5],
  [blue.BoltBlueVCBase, 1.3],
  [blue.BoltBlueVCSharp, 1.5],
] as const)("multiplies %s's NPC correction by 鋒銳's independent ratio", (definition, npc) => {
  const action = definition.action.find(action => action.type === "damage")!
  const skill = { ...definition, action: [action] } as SkillRecord
  const uncorrected = probe({ skill: { ...skill, modifier: [] } }).metrics.totalDamage
  const normal = probe({ skill }).metrics.totalDamage
  const sharp = probe({ skill, extraEffects: [{ effect: { baseDMGBonus: 0.3 } }] }).metrics.totalDamage
  expect(normal / uncorrected).toBeCloseTo(npc, 12)
  expect(sharp / uncorrected).toBeCloseTo(npc * 1.3, 12)
})

it("only forces 鳴戈 Affinity when 浮梁一夜 T6 is present", () => {
  const skill = blue.BoltMingGe as SkillRecord
  const normal = probe({ skill }).metrics.totalDamage
  const enhanced = probe({ skill, conditions: ["FuLiangYiYeT6"] }).metrics.totalDamage
  expect(enhanced / normal).toBeCloseTo(1.2, 12)
})

it("uses the target-correction bracket in static aggregates, prepared formulas and additive attribution", () => {
  const unconditional = [{ effect: { targetCorrectionBonus: 0.2 } }]
  const conditional = [
    { requirement: [{ target: "skillTag", value: "DirectDamage" }], effect: { targetCorrectionBonus: 0.2 } },
  ]
  expect(probe({ extraEffects: unconditional }).metrics.totalDamage / probe().metrics.totalDamage).toBeCloseTo(1.2, 12)
  expect(probe({ extraEffects: conditional }).metrics.totalDamage).toBe(
    probe({ extraEffects: unconditional }).metrics.totalDamage,
  )
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 }
  const context = {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    skillTags: ["DirectDamage"],
    weapons: ["jueyuXuanfengSpear" as const],
    buffs: [],
    enemy: {
      name: "Probe",
      level: 1,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    effects: [{ baseDMGBonus: 0.3, targetCorrectionBonus: 0.6, hpDMGBonus: 0.2 }],
  }
  const action = { phyCoef: 1 }
  const original = calculateDamageWithAdditiveResponse(action, context)
  expect(original.total).toBeCloseTo(1000 * 1.3 * 1.6 * 1.2, 10)
  const response = takeAdditiveDamageBonusResponse(original)!
  const changed = { ...context, effects: [...context.effects, { hpDMGBonus: 0.4 }] }
  expect(response(changed)).toBeCloseTo(calculateDamageBreakdown(action, changed).total, 10)
  const prepared = prepareDamageFormula(action, context)
  const changedStats = calculateDerivedStats({ ...stats, minPhys: 1100, maxPhys: 1100 }, 0)
  expect(prepared.evaluate(changedStats).total).toBeCloseTo(1100 * 1.3 * 1.6 * 1.2, 10)
  expect(
    prepared.response().coefficients.effectiveMinPhys + prepared.response().coefficients.effectiveMaxPhys,
  ).toBeCloseTo(1.3 * 1.6 * 1.2, 12)
})
