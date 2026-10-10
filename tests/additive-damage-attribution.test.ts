import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  calculateDamageBreakdown,
  calculateDamageWithAdditiveResponse,
  takeAdditiveDamageBonusResponse,
  type DamageContext,
} from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

function fixture(defense = 405): DamageContext {
  const stats = {
    ...emptyStats,
    minPhys: 1000,
    maxPhys: 1800,
    minBamboocut: 100,
    maxBamboocut: 200,
    minBellstrike: 30,
    maxBellstrike: 80,
    precision: 0.9,
    crit: 0.3,
    affinity: 0.2,
    critDmgBonus: 0.5,
    affinityDmgBonus: 0.8,
    vsBossDmg: 0.2,
  }
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0, {}, ["infernalTwinblades"]),
    attunement: emptyAttunementStats,
    weapons: ["infernalTwinblades"],
    buffs: ["Boost"],
    enemy: {
      name: "Target",
      level: 96,
      defense,
      physicalResistance: 12,
      bellstrikeResistance: 10,
      stonesplitResistance: 10,
      silkbindResistance: 10,
      bamboocutResistance: 10,
      judgementResistance: 0,
    },
    effects: [{ critDmgBonus: 0.12 }, { dmgBonus: 0.15 }],
    skillTags: ["DirectDamage", "MartialArts"],
    unconditionalDamageEffects: { dmgBonus: 0.2, hpDMGBonus: 0.1, attributeDMGBonus: 0.15 },
    distance: 5,
  }
}
const action = { type: "damage", phyCoef: 1.5, attrCoef: 0.7, phyBonus: 20, damageScale: 0.17 }

describe("additive damage attribution reuse", () => {
  it.each([405, 3000])("preserves exact channel/outcome arithmetic and physical clamping at defense %s", defense => {
    const before = fixture(defense)
    const result = calculateDamageWithAdditiveResponse(action, before)
    expect(result).toEqual(calculateDamageBreakdown(action, before))
    const response = takeAdditiveDamageBonusResponse(result)!
    for (const bonus of [0, 0.3, -1.5]) {
      const after = {
        ...before,
        buffs: [],
        effects: [{ critDmgBonus: 0.12 }],
        unconditionalDamageEffects: { ...before.unconditionalDamageEffects, dmgBonus: bonus },
      }
      expect(response(after)).toBe(calculateDamageBreakdown(action, after).total)
    }
    expect(takeAdditiveDamageBonusResponse(result)).toBeUndefined()
  })

  it("resolves distance bonuses and weapon-restricted HP bonuses at the recorded hit state", () => {
    const before = fixture()
    before.effects.push(
      { dmgBonus: { function: "segment", param1: "distance", param2: [3, 6], param3: [0.01, 0.1, 0.2] } },
      { hpDMGBonus: 0.3, hpDMGBonusWeapons: ["infernalTwinblades"] },
      { hpDMGBonus: 0.9, hpDMGBonusWeapons: ["strategicSword"] },
    )
    const response = takeAdditiveDamageBonusResponse(calculateDamageWithAdditiveResponse(action, before))!
    const after = { ...before, effects: [before.effects[0]] }
    expect(response(after)).toBe(calculateDamageBreakdown(action, after).total)
  })

  it("rejects changes to stats, non-additive effects, and hit conditions", () => {
    const before = fixture()
    delete before.distance
    const response = takeAdditiveDamageBonusResponse(calculateDamageWithAdditiveResponse(action, before))!
    const changes: Partial<DamageContext>[] = [
      { distance: 4 },
      { stats: { ...before.stats, minPhys: 900 } },
      { effects: [{ critDmgBonus: 0.3 }] },
      { unconditionalDamageEffects: { ...before.unconditionalDamageEffects, physicalPenetration: 20 } },
    ]
    for (const change of changes) expect(response({ ...before, ...change })).toBeUndefined()
  })

  it("leaves probability mixtures on the existing full calculation path", () => {
    const before = fixture()
    before.expectedEffects = [
      [
        { probability: 0.4, effects: [{ critDmgBonus: 0.2 }] },
        { probability: 0.6, effects: [] },
      ],
    ]
    const result = calculateDamageWithAdditiveResponse(action, before)
    expect(result).toEqual(calculateDamageBreakdown(action, before))
    expect(takeAdditiveDamageBonusResponse(result)).toBeUndefined()
  })
})
