import { describe, expect, it } from "vitest"

import { breakthroughProfile } from "@/application/gameData/setup"
import {
  applySuggestion,
  calculateBuildSuggestions,
  closestSuggestionPreset,
  fullItemCandidates,
  planBuildSuggestions,
  retuneSuggestionCandidates,
} from "@/calculations/buildSuggestions"
import type { GearSearchInput } from "@/calculations/gearOptimization"
import { createPresetCompletion } from "@/calculations/presetCompletion"
import { buildMeasurement } from "@/calculations/rotationCalculationBundle"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import {
  buildPresetInventory,
  defaultBuildPresets,
  maxGearRoll,
  summarizeGearAffixes,
  type GearItem,
  type BuildPreset,
} from "@/gear"
import { legalAdditionalAffixes } from "@/gearRetuning"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

const item = (id: string): GearItem => ({
  id,
  definitionId: "hengBlade",
  level: 100,
  rarity: "Gold",
  baseAffix: { key: "maxPhys", value: 1 },
  additionalAffixes: [{ key: "power", value: 1 }],
})
const count = (items: GearItem[], key: string) =>
  summarizeGearAffixes(items).affixes.find(row => row.key === key)?.count ?? 0
const rolled = (key: string) => ({ key, value: maxGearRoll(key, "affix", true, 100)! })
const weapon = (id: string): GearItem => ({
  ...item(id),
  relayed: true,
  baseAffix: rolled("maxStonesplit"),
  additionalAffixes: [rolled("minStonesplit"), rolled("power"), rolled("agility"), rolled("maxStonesplit")],
  attunement: { key: "physicalPenetration", value: 10 },
})
const fullTarget = new Map([
  ["minPhys", 2],
  ["agility", 1],
  ["crit", 1],
  ["maxStonesplit", 1],
])
const score = (gear: GearItem[]) =>
  100 +
  count(gear, "minPhys") * 3 +
  count(gear, "crit") * 2 +
  count(gear, "agility") +
  count(gear, "maxStonesplit") * 0.5 +
  count(gear, "minStonesplit") * 0.2 +
  count(gear, "minBellstrike") * 0.1

describe("complete replacement item suggestions", () => {
  it.each([true, false])(
    "uses a feasible full weapon instead of a local Critical-only upgrade (relayed: %s)",
    relayed => {
      const original: GearItem[] = [
        {
          ...weapon("weapon"),
          relayed,
          turnedAffixIndex: relayed ? undefined : 1,
          additionalAffixes: [rolled("minStonesplit"), rolled("minPhys"), rolled("agility"), rolled("maxStonesplit")],
        },
        {
          ...weapon("armor"),
          definitionId: "bracer",
          baseAffix: rolled("precision"),
          additionalAffixes: [rolled("minPhys"), rolled("agility"), rolled("minBellstrike"), rolled("maxStonesplit")],
        },
      ]
      const targets = new Map([
        ["minPhys", 3],
        ["agility", 2],
        ["maxStonesplit", 2],
        ["crit", 2],
        ["precision", 1],
      ])
      const result = planBuildSuggestions({
        items: original,
        targetCounts: targets,
        pathId: "stonesplitStrength",
        // Keeping the old base and adding Critical wins locally, but armor cannot
        // supply the missing third Min Physical Attack without a weapon base change.
        measure: gear =>
          100 +
          count(
            gear.filter(item => item.id === "weapon"),
            "crit",
          ) *
            20 +
          count(
            gear.filter(item => item.id === "armor"),
            "crit",
          ) +
          count(gear, "minPhys") * 0.5 +
          count(gear, "precision") +
          count(gear, "maxStonesplit") * 5,
      })
      const recipe = result.items.find(item => item.itemId === "weapon")!.options[0].replacement!
      // A locked Min Physical Attack cannot be sacrificed for a cheaper Critical retune.
      expect(result.items.find(item => item.itemId === "weapon")!.retuneAlternative).toBeUndefined()
      expect(recipe.baseAffix.key).toBe("minPhys")
      expect(count([recipe], "minPhys")).toBe(2)
      expect(
        Object.fromEntries(summarizeGearAffixes(result.completion!).affixes.map(row => [row.key, row.count])),
      ).toEqual(Object.fromEntries(targets))
      for (const item of result.items) {
        expect(result.completion!.find(recipe => recipe.id === item.itemId)).toEqual(item.options[0].replacement)
      }
      expect(result.items).toHaveLength(2)
    },
  )

  it("checks completion against exhaustive two-item allocations and keeps earlier fixed recipes", () => {
    const targets = new Map([
      ["minPhys", 3],
      ["agility", 2],
      ["maxStonesplit", 2],
      ["crit", 2],
      ["precision", 1],
    ])
    const domains = [weapon("a"), weapon("b")].map(item => Array.from(fullItemCandidates(item, targets, [])))
    const complete = createPresetCompletion(domains, targets)
    const matches = (items: GearItem[]) => {
      const summary = summarizeGearAffixes(items).affixes
      return summary.length === targets.size && summary.every(row => targets.get(row.key) === row.count)
    }
    for (const first of domains[0]) {
      const expected = domains[1].filter(second => matches([first, second]))
      const result = complete([first])
      expect(Boolean(result)).toBe(expected.length > 0)
      expect(result?.[0]).toBe(expected.length ? first : undefined)
      expect(result ? matches(result) : undefined).toBe(expected.length ? true : undefined)
      for (const second of domains[1]) {
        expect(Boolean(complete([first, second]))).toBe(matches([first, second]))
      }
    }
    // A failed fixed allocation must not poison the cached unconstrained solution.
    expect(matches(complete()!)).toBe(true)
  })

  it("can complete catalog presets with legal additional affixes at tier 100 using interchangeable recipes", () => {
    for (const preset of defaultBuildPresets.filter(preset => preset.gearByTier["100"])) {
      const original = buildPresetInventory(preset, 100).items
      if (!original.every(item => legalAdditionalAffixes(item.additionalAffixes.map(affix => affix.key)))) continue
      const target = new Map(summarizeGearAffixes(original).affixes.map(row => [row.key, row.count]))
      const domains = original.map(item => [...fullItemCandidates(item, target, [])])
      const completed = createPresetCompletion(domains, target)()
      expect(completed).toBeDefined()
      expect(summarizeGearAffixes(completed!).affixes).toEqual(summarizeGearAffixes(original).affixes)
      expect(completed!.every(item => legalAdditionalAffixes(item.additionalAffixes.map(affix => affix.key)))).toBe(
        true,
      )
    }
  })

  it.each([0.299, 0.3])("does not spend satisfied Precision on an unseen prerequisite with gain %s", gain => {
    const original: GearItem[] = [
      {
        ...weapon("move-precision"),
        baseAffix: rolled("minPhys"),
        additionalAffixes: [rolled("minPhys"), rolled("agility"), rolled("maxStonesplit"), rolled("power")],
      },
      ...["bracer", "greaves"].map(definitionId =>
        Object.assign(weapon(definitionId), {
          definitionId,
          baseAffix: rolled("precision"),
          additionalAffixes: [rolled("minPhys"), rolled("agility"), rolled("minBellstrike"), rolled("vsBossDmg")],
        }),
      ),
    ]
    const result = planBuildSuggestions({
      items: original,
      pathId: "stonesplitStrength",
      targetCounts: new Map([
        ["minPhys", 4],
        ["agility", 3],
        ["maxStonesplit", 3],
        ["vsBossDmg", 2],
        ["crit", 1],
        ["precision", 2],
      ]),
      measure: gear => 100 + count(gear, "crit") * 10 + Math.max(0, count(gear, "precision") - 2) * gain,
    })
    expect(result.items.length).toBeGreaterThan(0)
    expect(count(result.completion!, "precision")).toBe(2)
    let current = original
    for (const id of result.order!) {
      const row = result.items.find(row => row.itemId === id)!
      for (const option of [...row.options, ...(row.retuneAlternative?.options ?? [])]) {
        expect(count(applySuggestion(current, option), "precision")).toBeGreaterThanOrEqual(2)
        expect(option.gain).toBeGreaterThanOrEqual(0.003)
      }
      current = applySuggestion(current, row.options[0])
    }
    for (const row of result.items.filter(row => !result.order!.includes(row.itemId))) {
      for (const option of [...row.options, ...(row.retuneAlternative?.options ?? [])])
        expect(count(applySuggestion(original, option), "precision")).toBeGreaterThanOrEqual(2)
    }
  })

  it("does not invent a completed allocation when the target fits the number of rows but exceeds gear eligibility", () => {
    const result = planBuildSuggestions({
      items: [weapon("impossible")],
      pathId: "stonesplitStrength",
      targetCounts: new Map([
        ["minPhys", 3],
        ["agility", 1],
        ["crit", 1],
      ]),
      measure: gear => 100 + count(gear, "crit") * 10,
    })
    expect(result).toEqual({ targets: [], items: [] })
  })

  it("does not produce partial local recipes for a target requiring more affixes than the available gear", () => {
    const result = planBuildSuggestions({
      items: [weapon("short")],
      pathId: "stonesplitStrength",
      targetCounts: new Map([...fullTarget, ["precision", 1]]),
      measure: score,
    })
    expect(result).toEqual({ targets: [], items: [] })
  })

  it("allows reroll and cheaper retune options to remove a surplus copy while preserving the preset quota", () => {
    const original: GearItem = {
      ...weapon("surplus-min"),
      relayed: false,
      turnedAffixIndex: 0,
      baseAffix: rolled("minPhys"),
      additionalAffixes: [rolled("minPhys"), rolled("power"), rolled("agility"), rolled("maxStonesplit")],
    }
    const result = planBuildSuggestions({
      items: [original],
      pathId: "stonesplitStrength",
      targetCounts: new Map([
        ["minPhys", 1],
        ["crit", 1],
        ["precision", 1],
        ["agility", 1],
        ["maxStonesplit", 1],
      ]),
      measure: gear => 100 + count(gear, "crit") * 10 + count(gear, "precision"),
    })
    const suggestion = result.items[0]
    const full = suggestion.options[0]
    const retune = suggestion.retuneAlternative!.options[0]
    expect(count(applySuggestion([original], full), "minPhys")).toBe(1)
    expect(full.additions).toContainEqual({ key: "crit", count: 1 })
    expect(full.additions).toContainEqual({ key: "precision", count: 1 })
    expect(retune.from).toBe("minPhys")
    expect(count(applySuggestion([original], retune), "minPhys")).toBe(1)
  })

  it.each([0.299, 0.3])("requires the cheaper retune itself to reach the threshold (gain: %s)", gain => {
    const result = planBuildSuggestions({
      items: [{ ...weapon("retune-threshold"), relayed: false, turnedAffixIndex: 3 }],
      targetCounts: fullTarget,
      pathId: "stonesplitStrength",
      measure: gear => 100 + (count(gear, "minPhys") === 2 ? 6 : 0) + count(gear, "crit") * gain,
    })
    expect(result.items[0].options[0].replacement).toBeDefined()
    expect(Boolean(result.items[0].retuneAlternative)).toBe(gain >= 0.3)
  })

  it("keeps a qualifying cheaper retune even when its immediate gain exceeds the completed-item recipe", () => {
    const result = planBuildSuggestions({
      items: [{ ...weapon("retune-larger"), relayed: false, turnedAffixIndex: 3 }],
      targetCounts: fullTarget,
      pathId: "stonesplitStrength",
      measure: gear => 100 + count(gear, "crit") * 10 - count(gear, "minPhys") * 2,
    })
    const suggestion = result.items[0]
    expect(suggestion.options[0].replacement).toBeDefined()
    expect(suggestion.retuneAlternative!.options[0].gain).toBeGreaterThan(suggestion.options[0].gain)
    expect(count([suggestion.options[0].replacement!], "minPhys")).toBe(2)
  })

  it("does not reroll an unchanged affix multiset just by swapping its base and additional positions", () => {
    const original: GearItem = {
      ...weapon("same-composition"),
      baseAffix: { key: "agility", value: 1 },
      additionalAffixes: [rolled("minPhys"), rolled("crit"), rolled("maxStonesplit"), rolled("precision")],
    }
    const result = planBuildSuggestions({
      items: [original],
      pathId: "stonesplitStrength",
      targetCounts: new Map([
        ["agility", 1],
        ["minPhys", 1],
        ["crit", 1],
        ["maxStonesplit", 1],
        ["precision", 1],
      ]),
      measure: gear =>
        100 +
        gear.reduce(
          (sum, item) =>
            sum + [item.baseAffix, ...item.additionalAffixes].reduce((value, affix) => value + affix.value, 0),
          0,
        ),
    })
    expect(result.items).toEqual([])
    expect(result.targets).toEqual([])
  })

  it("does not suggest rerolling an item just to increase retained affix values", () => {
    const original = {
      ...weapon("relay-only"),
      relayed: false,
      baseAffix: { key: "minPhys", value: 40 },
      additionalAffixes: [rolled("minPhys"), rolled("agility"), rolled("crit"), rolled("maxStonesplit")],
    }
    const result = planBuildSuggestions({
      items: [original],
      targetCounts: fullTarget,
      pathId: "stonesplitStrength",
      measure: gear => 100 + gear[0].baseAffix.value,
    })
    expect(result.items).toEqual([])
    expect(result.targets).toEqual([])
  })

  it("keeps a low-value Min Physical Attack in the full recipe without marking it for reroll", () => {
    const original = weapon("retained-min")
    original.additionalAffixes[1] = { key: "minPhys", value: 48.316 }
    const result = planBuildSuggestions({
      items: [original],
      targetCounts: fullTarget,
      pathId: "stonesplitStrength",
      measure: score,
    })
    const option = result.items[0].options[0]
    expect(option.replacement!.additionalAffixes[1]).toEqual(rolled("minPhys"))
    expect(option.changes.some(change => change.position === 2)).toBe(false)
    expect(option.changes.every(change => change.from !== change.to)).toBe(true)
    expect(option.additions.find(row => row.key === "minPhys")?.count).toBe(1)
  })

  it("replaces the base and additional rows together and counts both new Min Physical Attack copies", () => {
    const original = [weapon("missing-min")]
    const snapshot = structuredClone(original)
    const result = planBuildSuggestions({
      items: original,
      targetCounts: fullTarget,
      pathId: "stonesplitStrength",
      measure: score,
    })
    const suggestion = result.items[0].options[0]
    expect(suggestion.action).toBe("newItem")
    expect(suggestion.replacement?.baseAffix.key).toBe("minPhys")
    expect(suggestion.replacement?.additionalAffixes.map(affix => affix.key)).toContain("minPhys")
    expect(suggestion.replacement?.additionalAffixes).toHaveLength(4)
    expect(Object.fromEntries(result.targets.map(row => [row.key, row.count]))).toEqual({ minPhys: 2, crit: 1 })
    expect(suggestion.additions.find(row => row.key === "minPhys")?.count).toBe(2)
    const changed = applySuggestion(original, suggestion)
    expect(count(changed, "minPhys")).toBe(2)
    expect(changed[0].level).toBe(original[0].level)
    expect(changed[0].rarity).toBe(original[0].rarity)
    expect(changed[0].attunement).toEqual(original[0].attunement)
    expect(suggestion.gain).toBeCloseTo((score(changed) - score(original)) / score(original), 12)
    expect(original).toEqual(snapshot)
  })

  it("keeps the cheaper locked-row retune as a partial alternative to the complete replacement", () => {
    const original = [{ ...weapon("retune"), relayed: false, turnedAffixIndex: 3 }]
    const result = planBuildSuggestions({
      items: original,
      targetCounts: fullTarget,
      pathId: "stonesplitStrength",
      measure: score,
    })
    const full = result.items[0].options[0]
    const retune = result.items[0].retuneAlternative!.options[0]
    expect(full.replacement).toBeDefined()
    expect(full.additions.find(row => row.key === "minPhys")?.count).toBe(2)
    expect(retune.action).toBe("retune")
    expect(retune.position).toBe(4)
    expect(retune.replacement).toBeUndefined()
    expect(retune.changes).toHaveLength(1)
    expect(retune.gain).toBeGreaterThanOrEqual(0.003)
    expect(retune.gain).toBeLessThan(full.gain)
    expect(applySuggestion(original, retune)[0].baseAffix).toEqual(original[0].baseAffix)
    expect(result.targets.find(row => row.key === "crit")?.count).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(
      planBuildSuggestions({
        items: [{ ...original[0], relayed: true }],
        targetCounts: fullTarget,
        pathId: "stonesplitStrength",
        measure: score,
      }).items[0].retuneAlternative,
    ).toBeUndefined()
  })

  it("enumerates legal full recipes without duplicate additional stats or exceeding shared counts", () => {
    const original = weapon("recipes")
    const desired = new Map([...fullTarget, ["agility", 2], ["precision", 1]])
    const candidates = [...fullItemCandidates(original, desired, [])]
    expect(candidates.length).toBeGreaterThan(1)
    for (const candidate of candidates) {
      expect(candidate.additionalAffixes).toHaveLength(4)
      expect(legalAdditionalAffixes(candidate.additionalAffixes.map(row => row.key))).toBe(true)
      for (const affix of [candidate.baseAffix, ...candidate.additionalAffixes])
        expect(affix.value).toBe(maxGearRoll(affix.key, "affix", true, original.level))
      for (const row of summarizeGearAffixes([candidate]).affixes)
        expect(row.count).toBeLessThanOrEqual(desired.get(row.key)!)
    }
    const occupied = {
      ...weapon("other"),
      baseAffix: rolled("minPhys"),
      additionalAffixes: [rolled("minPhys"), rolled("agility"), rolled("crit"), rolled("maxStonesplit")],
    }
    expect([...fullItemCandidates(original, fullTarget, [occupied])]).toEqual([])
  })

  it("recalculates after a complete replacement and does not ask every item to add another capped rate", () => {
    const result = planBuildSuggestions({
      items: [weapon("a"), weapon("b")],
      pathId: "stonesplitStrength",
      targetCounts: new Map([...fullTarget].map(([key, value]) => [key, value * 2])),
      measure: gear => 100 + Math.min(1, count(gear, "crit")),
    })
    expect(result.targets.find(row => row.key === "crit")?.count).toBe(1)
    expect(result.targets.find(row => row.key === "minPhys")?.count).toBe(2)
    // Both items can supply the same one complete replacement, not one Critical each.
    expect(result.items).toHaveLength(2)
  })

  it("uses net counts across multiple complete replacements rather than adding their full stat lists", () => {
    const result = planBuildSuggestions({
      items: [weapon("a"), weapon("b")],
      pathId: "stonesplitStrength",
      targetCounts: new Map([
        ["minPhys", 3],
        ["agility", 2],
        ["crit", 2],
        ["maxStonesplit", 2],
        ["precision", 1],
      ]),
      measure: gear => 100 + count(gear, "minPhys") * 3 + count(gear, "crit") * 2 + count(gear, "precision"),
    })
    expect(result.targets.find(row => row.key === "minPhys")?.count).toBe(3)
    expect(result.targets.find(row => row.key === "crit")?.count).toBe(2)
    expect(result.targets.some(row => row.key === "agility")).toBe(false)
  })

  it.each([-1, 0.299, 0.3])("enforces the improvement threshold for a whole-item gain of %s", gain => {
    const result = planBuildSuggestions({
      items: [weapon("threshold")],
      pathId: "stonesplitStrength",
      targetCounts: fullTarget,
      measure: gear => 100 + (count(gear, "crit") ? gain : 0),
    })
    expect(result.items.length).toBe(gain >= 0.3 ? 1 : 0)
  })

  it("uses relay maxima and respects retune locks, pools, and duplicates", () => {
    const gear = item("a")
    const candidate = retuneSuggestionCandidates(gear, ["crit"], "stonesplitStrength").find(row => row.position === 1)!
    expect(candidate.action).toBe("retune")
    expect(candidate.value).toBeCloseTo(maxGearRoll("crit", "affix", false, 100)! * 0.94)
    const changed = applySuggestion([gear], candidate)[0]
    expect(changed.baseAffix).toEqual(gear.baseAffix)
    expect(changed.additionalAffixes[0].key).toBe("crit")
    expect(retuneSuggestionCandidates({ ...gear, relayed: true }, ["crit"], "stonesplitStrength")).toEqual([])
    const tunedElsewhere = {
      ...gear,
      additionalAffixes: [...gear.additionalAffixes, { key: "momentum", value: 1 }],
      turnedAffixIndex: 1,
    }
    expect(
      retuneSuggestionCandidates(tunedElsewhere, ["crit"], "stonesplitStrength").find(row => row.position === 1)
        ?.action,
    ).toBeUndefined()
    expect(
      retuneSuggestionCandidates({ ...gear, turnedAffixIndex: 0 }, ["crit"], "stonesplitStrength")[0]?.action,
    ).toBe("retune")
    expect(
      retuneSuggestionCandidates(
        { ...gear, additionalAffixes: [...gear.additionalAffixes, { key: "precision", value: 0.01 }] },
        ["precision"],
        "stonesplitStrength",
      ),
    ).toEqual([])
  })

  it("matches preset composition even when affixes are on different items", () => {
    const preset = defaultBuildPresets.find(preset => preset.id === "dust-full-min")!
    const inventory = buildPresetInventory(preset, 100)
    const gear = structuredClone(inventory.items)
    const first = gear[0].additionalAffixes[0]
    gear[0].additionalAffixes[0] = gear[1].additionalAffixes[1]
    gear[1].additionalAffixes[1] = first
    const other = defaultBuildPresets.find(preset => preset.id === "dust-fully-relayed-max")!
    expect(closestSuggestionPreset(gear, [other, preset], 100)?.preset.id).toBe(preset.id)
    expect(closestSuggestionPreset(gear, [{ ...preset, gearByTier: {} } as BuildPreset], 100)).toBeUndefined()
  })

  it("measures a damaged preset through the real shared calculation and leaves it untouched", () => {
    const preset = defaultBuildPresets.find(preset => preset.id === "mixed-fully-relayed-min")!
    const inventory = buildPresetInventory(preset, 100)
    const weapon = inventory.items[0]
    weapon.additionalAffixes[0] = { key: "physicalDefense", value: 1 }
    const settings = {
      weapons: ["snowparting", "phalanxbane"] as ["snowparting", "phalanxbane"],
      breakthrough: "18",
      ping: 40,
    }
    const input: GearSearchInput = {
      build: {
        id: "test",
        name: "Test",
        martialArts: [...settings.weapons],
        equipped: inventory.equipped,
        setup: { ...preset.setup!, innerWays: [] },
      },
      items: inventory.items,
      context: {
        environment: {
          pathId: "stonesplitStrength" as const,
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
        name: "Suggestion",
        steps: [
          { type: "skill" as const, skill: "SnowpartingQ" },
          { type: "event" as const, event: "Delay", duration: 3 },
        ],
      },
    }
    const before = structuredClone(input)
    const result = calculateBuildSuggestions(input)
    expect(result.presetId).toBeDefined()
    expect(result.items.length).toBeGreaterThan(0)
    const selectedPreset = defaultBuildPresets.find(preset => preset.id === result.presetId)!
    expect(summarizeGearAffixes(result.completion!).affixes).toEqual(
      summarizeGearAffixes(buildPresetInventory(selectedPreset, 100).items).affixes,
    )
    const measure = (gearItems: GearItem[]) =>
      calculateRotationBaseline(
        buildMeasurement({ build: input.build, gearItems, context: input.context, rotation: input.rotation }).bundle,
      ).metrics.dps
    let current = input.items
    for (const id of result.order!) {
      const row = result.items.find(row => row.itemId === id)!
      const baseline = measure(current)
      for (const option of [...row.options, ...(row.retuneAlternative?.options ?? [])]) {
        const fresh = measure(applySuggestion(current, option))
        expect((fresh - baseline) / baseline).toBeGreaterThanOrEqual(0.003)
        expect(option.gain).toBeCloseTo((fresh - baseline) / baseline, 10)
      }
      current = applySuggestion(current, row.options[0])
    }
    for (const row of result.items.filter(row => !result.order!.includes(row.itemId))) {
      const baseline = measure(input.items)
      for (const option of row.options) {
        const fresh = measure(applySuggestion(input.items, option))
        expect((fresh - baseline) / baseline).toBeGreaterThanOrEqual(0.003)
        expect(option.gain).toBeCloseTo((fresh - baseline) / baseline, 10)
      }
    }
    expect(input).toEqual(before)

    // Even an exact graduate match must target a Default preset from the build list.
    const graduate = defaultBuildPresets.find(preset => preset.id === "mixed-full-min")!
    const graduateInventory = buildPresetInventory(graduate, 100)
    const graduateResult = calculateBuildSuggestions({
      ...input,
      build: { ...input.build, equipped: graduateInventory.equipped },
      items: graduateInventory.items,
      rotation: { name: "Preset selection", steps: [] },
    })
    expect(graduateResult.presetId).toBeDefined()
    expect(["mixed-full-min", "pure-full-min"]).not.toContain(graduateResult.presetId)
  })
})
