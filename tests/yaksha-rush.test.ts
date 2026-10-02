import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import type { CharacterStats } from "@/types"

import generalBuffs from "../data/buff/general.json"
import mystic from "../data/skill/mystic.json"
import { calculateDamageBreakdown } from "../src/calculations/damage"
import type { DamageAction, DamageContext } from "../src/calculations/damage"
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { asEffectDefinitions, asSkillRecords, skillActions } from "./helpers/shippedData"

/** The base-animation route of skill 2300061: two collider markers inside one cast. */
const LUNGE_TIME = 0.45096195999999994
const KICK_TIME = 1.3603838499999998
const CAST_TIME = 1.8883333333333334
const COOLDOWN = 2

const Observe: TimelineBuildInput["skills"][string] = {
  name: "Observe Vitality",
  castTime: 0,
  action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 0 }],
  modifier: [],
  tags: ["General"],
}

const input = (steps: RotationStep[], extra: Partial<TimelineBuildInput> = {}): TimelineBuildInput => ({
  rotation: { name: "Yaksha Rush", ping: 40, steps },
  skills: asSkillRecords({ ...mystic, Observe }),
  eventDefinitions: {},
  dots: {},
  effectDefinitions: asEffectDefinitions({ ...generalBuffs }),
  innerWayConditions: [],
  innerWayRules: [],
  setupEffects: [],
  weapons: [],
  initialResources: { Vitality: 100 },
  resourceMaximums: { Vitality: 100 },
  ...extra,
})

describe("Yaksha Rush", () => {
  it("occupies the base route and lands both hits before the cast ends", () => {
    const rows = buildRotationTimeline(input([{ type: "skill", skill: "YakshaRush" }]))
    const cast = rows.find(row => row.rotationIndex === 0)!
    expect(cast.startTime).toBeCloseTo(0.04, 10)
    expect(cast.effectiveCastTime).toBeCloseTo(CAST_TIME, 10)
    const hits = cast.actions.flatMap((action, index) => (action.type === "damage" ? [{ action, index }] : []))
    expect(hits.map(({ action }) => action.time)).toEqual([LUNGE_TIME, KICK_TIME])
    hits.forEach(({ index }) => expect(cast.actionStates[index]).toBeDefined())
    expect(KICK_TIME).toBeLessThan(CAST_TIME)
  })

  it("spends its full cost and returns the shared Turnaround refund", () => {
    const finalVitality = (initialBuffs: TimelineBuildInput["initialBuffs"]) =>
      buildRotationTimeline(
        input(
          [
            { type: "skill", skill: "YakshaRush" },
            { type: "skill", skill: "Observe" },
          ],
          { initialBuffs },
        ),
      ).at(-1)!.resources.Vitality
    expect(finalVitality(undefined)).toBeCloseTo(100 - 15, 10)
    expect(finalVitality([{ name: "Turnaround", stack: 1 }])).toBeCloseTo(100 - 15 + 4.5, 10)
  })

  it("throttles a back-to-back cast to the shared cooldown", () => {
    const steps: RotationStep[] = [
      { type: "skill", skill: "YakshaRush" },
      { type: "skill", skill: "YakshaRush" },
    ]
    const rows = buildRotationTimeline(
      input(steps, { rotation: { name: "Yaksha Rush", ping: 0, steps }, cooldownPolicy: "wait" }),
    ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(rows[0].startTime).toBeCloseTo(0, 10)
    expect(rows[1].startTime).toBeCloseTo(COOLDOWN, 10)
    expect(rows[1].cooldownWait).toBeCloseTo(COOLDOWN - CAST_TIME, 10)
  })

  it("routes both hits through the single-target mystic boost only", () => {
    const skillTags = mystic.YakshaRush.tags ?? []
    const probeStats: CharacterStats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      singleTargetMysticDmgBoost: 0.1,
      areaMysticDmgBoost: 0.2,
    }
    const context: DamageContext = {
      stats: probeStats,
      skillTags: [],
      attunement: emptyAttunementStats,
      weapons: [],
      buffs: [],
      enemy: {
        name: "Probe",
        level: 1,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      derivedStats: calculateDerivedStats(probeStats, 0),
      effects: [{ stat: {} }],
    }
    const total = (tags: string[]) =>
      skillActions(asSkillRecords(mystic).YakshaRush)
        .filter(action => action.type === "damage")
        .reduce(
          (sum, action) =>
            sum + calculateDamageBreakdown(action as DamageAction, { ...context, skillTags: tags }).total,
          0,
        )
    const untagged = total(["Mystic"])
    expect(total(skillTags) / untagged).toBeCloseTo(1.1, 9)
  })
})
