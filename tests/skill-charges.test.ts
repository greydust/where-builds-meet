import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { describe, it } from "vitest"

import type { RotationStep, TimelineBuildInput, TimelineRow } from "@/calculations/rotationTimeline"

import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { castStep, delayStep } from "./helpers/rotationSteps"
import { asSkillRecords, rankTalentEffects } from "./helpers/shippedData"

// Ported from script/probe/check-skill-charges.mjs.
describe("skill-charges", () => {
  it("Independent charge recovery, partial/full resets, shared groups, readiness, triggered casts, talent cooldown, and editor waits passed", async () => {
    const clear = (charges?: number) => ({
      type: "clearCD",
      value: "AddledMind",
      ...(charges === undefined ? {} : { charges }),
      time: 0,
    })

    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts")
    const general = JSON.parse(await readFile("data/skill/general.json", "utf8"))
    const talent = JSON.parse(await readFile("data/martial-art/infernal-twinblades.json", "utf8"))
    // Isolate cooldown scheduling from the skill's attack duration and hit events.
    const charged = {
      ...asSkillRecords(JSON.parse(await readFile("data/skill/infernal-twinblades.json", "utf8"))).AddledMind,
      castTime: 0,
      action: [],
      modifier: [],
    }
    const skills = {
      ...asSkillRecords(general),
      AddledMind: charged,
      RestoreOne: { castTime: 0, action: [clear(1)] },
      RestoreAll: { castTime: 0, action: [clear()] },
      CheckReady: {
        castTime: 0,
        action: [
          {
            type: "apply",
            target: "self",
            value: "Ready",
            time: 0,
            requirement: [{ target: "skillCooldown", value: "AddledMind", comparison: "ready" }],
          },
        ],
      },
      Observe: { castTime: 0, action: [] },
    }
    const input = (steps: RotationStep[], extra: Partial<TimelineBuildInput> = {}): TimelineBuildInput => ({
      rotation: { name: "Independent charge probe", steps },
      skills: withImmediateAttacks(skills),
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Ready: { duration: 0.1 } },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      ...extra,
    })
    const build = (
      steps: RotationStep[],
      extra?: Partial<TimelineBuildInput>,
      procRoll?: () => number,
    ): TimelineRow[] => buildRotationTimeline(input(steps, extra), procRoll)
    const times = (rows: TimelineRow[]) =>
      rows.filter(row => row.step.skill === "AddledMind" && !row.skipped).map(row => row.startTime)
    const staggered = [
      castStep("AddledMind"),
      delayStep(2),
      castStep("AddledMind"),
      delayStep(2),
      castStep("AddledMind"),
    ]
    const more = Array.from({ length: 3 }, () => castStep("AddledMind"))
    assert.deepEqual(
      times(build([...staggered, ...more])),
      [0, 2, 4, 15, 17, 19],
      "Each spent charge recovers 15 seconds after its own cast",
    )

    const restoredSteps = [...staggered, delayStep(1), castStep("RestoreOne"), ...more]
    assert.deepEqual(
      times(build(restoredSteps)),
      [0, 2, 4, 5, 17, 19],
      "Restoring one charge preserves both other timers and consumes the next recovering charge",
    )
    assert.deepEqual(
      times(build([...staggered, delayStep(1), castStep("RestoreAll"), ...more, castStep("AddledMind")])),
      [0, 2, 4, 5, 5, 5, 20],
      "Unqualified clearCD restores every charge and new uses start new timers",
    )
    assert.deepEqual(
      times(build([castStep("RestoreOne"), castStep("RestoreOne"), ...more, castStep("AddledMind")])),
      [0, 0, 0, 15],
      "Restoring at full capacity cannot bank extra charges",
    )
    assert.deepEqual(
      times(build([...staggered, delayStep(11), castStep("RestoreOne"), ...more])),
      [0, 2, 4, 15, 15, 19],
      "Recovery at the reset boundary happens naturally before an additional charge is restored",
    )

    const readyRows = build([
      castStep("AddledMind"),
      castStep("CheckReady"),
      castStep("Observe"),
      delayStep(0.2),
      castStep("AddledMind"),
      castStep("AddledMind"),
      castStep("CheckReady"),
      castStep("Observe"),
      castStep("RestoreOne"),
      castStep("CheckReady"),
      castStep("Observe"),
    ])
    assert.deepEqual(
      readyRows.filter(row => row.step.skill === "Observe").map(row => row.buffs.has("Ready")),
      [true, false, true],
      "skillCooldown requirements reflect remaining and restored charges",
    )

    const grouped = {
      ...skills,
      AddledMind: { ...charged, cooldownGroup: "SharedCharges" },
      Variant: { ...charged, cooldownGroup: "SharedCharges" },
      RestoreOne: { castTime: 0, action: [{ ...clear(1), value: "Variant" }] },
    }
    const groupedRows = build(
      [
        castStep("AddledMind"),
        delayStep(2),
        castStep("Variant"),
        delayStep(2),
        castStep("AddledMind"),
        delayStep(1),
        castStep("RestoreOne"),
        castStep("Variant"),
        castStep("AddledMind"),
      ],
      { skills: grouped },
    )
    assert.deepEqual(
      groupedRows.filter(row => ["AddledMind", "Variant"].includes(row.step.skill ?? "")).map(row => row.startTime),
      [0, 2, 4, 5, 17],
      "Variants share charges and restore by the same cooldown group",
    )

    const trigger = (time: number) => ({ type: "trigger", value: "AddledMind", time })
    const triggeredRows = build([castStep("Driver")], {
      skills: {
        ...skills,
        Driver: {
          castTime: 20,
          action: [
            trigger(0),
            trigger(2),
            trigger(4),
            trigger(5),
            { ...clear(1), time: 6 },
            trigger(6),
            trigger(7),
            trigger(17),
          ],
        },
      },
    })
    assert.deepEqual(
      times(triggeredRows),
      [0, 2, 4, 6, 17],
      "Triggers consume the same independent charges and are rejected instead of waiting",
    )
    const mixedRows = build([castStep("Driver"), ...more], {
      skills: { ...skills, Driver: { castTime: 4, action: [trigger(0), trigger(2)] } },
    })
    assert.deepEqual(times(mixedRows), [0, 2, 4, 15, 17], "Explicit casts share the pool consumed by triggers")

    const waiting = build([...more, castStep("AddledMind"), castStep("AddledMind")], {
      skills: {
        ...skills,
        AddledMind: { ...charged, action: [{ type: "trigger", value: "DelayedReset", time: 0 }] },
        DelayedReset: { castTime: 0, cooldown: 30, action: [{ ...clear(1), time: 5 }] },
      },
    })
    assert.deepEqual(
      times(waiting),
      [0, 0, 0, 5, 15],
      "A partial reset wakes one waiting cast without duplicating it or restoring a second charge",
    )
    const skipped = build([...more, castStep("AddledMind")], { cooldownPolicy: "skip" })
    assert.equal(skipped.at(-1)?.skipped, true, "Skip policy remains available for depleted charges")

    const talentEffects = rankTalentEffects(talent.talent[13])
    const dodgeSteps = [
      ...more,
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
      delayStep(15),
      castStep("AddledMind"),
      castStep("AddledMind"),
      castStep("AddledMind"),
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
    ]
    for (const procRoll of [undefined, () => 0.2]) {
      assert.deepEqual(
        times(build(dodgeSteps, { setupEffects: talentEffects }, procRoll)),
        [0, 0, 0, 0, 15, 30, 30, 30, 30, 45],
        "Actual talent restores exactly one charge with its shared 30-second cooldown in expected and sampled timelines",
      )
    }
    const editorInput = input(restoredSteps)
    const editor = calculateEditorTimeline(editorInput)
    assert.equal(editor.rotation, editorInput.rotation, "Charge waits never rewrite authored rotation steps")
    assert.deepEqual(times(editor.timeline), [0, 2, 4, 5, 17, 19], "Editor uses the shared charge timeline")

    const modified = build([...staggered, ...more], {
      skills: { ...skills, AddledMind: { ...charged, modifier: [{ requirement: [], effect: { cooldown: 8 } }] } },
    })
    assert.deepEqual(
      times(modified),
      [0, 2, 4, 8, 10, 12],
      "Cast-start cooldown modifiers apply to each independent recovery",
    )
  })
})
