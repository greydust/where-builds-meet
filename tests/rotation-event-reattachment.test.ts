import { expect, it } from "vitest"

import type { RotationStep } from "@/calculations/rotationTimeline"
import { resolveAttachmentTargetIndex, type RotationAttachmentTarget } from "@/rotationEditing"

const targets: RotationAttachmentTarget[] = [0, 1, 2, 3].map((time, index) => ({
  sourceRowId: `rotation-${index + 1}`,
  sourceStepIndex: index + 1,
  target: { action: 0 },
  time,
  order: index,
}))
const steps: RotationStep[] = [
  { type: "event", event: "Buff", before: { action: 0 }, startTime: 2.5, buff: "Shield" },
  ...targets.map((): RotationStep => ({ type: "skill", skill: "Probe" })),
]

it("ignores an old attachment when choosing neighbors of an edited fixed time", () => {
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 2.5)).toBe(2)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 2.5, -1)).toBe(2)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 2.5, 1)).toBe(3)
})

it("uses the resolved clock, including a nonzero battle-start offset", () => {
  const shifted = targets.map(target => ({ ...target, time: target.time! + 10 }))
  expect(resolveAttachmentTargetIndex(steps, 0, shifted, 12.5, -1)).toBe(2)
  expect(resolveAttachmentTargetIndex(steps, 0, shifted, 12.5, 1)).toBe(3)
})

it("moves to adjacent actions at an exact timestamp and stops at the timeline edges", () => {
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 2, -1)).toBe(1)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 2, 1)).toBe(3)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, -1, -1)).toBe(-1)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, -1, 1)).toBe(0)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 4, -1)).toBe(3)
  expect(resolveAttachmentTargetIndex(steps, 0, targets, 4, 1)).toBe(-1)
})

it("keeps an active attachment authoritative once the fixed time is removed", () => {
  const attached: RotationStep[] = [
    { type: "event", event: "Buff", before: { action: 0 }, buff: "Shield" },
    ...steps.slice(1),
  ]
  expect(resolveAttachmentTargetIndex(attached, 0, targets, 2.5, -1)).toBe(-1)
  expect(resolveAttachmentTargetIndex(attached, 0, targets, 2.5, 1)).toBe(1)
})
