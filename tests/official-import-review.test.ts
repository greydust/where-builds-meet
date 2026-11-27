import { expect, it } from "vitest"

import { officialImportPaths } from "@/features/build/officialImportReview"
import { parseOfficialGearExport } from "@/officialGearImport"

it("offers no unrelated path for the reported Heavenquaker and Thundercry pair", () => {
  expect(officialImportPaths(["heavenquakerSpear", "thundercry"], false)).toEqual([])
  expect(officialImportPaths(["heavenquakerSpear", "thundercry"], true)).toEqual(["mixed"])
  expect(officialImportPaths(["stormbreaker", "thundercry"], true)).toEqual(["stonesplitMight", "mixed"])
})

it("preserves registered Inner Ways from outside the import path", () => {
  const parsed = parseOfficialGearExport(
    {
      source: "wwm-dashboard",
      v: 2,
      roleInfo: { kongfuMain: 20602, kongfuSub: 10301, passiveSlots: [401, 553, 351, 0], wearEquipsDetailed: {} },
    },
    ["panaceaFan", "soulshadeUmbrella"],
  )
  expect(parsed.exportValue.builds[0].setup.innerWays.map(row => row.innerWay)).toEqual([
    "ExquisiteScenery",
    "ThroatPiercingArt",
    "RoyalRemedy",
    "",
  ])
})
