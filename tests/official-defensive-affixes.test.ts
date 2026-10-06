import { describe, expect, it } from "vitest"

import { calculateEquippedGearEffects, mergeImportedBuildState, parseGearInventory } from "@/gear"
import { parseOfficialGearExport } from "@/officialGearImport"

describe("official defensive affixes", () => {
  it("preserves all four defensive rolls through import, storage, and equipped effects", () => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          1: {
            exVo: {
              level: 96,
              rarity: "Gold",
              baseAffixes: [
                [9711001, 53],
                [9793001, 40],
                [9793003, 41],
                [9793006, 2500],
                [9793009, 35],
              ],
            },
          },
        },
      },
      ["namelessSword", "snowparting"],
    )
    expect(parsed.warnings).toEqual([])
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
    expect(merged.importedGearCount).toBe(1)
    const inventory = parseGearInventory(
      JSON.parse(JSON.stringify({ items: merged.state.gearItems, equipped: merged.state.entries[0]!.equipped })),
    )
    expect(inventory.items[0]?.additionalAffixes).toEqual([
      { key: "body", value: 40 },
      { key: "defense", value: 41 },
      { key: "maxHp", value: 2500 },
      { key: "physicalDefense", value: 35 },
    ])
    expect(calculateEquippedGearEffects(inventory, ["namelessSword", "snowparting"]).stats).toMatchObject({
      body: 40,
      defense: 41,
      maxHp: 2500,
      physicalDefense: 35,
    })
  })

  for (const [slot, id, key, value] of [
    [3, 9743001, "maxHp", 2500],
    [4, 9743002, "physicalDefense", 35],
    [5, 9753006, "body", 40],
    [8, 9753001, "maxHp", 2500],
  ] as const) {
    it(`accepts defensive armor base affix ${id}`, () => {
      const parsed = parseOfficialGearExport(
        {
          wearEquipsDetailed: {
            [slot]: {
              exVo: {
                level: 96,
                rarity: "Gold",
                baseAffixes: [
                  [id, value],
                  [9793103, 41],
                ],
              },
            },
          },
        },
        ["namelessSword", "snowparting"],
      )
      expect(parsed.warnings).toEqual([])
      const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
      expect(merged.importedGearCount).toBe(1)
      expect(merged.state.gearItems[0]?.baseAffix).toEqual({ key, value })
      expect(merged.state.gearItems[0]?.additionalAffixes).toEqual([{ key: "defense", value: 41 }])
    })
  }
})
