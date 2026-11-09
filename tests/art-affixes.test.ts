import { expect, it } from "vitest"

import { defaultSettings, breakthroughProfile } from "@/application/gameData/setup"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { measurementSubject } from "@/calculations/rotationCalculationBundle"
import { calculateRotationBaseline, calculateRotationComparisons } from "@/calculations/rotationCalculator"
import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import { emptyStats } from "@/data/statDefinitions"
import { calculateEquippedGearEffects, gearBaseStats, type GearInventory, type GearItem } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

function weapon(id: string, definitionId: string, key: string, value: number): GearItem {
  return {
    id,
    definitionId,
    level: 100,
    rarity: "Gold",
    baseAffix: { key: "maxPhys", value: 10 },
    additionalAffixes: [{ key, value }],
  }
}

it.each([
  [0.03, 0.07],
  [0.07, 0.03],
  [0.05, 0.05],
])("takes the highest Art of Sword across equipped pieces: %s and %s", (left, right) => {
  const items = [weapon("left", "sword", "swordDmgBoost", left), weapon("right", "sword", "swordDmgBoost", right)]
  const inventory: GearInventory = { items, equipped: { leftWeapon: "left", rightWeapon: "right" } }
  const result = calculateEquippedGearEffects(inventory, ["namelessSword", "strategicSword"])
  expect(result.stats.swordDmgBoost).toBe(Math.max(left, right))
  expect(result.stats.maxPhys).toBe(items.reduce((total, item) => total + (gearBaseStats(item).maxPhys ?? 0) + 10, 0))
})

it("keeps different Art families active together while ordinary affixes still add", () => {
  const items = [weapon("left", "sword", "swordDmgBoost", 0.05), weapon("right", "spear", "spearDmgBoost", 0.07)]
  for (const [slot, id] of [
    ["disc", "disc"],
    ["pendant", "pendant"],
  ] as const) {
    items.push({
      id,
      slot,
      definitionId: slot,
      level: 100,
      rarity: "Gold",
      baseAffix: { key: "maxPhys", value: 10 },
      additionalAffixes: [{ key: "allMartialArts", value: 0.03 }],
    })
  }
  const result = calculateEquippedGearEffects(
    { items, equipped: { leftWeapon: "left", rightWeapon: "right", disc: "disc", pendant: "pendant" } },
    ["namelessSword", "namelessSpear"],
  )
  expect(result.stats).toMatchObject({ swordDmgBoost: 0.05, spearDmgBoost: 0.07, allMartialArts: 0.06 })
})

function comparison(currentArt: number) {
  const settings = {
    ...defaultSettings,
    breakthrough: "19",
    weapons: ["jueyuXuanfengSpear", "boshanQuyueSpear"] as ["jueyuXuanfengSpear", "boshanQuyueSpear"],
  }
  const subject = measurementSubject({
    build: { id: "bolt", name: "Bolt", isDefault: true, presetId: "bolt-fully-relayed" },
    gearItems: [],
    context: {
      environment: {
        pathId: "bellstrikeBolt",
        settings,
        enemy: breakthroughProfile(settings),
        setupSelections: { food: "None", enduranceFood: "None", divinecraft: "None", script: "None" },
        globalDebuffs: defaultGlobalDebuffs,
        skillOverrides: {},
        previewId: null,
      },
      statOverrides: { spearDmgBoost: currentArt },
      attunementOverrides: {},
    },
    rotation: { name: "Art affix priority", steps: [{ type: "skill", skill: "BoltBlueVC" }] },
  })
  const bundle = buildRotationComparisonBundle(subject)
  bundle.statPriority = bundle.statPriority.filter(variant => variant.label === "Art of Spear")
  bundle.attunementPriority = []
  bundle.innerWayPriority = []
  bundle.setupComparisons = {}
  return bundle
}

it("keeps the equipped baseline while using the zero-Art reference on a reusable timeline", () => {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, spearDmgBoost: 0.2 }
  const bundle: RotationSimulationBundle = {
    timeline: {
      rotation: { name: "Reusable Art comparison", steps: [{ type: "skill", skill: "Hit" }] },
      skills: {
        Hit: {
          castTime: 1,
          tags: ["DirectDamage", "MartialArts", "Spear"],
          action: [{ type: "damage", phyCoef: 1, time: 0 }],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["namelessSpear"],
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: emptyAttunementStats,
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
    weapons: ["namelessSpear"],
    statPriority: [
      {
        label: "Art of Spear",
        stats: { ...stats, spearDmgBoost: 0.074 },
        referenceStats: { ...stats, spearDmgBoost: 0 },
      },
    ],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
  const baseline = calculateRotationBaseline(bundle)
  const result = calculateRotationComparisons(bundle, baseline)
  expect(result.dps).toBeCloseTo(120, 10)
  expect(result.statPriority[0].dpsDifference).toBeCloseTo(7.4, 10)
  expect(result.statPriority[0].increase).toBeCloseTo(7.4, 10)
})

it("measures Art priority from zero to one roll regardless of equipped Art or overrides", () => {
  const zeroBundle = comparison(0)
  const zero = calculateRotationBaseline(zeroBundle)
  const amount = zeroBundle.statPriority[0].maxRoll! / 100
  const one = calculateRotationBaseline(comparison(amount))
  expect(one.metrics.dps).toBeGreaterThan(zero.metrics.dps)
  for (const current of [0, 0.02, 0.2]) {
    const bundle = comparison(current)
    const baseline = calculateRotationBaseline(bundle)
    const progress: number[][] = []
    const result = calculateRotationComparisons(bundle, baseline, (completed, total) =>
      progress.push([completed, total]),
    )
    expect(result.totalDamage).toBe(baseline.metrics.totalDamage)
    expect(result.statPriority).toHaveLength(1)
    expect(result.statPriority[0].dpsDifference).toBeCloseTo(one.metrics.dps - zero.metrics.dps, 9)
    expect(result.statPriority[0].increase).toBeCloseTo((one.metrics.dps / zero.metrics.dps - 1) * 100, 9)
    expect(progress.every(([completed, total]) => completed <= total)).toBe(true)
    expect(progress.length).toBeGreaterThan(1)
    expect(progress.at(-1)?.[0]).toBe(progress.at(-1)?.[1])
  }
})
