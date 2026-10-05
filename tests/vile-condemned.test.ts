import { readFile } from "node:fs/promises"

import { assert, describe, it } from "vitest"

import type {
  InnerWayEffectRule,
  TimelineBuildInput,
  TimelineRow,
  TrackedEffect,
} from "../src/calculations/rotationTimeline.ts"
import type { RotationStep } from "../src/calculations/rotationTimeline.ts"
import { actionStateAt, rowCasting } from "./helpers/timelineRows"

// Ported from script/probe/check-vile-condemned.mjs.
describe("vile-condemned", () => {
  it("Vile Condemned branch, cooldown status, start-bound requirement, and consumption checks passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const heavenwillSkills = JSON.parse(await readFile("data/skill/heavenwill-gauntlets.json", "utf8"))
    const kiteDebuffs = JSON.parse(await readFile("data/debuff/bamboocut-kite.json", "utf8"))
    const observer = {
      name: "Observe Heaven's Will",
      castTime: 0.01,
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 0.01 }],
      modifier: [],
      tags: ["General"],
    }
    const restore = {
      name: "Restore Heaven's Will",
      castTime: 0,
      action: [{ type: "setResource", value: "HeavensWill", amount: 3, time: 0 }],
      modifier: [],
      tags: ["General"],
    }
    const falcon = {
      name: "Falcon Probe",
      castTime: 0,
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 0 }],
      modifier: [],
      tags: ["Falcon"],
    }
    const build = (
      steps: RotationStep[],
      {
        initialResources = {},
        resourceRegeneration = {},
        innerWayConditions = [],
        innerWayRules = [],
        initialDebuffs = [],
      }: {
        initialResources?: TimelineBuildInput["initialResources"]
        resourceRegeneration?: TimelineBuildInput["resourceRegeneration"]
        innerWayConditions?: string[]
        innerWayRules?: InnerWayEffectRule[]
        initialDebuffs?: TrackedEffect[]
      },
    ): TimelineRow[] =>
      buildRotationTimeline({
        rotation: { name: "Vile Condemned probe", steps },
        skills: { ...heavenwillSkills, ObserveHeavensWill: observer, RestoreHeavensWill: restore, FalconProbe: falcon },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {
          Exhausted: { name: "Exhausted", duration: 10, maxStack: 1 },
          VileCondemnedEndCooldown: kiteDebuffs.VileCondemnedEndCooldown,
        },
        innerWayConditions,
        innerWayRules,
        setupEffects: [],
        weapons: ["heavenwill", "skygrasp"],
        initialResources,
        resourceRegeneration,
        resourceMaximums: { HeavensWill: 4 },
        initialDebuffs,
      })
    const damageAction = (row: TimelineRow) => {
      const action = row.actions.find(candidate => candidate.type === "damage")
      assert(action, `Expected the row at ${row.startTime} to deal damage.`)
      return action
    }
    const damageModifierEffects = (row: TimelineRow) =>
      row.actionModifierEffects?.[row.actions.indexOf(damageAction(row))] ?? []

    const weakTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      { initialResources: { HeavensWill: 2 } },
    )
    const weakCast = rowCasting(weakTimeline, "VileCondemned")
    const weakObserver = rowCasting(weakTimeline, "ObserveHeavensWill")
    assert(
      weakCast.effectiveCastTime ===
        heavenwillSkills.VileCondemnedCharge.castTime + heavenwillSkills.VileCondemnedHit.castTime,
      "Vile Condemned must use the combined charge and release cast time.",
    )
    assert(damageAction(weakCast).phyCoef === 7.2178, "Two Heaven's Will must select Vile Condemned Hit.")
    assert(
      actionStateAt(weakObserver, 0).resources.HeavensWill === 0,
      "Vile Condemned Hit must consume exactly two Heaven's Will.",
    )

    const fractionalFallbackTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      { initialResources: { HeavensWill: 3.5 } },
    )
    const fractionalFallbackCast = rowCasting(fractionalFallbackTimeline, "VileCondemned")
    const fractionalFallbackObserver = rowCasting(fractionalFallbackTimeline, "ObserveHeavensWill")
    assert(
      damageAction(fractionalFallbackCast).phyCoef === 7.2178,
      "Vile Condemned without Soaring High T0 must use the normal release.",
    )
    assert(
      actionStateAt(fractionalFallbackObserver, 0).resources.HeavensWill === 1.5,
      "Vile Condemned Hit must consume exactly two from a fractional resource value.",
    )

    const fractionalEndTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      { initialResources: { HeavensWill: 3.5 }, innerWayConditions: ["SoaringHighT0"] },
    )
    const fractionalEndCast = rowCasting(fractionalEndTimeline, "VileCondemned")
    const fractionalEndObserver = rowCasting(fractionalEndTimeline, "ObserveHeavensWill")
    assert(
      damageAction(fractionalEndCast).phyCoef === 11.7527,
      "Vile Condemned with Soaring High T0 must select End Hit at 3.5 Heaven's Will.",
    )
    assert(
      actionStateAt(fractionalEndObserver, 0).resources.HeavensWill === 0.5,
      "Vile Condemned End Hit must consume exactly three at 3.5 Heaven's Will.",
    )

    const endTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      {
        initialResources: { HeavensWill: 2.9225 },
        resourceRegeneration: { HeavensWill: 0.1 },
        innerWayConditions: [
          "SoaringHighT0",
          "SoaringHighT1",
          "SoaringHighT2",
          "SoaringHighT3",
          "SoaringHighT4",
          "SoaringHighT5",
        ],
      },
    )
    const endCast = rowCasting(endTimeline, "VileCondemned")
    assert(
      damageAction(endCast).phyCoef === 11.7527,
      "The release-start resource snapshot must select Vile Condemned End Hit at three Heaven's Will.",
    )

    const cappedTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      {
        initialResources: { HeavensWill: 4 },
        resourceRegeneration: { HeavensWill: 0.1 },
        innerWayConditions: ["SoaringHighT0"],
      },
    )
    const cappedCast = rowCasting(cappedTimeline, "VileCondemned")
    const cappedObserver = rowCasting(cappedTimeline, "ObserveHeavensWill")
    assert(
      actionStateAt(cappedCast, 0).resources.HeavensWill === 4,
      "Heaven's Will regeneration must respect the four-point cap.",
    )
    assert(
      !damageModifierEffects(cappedCast).some(effect => effect.baseDMGBonus === 0.3 || effect.critDmgBonus === 0.1),
      "Four Heaven's Will must not grant the End Hit T6 damage bonuses before Soaring High T6.",
    )
    assert(
      actionStateAt(cappedObserver, 0).resources.HeavensWill > 1,
      "Vile Condemned End Hit must consume only three Heaven's Will before Soaring High T6.",
    )

    const t6Timeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      {
        initialResources: { HeavensWill: 4 },
        innerWayConditions: [
          "SoaringHighT0",
          "SoaringHighT1",
          "SoaringHighT2",
          "SoaringHighT3",
          "SoaringHighT4",
          "SoaringHighT5",
          "SoaringHighT6",
        ],
      },
    )
    const t6Cast = rowCasting(t6Timeline, "VileCondemned")
    const t6Observer = rowCasting(t6Timeline, "ObserveHeavensWill")
    assert(
      damageModifierEffects(t6Cast).some(effect => effect.baseDMGBonus === 0.3 && effect.critDmgBonus === 0.1),
      "Four Heaven's Will with Soaring High T6 must lock the 30% base-damage and 10% Critical Damage bonuses.",
    )
    assert(
      actionStateAt(t6Observer, 0).resources.HeavensWill < 1,
      "Vile Condemned End Hit must consume all four Heaven's Will with Soaring High T6.",
    )

    const regeneratedToFourTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      {
        initialResources: { HeavensWill: 3.8 },
        resourceRegeneration: { HeavensWill: 0.1 },
        innerWayConditions: [
          "SoaringHighT0",
          "SoaringHighT1",
          "SoaringHighT2",
          "SoaringHighT3",
          "SoaringHighT4",
          "SoaringHighT5",
          "SoaringHighT6",
        ],
      },
    )
    const regeneratedToFourCast = rowCasting(regeneratedToFourTimeline, "VileCondemned")
    const regeneratedToFourObserver = rowCasting(regeneratedToFourTimeline, "ObserveHeavensWill")
    assert(
      !damageModifierEffects(regeneratedToFourCast).some(
        effect => effect.baseDMGBonus === 0.3 || effect.critDmgBonus === 0.1,
      ),
      "Reaching four Heaven's Will after release start must not activate the T6 damage bonuses.",
    )
    assert(
      actionStateAt(regeneratedToFourObserver, 0).resources.HeavensWill > 1,
      "A start-bound failed requirement must not consume the fourth Heaven's Will after later regeneration.",
    )

    const cooldownTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "RestoreHeavensWill" },
        { type: "skill", skill: "VileCondemned" },
      ],
      { initialResources: { HeavensWill: 3 }, innerWayConditions: ["SoaringHighT0"] },
    )
    const cooldownCasts = cooldownTimeline.filter(row => row.step.skill === "VileCondemned")
    const [firstCooldownCast, secondCooldownCast] = cooldownCasts
    assert(firstCooldownCast && secondCooldownCast, "The cooldown probe must release twice.")
    assert(damageAction(firstCooldownCast).phyCoef === 11.7527, "The first ready release must use End Hit.")
    assert(
      damageAction(secondCooldownCast).phyCoef === 7.2178,
      "A release while Vile Condemned End Cooldown is active must fall back to the weaker hit.",
    )

    const noSoaringHighTimeline = build([{ type: "skill", skill: "VileCondemned" }], {
      initialResources: { HeavensWill: 3 },
    })
    const noSoaringHighCast = rowCasting(noSoaringHighTimeline, "VileCondemned")
    assert(
      damageAction(noSoaringHighCast).phyCoef === 7.2178,
      "Vile Condemned End Hit must remain disabled without Soaring High T0.",
    )

    const t3Rule = {
      source: "SoaringHigh",
      tier: 3,
      requirement: [
        { target: "skillTag", value: "Falcon" },
        { target: "target", value: "Exhausted" },
      ],
      effect: {},
      trigger: {
        target: "self",
        action: [{ type: "consume", target: "self", value: "VileCondemnedEndCooldown", stack: "all" }],
      },
    }
    const t6RefundRule = {
      source: "SoaringHigh",
      tier: 6,
      requirement: [{ target: "skillTag", value: "VileCondemnedEnd" }],
      effect: {},
      trigger: { target: "self", action: [{ type: "trigger", value: "SoaringHighT6Refund" }] },
    }
    const resetTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "RestoreHeavensWill" },
        { type: "skill", skill: "FalconProbe" },
        { type: "skill", skill: "VileCondemned" },
      ],
      {
        initialResources: { HeavensWill: 3 },
        innerWayConditions: ["SoaringHighT0", "SoaringHighT1", "SoaringHighT2", "SoaringHighT3"],
        innerWayRules: [t3Rule],
        initialDebuffs: [{ name: "Exhausted", stack: 1, expiresAt: 100 }],
      },
    )
    const resetCasts = resetTimeline.filter(row => row.step.skill === "VileCondemned")
    assert(
      resetCasts.every(row => damageAction(row).phyCoef === 11.7527),
      "Soaring High T3 Falcon damage against an exhausted target must remove Vile Condemned End Cooldown.",
    )

    const refundTimeline = build(
      [
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
        { type: "skill", skill: "RestoreHeavensWill" },
        { type: "skill", skill: "FalconProbe" },
        { type: "skill", skill: "VileCondemned" },
        { type: "skill", skill: "ObserveHeavensWill" },
      ],
      {
        initialResources: { HeavensWill: 3 },
        innerWayConditions: [
          "SoaringHighT0",
          "SoaringHighT1",
          "SoaringHighT2",
          "SoaringHighT3",
          "SoaringHighT4",
          "SoaringHighT5",
          "SoaringHighT6",
        ],
        innerWayRules: [t3Rule, t6RefundRule],
        initialDebuffs: [{ name: "Exhausted", stack: 1, expiresAt: 100 }],
      },
    )
    const refundObservers = refundTimeline.filter(row => row.step.skill === "ObserveHeavensWill")
    assert(
      refundObservers[0].actionStates[0].resources.HeavensWill === 1,
      "The first Soaring High T6 End Hit must refund one Heaven's Will.",
    )
    assert(
      refundObservers[1].actionStates[0].resources.HeavensWill === 0,
      "Resetting End Hit must not reset the separate T6 refund cooldown.",
    )
  })
})
