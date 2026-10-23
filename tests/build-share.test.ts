// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { buildShareLink, clearSharedBuild, readSharedBuild } from "@/application/buildShare"
import {
  defaultBuildPresets,
  exportSharedBuild,
  mergeImportedBuildState,
  normalizeBuildSetup,
  resolveBuildInventory,
  resolveBuildSetup,
  type BuildEntry,
  type BuildSetup,
  type GearSlot,
} from "@/gear"

const preset = defaultBuildPresets.find(candidate => candidate.gearByTier["96"])!
const presetEntry: BuildEntry = {
  id: "preset-build",
  name: preset.name,
  isDefault: true,
  presetId: preset.id,
  martialArts: preset.martialArts,
}
const inventory = resolveBuildInventory(presetEntry, [], undefined, 96)
const equippedSlots: GearSlot[] = ["leftWeapon", "rightWeapon", "helmet", "chestpiece"]
const equipped = Object.fromEntries(
  equippedSlots.flatMap(slot => {
    const id = inventory.equipped[slot]
    return id ? [[slot, id]] : []
  }),
) as Partial<Record<GearSlot, string>>
const unusedItem = inventory.items.find(item => !Object.values(equipped).includes(item.id))!
const setup: BuildSetup = {
  innerWays: [{ innerWay: "HarmonySong", tier: "T6" }],
  weaponSets: { Cloudshear: 4 },
  armorSets: { Moonflare: 2 },
  bowRingSet: "Precision",
  arsenal: "Silkbind",
}
const entry: BuildEntry = { id: "build-1", name: "PvP build", martialArts: preset.martialArts, equipped, setup }
const normalizedSetup = normalizeBuildSetup(setup)

describe("build sharing", () => {
  it("shares one build and only the gear it equips", () => {
    const shared = JSON.parse(exportSharedBuild(entry, { items: inventory.items, equipped }, "PvP build"))

    expect(shared.builds).toHaveLength(1)
    expect(shared.builds[0]).toMatchObject({ id: entry.id, name: "PvP build", setup: normalizedSetup })
    expect(new Set(shared.gearItems.map((item: { id: string }) => item.id))).toEqual(new Set(Object.values(equipped)))
    expect(shared.gearItems.some((item: { id: string }) => item.id === unusedItem.id)).toBe(false)
  })

  it("resolves a preset's own setup and gear for sharing", () => {
    const exported = exportSharedBuild(presetEntry, inventory, preset.name)
    const shared = JSON.parse(exported)

    expect(shared.builds[0].setup).toEqual(resolveBuildSetup(presetEntry))
    expect(shared.gearItems).toHaveLength(inventory.items.length)
    expect(shared.builds[0].equipped).toEqual(inventory.equipped)
  })

  it("imports a shared build with its setup and equipped gear", () => {
    const shared = JSON.parse(exportSharedBuild(entry, { items: inventory.items, equipped }, "PvP build"))
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, shared, {
      reuseIdenticalGear: true,
    })

    expect(merged.importedBuildCount).toBe(1)
    expect(merged.importedGearCount).toBe(equippedSlots.length)
    const imported = merged.state.entries.find(candidate => candidate.id === merged.importedBuildIds[0])
    expect(imported?.setup).toEqual(normalizedSetup)
    expect(Object.keys(imported?.equipped ?? {})).toHaveLength(equippedSlots.length)
  })

  it("round-trips through a share URL and clears the fragment", async () => {
    const exported = exportSharedBuild(entry, { items: inventory.items, equipped }, "빌드")
    const url = new URL(await buildShareLink(exported))
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)

    expect(await readSharedBuild()).toEqual(JSON.parse(exported))

    clearSharedBuild()
    expect(await readSharedBuild()).toBeUndefined()
    expect(location.hash).toBe("")
  })
})
