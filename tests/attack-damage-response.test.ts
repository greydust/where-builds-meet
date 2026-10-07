import { afterEach, describe, expect, it, vi } from "vitest"

import * as actionStats from "@/calculations/actionStats"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, createPreparedDamageCalculator, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { attackStatFields, RotationDamageResponse } from "@/calculations/rotationDamageResponse"
import { emptyStats } from "@/data/statDefinitions"

const enemy = {
  name: "Response target",
  level: 96,
  defense: 405,
  physicalResistance: 12,
  bellstrikeResistance: 10,
  stonesplitResistance: 10,
  silkbindResistance: 10,
  bamboocutResistance: 10,
  judgementResistance: 0,
}
const stats = {
  ...emptyStats,
  minPhys: 1000,
  maxPhys: 1800,
  minBamboocut: 100,
  maxBamboocut: 200,
  precision: 0.9,
  crit: 0.3,
  affinity: 0.2,
  critDmgBonus: 0.5,
  affinityDmgBonus: 0.8,
}
function context(): DamageContext {
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0, {}, ["infernalTwinblades"]),
    attunement: emptyAttunementStats,
    enemy,
    weapons: ["infernalTwinblades"],
    effects: [],
    buffs: [],
    skillTags: ["DirectDamage"],
  }
}
function bundle(): RotationSimulationBundle {
  return {
    stats,
    enemy,
    attunement: emptyAttunementStats,
    weapons: ["infernalTwinblades"],
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
    timeline: {
      rotation: { name: "Response", steps: [{ type: "skill", skill: "Hit" }] },
      skills: {
        Hit: {
          name: "Hit",
          castTime: 3,
          tags: ["DirectDamage"],
          action: [
            { type: "damage", time: 0, phyCoef: 1.5, attrCoef: 0.7, phyBonus: 20 },
            { type: "damage", time: 1, phyCoef: 0.9, attrCoef: 0.3 },
          ],
        },
      },
      dots: {},
      effectDefinitions: {},
      eventDefinitions: {},
      innerWayRules: [],
      innerWayConditions: [],
      setupEffects: [],
      weapons: ["infernalTwinblades"],
    },
  }
}
afterEach(() => vi.restoreAllMocks())

describe("prepared damage responses", () => {
  it("reuses per-hit outcome formulas across attack and rate changes, including capped/guaranteed outcomes", () => {
    const action = { type: "damage", phyCoef: 1.5, attrCoef: 0.7, phyBonus: 31, attrBonus: 15, damageScale: 0.37 }
    const calculate = createPreparedDamageCalculator()
    for (const effects of [
      [],
      [{ GuaranteedCrit: true }],
      [{ GuaranteedAffinity: true }],
      [{ NoAbrasion: true }],
      [{ convert: { from: "effectiveCrit", to: "effectiveAffinity", ratio: 0.25 } }],
    ]) {
      for (let i = 0; i < 20; i++) {
        const next = {
          ...stats,
          minPhys: 200 + i * 90,
          maxPhys: 1500 + i * 37,
          minBamboocut: i * 10,
          precision: 0.6 + i * 0.03,
          crit: i * 0.07,
          affinity: i * 0.03,
        }
        const input = {
          ...context(),
          stats: next,
          derivedStats: calculateDerivedStats(next, 0, {}, ["infernalTwinblades"]),
          effects,
        }
        expect(calculate(action, input)).toEqual(calculateDamageBreakdown(action, input))
      }
    }
  })
  it("reevaluates a prepared hit without rereading fixed damage effects", () => {
    let reads = 0
    const effects = [
      {
        get dmgBonus() {
          reads++
          return 0.15
        },
      },
    ]
    const calculate = createPreparedDamageCalculator()
    const action = { type: "damage", phyCoef: 1, attrCoef: 0.7 }
    calculate(action, { ...context(), effects })
    reads = 0
    const next = { ...stats, minPhys: 1100, crit: 0.4 }
    const result = calculate(action, {
      ...context(),
      stats: next,
      derivedStats: calculateDerivedStats(next, 0, {}, ["infernalTwinblades"]),
      effects,
    })
    expect(reads).toBe(0)
    expect(result).toEqual(
      calculateDamageBreakdown(action, {
        ...context(),
        stats: next,
        derivedStats: calculateDerivedStats(next, 0, {}, ["infernalTwinblades"]),
        effects,
      }),
    )
  })
  it("invalidates prepared multipliers and reevaluates formulas that read changed attack", () => {
    const calculate = createPreparedDamageCalculator()
    const action = { type: "damage", phyCoef: 1, attrCoef: 1 }
    for (const minPhys of [1000, 1500])
      for (const physDmgBonus of [0, 0.2]) {
        const next = { ...stats, minPhys, physDmgBonus }
        const input = {
          ...context(),
          stats: next,
          derivedStats: calculateDerivedStats(next, 0),
          effects: [{ dmgBonus: { formula: { source: "minPhys", multiplier: 0.0001 } } }],
        }
        expect(calculate(action, input)).toEqual(calculateDamageBreakdown(action, input))
      }
  })
  it("aggregates physical and attribute slopes and rejects crossing physical clamps or attack normalization", () => {
    const input = context()
    const action = { type: "damage", phyCoef: 1.5, attrCoef: 0.7, phyBonus: 20, attrBonus: 10 }
    const response = new RotationDamageResponse()
    response.addDamage(action, input)
    const delta = { minPhys: 23, maxPhys: 40, minBamboocut: 7, maxBamboocut: 11 }
    const next = {
      ...input,
      derivedStats: {
        ...input.derivedStats,
        ...Object.fromEntries(
          Object.entries(delta).map(([field, value]) => [
            attackStatFields[field as keyof typeof attackStatFields],
            input.derivedStats[attackStatFields[field as keyof typeof attackStatFields]] + value,
          ]),
        ),
      },
    }
    expect(response.evaluate(delta)).toBeCloseTo(
      calculateDamageBreakdown(action, next).total - calculateDamageBreakdown(action, input).total,
      10,
    )
    expect(response.evaluate({ minPhys: -900 })).toBeUndefined()
    expect(response.evaluate({ minPhys: 1000 })).toBeUndefined()
  })
  it("evaluates cached rotation coefficients without visiting hits and matches forced full calculations", () => {
    const input = bundle()
    input.statPriority = [
      { label: "Attack", stats: { ...stats, minPhys: 1023, maxPhys: 1840, minBamboocut: 107, maxBamboocut: 211 } },
    ]
    const baseline = calculateRotationBaseline(input)
    const fast = calculateRotationComparisons(input, baseline)
    const observed = vi.spyOn(actionStats, "resolveActionStatContext")
    const repeated = calculateRotationComparisons(input, baseline)
    expect(observed).not.toHaveBeenCalled()
    expect(repeated).toEqual(fast)
    const full = calculateRotationComparisons(
      {
        ...input,
        statPriority: input.statPriority.map(variant => Object.assign({}, variant, { timeline: input.timeline })),
      },
      baseline,
    )
    expect(fast.statPriority[0].dpsDifference).toBeCloseTo(full.statPriority[0].dpsDifference, 10)
    expect(fast.statPriority[0].increase).toBeCloseTo(full.statPriority[0].increase, 10)
  })
  it("handles normalized attack ranges and capped raw talents without visiting hits", () => {
    const input = bundle()
    input.stats = { ...stats, minPhys: 1800, maxPhys: 1000, minVoidAttack: 50, maxVoidAttack: 10 }
    input.timeline.setupEffects = [
      { statStage: "talent", stat: { critDmgBonus: { formula: { source: "minPhys", multiplier: 0.001, max: 0.25 } } } },
    ]
    input.statPriority = [{ label: "Minimum", stats: { ...input.stats, minPhys: 1810 } }]
    const baseline = calculateRotationBaseline(input)
    const fast = calculateRotationComparisons(input, baseline)
    const observed = vi.spyOn(actionStats, "resolveActionStatContext")
    calculateRotationComparisons(input, baseline)
    expect(observed).not.toHaveBeenCalled()
    const full = calculateRotationComparisons(
      {
        ...input,
        statPriority: input.statPriority.map(variant => Object.assign({}, variant, { timeline: input.timeline })),
      },
      baseline,
    )
    expect(fast.statPriority[0].dpsDifference).toBeCloseTo(full.statPriority[0].dpsDifference, 10)
  })
  it("falls back for clamp crossings, attack-dependent formulas, non-attack changes, and foreign baselines", () => {
    for (const change of [{ minPhys: 2000 }, { minPhys: 200 }, { crit: 0.5 }, { physDmgBonus: 0.1 }]) {
      const input = bundle()
      input.statPriority = [{ label: "Variant", stats: { ...stats, ...change } }]
      const baseline = calculateRotationBaseline(input)
      const full = calculateRotationComparisons(
        {
          ...input,
          statPriority: input.statPriority.map(variant => Object.assign({}, variant, { timeline: input.timeline })),
        },
        baseline,
      )
      expect(calculateRotationComparisons(input, baseline).statPriority).toEqual(full.statPriority)
      expect(calculateRotationComparisons(input, structuredClone(baseline)).statPriority).toEqual(full.statPriority)
    }
    const input = bundle()
    input.timeline.setupEffects = [{ stat: { physDmgBonus: { formula: { source: "minPhys", multiplier: 0.0001 } } } }]
    input.statPriority = [{ label: "Attack", stats: { ...stats, minPhys: 1023 } }]
    const baseline = calculateRotationBaseline(input)
    const full = calculateRotationComparisons(
      {
        ...input,
        statPriority: input.statPriority.map(variant => Object.assign({}, variant, { timeline: input.timeline })),
      },
      baseline,
    )
    expect(calculateRotationComparisons(input, baseline).statPriority).toEqual(full.statPriority)
  })
})

describe("attunement damage responses", () => {
  it("matches full calculation with overlapping bonuses and skips hits after preparation", () => {
    const input = bundle()
    input.timeline.skills.Hit.tags = ["InfernalTwinblades", "MartialArt", "Special"]
    input.attunement = { ...emptyAttunementStats, infernalMartialBoost: 0.2, infernalSpecialBoost: 0.15 }
    const baseline = calculateRotationBaseline(input)
    const variant = { label: "Martial boost", attunement: { ...input.attunement, infernalMartialBoost: 0.27 } }
    const comparison = { ...input, attunementPriority: [variant] }
    const first = calculateRotationComparisons(comparison, baseline)
    const spy = vi.spyOn(actionStats, "resolveActionStatContext")
    const cached = calculateRotationComparisons(comparison, baseline)
    expect(spy).not.toHaveBeenCalled()
    expect(cached).toEqual(first)
    const full = calculateRotationComparisons(
      { ...comparison, attunementPriority: [{ ...variant, timeline: input.timeline }] },
      baseline,
    )
    expect(cached.attunementPriority[0].dpsDifference).toBeCloseTo(full.attunementPriority[0].dpsDifference, 10)
    expect(cached.attunementPriority[0].dpsDifference).toBeGreaterThan(0)
  })

  it("guards multiplier sign crossings and excludes penetration", () => {
    const response = new RotationDamageResponse()
    const input = {
      ...context(),
      skillTags: ["InfernalTwinblades", "MartialArt"],
      attunement: { ...emptyAttunementStats, infernalMartialBoost: 0.2 },
    }
    response.addAttunementDamage(120, input)
    expect(response.evaluateAttunement("infernalMartialBoost", 0.1)).toBeCloseTo(10, 12)
    expect(response.evaluateAttunement("infernalMartialBoost", -1.2)).toBeUndefined()
    expect(response.evaluateAttunement("physicalPenetration", 1)).toBeUndefined()
    expect(response.evaluateAttunement("mortalMartialBoost", 0.1)).toBe(0)
    const excluded = new RotationDamageResponse()
    excluded.addAttunementDamage(120, { ...input, skillTags: ["ThundercryBlade", "Charged", "StonebreakerQuake"] })
    expect(excluded.evaluateAttunement("thundercryChargedBoost", 0.1)).toBe(0)
    const replay = new RotationDamageResponse()
    replay.add(response, 0.35)
    expect(replay.evaluateAttunement("infernalMartialBoost", 0.1)).toBeCloseTo(3.5, 12)
  })
})
