import type { RotationRecord, TimelineBuildInput, TimelineRow } from "./calculations/rotationTimeline";

export type EditorRevision = { id: string; context: string; rotation: RotationRecord };
export function sameEditorRevision(left: EditorRevision, right: EditorRevision) {
  return left.id === right.id && left.context === right.context && left.rotation === right.rotation;
}

/** Unreached authored steps remain editable, without expanding their combat actions. */
export function withUnresolvedEditorSteps(
  input: Pick<TimelineBuildInput, "rotation" | "skills" | "eventDefinitions">,
  timeline: TimelineRow[],
) {
  const resolved = new Set(
    timeline
      .filter((row) => row.kind === "rotation" && row.rotationIndex !== undefined)
      .map((row) => row.rotationIndex),
  );
  if (resolved.size === input.rotation.steps.length) return timeline;
  const placeholders = pendingEditorTimeline(input).filter((row) => !resolved.has(row.rotationIndex));
  return [
    ...timeline,
    ...placeholders.map((row) =>
      Object.assign({}, row, {
        pendingCalculation: false,
        skipped: true,
        startTime: timeline[0]?.timelineEndTime ?? 0,
      }),
    ),
  ];
}

/** Editable placeholders only: no event simulation, cooldown math, or effective-stat calculation. */
export function pendingEditorTimeline(
  input: Pick<TimelineBuildInput, "rotation" | "skills" | "eventDefinitions">,
  previous?: { rotation: RotationRecord; timeline: TimelineRow[] },
): TimelineRow[] {
  const oldByStep = new Map(
    previous?.timeline
      .filter((row) => row.kind === "rotation" && row.rotationIndex !== undefined)
      .map((row) => [previous.rotation.steps[row.rotationIndex ?? -1], row]),
  );
  const sourceIds = new Map<string, string>();
  const rows = input.rotation.steps.map((step, index): TimelineRow => {
    const old = oldByStep.get(step);
    const id = `rotation-${index}`;
    if (old) sourceIds.set(old.id, id);
    const skill = step.type === "skill" ? input.skills[step.skill ?? ""] : input.eventDefinitions[step.event];
    return {
      id,
      kind: "rotation",
      rotationIndex: index,
      order: index * 1000,
      step,
      skill,
      startTime: old?.startTime ?? 0,
      effectiveCastTime: old?.effectiveCastTime ?? 0,
      distance: old?.distance ?? 1,
      currentHP: old?.currentHP ?? 0,
      currentHPRatio: old?.currentHPRatio ?? 1,
      targetHPRatio: old?.targetHPRatio ?? 1,
      targetQiRatio: old?.targetQiRatio ?? 1,
      resources: old?.resources ?? {},
      buffs: old?.buffs ?? [],
      debuffs: old?.debuffs ?? [],
      actions: old?.actions ?? [],
      actionStates: old?.actionStates ?? {},
      modifierEffects: old?.modifierEffects ?? [],
      sourceRowId: old?.sourceRowId,
      pendingCalculation: true,
    };
  });
  for (const row of rows) if (row.sourceRowId) row.sourceRowId = sourceIds.get(row.sourceRowId);
  for (const old of previous?.timeline ?? []) {
    if (old.kind !== "trigger" || !old.sourceRowId) continue;
    const sourceRowId = sourceIds.get(old.sourceRowId);
    if (sourceRowId) rows.push({ ...old, sourceRowId, pendingCalculation: true });
  }
  return rows;
}
