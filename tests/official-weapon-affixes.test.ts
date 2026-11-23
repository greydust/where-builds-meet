import { describe, expect, it } from "vitest"

import { mergeImportedBuildState } from "@/gear"
import { parseOfficialGearExport } from "@/officialGearImport"
import type { WeaponId } from "@/types"

describe("official weapon damage affixes", () => {
  it.each([
    {
      profile: { kongfuMain: 10306, kongfuSub: 21001, passiveSlots: [651, 652, 653, 654] },
      innerWays: ["HarmonySong", "ZephyrWhispers", "InkAndStrings", "BladesWill"],
    },
    { profile: { passiveSlots: [0, 0, 0, 0] }, innerWays: ["", "", "", ""] },
  ])("keeps the Drum damage roll when the dashboard lists Fan first (%j)", ({ profile, innerWays }) => {
    const parsed = parseOfficialGearExport(
      {
        ...profile,
        wearEquipsDetailed: {
          1: { exVo: { level: 100, rarity: "Gold", baseAffixes: [[10113001, 53]] } },
          2: {
            exVo: {
              level: 100,
              rarity: "Gold",
              baseAffixes: [
                [10113001, 54],
                [10193032, 0.05828],
              ],
            },
          },
        },
      },
      ["museflowWaistDrum", "willowbendFan"],
    )
    const { builds, gearItems } = parsed.exportValue
    expect(parsed.warnings).toEqual([])
    expect(gearItems.find(item => item.id === builds[0].equipped.leftWeapon)).toMatchObject({
      definitionId: "ribbonAndDrum",
      additionalAffixes: [{ key: "ribbonAndDrumDmgBoost", value: 0.05828 }],
    })
    expect(gearItems.find(item => item.id === builds[0].equipped.rightWeapon)?.definitionId).toBe("fan")
    expect(builds[0].setup.innerWays.map(slot => slot.innerWay)).toEqual(innerWays)
  })

  it("keeps each Bolt spear's rolls attached to its martial art when main and sub are reversed", () => {
    const parsed = parseOfficialGearExport(
      {
        kongfuMain: 20205,
        kongfuSub: 20204,
        passiveSlots: [751, 752, 753, 754],
        wearEquipsDetailed: {
          1: { exVo: { level: 105, rarity: "Gold", baseAffixes: [[10611002, 90]], suffix: 85 } },
          2: { exVo: { level: 105, rarity: "Gold", baseAffixes: [[10611002, 91]], suffix: 85 } },
        },
      },
      ["namelessSword", "namelessSpear"],
    )
    const { builds, gearItems } = parsed.exportValue
    expect(parsed.warnings).toEqual([])
    expect(builds[0].martialArts).toEqual(["jueyuXuanfengSpear", "boshanQuyueSpear"])
    expect(gearItems.find(item => item.id === builds[0].equipped.leftWeapon)?.baseAffix.value).toBe(91)
    expect(gearItems.find(item => item.id === builds[0].equipped.rightWeapon)?.baseAffix.value).toBe(90)
    expect(builds[0].setup.weaponSets).toMatchObject({ HanMang: 2 })
    expect(builds[0].setup.innerWays.map(slot => slot.innerWay)).toEqual([
      "ShenDuanQingFeng",
      "FuLiangYiYe",
      "MingFeiTongPan",
      "SuiXingQieTao",
    ])
  })

  const elementalKeys = [
    "minBellstrike",
    "maxBellstrike",
    "minStonesplit",
    "maxStonesplit",
    "minSilkbind",
    "maxSilkbind",
    "minBamboocut",
    "maxBamboocut",
  ]
  for (const [level, baseId, firstAdditionalId] of [
    [91, 9211001, 9293010],
    [96, 9713001, 9793023],
    [100, 10113001, 10193023],
  ]) {
    for (const alternateOffset of [0, 1000]) {
      it.each(elementalKeys)(`preserves %s at tier ${level}, ID variant ${alternateOffset}`, key => {
        const id = firstAdditionalId! + elementalKeys.indexOf(key) + alternateOffset
        const parsed = parseOfficialGearExport(
          {
            wearEquipsDetailed: {
              1: {
                exVo: {
                  level,
                  rarity: "Gold",
                  baseAffixes: [
                    [baseId, 30],
                    [id, 30],
                  ],
                },
              },
            },
          },
          ["snowparting", "phalanxbane"],
        )
        expect(parsed.warnings).toEqual([])
        const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
        expect(merged.importedGearCount).toBe(1)
        expect(merged.state.gearItems[0]?.additionalAffixes).toEqual([{ key, value: 30 }])
        expect(merged.state.gearItems[0]?.relayed === true).toBe(level !== 91)
      })
    }
  }
  it.each(elementalKeys)("imports tier-100 relayed %s as a base affix", key => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          1: { exVo: { level: 100, rarity: "Gold", baseAffixes: [[10113007 + elementalKeys.indexOf(key), 30]] } },
        },
      },
      ["snowparting", "phalanxbane"],
    )
    expect(parsed.warnings).toEqual([])
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
    expect(merged.importedGearCount).toBe(1)
    expect(merged.state.gearItems[0]).toMatchObject({ relayed: true, baseAffix: { key, value: 30 } })
  })
  it("identifies tier-100 Purple armor from dashboard base attributes", () => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: Object.fromEntries(
          [
            [3, 6192, 23],
            [4, 12383, 23],
            [5, 6192, 45],
            [8, 6192, 23],
          ].map(([slot, hp, defense]) => [
            slot,
            { exVo: { baseAttrs: { HP_MAX: hp, W_DEF: defense }, baseAffixes: [[10142004, 0.09776]] } },
          ]),
        ),
      },
      ["snowparting", "phalanxbane"],
    )
    expect(parsed.warnings).toEqual([])
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
    expect(merged.importedGearCount).toBe(4)
    expect(merged.state.gearItems.every(item => item.level === 100 && item.rarity === "Purple")).toBe(true)
  })
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
  it.each([
    [96, 9793032],
    [96, 9794032],
    [100, 10193032],
    [100, 10194032],
  ])("imports Art of Ribbon & Drum at tier %s from ID %s", (level, id) => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          1: {
            exVo: {
              level,
              rarity: "Gold",
              baseAffixes: [
                [level === 96 ? 9713001 : 10113001, 53],
                [id, 0.05828],
              ],
            },
          },
        },
      },
      ["museflowWaistDrum", "willowbendFan"],
    )
    expect(parsed.warnings).toEqual([])
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
    expect(merged.importedGearCount).toBe(1)
    expect(merged.state.gearItems[0]).toMatchObject({
      definitionId: "ribbonAndDrum",
      additionalAffixes: [{ key: "ribbonAndDrumDmgBoost", value: 0.05828 }],
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
