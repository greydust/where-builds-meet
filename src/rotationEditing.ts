import {
  canAnchorAttachedEvent,
  isAttachmentAnchorStep,
  type AttachedEventTarget,
  type RotationRecord,
  type RotationStep,
  type TimelineRow,
} from "./calculations/rotationTimeline";

export function resolveRotationSelection(args: {
  pathChanged: boolean;
  requestedRotationId: string | null;
  activeRotationId: string;
  editingRotationId: string;
  defaultRotationId: string;
  compatibleRotationIds: string[];
  listedRotationIds: string[];
}) {
  const compatibleIds = new Set(args.compatibleRotationIds);
  const defaultRotationId = compatibleIds.has(args.defaultRotationId)
    ? args.defaultRotationId
    : args.compatibleRotationIds[0];
  if (!defaultRotationId) return undefined;

  let activeRotationId = defaultRotationId;
  if (!args.pathChanged && compatibleIds.has(args.activeRotationId)) activeRotationId = args.activeRotationId;

  let editingRotationId = activeRotationId;
  let preserveRequestedRotation = false;
  if (args.pathChanged && args.requestedRotationId && compatibleIds.has(args.requestedRotationId)) {
    editingRotationId = args.requestedRotationId;
    preserveRequestedRotation = true;
  } else if (!args.pathChanged && args.listedRotationIds.includes(args.editingRotationId)) {
    editingRotationId = args.editingRotationId;
  }

  return {
    activeRotationId,
    editingRotationId,
    resetEditingRotation:
      editingRotationId !== args.editingRotationId || (args.pathChanged && !preserveRequestedRotation),
  };
}

export function isAutomaticCooldownDelay(step: RotationStep | undefined): boolean {
  return step?.type === "event" && step.event === "Delay" && step.automatic === "cooldown";
}

export function withoutAutomaticCooldownDelays(rotation: RotationRecord): RotationRecord {
  const retainedIndexes = new Map<number, number>();
  const steps = rotation.steps.filter((step, index) => {
    if (isAutomaticCooldownDelay(step)) return false;
    retainedIndexes.set(index, retainedIndexes.size);
    return true;
  });
  const startIndex = rotation.start ? retainedIndexes.get(rotation.start.step) : undefined;
  return {
    ...rotation,
    steps,
    ...(rotation.start && startIndex !== undefined ? { start: { ...rotation.start, step: startIndex } } : {}),
  };
}

export function withAutomaticCooldownDelays(rotation: RotationRecord, timeline: TimelineRow[]): RotationRecord {
  const waits = new Map(
    timeline.flatMap((row) =>
      row.kind === "rotation" && row.rotationIndex !== undefined && (row.cooldownWait ?? 0) > 0
        ? [[row.rotationIndex, row.cooldownWait!] as const]
        : [],
    ),
  );
  if (!waits.size) return rotation;
  const steps: RotationStep[] = [];
  let insertedBeforeStart = 0;
  rotation.steps.forEach((step, index) => {
    const wait = waits.get(index);
    if (wait !== undefined) {
      steps.push({ type: "event", event: "Delay", duration: wait, automatic: "cooldown" });
      if (rotation.start && index <= rotation.start.step) insertedBeforeStart += 1;
    }
    steps.push(step);
  });
  return {
    ...rotation,
    steps,
    ...(rotation.start ? { start: { ...rotation.start, step: rotation.start.step + insertedBeforeStart } } : {}),
  };
}

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
  const target = attachedTargetForStep(steps[stepIndex]);
  if (!target) return -1;
  for (let index = stepIndex + 1; index < steps.length; index += 1) {
    if (canAnchorAttachedEvent(steps[index], target)) return index;
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
  const target = attachedTargetForStep(step);
  if (!target) return -1;
  for (let index = stepIndex + direction; index >= 0 && index < steps.length; index += direction) {
    if (isAttachmentAnchorStep(steps[index]) && canAnchorAttachedEvent(steps[index], target)) return -1;
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
