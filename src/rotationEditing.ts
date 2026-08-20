import type { AttachedEventTarget, RotationStep } from "./calculations/rotationTimeline";

export type AttachedEventPhase = "before" | "after";

export function attachedEventPhase(step: RotationStep | undefined): AttachedEventPhase | undefined {
  if (step?.type !== "event") return undefined;
  if ("before" in step) return "before";
  if ("after" in step) return "after";
  return undefined;
}

export function attachedTargetForStep(step: RotationStep | undefined): AttachedEventTarget | undefined {
  switch (attachedEventPhase(step)) {
    case "before":
      return step && "before" in step ? step.before : undefined;
    case "after":
      return step && "after" in step ? step.after : undefined;
    default:
      return undefined;
  }
}

function targetsMatch(left: AttachedEventTarget, right: AttachedEventTarget) {
  return left.action === right.action && left.trigger === right.trigger;
}

function attachedEventAnchorIndex(steps: RotationStep[], stepIndex: number) {
  for (let index = stepIndex + 1; index < steps.length; index += 1) {
    if (steps[index]?.type === "skill") return index;
  }
  return -1;
}

function sameAttachedEventTarget(steps: RotationStep[], leftIndex: number, rightIndex: number) {
  const left = steps[leftIndex];
  const right = steps[rightIndex];
  const leftTarget = attachedTargetForStep(left);
  const rightTarget = attachedTargetForStep(right);
  return Boolean(
    leftTarget &&
    rightTarget &&
    attachedEventPhase(left) === attachedEventPhase(right) &&
    attachedEventAnchorIndex(steps, leftIndex) === attachedEventAnchorIndex(steps, rightIndex) &&
    targetsMatch(leftTarget, rightTarget),
  );
}

export function attachedEventSiblingIndex(steps: RotationStep[], stepIndex: number, direction: -1 | 1) {
  const step = steps[stepIndex];
  if (!attachedTargetForStep(step)) return -1;
  for (let index = stepIndex + direction; index >= 0 && index < steps.length; index += direction) {
    if (steps[index]?.type === "skill") return -1;
    if (sameAttachedEventTarget(steps, stepIndex, index)) return index;
  }
  return -1;
}

export function reorderAttachedEventWithinTarget(
  steps: RotationStep[],
  stepIndex: number,
  direction: -1 | 1,
): { steps: RotationStep[]; movedIndex: number } | undefined {
  const siblingIndex = attachedEventSiblingIndex(steps, stepIndex, direction);
  if (siblingIndex < 0) return undefined;
  const next = [...steps];
  [next[stepIndex], next[siblingIndex]] = [next[siblingIndex], next[stepIndex]];
  return { steps: next, movedIndex: siblingIndex };
}
