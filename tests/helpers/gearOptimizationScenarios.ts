import kiteRotation from "@gamedata/rotation/bamboocut-kite/dummy-1-min-infinite-vitality.json"
import splendorRotation from "@gamedata/rotation/bellstrike-splendor/dummy-1-min-81-waves.json"
import umbraRotation from "@gamedata/rotation/bellstrike-umbra/dummy-1-min-38-bb.json"
import strengthRotation from "@gamedata/rotation/stonesplit-strength/mixed-dummy-1-min.json"

import type { PathId } from "@/application/contracts"
import { breakthroughProfile } from "@/application/gameData/setup"
import type { GearSearchInput } from "@/calculations/gearOptimization"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { buildPresetInventory, defaultBuildPresets, parseGearInventory, type GearSlot } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

import { weaponPair } from "./weaponPair"

export const realGearSearchScenarios: Array<{
  name: string
  pathId: PathId
  preset: string
  rotation: RotationRecord
}> = [
  {
    name: "Strength: full 60-second rotation",
    pathId: "stonesplitStrength",
    preset: "mixed-fully-relayed-min",
    rotation: strengthRotation as RotationRecord,
  },
  {
    name: "Splendor: Moonlit Expanse and 81 Waves",
    pathId: "bellstrikeSplendor",
    preset: "splendor-fully-relayed",
    rotation: splendorRotation as RotationRecord,
  },
  {
    name: "Umbra: Moonlit Expanse, Insightful Strike and Blood Burst",
    pathId: "bellstrikeUmbra",
    preset: "umbra-fully-relayed",
    rotation: umbraRotation as RotationRecord,
  },
  {
    name: "Kite: full infinite-Vitality rotation",
    pathId: "bamboocutKite",
    preset: "kite-fully-relayed-min",
    rotation: kiteRotation as RotationRecord,
  },
]

/** Legal rolled gear, with upgrades, identical spares and an incompatible weapon in the inventory. */
export function realGearSearchInput(
  index: number,
  upgradeSlots: readonly GearSlot[] = ["leftWeapon", "helmet", "disc", "pendant"],
): GearSearchInput {
  const scenario = realGearSearchScenarios[index]
  const preset = defaultBuildPresets.find(preset => preset.id === scenario.preset)
  if (!preset) throw new Error(`Missing preset ${scenario.preset}`)
  const inventory = buildPresetInventory(preset)
  const items = inventory.items.map(item => {
    const slot = upgradeSlots.find(slot => inventory.equipped[slot] === item.id)
    if (!slot) return item
    return {
      ...item,
      baseAffix: { ...item.baseAffix, value: item.baseAffix.value * 0.8 },
      additionalAffixes: item.additionalAffixes.map(affix => ({ ...affix, value: affix.value * 0.8 })),
      ...(item.attunement ? { attunement: { ...item.attunement, value: item.attunement.value * 0.8 } } : {}),
    }
  })
  for (const slot of upgradeSlots) {
    const original = inventory.items.find(item => item.id === inventory.equipped[slot])!
    items.push({ ...original, id: `upgrade:${slot}` })
  }
  const helmet = items.find(item => item.id === inventory.equipped.helmet)!
  items.push({ ...helmet, id: "identical-helmet" })
  const otherPreset = defaultBuildPresets.find(candidate => candidate.martialArts.includes("panaceaFan"))!
  const incompatible = buildPresetInventory(otherPreset).items.find(item => item.definitionId === "fan")!
  if (!incompatible) throw new Error("The healing preset must supply an incompatible fan")
  items.push({ ...incompatible, id: "incompatible-fan" })
  const parsed = parseGearInventory({ items, equipped: inventory.equipped })
  if (parsed.items.length !== items.length) throw new Error("A realistic search fixture contains invalid saved gear")
  const settings = { weapons: weaponPair(preset.martialArts), breakthrough: "17", ping: scenario.rotation.ping ?? 40 }
  return {
    build: {
      id: `real-search-${index}`,
      name: scenario.name,
      martialArts: [...preset.martialArts],
      equipped: parsed.equipped,
      setup: structuredClone(preset.setup),
    },
    items: parsed.items,
    context: {
      environment: {
        pathId: scenario.pathId,
        settings,
        enemy: breakthroughProfile(settings),
        setupSelections: { food: "SimmeringFishSlices", script: "None", divinecraft: "Fire" },
        globalDebuffs: { ...defaultGlobalDebuffs },
        skillOverrides: {},
        previewId: null,
      },
      statOverrides: {},
      attunementOverrides: {},
    },
    rotation: structuredClone(scenario.rotation),
  }
}

/** Two actual Strength preset itemizations compete under the same mixed-rotation setup. */
export function realGearTradeoffInput(): GearSearchInput {
  const input = realGearSearchInput(0)
  const pure = defaultBuildPresets.find(preset => preset.id === "pure-fully-relayed-min")!
  const inventory = buildPresetInventory(pure)
  for (const slot of ["leftWeapon", "helmet", "disc", "pendant"] as const) {
    const item = inventory.items.find(item => item.id === inventory.equipped[slot])!
    input.items.push({ ...item, id: `pure-alternative:${slot}` })
  }
  return input
}
