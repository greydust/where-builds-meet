import {
  canAnchorAttachedEvent,
  isAttachmentAnchorStep,
  isFixedTimeEvent,
  type AttachedEventTarget,
  type RotationRecord,
  type RotationStep,
} from "@/calculations/rotationTimeline"

/** Replace legacy Slide openers without shifting battle or attached-event anchors. */
export function migrateGeneralsBaneSlides(rotation: RotationRecord): RotationRecord {
  let slideCount = 0
  const steps = rotation.steps.map(step => {
    if (step.type !== "skill" || step.skill !== "SnowpartingQSlide") return step
    slideCount += 1
    return { ...step, skill: slideCount === 2 ? "SnowpartingQ2" : "SnowpartingQ" }
  })
  return slideCount ? { ...rotation, steps } : rotation
}

/** Old defensive reward actions all occurred at cast start. Preserve their direct anchors. */
export function migrateDefenseActionAnchors(rotation: RotationRecord): RotationRecord {
  const isDefense = (step: RotationStep | undefined) =>
    step?.type === "skill" &&
    ["Defense", "Dodge", "PerfectDodge", "PerfectDodgeCancel", "DeflectSuccessful"].includes(step.skill ?? "")
  let changed = false
  const steps = rotation.steps.map((step, index) => {
    if (step.type !== "event") return step
    const attachment = "before" in step ? step.before : "after" in step ? step.after : undefined
    if (!attachment || attachment.action === "start" || attachment.trigger !== undefined) return step
    const target = rotation.steps.find(
      (candidate, candidateIndex) => candidateIndex > index && canAnchorAttachedEvent(candidate, attachment),
    )
    if (!isDefense(target)) return step
    changed = true
    const key = "before" in step ? "before" : "after"
    return { ...step, [key]: { ...attachment, action: "start" as const } }
  })
  let start = rotation.start
  if (start?.action !== undefined && isDefense(rotation.steps[start.step])) {
    start = { step: start.step }
    changed = true
  }
  return changed ? { ...rotation, steps, start } : rotation
}

export function isAutomaticDelay(step: RotationStep | undefined): boolean {
  return (
    step?.type === "event" &&
    step.event === "Delay" &&
    (step.automatic === "cooldown" || step.automatic === "attack" || step.automatic === "requirement")
  )
}

export function migrateAutomaticDelays(rotation: RotationRecord): RotationRecord {
  if (!rotation.steps.some(isAutomaticDelay)) return rotation
  const retainedIndexes = new Map<number, number>()
  const steps = rotation.steps.filter((step, index) => {
    if (isAutomaticDelay(step)) return false
    retainedIndexes.set(index, retainedIndexes.size)
    return true
  })
  const startIndex = rotation.start ? retainedIndexes.get(rotation.start.step) : undefined
  const nextStartIndex = rotation.start
    ? [...retainedIndexes].find(([index]) => index > rotation.start!.step)?.[1]
    : undefined
  let start = rotation.start
  if (start && startIndex !== undefined) start = { ...start, step: startIndex }
  if (start && startIndex === undefined) start = { step: nextStartIndex ?? steps.length - 1 }
  if (!steps.length) start = undefined
  return { ...rotation, steps, start }
}

const legacyDrunkenPoetSequence = [
  "DrunkenPoet1",
  "DrunkenPoet2",
  "DrunkenPoet3",
  "DrunkenPoet4",
  "DrunkenPoet5",
] as const
const legacyDrunkenPoetActionOffsets = [4, 13, 21, 29, 37] as const

type CollapsedDrunkenPoetStep = { step: number; component: number }

function remapDrunkenPoetTarget(target: AttachedEventTarget, component: number): AttachedEventTarget {
  if (target.trigger !== undefined) return target
  const offset = legacyDrunkenPoetActionOffsets[component] ?? 0
  return { action: target.action === "start" ? offset : offset + target.action }
}

/** Migrates the former five selectable Poet stages into the equivalent conditional composite. */
export function migrateDrunkenPoetSequences(rotation: RotationRecord): RotationRecord {
  const collapsed = new Map<number, CollapsedDrunkenPoetStep>()
  const steps: RotationStep[] = []
  const sourceIndexes: number[] = []

  for (let index = 0; index < rotation.steps.length; index += 1) {
    const candidates = rotation.steps.slice(index, index + legacyDrunkenPoetSequence.length)
    const matches = legacyDrunkenPoetSequence.every((skill, component) => {
      const candidate = candidates[component]
      return (
        candidate?.type === "skill" &&
        candidate.skill === skill &&
        candidate.condition === undefined &&
        (component === legacyDrunkenPoetSequence.length - 1 || candidate.causesBreak !== true)
      )
    })
    if (!matches) {
      steps.push(rotation.steps[index])
      sourceIndexes.push(index)
      continue
    }

    const replacementIndex = steps.length
    const finalCandidate = candidates[legacyDrunkenPoetSequence.length - 1]
    candidates.forEach((_step, component) => collapsed.set(index + component, { step: replacementIndex, component }))
    steps.push({
      type: "skill",
      skill: "DrunkenPoet5HitsCancel",
      ...(finalCandidate?.type === "skill" && finalCandidate.causesBreak ? { causesBreak: true } : {}),
    })
    sourceIndexes.push(index)
    index += legacyDrunkenPoetSequence.length - 1
  }

  if (!collapsed.size) return rotation

  const retainedIndex = new Map<number, number>()
  let nextIndex = 0
  rotation.steps.forEach((_step, index) => {
    const replacement = collapsed.get(index)
    if (replacement) {
      retainedIndex.set(index, replacement.step)
      if (replacement.component === legacyDrunkenPoetSequence.length - 1) nextIndex = replacement.step + 1
      return
    }
    retainedIndex.set(index, nextIndex)
    nextIndex += 1
  })

  const remappedSteps = steps.map((step, newIndex) => {
    if (step.type !== "event") return step
    const phase = attachedEventPhase(step)
    const target = attachedTargetForStep(step)
    if (!phase || !target) return step
    const oldIndex = sourceIndexes[newIndex]
    let anchorIndex = -1
    for (let index = oldIndex + 1; index < rotation.steps.length; index += 1) {
      if (canAnchorAttachedEvent(rotation.steps[index], target)) {
        anchorIndex = index
        break
      }
    }
    const anchor = collapsed.get(anchorIndex)
    if (!anchor) return step
    const remappedTarget = remapDrunkenPoetTarget(target, anchor.component)
    if (step.event === "MartialArt") return step
    return (
      phase === "before"
        ? Object.assign({}, step, { before: remappedTarget })
        : Object.assign({}, step, { after: remappedTarget })
    ) as RotationStep
  })

  const start = rotation.start
    ? (() => {
        const replacement = collapsed.get(rotation.start!.step)
        if (!replacement)
          return { ...rotation.start!, step: retainedIndex.get(rotation.start!.step) ?? rotation.start!.step }
        const offset = legacyDrunkenPoetActionOffsets[replacement.component] ?? 0
        return { step: replacement.step, action: offset + (rotation.start!.action ?? 0) }
      })()
    : undefined

  return { ...rotation, steps: remappedSteps, ...(start ? { start } : {}) }
}

export type AttachedEventPhase = "before" | "after"

export function attachedEventPhase(step: RotationStep | undefined): AttachedEventPhase | undefined {
  if (step?.type !== "event") return undefined
  if ("before" in step) return "before"
  if ("after" in step) return "after"
  return undefined
}

export function attachedTargetForStep(step: RotationStep | undefined): AttachedEventTarget | undefined {
  switch (attachedEventPhase(step)) {
    case "before":
      return step && "before" in step ? step.before : undefined
    case "after":
      return step && "after" in step ? step.after : undefined
    default:
      return undefined
  }
}

export type RotationAttachmentTarget = {
  sourceRowId: string
  sourceStepIndex: number
  target: AttachedEventTarget
  time: number
  order: number
}

function targetsMatch(left: AttachedEventTarget, right: AttachedEventTarget) {
  return left.action === right.action && left.trigger === right.trigger
}

/** Return the authored anchor step that an attachment will expand with. */
export function attachedEventAnchorStepIndex(steps: RotationStep[], stepIndex: number) {
  const target = attachedTargetForStep(steps[stepIndex])
  if (!target) return -1
  for (let index = stepIndex + 1; index < steps.length; index += 1) {
    if (canAnchorAttachedEvent(steps[index], target)) return index
  }
  return -1
}

/** Delay and Switch Martial Art keep their existing action-oriented behavior. */
export function isActionEvent(step: RotationStep | undefined): boolean {
  return step?.type === "event" && (step.event === "Delay" || step.event === "MartialArt")
}

export function supportsEventStartTime(step: RotationStep | undefined): boolean {
  return step?.type === "event" && !isActionEvent(step)
}

/** True only for metadata that the runtime still expands through an action anchor. */
export function isRuntimeAttachedEvent(step: RotationStep | undefined): boolean {
  return Boolean(
    step?.type === "event" && step.event !== "Delay" && !isFixedTimeEvent(step) && attachedTargetForStep(step),
  )
}

/** Ordered steps and live attachments can establish battle start; fixed rows cannot. */
export function canUseRotationStart(step: RotationStep | undefined): boolean {
  if (step?.type === "skill") return true
  return step?.type === "event" && (step.event === "Delay" || isRuntimeAttachedEvent(step))
}

export function canUseRotationStartAt(steps: RotationStep[], stepIndex: number): boolean {
  const step = steps[stepIndex]
  if (!canUseRotationStart(step)) return false
  return step?.type !== "event" || step.event === "Delay" || attachedEventAnchorStepIndex(steps, stepIndex) >= 0
}

export function canUseRotationStartAction(step: RotationStep | undefined, action: number): boolean {
  return step?.type === "skill" && Number.isInteger(action) && action >= 0
}

/** Keep a supplied start usable after a migration or an editor replacement. */
export function normalizeRotationStart(start: RotationRecord["start"], steps: RotationStep[]): RotationRecord["start"] {
  if (!start) return undefined
  const current = steps[start.step]
  if (canUseRotationStartAt(steps, start.step) && (start.action === undefined || current?.type === "skill"))
    return start
  const replacement = steps.findIndex(
    step => step.type === "skill" || (step.type === "event" && step.event === "Delay"),
  )
  if (replacement >= 0) return { step: replacement }
  const attached = steps.findIndex((_, index) => canUseRotationStartAt(steps, index))
  return attached >= 0 ? { step: attached } : undefined
}

/** Resolve the current target, or its directional neighbor for an arrow move.
 * Fixed-time events use their live clock rather than retained attachment metadata.
 * Between actions, an arrow selects the nearest action in its direction.
 */
export function resolveAttachmentTargetIndex(
  steps: RotationStep[],
  stepIndex: number,
  targets: readonly RotationAttachmentTarget[],
  fallbackTime?: number,
  direction: -1 | 0 | 1 = 0,
): number {
  const adjacent = (index: number) => {
    const next = index + direction
    return next >= 0 && next < targets.length ? next : -1
  }
  const step = steps[stepIndex]
  const target = attachedTargetForStep(step)
  const anchorStepIndex = attachedEventAnchorStepIndex(steps, stepIndex)
  if (!isFixedTimeEvent(step) && target && anchorStepIndex >= 0) {
    const anchoredIndex = targets.findIndex(
      candidate => candidate.sourceStepIndex === anchorStepIndex && targetsMatch(candidate.target, target),
    )
    if (anchoredIndex >= 0) return adjacent(anchoredIndex)
    const anchorStart = targets.findIndex(candidate => candidate.sourceStepIndex === anchorStepIndex)
    if (anchorStart >= 0) return adjacent(anchorStart)
  }
  if (fallbackTime !== undefined && Number.isFinite(fallbackTime)) {
    const exactIndex = targets.findIndex(
      candidate => candidate.time !== undefined && Math.abs(candidate.time - fallbackTime) <= 1e-4,
    )
    if (exactIndex >= 0) return adjacent(exactIndex)
    if (direction === 1)
      return targets.findIndex(candidate => candidate.time !== undefined && candidate.time > fallbackTime)
    let previousIndex = -1
    targets.forEach((candidate, index) => {
      if (candidate.time !== undefined && candidate.time <= fallbackTime) previousIndex = index
    })
    if (previousIndex >= 0 || direction === -1) return previousIndex
  }
  return targets.length ? adjacent(0) : -1
}

/** Convert a fixed-time event back into an action attachment at a new target. */
export function reattachEventStep(
  step: RotationStep,
  target: AttachedEventTarget,
  phase: AttachedEventPhase = attachedEventPhase(step) ?? "before",
): RotationStep {
  if (step.type !== "event" || step.event === "Delay") return step
  const next = { ...step } as Extract<RotationStep, { type: "event" }> & {
    startTime?: number
    before?: AttachedEventTarget
    after?: AttachedEventTarget
  }
  delete next.startTime
  delete next.before
  delete next.after
  const nextPhase = phase === "after" && step.event !== "Qi" && step.event !== "Exhausted" ? "before" : phase
  return { ...next, [nextPhase]: target } as RotationStep
}

/** Move an event to an attachment target and return its new authored position. */
export function moveEventToAttachmentTarget(
  steps: RotationStep[],
  stepIndex: number,
  target: RotationAttachmentTarget,
  phase?: AttachedEventPhase,
): { steps: RotationStep[]; movedIndex: number } | undefined {
  const step = steps[stepIndex]
  const targetStep = steps[target.sourceStepIndex]
  if (step?.type !== "event" || !targetStep) return undefined
  const withoutEvent = steps.filter((_candidate, index) => index !== stepIndex)
  const targetIndex = withoutEvent.indexOf(targetStep)
  if (targetIndex < 0) return undefined
  const movedEvent = reattachEventStep(step, target.target, phase)
  const next = [...withoutEvent.slice(0, targetIndex), movedEvent, ...withoutEvent.slice(targetIndex)]
  return { steps: next, movedIndex: targetIndex }
}

function sameAttachedEventTarget(steps: RotationStep[], leftIndex: number, rightIndex: number) {
  const left = steps[leftIndex]
  const right = steps[rightIndex]
  const leftTarget = isRuntimeAttachedEvent(left) ? attachedTargetForStep(left) : undefined
  const rightTarget = isRuntimeAttachedEvent(right) ? attachedTargetForStep(right) : undefined
  return Boolean(
    leftTarget &&
    rightTarget &&
    attachedEventPhase(left) === attachedEventPhase(right) &&
    attachedEventAnchorStepIndex(steps, leftIndex) === attachedEventAnchorStepIndex(steps, rightIndex) &&
    targetsMatch(leftTarget, rightTarget),
  )
}

export function attachedEventSiblingIndex(steps: RotationStep[], stepIndex: number, direction: -1 | 1) {
  const step = steps[stepIndex]
  if (!isRuntimeAttachedEvent(step)) return -1
  const target = attachedTargetForStep(step)
  if (!target) return -1
  for (let index = stepIndex + direction; index >= 0 && index < steps.length; index += direction) {
    if (isAttachmentAnchorStep(steps[index]) && canAnchorAttachedEvent(steps[index], target)) return -1
    if (sameAttachedEventTarget(steps, stepIndex, index)) return index
  }
  return -1
}

export function reorderAttachedEventWithinTarget(
  steps: RotationStep[],
  stepIndex: number,
  direction: -1 | 1,
): { steps: RotationStep[]; movedIndex: number } | undefined {
  const siblingIndex = attachedEventSiblingIndex(steps, stepIndex, direction)
  if (siblingIndex < 0) return undefined
  const next = [...steps]
  ;[next[stepIndex], next[siblingIndex]] = [next[siblingIndex], next[stepIndex]]
  return { steps: next, movedIndex: siblingIndex }
}

/** Preserve saved manual Token applications when moving the mark to the enemy. */
export function migrateVendettaTokenStep(step: RotationStep): RotationStep {
  if (step.type !== "event" || step.event !== "Buff" || step.buff !== "VendettaToken") return step
  const { buff, ...rest } = step
  return { ...rest, event: "Debuff", debuff: buff }
}
