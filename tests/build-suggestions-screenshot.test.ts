import fullRotation from "@gamedata/rotation/stonesplit-strength/mixed-dummy-1-min.json"
import { expect, it } from "vitest"

import { breakthroughProfile } from "@/application/gameData/setup"
import { calculateBuildSuggestions, applySuggestion } from "@/calculations/buildSuggestions"
import type { GearSearchInput } from "@/calculations/gearOptimization"
import { buildMeasurement } from "@/calculations/rotationCalculationBundle"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { suggestionAffixCounts, suggestionAffixKey } from "@/calculations/suggestionAffixes"
import { buildPresetInventory, defaultBuildPresets, type GearSlot } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

function screenshotBuild() {
  const preset = defaultBuildPresets.find(preset => preset.id === "mixed-fully-relayed-min")!
  const inventory = buildPresetInventory(preset, 100)
  const rows: Partial<Record<GearSlot, { keys: string[]; values: number[]; turned?: number }>> = {
    leftWeapon: {
      keys: ["maxStonesplit", "minStonesplit", "minPhys", "agility", "maxStonesplit"],
      values: [48.316, 48.316, 48.316, 53.956, 48.316],
    },
    rightWeapon: {
      keys: ["minPhys", "agility", "minVoidAttack", "maxVoidAttack", "moBladeDmgBoost"],
      values: [85.164, 53.956, 51.4, 48.316, 0.06956],
    },
    helmet: {
      keys: ["crit", "minStonesplit", "maxStonesplit", "agility", "minPhys"],
      values: [0.09776, 48.316, 51.4, 53.956, 85.164],
      turned: 1,
    },
    chestpiece: {
      keys: ["crit", "minStonesplit", "momentum", "minPhys", "agility"],
      values: [0.09776, 48.316, 53.956, 85.164, 53.956],
      turned: 0,
    },
    disc: {
      keys: ["minPhys", "maxStonesplit", "allMartialArts", "minPhys", "agility"],
      values: [85.164, 48.316, 0.03384, 85.164, 53.956],
    },
    pendant: {
      keys: ["minPhys", "agility", "minPhys", "allMartialArts", "minBamboocut"],
      values: [85.164, 53.956, 85.164, 0.03384, 48.316],
    },
    greaves: {
      keys: ["precision", "minPhys", "agility", "minBellstrike", "vsBossDmg"],
      values: [0.08836, 85.164, 53.956, 48.316, 0.03572],
    },
    bracer: {
      keys: ["precision", "minPhys", "minStonesplit", "vsBossDmg", "agility"],
      values: [0.08836, 85.164, 48.316, 0.03572, 53.956],
    },
  }
  for (const [slot, row] of Object.entries(rows)) {
    const item = inventory.items.find(item => item.id === inventory.equipped[slot as GearSlot])!
    const affixes = row.keys.map((key, index) => ({ key, value: row.values[index] }))
    item.baseAffix = affixes[0]
    item.additionalAffixes = affixes.slice(1)
    item.relayed = slot === "leftWeapon"
    item.turnedAffixIndex = row.turned
    if (["helmet", "chestpiece", "greaves", "bracer"].includes(slot)) item.rarity = "Purple"
  }
  const settings = {
    weapons: ["snowparting", "phalanxbane"] as ["snowparting", "phalanxbane"],
    breakthrough: "18",
    ping: 40,
  }
  const input: GearSearchInput = {
    build: {
      id: "screenshot",
      name: "Screenshot",
      martialArts: settings.weapons,
      equipped: inventory.equipped,
      setup: { ...preset.setup!, innerWays: [] },
    },
    items: inventory.items,
    context: {
      environment: {
        pathId: "stonesplitStrength",
        settings,
        enemy: breakthroughProfile(settings),
        setupSelections: { food: "None", script: "None", divinecraft: "None" },
        globalDebuffs: defaultGlobalDebuffs,
        skillOverrides: {},
        previewId: null,
      },
      statOverrides: {},
      attunementOverrides: {},
    },
    rotation: {
      name: "Suggestion",
      steps: [
        { type: "skill", skill: "SnowpartingQ" },
        { type: "event", event: "Delay", duration: 3 },
      ],
    },
  }
  return { input, inventory, preset }
}

it("rerolls the left weapon and keeps the Mo Blade's equivalent Max Void using a Min Void retune", () => {
  const { input, inventory } = screenshotBuild()
  const snapshot = structuredClone(input)
  const result = calculateBuildSuggestions(input)
  const left = result.items.find(item => item.itemId === inventory.equipped.leftWeapon)!
  expect(left).toBeDefined()
  expect(left.options[0].replacement).toBeDefined()
  expect(left.options[0].replacement!.baseAffix.key).toBe("minPhys")
  const right = result.items.find(item => item.itemId === inventory.equipped.rightWeapon)!
  expect(right.options[0].action).toBe("retune")
  expect(right.options[0].from).toBe("minVoidAttack")
  expect(right.options[0].to).toBe("minPhys")
  expect(right.options[0].replacement).toBeUndefined()
  expect(right.options[0].additions).toEqual([{ key: "minPhys", count: 1 }])
  const keyFor = suggestionAffixKey(input.context.environment.settings.weapons)
  const selected = defaultBuildPresets.find(preset => preset.id === result.presetId)!
  expect(suggestionAffixCounts(result.completion!, keyFor)).toEqual(
    suggestionAffixCounts(buildPresetInventory(selected, 100).items, keyFor),
  )
  expect(suggestionAffixCounts(input.items, keyFor).get("precision")).toBe(2)
  expect(suggestionAffixCounts(buildPresetInventory(selected, 100).items, keyFor).get("precision")).toBe(2)
  let current = input.items
  const measure = (gearItems: typeof current) =>
    calculateRotationBaseline(
      buildMeasurement({ build: input.build, gearItems, context: input.context, rotation: input.rotation }).bundle,
    ).metrics.dps
  for (const id of result.order!) {
    const row = result.items.find(row => row.itemId === id)!
    const before = measure(current)
    for (const option of [...row.options, ...(row.retuneAlternative?.options ?? [])]) {
      const changed = applySuggestion(current, option)
      expect(suggestionAffixCounts(changed, keyFor).get("precision") ?? 0).toBeGreaterThanOrEqual(2)
      const after = measure(changed)
      expect((after - before) / before).toBeGreaterThanOrEqual(0.003)
      expect(option.gain).toBeCloseTo((after - before) / before, 10)
    }
    current = applySuggestion(current, row.options[0])
  }
  for (const row of result.items.filter(row => !result.order!.includes(row.itemId))) {
    for (const option of [...row.options, ...(row.retuneAlternative?.options ?? [])]) {
      const changed = applySuggestion(input.items, option)
      expect(suggestionAffixCounts(changed, keyFor).get("precision") ?? 0).toBeGreaterThanOrEqual(2)
    }
  }
  expect(input).toEqual(snapshot)
})

it("reports combined gain and the chest retune range across the real Steadfast threshold", () => {
  const { input, inventory } = screenshotBuild()
  input.rotation = fullRotation as RotationRecord
  const result = calculateBuildSuggestions(input)
  const left = result.items.find(item => item.itemId === inventory.equipped.leftWeapon)!.options[0]
  const chest = result.items.find(item => item.itemId === inventory.equipped.chestpiece)!
  const retune = chest.retuneAlternative!.options[0]
  const measure = (gearItems: typeof input.items) =>
    calculateRotationBaseline(
      buildMeasurement({ build: input.build, gearItems, context: input.context, rotation: input.rotation }).bundle,
    ).metrics.dps
  const baseline = measure(input.items)
  const changed = applySuggestion(input.items, left)
  const afterWeapon = measure(changed)
  const isolated = (measure(applySuggestion(input.items, retune)) - baseline) / baseline
  const accumulated = (measure(applySuggestion(changed, retune)) - afterWeapon) / afterWeapon
  expect(accumulated - isolated).toBeGreaterThan(0.02)
  expect(retune.gainRange!.min).toBeLessThanOrEqual(isolated + 1e-10)
  expect(retune.gainRange!.max).toBeGreaterThanOrEqual(accumulated - 1e-10)
  let final = input.items
  for (const id of result.order!)
    final = applySuggestion(final, result.items.find(item => item.itemId === id)!.options[0])
  expect(result.combinedGain).toBeCloseTo((measure(final) - baseline) / baseline, 10)
  expect(
    result.items
      .flatMap(item => item.options.concat(item.retuneAlternative?.options ?? []))
      .every(option => option.gainRange!.min >= 0.003),
  ).toBe(true)
})
