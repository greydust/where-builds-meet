// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { breakthroughProfile } from "@/application/gameData/setup"
import BuildTab from "@/features/build/BuildTab"
import { buildPresetInventory, defaultBuildPresets, normalizeBuildSetup } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
import { useGearStore } from "@/stores/gearStore"

import { weaponPair } from "./helpers/weaponPair"

vi.mock("@/features/build/useBuildThroughputs", () => ({
  useBuildThroughputs: () => ({
    viewed: { dps: 200, hps: 0, totalDamage: 2000 },
    active: { dps: 100, hps: 0, totalDamage: 1000 },
  }),
}))
vi.mock("@/notices", () => ({ publishNotice: () => {}, dismissNotice: () => {} }))
vi.mock("@/i18n", () => ({
  getLocale: () => "en",
  t: (key: string, parameters: Record<string, string | number> = {}) => [key, ...Object.values(parameters)].join(" "),
  gameText: (value: string) => value,
  dataText: (_key: string, value: string) => value,
}))

it.each([false, true])("deletes gear immediately and changes only builds wearing it (equipped: %s)", async equipped => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const preset = defaultBuildPresets[0]
  const weapons = weaponPair(preset.martialArts)
  const settings = { weapons, breakthrough: "17", ping: 40 }
  const inventory = buildPresetInventory(preset)
  const item = inventory.items.find(item => item.id === inventory.equipped.leftWeapon)!
  const builds = [
    { id: "mine", name: "Mine", martialArts: [...weapons], equipped: {}, setup: normalizeBuildSetup({}) },
    {
      id: "other",
      name: "Other",
      martialArts: [...weapons],
      equipped: equipped ? { leftWeapon: item.id } : {},
      setup: normalizeBuildSetup({}),
    },
  ]
  useGearStore.setState({ buildState: { entries: builds, gearItems: [item], activeBuildId: "mine" } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  function Owner() {
    const state = useGearStore(store => store.buildState)
    return createElement(BuildTab, {
      pathId: "stonesplitStrength",
      builds: state.entries,
      visibleItems: state.gearItems,
      weapons,
      martialArtTags: [],
      graduatedBuildIds: [],
      onActiveBuildChange: () => {},
      onSelectBuildWeapons: () => true,
      activeRotation: { name: "Test", steps: [] },
      measurement: {
        environment: {
          pathId: "stonesplitStrength",
          settings,
          enemy: breakthroughProfile(settings),
          globalDebuffs: defaultGlobalDebuffs,
          setupSelections: { food: "None", script: "None", divinecraft: "None" },
          skillOverrides: {},
          previewId: null,
        },
        statOverrides: {},
        attunementOverrides: {},
      },
    })
  }
  try {
    await act(async () => root.render(createElement(Owner)))
    const click = async (label: string) =>
      act(async () => {
        const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
        expect(button).not.toBeNull()
        button!.click()
      })
    await click("ui.buildTab.deleteGear")
    expect(useGearStore.getState().buildState.gearItems).toHaveLength(1)
    await click("ui.buildTab.confirmDeleteGear")
    const next = useGearStore.getState().buildState
    expect(container.querySelector(".gear-card--item")).toBeNull()
    expect(next.gearItems).toHaveLength(0)
    expect(next.entries[0]).toBe(builds[0])
    expect(next.entries[1] === builds[1]).toBe(!equipped)
    expect(next.entries[1].equipped).toEqual({})
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
