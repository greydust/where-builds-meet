import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type {
  EditableObject,
  EffectDefinition,
  RotationRecord,
  SkillRecord,
  TrackedEffect,
} from "@/calculations/rotationTimeline"

import phalanxbaneSkillsJson from "../data/skill/phalanxbane-blade.json" with { type: "json" }
import { isClose } from "./helpers/floatEquality"
import { castStep } from "./helpers/rotationSteps"
import { asSkillRecords } from "./helpers/shippedData"
import { rowWithId } from "./helpers/timelineRows"

// Ported from script/probe/check-multi-action.mjs.
describe("multi-action", () => {
  it("Sequential multi-action timing, state, tags, modifiers, ownership, and start-bound consume checks passed", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const closeTo = (left: number | undefined, right: number) => isClose(left, right, 1e-6)
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
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
    const phalanxbaneSkills = asSkillRecords(phalanxbaneSkillsJson)
    const bundle = (
      skills: Record<string, SkillRecord>,
      rotation: RotationRecord,
      setupEffects: EditableObject[] = [],
      effectDefinitions: Record<string, EffectDefinition> = {},
      initialBuffs: TrackedEffect[] = [],
    ): RotationSimulationBundle => ({
      timeline: {
        rotation,
        skills,
        eventDefinitions: {},
        dots: {},
        effectDefinitions,
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects,
        weapons: [],
        initialBuffs,
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

    const referencedSubActions = new Set(
      Object.values(phalanxbaneSkills).flatMap(skill =>
        Array.isArray(skill.subAction)
          ? skill.subAction.flatMap(entry =>
              typeof entry === "string"
                ? [entry]
                : [entry.value, entry.fallback].flatMap(value => (Array.isArray(value) ? value : value ? [value] : [])),
            )
          : [],
      ),
    )
    referencedSubActions.forEach(skillId => {
      expect(phalanxbaneSkills[skillId], `Sub-action ${skillId} must have a skill definition.`).toBeTruthy()
      expect(
        phalanxbaneSkills[skillId].tags?.includes("SubAction"),
        `${skillId} must carry the SubAction tag.`,
      ).toBeTruthy()
    })
    Object.entries(phalanxbaneSkills)
      .filter(([, skill]) => skill.tags?.includes("SubAction"))
      .forEach(([skillId]) =>
        expect(referencedSubActions.has(skillId), `${skillId} is not referenced by a parent skill.`).toBeTruthy(),
      )

    const genericSkills = {
      Composite: {
        name: "Composite",
        castTime: 0,
        action: [],
        subAction: [{ value: "Warmup" }, { value: "Strike" }],
        modifier: [],
        tags: ["DirectDamage"],
      },
      Warmup: {
        name: "Warmup",
        castTime: 1,
        action: [{ type: "apply", target: "self", value: "Ready", time: 1 }],
        modifier: [],
        tags: ["SubAction"],
      },
      Strike: {
        name: "Strike",
        castTime: 2,
        action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 2 }],
        modifier: [
          { requirement: [{ target: "self", value: "Ready" }], effect: { castTimeMultiplier: 0.5, dmgBonus: 0.5 } },
        ],
        tags: ["DirectDamage", "SpecialTag", "SubAction"],
      },
      Following: { name: "Following", castTime: 1, action: [], modifier: [], tags: [] },
    }
    const generic = calculateRotationBaseline(
      bundle(
        genericSkills,
        { name: "Multi-action probe", steps: [castStep("Composite"), castStep("Following")] },
        [{ requirement: [{ target: "skillTag", value: "SpecialTag" }], effect: { dmgBonus: 0.25 } }],
        { Ready: { name: "Ready", duration: 10, maxStack: 1, effect: [] } },
      ),
    )
    const compositeRow = rowWithId(generic.timeline, "rotation-0")
    const followingRow = rowWithId(generic.timeline, "rotation-1")
    expect(compositeRow && followingRow, "The composite and following rotation rows must exist.").toBeTruthy()
    expect(
      closeTo(compositeRow.effectiveCastTime, 2) && closeTo(followingRow.startTime, 2),
      "Sub-actions must consume sequential time and apply their timing modifiers at their own start.",
    ).toBeTruthy()
    expect(
      compositeRow.actions.length === 2 &&
        closeTo(Number(compositeRow.actions[0]?.time), 1) &&
        closeTo(Number(compositeRow.actions[1]?.time), 2),
      "Sub-action actions must be flattened into the parent skill at their effective times.",
    ).toBeTruthy()
    expect(
      compositeRow.actionSkillTags?.[1]?.includes("SpecialTag") &&
        compositeRow.actionModifierEffects?.[1]?.some(effect => effect.dmgBonus === 0.5),
      "Each flattened action must retain its sub-action tags and modifiers.",
    ).toBeTruthy()
    expect(
      closeTo(generic.actionBreakdowns["rotation-0:1"].total, 175),
      "Damage must use both the sub-action modifier and sub-action tag requirements.",
    ).toBeTruthy()
    expect(
      generic.metrics.breakdown.casts.some(
        cast => cast.skillId === "Composite" && closeTo(cast.damage, 175) && closeTo(cast.averageCastTime, 2),
      ) && !generic.metrics.breakdown.casts.some(cast => cast.skillId === "Strike"),
      "Sub-action damage and cast time must belong to the parent skill breakdown.",
    ).toBeTruthy()

    const conditionalSkills = {
      ConditionalComposite: {
        name: "Conditional composite",
        castTime: 0,
        action: [],
        subAction: [
          { value: "LongBranch", requirement: [{ target: "self", value: "ChooseLong" }], fallback: "ShortBranch" },
        ],
        modifier: [],
        tags: [],
      },
      LongBranch: {
        name: "Long branch",
        castTime: 2,
        action: [
          { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
          { type: "damage", phyCoef: 2, attrCoef: 2, time: 1.5 },
          { type: "damage", phyCoef: 3, attrCoef: 3, time: 2 },
        ],
        modifier: [],
        tags: ["SubAction"],
      },
      ShortBranch: {
        name: "Short branch",
        castTime: 1,
        action: [{ type: "damage", phyCoef: 4, attrCoef: 4, time: 1 }],
        modifier: [],
        tags: ["SubAction"],
      },
      ConditionalFollowing: { name: "Following", castTime: 1, action: [], modifier: [], tags: [] },
    }
    const conditionalRotation = {
      name: "Conditional sub-action probe",
      steps: [castStep("ConditionalComposite"), castStep("ConditionalFollowing")],
    }
    const chooseLongDefinition = { ChooseLong: { name: "Choose long", duration: 10, maxStack: 1, effect: [] } }
    const fallbackResult = calculateRotationBaseline(bundle(conditionalSkills, conditionalRotation))
    const fallbackRow = rowWithId(fallbackResult.timeline, "rotation-0")
    const fallbackFollowing = fallbackResult.timeline.find(row => row.id === "rotation-1")
    expect(
      fallbackRow?.effectiveCastTime === 1 && fallbackFollowing?.startTime === 1,
      "A failed conditional sub-action requirement must select and time its fallback.",
    ).toBeTruthy()
    expect(
      fallbackRow.actions.filter(action => action.type === "damage").length === 1 &&
        fallbackRow.actions.filter(action => action.type === "inactive").length === 2,
      "A shorter fallback must leave its unused stable action slots inert.",
    ).toBeTruthy()
    const primaryResult = calculateRotationBaseline(
      bundle(conditionalSkills, conditionalRotation, [], chooseLongDefinition, [{ name: "ChooseLong", stack: 1 }]),
    )
    const primaryRow = primaryResult.timeline.find(row => row.id === "rotation-0")
    expect(
      primaryRow?.effectiveCastTime === 2 && primaryRow.actions.filter(action => action.type === "damage").length === 3,
      "A passing conditional sub-action requirement must select every primary action.",
    ).toBeTruthy()

    const sequenceSkills = {
      SequenceComposite: {
        name: "Sequence composite",
        castTime: 0,
        action: [],
        subAction: [
          {
            value: ["PrimaryStart", "PrimaryEnd"],
            requirement: [{ target: "self", value: "ChoosePrimary" }],
            fallback: ["FallbackStart", "FallbackEnd"],
          },
        ],
        modifier: [],
        tags: [],
      },
      PrimaryStart: {
        name: "Primary start",
        castTime: 1,
        action: [{ type: "consume", target: "self", value: "ChoosePrimary", stack: 1, time: 0 }],
        modifier: [],
        tags: ["SubAction"],
      },
      PrimaryEnd: {
        name: "Primary end",
        castTime: 2,
        action: [{ type: "damage", phyCoef: 2, attrCoef: 2, time: 2 }],
        modifier: [],
        tags: ["SubAction"],
      },
      FallbackStart: { name: "Fallback start", castTime: 0.5, action: [], modifier: [], tags: ["SubAction"] },
      FallbackEnd: {
        name: "Fallback end",
        castTime: 1,
        action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 1 }],
        modifier: [],
        tags: ["SubAction"],
      },
    }
    const sequenceRotation = { name: "Sequence probe", steps: [castStep("SequenceComposite")] }
    const primarySequence = calculateRotationBaseline(
      bundle(
        sequenceSkills,
        sequenceRotation,
        [],
        { ChoosePrimary: { name: "Choose primary", duration: 10, maxStack: 1, effect: [] } },
        [{ name: "ChoosePrimary", stack: 1 }],
      ),
    ).timeline.find(row => row.id === "rotation-0")
    expect(
      closeTo(primarySequence?.effectiveCastTime, 3) &&
        primarySequence?.actions.some(action => action.type === "damage" && action.phyCoef === 2),
      "A conditional sequence must keep its primary branch locked after its first component changes the requirement.",
    ).toBeTruthy()
    const fallbackSequence = calculateRotationBaseline(bundle(sequenceSkills, sequenceRotation)).timeline.find(
      row => row.id === "rotation-0",
    )
    expect(
      closeTo(fallbackSequence?.effectiveCastTime, 1.5) &&
        fallbackSequence?.actions.some(action => action.type === "damage" && action.phyCoef === 1),
      "A failed conditional sequence requirement must lock and execute the entire fallback branch.",
    ).toBeTruthy()

    const startBoundSkills = {
      Primer: {
        name: "Primer",
        castTime: 0,
        action: [
          { type: "apply", target: "self", value: "InnerPassion", time: 0 },
          { type: "apply", target: "self", value: "ChargeEnhancement", time: 0 },
        ],
        modifier: [],
        tags: [],
      },
      BoundComposite: {
        name: "Bound composite",
        castTime: 0,
        action: [],
        subAction: [{ value: "BoundCharge" }, { value: "BoundSlam" }],
        modifier: [],
        tags: [],
      },
      BoundCharge: {
        name: "Bound charge",
        castTime: 1,
        action: [
          {
            type: "consume",
            target: "self",
            value: { operator: "first", operand: ["InnerPassion", "ChargeEnhancement"], resolveAt: "skillStart" },
            stack: 1,
            time: 1.01,
          },
        ],
        modifier: [],
        tags: ["SubAction"],
      },
      BoundSlam: {
        name: "Bound slam",
        castTime: 0.1,
        action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
        modifier: [{ requirement: [{ target: "self", value: "InnerPassion" }], effect: { dmgBonus: 0.5 } }],
        tags: ["SubAction"],
      },
      Inspect: { name: "Inspect", castTime: 0, action: [], modifier: [], tags: [] },
    }
    const startBoundRotation = {
      name: "Start-bound consume probe",
      steps: [castStep("Primer"), castStep("BoundComposite"), castStep("Inspect")],
    }
    const startBoundDefinitions = (innerPassionDuration: number): Record<string, EffectDefinition> => ({
      InnerPassion: { name: "Inner Passion", duration: innerPassionDuration, maxStack: 1, effect: [] },
      ChargeEnhancement: { name: "Charge Enhancement", duration: 10, maxStack: 1, effect: [] },
    })
    const expiredSelection = calculateRotationBaseline(
      bundle(startBoundSkills, startBoundRotation, [], startBoundDefinitions(0.5)),
    )
    const afterExpiredSelection = expiredSelection.timeline.find(row => row.id === "rotation-2")
    expect(
      afterExpiredSelection?.buffs.has("ChargeEnhancement"),
      "A start-bound consume must not fall through when its selected effect expires before execution.",
    ).toBeTruthy()

    const liveSelection = calculateRotationBaseline(
      bundle(startBoundSkills, startBoundRotation, [], startBoundDefinitions(10)),
    )
    const liveComposite = liveSelection.timeline.find(row => row.id === "rotation-1")
    const afterLiveSelection = liveSelection.timeline.find(row => row.id === "rotation-2")
    expect(
      liveComposite?.actionModifierEffects?.[1]?.some(effect => effect.dmgBonus === 0.5),
      "The following component must snapshot its modifier before the delayed consume executes.",
    ).toBeTruthy()
    expect(
      !afterLiveSelection?.buffs.has("InnerPassion") && afterLiveSelection?.buffs.has("ChargeEnhancement"),
      "A live start-bound selection must consume only the effect selected at component start.",
    ).toBeTruthy()

    const burningPrimer = {
      name: "Burning Heart primer",
      castTime: 0,
      action: [
        { type: "apply", target: "self", value: "InnerPassion", time: 0 },
        { type: "apply", target: "self", value: "SteadfastDevotionT4", time: 0 },
      ],
      modifier: [],
      tags: [],
    }
    const burningDefinitions = {
      InnerPassion: { name: "Inner Passion", duration: 0.5, maxStack: 1, effect: [] },
      SteadfastDevotionT4: { name: "Steadfast Devotion T4", duration: 10, maxStack: 1, effect: [] },
    }
    const fastBurning = calculateRotationBaseline(
      bundle(
        { ...phalanxbaneSkills, BurningPrimer: burningPrimer },
        { name: "Fast Burning Heart probe", steps: [castStep("BurningPrimer"), castStep("PhalanxbaneHeavyCharged2")] },
        [],
        burningDefinitions,
      ),
    ).timeline.find(row => row.id === "rotation-1")
    const fastBurningDamageIndexes = fastBurning?.actions.flatMap((action, index) =>
      action.type === "damage" ? [index] : [],
    )
    expect(
      closeTo(fastBurning?.effectiveCastTime, 0.4 + 0.95 / 1.5 + 1.05),
      "Inner Passion at the end of PreCharge must lock Burning Heart's exact fast sequence timing.",
    ).toBeTruthy()
    expect(
      fastBurningDamageIndexes?.every(index =>
        fastBurning?.actionModifierEffects?.[index]?.some(effect => effect.baseDMGBonus === 0.32),
      ),
      "The fast Slam must retain Steadfast Devotion T4's Base DMG Bonus after Inner Passion expires during Charge.",
    ).toBeTruthy()

    const slowBurning = calculateRotationBaseline(
      bundle(
        {
          ...phalanxbaneSkills,
          SteadfastPrimer: {
            name: "Steadfast primer",
            castTime: 0,
            action: [{ type: "apply", target: "self", value: "SteadfastDevotionT4", time: 0 }],
            modifier: [],
            tags: [],
          },
        },
        {
          name: "Slow Burning Heart probe",
          steps: [castStep("SteadfastPrimer"), castStep("PhalanxbaneHeavyCharged2")],
        },
        [],
        burningDefinitions,
      ),
    ).timeline.find(row => row.id === "rotation-1")
    const slowBurningDamageIndexes = slowBurning?.actions.flatMap((action, index) =>
      action.type === "damage" ? [index] : [],
    )
    expect(
      closeTo(slowBurning?.effectiveCastTime, 0.4 + 0.95 + 1.05),
      "Burning Heart without Inner Passion or Charge Enhancement must lock the slow sequence.",
    ).toBeTruthy()
    expect(
      slowBurningDamageIndexes?.every(
        index => !slowBurning?.actionModifierEffects?.[index]?.some(effect => effect.baseDMGBonus === 0.32),
      ),
      "Steadfast Devotion T4 alone must not grant Slow Slam the fast-sequence Base DMG Bonus.",
    ).toBeTruthy()

    const phalanxbane = calculateRotationBaseline(
      bundle(phalanxbaneSkills, {
        name: "Phalanxbane multi-action probe",
        steps: [castStep("PhalanxbaneHeavyCharged1"), castStep("PhalanxbaneQ")],
      }),
    )
    const charged = rowWithId(phalanxbane.timeline, "rotation-0")
    const afterCharged = rowWithId(phalanxbane.timeline, "rotation-1")
    expect(charged && afterCharged, "The Phalanxbane charged and following rows must exist.").toBeTruthy()
    expect(
      closeTo(charged.effectiveCastTime, 1.4375) && closeTo(afterCharged.startTime, 1.4375),
      "Burning Heart 1st Stage must preserve its previous total cast time.",
    ).toBeTruthy()
    expect(
      charged.actions
        .filter(action => action.type === "damage")
        .every(action => charged.actionSkillTags?.[charged.actions.indexOf(action)]?.includes("SubAction")),
      "Burning Heart damage actions must use their component skill tags.",
    ).toBeTruthy()
    expect(
      phalanxbane.metrics.breakdown.casts.some(
        cast => cast.skillId === "PhalanxbaneHeavyCharged1" && cast.damage > 0,
      ) && !phalanxbane.metrics.breakdown.casts.some(cast => cast.skillId === "PhalanxbaneHeavySlam1"),
      "Burning Heart component damage must be collected under the main charged skill.",
    ).toBeTruthy()
  })
})
