// @vitest-environment jsdom
import { expect, it } from "vitest"

import { resolveBuildStatState } from "@/application/buildStatState"
import { innerWayEffectRulesFor, setEffectsFor, settingsForPath } from "@/application/characterComposition"
import { defaultSettings, typedWeaponSetDefinitions } from "@/application/gameData/setup"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import type { StatEffectContainer } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"
import { loadBuildState } from "@/gear"

it.each([
  ["17", 0.38],
  ["18", 0.38],
  ["19", 0.39],
] as const)("loads Bolt's Fully Relayed preset with near-cap Affinity at Solo %s", (breakthrough, minimumAffinity) => {
  const state = loadBuildState()
  const build = state.entries.find(entry => entry.id === "bolt-fully-relayed")
  expect(build).toBeDefined()
  const result = resolveBuildStatState({
    build,
    gearItems: state.gearItems,
    settings: settingsForPath({ ...defaultSettings, breakthrough }, "bellstrikeBolt"),
    statOverrides: {},
    attunementOverrides: {},
    setupSelections: { food: "SimmeringFishSlices", script: "None", divinecraft: "None" },
    pathId: "bellstrikeBolt",
  })
  expect(result.derivedStats.effectiveAffinity).toBeGreaterThan(minimumAffinity)
  expect(result.derivedStats.effectiveAffinity).toBeLessThanOrEqual(0.4)
  expect(result.derivedStats.finalAffinity - result.derivedStats.effectiveAffinity).toBeCloseTo(0.046, 12)
  expect(result.stats.maxPhys).toBeGreaterThan(result.stats.minPhys)
})

it.each([
  ["ShenDuanQingFeng", { maxPhys: 84, directAffinity: 0.023 }],
  ["YueYongFangYuan", { maxPhys: 84, directAffinity: 0.023 }],
  ["FuLiangYiYe", { affinity: 0.044, affinityDmgBonus: 0.052 }],
  ["MingFeiTongPan", { minPhys: 25.2, maxPhys: 50.4, physDmgBonus: 0.025 }],
  ["SuiXingQieTao", { minVoidAttack: 14.3, maxVoidAttack: 28.5, formlessPenetration: 6 }],
])("applies %s T2 and T5 cumulatively through the shared stat pipeline", (innerWay, bonuses) => {
  const resolve = (tier: string) => {
    const rules = innerWayEffectRulesFor([{ innerWay, tier }], 18, "bellstrikeBolt")
    return calculateStatsWithEffects(
      emptyStats,
      rules.map(rule => rule.effect as StatEffectContainer),
      0,
    ).rawStats
  }
  expect(resolve("T1")).toEqual(emptyStats)
  expect(resolve("T6")).toMatchObject(bonuses)
  expect(resolve("T6")).toEqual(resolve("T5"))
  expect(resolve("T4")).toEqual(resolve("T2"))
})

it.each([
  ["17", 77.8],
  ["18", 90.6],
  ["19", 90.6],
])("resolves HanMang's 2pc maximum attack at breakthrough %s and retains it at 4pc", (breakthrough, maximum) => {
  const settings = settingsForPath({ ...defaultSettings, breakthrough }, "bellstrikeBolt")
  for (const pieces of [2, 4] as const) {
    const effects = setEffectsFor({ HanMang: pieces }, typedWeaponSetDefinitions, settings, "bellstrikeBolt")
    const result = calculateStatsWithEffects(emptyStats, effects, 0)
    expect(result.rawStats.maxPhys).toBeCloseTo(maximum, 12)
    expect(result.rawStats.minPhys).toBe(0)
  }
})
