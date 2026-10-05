import { assert, describe, it } from "vitest"

import type { PathId } from "@/application/contracts"
import { defaultBuildIdForPath, typedPathDefinitions } from "@/application/gameData/paths"
import {
  gearScopeWithIds,
  gearScopeWithoutIds,
  loadGearScope,
  sharedGearScope,
  unplacedIds,
  visibleBuilds,
  visibleGearItems,
  type GearScope,
} from "@/application/gearScope"
import { placeholderSelectionId } from "@/application/persistence/pathSelection"
import { defaultBuildPresets, type BuildEntry, type BuildState, type GearItem } from "@/gear"
import type { WeaponId } from "@/types"

const pathA: PathId = "stonesplitStrength"
const pathB: PathId = "bamboocutWind"
const groupA = typedPathDefinitions[pathA].buildGroup
const groupB = typedPathDefinitions[pathB].buildGroup

const item = (id: string): GearItem => ({
  id,
  slot: "leftWeapon",
  definitionId: "hengBlade",
  level: 96,
  rarity: "Gold",
  baseAffix: { key: "attack", value: 100 },
  additionalAffixes: [],
})

const pair: [WeaponId, WeaponId] = ["snowparting", "phalanxbane"]
const userBuild = (id: string, weapons: BuildEntry["martialArts"] = pair): BuildEntry => ({
  id,
  name: id,
  martialArts: weapons,
  equipped: {},
})

/** The shipped presets as `loadBuildState` would produce them, plus whatever user builds the
 *  fixture adds. Presets are rebuilt from the game data on every load rather than stored, so a
 *  fixture that omitted them would not exercise the rule that matters most here. */
function buildState(userBuilds: BuildEntry[], gearItems: GearItem[] = []): BuildState {
  return {
    entries: [
      ...defaultBuildPresets.map(preset => ({
        id: preset.id,
        name: preset.name,
        isDefault: true,
        presetId: preset.id,
        martialArts: [...preset.martialArts],
      })),
      ...userBuilds,
    ],
    activeBuildId: "",
    gearItems,
  }
}

const privateScope = (over: Partial<GearScope> = {}): GearScope => ({
  ...sharedGearScope,
  sharedInventory: false,
  sharedBuilds: false,
  ...over,
})

describe("gear scope", () => {
  it("shares both by default, so a session that never chose sees one inventory and one build list", async () => {
    const createStorage = () => {
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
    const localStorage = createStorage()
    globalThis.window = { localStorage, sessionStorage: createStorage() } as unknown as Window & typeof globalThis
    globalThis.localStorage = localStorage as unknown as Storage
    try {
      assert(loadGearScope().sharedInventory, "An absent record must share the inventory.")
      assert(loadGearScope().sharedBuilds, "An absent record must share the builds.")
      // A record written before a setting existed was sharing it, which is what it did.
      localStorage.setItem("wwm-gear-scope-v1", JSON.stringify({ sharedInventory: false }))
      const partial = loadGearScope()
      assert(!partial.sharedInventory, "A stored false must be honoured.")
      assert(partial.sharedBuilds, "An absent setting must fall back to sharing.")
    } finally {
      Reflect.deleteProperty(globalThis, "window")
      Reflect.deleteProperty(globalThis, "localStorage")
    }
  })

  it("gives a path its own default build even with sharing off, because presets are never scoped", () => {
    const scope = privateScope()
    // The paths whose default is the `empty` placeholder are excluded on purpose. That preset is
    // a test fixture, so production already resolves those paths to no build at all, and this
    // change must not be what decides that.
    const withRealDefault = (Object.keys(typedPathDefinitions) as PathId[]).filter(
      pathId => !defaultBuildIdForPath(pathId).startsWith(placeholderSelectionId),
    )
    assert(withRealDefault.length > 0, "The game data must give some path a real default build.")
    for (const pathId of withRealDefault) {
      const builds = visibleBuilds({
        buildState: buildState([]),
        scope,
        pathId,
        buildGroup: typedPathDefinitions[pathId].buildGroup,
        weapons: ["snowparting", "phalanxbane"],
        devMode: false,
      })
      // Without this the path resolves no active build at all, because `defaultBuildIdForPath`
      // names a preset and the preset list is rebuilt from the game data rather than stored.
      assert(
        builds.some(entry => entry.id === defaultBuildIdForPath(pathId)),
        `${pathId} lost its default build.`,
      )
    }
  })

  it("keeps a test preset out of production with sharing off, since the scope is not what hides it", () => {
    const testPreset = defaultBuildPresets.find(preset => preset.test)
    assert(testPreset, "The game data must ship a test preset for this to mean anything.")
    const scope = privateScope()
    const input = { buildState: buildState([]), scope, pathId: pathA, buildGroup: groupA, weapons: pair }
    const production = visibleBuilds({ ...input, devMode: false })
    const development = visibleBuilds({ ...input, devMode: true })
    assert(!production.some(entry => entry.id === testPreset.id), "A test preset must not reach production.")
    assert(
      development.some(entry => entry.id === testPreset.id),
      "Dev mode must still reach a test preset.",
    )
  })

  it("follows a shared build onto any path whose weapons match it", () => {
    const builds = visibleBuilds({
      buildState: buildState([userBuild("shared-build")]),
      scope: sharedGearScope,
      pathId: pathB,
      buildGroup: groupB,
      weapons: ["snowparting", "phalanxbane"],
      devMode: false,
    })
    assert(
      builds.some(entry => entry.id === "shared-build"),
      "A shared build must reach a path it matches.",
    )
  })

  it("confines a private build to the path it was placed on, weapons matching or not", () => {
    const scope = privateScope({ buildIdsByPath: { [pathA]: ["private-build"] } })
    const matching = { buildState: buildState([userBuild("private-build")]), weapons: pair }
    const onItsOwnPath = visibleBuilds({ ...matching, scope, pathId: pathA, buildGroup: groupA, devMode: false })
    assert(
      onItsOwnPath.some(entry => entry.id === "private-build"),
      "A placed build must show on its own path.",
    )
    // The path the weapons would have carried it to: the placement is the whole rule, so a
    // matching pair no longer reaches it.
    const onTheOther = visibleBuilds({ ...matching, scope, pathId: pathB, buildGroup: groupB, devMode: false })
    assert(
      !onTheOther.some(entry => entry.id === "private-build"),
      "A private build must not follow the weapons to another path.",
    )
    // And a build whose weapons do not match is still shown where it was placed, because the
    // user put it there on purpose.
    const mismatched = visibleBuilds({
      ...matching,
      scope,
      pathId: pathA,
      buildGroup: groupA,
      weapons: ["thundercry", "stormbreaker"],
      devMode: false,
    })
    assert(
      mismatched.some(entry => entry.id === "private-build"),
      "A placed build must survive a weapon mismatch.",
    )
  })

  it("keeps a build that sharing has been turned off and on again", () => {
    const placed = privateScope({ buildIdsByPath: { [pathA]: ["kept-build"] } })
    // Sharing is the default, so the record written while it was off is the only trace of the
    // placement. Dropping the map on the way back to shared would make the second trip lossy,
    // and turning sharing off again would then ask about a build the user never removed.
    const shared = { ...placed, sharedBuilds: true }
    const turnedBackOff = gearScopeWithIds(shared, "builds", [], { target: "path", pathId: pathB })
    assert(
      turnedBackOff.buildIdsByPath[pathA]?.includes("kept-build"),
      "The placement must survive a trip through shared, and a placement that adds nothing must not clear it.",
    )
    assert(
      unplacedIds(turnedBackOff, "builds", ["kept-build"]).length === 0,
      "A placed build must not be offered to the question again.",
    )
  })

  it("asks only about ids that no path has yet, so a second trip through the question is quiet", () => {
    const scope = privateScope({ buildIdsByPath: { [pathA]: ["placed"] } })
    assert(
      unplacedIds(scope, "builds", ["placed", "fresh"]).join() === "fresh",
      "An id already on a path must not be asked about again.",
    )
  })

  it("gives unplaced ids to every path or to one, without dropping what a path already had", () => {
    const scope = privateScope({ buildIdsByPath: { [pathA]: ["older"] } })
    const everywhere = gearScopeWithIds(scope, "builds", ["new"], { target: "all", pathId: pathA })
    assert(everywhere.buildIdsByPath[pathA]?.includes("older"), "The placing path must keep what it had.")
    assert(everywhere.buildIdsByPath[pathA]?.includes("new"), "The placing path must gain the new ids.")
    assert(
      Object.values(everywhere.buildIdsByPath).every(ids => ids?.includes("new")),
      "Every path must gain the ids when the answer is all paths.",
    )
    const hereOnly = gearScopeWithIds(scope, "builds", ["new"], { target: "path", pathId: pathB })
    assert(hereOnly.buildIdsByPath[pathA]?.includes("older"), "The other path must keep what it had.")
    assert(!hereOnly.buildIdsByPath[pathA]?.includes("new"), "Only the chosen path may gain the ids.")
    assert(hereOnly.buildIdsByPath[pathB]?.includes("new"), "The chosen path must gain the ids.")
  })

  it("forgets a deleted build and item so a reused id cannot inherit their scope", () => {
    const scope = privateScope({ buildIdsByPath: { [pathA]: ["gone"] }, itemIdsByPath: { [pathA]: ["gone-item"] } })
    const pruned = gearScopeWithoutIds(scope, { buildIds: ["gone"], itemIds: ["gone-item"] })
    assert(!pruned.buildIdsByPath[pathA]?.includes("gone"), "A deleted build must leave the scope.")
    assert(!pruned.itemIdsByPath[pathA]?.includes("gone-item"), "A deleted item must leave the scope.")
  })

  it("shows a private inventory only what the path names", () => {
    const items = [item("here"), item("elsewhere")]
    const scope = privateScope({ itemIdsByPath: { [pathA]: ["here"] } })
    const visible = visibleGearItems({ buildState: buildState([], items), scope, pathId: pathA, builds: [] })
    assert(visible.map(entry => entry.id).join() === "here", "Only the named item may show.")
  })

  it("keeps an item a visible build equips, so a private inventory does not punch a hole in a build", () => {
    const items = [item("worn"), item("spare")]
    const build = { ...userBuild("wearing"), equipped: { leftWeapon: "worn" } }
    const scope = privateScope({ itemIdsByPath: { [pathA]: [] } })
    // The inventory names nothing, so only a build's own reference can bring the item back.
    const visible = visibleGearItems({ buildState: buildState([build], items), scope, pathId: pathA, builds: [build] })
    assert(visible.map(entry => entry.id).join() === "worn", "A build's equipped item must stay visible with it.")
    // And on a path that cannot see the build, the item goes with it rather than lingering.
    const elsewhere = visibleGearItems({ buildState: buildState([build], items), scope, pathId: pathB, builds: [] })
    assert(elsewhere.length === 0, "An item must not outlive the builds that bring it in.")
  })

  it("keeps the whole inventory when it is shared, whatever the builds map says", () => {
    const items = [item("a"), item("b")]
    const scope = { ...privateScope(), sharedInventory: true }
    const visible = visibleGearItems({ buildState: buildState([], items), scope, pathId: pathA, builds: [] })
    assert(visible.length === 2, "A shared inventory must not be filtered at all.")
  })
})
