import skills from "@gamedata/skill/snowparting-blade.json"
import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, type AttunementStats } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
const enemy = {
  name: "Probe",
  level: 100,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}

function damage(
  skill: typeof skills.AnxiSoldierSnowbreakSpring | typeof skills.AnxiSoldierSnowbreakSpringEnhanced,
  attunement: Partial<AttunementStats> = {},
) {
  return skill.action.reduce(
    (sum, action) =>
      sum +
      calculateDamageBreakdown(action, {
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        attunement: { ...emptyAttunementStats, ...attunement },
        skillTags: skill.tags,
        weapons: ["snowparting", "phalanxbane"],
        buffs: [],
        effects: skill.modifier.map(modifier => modifier.effect),
        enemy,
      }).total,
    0,
  )
}

it.each([
  ["ordinary soldier", skills.AnxiSoldierSnowbreakSpring, 1.1],
  ["enhanced soldier", skills.AnxiSoldierSnowbreakSpringEnhanced, 1],
])("applies the observed VC attunement behavior to %s", (_name, skill, multiplier) => {
  expect(damage(skill, { snowpartingVariedComboBoost: 0.1 }) / damage(skill)).toBeCloseTo(multiplier, 12)
})

it("preserves enhanced soldier base damage and weapon penetration", () => {
  expect(damage(skills.AnxiSoldierSnowbreakSpringEnhanced) / damage(skills.AnxiSoldierSnowbreakSpring)).toBeCloseTo(
    1.4,
    12,
  )
  expect(
    damage(skills.AnxiSoldierSnowbreakSpringEnhanced, { physicalPenetration: 10 }) /
      damage(skills.AnxiSoldierSnowbreakSpringEnhanced),
  ).toBeCloseTo(1.05, 12)
})

it("still boosts the player's Snowbreak Spring damage", () => {
  const action = skills.SnowpartingHeavyVC.action.find(action => action.type === "damage")!
  const context = {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    skillTags: skills.SnowpartingHeavyVC.tags,
    weapons: ["snowparting" as const, "phalanxbane" as const],
    buffs: [],
    effects: [],
    enemy,
  }
  const baseline = calculateDamageBreakdown(action, { ...context, attunement: emptyAttunementStats }).total
  const boosted = calculateDamageBreakdown(action, {
    ...context,
    attunement: { ...emptyAttunementStats, snowpartingVariedComboBoost: 0.1 },
  }).total
  expect(boosted / baseline).toBeCloseTo(1.1, 12)
})
