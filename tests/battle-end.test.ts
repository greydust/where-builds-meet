import { assert, describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationRecord } from "@/calculations/rotationTimeline"

// Ported from script/probe/check-battle-end.mjs.
describe("battle-end", () => {
  it("Fight-relative event timing, Battle End cutoff checks passed", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const damage = (time: number) => ({ type: "damage", phyCoef: 1, attrCoef: 1, phyBonus: 0, attrBonus: 0, time })
    const skills = {
      Prefight: {
        name: "Prefight",
        castTime: 1,
        action: [damage(0.5)],
        modifier: [{ effect: { castTimeModifier: 1 } }],
        tags: ["DirectDamage"],
      },
      Starting: {
        name: "Starting",
        castTime: 2,
        action: [damage(0.5), damage(1.5), damage(1.75)],
        modifier: [{ effect: { castTimeMultiplier: 2 } }],
        tags: ["DirectDamage"],
      },
      AfterEnd: { name: "After End", castTime: 1, action: [damage(0.5)], tags: ["DirectDamage"] },
    }
    const rotation = {
      name: "Battle End probe",
      eventTimeReference: "battleStart",
      start: { step: 1, action: 0 },
      steps: [
        { type: "skill", skill: "Prefight" },
        { type: "skill", skill: "Starting" },
        { type: "event", event: "Exhausted", startTime: 2 },
        { type: "event", event: "BattleEnd", startTime: 2.5 },
        { type: "skill", skill: "AfterEnd" },
      ],
    }
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 }
    const enemy = {
      name: "Probe",
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
        rotation: rotation as RotationRecord,
        skills,
        eventDefinitions: {
          Exhausted: { name: "Exhausted", castTime: 0, action: [] },
          BattleEnd: { name: "Battle End", castTime: 0, action: [] },
        },
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["snowparting", "phalanxbane"],
      },
      startAnchor: { rowId: "rotation-1", actionIndex: 0 },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: ["snowparting", "phalanxbane"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const exhausted = result.timeline.find(row => row.step.type === "event" && row.step.event === "Exhausted")
    const battleEnd = result.timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")
    assert(exhausted, "The probe must schedule its Exhausted event.")
    assert(battleEnd, "The probe must schedule its Battle End event.")
    assert(
      Math.abs((exhausted?.startTime ?? 0) - result.anchorTime - 2) < 1e-9,
      "Exhausted must remain two seconds after the dynamically shifted fight start.",
    )
    assert(
      Math.abs((battleEnd?.startTime ?? 0) - result.anchorTime - 2.5) < 1e-9,
      "Battle End must remain 2.5 seconds after the dynamically shifted fight start.",
    )
    assert(
      Math.abs(result.duration - 2.5) < 1e-9,
      `Battle End must cap duration at 2.5 seconds, received ${result.duration}.`,
    )
    assert(
      Object.keys(result.actionBreakdowns).length === 2,
      `Expected two damage actions before Battle End, received ${Object.keys(result.actionBreakdowns).length}.`,
    )
    assert(
      !result.actionBreakdowns["rotation-1:2"],
      "Damage at the same timestamp as Battle End must not be calculated.",
    )
    assert(!result.actionBreakdowns["rotation-4:0"], "Damage after Battle End must not be calculated.")
  })

  it("applies an attached Battle End before attack alignment", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const rows = buildRotationTimeline({
      rotation: {
        name: "Attached Battle End",
        eventTimeReference: "battleStart",
        start: { step: 1 },
        steps: [
          { type: "event", event: "BattleEnd", before: { action: "start" } },
          { type: "skill", skill: "Lead" },
          { type: "event", event: "TakeDamage", startTime: 5, damage: 200 },
        ],
      },
      skills: {
        Lead: {
          name: "Lead",
          castTime: 1,
          action: [{ type: "damage", phyCoef: 1, attrCoef: 0, time: 0.5 }],
          attackResponse: { endMargin: 0, durationFrom: "Lead", onSuccess: "Lead" },
          tags: ["DirectDamage"],
        },
      },
      eventDefinitions: {
        BattleEnd: { name: "Battle End", castTime: 0, action: [] },
        TakeDamage: { name: "Take Damage", castTime: 0, action: [{ type: "takeDamage", time: 0 }] },
      },
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    const battleEnd = rows.find(row => row.step.type === "event" && row.step.event === "BattleEnd")
    expect(battleEnd?.startTime).toBe(0)
    expect(battleEnd?.timelineEndTime).toBe(0)
  })
})
