import { compareTimelineTime, type EffectDefinition, type TimelineRow } from "@/calculations/rotationTimeline"

export type TimelineDisplayEntry = {
  row: TimelineRow
  kind: "skill" | "action"
  time: number
  order: number
  actionIndex?: number
}

/**
 * Drop internal bookkeeping effects, such as cadence counters, from the timeline.
 * They drive the simulation but have no counterpart the player reads, so a plate
 * for one is noise rather than information.
 */
export function visibleTimelineEffects<T extends { name: string }>(
  effects: readonly T[],
  effectDefinitions: Record<string, EffectDefinition | undefined>,
): T[] {
  return effects.filter(effect => effectDefinitions[effect.name]?.hidden !== true)
}

/** Stable identity for one display entry, shared by the windowing keys and the rendered React key. */
export function displayEntryKey(entry: TimelineDisplayEntry): string {
  const { row, kind, actionIndex } = entry
  if (row.kind === "damageGroup") return `${row.id}-summary`
  return `${row.id}-${kind}-${actionIndex ?? "skill"}`
}

/** Inner Way totals are non-expandable footers; their internal actions never enter the display list. */
export function buildTimelineDisplayEntries(
  timeline: TimelineRow[],
  expanded: (rowId: string) => boolean,
  startAnchor: { rowId: string; actionIndex?: number },
): TimelineDisplayEntry[] {
  const rowsById = new Map(timeline.map(row => [row.id, row]))
  const pending = timeline.some(row => row.pendingCalculation)
  const headers: TimelineDisplayEntry[] = []
  const entries: TimelineDisplayEntry[] = []
  const unexecuted: TimelineDisplayEntry[] = []
  for (const row of timeline) {
    if (row.kind === "damageGroup") headers.push({ row, kind: "skill", time: row.startTime, order: row.order })
  }
  for (const row of timeline) {
    if (row.skipped) {
      if (row.kind === "rotation") unexecuted.push({ row, kind: "skill", time: row.startTime, order: row.order })
      continue
    }
    if (row.kind === "damageGroup") continue
    if (row.step.type === "event" && row.step.event === "HP" && "automatic" in row.step && row.step.automatic === true)
      continue
    const sourceRow = row.sourceRowId ? rowsById.get(row.sourceRowId) : undefined
    if (sourceRow?.kind === "damageGroup") continue
    if (row.kind === "rotation") entries.push({ row, kind: "skill", time: row.startTime, order: row.order })
    const derivedExpanded =
      row.kind !== "rotation" && sourceRow && (sourceRow.step.type !== "skill" || expanded(sourceRow.id))
    row.actions.forEach((action, actionIndex) => {
      // A visited action can fail its stack requirement or cooldown. Its state
      // exists for calculation, but only accepted actions receive combat order.
      const state = row.actionStates[actionIndex]
      if (!row.pendingCalculation && state && state.combatOrder === undefined) return
      const visible =
        derivedExpanded ||
        row.step.type !== "skill" ||
        expanded(row.id) ||
        (startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex)
      if ((action.type === "damage" || action.type === "replay" || action.type === "heal") && visible)
        entries.push({
          row,
          kind: "action",
          actionIndex,
          time: row.startTime + Number(action.time ?? 0),
          order: row.order + 10 + actionIndex,
        })
    })
  }
  const compare = (left: TimelineDisplayEntry, right: TimelineDisplayEntry) =>
    pending ? left.order - right.order : compareTimelineTime(left.time, right.time) || left.order - right.order
  return [...entries.sort(compare), ...unexecuted.sort((left, right) => left.order - right.order), ...headers]
}
