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
};

export type SeasonalVitalityResult = {
  endingDistribution: { vitality: number; probability: number }[];
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
  return branchActive ? { windowId: cooldownWindow.id, outcomes: effect.outcomes } : undefined;
}

function seasonalEdgeCooldownAt(time: number, sourceRowId: string, windows: SeasonalEdgeWindow[]) {
  return windows.find(
    (window) =>
      compareTimelineTime(time, window.cooldownExpiresAt) < 0 &&
      (compareTimelineTime(time, window.startsAt) > 0 || sourceRowId !== window.sourceRowId),
  );
}

export function applySeasonalEdgeCooldownToTimeline(timeline: TimelineRow[], windows: SeasonalEdgeWindow[]) {
  const withCooldown = (buffs: TimelineRow["buffs"], time: number, sourceRowId: string) => {
    const retained = buffs.filter((buff) => buff.name !== "SeasonalEdgeCooldown");
    const window = seasonalEdgeCooldownAt(time, sourceRowId, windows);
    return window
      ? [
          ...retained,
          {
            name: "SeasonalEdgeCooldown",
            stack: 1,
            maxStack: 1,
            expiresAt: window.cooldownExpiresAt,
          },
        ]
      : retained;
  };
  for (const row of timeline) {
    row.buffs = withCooldown(row.buffs, row.startTime, row.id);
    for (const [actionIndex, state] of Object.entries(row.actionStates)) {
      const actionTime = row.startTime + Number(row.actions[Number(actionIndex)]?.time ?? 0);
      state.buffs = withCooldown(state.buffs, actionTime, row.id);
    }
  }
}

function overlapDuration(start: number, end: number, windows: SeasonalEdgeWindow[]) {
  return windows.reduce(
    (total, window) => total + Math.max(0, Math.min(end, window.expiresAt) - Math.max(start, window.startsAt)),
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
  const branches = windows.reduce<{ selected: SeasonalEdgeWindow[]; probability: number }[]>(
    (current, window) => {
      if (window.yieldProbability <= 0) return current;
      if (window.yieldProbability >= 1)
        return current.map((branch) => ({
          selected: [...branch.selected, window],
          probability: branch.probability,
        }));
      return current.flatMap((branch) => [
        {
          selected: branch.selected,
          probability: branch.probability * (1 - window.yieldProbability),
        },
        {
          selected: [...branch.selected, window],
          probability: branch.probability * window.yieldProbability,
        },
      ]);
    },
    [{ selected: [], probability: 1 }],
  );
  const cap = typeof maximum === "number" && Number.isFinite(maximum) ? maximum : Number.POSITIVE_INFINITY;
  const snapshotOutcomes = snapshots.map(() => [] as { vitality: number; probability: number }[]);
  const endingDistribution = branches.map((branch) => {
    let previousTime = first.time;
    let previousBase = first.resources.Vitality;
    let vitality = previousBase;
    snapshots.forEach((snapshot, index) => {
      const base = snapshot.resources.Vitality;
      if (!Number.isFinite(base)) return;
      vitality += base - previousBase;
      vitality += overlapDuration(previousTime, snapshot.time, branch.selected) * 2;
      vitality = Math.max(base, Math.min(cap, vitality));
      snapshotOutcomes[index].push({ vitality, probability: branch.probability });
      previousBase = base;
      previousTime = snapshot.time;
    });
    return { vitality, probability: branch.probability };
  });
  snapshots.forEach((snapshot, index) => {
    const outcomes = snapshotOutcomes[index];
    if (!outcomes.length) return;
    snapshot.setRange(
      Math.min(...outcomes.map((outcome) => outcome.vitality)),
      Math.max(...outcomes.map((outcome) => outcome.vitality)),
      outcomes.reduce((total, outcome) => total + outcome.vitality * outcome.probability, 0),
    );
  });
  return {
    endingDistribution,
  } satisfies SeasonalVitalityResult;
}
