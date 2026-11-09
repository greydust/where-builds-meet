import blue from "@gamedata/skill/boshan-quyue-spear.json"
import red from "@gamedata/skill/jueyu-xuanfeng-spear.json"
import { expect, it } from "vitest"

import { emptyAttunementStats, matchingAttunementEntries } from "@/calculations/attunementStats"
import { calculateDamageBreakdown } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"
import { maxGearRoll } from "@/gear"
import type { WeaponId } from "@/types"

it.each([
  ["jueyuXuanfengSpearMartialBoost", red.BoltRedQ],
  ["jueyuXuanfengSpearSpecialBoost", red.BoltRedSpecial],
  ["boshanQuyueSpearMartialBoost", blue.BoltBlueQFollowup],
  ["boshanQuyueSpearMartialBoost", blue.BoltBlueCounter],
  ["boshanQuyueSpearMartialBoost", blue.BoltBlueParrySuccess],
  ["boshanQuyueSpearSpecialBoost", blue.BoltBlueSpecial],
  ["boltVariedComboBoost", blue.BoltBlueVCBase],
  ["boltVariedComboBoost", blue.BoltZaige],
  ["boltVariedComboBoost", blue.BoltMingGe],
] as const)("matches native Bolt skill damage to %s", (key, skill) => {
  const boltKeys = new Set([
    "boltVariedComboBoost",
    "jueyuXuanfengSpearMartialBoost",
    "jueyuXuanfengSpearSpecialBoost",
    "boshanQuyueSpearMartialBoost",
    "boshanQuyueSpearSpecialBoost",
  ])
  const matches = matchingAttunementEntries(emptyAttunementStats, skill.tags).filter(entry => boltKeys.has(entry.key))
  expect(matches.map(entry => entry.key)).toEqual([key])
  expect(matches[0].stat?.attunementDMGBonus).toBe(1)
  expect(maxGearRoll(key, "attunement", false, 96)).toBe(0.06)
  expect(maxGearRoll(key, "attunement", false, 100)).toBe(0.07)
})

it.each(["jueyuXuanfengSpear", "boshanQuyueSpear"] as WeaponId[])(
  "boosts both light and heavy VC derivatives while wielding %s",
  weapon => {
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
    const damage = (tags: string[], amount: number) =>
      calculateDamageBreakdown(
        { phyCoef: 1 },
        {
          stats,
          derivedStats: calculateDerivedStats(stats, 0),
          attunement: { ...emptyAttunementStats, boltVariedComboBoost: amount },
          skillTags: tags,
          weapons: [weapon],
          buffs: [],
          effects: [],
          enemy,
        },
      ).total
    for (const skill of [
      red.BoltRedVCBase,
      red.BoltRedVCSharp,
      blue.BoltBlueVCBase,
      blue.BoltBlueVCSharp,
      blue.BoltZaige,
      blue.BoltMingGe,
    ])
      expect(damage(skill.tags, 0.28) / damage(skill.tags, 0)).toBeCloseTo(1.28, 12)
    for (const skill of [red.BoltRedQ, blue.BoltBlueSpecial, blue.BoltMoonBurst, blue.BoltMoonTide])
      expect(damage(skill.tags, 0.28)).toBe(damage(skill.tags, 0))
  },
)
