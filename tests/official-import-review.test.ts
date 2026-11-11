import { expect, it } from "vitest"

import { officialImportForPath, officialImportPaths } from "@/features/build/officialImportReview"
import { parseOfficialGearExport } from "@/officialGearImport"

it("offers no unrelated path for the reported Heavenquaker and Thundercry pair", () => {
  expect(officialImportPaths(["heavenquakerSpear", "thundercry"], false)).toEqual([])
  expect(officialImportPaths(["heavenquakerSpear", "thundercry"], true)).toEqual(["mixed"])
  expect(officialImportPaths(["stormbreaker", "thundercry"], true)).toEqual(["stonesplitMight", "mixed"])
})

it("omits incompatible Inner Ways without destroying the source when the destination changes", () => {
  const parsed = parseOfficialGearExport(
    {
      source: "wwm-dashboard",
      v: 2,
      roleInfo: { kongfuMain: 10201, kongfuSub: 20401, passiveSlots: [403, 81, 4, 1], wearEquipsDetailed: {} },
    },
    ["heavenquakerSpear", "thundercry"],
  )
  const original = structuredClone(parsed.exportValue)
  const might = officialImportForPath(parsed.exportValue, "stonesplitMight")
  const mixed = officialImportForPath(parsed.exportValue, "mixed")
  expect(might.builds[0].setup.innerWays.find(row => row.innerWay === "ArtOfResistance")?.tier).toBe("T6")
  expect(might.builds[0].setup.innerWays.some(row => row.innerWay === "ShadowAssault")).toBe(false)
  expect(might.builds[0].setup.innerWays.some(row => row.innerWay === "" && row.tier === "T0")).toBe(true)
  expect(mixed).toEqual(original)
  expect(parsed.exportValue).toEqual(original)
})
