import { expect, it } from "vitest"

import affixMap from "../data/official/affix-map.json"
import { mergeImportedBuildState } from "../src/gear"
import { parseOfficialGearExport } from "../src/officialGearImport"

const weapons = ["snowparting", "phalanxbane"] as ["snowparting", "phalanxbane"]
function row(key: string, value: number) {
  const id = Object.entries(affixMap).find(([, mapped]) => mapped === key)?.[0]
  if (!id) throw new Error(`Missing affix mapping for ${key}`)
  return { equipmentDetails: [id, value] }
}
function piece(baseAffixes: unknown[], extra = {}) {
  return { exVo: { baseAttrs: { MIN_W_ATK: 53, MAX_W_ATK: 124 }, baseAffixes, ...extra } }
}
function merge(value: unknown) {
  const parsed = parseOfficialGearExport(value, weapons)
  const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
  expect(merged.importedBuildCount).toBe(1)
  expect(merged.importedGearCount).toBe(parsed.gearCount)
  return { parsed, merged }
}

it("imports the reported affixless dashboard setup without fabricating gear", () => {
  const { parsed, merged } = merge({
    source: "wwm-dashboard",
    v: 2,
    roleInfo: {
      roleName: "greydust",
      level: 100,
      kongfuMain: 20501,
      kongfuSub: 20701,
      passiveSlots: [601, 81, 602, 41],
      wearEquipsDetailed: {
        1: piece([], { suffix: -1, baseAttrs: { MIN_W_ATK: 2, MAX_W_ATK: 3 } }),
        2: piece([], { suffix: -1, baseAttrs: { MIN_W_ATK: 2, MAX_W_ATK: 3 } }),
        3: piece([], { suffix: 13, baseAttrs: { W_DEF: 1, HP_MAX: 39 } }),
        4: piece([], { suffix: 13, baseAttrs: { W_DEF: 1, HP_MAX: 131 } }),
        5: piece([], { suffix: 13, baseAttrs: { W_DEF: 2, HP_MAX: 66 } }),
        8: piece([], { suffix: -1, baseAttrs: { W_DEF: 1, HP_MAX: 97 } }),
        9: piece([], { suffix: -1, baseAttrs: { ARCHER_WEAKPOINT_DAMAGE: 48 } }),
        10: piece([], { suffix: 9, baseAttrs: { MIN_W_ATK: 8 } }),
        11: piece([], { suffix: 15, baseAttrs: { MAX_W_ATK: 7 } }),
        21: piece([], { suffix: -1, baseAttrs: { ARCHER_DAMAGE: 48 } }),
      },
    },
  })
  expect(parsed.gearCount).toBe(0)
  expect(parsed.warnings).toHaveLength(8)
  expect(merged.state.entries[0].name).toBe("greydust Import")
  expect(merged.state.entries[0].equipped).toEqual({})
  expect(merged.state.entries[0].martialArts).toEqual(["infernalTwinblades", "mortalRopeDart"])
  const moraleChant = merged.state.entries[0].setup?.innerWays.find(item => item.innerWay === "MoraleChant")
  expect(moraleChant).toBeDefined()
})

it("keeps valid gear in its original slot when earlier pieces are unusable", () => {
  const { parsed, merged } = merge({
    roleName: "Partial",
    wearEquipsDetailed: {
      1: piece([null, row("minPhys", 60)]),
      2: piece([row("minPhys", 53), row("agility", 40)]),
      3: piece([{ equipmentDetails: ["unknown", 6] }]),
      4: null,
      5: piece([], { suffix: 2 }),
      8: piece([], { suffix: 2 }),
    },
  })
  expect(parsed.gearCount).toBe(1)
  const item = merged.state.gearItems[0]
  expect(item.definitionId).toBe("moBlade")
  expect(item.baseAffix).toEqual({ key: "minPhys", value: 53 })
  expect(item.additionalAffixes).toEqual([{ key: "agility", value: 40 }])
  expect(merged.state.entries[0].equipped).toEqual({ rightWeapon: item.id })
  expect(merged.state.entries[0].setup?.armorSets.Formbend).toBe(2)
  expect(parsed.warnings).toHaveLength(5)
})

it("retains supported affixes when optional rows are malformed, duplicate, excessive, or negative", () => {
  const { parsed, merged } = merge({
    wearEquipsDetailed: {
      1: piece([
        row("minPhys", 53),
        null,
        row("agility", -1),
        row("agility", 40),
        row("agility", 50),
        row("minPhys", 60),
        row("maxPhys", 70),
        row("body", 10),
        row("defense", 12),
        row("physicalPenetration", -9),
      ]),
      2: piece([row("minPhys", 53)], { level: 10 }),
    },
  })
  expect(parsed.gearCount).toBe(1)
  expect(merged.state.gearItems[0].additionalAffixes).toEqual([
    { key: "agility", value: 40 },
    { key: "minPhys", value: 60 },
    { key: "maxPhys", value: 70 },
    { key: "body", value: 10 },
  ])
  expect(merged.state.gearItems[0].attunement).toBeUndefined()
  expect(parsed.warnings.length).toBeGreaterThan(0)
})

it("allows a setup-only export but still rejects unrecognized input", () => {
  const { parsed, merged } = merge({ source: "wwm-dashboard", roleInfo: { roleName: "Setup", wearEquipsDetailed: {} } })
  expect(parsed.gearCount).toBe(0)
  expect(merged.state.entries[0].equipped).toEqual({})
  expect(parsed.warnings).toHaveLength(1)
  expect(() => parseOfficialGearExport({}, weapons)).toThrow("wearEquipsDetailed")
  expect(() => parseOfficialGearExport({ source: "other", wearEquipsDetailed: {} }, weapons)).toThrow("recognized")
})
