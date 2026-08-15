import type { TimelineRow } from "./calculations/rotationTimeline";

const formatHalfSecond = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

export function readableRotationText(timeline: TimelineRow[], startAnchor: { rowId: string; actionIndex?: number }, anchorTime: number) {
  const skillRows = timeline
    .filter((row) => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
    .sort((left, right) => (left.rotationIndex ?? 0) - (right.rotationIndex ?? 0));
  const breakRows = new Set<string>(skillRows.filter((row) => row.step.type === "skill" && row.step.causesBreak).map((row) => row.id));
  const breakEvents = timeline.filter((row) => row.kind === "rotation" && row.step.type === "event" && (row.step.event === "Exhausted" || row.step.event === "Debuff" && row.step.debuff === "Exhausted") && !row.skipped);
  breakEvents.forEach((breakEvent) => {
    const containingRow = skillRows.find((row) => row.id === breakEvent.sourceRowId)
      ?? skillRows.find((row) => breakEvent.startTime >= row.startTime - 1e-6 && breakEvent.startTime <= row.startTime + row.effectiveCastTime + 1e-6);
    if (containingRow) breakRows.add(containingRow.id);
  });
  const entries = skillRows.map((row) => {
    const skillId = row.step.type === "skill" ? row.step.skill ?? "" : "";
    const name = row.skill?.shortName?.trim() || row.skill?.name?.trim() || skillId;
    if (row.id === startAnchor.rowId) {
      if (startAnchor.actionIndex !== undefined) {
        const hitNumber = row.actions.slice(0, startAnchor.actionIndex + 1).filter((action) => action.type === "damage").length;
        if (hitNumber > 0) return `${name} (start at hit ${hitNumber})`;
      }
      return `${name} (start)`;
    }
    if (breakRows.has(row.id)) return `${name} (break)`;
    if (row.startTime < anchorTime - 1e-6) return `${name} at ${formatHalfSecond(Math.round((anchorTime - row.startTime) * 2) / 2)}`;
    return name;
  });
  const groups = entries.reduce<Array<{ text: string; count: number }>>((result, text) => {
    const previous = result[result.length - 1];
    if (previous?.text === text) previous.count += 1;
    else result.push({ text, count: 1 });
    return result;
  }, []);
  return groups.map(({ text, count }) => count > 1 ? `${text} x${count}` : text).join(" > ");
}
