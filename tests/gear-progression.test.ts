import affixMap from "@gamedata/official/affix-map.json"
import { describe, expect, it } from "vitest"

import { resolveBuildStatState } from "@/application/buildStatState"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { breakthroughProfile, defaultSettings } from "@/application/gameData/setup"
import { buildPresetRotationBundle } from "@/application/graduation"
import { measurementSubject, type MeasurementContext } from "@/calculations/rotationCalculationBundle"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import {
  affixOptionsForGearDefinition,
  attunementData,
  buildPresetInventory,
  calculateEquippedGearEffects,
  defaultBuildPresets,
  duplicateBuildState,
  gearBaseStats,
  gearData,
  maxGearRoll,
  parseGearInventory,
  resolveBuildInventory,
  type BuildEntry,
} from "@/gear"
import { inferGearLevelAndRarity } from "@/gearOcr"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
import { parseOfficialGearExport } from "@/officialGearImport"

const pathId = "stonesplitStrength"
const preset = defaultBuildPresets.find(build => build.id === typedPathDefinitions[pathId].defaultBuild)!
const build: BuildEntry = { id: preset.id, presetId: preset.id, name: preset.name, isDefault: true }
const weapons = ["snowparting", "phalanxbane"] as ["snowparting", "phalanxbane"]
const setupSelections = { food: "None", enduranceFood: "None", script: "None", divinecraft: "None" }
const settingsFor = (breakthrough: string) => ({ ...defaultSettings, weapons, breakthrough })
const sheet = (breakthrough: string) =>
  resolveBuildStatState({
    build,
    gearItems: [],
    settings: settingsFor(breakthrough),
    pathId,
    setupSelections,
    statOverrides: {},
    attunementOverrides: {},
  })

describe("gear progression", () => {
  it("materializes valid maximum-roll inventories at both supported preset tiers", () => {
    for (const preset of defaultBuildPresets)
      for (const tier of [96, 100] as const) {
        const inventory = buildPresetInventory(preset, tier)
        expect(parseGearInventory(inventory)).toEqual(inventory)
        for (const item of inventory.items) {
          expect(item.level).toBe(tier)
          expect(Object.keys(gearBaseStats(item)).length).toBeGreaterThan(0)
          for (const [category, values] of [
            ["baseAffixes", [item.baseAffix]],
            ["additionalAffixes", item.additionalAffixes],
          ] as const) {
            const options = affixOptionsForGearDefinition(
              gearData.gear[item.definitionId],
              category,
              tier,
              item.relayed,
            )
            for (const affix of values) {
              expect(options).toContain(affix.key)
              expect(affix.value).toBeCloseTo(maxGearRoll(affix.key, "affix", item.relayed, tier)!, 10)
            }
          }
          expect(item.attunement!.value).toBe(maxGearRoll(item.attunement!.key, "attunement", false, tier))
        }
      }
  })

  it("shares selected-tier gear between the sheet and graduation and restores tier 96", () => {
    const before = sheet("17")
    const after = sheet("18")
    expect(after.gearStatEffect.rawStat!.minPhys).toBeGreaterThan(before.gearStatEffect.rawStat!.minPhys as number)
    const bundle = buildPresetRotationBundle(
      {
        pathId,
        martialArts: weapons,
        breakthrough: "18",
        rotation: { name: "Probe", steps: [] },
        ...setupSelections,
        globalDebuffs: defaultGlobalDebuffs,
        skillOverrides: {},
        previewId: null,
      },
      preset.id,
    )!
    expect(bundle.timeline.setupEffects).toContainEqual(after.gearStatEffect)
    expect(sheet("17")).toEqual(before)
    expect(resolveBuildInventory(build, [], weapons, 100).items.every(item => item.level === 100)).toBe(true)
  })

  it("selects comparison rolls independently of enemy level", () => {
    const settings = settingsFor("18")
    const context: MeasurementContext = {
      environment: {
        pathId,
        settings,
        setupSelections,
        enemy: { ...breakthroughProfile(settings), level: 91 },
        globalDebuffs: defaultGlobalDebuffs,
        skillOverrides: {},
        previewId: null,
      },
      statOverrides: {},
      attunementOverrides: {},
    }
    const subject = measurementSubject({ build, gearItems: [], context, rotation: { name: "Probe", steps: [] } })
    const bundle = buildRotationComparisonBundle(subject)
    const minPhys = bundle.statPriority.find(
      variant => variant.stats && variant.stats.minPhys !== subject.build.baseStats.minPhys,
    )!
    expect(minPhys.maxRoll).toBe(maxGearRoll("minPhys", "affix", false, 100))
    const penetration = bundle.attunementPriority.find(
      variant => variant.label === attunementData.physicalPenetration.name,
    )!
    expect(penetration.maxRoll).toBe(maxGearRoll("physicalPenetration", "attunement", false, 100))
    const otherEnemy = buildRotationComparisonBundle({ ...subject, enemy: { ...subject.enemy, level: 96 } })
    expect(otherEnemy.statPriority).toEqual(bundle.statPriority)
    expect(otherEnemy.attunementPriority).toEqual(bundle.attunementPriority)
  })

  it("copies the selected preset tier and preserves existing stored items", () => {
    const old = buildPresetInventory(preset, 96)
    const state = { entries: [build], activeBuildId: build.id, gearItems: old.items }
    const copied = duplicateBuildState(state, build.id, { id: "copy", name: "Copy" }, 100)
    expect(copied.gearItems.slice(0, old.items.length)).toEqual(old.items)
    const entry = copied.entries.find(entry => entry.id === "copy")!
    const inventory = resolveBuildInventory(entry, copied.gearItems, weapons, 96)
    const equipped = Object.values(inventory.equipped).map(id => inventory.items.find(item => item.id === id)!)
    expect(equipped.every(item => item.level === 100)).toBe(true)
    expect(parseGearInventory(inventory)).toEqual(inventory)
    const raw = calculateEquippedGearEffects(inventory, weapons, false)
    expect(raw.stats).toEqual(
      calculateEquippedGearEffects(resolveBuildInventory(entry, copied.gearItems, weapons, 100), weapons, false).stats,
    )
  })

  it("recognizes and imports tier-100 items without changing their rolls", () => {
    expect(
      inferGearLevelAndRarity("hengBlade", "Gear Tier 100 Min Physical Attack 75 Max Physical Attack 175"),
    ).toEqual({ level: 100, rarity: "Gold" })
    const row = (key: string, value: number) => ({
      equipmentDetails: [
        Object.keys(affixMap).find(id => affixMap[id as keyof typeof affixMap] === key),
        value,
        5,
        0,
        true,
      ],
    })
    const imported = parseOfficialGearExport(
      {
        source: "wwm-dashboard",
        wearEquipsDetailed: {
          1: {
            exVo: {
              gearTier: 100,
              baseAttrs: { MIN_W_ATK: 75, MAX_W_ATK: 175 },
              baseAffixes: [
                row("minPhys", 90.6),
                row("minPhys", 90.6),
                row("agility", 57.4),
                row("hengBladeDmgBoost", 7.4),
                row("maxVoidAttack", 51.4),
                row("physicalPenetration", 12.8),
              ],
            },
          },
        },
      },
      weapons,
    )
    expect(imported.warnings).toEqual([])
    expect(imported.exportValue.gearItems[0].level).toBe(100)
    expect(imported.exportValue.gearItems[0].baseAffix.value).toBe(90.6)
    expect(imported.exportValue.gearItems[0].attunement!.value).toBe(12.8)
  })
})
