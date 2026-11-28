import mortal from "@gamedata/skill/mortal-rope-dart.json"
import phalanxbane from "@gamedata/skill/phalanxbane-blade.json"
import { expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { emptyStats } from "@/data/statDefinitions"

import { asSkillRecords, asTalentEffects } from "./helpers/shippedData"

it.each([
  { weapon: "phalanxbane", skills: phalanxbane, id: "AnxiSoldierBurningHeart2" },
  { weapon: "phalanxbane", skills: phalanxbane, id: "AnxiSoldierBurningHeart3" },
  { weapon: "phalanxbane", skills: phalanxbane, id: "AnxiSoldierTotalAnnihilation" },
  { weapon: "mortalRopeDart", skills: mortal, id: "Rodent" },
] as const)("compensates $id at rank 14 without affecting another art", ({ weapon, skills, id }) => {
  const stats = {
    ...emptyStats,
    minPhys: 100,
    maxPhys: 100,
    minStonesplit: 50,
    maxStonesplit: 50,
    minBamboocut: 50,
    maxBamboocut: 50,
    precision: 1,
  }
  const run = (enabled: boolean) => {
    const input: RotationSimulationBundle = {
      timeline: {
        rotation: {
          name: "Additional attack compensation",
          steps: [
            { type: "skill", skill: id },
            { type: "skill", skill: "Foreign" },
          ],
        },
        skills: {
          [id]: { ...asSkillRecords(skills)[id], castTime: 1 },
          Foreign: {
            castTime: 1,
            tags: ["DirectDamage", "SnowpartingBlade"],
            action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
          },
        },
        setupEffects: enabled ? asTalentEffects(martialArtDefinitions[weapon].talent[14].at(-1)!.effect) : [],
        weapons: [weapon],
        innerWayConditions: [],
        innerWayRules: [],
        effectDefinitions: {},
        eventDefinitions: {},
        dots: {},
      },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy: {
        name: "Target",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      weapons: [weapon],
      startAnchor: { rowId: "rotation-0" },
      attunement: emptyAttunementStats,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }
    return { expected: calculateRotationBaseline(input), sampled: calculateSimulatedRotationRun(input, () => 0.5) }
  }
  const plain = run(false)
  const boosted = run(true)
  const damage = (result: typeof plain.expected, skill: string) =>
    result.metrics.breakdown.skills.find(entry => entry.id === skill)!.damage
  expect(damage(boosted.expected, id) / damage(plain.expected, id)).toBeCloseTo(1.00725, 12)
  expect(damage(boosted.expected, "Foreign")).toBe(damage(plain.expected, "Foreign"))
  const expectedSettlements = Object.values(boosted.expected.actionBreakdowns)
    .filter(hit => hit.total > 0)
    .map(hit => Math.ceil(hit.total))
  expect(boosted.sampled.resolvedSequence.map(hit => hit.breakdown.total).filter(total => total > 0)).toEqual(
    expectedSettlements,
  )
})
