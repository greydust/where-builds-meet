import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationRecord, SkillRecord, TimelineBuildInput } from "@/calculations/rotationTimeline"

import { isClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowWithId } from "./helpers/timelineRows"

// Ported from script/probe/check-hp-and-manual-events.mjs.
describe("hp-and-manual-events", () => {
  it("Self HP, target HP, Qi exhaustion, and manual effect duration checks passed", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { buildRotationTimeline, mergeCalculatedTimelineState } = await probeLoad<
      typeof import("../src/calculations/rotationTimeline")
    >("/src/calculations/rotationTimeline.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const generalBuffs = (await import("../data/buff/general.json")).default
    const mysticBuffs = (await import("../data/buff/mystic.json")).default
    const generalDebuffs = (await import("../data/debuff/general.json")).default
    const scripts = (await import("../data/script.json")).default
    const rawGeneralSkills = (await import("../data/skill/general.json")).default
    expect(
      mysticBuffs.DragonHeadTide.global === true,
      "Dragon Head - Tide must remain an always-active rule from the Mystic buff definitions.",
    ).toBeTruthy()
    const closeTo = (actual: number, expected: number) => isClose(actual, expected, 1e-9)
    const eventDefinitions: TimelineBuildInput["eventDefinitions"] = {
      SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
      TakeDamage: { name: "Take Damage", castTime: 0, action: [{ type: "takeDamage", time: 0 }], tags: ["Event"] },
      HP: { name: "HP", castTime: 0, action: [{ type: "setTargetHP", time: 0 }], tags: ["Event"] },
      Qi: {
        name: "Qi",
        castTime: 0,
        action: [
          { type: "setQi", time: 0 },
          {
            type: "apply",
            target: "target",
            value: "Exhausted",
            requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
            time: 0,
          },
        ],
        tags: ["Event"],
      },
      Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
      Debuff: { name: "Debuff", castTime: 0, action: [{ type: "apply", target: "target", time: 0 }], tags: ["Event"] },
      Controlled: {
        name: "Controlled",
        castTime: 0,
        action: [{ type: "apply", target: "target", value: "Controlled", time: 0 }],
        tags: ["Event"],
      },
    }
    const generalSkills = asSkillRecords(rawGeneralSkills)
    const baseInput: Omit<TimelineBuildInput, "rotation" | "skills"> = {
      eventDefinitions,
      dots: {},
      effectDefinitions: asEffectDefinitions({ ...generalBuffs, ...mysticBuffs, ...generalDebuffs }),
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    }

    const hit: SkillRecord = {
      name: "Hit",
      castTime: 2,
      action: [
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
      ],
      modifier: [],
      tags: ["DragonHeadTide", "HP"],
    }
    const noDamage: SkillRecord = {
      name: "No Damage",
      castTime: 1,
      action: [{ type: "move", distance: 1, time: 0.5 }],
      modifier: [],
      tags: [],
    }
    const hpRotation: RotationRecord = {
      name: "HP probe",
      steps: [
        { type: "event", event: "SelfHP", before: { action: 1 }, currentHPRatio: 0.8 },
        { type: "skill", skill: "Hit" },
      ],
      start: { step: 1 },
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
    const hpResult = calculateRotationBaseline({
      timeline: {
        ...baseInput,
        rotation: hpRotation,
        skills: { Hit: hit },
        setupEffects: mysticBuffs.DragonHeadTide.effect,
      },
      startAnchor: { rowId: "rotation-1" },
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
    const fullHPHit = hpResult.actionBreakdowns["rotation-1:0"].total
    const missingHPHit = hpResult.actionBreakdowns["rotation-1:1"].total
    expect(
      closeTo(missingHPHit / fullHPHit, 1.09),
      "Twenty missing HP percentage points must grant Dragon Head 9% damage at hit time.",
    ).toBeTruthy()

    const targetHPResult = calculateRotationBaseline({
      timeline: {
        ...baseInput,
        rotation: {
          name: "Target HP probe",
          targetHP: 10000,
          steps: [
            { type: "skill", skill: "Hit" },
            { type: "skill", skill: "NoDamage" },
          ],
        },
        skills: { Hit: hit, NoDamage: noDamage },
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
    const firstTargetHit = targetHPResult.actionBreakdowns["rotation-0:0"].total
    const targetHPRow = rowWithId(targetHPResult.timeline, "rotation-0")
    const noDamageRow = rowWithId(targetHPResult.timeline, "rotation-1")
    const finalTargetHPRatio = Math.max(0, 1 - (firstTargetHit * 2) / 10000)
    expect(
      closeTo(targetHPRow.actionStates[1].targetHPRatio, Math.max(0, 1 - firstTargetHit / 10000)),
      "Specified target HP must decrease by each preceding calculated damage result.",
    ).toBeTruthy()
    expect(
      closeTo(noDamageRow.targetHPRatio, finalTargetHPRatio) &&
        closeTo(noDamageRow.actionStates[0].targetHPRatio, finalTargetHPRatio),
      "A non-damaging skill and its actions must inherit target HP from the preceding damage action.",
    ).toBeTruthy()
    const structuralTargetHPTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: {
        name: "Target HP probe",
        targetHP: 10000,
        steps: [
          { type: "skill", skill: "Hit" },
          { type: "skill", skill: "NoDamage" },
        ],
      },
      skills: { Hit: hit, NoDamage: noDamage },
    })
    const displayedTargetHPTimeline = mergeCalculatedTimelineState(structuralTargetHPTimeline, targetHPResult.timeline)
    const displayedHitRow = rowWithId(displayedTargetHPTimeline, "rotation-0")
    const displayedNoDamageRow = rowWithId(displayedTargetHPTimeline, "rotation-1")
    expect(
      closeTo(displayedHitRow.actionStates[1].targetHPRatio, Math.max(0, 1 - firstTargetHit / 10000)) &&
        closeTo(displayedNoDamageRow.targetHPRatio, finalTargetHPRatio),
      "The editor's structural timeline must display target-HP snapshots from its completed calculation.",
    ).toBeTruthy()
    const implicitTargetHPTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: { name: "Implicit target HP probe", steps: [{ type: "skill", skill: "Hit" }] },
      skills: { Hit: hit },
    })
    expect(
      implicitTargetHPTimeline[0].targetHPRatio === 0.99 &&
        Object.values(implicitTargetHPTimeline[0].actionStates).every(state => state.targetHPRatio === 0.99),
      "A rotation without preset target HP must expose the implicit 99% target state to every hit.",
    ).toBeTruthy()
    const hpHitRow = rowWithId(hpResult.timeline, "rotation-1")
    expect(
      hpHitRow.actionStates[0].currentHPRatio === 1 && hpHitRow.actionStates[1].currentHPRatio === 0.8,
      "The attached HP event must change only its target and subsequent action snapshots.",
    ).toBeTruthy()

    const timedDamageTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: {
        name: "Timed damage probe",
        eventTimeReference: "battleStart",
        steps: [
          { type: "skill", skill: "Hit" },
          { type: "event", event: "TakeDamage", startTime: 1, damage: 70 },
        ],
        start: { step: 0 },
      },
      skills: { Hit: hit },
      setupEffects: [scripts.Revelry.effect],
      maxHP: 100,
    })
    const timedDamageRow = rowWithId(timedDamageTimeline, "rotation-1")
    const timedDamageHitRow = rowWithId(timedDamageTimeline, "rotation-0")
    expect(
      closeTo(timedDamageRow.startTime, 1),
      "Take Damage must resolve at its fight-relative start time.",
    ).toBeTruthy()
    expect(
      closeTo(timedDamageHitRow.actionStates[0].currentHPRatio, 1) &&
        closeTo(timedDamageHitRow.actionStates[1].currentHPRatio, 0.3),
      "Timed damage must affect only actions after its declared timestamp.",
    ).toBeTruthy()
    expect(
      timedDamageHitRow.actionStates[1].buffs.has("Revelry"),
      "Timed damage must continue to activate Take Damage setup triggers.",
    ).toBeTruthy()

    const avoidedDamageTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: {
        name: "Avoided damage probe",
        eventTimeReference: "battleStart",
        steps: [
          { type: "skill", skill: "DeflectSuccessful" },
          { type: "event", event: "TakeDamage", startTime: 0.1, damage: 20 },
          { type: "skill", skill: "PerfectDodge" },
          { type: "event", event: "TakeDamage", startTime: 0.5, damage: 20 },
          { type: "skill", skill: "Deflect" },
          { type: "event", event: "TakeDamage", startTime: 1, damage: 20 },
          { type: "skill", skill: "NoDamage" },
        ],
        start: { step: 0 },
      },
      skills: {
        DeflectSuccessful: generalSkills.DeflectSuccessful,
        PerfectDodge: generalSkills.PerfectDodge,
        Deflect: generalSkills.Deflect,
        NoDamage: noDamage,
      },
      effectDefinitions: {
        ...baseInput.effectDefinitions,
        DamageSeen: { name: "Damage Seen", duration: 10, maxStack: 1, effect: [] },
      },
      setupEffects: [
        { trigger: { event: "takeDamage", action: { type: "apply", target: "self", value: "DamageSeen" } } },
      ],
      maxHP: 100,
    })
    const successfulDeflectDamage = rowWithId(avoidedDamageTimeline, "rotation-1")
    const perfectDodgeDamage = rowWithId(avoidedDamageTimeline, "rotation-3")
    const ordinaryDeflectDamage = rowWithId(avoidedDamageTimeline, "rotation-5")
    const afterAvoidance = rowWithId(avoidedDamageTimeline, "rotation-6")
    expect(
      successfulDeflectDamage.actions[0].damage === 0 && perfectDodgeDamage.actions[0].damage === 0,
      "Take Damage inside Successful Deflect or Perfect Dodge cast time must resolve to zero.",
    ).toBeTruthy()
    expect(
      ordinaryDeflectDamage.actions[0].damage === 20 && closeTo(afterAvoidance.currentHPRatio, 0.8),
      "Ordinary Deflect must not avoid Take Damage.",
    ).toBeTruthy()
    expect(
      !ordinaryDeflectDamage.buffs.has("DamageSeen") && afterAvoidance.buffs.has("DamageSeen"),
      "Avoided damage must not fire take-damage triggers, while a real hit still must.",
    ).toBeTruthy()

    const takeDamageAttachmentTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: {
        name: "Take Damage attachment probe",
        eventTimeReference: "battleStart",
        steps: [
          { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0 },
          { type: "event", event: "TakeDamage", startTime: 1, damage: 70 },
          { type: "skill", skill: "Hit" },
        ],
        start: { step: 2 },
      },
      skills: { Hit: hit },
      maxHP: 100,
    })
    const attachedQiRow = rowWithId(takeDamageAttachmentTimeline, "rotation-0")
    const takeDamageAnchorRow = rowWithId(takeDamageAttachmentTimeline, "rotation-1")
    expect(
      attachedQiRow.sourceRowId === takeDamageAnchorRow.id &&
        closeTo(attachedQiRow.startTime, takeDamageAnchorRow.startTime),
      "An attached Qi event must resolve against the following fixed-time Take Damage event.",
    ).toBeTruthy()
    expect(
      takeDamageAnchorRow.actionStates[0].targetQiRatio === 0,
      "An event attached before Take Damage must update state before Take Damage resolves.",
    ).toBeTruthy()

    const skillAttachmentPastTakeDamageTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: {
        name: "Skill attachment after Take Damage probe",
        eventTimeReference: "battleStart",
        steps: [
          { type: "event", event: "Qi", before: { action: 1 }, targetQiRatio: 0 },
          { type: "event", event: "TakeDamage", startTime: 1, damage: 70 },
          { type: "skill", skill: "Hit" },
        ],
        start: { step: 2 },
      },
      skills: { Hit: hit },
      maxHP: 100,
    })
    const skillAttachedQiRow = rowWithId(skillAttachmentPastTakeDamageTimeline, "rotation-0")
    const skillAnchorPastTakeDamageRow = rowWithId(skillAttachmentPastTakeDamageTimeline, "rotation-2")
    expect(
      skillAttachedQiRow.sourceRowId === skillAnchorPastTakeDamageRow.id &&
        closeTo(skillAttachedQiRow.startTime, skillAnchorPastTakeDamageRow.startTime + 1),
      "An action target unsupported by Take Damage must continue to the following skill anchor.",
    ).toBeTruthy()

    const durationProbe = {
      name: "Duration probe",
      castTime: 13,
      action: [
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 2.9 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 3.1 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 9.9 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 10.1 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 12.4 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 12.6 },
      ],
      modifier: [],
      tags: [],
    }
    const manualTimeline = buildRotationTimeline({
      ...baseInput,
      rotation: {
        name: "Manual effects",
        eventTimeReference: "battleStart",
        steps: [
          { type: "event", event: "Buff", before: { action: "start" }, buff: "Flute" },
          // The fight starts on the debuffing event, so Controlled is applied
          // in-combat. A prepull Debuff event would be rejected: nothing reaches
          // the target before the fight-start anchor.
          { type: "event", event: "Debuff", before: { action: "start" }, debuff: "Controlled" },
          { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 },
          { type: "skill", skill: "Probe" },
        ],
        start: { step: 1 },
      },
      skills: { Probe: durationProbe },
    })
    const probeRow = rowWithId(manualTimeline, "rotation-3")
    expect(
      probeRow.actionStates[1].debuffs.has("Controlled"),
      "A manual Debuff event must use Controlled's default duration.",
    ).toBeTruthy()
    expect(
      !probeRow.actionStates[2].debuffs.has("Controlled"),
      "Controlled must expire at its data-defined duration.",
    ).toBeTruthy()
    expect(
      probeRow.actionStates[3].debuffs.has("Exhausted"),
      "Exhausted must use its data-defined default duration.",
    ).toBeTruthy()
    expect(
      !probeRow.actionStates[4].debuffs.has("Exhausted"),
      "Exhausted must expire after its data-defined default duration.",
    ).toBeTruthy()
    expect(
      probeRow.actionStates[3].targetQiRatio === 0,
      `Qi zero must remain active while Exhausted is active (saw ${probeRow.actionStates[3].targetQiRatio}).`,
    ).toBeTruthy()
    expect(probeRow.actionStates[4].targetQiRatio === 1, "Exhausted expiration must restore Qi to 100%.").toBeTruthy()
    expect(
      probeRow.actionStates[5].buffs.has("Flute"),
      "A manual Buff event must use the selected buff's default duration.",
    ).toBeTruthy()
    expect(
      !probeRow.actionStates[6].buffs.has("Flute"),
      "The manually applied buff must expire at its data-defined duration.",
    ).toBeTruthy()
  })
})
