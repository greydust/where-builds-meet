import { assert, describe, it, vi } from "vitest"

import type { CharacterProfile } from "@/characterProfiles"

const statKey = "wwm-stat-overrides-v1"
const attunementKey = "wwm-attunement-overrides-v1"

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

/** A fresh store against seeded storage, because the store is a module singleton. */
async function overrideStore(seed: Record<string, string> = {}) {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage }
  const localStorage = createStorage()
  for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value)
  globalThis.window = { localStorage, sessionStorage: createStorage() } as never
  globalThis.localStorage = localStorage as never
  globalThis.sessionStorage = createStorage() as never
  vi.resetModules()
  const store = await import("@/stores/overrideStore.ts")
  store.useOverrideStore.getState().initialise()
  return {
    ...store,
    get: (key: string) => localStorage.getItem(key),
    restore: () => {
      globalThis.window = previous.window as never
      globalThis.localStorage = previous.localStorage as never
    },
  }
}

const profile = {
  name: "Boss",
  statOverrides: { power: 12 },
  attunementOverrides: { physicalPenetration: 5 },
} as unknown as CharacterProfile

describe("override store", () => {
  it("reads the stored overrides, so a saved session resumes with them applied", async () => {
    const { useOverrideStore, restore } = await overrideStore({
      [statKey]: JSON.stringify({ power: 1200, nonsense: 5, allMysticDmgBoost: 0, areaMysticDmgBoost: 0.098 }),
      [attunementKey]: JSON.stringify({ physicalPenetration: 8 }),
    })
    try {
      assert(useOverrideStore.getState().statOverrides.power === 1200, "A stored stat override must load.")
      assert(useOverrideStore.getState().statOverrides.allMysticDmgBoost === 0, "The explicit Mystic override wins.")
      // A key the sheet does not know is dropped rather than carried, so it cannot reach a
      // calculation as a value no definition describes.
      assert(!("nonsense" in useOverrideStore.getState().statOverrides), "An unknown key must not load.")
      assert(
        useOverrideStore.getState().attunementOverrides.physicalPenetration === 8,
        "A stored attunement must load.",
      )
    } finally {
      restore()
    }
  })

  it("stores what each mutator sets, so a reload resumes from the same numbers", async () => {
    const { useOverrideStore, get, restore } = await overrideStore()
    try {
      const store = useOverrideStore.getState()
      store.setStatOverride("power", 1200)
      store.setAttunementOverride("physicalPenetration", 8)
      assert(JSON.parse(get(statKey)!).power === 1200, "A stat change must be stored.")
      assert(JSON.parse(get(attunementKey)!).physicalPenetration === 8, "An attunement change must be stored.")
    } finally {
      restore()
    }
  })

  it("drops the key on a reset rather than storing a zero, because absence is what means inherited", async () => {
    const { useOverrideStore, restore } = await overrideStore({
      [statKey]: JSON.stringify({ power: 1200, agility: 40 }),
    })
    try {
      const store = useOverrideStore.getState()
      store.resetStatOverride("power")
      const stored = useOverrideStore.getState().statOverrides
      assert(!("power" in stored), "A reset key must be gone from state, not set to zero.")
      assert(stored.agility === 40, "A reset must leave the other keys alone.")
    } finally {
      restore()
    }
  })

  /**
   * The record has to survive being emptied. `loadStatOverrides` falls back to the pre-override
   * key when its own record is missing, so removing the record to mean "nothing overridden"
   * would bring back the values an older session stored there.
   */
  it("keeps an empty record rather than removing the key, which would resurrect the legacy values", async () => {
    const { useOverrideStore, get, restore } = await overrideStore({ [statKey]: JSON.stringify({ power: 1200 }) })
    try {
      useOverrideStore.getState().resetStatOverride("power")
      assert(get(statKey) !== null, "The record must still exist once every key is gone.")
      assert(JSON.parse(get(statKey)!).power === undefined, "The record must be empty, not absent.")
      assert(Object.keys(useOverrideStore.getState().statOverrides).length === 0, "State must be empty too.")
    } finally {
      restore()
    }
  })

  it("replaces both records together, which is what applying a profile is", async () => {
    const { useOverrideStore, get, restore } = await overrideStore()
    try {
      useOverrideStore.getState().setOverrides(profile)
      assert(useOverrideStore.getState().statOverrides.power === 12, "The profile's stats must be applied.")
      assert(
        useOverrideStore.getState().attunementOverrides.physicalPenetration === 5,
        "The profile's attunements must be applied.",
      )
      // Replacing rather than merging: a key the new profile omits has to be inherited again
      // instead of keeping the previous profile's value, and the sheet shows that as unmodified.
      useOverrideStore.getState().setStatOverride("agility", 40)
      useOverrideStore.getState().setOverrides({ statOverrides: {}, attunementOverrides: {} })
      assert(Object.keys(useOverrideStore.getState().statOverrides).length === 0, "A profile must replace, not merge.")
      assert(JSON.parse(get(statKey)!).power === undefined, "Storage must agree with state.")
    } finally {
      restore()
    }
  })

  it("applies the same identity on a re-read, because the measurement context holds it by reference", async () => {
    const { useOverrideStore, restore } = await overrideStore()
    try {
      const store = useOverrideStore.getState()
      const before = store.statOverrides
      // A read that changes nothing, as re-rendering a memo's dependencies does, must not look
      // like a change or the measurement would be recomputed for no reason.
      assert(useOverrideStore.getState().statOverrides === before, "A re-read must be the same object.")
      store.setStatOverride("power", 1)
      assert(useOverrideStore.getState().statOverrides !== before, "A change must be a new object.")
      store.setStatOverride("power", 1)
      assert(
        JSON.stringify(useOverrideStore.getState().statOverrides) === JSON.stringify({ power: 1 }),
        "Setting the same value must leave the same content.",
      )
    } finally {
      restore()
    }
  })
})
