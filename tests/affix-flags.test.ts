import { describe, expect, it } from "vitest"

import type { RotationPriority } from "@/calculations/rotationMetrics"
import { emptyStats } from "@/data/statDefinitions"
import { maxGearRoll, type GearItem } from "@/gear"

import {
  GRADUATE_COMMON_MIN,
  attunementFlags,
  graduationGapAffixFlags,
  lowValueAffixFlags,
  overCapAffixFlags,
  physPriorityOfItems,
  selectGraduationBuild,
} from "../src/features/build/affixFlags"

const GEAR_TIER = 100
const JUDGEMENT_RESISTANCE = 0.65

function priority(statKey: string, dpsDifference: number): RotationPriority {
  return { label: statKey, statKey, dpsDifference, increase: 0, healingIncrease: 0, hpsDifference: 0 }
}

function affixItem(id: string, baseKey: string, additionalKeys: string[] = []): GearItem {
  return {
    id,
    definitionId: "unused",
    level: GEAR_TIER,
    rarity: "Gold",
    baseAffix: { key: baseKey, value: 100 },
    additionalAffixes: additionalKeys.map(key => ({ key, value: 100 })),
  }
}

describe("overCapAffixFlags", () => {
  it("flags once the wasted raw stat reaches a quarter of a roll", () => {
    const perRoll = maxGearRoll("precision", "affix", false, GEAR_TIER)!
    const useful = 0.65 + (1 - 0.65) * (1 + JUDGEMENT_RESISTANCE)
    const below = { ...emptyStats, precision: useful + perRoll * 0.24 }
    const at = { ...emptyStats, precision: useful + perRoll * 0.25 }
    expect(
      overCapAffixFlags({ stats: below, judgementResistance: JUDGEMENT_RESISTANCE, gearTier: GEAR_TIER }).has(
        "precision",
      ),
    ).toBe(false)
    const flags = overCapAffixFlags({ stats: at, judgementResistance: JUDGEMENT_RESISTANCE, gearTier: GEAR_TIER })
    expect(flags.get("precision")?.[0]).toMatchObject({ kind: "overCap", reduceBy: 1 })
  })

  it("counts the removable rolls for crit and affinity using the capped formulas", () => {
    const effectiveCritBonus = 0.05
    const critRoll = maxGearRoll("crit", "affix", false, GEAR_TIER)!
    const affinityRoll = maxGearRoll("affinity", "affix", false, GEAR_TIER)!
    const stats = {
      ...emptyStats,
      effectiveCritBonus,
      crit: (0.8 - effectiveCritBonus) * (1 + JUDGEMENT_RESISTANCE) + critRoll * 2,
      affinity: 0.4 * (1 + JUDGEMENT_RESISTANCE) + affinityRoll * 3,
    }
    const flags = overCapAffixFlags({ stats, judgementResistance: JUDGEMENT_RESISTANCE, gearTier: GEAR_TIER })
    expect(flags.get("crit")?.[0]).toMatchObject({ kind: "overCap", reduceBy: 2 })
    expect(flags.get("affinity")?.[0]).toMatchObject({ kind: "overCap", reduceBy: 3 })
  })
})

describe("lowValueAffixFlags", () => {
  it("flags affixes worth less than 90% of Max Void while sparing the capped rates", () => {
    const rows = [
      priority("maxVoidAttack", 100),
      priority("power", 89),
      priority("agility", 90),
      priority("minPhys", 10),
      priority("precision", 0),
      priority("crit", 0),
      priority("affinity", 0),
    ]
    const flags = lowValueAffixFlags({ statPriority: rows, currentCounts: new Map(), graduateCounts: new Map() })
    expect([...flags.keys()].sort()).toEqual(["minPhys", "power"])
    expect(flags.get("power")?.[0]).toMatchObject({ kind: "lowValue", maxVoidDps: 100 })
  })

  it("gates Momentum and Agility removal on carrying more copies than the graduate", () => {
    const rows = [priority("maxVoidAttack", 100), priority("momentum", 10), priority("agility", 10)]
    const graduateCounts = new Map([
      ["momentum", 4],
      ["agility", 4],
    ])
    const same = lowValueAffixFlags({
      statPriority: rows,
      currentCounts: new Map([
        ["momentum", 4],
        ["agility", 3],
      ]),
      graduateCounts,
    })
    expect(same.size).toBe(0)
    const extra = lowValueAffixFlags({
      statPriority: rows,
      currentCounts: new Map([
        ["momentum", 5],
        ["agility", 4],
      ]),
      graduateCounts,
    })
    expect([...extra.keys()]).toEqual(["momentum"])
  })

  it("stays silent until Max Void Attack has a positive priority", () => {
    const rows = [priority("maxVoidAttack", 0), priority("power", 10)]
    expect(lowValueAffixFlags({ statPriority: rows, currentCounts: new Map(), graduateCounts: new Map() }).size).toBe(0)
  })
})

describe("graduationGapAffixFlags", () => {
  it("only marks defining graduate stats whose count diverges by more than two", () => {
    const graduateCounts = new Map([
      ["allMartialArts", 8],
      ["minPhys", GRADUATE_COMMON_MIN],
      ["crit", 6],
    ])
    const currentCounts = new Map([
      ["allMartialArts", 5],
      ["minPhys", 6],
      ["crit", 0],
    ])
    const flags = graduationGapAffixFlags({ currentCounts, graduateCounts })
    expect([...flags.keys()]).toEqual(["allMartialArts"])
    expect(flags.get("allMartialArts")?.[0]).toMatchObject({
      kind: "graduationGap",
      graduateCount: 8,
      currentCount: 5,
      direction: "tooFew",
    })
  })
})

describe("attunementFlags", () => {
  const attuned = (id: string, key: string, value: number): GearItem => ({
    ...affixItem(id, "minPhys"),
    attunement: { key, value },
  })

  it("flags a wrong attunement against the graduate item in the same slot", () => {
    const flags = attunementFlags({
      equippedItems: [attuned("item", "physicalPenetration", 12.8)],
      graduateItems: [attuned("grad", "formlessPenetration", 15.2)],
      gearTier: GEAR_TIER,
    })
    expect(flags.get("item")?.[0]).toMatchObject({
      kind: "attunementMismatch",
      current: "physicalPenetration",
      expected: "formlessPenetration",
    })
  })

  it("asks to reattune a correct attunement that is below the tier maximum", () => {
    const flags = attunementFlags({
      equippedItems: [attuned("item", "physicalPenetration", 10)],
      graduateItems: [attuned("grad", "physicalPenetration", 12.8)],
      gearTier: GEAR_TIER,
    })
    expect(flags.get("item")?.[0]).toMatchObject({ kind: "attunementUnderrolled", current: 10, maximum: 12.8 })
  })

  it("stays silent when the attunement matches and is fully rolled", () => {
    const flags = attunementFlags({
      equippedItems: [attuned("item", "physicalPenetration", 12.8)],
      graduateItems: [attuned("grad", "physicalPenetration", 12.8)],
      gearTier: GEAR_TIER,
    })
    expect(flags.size).toBe(0)
  })
})

describe("graduate selection", () => {
  it("prefers the max-phys build when the current build favours max physical attack", () => {
    expect(physPriorityOfItems([affixItem("a", "minPhys", ["maxPhys", "maxPhys"])])).toBe("max")
    expect(physPriorityOfItems([affixItem("b", "maxPhys", ["minPhys", "minPhys"])])).toBe("min")
  })

  it("falls back to the highest-DPS graduate when no candidate matches the phys priority", () => {
    const presets = [
      { id: "low", gearByTier: {} },
      { id: "high", gearByTier: {} },
    ] as never
    const selected = selectGraduationBuild({
      graduateIds: ["low", "high"],
      presets,
      candidateDps: { low: 100, high: 200 },
      currentPriority: "max",
      gearTier: GEAR_TIER,
    })
    expect(selected?.id).toBe("high")
  })
})
