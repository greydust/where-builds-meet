import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadAttunementStats } from "@/application/persistence/attunements"
import { loadPathSelectionIds } from "@/application/persistence/pathSelection"
import { loadRotationEntries } from "@/application/persistence/rotations"
import { loadStats } from "@/application/persistence/stats"
import { loadBuildState } from "@/gear"

import { windowWithStorage } from "./helpers/domStubs"

class MemoryStorage implements Storage {
  #values = new Map<string, string>()

  get length() {
    return this.#values.size
  }

  clear() {
    this.#values.clear()
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.#values.delete(key)
  }

  setItem(key: string, value: string) {
    this.#values.set(key, String(value))
  }
}

describe("legacy persistence adapters", () => {
  let localStorage: MemoryStorage
  let sessionStorage: MemoryStorage

  beforeEach(() => {
    localStorage = new MemoryStorage()
    sessionStorage = new MemoryStorage()
    globalThis.window = windowWithStorage({ localStorage, sessionStorage })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window")
  })

  it("translates the legacy character-stat representation before loading it", () => {
    localStorage.setItem(
      "wwm-character-stats-v2",
      JSON.stringify({ precision: 10, bellstrikePen: 5, attributeDmgBonus: 20 }),
    )

    const stats = loadStats()

    expect(stats.precision).toBe(0.1)
    expect(stats.bellstrikePenetration).toBe(5)
    expect(stats.bellstrikeDmgBonus).toBe(0.2)
  })

  it("keeps legacy percentage attunements in the current decimal representation", () => {
    localStorage.setItem("wwm-attunement-session-v1", JSON.stringify({ phalanxbaneChargedBoost: 10 }))

    expect(loadAttunementStats().phalanxbaneChargedBoost).toBe(0.1)
  })

  it("does not let an invalid legacy attunement discard a valid one", () => {
    localStorage.setItem(
      "wwm-attunement-session-v1",
      JSON.stringify({ phalanxbaneChargedBoost: 10, physicalPenetration: "invalid" }),
    )

    const stats = loadAttunementStats()

    expect(stats.phalanxbaneChargedBoost).toBe(0.1)
    expect(stats.physicalPenetration).toBe(0)
  })

  it("promotes a legacy active-path selection into the current per-path map", () => {
    localStorage.setItem("wwm-active-build-v1", "legacy-build")

    const selections = loadPathSelectionIds("wwm-active-build-by-path-v1", "wwm-active-build-v1", "stonesplitStrength")

    expect(selections.stonesplitStrength).toBe("legacy-build")
    expect(JSON.parse(localStorage.getItem("wwm-active-build-by-path-v1") ?? "null")).toEqual({
      stonesplitStrength: "legacy-build",
    })
  })

  it("reads the superseded single-rotation key through the legacy boundary", () => {
    localStorage.setItem("wwm-rotation-editor-session-v2", JSON.stringify({ name: "Legacy rotation", steps: [] }))

    expect(loadRotationEntries().some(entry => entry.id === "migrated-default-rotation")).toBe(true)
  })

  it("loads renamed presets by ID and preserves user-authored names", () => {
    const buildId = "pure-fully-relayed-min-ew"
    const oldBuildName = "Pure Fully Relayed Min Build EW"
    localStorage.setItem(
      "wwm-build-list-v1",
      JSON.stringify([
        { id: buildId, name: oldBuildName, isDefault: true },
        { id: "custom-build", name: oldBuildName, martialArts: ["snowparting", "phalanxbane"] },
      ]),
    )
    const builds = loadBuildState().entries
    expect(builds.find(entry => entry.id === buildId)?.name).toBe("Pure Fully Relayed Min EW Build")
    expect(builds.find(entry => entry.id === "custom-build")?.name).toBe(oldBuildName)

    const preset = loadRotationEntries().find(entry => entry.id === "mixed-dummy-1-min")!
    const oldRotation = { ...preset.rotation, name: "Mixed Dummy 1 Min" }
    localStorage.setItem(
      "wwm-rotation-list-session-v1",
      JSON.stringify([
        { ...preset, rotation: oldRotation },
        { id: "custom-rotation", rotation: oldRotation, martialArts: preset.martialArts },
      ]),
    )
    const rotations = loadRotationEntries()
    expect(rotations.find(entry => entry.id === preset.id)?.rotation.name).toBe("Mixed Dummy 1 Min IV")
    expect(rotations.filter(entry => !entry.isDefault).map(entry => [entry.id, entry.rotation.name])).toEqual([
      ["custom-rotation", oldRotation.name],
    ])
  })

  it("discards a stored placeholder selection so a WIP path resolves its configured default", async () => {
    const { defaultBuildIdForPath, defaultRotationIdForPath } = await import("@/application/gameData/paths")
    const { resolvePathWorkspaceSelection } = await import("@/pathWorkspace")
    const pathId = "bamboocutDust"
    localStorage.setItem("wwm-active-build-by-path-v1", JSON.stringify({ [pathId]: "empty" }))
    localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ [pathId]: "empty" }))

    const selection = resolvePathWorkspaceSelection({
      buildIds: ["empty", defaultBuildIdForPath(pathId)],
      rotationIds: ["empty", defaultRotationIdForPath(pathId)],
      savedBuildId: loadPathSelectionIds("wwm-active-build-by-path-v1", "wwm-active-build-v1", pathId)[pathId],
      savedRotationId: loadPathSelectionIds("wwm-active-rotation-by-path-v1", "wwm-active-rotation-session-v1", pathId)[
        pathId
      ],
      defaultBuildId: defaultBuildIdForPath(pathId),
      defaultRotationId: defaultRotationIdForPath(pathId),
    })

    expect(selection?.buildId).toBe(defaultBuildIdForPath(pathId))
    expect(selection?.rotationId).toBe(defaultRotationIdForPath(pathId))
  })

  it("does not promote a legacy selection that holds the placeholder", () => {
    localStorage.setItem("wwm-active-build-v1", "empty")

    const selections = loadPathSelectionIds("wwm-active-build-by-path-v1", "wwm-active-build-v1", "stonesplitMight")

    expect(selections.stonesplitMight).toBeUndefined()
    expect(localStorage.getItem("wwm-active-build-by-path-v1")).toBeNull()
  })
})
