import {
  compareTimelineTime,
  type EditableObject,
  type EffectDefinition,
  type InnerWayEffectRule,
  type TimelineRow,
} from "./rotationTimeline";

export type SeasonalEdgeBranch = "Bloom" | "Flare" | "Yield" | "Frost";

export type SeasonalEdgeOutcomeDefinition = {
  id: string;
  buffs: SeasonalEdgeBranch[];
  weight: number;
  effects: unknown[];
};

export type SeasonalEdgeEffect = {
  duration: number;
  cooldown: number;
  outcomes: SeasonalEdgeOutcomeDefinition[];
  additionalSkills: string[];
};

export type SeasonalEdgeWindow = {
  id: string;
  sourceRowId: string;
  startsAt: number;
  expiresAt: number;
  cooldownExpiresAt: number;
  yieldProbability: number;
};

export type SeasonalEdgeEntryState = {
  windowId?: string;
  outcomes?: SeasonalEdgeEffect["outcomes"];
  cooldownActive: boolean;
};

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function seasonalEdgeEffectFor(
  rules: InnerWayEffectRule[],
  definitions: Record<string, EffectDefinition>,
): SeasonalEdgeEffect | undefined {
  const trigger = rules.find(
    (rule) => rule.source === "SeasonalEdge" && rule.tier === 0 && rule.trigger?.event === "skillEndRandomBuff",
  )?.trigger;
  if (!trigger || !finitePositive(trigger.duration) || !finitePositive(trigger.cooldown)) return undefined;
  const modifiers = rules
    .filter((rule) => rule.source === "SeasonalEdge" && rule.target === "SeasonalEdgeRandomBuff" && rule.modify)
    .map((rule) => rule.modify!);
  const modified = modifiers.reduce<EditableObject>((current, modifier) => ({ ...current, ...modifier }), {
    duration: trigger.duration,
    outcome: trigger.outcome,
    count: [{ value: 1, weight: 1 }],
    additionalSkills: [],
  });
  if (!finitePositive(modified.duration)) return undefined;
  const candidates = (Array.isArray(modified.outcome) ? modified.outcome : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const outcome = candidate as EditableObject;
    if (
      typeof outcome.value !== "string" ||
      !["Bloom", "Flare", "Yield", "Frost"].includes(outcome.value) ||
      !finitePositive(outcome.weight)
    )
      return [];
    return [{ name: outcome.value as SeasonalEdgeBranch, weight: outcome.weight }];
  });
  const countDistribution = (Array.isArray(modified.count) ? modified.count : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const count = candidate as EditableObject;
    return typeof count.value === "number" && Number.isInteger(count.value) && finitePositive(count.weight)
      ? [{ value: count.value, weight: count.weight }]
      : [];
  });
  if (!candidates.length || !countDistribution.length) return undefined;
  const outcomeWeights = new Map<string, { buffs: SeasonalEdgeBranch[]; weight: number }>();
  const addSelections = (
    remaining: typeof candidates,
    selected: SeasonalEdgeBranch[],
    remainingCount: number,
    probability: number,
  ) => {
    if (remainingCount === 0) {
      const buffs = [...selected].sort() as SeasonalEdgeBranch[];
      const id = buffs.join("+");
      const current = outcomeWeights.get(id);
      outcomeWeights.set(id, { buffs, weight: (current?.weight ?? 0) + probability });
      return;
    }
    const totalWeight = remaining.reduce((total, candidate) => total + candidate.weight, 0);
    remaining.forEach((candidate, index) =>
      addSelections(
        remaining.filter((_, candidateIndex) => candidateIndex !== index),
        [...selected, candidate.name],
        remainingCount - 1,
        probability * (candidate.weight / totalWeight),
      ),
    );
  };
  const totalCountWeight = countDistribution.reduce((total, count) => total + count.weight, 0);
  countDistribution.forEach((count) => {
    if (count.value > candidates.length) return;
    addSelections(candidates, [], count.value, count.weight / totalCountWeight);
  });
  const outcomes = [...outcomeWeights.entries()].map(([id, outcome]) => ({
    id,
    buffs: outcome.buffs,
    weight: outcome.weight,
    effects: outcome.buffs.flatMap((buff) => definitions[buff]?.effect ?? []),
  }));
  const totalOutcomeWeight = outcomes.reduce((total, outcome) => total + outcome.weight, 0);
  if (totalOutcomeWeight <= 0) return undefined;
  return {
    duration: modified.duration,
    cooldown: trigger.cooldown,
    outcomes: outcomes.map((outcome) => ({ ...outcome, weight: outcome.weight / totalOutcomeWeight })),
    additionalSkills: Array.isArray(modified.additionalSkills)
      ? modified.additionalSkills.filter((skill): skill is string => typeof skill === "string")
      : [],
  };
}

export function seasonalEdgeWindows(timeline: TimelineRow[], effect: SeasonalEdgeEffect): SeasonalEdgeWindow[] {
  const yieldProbability = effect.outcomes.reduce(
    (total, outcome) => total + (outcome.buffs.includes("Yield") ? outcome.weight : 0),
    0,
  );
  const triggers = timeline
    .filter(
      (row) =>
        !row.skipped &&
        row.step.type === "skill" &&
        (row.skill?.tags?.includes("Conversion") || effect.additionalSkills.includes(row.step.skill ?? "")),
    )
    .map((row) => ({ row, time: row.startTime + row.effectiveCastTime }))
    .sort(
      ({ row: leftRow, time: leftTime }, { row: rightRow, time: rightTime }) =>
        compareTimelineTime(leftTime, rightTime) || leftRow.order - rightRow.order,
    );
  const windows: SeasonalEdgeWindow[] = [];
  let cooldownExpiresAt = Number.NEGATIVE_INFINITY;
  for (const { row, time } of triggers) {
    if (compareTimelineTime(time, cooldownExpiresAt) < 0) continue;
    cooldownExpiresAt = time + effect.cooldown;
    windows.push({
      id: `SeasonalEdge:${row.id}`,
      sourceRowId: row.id,
      startsAt: time,
      expiresAt: time + effect.duration,
      cooldownExpiresAt,
      yieldProbability,
    });
  }
  return windows;
}

export function seasonalEdgeStateAt(
  time: number,
  sourceRowId: string,
  effect: SeasonalEdgeEffect,
  windows: SeasonalEdgeWindow[],
): SeasonalEdgeEntryState | undefined {
  const cooldownWindow = windows.find(
    (window) =>
      compareTimelineTime(time, window.startsAt) >= 0 && compareTimelineTime(time, window.cooldownExpiresAt) < 0,
  );
  if (!cooldownWindow) return undefined;
  const branchActive =
    compareTimelineTime(time, cooldownWindow.expiresAt) < 0 &&
    (compareTimelineTime(time, cooldownWindow.startsAt) > 0 || sourceRowId !== cooldownWindow.sourceRowId);
  return {
    ...(branchActive ? { windowId: cooldownWindow.id, outcomes: effect.outcomes } : {}),
    cooldownActive: true,
  };
}

function overlapDuration(start: number, end: number, windows: SeasonalEdgeWindow[], expected = false) {
  return windows.reduce(
    (total, window) =>
      total +
      Math.max(0, Math.min(end, window.expiresAt) - Math.max(start, window.startsAt)) *
        (expected ? window.yieldProbability : 1),
    0,
  );
}

export function applySeasonalVitalityRanges(
  timeline: TimelineRow[],
  windows: SeasonalEdgeWindow[],
  maximum: number | undefined,
  writeRanges = true,
) {
  type Snapshot = {
    time: number;
    order: number;
    resources: Record<string, number>;
    setRange: (minimum: number, maximumValue: number, expected: number) => void;
  };
  const snapshots: Snapshot[] = timeline.flatMap((row) => [
    {
      time: row.startTime,
      order: row.order,
      resources: row.resources,
      setRange: (minimum: number, maximumValue: number, expected: number) => {
        if (writeRanges)
          row.resourceRanges = { ...row.resourceRanges, Vitality: { minimum, maximum: maximumValue, expected } };
      },
    },
    ...Object.entries(row.actionStates).map(([actionIndex, state]) => ({
      time: row.startTime + Number(row.actions[Number(actionIndex)]?.time ?? 0),
      order: row.order + 10 + Number(actionIndex),
      resources: state.resources,
      setRange: (minimum: number, maximumValue: number, expected: number) => {
        if (writeRanges)
          state.resourceRanges = { ...state.resourceRanges, Vitality: { minimum, maximum: maximumValue, expected } };
      },
    })),
  ]);
  const finalVitality = timeline.find((row) => row.timelineResourceSummary)?.timelineResourceSummary?.Vitality?.final;
  if (typeof finalVitality === "number" && Number.isFinite(finalVitality)) {
    const finalTime = timeline.reduce(
      (latest, row) =>
        Math.max(
          latest,
          row.startTime,
          ...row.actions.flatMap((action) => (typeof action.time === "number" ? [row.startTime + action.time] : [])),
        ),
      0,
    );
    snapshots.push({
      time: finalTime,
      order: Number.MAX_SAFE_INTEGER,
      resources: { Vitality: finalVitality },
      setRange: () => {},
    });
  }
  snapshots.sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order);
  const first = snapshots.find((snapshot) => Number.isFinite(snapshot.resources.Vitality));
  if (!first) return undefined;
  let previousTime = first.time;
  let previousBase = first.resources.Vitality;
  let upper = previousBase;
  let expected = previousBase;
  const cap = typeof maximum === "number" && Number.isFinite(maximum) ? maximum : Number.POSITIVE_INFINITY;
  for (const snapshot of snapshots) {
    const base = snapshot.resources.Vitality;
    if (!Number.isFinite(base)) continue;
    upper += base - previousBase;
    upper += overlapDuration(previousTime, snapshot.time, windows) * 2;
    upper = Math.max(base, Math.min(cap, upper));
    expected += base - previousBase;
    expected += overlapDuration(previousTime, snapshot.time, windows, true) * 2;
    expected = Math.max(base, Math.min(cap, expected));
    snapshot.setRange(base, upper, expected);
    previousBase = base;
    previousTime = snapshot.time;
  }
  return expected;
}
