import spearSkills from "@gamedata/skill/heavenquaker-spear.json"
import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

it.each([
  ["SweepAllWaterDrop", 0.8],
  ["SweepAllSpringSurge", 1],
  ["SweepAllRiverFlow", 1.2],
] as const)("%s cancel deals only the first 40%% of the stance's full damage", (id, stanceMultiplier) => {
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, minBellstrike: 500, maxBellstrike: 500, precision: 1 }
  const context: DamageContext = {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    skillTags: spearSkills[id].tags,
    weapons: ["heavenquakerSpear"],
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
  const baseline = spearSkills.SoberSorrow.action
    .filter(action => action.type === "damage")
    .reduce((sum, action) => sum + calculateDamageBreakdown(action, context).total, 0)
  const hits = spearSkills[id].action.filter(action => action.type === "damage")
  const damage = hits.reduce((sum, action) => sum + calculateDamageBreakdown(action, context).total, 0)
  expect(hits).toHaveLength(1)
  expect(damage / baseline).toBeCloseTo(stanceMultiplier * 0.4, 10)
})
