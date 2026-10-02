// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CalculatorSettings } from "@/application/contracts"
import { breakthroughProfile } from "@/application/gameData/setup"
import { useGearComparison } from "@/features/build/useGearComparison"
import { buildPresetInventory, defaultBuildPresets, type BuildEntry, type GearItem, type GearSlot } from "@/gear"

import { dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { weaponPair } from "./helpers/weaponPair"

/**
 * Which candidates a slot asks about changes on every scroll; what any one of them measures to does
 * not. These count the bundles that are actually built, because a card arriving that rebuilds the
 * candidates already on screen is invisible in the readings — the numbers stay right — and costs a
 * full sheet resolution each, once per frame of the scroll.
 */

const measurements = { count: 0 }

vi.mock("@/calculations/rotationCalculationBundle", async importOriginal => {
  const actual = await importOriginal<typeof import("@/calculations/rotationCalculationBundle")>()
  return {
    ...actual,
    buildMeasurement: (input: Parameters<typeof actual.buildMeasurement>[0]) => {
      measurements.count += 1
      return actual.buildMeasurement(input)
    },
  }
})

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

dpsResolves("throughput", async request => {
  const bundle = request.build()
  return { dps: bundle.stats.crit, hps: 0, totalDamage: 0 } as never
})

const slot: GearSlot = "helmet"

/**
 * A build wearing a preset's gear, plus spares of the same shape.
 *
 * Built per test rather than shared: a bundle is held for as long as the context object it was
 * resolved from is alive, so a fixture shared between tests would let one test's bundles answer
 * another's and every count would be zero.
 */
function fixture(spares = 3) {
  const preset = defaultBuildPresets[0]
  const inventory = buildPresetInventory(preset)
  const worn = inventory.items.find(item => item.id === inventory.equipped[slot])!
  const spare = (index: number): GearItem => ({
    ...worn,
    id: `spare-${index}`,
    baseAffix: { ...worn.baseAffix, value: worn.baseAffix.value * (1 + (index + 1) / 10) },
  })
  const settings = {
    weapons: weaponPair(preset.martialArts),
    breakthrough: "17",
    ping: 40,
  } satisfies CalculatorSettings
  return {
    worn,
    gearItems: [...inventory.items, ...Array.from({ length: spares }, (_, index) => spare(index))],
    build: {
      id: "probe",
      name: "Probe",
      martialArts: [...preset.martialArts],
      equipped: { ...inventory.equipped },
    } satisfies BuildEntry,
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

type World = ReturnType<typeof fixture>

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  measurements.count = 0
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

/** The candidates a slot of spares holds, so a test can say which are on screen. */
const spareIds = (world: World) => world.gearItems.filter(item => item.id.startsWith("spare-")).map(item => item.id)

function Comparison(props: { world: World; visible: string[] }) {
  useGearComparison({
    build: props.world.build,
    slot,
    candidates: props.world.gearItems.filter(item => item.slot === slot),
    equippedId: props.world.worn.id,
    visibleItemIds: new Set(props.visible),
    gearItems: props.world.gearItems,
    context: props.world.context as never,
    rotation: props.world.rotation as never,
  })
  return null
}

/** Renders the slot, optionally with one of the world's inputs replaced to move the sheet. */
async function show(world: World, visible: string[], moved: Partial<World> = {}) {
  await act(async () => root.render(createElement(Comparison, { world: { ...world, ...moved }, visible })))
}

describe("a card scrolling into a slot", () => {
  it("builds one sheet, not one for every card already on screen", async () => {
    const world = fixture()
    const [first, second, third] = spareIds(world)

    await show(world, [world.worn.id, first])
    // The reference and the one candidate, and nothing else.
    expect(measurements.count).toBe(2)

    await show(world, [world.worn.id, first, second])
    // Only the newcomer. Rebuilding the first again is the cost this is about.
    expect(measurements.count).toBe(3)

    await show(world, [world.worn.id, first, second, third])
    expect(measurements.count).toBe(4)
  })

  it("builds nothing for a re-render that changed nothing", async () => {
    const world = fixture()
    const visible = [world.worn.id, ...spareIds(world)]

    await show(world, visible)
    const first = measurements.count
    expect(first).toBe(4)

    await show(world, visible)
    // A render for any other reason must not re-resolve a sheet behind a reading already held.
    expect(measurements.count).toBe(first)
  })

  it("builds nothing for a candidate that leaves the screen and comes back", async () => {
    const world = fixture()
    const [first, second] = spareIds(world)

    await show(world, [world.worn.id, first, second])
    const onScreen = measurements.count

    await show(world, [world.worn.id, first])
    // Scrolling away stops it being asked for, which is the point of the bound.
    expect(measurements.count).toBe(onScreen)

    await show(world, [world.worn.id, first, second])
    // Returning re-asks, and the answer is still one the reader has not paid for twice.
    expect(measurements.count).toBe(onScreen)
  })
})

describe("a sheet that has moved", () => {
  it("builds every candidate again, because the reference moved under them all", async () => {
    const world = fixture()
    const visible = [world.worn.id, ...spareIds(world)]

    await show(world, visible)
    const first = measurements.count
    expect(first).toBe(4)

    await show(world, visible, { build: { ...world.build, name: "Edited" } })
    // A different build is a different sheet, so a reused bundle would be a stale number.
    expect(measurements.count).toBe(first * 2)
  })

  it("builds every candidate again when the rotation changes", async () => {
    const world = fixture()
    const visible = [world.worn.id, ...spareIds(world)]

    await show(world, visible)
    const first = measurements.count

    await show(world, visible, { rotation: { ...world.rotation, name: "Another" } })
    // The same builds against a different rotation is a different sheet for every one of them.
    expect(measurements.count).toBe(first * 2)
  })

  it("builds every candidate again when the gear list is replaced", async () => {
    const world = fixture()
    const visible = [world.worn.id, ...spareIds(world)]

    await show(world, visible)
    const first = measurements.count

    // An edited item is a new object in a new list, which is how the app hands one over.
    await show(world, visible, { gearItems: [...world.gearItems] })
    expect(measurements.count).toBe(first * 2)
  })
})
