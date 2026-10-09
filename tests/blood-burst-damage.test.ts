import swordSkills from "@gamedata/skill/strategic-sword.json"
import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

it("Blood Burst receives Art of Sword and High Bleed bonuses while excluding ordinary DOT bonuses", () => {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
  const context: DamageContext = {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    skillTags: swordSkills.BloodBurstDamage.tags,
    weapons: ["strategicSword"],
    buffs: [],
    effects: [],
    isDot: false,
    enemy: {
      name: "Probe",
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
  const action = swordSkills.BloodBurstDamage.action[0]
  const baseline = calculateDamageBreakdown(action, context)
  const boosted = calculateDamageBreakdown(action, { ...context, stats: { ...stats, swordDmgBoost: 0.2 } })
  expect(boosted.physical / baseline.physical).toBeCloseTo(1.2, 10)
  expect(boosted.bellstrike / baseline.bellstrike).toBeCloseTo(1.2, 10)
  const martialArts = calculateDamageBreakdown(action, { ...context, stats: { ...stats, allMartialArts: 0.3 } })
  expect(martialArts.total / baseline.total).toBeCloseTo(1.3, 10)
  const both = calculateDamageBreakdown(action, {
    ...context,
    stats: { ...stats, swordDmgBoost: 0.2, allMartialArts: 0.3 },
  })
  expect(both.total / baseline.total).toBeCloseTo(1.5, 10)
  const highBleed = calculateDamageBreakdown(action, { ...context, effects: [{ dotDamage: 1, highBleedDamage: 0.5 }] })
  expect(highBleed.total / baseline.total).toBeCloseTo(1.5, 10)
})
