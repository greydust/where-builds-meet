import { describe, expect, it } from "vitest"

import { buildMeasurement } from "@/calculations/rotationCalculationBundle"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { itemToDraft } from "@/features/build/GearEditor"
import {
  fullyRelayedItem,
  gearSuggestionTargets,
  rankRetuneSuggestions,
  retuneTargetKey,
  suggestionItem,
} from "@/features/build/gearSuggestionItems"
import { exportBuildState, mergeImportedBuildState, type BuildState, type GearItem } from "@/gear"
import { legalAdditionalAffixes, retuneCandidates } from "@/gearRetuning"

import { realGearSearchInput } from "./helpers/gearOptimizationScenarios"

const item: GearItem = {
  id: "original",
  definitionId: "helmet",
  slot: "helmet",
  level: 100,
  rarity: "Gold",
  baseAffix: { key: "crit", value: 0.06 },
  additionalAffixes: [
    { key: "minPhys", value: 40 },
    { key: "maxPhys", value: 65 },
  ],
  turnedAffixIndex: 1,
  attunement: { key: "phalanxbaneChargedBoost", value: 0.025 },
}

const state: BuildState = {
  activeBuildId: "test",
  entries: [{ id: "test", name: "Test", martialArts: ["snowparting", "phalanxbane"], equipped: { helmet: item.id } }],
  gearItems: [item],
}
const empty: BuildState = { activeBuildId: "", entries: [], gearItems: [] }

describe("gear suggestion drafts and saved Turn markers", () => {
  it("preserves the retuned affix through export, import and the editor", () => {
    const imported = mergeImportedBuildState(empty, JSON.parse(exportBuildState(state))).state
    expect(imported.gearItems).toHaveLength(1)
    const draft = itemToDraft(imported.gearItems[0])
    expect(draft.turnedAffixIndex).toBe(1)
    expect(suggestionItem(draft, "helmet", "helmet")?.turnedAffixIndex).toBe(1)
  })

  it("remaps the Turn position when optional empty editor rows are omitted", () => {
    const draft = itemToDraft(item)
    draft.additionalAffixes = [{ key: "", value: "" }, ...draft.additionalAffixes.slice(0, 3)]
    draft.turnedAffixIndex = 2
    const saved = suggestionItem(draft, "helmet", "helmet")
    expect(saved?.additionalAffixes).toEqual(item.additionalAffixes)
    expect(saved?.turnedAffixIndex).toBe(1)
  })

  it("does not merge an unturned item with a turned copy of the same stats", () => {
    const unturned = { ...item, turnedAffixIndex: undefined }
    const current = { ...state, gearItems: [unturned] }
    const imported = mergeImportedBuildState(current, JSON.parse(exportBuildState(state)), { reuseIdenticalGear: true })
    expect(imported.state.gearItems).toHaveLength(2)
    expect(imported.state.gearItems[1].turnedAffixIndex).toBe(1)
  })

  it("retains older gear without inventing a Turn position", () => {
    const old = { ...state, gearItems: [{ ...item, turnedAffixIndex: undefined }] }
    const imported = mergeImportedBuildState(empty, JSON.parse(exportBuildState(old))).state
    expect(imported.gearItems).toHaveLength(1)
    expect(imported.gearItems[0].turnedAffixIndex).toBeUndefined()
  })

  it("fully modulates only the preview's affixes and preserves its attunement and Turn", () => {
    const result = fullyRelayedItem(item)
    expect(result.relayed).toBe(true)
    expect(result.additionalAffixes[1].value).toBeCloseTo(90.6 * 0.94)
    expect(result.attunement).toEqual(item.attunement)
    expect(result.turnedAffixIndex).toBe(1)
    expect(item.relayed).toBeUndefined()
    expect(item.additionalAffixes[1].value).toBe(65)
  })

  it("never retunes relayed gear and restricts a turned item to its marked row", () => {
    expect(retuneCandidates({ ...item, relayed: true }, "stonesplitStrength")).toEqual([])
    const candidates = retuneCandidates(item, "stonesplitStrength")
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every(candidate => candidate.index === 1)).toBe(true)
    expect(candidates.some(candidate => candidate.key === "maxPhys")).toBe(false)
    expect(candidates.every(candidate => candidate.item.additionalAffixes[0] === item.additionalAffixes[0])).toBe(true)
  })

  it("ranks a lower normal roll above another outcome when its fully relayed gear wins", () => {
    const candidates = retuneCandidates(item, "stonesplitStrength")
    const readings: Record<string, ThroughputReading> = {}
    const reading = (dps: number): ThroughputReading => ({ dps, hps: 0, totalDamage: dps * 60 })
    for (const candidate of candidates) {
      readings[retuneTargetKey(candidate, "max")] = reading(100)
      readings[retuneTargetKey(candidate, "relayed")] = reading(100)
    }
    const stone = candidates.find(candidate => candidate.key === "maxStonesplit")!
    const power = candidates.find(candidate => candidate.key === "power")!
    readings[retuneTargetKey(stone, "max")] = reading(170)
    readings[retuneTargetKey(stone, "relayed")] = reading(160)
    readings[retuneTargetKey(power, "max")] = reading(165)
    readings[retuneTargetKey(power, "relayed")] = reading(180)
    const ranked = rankRetuneSuggestions(candidates, readings)!
    expect(ranked[0].key).toBe("power")
    expect(ranked[0].relayed).toBe(true)
    expect(ranked[0].reading.dps).toBe(180)
    expect(ranked[1].key).toBe("maxStonesplit")
    expect(ranked[1].relayed).toBe(false)
    delete readings[retuneTargetKey(power, "relayed")]
    expect(rankRetuneSuggestions(candidates, readings)).toBeUndefined()
  })

  it("filters duplicate affixes and attribute groups against the rows that remain", () => {
    const original: GearItem = {
      ...item,
      turnedAffixIndex: undefined,
      additionalAffixes: [
        { key: "power", value: 35 },
        { key: "maxBellstrike", value: 40 },
        { key: "agility", value: 35 },
      ],
    }
    const candidates = retuneCandidates(original, "stonesplitStrength")
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.some(candidate => candidate.index === 0 && candidate.key === "agility")).toBe(false)
    expect(candidates.some(candidate => candidate.index === 0 && candidate.key === "maxStonesplit")).toBe(false)
    expect(candidates.some(candidate => candidate.index === 1 && candidate.key === "maxStonesplit")).toBe(true)
    for (const candidate of candidates) {
      expect(legalAdditionalAffixes(candidate.item.additionalAffixes.map(affix => affix.key))).toBe(true)
    }
    expect(legalAdditionalAffixes(["maxVoidAttack", "maxStonesplit"])).toBe(false)
    expect(legalAdditionalAffixes(["minBellstrike", "minStonesplit"])).toBe(false)
    expect(legalAdditionalAffixes(["minBellstrike", "maxStonesplit"])).toBe(true)
  })

  it("compares a relay preview with exactly the saved-and-equipped result through the full rotation", () => {
    const input = realGearSearchInput(0, ["helmet"])
    const equipped = input.items.find(gear => gear.id === input.build.equipped?.helmet)!
    const unrelayed = { ...equipped, relayed: false, turnedAffixIndex: 1 }
    const draftItem = suggestionItem(itemToDraft(unrelayed), unrelayed.definitionId, "helmet")!
    const targets = gearSuggestionTargets({
      build: input.build,
      item: draftItem,
      slot: "helmet",
      gearItems: input.items,
    })
    const preview = buildMeasurement({
      build: targets[1].build,
      gearItems: targets[1].gearItems!,
      context: input.context,
      rotation: input.rotation,
    })
    const saved = { ...fullyRelayedItem(unrelayed), id: equipped.id }
    const actual = buildMeasurement({
      build: input.build,
      gearItems: input.items.map(gear => (gear.id === saved.id ? saved : gear)),
      context: input.context,
      rotation: input.rotation,
    })
    expect(preview.cacheKey).toBe(actual.cacheKey)
    const result = calculateRotationBaseline(preview.bundle)
    expect(result.metrics.dps).toBeGreaterThan(0)
    expect(result.duration).toBeGreaterThan(50)
    expect(result.metrics.dps).toBe(calculateRotationBaseline(actual.bundle).metrics.dps)
  })

  it("measures retune-then-relay as the fully modulated item through the shared calculation pipeline", () => {
    const input = realGearSearchInput(0, ["helmet"])
    const equipped = input.items.find(gear => gear.id === input.build.equipped?.helmet)!
    const draftItem = suggestionItem(itemToDraft({ ...equipped, relayed: false }), equipped.definitionId, "helmet")!
    const candidate = retuneCandidates(draftItem, "stonesplitStrength").at(0)!
    const target = gearSuggestionTargets({
      build: input.build,
      item: draftItem,
      slot: "helmet",
      gearItems: input.items,
      pathId: "stonesplitStrength",
    }).find(target => target.key === retuneTargetKey(candidate, "relayed"))!
    const preview = buildMeasurement({
      build: target.build,
      gearItems: target.gearItems!,
      context: input.context,
      rotation: input.rotation,
    })
    const saved = { ...fullyRelayedItem(candidate.item), id: equipped.id }
    const actual = buildMeasurement({
      build: input.build,
      gearItems: input.items.map(gear => (gear.id === saved.id ? saved : gear)),
      context: input.context,
      rotation: input.rotation,
    })
    expect(preview.cacheKey).toBe(actual.cacheKey)
    expect(saved.relayed).toBe(true)
    expect(saved.turnedAffixIndex).toBe(candidate.index)
    expect(saved.additionalAffixes[candidate.index].key).not.toBe(equipped.additionalAffixes[candidate.index].key)
    const result = calculateRotationBaseline(preview.bundle)
    expect(result.metrics.dps).toBeGreaterThan(0)
    expect(result.metrics.dps).toBe(calculateRotationBaseline(actual.bundle).metrics.dps)
  })
})
