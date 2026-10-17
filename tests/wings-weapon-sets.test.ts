import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { availableSetEntriesForTags, weaponSetDefinitions, normalizeBuildSetup } from "@/gear"

describe("Wings weapon set availability", () => {
  it("offers Cloudshear and Etherwrath for the locked pair and retains saved selections", () => {
    const path = typedPathDefinitions.silkbindWings
    const tags = path.lockedWeapons!.map(id => martialArtDefinitions[id].tag)
    expect(
      availableSetEntriesForTags(weaponSetDefinitions, tags, path.tag)
        .map(([id]) => id)
        .sort(),
    ).toEqual(["Cloudshear", "Etherwrath"])
    const setup = normalizeBuildSetup({ weaponSets: { Cloudshear: 2, Etherwrath: 2 } })
    expect(setup.weaponSets.Cloudshear).toBe(2)
    expect(setup.weaponSets.Etherwrath).toBe(2)
    expect(
      availableSetEntriesForTags(weaponSetDefinitions, ["NamelessSword", "NamelessSpear"], "BellstrikeSplendor").some(
        ([id]) => id === "Cloudshear",
      ),
    ).toBe(false)
  })
})
