import umbrella from "@gamedata/martial-art/vernal-umbrella.json"
import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, calculateSimulatedDamageBreakdown, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { requirementsPass, type EditableObject } from "@/calculations/rotationTimeline"
import { effectsForTrackedEffect } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"

import { skillActions, rankTalentEffects } from "./helpers/shippedData"

const stats = {
  ...emptyStats,
  minPhys: 100,
  maxPhys: 200,
  minSilkbind: 40,
  maxSilkbind: 90,
  precision: 1,
  crit: 0.5,
  affinity: 0.1,
}
function context(tags: string[], effects: EditableObject[] = []): DamageContext {
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    skillTags: tags,
    weapons: ["vernalUmbrella", "inkwellFan"],
    buffs: [],
    effects,
    enemy: {
      name: "Dummy",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
  }
}
function matchingEffects(id: string, tags: string[]) {
  return (effectDefinitions[id].effect as EditableObject[])
    .filter(e => requirementsPass(e.requirement, new Map(), new Map(), tags, new Set()))
    .map(e => e.effect as EditableObject)
}
describe("Jade NPC hit factors and distinct boost eligibility", () => {
  it.each([1, 3, 5])("applies SS damage per stack at %s stacks", stack => {
    const skill = allSkillDefinitions.ForsakenFameCancel
    const action = skillActions(skill).find(a => a.type === "damage")!
    const ctx = context(skill.tags!)
    const effects = (effectsForTrackedEffect(stack, effectDefinitions.StartlingSpring) as EditableObject[])
      .filter(e => requirementsPass(e.requirement, new Map(), new Map(), skill.tags!, new Set()))
      .map(e => e.effect as EditableObject)
    expect(
      calculateDamageBreakdown(action, { ...ctx, effects }).total / calculateDamageBreakdown(action, ctx).total,
    ).toBeCloseTo(1 + 0.04 * stack, 12)
  })
  it.each([13, 14, 15])("grants FF the ordinary projectile resistance ignore at rank %s", rank => {
    const skill = allSkillDefinitions.ForsakenFameCancel
    const action = skillActions(skill).find(a => a.type === "damage")!
    const rules = rankTalentEffects(umbrella.talent[rank])
    const effects = rules
      .filter(e => requirementsPass(e.requirement, new Map(), new Map(), skill.tags!, new Set()))
      .map(e => e.effect as EditableObject)
      .filter(e => e?.physicalResistance !== undefined)
    const ctx = context(skill.tags!)
    const expected = calculateDamageBreakdown(action, { ...ctx, effects: [{ physicalResistance: -5 }] })
    expect(calculateDamageBreakdown(action, { ...ctx, effects }).total).toBe(expected.total)
    expect(expected.total).toBeGreaterThan(calculateDamageBreakdown(action, ctx).total)
  })
  it.each([
    ["UnfadingFlowerProjectile", 1.15],
    ["ForsakenFame", 1.45],
    ["ForsakenFameCancel", 1.45],
  ] as const)("%s scales the complete hit independently of additive boosts", (id, factor) => {
    const skill = allSkillDefinitions[id],
      action = skillActions(skill).find(a => a.type === "damage")!
    for (const additive of [0, 0.6]) {
      const ctx = context(skill.tags!, [
        { hpDMGBonus: additive },
        ...((skill.modifier ?? []) as EditableObject[]).map(e => e.effect as EditableObject),
      ])
      const base = { ...action, damageScale: 1 }
      expect(calculateDamageBreakdown(action, ctx).total).toBeCloseTo(
        calculateDamageBreakdown(base, context(skill.tags!, [{ hpDMGBonus: additive }])).total * factor,
        9,
      )
      expect(calculateDamageBreakdown(action, ctx).total / calculateDamageBreakdown(base, ctx).total).toBeCloseTo(
        factor,
        12,
      )
      for (const roll of [0.1, 0.6, 0.99])
        expect(
          calculateSimulatedDamageBreakdown(action, ctx, () => roll).total /
            calculateSimulatedDamageBreakdown(base, ctx, () => roll).total,
        ).toBeCloseTo(factor, 12)
    }
  })
  it("retains Combo and both Jadebreak branches for UF", () => {
    const skill = allSkillDefinitions.UnfadingFlowerProjectile
    const action = skillActions(skill).find(a => a.type === "damage")!
    const ctx = context(skill.tags!)
    const base = calculateDamageBreakdown(action, ctx).total
    expect(
      calculateDamageBreakdown(action, {
        ...ctx,
        effects: [...matchingEffects("Jadebreak", skill.tags!), ...matchingEffects("JadeCombo", skill.tags!)],
      }).total / base,
    ).toBeCloseTo(1.5, 12)
  })
  it.each(["ForsakenFame", "ForsakenFameCancel"])("%s receives 40% Jadebreak without receiving Combo", id => {
    const skill = allSkillDefinitions[id],
      action = skillActions(skill).find(a => a.type === "damage")!,
      ctx = context(skill.tags!)
    const base = calculateDamageBreakdown(action, ctx).total
    const boosted = calculateDamageBreakdown(action, {
      ...ctx,
      effects: matchingEffects("Jadebreak", skill.tags!),
    }).total
    expect(boosted / base).toBeCloseTo(1.4, 12)
    expect(calculateDamageBreakdown(action, { ...ctx, effects: matchingEffects("JadeCombo", skill.tags!) }).total).toBe(
      base,
    )
  })
})
