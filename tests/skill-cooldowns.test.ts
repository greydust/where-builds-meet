import { describe, expect, it } from "vitest"

import type { RotationRecord, SkillRecord, TimelineBuildInput, TimelineRow } from "@/calculations/rotationTimeline"

import { castStep } from "./helpers/rotationSteps"
import { asSkillRecords } from "./helpers/shippedData"

// Ported from script/probe/check-skill-cooldowns.mjs.
describe("skill-cooldowns", () => {
  it("Skill and group cooldown windows, multiple uses, editor waits, and cooldown modifiers passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts")
    const snowpartingSkills = asSkillRecords((await import("../data/skill/snowparting-blade.json")).default)
    const phalanxbaneSkills = asSkillRecords((await import("../data/skill/phalanxbane-blade.json")).default)
    const mysticSkills = asSkillRecords((await import("../data/skill/mystic.json")).default)
    const build = (
      rotation: RotationRecord,
      skills: Record<string, SkillRecord>,
      innerWayConditions: string[] = [],
      overrides: Partial<TimelineBuildInput> = {},
    ): TimelineRow[] =>
      buildRotationTimeline({
        rotation,
        skills,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
        cooldownPolicy: "wait",
        ...overrides,
      })

    const tabRows = build(
      {
        name: "Heng Tab cooldown",
        ping: 40,
        steps: Array.from({ length: 3 }, () => castStep("SnowpartingConversion")),
      },
      snowpartingSkills,
    ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    ;[0.04, 3.08, 6.12].forEach((time, index) => expect(tabRows[index].startTime).toBeCloseTo(time, 8))
    expect(tabRows[1].cooldownWait).toBeCloseTo(2.44, 8)

    const multiUseSkills = {
      First: { castTime: 1, cooldown: 12, cooldownUses: 2, action: [] },
      Second: { castTime: 1, cooldown: 12, cooldownUses: 2, action: [] },
    }
    const multiUseRotation = {
      name: "Per-skill multi-use cooldown probe",
      steps: [castStep("First"), castStep("Second"), castStep("First"), castStep("First")],
    }
    const multiUseTimeline = build(multiUseRotation, multiUseSkills)
    const explicitRows = multiUseTimeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(
      explicitRows[0].startTime === 0,
      "The first cast must start its cooldown window without waiting.",
    ).toBeTruthy()
    expect(
      explicitRows[1].startTime === 1,
      "A different skill must maintain an independent cooldown window.",
    ).toBeTruthy()
    expect(explicitRows[2].startTime === 2, "The second allowed cast of First must remain available.").toBeTruthy()
    expect(
      explicitRows[3].startTime === 12,
      "The third cast of First must wait for its own window to end.",
    ).toBeTruthy()
    expect(
      explicitRows[3].cooldownWait === 9,
      "The timeline must expose the exact wait required by the third cast.",
    ).toBeTruthy()

    const editor = calculateEditorTimeline({
      rotation: multiUseRotation,
      skills: multiUseSkills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    expect(
      editor.rotation === multiUseRotation,
      "Cooldown waits must not rewrite authored rotation steps.",
    ).toBeTruthy()
    expect(
      editor.timeline.find(row => row.rotationIndex === 3)?.startTime === 12,
      "Editor uses live cooldown timing.",
    ).toBeTruthy()

    const delays = (rows: TimelineRow[]) =>
      rows.filter(row => row.step.type === "event" && row.step.event === "Delay" && row.step.automatic === "cooldown")
    /** The duration of the single automatic cooldown wait in `rows`. */
    const waitDurationOf = (rows: TimelineRow[]): number | undefined => {
      const [wait] = delays(rows)
      return wait?.step.type === "event" && wait.step.event === "Delay" ? wait.step.duration : undefined
    }

    const editorWait = delays(editor.timeline)
    expect(
      editorWait.length === 1 && editorWait[0].startTime === 3 && waitDurationOf(editor.timeline) === 9,
      "The editor must show the elapsed cooldown wait as one automatic Delay row.",
    ).toBeTruthy()
    expect(
      editorWait[0].rotationIndex === undefined &&
        editorWait[0].actions.length === 0 &&
        editorWait[0].effectiveCastTime === 9,
      "Generated waits have no editable step index or combat actions and display their actual duration.",
    ).toBeTruthy()
    const { mergeCalculatedTimelineState } = await import("../src/calculations/rotationTimeline.ts")
    expect(
      delays(mergeCalculatedTimelineState(editor.timeline, multiUseTimeline)).length === 1,
      "Merging calculated results retains exactly one displayed wait.",
    ).toBeTruthy()
    const waitSkills = { Wait: { castTime: 1, cooldown: 10, action: [] } }
    const waitSteps = [castStep("Wait"), castStep("Wait")]
    const resetRows = build(
      { name: "Reset during wait", steps: [...waitSteps, { type: "event", event: "Controlled", startTime: 4 }] },
      waitSkills,
      [],
      { eventDefinitions: { Controlled: { castTime: 0, action: [{ type: "clearCD", value: "Wait", time: 0 }] } } },
    )
    expect(
      delays(resetRows).length === 1 &&
        waitDurationOf(resetRows) === 3 &&
        resetRows.find(row => row.rotationIndex === 1)?.startTime === 4,
      "An early cooldown reset shortens the displayed wait without delaying the accepted cast.",
    ).toBeTruthy()
    const cutoffRows = build(
      { name: "End during wait", steps: [...waitSteps, { type: "event", event: "BattleEnd", startTime: 5 }] },
      waitSkills,
      [],
      { eventDefinitions: { BattleEnd: { castTime: 0, action: [] } } },
    )
    expect(
      delays(cutoffRows).length === 1 && delays(cutoffRows)[0].startTime === 1 && waitDurationOf(cutoffRows) === 4,
      "An unfinished cooldown wait ends at Battle End.",
    ).toBeTruthy()
    const { withUnresolvedEditorSteps } = await import("../src/editorTimelinePreview.ts")
    const cutoffPreview = withUnresolvedEditorSteps(
      {
        rotation: {
          name: "End during wait",
          steps: [...waitSteps, { type: "event", event: "BattleEnd", startTime: 5 }],
        },
        skills: waitSkills,
        eventDefinitions: {},
      },
      cutoffRows,
    )
    expect(
      cutoffPreview.some(row => row.rotationIndex === 1 && row.skipped),
      "A generated wait must not hide the editor placeholder for the cast cut off by Battle End.",
    ).toBeTruthy()
    expect(
      delays(build({ name: "Skip unavailable", steps: waitSteps }, waitSkills, [], { cooldownPolicy: "skip" }))
        .length === 0,
      "Skipped casts do not produce wait rows.",
    ).toBeTruthy()

    const sharedCooldownSkills = {
      Short: { castTime: 1, cooldown: 10, cooldownGroup: "Shared", action: [] },
      Long: { castTime: 2, cooldown: 10, cooldownGroup: "Shared", action: [] },
    }
    const sharedCooldownRows = build(
      { name: "Shared cooldown probe", steps: [castStep("Short"), castStep("Long")] },
      sharedCooldownSkills,
    ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(
      sharedCooldownRows[1].startTime === 10,
      "Different skill variants in one group must share a cooldown window.",
    ).toBeTruthy()

    const legion = {
      Legion: {
        castTime: 0.5,
        cooldown: 20,
        action: [],
        modifier: [{ requirement: [{ target: "self", value: "SteadfastDevotionT1" }], effect: { cooldown: 1 } }],
      },
    }
    const legionRotation = { name: "Cooldown modifier probe", steps: [castStep("Legion"), castStep("Legion")] }
    const ordinaryLegion = build(legionRotation, legion).filter(row => row.step.type === "skill")
    const steadfastLegion = build(legionRotation, legion, ["SteadfastDevotionT1"]).filter(
      row => row.step.type === "skill",
    )
    expect(ordinaryLegion[1]?.startTime === 20, "Legion Summon must normally wait for its full cooldown.").toBeTruthy()
    expect(
      steadfastLegion[1]?.startTime === 1,
      "Steadfast T1 must override Legion Summon's cooldown to one second.",
    ).toBeTruthy()

    const actualSkills = { ...snowpartingSkills, ...phalanxbaneSkills }
    const actualRows = (skillIds: string[], conditions: string[] = []) =>
      build(
        { name: "Data cooldown probe", steps: skillIds.map(skill => castStep(skill)) },
        actualSkills,
        conditions,
      ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    const stabSequence = actualRows(["SnowpartingQ", "SnowpartingQStab", "SnowpartingQ"])
    const [firstStab, secondStab, thirdStab] = stabSequence
    expect(
      firstStab &&
        secondStab &&
        thirdStab &&
        Math.abs(thirdStab.startTime - (secondStab.startTime + secondStab.effectiveCastTime)) < 0.000001,
      "Stab must not consume a General's Bane use.",
    ).toBeTruthy()
    expect(
      actualRows(["SnowpartingQ", "SnowpartingQ", "SnowpartingQ"])[2]?.startTime === 12,
      "The third cast of the same General's Bane definition must wait for its two-use window.",
    ).toBeTruthy()
    expect(
      actualRows(["SnowpartingSpecial", "SnowpartingSpecial"])[1]?.startTime === 20,
      "The real Fleeting Trace definition must enforce its cooldown.",
    ).toBeTruthy()
    expect(
      actualRows(["PhalanxbaneQ", "PhalanxbaneQ"])[1]?.startTime === 15,
      "The real Total Annihilation definition must enforce its cooldown.",
    ).toBeTruthy()
    expect(
      actualRows(["PhalanxbaneSpecial", "PhalanxbaneSpecial"])[1]?.startTime === 20 &&
        actualRows(["PhalanxbaneSpecial", "PhalanxbaneSpecial"], ["SteadfastDevotionT1"])[1]?.startTime === 1.167,
      "The real Legion Summon definition must use its normal cooldown and Steadfast T1 override.",
    ).toBeTruthy()

    const mysticRows = (first: string, second: string) =>
      build(
        {
          name: "Mystic shared cooldown probe",
          steps: [
            { type: "skill", skill: first },
            { type: "skill", skill: second },
          ],
        },
        mysticSkills,
      ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    const sharedCooldowns = [
      ["SoaringSpin1", "SoaringSpin2", 12],
      ["DragonsBreath1", "DragonsBreath2", 6],
      ["DragonsBreathSmolder1", "DragonsBreathSmolder2", 12],
      ["FluteOfTheTidesCancel", "FluteOfTheTides", 25],
      ["BurstingNine", "BurstingNine2Shots", 30],
    ] as Array<[string, string, number]>
    sharedCooldowns.forEach(([first, second, readyAt]) => {
      expect(
        mysticRows(first, second)[1]?.startTime === readyAt,
        `${first} and ${second} must share their ${readyAt}-second cooldown window.`,
      ).toBeTruthy()
    })
  })
})
