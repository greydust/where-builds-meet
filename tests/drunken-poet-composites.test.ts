import { describe, expect, it } from "vitest"

import type { RotationRecord, RotationStep, TrackedEffect } from "@/calculations/rotationTimeline"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"

import mysticBuffs from "../data/buff/mystic.json"
import mysticSkills from "../data/skill/mystic.json"
import { isClose } from "./helpers/floatEquality"

/** The action an attached event names, when the step is one. */
function attachedActionOf(step: RotationStep | undefined) {
  return step && "before" in step ? step.before.action : undefined
}

// Ported from script/probe/check-drunken-poet-composites.mjs.
describe("drunken-poet-composites", () => {
  it("Drunken Poet composite behavior and persisted-chain migration checks passed", async () => {
    const skills = (await import("../data/skill/mystic.json")).default
    const buffs = (await import("../data/buff/mystic.json")).default
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { migrateDrunkenPoetSequences } = await import("../src/rotationEditing.ts")
    const { normalizeStartAction } = await import("../src/application/rotationCatalog.ts")
    const closeTo = (actual: number, expected: number) => isClose(actual, expected, 1e-9)
    const componentTimes = [0.58, 0.436, 0.55, 0.6, 0.5382]
    const compositeIds = [
      "DrunkenPoet1Hit",
      "DrunkenPoet2Hits",
      "DrunkenPoet3Hits",
      "DrunkenPoet4Hits",
      "DrunkenPoet5HitsCancel",
    ]
    const timelineFor = (skillId: string, initialBuffs: TrackedEffect[] = []) =>
      buildRotationTimeline({
        rotation: { name: `${skillId} probe`, steps: [{ type: "skill", skill: skillId }] },
        skills,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: buffs,
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
        initialBuffs,
        initialResources: { Vitality: 100 },
        resourceMaximums: { Vitality: 100 },
      })[0]

    compositeIds.forEach((skillId, index) => {
      const hitCount = index + 1
      const expectedPoetTime = componentTimes.slice(0, hitCount).reduce((total, value) => total + value, 0)
      const sober = timelineFor(skillId)
      const intoxicated = timelineFor(skillId, [{ name: "Intoxicated", stack: 1 }])
      expect(
        sober.actions.filter(action => action.type === "damage").length === hitCount &&
          intoxicated.actions.filter(action => action.type === "damage").length === hitCount,
        `${skillId} must resolve exactly ${hitCount} Poet damage actions with or without initial Intoxicated.`,
      ).toBeTruthy()
      expect(
        closeTo(sober.effectiveCastTime, expectedPoetTime + 0.626) &&
          closeTo(intoxicated.effectiveCastTime, expectedPoetTime),
        `${skillId} must insert Drink only when Intoxicated is absent.`,
      ).toBeTruthy()
    })

    const expiringTimeline = buildRotationTimeline({
      rotation: {
        name: "Expiring Intoxicated composite probe",
        steps: [
          { type: "skill", skill: "PrimeIntoxicated" },
          { type: "skill", skill: "DrunkenPoet5HitsCancel" },
        ],
      },
      skills: {
        ...skills,
        PrimeIntoxicated: {
          name: "Prime Intoxicated",
          castTime: 0,
          action: [{ type: "apply", target: "self", value: "Intoxicated", duration: 1, time: 0 }],
          tags: [],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: buffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
    })
    const expiringPoet = expiringTimeline.find(
      row => row.step.type === "skill" && row.step.skill === "DrunkenPoet5HitsCancel",
    )
    expect(
      expiringPoet?.actions.filter(action => action.type === "damage").length === 2,
      "Each Poet component must recheck Intoxicated and stop the remaining chain after it expires.",
    ).toBeTruthy()

    const legacyChain: RotationRecord = {
      name: "Legacy Poet chain",
      steps: [
        { type: "event", event: "Buff", before: { action: 2 }, buff: "Intoxicated" },
        ...[1, 2, 3, 4, 5].map((hit): RotationStep =>
          hit === 5
            ? { type: "skill", skill: `DrunkenPoet${hit}`, causesBreak: true }
            : { type: "skill", skill: `DrunkenPoet${hit}` },
        ),
        { type: "skill", skill: "LeapingToad" },
      ],
      start: { step: 3, action: 1 },
    }
    const migrated = migrateDrunkenPoetSequences(legacyChain)
    expect(
      migrated.steps.length === 3 && migrated.steps[1]?.skill === "DrunkenPoet5HitsCancel",
      "A persisted five-stage Poet chain must migrate to one composite without disturbing neighboring steps.",
    ).toBeTruthy()
    expect(
      attachedActionOf(migrated.steps[0]) === 6,
      "An event attached to legacy Poet 1 must retain its action anchor after migration.",
    ).toBeTruthy()
    expect(
      migrated.start?.step === 1 && migrated.start.action === 22,
      "A fight-start anchor inside a legacy Poet chain must retain its component action after migration.",
    ).toBeTruthy()
    expect(
      migrated.steps[1]?.type === "skill" && migrated.steps[1].causesBreak === true,
      "A break marker on legacy Poet 5 must move to the composite.",
    ).toBeTruthy()

    expect(normalizeStartAction({ step: 1, action: 10_000 }, migrated.steps)).toEqual({ step: 1 })
    expect(normalizeStartAction(migrated.start, migrated.steps)).toEqual(migrated.start)
  })
})

it("cancels Poet on its fifth hit while preserving earlier hits and per-component ping", () => {
  const rows = buildRotationTimeline({
    rotation: {
      name: "Poet interrupts",
      ping: 40,
      steps: [
        { type: "skill", skill: "DrunkenPoet5HitsCancel" },
        { type: "skill", skill: "FollowUp" },
      ],
    },
    skills: { ...mysticSkills, FollowUp: { castTime: 1, action: [] } },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: mysticBuffs,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 100 },
    resourceMaximums: { Vitality: 100 },
  })
  const poet = rows.find(row => row.rotationIndex === 0)
  expect(poet, "The composite must own the first rotation row.").toBeTruthy()
  const hits = (poet?.actions ?? []).filter(action => action.type === "damage")
  expect(hits).toHaveLength(5)
  expect(Number(hits[0].time)).toBeCloseTo(1.1499, 8)
  expect(Number(hits[1].time)).toBeCloseTo(1.6055, 8)
  expect(Number(hits[2].time)).toBeCloseTo(2.1803, 8)
  expect(Number(hits[3].time)).toBeCloseTo(2.83909, 8)
  expect(Number(hits[4].time)).toBeCloseTo(3.5702, 8)
  expect(poet?.effectiveCastTime).toBeCloseTo(3.5702, 8)
  const following = rows.find(row => row.rotationIndex === 1)
  expect(following?.startTime).toBeCloseTo(3.6102, 8)
})
