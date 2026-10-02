import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type { RotationRecord, RotationStep, TimelineRow } from "@/calculations/rotationTimeline"

import { castStep, delayStep } from "./helpers/rotationSteps"

/** The single timeline row the spec reads for the ordered step at `index`. */
function rowWithIndex(rows: readonly TimelineRow[], index: number): TimelineRow {
  const row = rows.find(candidate => candidate.rotationIndex === index)
  assert(row, `Expected a timeline row for rotation step ${index}.`)
  return row
}

// Ported from script/probe/check-incremental-timeline.mjs.
describe("incremental-timeline", () => {
  it("Incremental scheduling passed: live cooldown resets, no input waits, cast/Delay/Battle End cutoffs and migration anchors", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts")
    const { migrateAutomaticDelays } = await import("../src/rotationEditing.ts")
    const base = {
      eventDefinitions: { BattleEnd: { action: [] }, Delay: { action: [] } },
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    }
    const skills = {
      Hit: {
        castTime: 1,
        cooldown: 10,
        action: [
          { type: "damage", phyCoef: 1, time: 1 },
          { type: "trigger", value: "Reset", time: 0.5 },
        ],
      },
      Reset: { castTime: 0, action: [{ type: "clearCD", value: "Hit", time: 2.5 }] },
      Tail: {
        castTime: 1,
        action: [
          { type: "damage", phyCoef: 1, time: 1 },
          { type: "damage", phyCoef: 1, time: 2 },
        ],
      },
    }
    const rotation: RotationRecord = { name: "Live reset", steps: [castStep("Hit"), castStep("Hit")] }
    const result = calculateEditorTimeline({ ...base, skills, rotation })
    assert.equal(result.rotation, rotation)
    const second = rowWithIndex(result.timeline, 1)
    assert.equal(second.startTime, 3, "A delayed trigger must wake the next waiting skill when it clears cooldown")
    assert.equal(second.cooldownWait, 2)
    assert.equal(result.timeline[0].timelineEndTime, 4)
    assert.equal(
      result.timeline.filter(row => row.rotationIndex === 1).length,
      1,
      "Obsolete retry cannot duplicate a cast",
    )
    const attached = buildRotationTimeline({
      ...base,
      skills,
      effectDefinitions: { ReadyBuff: { duration: 2, maxStack: 1 } },
      eventDefinitions: {
        ...base.eventDefinitions,
        Buff: { action: [{ type: "apply", target: "self", value: "ReadyBuff", time: 0 }] },
      },
      rotation: {
        name: "Waiting attachment",
        steps: [
          castStep("Hit"),
          { type: "event", event: "Buff", buff: "ReadyBuff", before: { action: "start" } },
          castStep("Hit"),
        ],
      },
    })
    assert.equal(rowWithIndex(attached, 1).startTime, 3, "Before-start attachments wait until the cast becomes ready")
    assert.equal(
      rowWithIndex(attached, 2).actionStates[0].buffs.get("ReadyBuff")?.stack,
      1,
      "The attachment is still active at the accepted cast's hit",
    )

    const build = (steps: RotationStep[]) =>
      buildRotationTimeline({ ...base, skills, rotation: { name: "Cutoff", steps } })
    const damageTimes = (rows: TimelineRow[]) =>
      rows.flatMap(row =>
        row.actions.flatMap(action => (action.type === "damage" ? [row.startTime + Number(action.time ?? 0)] : [])),
      )
    const tail = castStep("Tail")
    assert.deepEqual(damageTimes(build([tail])), [1], "Cast-end damage resolves, delayed tail does not")
    assert.deepEqual(damageTimes(build([tail, delayStep(1)])), [1, 2])
    assert.deepEqual(damageTimes(build([tail, { type: "event", event: "BattleEnd", startTime: 3 }])), [1, 2])
    assert.deepEqual(
      damageTimes(build([tail, { type: "event", event: "BattleEnd", startTime: 1 }])),
      [],
      "Battle End excludes equal-time damage",
    )
    const stopped = build([tail, { type: "event", event: "BattleEnd", startTime: 0.5 }, tail])
    assert(!stopped.some(row => row.rotationIndex === 2), "Future ordered casts must not expand after Battle End")
    const { withUnresolvedEditorSteps } = await import("../src/editorTimelinePreview.ts")
    const displayed = withUnresolvedEditorSteps(
      {
        rotation: { name: "Stopped", steps: [tail, { type: "event", event: "BattleEnd", startTime: 0.5 }, tail] },
        skills,
        eventDefinitions: base.eventDefinitions,
      },
      stopped,
    )
    assert.equal(
      rowWithIndex(displayed, 2).actions.length,
      0,
      "Unreached input remains editable without expanded actions",
    )
    assert.deepEqual(build([]), [])
    const resourceTail = buildRotationTimeline({
      ...base,
      skills,
      initialResources: { Energy: 0 },
      resourceMaximums: { Energy: 100 },
      resourceRegeneration: { Energy: 1 },
      rotation: { name: "Quiet cast tail", steps: [{ type: "event", event: "Delay", duration: 3 }] },
    })
    const tailRow = resourceTail[0]
    assert(tailRow?.timelineResourceSummary, "The tail row must carry its resource summary.")
    assert.equal(
      tailRow.timelineResourceSummary.Energy.final,
      3,
      "Passive regeneration includes the final quiet cast/Delay tail",
    )
    const skipped = buildRotationTimeline({
      ...base,
      skills,
      cooldownPolicy: "skip",
      rotation: { ...rotation, steps: [...rotation.steps, tail] },
    })
    assert(rowWithIndex(skipped, 1).skipped)
    assert.equal(rowWithIndex(skipped, 2).startTime, 1, "Skipping an unavailable cast advances the ordered cursor")
    assert.throws(
      () =>
        buildRotationTimeline({
          ...base,
          skills: { Loop: { castTime: 0, action: [{ type: "trigger", value: "Loop", time: 0 }] } },
          rotation: { name: "Invalid trigger cycle", steps: [{ type: "skill", skill: "Loop" }] },
        }),
      /safety limit/,
      "An unbounded same-time trigger cycle must not publish a partial result",
    )
    const timedOnly = buildRotationTimeline({
      ...base,
      skills,
      rotation: {
        name: "Timed only",
        targetType: "DummyAttack",
        steps: [{ type: "event", event: "BattleEnd", startTime: 7 }],
      },
    })
    assert.equal(
      timedOnly.filter(
        row =>
          row.step.type === "event" &&
          row.step.event === "TakeDamage" &&
          "automatic" in row.step &&
          row.step.automatic === "targetAttack",
      ).length,
      2,
    )
    const legacy = {
      name: "Legacy",
      steps: [
        tail,
        { type: "event", event: "Delay", duration: 9, automatic: "cooldown" },
        { type: "event", event: "Buff", buff: "Example", before: { action: 0 } },
        tail,
      ],
      start: { step: 3, action: 0 },
    } satisfies RotationRecord
    const migrated = migrateAutomaticDelays(legacy)
    assert(migrated.start, "The migrated rotation must keep its anchor.")
    assert.equal(migrated.start.step, 2)
    const buffStep = migrated.steps[1]
    assert(buffStep?.type === "event" && buffStep.event === "Buff", "The anchored Buff event must survive migration.")
    assert.equal(buffStep.buff, "Example")
    assert.equal(migrated.steps[2], tail)
    assert.equal(migrateAutomaticDelays(migrated), migrated)
    assert.deepEqual(
      migrateAutomaticDelays({ ...legacy, start: { step: 1 } }).start,
      { step: 1 },
      "An anchor on a removed wait falls forward to the next retained step",
    )
  })
})
