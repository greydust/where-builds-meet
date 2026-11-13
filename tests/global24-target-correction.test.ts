import { describe, expect, it } from "vitest"

import { combatDefinitionsFor, currentCombatDefinitions } from "@/application/gameData/previews"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { requirementsPass, type EditableObject } from "@/calculations/rotationTimeline"
import { resolveRawStatFormulas } from "@/calculations/statEffects"
import { effectState } from "@/calculations/trackedEffectState"
import { emptyStats } from "@/data/statDefinitions"
import type { WeaponId } from "@/types"

const preview = combatDefinitionsFor("cn-2.8.5")
const shipped = currentCombatDefinitions

function damage(rules: EditableObject[], tags: string[], marks: string[] = [], generic = 0.5, attack = 1000) {
  const stats = { ...emptyStats, minPhys: attack, maxPhys: attack, precision: 1 }
  const self = effectState(marks.map(name => ({ name, stack: 1 })))
  const effects = resolveRawStatFormulas(rules, stats)
    .filter(rule => requirementsPass(rule.requirement, self, effectState([]), tags, new Set()))
    .map(rule => (rule.effect ?? rule) as EditableObject)
  return calculateDamageBreakdown(
    { phyCoef: 1, phyBonus: 100 },
    {
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      attunement: emptyAttunementStats,
      skillTags: tags,
      weapons: [] as WeaponId[],
      buffs: marks,
      effects: [...effects, { hpDMGBonus: generic, targetCorrectionBonus: 0.3 }],
      enemy: {
        name: "Boss",
        level: 1,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
    },
  ).total
}

describe("Global 2.4 target-specific multipliers", () => {
  it.each([13, 14, 15, 16, 17, 18, 19, 20, 21])("preserves Sword Energy scaling at talent rank %s", rank => {
    const rules = preview.martialArtDefinitions.namelessSword.talent[rank][0].effect as EditableObject[]
    const oldRules = shipped.martialArtDefinitions.namelessSword.talent[rank][0].effect as EditableObject[]
    for (const [attack, bonus] of [
      [50, 0],
      [550, 0.1],
      [1500, 0.2],
    ]) {
      for (const generic of [0, 0.5]) {
        const baseline = damage([], ["SwordEnergy"], [], generic, attack)
        expect(damage(rules, ["SwordEnergy"], [], generic, attack) / baseline).toBeCloseTo((1.3 + bonus) / 1.3, 12)
        expect(damage(oldRules, ["SwordEnergy"], [], generic, attack) / baseline).toBeCloseTo(
          (1 + generic + bonus) / (1 + generic),
          12,
        )
      }
      expect(damage(rules, ["Light"], [], 0.5, attack)).toBe(damage([], ["Light"], [], 0.5, attack))
    }
  })

  it.each(["Ballistic", "JadebreakProjectile", "Pursuit", "Light"])("preserves Jadebreak eligibility for %s", tag => {
    const rules = preview.effectDefinitions.Jadebreak.effect as EditableObject[]
    const tags = [tag]
    const projectile = tag === "Ballistic" || tag === "JadebreakProjectile"
    const targetBonus = tag === "Light" ? 0 : 0.1
    const baseline = damage([], tags)
    expect(damage(rules, tags) / baseline).toBeCloseTo(
      (((1.3 + targetBonus) / 1.3) * (1.5 + (projectile ? 0.3 : 0))) / 1.5,
      12,
    )
  })

  it.each(["ScarletSpinStage1", "ScarletSpinStage2", "ScarletSpinStage3", "ScarletSpinStage4", "Resonance"])(
    "moves %s's active catch bonus without granting it to inactive catches",
    id => {
      const skill = preview.skillMaps.Everspring[id]
      const rules = skill.modifier as EditableObject[]
      const oldRules = shipped.skillMaps.Everspring[id].modifier as EditableObject[]
      const mark = id === "Resonance" ? "FragrantSongResonance" : "FragrantSong"
      // Both versions retain guaranteed critical hits; compare with an otherwise identical rule
      // that grants the same critical outcome but no damage bonus.
      const reference = [{ requirement: [{ target: "self", value: mark }], effect: { GuaranteedCrit: true } }]
      for (const generic of [0, 0.5]) {
        const baseline = damage(reference, skill.tags ?? [], [mark], generic)
        expect(damage(rules, skill.tags ?? [], [mark], generic) / baseline).toBeCloseTo(1.5 / 1.3, 12)
        expect(damage(oldRules, skill.tags ?? [], [mark], generic) / baseline).toBeCloseTo(
          (1 + generic + 0.2) / (1 + generic),
          12,
        )
        expect(damage(rules, skill.tags ?? [], [], generic)).toBe(damage(oldRules, skill.tags ?? [], [], generic))
      }
    },
  )
})
