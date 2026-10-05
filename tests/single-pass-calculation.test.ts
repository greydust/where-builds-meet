import nodeAssert from "node:assert/strict"

import { assert, afterEach, describe, expect, it, vi } from "vitest"

import type { CalculatorSettings } from "@/application/contracts"
import type { AttunementStats } from "@/calculations/damage"
import type { CharacterStats } from "@/types"

import { attunementAvailableForSettings } from "../src/application/characterComposition"
import { buildPresetRotationBundle } from "../src/application/graduation"
import { resolveActionStatContext } from "../src/calculations/actionStats"
import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  calculateSimulatedRotationRun,
} from "../src/calculations/rotationCalculator"
import * as scheduler from "../src/calculations/rotationTimeline"
import { attunementData, defaultBuildPresets, maxGearRoll } from "../src/gear"
import { loadDpsSnapshotFixtures, dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"
import { weaponPair } from "./helpers/weaponPair"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function windBundle(way: "MoraleChant" | "FivefoldBleed" = "MoraleChant") {
  const fixture = (await loadDpsSnapshotFixtures()).find(
    entry => entry.id === "bamboocutWind/wind-dummy-1-min-infinite-vitality",
  )!
  const preset = defaultBuildPresets.find(build => build.id === fixture.fixture.build)!
  const selection = preset.setup?.innerWays.find(selection => selection.innerWay === "MoraleChant")
  if (!selection) throw new Error(`Expected ${preset.id} to select Morale Chant.`)
  const original = selection.innerWay
  try {
    selection.innerWay = way
    return buildPresetRotationBundle(
      {
        ...dpsSnapshotEnvironment,
        pathId: fixture.pathId,
        martialArts: fixture.rotation.martialArts,
        rotation: fixture.rotation,
        skillOverrides: {},
        previewId: null,
      },
      fixture.fixture.build,
    )!
  } finally {
    selection.innerWay = original
  }
}

function observeTraversals() {
  const original = scheduler.buildRotationTimeline
  const actions: Set<string>[] = []
  let factories = 0
  const build = vi.spyOn(scheduler, "buildRotationTimeline").mockImplementation((input, random, createResolver) => {
    const visited = new Set<string>()
    actions.push(visited)
    return original(
      input,
      random,
      createResolver
        ? (passInput, rows, effects) => {
            factories++
            const resolver = createResolver(passInput, rows, effects)
            return Object.assign(
              (row: scheduler.TimelineRow, index: number) => {
                const key = `${row.id}:${index}`
                assert(!visited.has(key), `Repeated action ${key}`)
                visited.add(key)
                return resolver(row, index)
              },
              { onCastEnd: resolver.onCastEnd },
            )
          }
        : undefined,
    )
  })
  return {
    build,
    actions,
    get factories() {
      return factories
    },
  }
}

describe("single-pass calculation", () => {
  it.each(["MoraleChant", "FivefoldBleed"] as const)(
    "reuses Rodent events for all attunements with %s and matches live calculations",
    async way => {
      const bundle = await windBundle(way)
      // Isolate coordinated attacks from the full preset's recording and healing mechanics.
      bundle.timeline.rotation = {
        name: "Coordinated Rodent comparison",
        ping: 40,
        steps: [
          { type: "skill", skill: "RodentRampage" },
          ...Array.from({ length: 10 }, () => ({ type: "skill" as const, skill: "InfernalLight3" })),
          { type: "event", event: "Delay", duration: 3 },
        ],
      }
      bundle.startAnchor = { rowId: "rotation-0" }
      const settings: CalculatorSettings = { weapons: weaponPair(bundle.weapons), breakthrough: "17", ping: 40 }
      const baseStats = bundle.baseStats
      nodeAssert(baseStats, "The preset bundle must carry its base stats.")
      bundle.statPriority = (["minPhys", "crit", "affinity"] as Array<keyof CharacterStats>).map(key => ({
        label: key,
        stats: { ...baseStats, [key]: baseStats[key] + (key === "minPhys" ? 10 : 0.01) },
      }))
      const available = Object.keys(attunementData).filter(key =>
        attunementAvailableForSettings(key, "bamboocutWind", settings),
      ) as Array<keyof AttunementStats>
      bundle.attunementPriority = available.map(key => ({
        label: key,
        attunement: {
          ...bundle.attunement,
          [key]: bundle.attunement[key] + maxGearRoll(key, "attunement", false, bundle.enemy.level)!,
        },
      }))
      const baseline = calculateRotationBaseline(bundle)
      expect(baseline.metrics.breakdown.skills.find(skill => skill.id === "Rodent")?.damage).toBeGreaterThan(0)
      const observed = observeTraversals()
      const reused = calculateRotationComparisons(bundle, baseline)
      expect(observed.build).not.toHaveBeenCalled()
      const live = calculateRotationComparisons(
        {
          ...bundle,
          statPriority: bundle.statPriority.map(variant => ({ ...variant, timeline: bundle.timeline })),
          attunementPriority: bundle.attunementPriority.map(variant => ({ ...variant, timeline: bundle.timeline })),
        },
        baseline,
      )
      expect(observed.build).toHaveBeenCalledTimes(bundle.statPriority.length + bundle.attunementPriority.length)
      expect(reused).toEqual(live)
      const events = (result: ReturnType<typeof calculateRotationBaseline>) =>
        result.timeline.map(row => ({ skill: row.step.skill, startTime: row.startTime, actions: row.actions }))
      for (const variant of bundle.attunementPriority) {
        const recalculated = calculateRotationBaseline({ ...bundle, attunement: variant.attunement! })
        expect(recalculated.duration).toBe(baseline.duration)
        expect(events(recalculated)).toEqual(events(baseline))
      }
    },
  )
  it("resolves a Wind baseline, feedback variant, and sampled run once each", async () => {
    const bundle = await windBundle()
    const observed = observeTraversals()
    const baseline = calculateRotationBaseline(bundle)
    expect(observed.build).toHaveBeenCalledTimes(1)
    expect(observed.factories).toBe(1)
    expect(baseline.metrics.dps).toBeGreaterThan(0)
    const effectLists = baseline.baseline.map(entry => entry.context.effects)
    expect(new Set(effectLists).size).toBeLessThan(effectLists.length)
    const context = { ...baseline.baseline[0].context, effects: [], unconditionalDamageEffects: { "stat.minPhys": 10 } }
    const prepared = resolveActionStatContext(context)
    const changed = resolveActionStatContext({ ...context, unconditionalDamageEffects: { "stat.minPhys": 20 } })
    expect(changed.stats.minPhys).toBeCloseTo(prepared.stats.minPhys + 10)
    expect(resolveActionStatContext({ ...context, unconditionalDamageEffects: { "stat.minPhys": 10 } }).stats).toBe(
      prepared.stats,
    )
    expect(baseline.timeline[0].battleStartTime).toBe(baseline.anchorTime)
    expect(observed.actions[0].size).toBeGreaterThan(baseline.baseline.length)
    calculateRotationComparisons(
      {
        ...bundle,
        statPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
        attunementPriority: [
          {
            label: "Penetration",
            attunement: { ...bundle.attunement, physicalPenetration: bundle.attunement.physicalPenetration + 1 },
          },
        ],
      },
      baseline,
    )
    expect(observed.build).toHaveBeenCalledTimes(2)
    expect(calculateSimulatedRotationRun(bundle, () => 0.5).resolvedSequence.length).toBeGreaterThan(0)
    expect(observed.build).toHaveBeenCalledTimes(3)
    expect(observed.factories).toBe(3)
  })

  it("reuses the complete preview calculation for its matching baseline request", async () => {
    const bundle = await windBundle()
    const observed = observeTraversals()
    const worker = {
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
      postMessage: vi.fn<(message: { error?: string; metrics: { dps: number } }) => void>(),
    }
    vi.stubGlobal("self", worker)
    await import("../src/calculations/rotationWorker")
    worker.onmessage!({ data: { id: 1, mode: "editorTimeline", bundle } })
    worker.onmessage!({ data: { id: 2, mode: "baseline", cacheKey: "single-pass-preview", bundle } })
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(worker.postMessage.mock.calls[1][0].error).toBeUndefined()
    expect(worker.postMessage.mock.calls[1][0].metrics.dps).toBeGreaterThan(0)
    expect(observed.build).toHaveBeenCalledTimes(1)
    expect(observed.factories).toBe(1)
  })
})
