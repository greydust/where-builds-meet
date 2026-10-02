import { assert, describe, it } from "vitest"

import type { RotationStep } from "@/calculations/rotationTimeline"
import type { RotationAttachmentTarget } from "@/rotationEditing"

// Ported from script/probe/check-rotation-event-order.mjs.
describe("rotation-event-order", () => {
  it("Rotation event ordering checks passed", async () => {
    const {
      attachedEventSiblingIndex,
      isRuntimeAttachedEvent,
      moveEventToAttachmentTarget,
      normalizeRotationStart,
      reorderAttachedEventWithinTarget,
      resolveAttachmentTargetIndex,
    } = await import("../src/rotationEditing.ts")
    const target = { action: 0 }
    const steps: RotationStep[] = [
      { type: "event", event: "Move", before: target, distance: 3 },
      { type: "event", event: "Buff", before: target, buff: "Cadence" },
      { type: "event", event: "Debuff", before: target, debuff: "Vulnerable" },
      { type: "skill", skill: "Avalanche" },
    ]
    const movedUp = reorderAttachedEventWithinTarget(steps, 1, -1)
    assert(movedUp?.movedIndex === 0, "The middle event should move above its same-target sibling.")
    assert(movedUp?.steps[0]?.event === "Buff", "The reordered event should occupy its sibling's position.")
    assert(movedUp?.steps[3]?.skill === "Avalanche", "Reordering events must not move their anchor skill.")

    const movedDown = reorderAttachedEventWithinTarget(steps, 1, 1)
    assert(movedDown?.movedIndex === 2, "The middle event should move below its same-target sibling.")
    assert(movedDown?.steps[2]?.event === "Buff", "Downward reordering should preserve the event itself.")

    const afterEventSteps: RotationStep[] = [
      { type: "event", event: "Qi", after: target, targetQiRatio: 0 },
      { type: "event", event: "Buff", before: target, buff: "Cadence" },
      { type: "skill", skill: "Avalanche" },
    ]
    assert(
      attachedEventSiblingIndex(afterEventSteps, 0, 1) === -1,
      "Before- and after-action events must remain separate ordering groups.",
    )

    const takeDamageSteps: RotationStep[] = [
      { type: "event", event: "Qi", before: target, targetQiRatio: 0 },
      { type: "event", event: "Buff", before: target, buff: "Cadence" },
      { type: "event", event: "TakeDamage", startTime: 1, damage: 100 },
      { type: "skill", skill: "Avalanche" },
    ]
    const movedAroundTakeDamage = reorderAttachedEventWithinTarget(takeDamageSteps, 0, 1)
    assert(
      movedAroundTakeDamage?.steps[1]?.event === "Qi",
      "Attached events must share and reorder within a fixed-time Take Damage anchor.",
    )
    const dragonTarget = { action: 8 }
    const dragonEventsAcrossTakeDamage: RotationStep[] = [
      { type: "event", event: "Buff", before: dragonTarget, buff: "SurgingWaves" },
      { type: "event", event: "SelfHP", before: dragonTarget, currentHPRatio: 0.2 },
      { type: "event", event: "TakeDamage", startTime: 1, damage: 1 },
      { type: "skill", skill: "DragonHeadTide" },
    ]
    assert(
      attachedEventSiblingIndex(dragonEventsAcrossTakeDamage, 0, 1) === 1,
      "Take Damage must not split events targeting an action that only the following skill provides.",
    )

    const afterStartSteps: RotationStep[] = [
      { type: "event", event: "Qi", after: { action: "start" }, targetQiRatio: 0 },
      { type: "skill", skill: "NoActionAnchor" },
    ]
    const afterStartTargets: RotationAttachmentTarget[] = [
      { sourceRowId: "rotation-1", sourceStepIndex: 1, target: { action: "start" }, time: 4, order: 1000 },
      { sourceRowId: "rotation-2", sourceStepIndex: 2, target: { action: 0 }, time: 5, order: 2000 },
    ]
    assert.equal(
      resolveAttachmentTargetIndex(afterStartSteps, 0, afterStartTargets),
      0,
      "An after-start attachment must resolve to the start target instead of jumping to the first damage action.",
    )

    const fixedQi: RotationStep = { type: "event", event: "Qi", before: { action: 0 }, startTime: 3, targetQiRatio: 0 }
    assert.equal(isRuntimeAttachedEvent(fixedQi), false, "Fixed metadata must not own runtime attachment behavior.")
    assert.deepEqual(
      normalizeRotationStart({ step: 0 }, [fixedQi, { type: "skill", skill: "Probe" }]),
      { step: 1 },
      "A fixed event must not be selected as battle start.",
    )
    assert.equal(
      attachedEventSiblingIndex(
        [fixedQi, { type: "event", event: "Buff", before: { action: 0 }, buff: "Cadence" }],
        0,
        1,
      ),
      -1,
      "A fixed-time event must use its arrow to reattach instead of reordering with a sibling.",
    )
    assert.equal(
      attachedEventSiblingIndex(
        [
          fixedQi,
          { type: "event", event: "Buff", before: { action: 0 }, buff: "Cadence" },
          { type: "skill", skill: "Probe" },
        ],
        1,
        -1,
      ),
      -1,
      "An attached event must not reorder across an independently timed sibling.",
    )
    const movedFixedQi = moveEventToAttachmentTarget(
      [fixedQi, { type: "skill", skill: "First" }, { type: "skill", skill: "Second" }],
      0,
      afterStartTargets[0]!,
      "before",
    )
    const movedQi = movedFixedQi?.steps[0]
    assert.equal(movedFixedQi?.movedIndex, 0)
    assert(movedQi, "Moving a fixed event must leave it as the first step.")
    assert.equal("event" in movedQi && movedQi.event, "Qi")
    assert.deepEqual("before" in movedQi ? movedQi.before : undefined, { action: "start" })
    assert(!Object.hasOwn(movedQi, "startTime"))
  })
})
