// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import type { PathId } from "@/application/contracts"
import { breakthroughProfile } from "@/application/gameData/setup"
import { sharedGearScope } from "@/application/gearScope"
import BuildTab from "@/features/build/BuildTab"
import { officialImportForPath } from "@/features/build/officialImportReview"
import { defaultBuildPresets, normalizeBuildSetup } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
import { parseOfficialGearExport } from "@/officialGearImport"
import { useGearStore } from "@/stores/gearStore"
import { useSettingsStore } from "@/stores/settingsStore"

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

function assertNoDestinationReview(review: HTMLDialogElement) {
  expect([...review.querySelectorAll("p")].map(paragraph => paragraph.textContent)).toEqual([
    "ui.buildTab.officialImportNoPath",
    "ui.buildTab.officialImportMainWeapon HeavenQuaker Spear",
    "ui.buildTab.officialImportSecondaryWeapon Thundercry Blade",
  ])
  expect(review.querySelectorAll("select, input, .build-page, ul")).toHaveLength(0)
}

it.each([
  { devMode: false, unmatched: false, target: "bamboocutWind", activate: false },
  { devMode: false, unmatched: false, target: "bamboocutWind", activate: true },
  { devMode: true, unmatched: false, target: "mixed", activate: true },
  { devMode: true, unmatched: true, target: "mixed", activate: false },
  { devMode: false, unmatched: true, target: "", activate: false },
])("reviews imports: %j", async ({ devMode, unmatched, target, activate }) => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  useSettingsStore.setState({ devMode })
  const selectWeapons = vi.fn<() => boolean>(() => true)
  const payload = {
    source: "wwm-dashboard",
    v: 2,
    roleInfo: {
      roleName: "Preview Hero",
      kongfuMain: unmatched ? 10201 : 20501,
      kongfuSub: unmatched ? 20401 : 20701,
      passiveSlots: [403, 81, 4, 1],
      wearEquipsDetailed: {},
    },
  }
  const preset = defaultBuildPresets[0]
  const weapons = weaponPair(preset.martialArts)
  const settings = { weapons, breakthrough: "17", ping: 40 }
  const builds = [
    { id: "mine", name: "My Build", martialArts: [...weapons], equipped: {}, setup: normalizeBuildSetup({}) },
    { id: "other", name: "Other Build", martialArts: [...weapons], equipped: {}, setup: normalizeBuildSetup({}) },
  ]
  useGearStore.setState({
    scope: { ...sharedGearScope, sharedBuilds: false, sharedInventory: false, buildIdsByPath: {}, itemIdsByPath: {} },
    activeBuildIdsByPath: {},
    buildState: { entries: builds, gearItems: [], activeBuildId: "mine" },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(button => button.textContent === label)!
  const show = async (rotationName: string) =>
    act(async () =>
      root.render(
        createElement(BuildTab, {
          pathId: "stonesplitStrength",
          builds,
          visibleItems: [],
          weapons,
          martialArtTags: [],
          graduatedBuildIds: [],
          onActiveBuildChange: () => {},
          onSelectBuildWeapons: selectWeapons,
          activeRotation: { name: rotationName, steps: [] },
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
        }),
      ),
    )
  try {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
    await import("@/officialGearImport")
    await show("Snapshot")
    await act(async () => button("ui.buildTab.importFromOfficial").click())
    const textarea = container.querySelector("textarea")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        JSON.stringify(payload),
      )
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const pasteDialog = container.querySelector<HTMLDialogElement>(".official-import-dialog")!
    expect(pasteDialog.open).toBe(true)
    await act(async () => button("ui.buildTab.importGear").click())
    const review = container.querySelector<HTMLDialogElement>('[aria-label="ui.buildTab.officialImportPreview"]')!
    expect(pasteDialog.open).toBe(false)
    expect(review.open).toBe(true)
    expect(useGearStore.getState().buildState.entries).toHaveLength(2)
    if (!target) {
      assertNoDestinationReview(review)
      await act(async () => review.querySelector<HTMLButtonElement>("button")!.click())
      return
    }
    const name = review.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(name.value).toBe("Preview Hero Import")
    expect(review.textContent).not.toContain("ui.buildTab.officialImportGearCount")
    expect(useGearStore.getState().buildState.entries).toHaveLength(2)
    const destination = review.querySelector<HTMLSelectElement>("label select")!
    expect([...destination.options].map(option => option.value)).toEqual(
      unmatched ? (devMode ? ["mixed"] : [""]) : devMode ? ["bamboocutWind", "mixed"] : ["bamboocutWind"],
    )
    const confirm = review.querySelector<HTMLButtonElement>(".dialog-actions button:last-child")!
    expect(confirm.disabled).toBe(false)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "   ")
      name.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(confirm.disabled).toBe(true)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "  My imported build  ")
      name.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(confirm.disabled).toBe(false)
    expect(review.textContent!.includes("ui.buildTab.officialImportNoPath")).toBe(!target)
    await act(async () => {
      destination.value = target
      destination.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect([...review.querySelectorAll<HTMLSelectElement>(".build-page select")].every(select => select.disabled)).toBe(
      true,
    )
    expect([...review.querySelectorAll<HTMLButtonElement>(".build-page button")].every(button => button.disabled)).toBe(
      true,
    )
    expect(name.value).toBe("  My imported build  ")
    expect(review.textContent).not.toContain("TT6")
    const checkbox = review.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    if (activate) await act(async () => checkbox.click())
    await act(async () => confirm.click())
    const state = useGearStore.getState()
    const imported = state.buildState.entries.find(entry => entry.name === "My imported build")!
    expect(Boolean(imported)).toBe(Boolean(target))
    expect(state.buildState.activeBuildId).toBe(activate ? imported?.id : "mine")
    expect(Object.values(state.activeBuildIdsByPath).includes(imported?.id ?? "")).toBe(activate)
    expect(state.scope.buildIdsByPath[target as PathId]?.includes(imported?.id ?? "") ?? false).toBe(Boolean(target))
    expect(imported?.setup).toEqual(
      target
        ? officialImportForPath(parseOfficialGearExport(payload, weapons).exportValue, target as PathId).builds[0].setup
        : undefined,
    )
    expect(selectWeapons.mock.calls).toHaveLength(activate ? 1 : 0)
    expect(review.open).toBe(!target)
    if (!target) await act(async () => review.querySelector<HTMLButtonElement>(".dialog-actions button")!.click())
    expect(review.open).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
