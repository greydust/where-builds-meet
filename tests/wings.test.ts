import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import {
  pathRequiresDev,
  pathStatusLabel,
  productionWeaponIds,
  typedPathDefinitions,
} from "@/application/gameData/paths"
import { allSkillDefinitions } from "@/application/gameData/skills"
import { weaponArtBonus } from "@/calculations/damage"
import { mainAttributeForWeapons } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"
import { buildEntryAvailableForMartialArts, defaultBuildPresets, gearDefinitionForSlot } from "@/gear"
import { normalizeStoredWeaponIds, weaponIds } from "@/types"

describe("Wings integration", () => {
  it("allows Wings without Dev mode and labels it as Preview", () => {
    expect(pathRequiresDev(typedPathDefinitions.silkbindWings)).toBe(false)
    expect(pathStatusLabel(typedPathDefinitions.silkbindWings)).not.toBe("")
    for (const weapon of typedPathDefinitions.silkbindWings.lockedWeapons!)
      expect(productionWeaponIds.has(weapon)).toBe(true)
  })
  it.each([
    ["willowbendFan", 0.1],
    ["museflowWaistDrum", 0.25],
  ])("applies the matching Art affix to every %s damage skill and component", (martialArt, expected) => {
    const skills = Object.values(allSkillDefinitions).filter(
      skill =>
        skill.martialArt === martialArt &&
        skill.action?.some(action => (action as { type?: string }).type === "damage"),
    )
    expect(skills.length).toBeGreaterThan(0)
    for (const skill of skills)
      expect(weaponArtBonus({ ...emptyStats, fanDmgBoost: 0.1, ribbonAndDrumDmgBoost: 0.25 }, skill.tags ?? [])).toBe(
        expected,
      )
  })
  it("resolves both weapons through the shared stat, gear, and empty-build pipelines", () => {
    const weapons = typedPathDefinitions.silkbindWings.lockedWeapons!
    expect(mainAttributeForWeapons([weapons[0]])).toBe("silkbind")
    expect(mainAttributeForWeapons([weapons[1]])).toBe("silkbind")
    for (const slot of ["leftWeapon", "rightWeapon"] as const) {
      expect(gearDefinitionForSlot(slot, weapons).definition.slots).toContain(slot)
    }
    const preset = defaultBuildPresets.find(preset => preset.id === "empty")!
    expect(
      buildEntryAvailableForMartialArts(
        { id: preset.id, name: preset.name, isDefault: true, presetId: preset.id },
        weapons,
      ),
    ).toBe(true)
    expect(
      weaponArtBonus({ ...emptyStats, ribbonAndDrumDmgBoost: 0.25, fanDmgBoost: 0.1 }, [
        martialArtDefinitions[weapons[0]].weapon,
      ]),
    ).toBe(0.25)
  })
  it("expands a previously universal weapon list while preserving a specific saved pair", () => {
    const oldUniversal = weaponIds.filter(id => id !== "museflowWaistDrum" && id !== "willowbendFan")
    expect(normalizeStoredWeaponIds(oldUniversal)).toEqual([...weaponIds])
    expect(normalizeStoredWeaponIds(["panaceaFan", "soulshadeUmbrella"])).toEqual(["panaceaFan", "soulshadeUmbrella"])
  })
})
