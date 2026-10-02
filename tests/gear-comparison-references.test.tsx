// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CalculatorSettings } from "@/application/contracts"
import { breakthroughProfile } from "@/application/gameData/setup"
import { buildMeasurement } from "@/calculations/rotationCalculationBundle"
import { useGearComparison } from "@/features/build/useGearComparison"
import { buildPresetInventory, defaultBuildPresets, type BuildEntry, type GearItem, type GearSlot } from "@/gear"

import { dpsDispatches, dpsRequests, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { weaponPair } from "./helpers/weaponPair"

/**
 * A candidate is weighed against the item its slot already has, and the reference has to be the
 * build as it actually stands. These pin what a swap is allowed to change, because a swap that
 * reaches further than its one slot produces a number that no click in the interface can produce,
 * which is worse than no number: the reader has no way to tell it is fiction.
 */

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

/** The sheet's crit, which every gear affix in these fixtures moves, so a swap is visible in it. */
dpsResolves("throughput", async request => {
  const bundle = request.build()
  return { dps: bundle.stats.crit, hps: 0, totalDamage: 0 } as never
})

const slot: GearSlot = "helmet"
const preset = defaultBuildPresets[0]

/** The crit the sheet resolved to, which is what a swap of a crit affix has to move. */
function critOf(current: ReturnType<typeof world>, build: BuildEntry) {
  return buildMeasurement({
    build,
    gearItems: current.gearItems,
    context: current.context as never,
    rotation: current.rotation as never,
  }).bundle.stats.crit
}

function world() {
  const inventory = buildPresetInventory(preset)
  const worn = inventory.items.find(item => item.id === inventory.equipped[slot])!
  const spare: GearItem = {
    ...worn,
    id: "spare-helmet",
    baseAffix: { ...worn.baseAffix, value: worn.baseAffix.value * 1.5 },
  }
  const settings = {
    weapons: weaponPair(preset.martialArts),
    breakthrough: "17",
    ping: 40,
  } satisfies CalculatorSettings
  const probeBuild: BuildEntry = {
    id: "probe",
    name: "Probe",
    martialArts: [...preset.martialArts],
    equipped: { ...inventory.equipped },
  }
  return {
    worn,
    spare,
    gearItems: [...inventory.items, spare],
    build: probeBuild,
    context: {
      environment: {
        pathId: "stonesplitStrength" as const,
        settings,
        setupSelections: { food: "SimmeringFishSlices", script: "Fire", divinecraft: "Fire" },
        skillOverrides: {},
        globalDebuffs: [],
        enemy: breakthroughProfile(settings),
      },
      statOverrides: {},
      attunementOverrides: {},
    },
    rotation: {
      name: "Probe",
      eventTimeReference: "battleStart",
      start: { step: 0, action: 0 },
      steps: [{ type: "skill" as const, skill: "SnowpartingQ" }],
    },
  }
}

type Report = ReturnType<typeof useGearComparison>

let container: HTMLDivElement
let root: Root
let reported: Report
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  resetDpsMock()
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function Comparison(props: {
  world: ReturnType<typeof world>
  visible: string[]
  /** Overridable so a test can shop a slot other than the one the fixture wears. */
  shopSlot?: GearSlot
  publish: (report: Report) => void
}) {
  const report = useGearComparison({
    build: props.world.build,
    slot: props.shopSlot ?? slot,
    candidates: [props.world.worn, props.world.spare],
    equippedId: props.world.worn.id,
    visibleItemIds: new Set(props.visible),
    gearItems: props.world.gearItems,
    context: props.world.context as never,
    rotation: props.world.rotation as never,
  })
  props.publish(report)
  return null
}

const publish = (report: Report) => (reported = report)

async function show(current: ReturnType<typeof world>, visible: string[]) {
  await act(async () => root.render(createElement(Comparison, { world: current, visible, publish })))
}

describe("what a candidate is measured against", () => {
  it("is the build as it stands, so the equipped item is never a candidate of itself", async () => {
    const current = world()
    await show(current, [current.worn.id, current.spare.id])

    // The equipped item's own reading is the reference, not a swap of itself against itself.
    expect(reported.readingFor(current.worn.id)).toBe(reported.reference)
    expect(reported.readingFor(current.spare.id)).not.toBe(reported.reference)
  })

  it("differs from the reference only by the item in the slot being shopped", async () => {
    const current = world()
    await show(current, [current.worn.id, current.spare.id])

    const reference = critOf(current, current.build)
    const swapped = critOf(current, {
      ...current.build,
      equipped: { ...current.build.equipped, [slot]: current.spare.id },
    })

    // The reference is the build untouched, so the delta a card shows is attributable to the swap
    // and not to some other difference between the two measurements.
    expect(reported.reference?.dps).toBe(reference)
    // And the candidate really did move: a spare with a different affix is a different sheet.
    expect(swapped).not.toBe(reference)
  })

  it("takes the item out of the slot it was already in, rather than equipping it twice", async () => {
    // The weapon slots are the case that bites: one blade fits either hand, so a reader swapping it
    // across is asking for it to move rather than to be copied. The swap therefore has to empty the
    // hand it came from, or the sheet is counting one item twice and reporting a number no click in
    // the interface can reach.
    const current = world()
    const equipped = current.build.equipped ?? {}
    const fromSlot: GearSlot = "leftWeapon"
    const toSlot: GearSlot = "rightWeapon"
    expect(equipped[fromSlot], "the fixture must wear something in the hand it moves from").toBeDefined()
    expect(equipped[toSlot], "the fixture must wear something in the hand it moves to").toBeDefined()

    const blade = current.gearItems.find(item => item.id === equipped[fromSlot])!
    const occupying = current.gearItems.find(item => item.id === equipped[toSlot])!

    // Shopping the second hand, with the first hand's blade as the candidate.
    await act(async () =>
      root.render(
        createElement(Comparison, {
          world: { ...current, worn: occupying, spare: blade },
          visible: [blade.id],
          shopSlot: toSlot,
          publish,
        }),
      ),
    )

    // The build as it stands, which is what the reference is.
    const reference = critOf(current, current.build)
    // The blade in the second hand and the first hand empty.
    const moved = critOf(current, {
      ...current.build,
      equipped: { ...equipped, [fromSlot]: undefined, [toSlot]: blade.id },
    })

    expect(reported.reference?.dps).toBe(reference)
    expect(reported.readingFor(blade.id)?.dps).toBe(moved)
  })

  it("is measured even when the slot holds nothing, against a build with that slot empty", async () => {
    // Equipping into an empty slot is the first thing a new build does, so the comparison has to
    // work there and not only where something is already equipped.
    const current = world()
    const bare = { ...current, build: { ...current.build, equipped: {} } }
    await show(bare, [current.spare.id])

    expect(reported.reference?.dps).toBe(critOf(current, bare.build))
    expect(reported.readingFor(current.spare.id)).toBeDefined()
  })
})

describe("a build whose gear is the game's", () => {
  it("does not change under a swap, because a preset's gear is not the reader's to change", async () => {
    // `resolveBuildInventory` reads a preset rather than its `equipped` map, so a swap resolves to
    // the same sheet. The inventory is closed on these builds, so no card is ever asked about one;
    // this is here so that closing them is a deliberate rule rather than an accident of layout.
    const presetEntry: BuildEntry = {
      id: preset.id,
      name: preset.name,
      isDefault: true,
      presetId: preset.id,
      martialArts: [...preset.martialArts],
    }
    const current = { ...world(), build: presetEntry }
    await show(current, [current.spare.id])

    // A swap on a preset reaches nothing, so the two sheets are the same one. Were the inventory
    // ever opened on such a build, every card would read `0`, which is a claim rather than a blank.
    expect(critOf(current, { ...presetEntry, equipped: { [slot]: current.spare.id } })).toBe(
      critOf(current, presetEntry),
    )
  })
})

describe("what it costs to shop a slot", () => {
  it("asks about the cards on screen, not the whole inventory", async () => {
    const current = world()
    // The equipped item plus one candidate, not the two candidates the slot holds.
    await show(current, [current.worn.id, current.spare.id])

    const measured = dpsDispatches("throughput").map(request => request.build())
    expect(measured).toHaveLength(2)
  })

  it("never asks about the equipped item as a candidate of itself", async () => {
    // The reference is that build, so asking again measures the same sheet under a second name and
    // spends a whole rotation to learn nothing. Counting requests rather than dispatches, because a
    // duplicate sheet is answered from the cache and so would not show up as a second dispatch.
    const current = world()
    await show(current, [current.worn.id, current.spare.id])

    // Two asks: the reference, and the one candidate.
    expect(dpsRequests("throughput")).toHaveLength(2)
  })

  it("measures the reference even with nothing on screen, since it is what others are read against", async () => {
    const current = world()
    await show(current, [])

    // Without a reference every candidate would be blank, so the one measurement that is always
    // worth making is the build as it stands.
    expect(dpsDispatches("throughput")).toHaveLength(1)
    expect(reported.reference).toBeDefined()
    expect(reported.readingFor(current.spare.id)).toBeUndefined()
  })
})
