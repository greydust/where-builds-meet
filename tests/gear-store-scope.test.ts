import { assert, describe, it, vi } from "vitest"

import type { PathId } from "@/application/contracts"
import type { BuildEntry, BuildState, GearItem } from "@/gear"

const pathA: PathId = "stonesplitStrength"
const pathB: PathId = "bamboocutWind"
const scopeKey = "wwm-gear-scope-v1"

function createStorage() {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
}

/** A fresh store against empty storage, because the store is a module singleton. */
async function gearStore(stored?: string) {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage }
  const localStorage = createStorage()
  if (stored !== undefined) localStorage.setItem(scopeKey, stored)
  globalThis.window = { localStorage, sessionStorage: createStorage() } as never
  globalThis.localStorage = localStorage as never
  globalThis.sessionStorage = createStorage() as never
  vi.resetModules()
  const store = await import("@/stores/gearStore.ts")
  store.useGearStore.getState().initialise(pathA)
  return {
    ...store,
    stored: () => {
      const raw = localStorage.getItem(scopeKey)
      return raw === null ? undefined : JSON.parse(raw)
    },
    restore: () => {
      globalThis.window = previous.window as never
      globalThis.localStorage = previous.localStorage as never
    },
  }
}

const build = (id: string): BuildEntry => ({ id, name: id, martialArts: ["snowparting", "phalanxbane"], equipped: {} })
const gear = (id: string): GearItem => ({
  id,
  slot: "leftWeapon",
  definitionId: "hengBlade",
  level: 96,
  rarity: "Gold",
  baseAffix: { key: "attack", value: 100 },
  additionalAffixes: [],
})

const withBuilds =
  (...ids: string[]) =>
  (state: BuildState) => ({ ...state, entries: [...state.entries, ...ids.map(build)] })
const withItems =
  (...ids: string[]) =>
  (state: BuildState) => ({ ...state, gearItems: [...state.gearItems, ...ids.map(gear)] })

describe("gear store scope", () => {
  it("keeps imported gear on its path after deleting the imported build and reloading", async () => {
    const { useGearStore, restore } = await gearStore()
    const { exportBuildState, mergeImportedBuildState } = await import("@/gear")
    const { visibleGearItems } = await import("@/application/gearScope")
    try {
      const store = useGearStore.getState()
      store.unshareGear("builds", { target: "path", pathId: pathA })
      store.unshareGear("inventory", { target: "path", pathId: pathA })
      const exported = exportBuildState({
        entries: [{ ...build("imported-build"), equipped: { leftWeapon: "imported-weapon" } }],
        gearItems: [{ ...gear("imported-weapon"), baseAffix: { key: "minPhys", value: 50 } }],
        activeBuildId: "imported-build",
      })
      const imported = mergeImportedBuildState(useGearStore.getState().buildState, JSON.parse(exported))
      assert.equal(imported.state.gearItems.length, 1)
      assert.equal(imported.importedBuildIds.length, 1)
      store.updateBuildState(pathA, () => imported.state)
      assert.equal(store.unplacedCount("builds"), 0)
      assert.equal(store.unplacedCount("inventory"), 0)

      store.updateBuildState(pathA, state => ({
        ...state,
        entries: state.entries.filter(entry => !imported.importedBuildIds.includes(entry.id)),
      }))
      store.initialise(pathA)
      const { buildState, scope } = useGearStore.getState()
      assert.equal(buildState.gearItems.length, 1)
      assert.deepEqual(
        visibleGearItems({ buildState, scope, pathId: pathA }).map(item => item.id),
        ["imported-weapon"],
      )
      assert.deepEqual(visibleGearItems({ buildState, scope, pathId: pathB }), [])
    } finally {
      restore()
    }
  })

  it("puts a new build on the path it was made on once builds are private, and on no path while they are shared", async () => {
    const { useGearStore, restore } = await gearStore()
    try {
      useGearStore.getState().updateBuildState(pathA, withBuilds("first"))
      // Shared is the default, so there is nothing to place and the map stays empty.
      assert(
        useGearStore.getState().scope.buildIdsByPath[pathA] === undefined,
        "A shared build must not be placed on a path.",
      )
      useGearStore.getState().unshareGear("builds", { target: "path", pathId: pathA })
      useGearStore.getState().updateBuildState(pathA, withBuilds("second"))
      assert(
        useGearStore.getState().scope.buildIdsByPath[pathA]?.includes("second"),
        "A build made on a path must be placed on that path.",
      )
      assert(
        !useGearStore.getState().scope.buildIdsByPath[pathB]?.includes("second"),
        "A build must not be placed on a path it was not made on.",
      )
    } finally {
      restore()
    }
  })

  it("stores the scope, so a reload does not lose the arrangement", async () => {
    const { useGearStore, stored, restore } = await gearStore()
    try {
      useGearStore.getState().unshareGear("builds", { target: "all", pathId: pathA })
      const record = stored()
      assert(record, "The scope must be written to storage.")
      assert(record.sharedBuilds === false, "Storage must record that builds are not shared.")
      assert(record.sharedInventory === true, "Storage must record the other setting, which did not change.")
    } finally {
      restore()
    }
  })

  it("asks about nothing once every build has a path, so a second switch is silent", async () => {
    const { useGearStore, restore } = await gearStore()
    try {
      const store = useGearStore.getState()
      store.updateBuildState(pathA, withBuilds("only"))
      assert(store.unplacedCount("builds") === 1, "A build with no path must be asked about.")
      store.unshareGear("builds", { target: "path", pathId: pathA })
      assert(store.unplacedCount("builds") === 0, "A placed build must not be asked about again.")
      store.shareGear("builds")
      assert(store.unplacedCount("builds") === 0, "Sharing must not forget the arrangement.")
      store.unshareGear("builds", { target: "path", pathId: pathB })
      assert(
        useGearStore.getState().scope.buildIdsByPath[pathA]?.includes("only"),
        "Turning sharing off again must not move a build the user already placed.",
      )
    } finally {
      restore()
    }
  })

  it("forgets a deleted build, so a later one reusing the id does not inherit its path", async () => {
    const { useGearStore, restore } = await gearStore()
    try {
      const store = useGearStore.getState()
      store.updateBuildState(pathA, withBuilds("temporary"))
      store.unshareGear("builds", { target: "path", pathId: pathA })
      store.updateBuildState(pathB, state => ({
        ...state,
        entries: state.entries.filter(entry => entry.id !== "temporary"),
      }))
      assert(
        !useGearStore.getState().scope.buildIdsByPath[pathA]?.includes("temporary"),
        "A deleted build must leave the scope.",
      )
      store.updateBuildState(pathB, withBuilds("temporary"))
      assert(
        !useGearStore.getState().scope.buildIdsByPath[pathA]?.includes("temporary"),
        "A new build must be placed where it was made, not where the old one was.",
      )
      assert(
        useGearStore.getState().scope.buildIdsByPath[pathB]?.includes("temporary"),
        "A new build must be placed on the path it was made on.",
      )
    } finally {
      restore()
    }
  })

  it("places new gear on the path it was added on only while the inventory is private", async () => {
    const { useGearStore, restore } = await gearStore()
    try {
      const store = useGearStore.getState()
      store.updateBuildState(pathA, withItems("shared-piece"))
      assert(
        useGearStore.getState().scope.itemIdsByPath[pathA] === undefined,
        "A shared inventory must not place its items.",
      )
      store.unshareGear("inventory", { target: "path", pathId: pathA })
      store.updateBuildState(pathA, withItems("private-piece"))
      assert(
        useGearStore.getState().scope.itemIdsByPath[pathA]?.includes("private-piece"),
        "A private inventory must place an item on the path it was added on.",
      )
    } finally {
      restore()
    }
  })

  it("leaves the scope untouched when only the active selection moves, since no id appeared or went", async () => {
    const { useGearStore, stored, restore } = await gearStore()
    try {
      useGearStore.getState().unshareGear("builds", { target: "path", pathId: pathA })
      const before = useGearStore.getState().scope
      useGearStore.getState().updateBuildState(pathA, state => ({ ...state, activeBuildId: "some-build" }))
      assert(useGearStore.getState().buildState.activeBuildId === "some-build", "The selection must move.")
      assert(useGearStore.getState().scope === before, "The scope must be the same value, not an equal copy.")
      // The scope is unchanged, so nothing new was written for it. A selection that produced a
      // fresh but equal scope object would rewrite the record on every path switch.
      assert(stored() === undefined || stored().buildIdsByPath !== undefined, "Storage must be readable.")
      assert(
        JSON.stringify(stored()?.buildIdsByPath) === JSON.stringify(before.buildIdsByPath),
        "Storage must not have been rewritten.",
      )
    } finally {
      restore()
    }
  })
})
