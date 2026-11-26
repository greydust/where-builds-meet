import { describe, expect, it } from "vitest"

import { breakthroughProfile } from "@/application/gameData/setup"
import {
  gearCombinationCandidates,
  optimizeGear,
  type GearSearchInput,
  type GearSearchProgress,
} from "@/calculations/gearOptimization"
import { buildRotationCalculationBundle, measurementSubject } from "@/calculations/rotationCalculationBundle"
import {
  calculateRotationBaseline,
  calculateRotationGearCandidate,
  rotationGearTimelineKey,
} from "@/calculations/rotationCalculator"
import { buildPresetInventory, defaultBuildPresets, normalizeBuildSetup } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

import { weaponPair } from "./helpers/weaponPair"

function fixture(): GearSearchInput {
  const preset =
    defaultBuildPresets.find(preset => preset.martialArts.includes("snowparting")) ?? defaultBuildPresets[0]
  const inventory = buildPresetInventory(preset)
  const settings = { weapons: weaponPair(preset.martialArts), breakthrough: "17", ping: 40 }
  return {
    build: {
      id: "optimized",
      name: "Example",
      martialArts: [...preset.martialArts],
      equipped: inventory.equipped,
      setup: {
        ...normalizeBuildSetup({}),
        innerWays: [],
        weaponSets: {},
        armorSets: {},
        arsenal: "None",
        bowRingSet: "None",
      },
    },
    items: inventory.items,
    context: {
      environment: {
        pathId: "stonesplitStrength",
        settings,
        enemy: breakthroughProfile(settings),
        setupSelections: { food: "None", script: "None", divinecraft: "None" },
        globalDebuffs: defaultGlobalDebuffs,
        skillOverrides: {},
        previewId: null,
      },
      statOverrides: {},
      attunementOverrides: {},
    },
    rotation: {
      name: "Search",
      steps: [
        { type: "skill", skill: "SnowpartingQ" },
        { type: "event", event: "Delay", duration: 3 },
      ],
    },
  }
}

function bundle(input: GearSearchInput) {
  return buildRotationCalculationBundle(
    measurementSubject({
      build: input.build,
      gearItems: input.items,
      context: input.context,
      rotation: input.rotation,
    }),
  )
}

describe("gear combination optimization", () => {
  it("deduplicates identical items and retains distinct rolls", () => {
    const input = fixture()
    const helmet = input.items.find(item => item.id === input.build.equipped?.helmet)!
    input.items.push({ ...helmet, id: "identical" })
    expect(gearCombinationCandidates(input)).toHaveLength(1)
    input.items.push({
      ...helmet,
      id: "different",
      baseAffix: { ...helmet.baseAffix, value: helmet.baseAffix.value + 1 },
    })
    expect(gearCombinationCandidates(input)).toHaveLength(2)
  })

  it("uses two equivalent physical weapons without equipping one copy twice", () => {
    const input = fixture()
    const weapon = input.items.find(item => item.id === input.build.equipped?.leftWeapon)!
    input.context.environment.settings.weapons = [
      input.context.environment.settings.weapons[0],
      input.context.environment.settings.weapons[0],
    ]
    input.items = [weapon, { ...weapon, id: "second-copy" }]
    const combinations = gearCombinationCandidates(input)
    expect(combinations).toHaveLength(1)
    expect(combinations[0].leftWeapon).not.toBe(combinations[0].rightWeapon)
    input.items.pop()
    expect(() => gearCombinationCandidates(input)).toThrow("noCombinations")
  })

  it("matches a fresh calculation for simultaneous gear attack, rate, and attunement changes", () => {
    const input = fixture()
    const original = bundle(input)
    const baseline = calculateRotationBaseline(original)
    expect(baseline.metrics.dps).toBeGreaterThan(0)
    const helmet = input.items.find(item => item.id === input.build.equipped?.helmet)!
    input.items = input.items.map(item =>
      item.id === helmet.id
        ? {
            ...item,
            baseAffix: { key: "minPhys", value: 300 },
            additionalAffixes: [
              { key: "maxPhys", value: 500 },
              { key: "crit", value: 0.25 },
              { key: "affinity", value: 0.15 },
            ],
            attunement: { key: "armor", value: 0.1 },
          }
        : item,
    )
    const candidate = bundle(input)
    expect(rotationGearTimelineKey(candidate, baseline)).toBe(rotationGearTimelineKey(original, baseline))
    expect(rotationGearTimelineKey(candidate, baseline)).toBeDefined()
    const fast = calculateRotationGearCandidate(candidate, baseline)
    const fresh = calculateRotationBaseline(candidate)
    expect(fast.duration).toBe(fresh.duration)
    expect(fast.damage).toBeCloseTo(fresh.metrics.totalDamage, 8)
  })

  it("rebuilds when gear changes HP or a damage-outcome listener is active", () => {
    const input = fixture()
    const original = bundle(input)
    const baseline = calculateRotationBaseline(original)
    const changed = structuredClone(original)
    changed.timeline.maxHP = (changed.timeline.maxHP ?? 0) + 1
    expect(rotationGearTimelineKey(changed, baseline)).not.toBe(rotationGearTimelineKey(original, baseline))
    changed.timeline.innerWayRules.push({ trigger: { event: "damageOutcome" } } as never)
    expect(rotationGearTimelineKey(changed, baseline)).toBeUndefined()
  })

  it("finds the exhaustive best and preserves setup and original inputs", () => {
    const input = fixture()
    const helmet = input.items.find(item => item.id === input.build.equipped?.helmet)!
    input.items.push({ ...helmet, id: "better", baseAffix: { key: "minPhys", value: 1000 } })
    const before = structuredClone(input)
    const expected = gearCombinationCandidates(input).map(equipped => {
      const metrics = calculateRotationBaseline(bundle({ ...input, build: { ...input.build, equipped } })).metrics
      return metrics.dps
    })
    const updates: GearSearchProgress[] = []
    optimizeGear(input, progress => updates.push(progress))
    const final = updates.at(-1)!
    expect(final.phase).toBe("completed")
    expect(final.completed).toBe(final.total)
    expect(final.fast + final.rebuild).toBe(final.total)
    expect(final.reading!.dps).toBeCloseTo(Math.max(...expected), 8)
    expect(input).toEqual(before)
  })

  it("rejects a search that exceeds the execution budget", () => {
    let elapsed = 0
    expect(() =>
      optimizeGear(
        fixture(),
        () => {},
        () => (elapsed += 30_000),
      ),
    ).toThrow("tooLong")
  })

  it.each([0, 100])(
    "completes with a time limit of %s minutes when the default budget would expire",
    timeLimitMinutes => {
      let elapsed = 0
      const updates: GearSearchProgress[] = []
      optimizeGear(
        { ...fixture(), timeLimitMinutes },
        progress => updates.push(progress),
        () => (elapsed += 30_000),
      )
      expect(updates.at(-1)?.phase).toBe("completed")
    },
  )

  it("rejects an oversized inventory before evaluating damage", () => {
    const input = fixture()
    input.items = input.items.flatMap(item =>
      Array.from({ length: 5 }, (_, index) => ({
        ...item,
        id: `${item.id}-${index}`,
        baseAffix: { ...item.baseAffix, value: item.baseAffix.value + index },
      })),
    )
    const updates: GearSearchProgress[] = []
    expect(() => optimizeGear(input, progress => updates.push(progress))).toThrow("tooMany")
    expect(updates).toEqual([])
  })

  it.each(["InsightfulStrike", "YueYongFangYuan"])("classifies %s builds as rebuilds", innerWay => {
    const input = fixture()
    const preset = defaultBuildPresets.find(preset => preset.id === "splendor-fully-relayed")!
    const inventory = buildPresetInventory(preset)
    input.context.environment.pathId = "bellstrikeSplendor"
    input.context.environment.settings.weapons = weaponPair(preset.martialArts)
    input.build = {
      ...input.build,
      equipped: inventory.equipped,
      setup: { ...normalizeBuildSetup(preset.setup), innerWays: [{ innerWay, tier: "T6" }] },
    }
    input.items = inventory.items
    const updates: GearSearchProgress[] = []
    optimizeGear(input, progress => updates.push(progress))
    const final = updates.at(-1)!
    expect(final.fast).toBe(0)
    expect(final.rebuild).toBe(final.total)
  })
})
