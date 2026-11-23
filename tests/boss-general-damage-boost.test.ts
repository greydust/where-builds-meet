import generalBuffs from "@gamedata/buff/general.json"
import { describe, expect, it } from "vitest"

import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline, type RotationSimulationBundle } from "@/calculations/rotationCalculator"
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"
import { mergeImportedRotationEntries, exportRotationEntries } from "@/rotationTransfer"

import { asEffectDefinitions } from "./helpers/shippedData"

function timelineInput(events: RotationStep[]): TimelineBuildInput {
  return {
    rotation: {
      name: "Boss boost",
      eventTimeReference: "battleStart",
      start: { step: events.length },
      steps: [...events, { type: "skill", skill: "Probe" }, { type: "skill", skill: "Probe" }],
    },
    skills: { Probe: { castTime: 4, action: [0, 1, 2, 3].map(time => ({ type: "damage", time, phyCoef: 1 })) } },
    eventDefinitions: rotationEventDefinitions,
    effectDefinitions: asEffectDefinitions(generalBuffs),
    dots: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
}

const boost = (startTime: number, duration: number, damageBonus: number): RotationStep => ({
  type: "event",
  event: "BossGeneralDamageBoost",
  startTime,
  duration,
  damageBonus,
})

describe("Boss General Damage Boost", () => {
  it("applies at its start, expires before the boundary hit, and never delays attacks", () => {
    const rows = buildRotationTimeline(timelineInput([boost(1, 2, 0.25)]))
    const skills = rows.filter(row => row.step.type === "skill")
    expect(skills.map(row => row.startTime)).toEqual([0, 4])
    expect([0, 1, 2, 3].map(index => skills[0].actionStates[index].unconditionalDamageEffects?.dmgBonus ?? 0)).toEqual([
      0, 0.25, 0.25, 0,
    ])
  })

  it("replaces the percentage and duration while preserving earlier hit snapshots", () => {
    const rows = buildRotationTimeline(timelineInput([boost(0, 6, 0.2), boost(2, 1, 0.35)]))
    const skill = rows.find(row => row.step.type === "skill")!
    expect([0, 1, 2, 3].map(index => skill.actionStates[index].unconditionalDamageEffects?.dmgBonus ?? 0)).toEqual([
      0.2, 0.2, 0.35, 0,
    ])
  })

  it("adds the percentage to the existing damage category through the central calculator", () => {
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const run = (events: RotationStep[]) => {
      const input: RotationSimulationBundle = {
        timeline: { ...timelineInput(events), setupEffects: [{ dmgBonus: 0.5 }] },
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
        weapons: [],
        startAnchor: { rowId: `rotation-${events.length}` },
        attunement: emptyAttunementStats,
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }
      return calculateRotationBaseline(input).metrics
    }
    const plain = run([])
    const boosted = run([boost(0, 2, 0.3)])
    // Two of eight equal hits gain 0.3 on top of the existing 1.5 multiplier.
    expect(boosted.totalDamage / plain.totalDamage).toBeCloseTo(1.05, 12)
  })

  it("preserves duration and decimal percentage through export and import", () => {
    const entries = [{ id: "boss", martialArts: [], rotation: timelineInput([boost(1.5, 2.75, 0.125)]).rotation }]
    const imported = mergeImportedRotationEntries([], JSON.parse(exportRotationEntries(entries))).entries
    expect(imported[0].rotation.steps[0]).toEqual(entries[0].rotation.steps[0])
  })
})
