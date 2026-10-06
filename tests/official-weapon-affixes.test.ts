import { describe, expect, it } from "vitest"

import { mergeImportedBuildState } from "@/gear"
import { parseOfficialGearExport } from "@/officialGearImport"
import type { WeaponId } from "@/types"

describe("official weapon damage affixes", () => {
  it("imports a Trial weapon elemental base roll through the relay mechanism", () => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          1: {
            exVo: {
              level: 96,
              rarity: "Purple",
              baseAffixes: [
                [9620007, 35],
                [9793015, 0.05828],
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
    expect(merged.state.gearItems[0]).toMatchObject({
      relayed: true,
      baseAffix: { key: "minBellstrike", value: 35 },
      additionalAffixes: [{ key: "swordDmgBoost", value: 0.05828 }],
    })
  })
  const cases: Array<[WeaponId, string, number, number]> = [
    ["namelessSword", "swordDmgBoost", 9793015, 9293021],
    ["stormbreaker", "spearDmgBoost", 9793016, 9293022],
    ["inkwellFan", "fanDmgBoost", 9793020, 9293026],
    ["infernalTwinblades", "dualBladesDmgBoost", 9793018, 9293024],
  ]

  it("preserves the Tier 96 alternate Art of Gauntlet ID", () => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          1: {
            exVo: {
              level: 96,
              rarity: "Gold",
              baseAffixes: [{ equipmentDetails: [9711001, 53] }, { equipmentDetails: [9794031, 0.05828] }],
            },
          },
        },
      },
      ["heavenwill", "snowparting"],
    )
    expect(parsed.warnings).toEqual([])
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
    expect(merged.importedGearCount).toBe(1)
    expect(merged.state.gearItems[0]?.additionalAffixes).toEqual([{ key: "gauntletDmgBoost", value: 0.05828 }])
  })

  for (const [weapon, key, tier96Id, tier91Id] of cases) {
    for (const [level, id] of [
      [96, tier96Id],
      [91, tier91Id],
    ] as const) {
      for (const affixId of [id, id + 1000]) {
        it(`preserves ${key} from dashboard ID ${affixId} through build validation`, () => {
          const parsed = parseOfficialGearExport(
            {
              wearEquipsDetailed: {
                1: {
                  exVo: {
                    level,
                    rarity: "Gold",
                    baseAffixes: [
                      { equipmentDetails: [level === 96 ? 9711001 : 9211001, 53] },
                      { equipmentDetails: [affixId, 0.05828] },
                    ],
                  },
                },
              },
            },
            [weapon, "snowparting"],
          )
          expect(parsed.warnings).toEqual([])
          const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
          expect(merged.importedGearCount).toBe(1)
          expect(merged.state.gearItems[0]?.additionalAffixes).toEqual([{ key, value: 0.05828 }])
        })
      }
    }
  }
})
