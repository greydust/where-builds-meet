import defaultSetup from "@gamedata/default-setup.json"
import { create } from "zustand"

import { settingsForPath } from "@/application/characterComposition"
import type { CalculatorSettings, PathId, SetupSelections } from "@/application/contracts"
import { defaultSettings } from "@/application/gameData/setup"
import {
  divinecraftStorageKey,
  foodStorageKey,
  enduranceFoodStorageKey,
  globalDebuffStorageKey,
  pathStorageKey,
  scriptStorageKey,
  settingsStorageKey,
} from "@/application/persistence/keys"
import {
  loadDivinecraft,
  loadFood,
  loadEnduranceFood,
  loadScript,
  loadSelectedPath,
  loadSettings,
} from "@/application/persistence/settings"
import { defaultGlobalDebuffs, loadGlobalDebuffs, type GlobalDebuffState } from "@/globalDebuffs"
import { setPersistentItem } from "@/persistentStorage"

/**
 * What the user has brought to the fight: the path, the weapons and ping on it, the breakthrough
 * tier, the setup options, and the global buffs and debuffs in play.
 *
 * These are the inputs a calculation is measured against, not preferences about how the
 * application looks. `MeasurementContext` in `rotationCalculationBundle.ts` calls the same group
 * `environment`, and it is hashed into the cache key, so changing any of it must produce a
 * different measurement. Keeping it here rather than in `settingsStore` says which of the two a
 * value is: this store changes a number, that one changes behaviour.
 *
 * Read with selectors, like `rotationStore` and unlike the calculation cache in `dpsStore`: these
 * are values the interface mirrors, so a component displaying one should re-render when it moves.
 * Every mutator stores what it sets, so state and storage cannot drift apart.
 */
export type LoadoutStore = {
  pathId: PathId
  /** Weapons, breakthrough and ping. `breakthrough` is a runtime choice: it is never stored, so a
   *  newly released tier does not get frozen by a saved session. */
  settings: CalculatorSettings
  setupSelections: SetupSelections
  /**
   * Held as one object for the whole session so its identity is stable. The measurement context
   * holds this by reference and hands it to dependency arrays, so a fresh object per read would
   * make every consumer's inputs look changed on each render.
   */
  globalDebuffs: GlobalDebuffState

  /**
   * Reads the stored loadout, normalising the values that were normalised on load.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported. The application boots it
   * explicitly instead, once per mount, before anything reads it.
   *
   * `devMode` is passed in rather than read from storage here because it belongs to
   * `settingsStore` and is already resolved by the time this runs: a path that needs development
   * mode only resolves to itself when it is on, so the two stores load in that order and this one
   * takes the value the other already has.
   */
  initialise: (devMode: boolean) => void
  /** Stores the path on its own. Switching path is orchestrated by `App`, which has to settle the
   *  build and rotation selections with it. */
  setPath: (pathId: PathId) => void
  /** Accepts a value or an update, as the `useState` setter this replaces did. */
  setSettings: (next: CalculatorSettings | ((current: CalculatorSettings) => CalculatorSettings)) => void
  setSetupSelection: <K extends keyof SetupSelections>(key: K, value: SetupSelections[K]) => void
  setGlobalDebuffs: <K extends keyof GlobalDebuffState>(key: K, value: GlobalDebuffState[K]) => void
}

const setupStorageKey = {
  enduranceFood: enduranceFoodStorageKey,
  food: foodStorageKey,
  script: scriptStorageKey,
  divinecraft: divinecraftStorageKey,
} as const

const setupSelectionKeys = Object.keys(setupStorageKey) as Array<keyof SetupSelections>

/**
 * Breakthrough is left out on purpose: it is loaded as a default and chosen per session, so
 * storing it would pin a saved session to whatever the tiers were when it was saved.
 */
const persistSettings = (settings: CalculatorSettings) =>
  setPersistentItem(settingsStorageKey, JSON.stringify({ weapons: settings.weapons, ping: settings.ping }))

/**
 * Reads the stored loadout, in dependency order: the path first, because the weapons a session
 * resolves to are derived from it.
 */
const loadLoadout = (devMode: boolean) => {
  const pathId = loadSelectedPath(devMode)
  const settings = settingsForPath(loadSettings(), pathId)
  const setupSelections: SetupSelections = {
    food: loadFood(),
    enduranceFood: loadEnduranceFood(),
    script: loadScript(),
    divinecraft: loadDivinecraft(),
  }
  const globalDebuffs = loadGlobalDebuffs()
  // These were written on mount by the effects this store replaces, which is what migrates a
  // legacy weapon pair and normalises a stored path.
  setPersistentItem(pathStorageKey, pathId)
  persistSettings(settings)
  for (const key of setupSelectionKeys) setPersistentItem(setupStorageKey[key], setupSelections[key] ?? "None")
  setPersistentItem(globalDebuffStorageKey, JSON.stringify(globalDebuffs))
  return { pathId, settings, setupSelections, globalDebuffs }
}

export const useLoadoutStore = create<LoadoutStore>()((set, get) => ({
  pathId: "stonesplitStrength",
  settings: { ...defaultSettings },
  setupSelections: {
    food: defaultSetup.food,
    enduranceFood: "None",
    script: "None",
    divinecraft: defaultSetup.divinecraft,
  },
  globalDebuffs: { ...defaultGlobalDebuffs },

  initialise: devMode => set(loadLoadout(devMode)),

  setPath: pathId => {
    setPersistentItem(pathStorageKey, pathId)
    set({ pathId })
  },

  setSettings: next => {
    const settings = typeof next === "function" ? next(get().settings) : next
    persistSettings(settings)
    set({ settings })
  },

  setSetupSelection: (key, value) => {
    setPersistentItem(setupStorageKey[key], value ?? "None")
    set({ setupSelections: { ...get().setupSelections, [key]: value } })
  },

  setGlobalDebuffs: (key, value) =>
    set(state => {
      const globalDebuffs = { ...state.globalDebuffs, [key]: value }
      setPersistentItem(globalDebuffStorageKey, JSON.stringify(globalDebuffs))
      return { globalDebuffs }
    }),
}))
