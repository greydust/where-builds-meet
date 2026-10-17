import dawnsun from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-jadebreaker.json"
import { describe, expect, it } from "vitest"

import { calculateGlobalStatState } from "@/application/characterComposition"
import { typedBreakthroughProfiles } from "@/application/gameData/setup"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets, maxGearRoll } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

describe("Wings builds", () => {
  it.each([17, 18])(
    "keeps Double Min's selected penetration ahead on both rotations at breakthrough %s",
    breakthrough => {
      const tier = breakthrough === 17 ? 96 : 100
      for (const rotation of [dawnsun, jadebreaker]) {
        const bundle = buildPresetRotationBundle(
          {
            pathId: "silkbindWings",
            martialArts: ["museflowWaistDrum", "willowbendFan"],
            rotation: rotation as RotationRecord,
            breakthrough: String(breakthrough),
            globalDebuffs: { ...defaultGlobalDebuffs },
            food: "SimmeringFishSlices",
            script: "None",
            divinecraft: "Fire",
            skillOverrides: {},
            previewId: null,
          },
          "wings-fully-relayed-double-min",
        )!
        const selected = calculateRotationBaseline(bundle).metrics.dps
        const alternate = {
          ...bundle,
          attunement: {
            ...bundle.attunement,
            physicalPenetration: 0,
            formlessPenetration: maxGearRoll("formlessPenetration", "attunement", false, tier)! * 4,
          },
        }
        expect(selected).toBeGreaterThan(calculateRotationBaseline(alternate).metrics.dps)
      }
    },
  )
  it("does not combine Void and Silkbind rolls for the same weapon attack bound", () => {
    for (const preset of defaultBuildPresets.filter(row => row.buildGroup === "silkbind-wings")) {
      for (const gear of Object.values(preset.gearByTier)) {
        for (const slot of ["leftWeapon", "rightWeapon"] as const) {
          const weapon = gear[slot]!
          const keys = new Set([weapon.baseAffix.key, ...weapon.additionalAffixes.map(affix => affix.key)])
          for (const bound of ["min", "max"]) {
            expect(keys.has(`${bound}VoidAttack`) && keys.has(`${bound}Silkbind`)).toBe(false)
          }
        }
      }
    }
  })
  it.each([96, 100] as const)("keeps Graduate at non-relayed maximum rolls at tier %s", tier => {
    const graduate = buildPresetInventory(
      defaultBuildPresets.find(row => row.id === "wings-graduate")!,
      tier,
    )
    for (const target of graduate.items) {
      expect(target.relayed).not.toBe(true)
      const targetAffixes = [target.baseAffix!, ...target.additionalAffixes]
      for (const affix of targetAffixes) expect(affix.value).toBe(maxGearRoll(affix.key, "affix", false, tier))
    }
  })
  it.each(
    ([96, 100] as const).flatMap(tier =>
      [
        "wings-fully-relayed-double-min",
        "wings-fully-relayed-min",
        "wings-fully-relayed-min-attribute",
        "wings-max",
      ].map(id => ({ tier, id })),
    ),
  )("keeps effective crit within its cap for $id at gear tier $tier", ({ tier, id }) => {
    const preset = defaultBuildPresets.find(row => row.id === id)!
    const inventory = buildPresetInventory(preset, tier)
    const gear = calculateEquippedGearEffects(inventory, ["museflowWaistDrum", "willowbendFan"])
    const breakthrough = Object.entries(typedBreakthroughProfiles).find(([, profile]) => profile.gearTier === tier)![0]
    const result = calculateGlobalStatState(
      {},
      { weapons: ["museflowWaistDrum", "willowbendFan"], breakthrough, ping: 40 },
      { rawStat: gear.stats },
      preset.setup!,
      { food: "SimmeringFishSlices", script: "None", divinecraft: "Fire" },
      "silkbindWings",
    )
    expect(result.derivedStats.effectiveCrit).toBeLessThanOrEqual(0.8)
    expect(result.derivedStats.effectiveCrit).toBeGreaterThanOrEqual(
      id === "wings-fully-relayed-min-attribute" ? 0.79 : 0,
    )
    expect(inventory.items.every(item => item.relayed)).toBe(true)
  })
  it.each([96, 100] as const)("equips Agility on every piece of each Min layout at tier %s", tier => {
    for (const preset of defaultBuildPresets.filter(
      row =>
        row.buildGroup === "silkbind-wings" && !["wings-max", "wings-fully-relayed-min-attribute"].includes(row.id),
    )) {
      const inventory = buildPresetInventory(preset, tier)
      expect(inventory.items).toHaveLength(8)
      for (const item of inventory.items) {
        const agility = item.additionalAffixes.filter(affix => affix.key === "agility")
        expect(agility).toHaveLength(1)
        expect(agility[0].value).toBe(maxGearRoll("agility", "affix", !!preset.relayed, tier))
      }
    }
    const maximum = buildPresetInventory(
      defaultBuildPresets.find(row => row.id === "wings-max")!,
      tier,
    )
    for (const item of maximum.items) {
      expect(item.additionalAffixes.filter(affix => affix.key === "power")).toHaveLength(1)
      expect(item.additionalAffixes.some(affix => affix.key === "maxSilkbind")).toBe(false)
    }
    for (const item of maximum.items.filter(row => row.slot === "leftWeapon" || row.slot === "rightWeapon"))
      expect(item.baseAffix.key).toBe("maxPhys")
  })
  it.each([96, 100] as const)(
    "keeps Min Attribute at ten rolls per attack channel and three Agility at tier %s",
    tier => {
      const preset = defaultBuildPresets.find(row => row.id === "wings-fully-relayed-min-attribute")!
      const inventory = buildPresetInventory(preset, tier)
      const affixes = inventory.items.flatMap(item => [item.baseAffix].concat(item.additionalAffixes))
      expect(affixes.filter(affix => affix.key === "minSilkbind")).toHaveLength(10)
      expect(affixes.filter(affix => affix.key === "maxPhys")).toHaveLength(10)
      expect(affixes.filter(affix => affix.key === "agility")).toHaveLength(3)
    },
  )
  it.each([96, 100] as const)("keeps Double Min at twelve Physical and eight Silkbind rolls at tier %s", tier => {
    const preset = defaultBuildPresets.find(row => row.id === "wings-fully-relayed-double-min")!
    const inventory = buildPresetInventory(preset, tier)
    const affixes = inventory.items.flatMap(item => [item.baseAffix].concat(item.additionalAffixes))
    expect(affixes.filter(affix => affix.key === "minPhys")).toHaveLength(12)
    expect(affixes.filter(affix => affix.key === "minSilkbind")).toHaveLength(8)
  })
})
