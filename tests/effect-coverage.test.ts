import { assert, describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import dustDebuffsJson from "../data/debuff/bamboocut-dust.json"
const dustDebuffs = asEffectDefinitions(dustDebuffsJson)
import { buildRotationTimeline } from "../src/calculations/rotationTimeline"
import { asEffectDefinitions } from "./helpers/shippedData"
import { rowWithId } from "./helpers/timelineRows"

// Ported from script/probe/check-effect-coverage.mjs.
describe("effect-coverage", () => {
  it("counts only max-stack intervals across consumption, reapplication, and expiry", () => {
    const timeline = buildRotationTimeline({
      rotation: { name: "Stack transitions", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          castTime: 8,
          action: [
            { type: "apply", target: "target", value: "Stacks", stack: 1, time: 0 },
            { type: "apply", target: "target", value: "Stacks", stack: 2, time: 2 },
            { type: "consume", target: "target", value: "Stacks", stack: 1, time: 4 },
            { type: "apply", target: "target", value: "Stacks", stack: 1, time: 4.5 },
            { type: "consume", target: "target", value: "Stacks", stack: "all", time: 6 },
          ],
        },
      },
      effectDefinitions: { Stacks: { maxStack: 3, duration: 3, refresh: true, showCoverage: true } },
      dots: {},
      eventDefinitions: {},
      innerWayRules: [],
      innerWayConditions: [],
      setupEffects: [],
      weapons: [],
    })
    expect(timeline[0].debuffMaxStackSeconds?.Stacks).toBe(3.5)
  })

  it("counts Soulbreak at its one-stack maximum and stops on consumption", () => {
    const timeline = buildRotationTimeline({
      rotation: { name: "Soulbreak coverage", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          castTime: 20,
          action: [
            { type: "apply", target: "target", value: "Soulbreak", time: 2 },
            { type: "consume", target: "target", value: "Soulbreak", stack: "all", time: 7 },
          ],
        },
      },
      effectDefinitions: dustDebuffs,
      dots: {},
      eventDefinitions: {},
      innerWayRules: [],
      innerWayConditions: [],
      setupEffects: [],
      weapons: [],
    })
    expect(timeline[0].debuffMaxStackSeconds?.Soulbreak).toBe(5)
  })

  it("Definition-filtered average stacks and maximum-stack coverage for all debuffs verified", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Coverage probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const result = calculateRotationBaseline({
      timeline: {
        rotation: { name: "Coverage probe", steps: [{ type: "skill", skill: "CoverageProbe" }] },
        skills: {
          CoverageProbe: {
            name: "Coverage probe",
            castTime: 2,
            action: [
              { type: "apply", target: "self", value: "ShortBuff", stack: 1, time: 0 },
              { type: "apply", target: "self", value: "HiddenBuff", stack: 1, time: 0 },
              { type: "apply", target: "target", value: "ShortDebuff", stack: 1, time: 0 },
              { type: "apply", target: "target", value: "PrivateDebuff", stack: 1, time: 0 },
              { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
              { type: "addResource", target: "self", resource: "Probe", amount: 1, time: 1.5 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 2 },
            ],
            modifier: [],
            tags: ["MartialArts"],
          },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {
          ShortBuff: { name: "Short Buff", duration: 1.5, maxStack: 1, refresh: true, showCoverage: true, effect: [] },
          ShortDebuff: {
            name: "Short Debuff",
            duration: 1.5,
            maxStack: 1,
            refresh: true,
            shared: true,
            showCoverage: true,
            effect: [],
          },
          PrivateDebuff: {
            name: "Private Debuff",
            duration: 1.5,
            maxStack: 1,
            refresh: true,
            shared: false,
            showCoverage: true,
            effect: [],
          },
          HiddenBuff: { name: "Hidden Buff", duration: 10, maxStack: 1, refresh: true, effect: [] },
        },
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const buff = rowWithId(result.metrics.breakdown.buffCoverage, "ShortBuff")
    const debuff = rowWithId(result.metrics.breakdown.debuffCoverage, "ShortDebuff")
    const privateDebuff = rowWithId(result.metrics.breakdown.debuffCoverage, "PrivateDebuff")
    assert(buff?.averageStacks === 0.5, "Buff average stacks must include only damage and healing actions.")
    assert(
      debuff?.averageStacks === 0.5 && debuff.maxStackCoverage === 75,
      "A shared debuff must report output-action average stacks and elapsed-time coverage.",
    )
    assert(
      privateDebuff?.averageStacks === 0.5 && privateDebuff.maxStackCoverage === undefined,
      "A non-shared debuff must retain average stacks without maximum-stack coverage.",
    )
    assert(
      !result.metrics.breakdown.buffCoverage.some(row => row.id === "HiddenBuff"),
      "Effects without showCoverage must stay out of the coverage breakdown.",
    )
  })
})
