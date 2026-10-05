import { afterEach, describe, expect, it, vi } from "vitest"

import definitions from "../data/attunement.json"
import * as attunementMatching from "../src/calculations/attunementStats"
import {
  calculateDamageBreakdown,
  calculateSimulatedDamageBreakdown,
  type AttunementStats,
  type DamageContext,
} from "../src/calculations/damage"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { emptyStats } from "../src/data/statDefinitions"

afterEach(() => vi.restoreAllMocks())

const uncachedMatches: typeof attunementMatching.matchingAttunementEntries = (attunement, tags) =>
  Object.entries(attunement).flatMap(([key]) => {
    const effect = definitions[key as keyof typeof definitions]?.effect
    // The matcher reads the tag filter off an effect that also carries its stat sheet,
    // so the filter is the effect as the matcher declares it.
    const filter = { ...effect } as attunementMatching.AttunementTagFilter
    return attunementMatching.attunementMatchesSkill(filter, tags)
      ? [{ key: key as keyof AttunementStats, stat: (effect?.stat ?? {}) as Record<string, number> }]
      : []
  })

function context(attunement: AttunementStats, skillTags: string[], formlessPenetration = 0.1): DamageContext {
  const stats = {
    ...emptyStats,
    minPhys: 101.123456789,
    maxPhys: 219.987654321,
    minBamboocut: 79.23456789,
    maxBamboocut: 140.3456789,
    precision: 0.91,
    crit: 0.3,
    affinity: 0.2,
    formlessPenetration,
  }
  return {
    stats,
    derivedStats: calculateDerivedStats(stats, 0.65),
    attunement,
    skillTags,
    weapons: ["infernalTwinblades", "mortalRopeDart"],
    buffs: [],
    effects: [],
    enemy: {
      name: "Attunement cache target",
      level: 96,
      defense: 408,
      physicalResistance: 13.1,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 11.7,
      judgementResistance: 0.65,
    },
  }
}

const action = { phyCoef: 0.348974526316, attrCoef: 0.348974526316, phyBonus: 0.1, attrBonus: 0.2 }
function outcomes(input: DamageContext) {
  return [
    calculateDamageBreakdown(action, input),
    ...[0, 0.2, 0.5, 0.99].map(roll => calculateSimulatedDamageBreakdown(action, input, () => roll)),
  ]
}

describe("cached attunement matching", () => {
  it("matches uncached expected and sampled formulas exactly across filters and entry orders", () => {
    const tagSets = Object.values(definitions).flatMap(definition => {
      const filter = definition.effect as attunementMatching.AttunementTagFilter
      const tags = filter.tags?.map(tag => (typeof tag === "string" ? tag : tag[0])) ?? []
      const alternatives = (filter.tags ?? []).flatMap(tag =>
        typeof tag === "string"
          ? []
          : tag.map(alternative => tags.filter(value => value !== tag[0]).concat(alternative)),
      )
      return [tags, tags.slice(1), tags.concat(filter.excludeTags ?? [])].concat(alternatives)
    })
    tagSets.push([...new Set(tagSets.flat())])
    const keys = Object.keys(definitions)
    const inputs = [keys, keys.toReversed()].flatMap(order => {
      const attunement = Object.fromEntries(
        order.map((key, index) => [key, [0.1, 0.2, 1e-16, 0, 11.1][index % 5]]),
      ) as AttunementStats
      return tagSets.map(tags => context(attunement, tags))
    })
    const cached = inputs.map(outcomes)
    // Replace only matching with the previous full scan; all arithmetic uses the production formula.
    const reference = vi.spyOn(attunementMatching, "matchingAttunementEntries").mockImplementation(uncachedMatches)
    expect(cached).toStrictEqual(inputs.map(outcomes))
    expect(reference).toHaveBeenCalled()
  })

  it("reuses equivalent tag contexts while reading current values and separating variants", () => {
    const attunement = { physicalPenetration: 0, formlessPenetration: 0, mortalRodentBoost: 0 } as AttunementStats
    const tags = ["MortalRopeDart", "Rodent"]
    const first = attunementMatching.matchingAttunementEntries(attunement, tags)
    expect(attunementMatching.matchingAttunementEntries(attunement, [...tags])).toBe(first)
    const before = calculateDamageBreakdown(action, context(attunement, tags)).total
    attunement.mortalRodentBoost = 0.12
    attunement.formlessPenetration = 11
    const updated = outcomes(context(attunement, tags))
    expect(updated[0].total).toBeGreaterThan(before)

    // New inputs may change both the values and the ordered set of present keys.
    const variant = { mortalRodentBoost: 0.3, physicalPenetration: 17, infernalMartialBoost: 0.6 } as AttunementStats
    tags.splice(0, tags.length, "InfernalTwinblades", "MartialArt")
    const changedTags = outcomes(context(attunement, tags))
    const changedVariant = outcomes(context(variant, tags, 19.3))
    vi.spyOn(attunementMatching, "matchingAttunementEntries").mockImplementation(uncachedMatches)
    expect(updated).toStrictEqual(outcomes(context(attunement, ["MortalRopeDart", "Rodent"])))
    expect(changedTags).toStrictEqual(outcomes(context(attunement, tags)))
    expect(changedVariant).toStrictEqual(outcomes(context(variant, tags, 19.3)))
  })
})
