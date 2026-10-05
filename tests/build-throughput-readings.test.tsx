// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CalculatorSettings } from "@/application/contracts"
import { breakthroughProfile } from "@/application/gameData/setup"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { useBuildThroughputs, type ThroughputTarget } from "@/features/build/useBuildThroughputs"
import { buildPresetInventory, defaultBuildPresets, type BuildEntry, type GearItem } from "@/gear"

import { dpsRequests, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { weaponPair } from "./helpers/weaponPair"

/**
 * A reading is only worth showing while it still describes what is on screen. The hook therefore
 * compares the key a reading was made under during render rather than clearing it in an effect, and
 * a reading that is superseded must never be shown against the build that replaced it. A stale
 * number here is indistinguishable from a correct one, which is what makes it worth pinning.
 */

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

/** Every reading still waiting to be released, so one can be held pending across renders. */
const pending: Array<() => void> = []

dpsResolves("throughput", async request => {
  const bundle = request.build()
  await new Promise<void>(resolve => {
    pending.push(resolve)
  })
  // The crit the sheet resolved to, so one build's reading is distinguishable from another's.
  return { dps: bundle.stats.crit, hps: 0, totalDamage: 0 } as ThroughputReading
})

/**
 * A build, and the gear it wears, chosen so that wearing a different helmet resolves to a different
 * sheet. Real inventory rather than a hand-built one, because the measurement path reads it through
 * the same resolver the game does and a fixture that skipped that would test nothing.
 */
function fixture() {
  const preset = defaultBuildPresets[0]
  const inventory = buildPresetInventory(preset)
  const worn = inventory.items.find(item => item.id === inventory.equipped.helmet)!
  const plain: GearItem = {
    ...worn,
    id: "probe-plain",
    baseAffix: { ...worn.baseAffix, value: worn.baseAffix.value / 2 },
  }
  const strong: GearItem = {
    ...worn,
    id: "probe-strong",
    baseAffix: { ...worn.baseAffix, value: worn.baseAffix.value * 2 },
  }
  const settings: CalculatorSettings = { weapons: weaponPair(preset.martialArts), breakthrough: "17", ping: 40 }
  return {
    gearItems: [...inventory.items, plain, strong],
    build: (id: string, helmet?: string): BuildEntry => ({
      id,
      name: id,
      martialArts: [...preset.martialArts],
      equipped: { ...inventory.equipped, ...(helmet ? { helmet } : {}) },
    }),
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
let reported: Record<string, ThroughputReading | undefined>
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  resetDpsMock()
  pending.length = 0
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

/**
 * Lets every pending reading resolve, which is what a worker eventually does. Rounds rather than one
 * pass, because a reading that arrives schedules the re-render that asks for the next one.
 */
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    const waiting = pending.splice(0, pending.length)
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      for (const resolve of waiting) resolve()
      await Promise.resolve()
    })
    if (pending.length === 0) break
  }
}

function Readout(props: {
  world: World
  targets: ThroughputTarget[]
  /** Presents the state where no rotation has been chosen yet, which is passed as absent. */
  noRotation?: boolean
  publish: (read: Record<string, ThroughputReading | undefined>) => void
}) {
  const readings = useBuildThroughputs({
    targets: props.targets,
    gearItems: props.world.gearItems,
    context: props.world.context as never,
    rotation: (props.noRotation ? undefined : props.world.rotation) as never,
  })
  props.publish(readings)
  return null
}

const publish = (read: Record<string, ThroughputReading | undefined>) => (reported = read)

async function show(world: World, targets: ThroughputTarget[], noRotation = false) {
  await act(async () => root.render(createElement(Readout, { world, targets, noRotation, publish })))
}

describe("a reading that has not arrived", () => {
  it("is shown as nothing rather than as a zero", async () => {
    const world = fixture()
    await show(world, [{ key: "one", build: world.build("one") }])

    // A zero here would be indistinguishable from a build that genuinely does no damage.
    expect(reported.one).toBeUndefined()
  })
})

describe("a reading that has arrived", () => {
  it("is held under the key its caller chose", async () => {
    const world = fixture()
    await show(world, [
      { key: "one", build: world.build("one") },
      { key: "two", build: world.build("two", "probe-strong") },
    ])
    await settle()

    // The two builds are different sheets, so the two keys must not answer for one another.
    expect(reported.one).toBeDefined()
    expect(reported.two).toBeDefined()
    expect(reported.one?.dps).not.toBe(reported.two?.dps)
  })

  it("is still there on a later render that changed nothing", async () => {
    const world = fixture()
    await show(world, [{ key: "one", build: world.build("one") }])
    await settle()
    const first = reported.one
    expect(first).toBeDefined()

    // Re-rendering must not throw away a reading that was paid for, nor ask the store for it again.
    await show(world, [{ key: "one", build: world.build("one") }])
    expect(reported.one).toBe(first)
    // A held result is answered without reaching a worker, so the count of asks stops rising. An
    // effect that re-asked every render would keep the number climbing and the worker busy.
    expect(dpsRequests("throughput")).toHaveLength(1)
  })

  it("does not answer for a build that has replaced the one it was measured from", async () => {
    const world = fixture()
    await show(world, [{ key: "one", build: world.build("one") }])
    await settle()
    const first = reported.one?.dps

    // Same key, different build. The key a reader is looking at is unchanged, so only comparing
    // against the build the reading was made from can stop the old number standing in for the new.
    await show(world, [{ key: "one", build: world.build("one", "probe-strong") }])
    await settle()

    expect(reported.one?.dps).not.toBe(first)
  })

  it("shows nothing for one render after the build changes, rather than the old number", async () => {
    const world = fixture()
    await show(world, [{ key: "one", build: world.build("one") }])
    await settle()
    expect(reported.one).toBeDefined()

    await show(world, [{ key: "one", build: world.build("one", "probe-strong") }])
    // Showing the previous build's figure against the new build would be a lie told for one frame,
    // and a frame is long enough to be read.
    expect(reported.one).toBeUndefined()
  })
})

describe("a build that cannot be measured", () => {
  it("has no reading, rather than a reading of nothing", async () => {
    const world = fixture()
    await show(world, [
      { key: "one", build: world.build("one") },
      { key: "absent", build: undefined },
    ])
    await settle()

    // The build list can be empty before anything is created, and a key with no build is how that
    // arrives here.
    expect(reported.absent).toBeUndefined()
    expect(reported.one).toBeDefined()
  })

  it("has no reading when there is no rotation to run", async () => {
    const world = fixture()
    await show(world, [{ key: "one", build: world.build("one") }], true)

    // Reached while a rotation is still being chosen, where measuring would be measuring nothing.
    expect(reported.one).toBeUndefined()
    // And nothing was asked for: a build with no rotation has no reading to wait on, so a request
    // here would be one the worker could only fail.
    expect(dpsRequests("throughput")).toHaveLength(0)
  })
})

describe("one build measured under two keys", () => {
  it("is asked for once, since both keys name the same sheet", async () => {
    // The build list weighs the build on screen against the active one, and when a reader is looking
    // at the build they have active those are the same build. Asking twice would run a rotation the
    // rotation editor has already run.
    const world = fixture()
    const active = world.build("one")
    await show(world, [
      { key: "viewed", build: active },
      { key: "active", build: active },
    ])
    await settle()

    expect(reported.viewed).toBeDefined()
    expect(reported.active).toBe(reported.viewed)
  })
})
