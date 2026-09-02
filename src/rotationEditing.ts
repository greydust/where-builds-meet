import {
  canAnchorAttachedEvent,
  isAttachmentAnchorStep,
  type AttachedEventTarget,
  type RotationRecord,
  type RotationStep,
  type TimelineRow,
} from "./calculations/rotationTimeline";

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

const legacyDrunkenPoetSequence = [
  "DrunkenPoet1",
  "DrunkenPoet2",
  "DrunkenPoet3",
  "DrunkenPoet4",
  "DrunkenPoet5",
] as const;
const legacyDrunkenPoetActionOffsets = [4, 13, 21, 29, 37] as const;

type CollapsedDrunkenPoetStep = { step: number; component: number };

function remapDrunkenPoetTarget(target: AttachedEventTarget, component: number): AttachedEventTarget {
  if (target.trigger !== undefined) return target;
  const offset = legacyDrunkenPoetActionOffsets[component] ?? 0;
  return { action: target.action === "start" ? offset : offset + target.action };
}

/** Migrates the former five selectable Poet stages into the equivalent conditional composite. */
export function migrateDrunkenPoetSequences(rotation: RotationRecord): RotationRecord {
  const collapsed = new Map<number, CollapsedDrunkenPoetStep>();
  const steps: RotationStep[] = [];
  const sourceIndexes: number[] = [];

  for (let index = 0; index < rotation.steps.length; index += 1) {
    const candidates = rotation.steps.slice(index, index + legacyDrunkenPoetSequence.length);
    const matches = legacyDrunkenPoetSequence.every((skill, component) => {
      const candidate = candidates[component];
      return (
        candidate?.type === "skill" &&
        candidate.skill === skill &&
        candidate.condition === undefined &&
        (component === legacyDrunkenPoetSequence.length - 1 || candidate.causesBreak !== true)
      );
    });
    if (!matches) {
      steps.push(rotation.steps[index]);
      sourceIndexes.push(index);
      continue;
    }

    const replacementIndex = steps.length;
    const finalCandidate = candidates[legacyDrunkenPoetSequence.length - 1];
    candidates.forEach((_step, component) => collapsed.set(index + component, { step: replacementIndex, component }));
    steps.push({
      type: "skill",
      skill: "DrunkenPoet5HitsCancel",
      ...(finalCandidate?.type === "skill" && finalCandidate.causesBreak ? { causesBreak: true } : {}),
    });
    sourceIndexes.push(index);
    index += legacyDrunkenPoetSequence.length - 1;
  }

  if (!collapsed.size) return rotation;

  const retainedIndex = new Map<number, number>();
  let nextIndex = 0;
  rotation.steps.forEach((_step, index) => {
    const replacement = collapsed.get(index);
    if (replacement) {
      retainedIndex.set(index, replacement.step);
      if (replacement.component === legacyDrunkenPoetSequence.length - 1) nextIndex = replacement.step + 1;
      return;
    }
    retainedIndex.set(index, nextIndex);
    nextIndex += 1;
  });

  const remappedSteps = steps.map((step, newIndex) => {
    if (step.type !== "event") return step;
    const phase = attachedEventPhase(step);
    const target = attachedTargetForStep(step);
    if (!phase || !target) return step;
    const oldIndex = sourceIndexes[newIndex];
    let anchorIndex = -1;
    for (let index = oldIndex + 1; index < rotation.steps.length; index += 1) {
      if (canAnchorAttachedEvent(rotation.steps[index], target)) {
        anchorIndex = index;
        break;
      }
    }
    const anchor = collapsed.get(anchorIndex);
    if (!anchor) return step;
    const remappedTarget = remapDrunkenPoetTarget(target, anchor.component);
    if (step.event === "MartialArt") return step;
    return (
      phase === "before" ? { ...step, before: remappedTarget } : { ...step, after: remappedTarget }
    ) as RotationStep;
  });

  const start = rotation.start
    ? (() => {
        const replacement = collapsed.get(rotation.start!.step);
        if (!replacement)
          return { ...rotation.start!, step: retainedIndex.get(rotation.start!.step) ?? rotation.start!.step };
        const offset = legacyDrunkenPoetActionOffsets[replacement.component] ?? 0;
        return {
          step: replacement.step,
          action: offset + (rotation.start!.action ?? 0),
        };
      })()
    : undefined;

  return { ...rotation, steps: remappedSteps, ...(start ? { start } : {}) };
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
