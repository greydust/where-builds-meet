import { calculateDamageBreakdown, type DamageBreakdown, type DamageContext, type DamageAction } from "./damage";
import { emptyRotationBreakdown, type RotationBreakdown, type RotationMetrics, type RotationPriority } from "./rotationMetrics";
import { calculateDerivedStats } from "./effectiveStats";
import { buildRotationTimeline, compareTimelineTime, mergeEffectDefinition, requirementsPass, type EditableObject, type EffectDefinition, type InnerWayEffectRule, type TimelineBuildInput, type TimelineRow } from "./rotationTimeline";
import type { CharacterStats, EnemyProfile, WeaponId } from "../types";
import attunementJson from "../../data/attunement.json";
import type { AttunementStats } from "./damage";

export type RotationDamageEntry = {
  id?: string;
  action: DamageAction;
  context: DamageContext;
};

export type RotationCalculationVariant = {
  key: string;
  entries: RotationDamageEntry[];
  duration?: number;
};

export type RotationCalculationBundle = {
  duration: number;
  baseline: RotationDamageEntry[];
  statPriority: Array<{ label: string; maxRoll?: number; entries: RotationDamageEntry[]; duration?: number }>;
  attunementPriority: Array<{ label: string; maxRoll?: number; entries: RotationDamageEntry[]; duration?: number }>;
  innerWayPriority: Array<{ label: string; maxRoll?: number; entries: RotationDamageEntry[]; duration?: number }>;
  setupComparisons: Record<string, Array<{ label: string; maxRoll?: number; entries: RotationDamageEntry[]; duration?: number }>>;
};

export type RotationSimulationVariant = {
  label: string;
  maxRoll?: number;
  stats?: CharacterStats;
  attunement?: AttunementStats;
  timeline?: TimelineBuildInput;
  innerWayRules?: InnerWayEffectRule[];
  innerWayConditions?: string[];
  setupEffects?: EditableObject[];
};

export type RotationSimulationBundle = {
  timeline: TimelineBuildInput;
  startAnchor: { rowId: string; actionIndex?: number };
  stats: CharacterStats;
  attunement: AttunementStats;
  enemy: EnemyProfile;
  derivedStats: DamageContext["derivedStats"];
  weapons: WeaponId[];
  statPriority: RotationSimulationVariant[];
  attunementPriority: RotationSimulationVariant[];
  innerWayPriority: RotationSimulationVariant[];
  setupComparisons: Record<string, RotationSimulationVariant[]>;
};

export type RotationSimulationResult = {
  metrics: RotationMetrics;
  timeline: TimelineRow[];
  anchorTime: number;
  duration: number;
  actionBreakdowns: Record<string, DamageBreakdown>;
};

export type RotationSimulationBaseline = RotationSimulationResult & {
  baseline: RotationDamageEntry[];
};

const emptyBreakdown = (): DamageBreakdown => ({
  physical: 0,
  bellstrike: 0,
  stonesplit: 0,
  silkbind: 0,
  bamboocut: 0,
  total: 0,
});

function sumEntries(entries: RotationDamageEntry[]) {
  return entries.reduce((total, entry) => {
    const breakdown = calculateDamageBreakdown(entry.action, entry.context);
    return {
      physical: total.physical + breakdown.physical,
      bellstrike: total.bellstrike + breakdown.bellstrike,
      stonesplit: total.stonesplit + breakdown.stonesplit,
      silkbind: total.silkbind + breakdown.silkbind,
      bamboocut: total.bamboocut + breakdown.bamboocut,
      total: total.total + breakdown.total,
    };
  }, emptyBreakdown());
}

function priorityRow(label: string, baselineDps: number, variantDps: number, maxRoll?: number): RotationPriority {
  return {
    label,
    maxRoll,
    increase: baselineDps > 0 ? (variantDps / baselineDps - 1) * 100 : 0,
    dpsDifference: variantDps - baselineDps,
  };
}

function calculatePriorityRows(
  baselineDps: number,
  duration: number,
  variants: Array<{ label: string; maxRoll?: number; entries: RotationDamageEntry[]; duration?: number }>,
  order: "ascending" | "descending" = "descending",
) {
  return variants
    .map(({ label, maxRoll, entries, duration: variantDuration = duration }) => priorityRow(label, baselineDps, variantDuration > 0 ? sumEntries(entries).total / variantDuration : 0, maxRoll))
    .sort((left, right) => order === "ascending" ? left.dpsDifference - right.dpsDifference : right.dpsDifference - left.dpsDifference);
}

/**
 * Pure calculation entry point. It has no React or browser storage dependency;
 * callers build the timeline and provide all state needed for each variant.
 */
export function calculateRotationMetrics(bundle: RotationCalculationBundle, baselineDamageOverride?: number): RotationMetrics {
  const duration = Math.max(0, bundle.duration);
  const baselineDamage = baselineDamageOverride ?? sumEntries(bundle.baseline).total;
  const baselineDps = duration > 0 ? baselineDamage / duration : 0;
  const setupComparisons = Object.fromEntries(Object.entries(bundle.setupComparisons).map(([group, variants]) => [
    group,
    calculatePriorityRows(baselineDps, duration, variants),
  ]));

  const attunementRows = calculatePriorityRows(baselineDps, duration, bundle.attunementPriority);
  const penetrationLabels = new Set(Object.values(attunementJson)
    .filter((definition) => Object.keys(definition.effect?.stat ?? {}).some((key) => key === "physicalPenetration" || key === "formlessPenetration"))
    .map((definition) => definition.name));
  return {
    totalDamage: baselineDamage,
    dps: baselineDps,
    breakdown: emptyRotationBreakdown(),
    statPriority: calculatePriorityRows(baselineDps, duration, bundle.statPriority),
    attunementPriority: [
      ...attunementRows.filter((row) => penetrationLabels.has(row.label)).sort((left, right) => right.dpsDifference - left.dpsDifference),
      ...attunementRows.filter((row) => !penetrationLabels.has(row.label)).sort((left, right) => right.dpsDifference - left.dpsDifference),
    ],
    innerWayPriority: calculatePriorityRows(baselineDps, duration, bundle.innerWayPriority, "ascending"),
    setupComparisons,
  };
}

function calculateBreakdown(timeline: TimelineRow[], actionBreakdowns: Record<string, DamageBreakdown>, totalDamage: number): RotationBreakdown {
  const percentage = (damage: number) => totalDamage > 0 ? damage / totalDamage * 100 : 0;
  const skills = new Map<string, { id: string; name: string; casts: number; triggers: number; hits: number; abrasionTotal: number; normalTotal: number; criticalTotal: number; affinityTotal: number; damage: number; tags: string[] }>();
  const castRows = timeline.filter((row) => !row.skipped && row.step.type === "skill" && row.step.skill && (row.kind === "rotation" || row.kind === "trigger" && row.triggerSource === "innerWay"));
  const casts = new Map(castRows.map((row) => [row.id, {
    id: row.id,
    skillId: row.step.type === "skill" ? row.step.skill ?? "" : "",
    name: row.skill?.name ?? (row.step.type === "skill" ? row.step.skill ?? "" : ""),
    castTime: row.effectiveCastTime,
    damage: 0,
    time: row.startTime,
    order: row.order,
  }]));
  const rowsById = new Map(timeline.map((row) => [row.id, row]));
  const orderedRotationCasts = castRows
    .filter((row) => row.kind === "rotation")
    .sort((left, right) => (left.rotationIndex ?? Number.MAX_SAFE_INTEGER) - (right.rotationIndex ?? Number.MAX_SAFE_INTEGER));
  orderedRotationCasts.forEach((row, index) => {
    const followingRow = orderedRotationCasts[index + 1];
    if (followingRow?.step.type !== "skill" || followingRow.step.skill !== "Deflect") return;
    const cast = casts.get(row.id);
    if (cast) cast.castTime += followingRow.effectiveCastTime;
  });
  const owningCastId = (row: TimelineRow) => {
    if (casts.has(row.id)) return row.id;
    let sourceId = row.sourceRowId;
    const visited = new Set<string>();
    while (sourceId && !visited.has(sourceId)) {
      if (casts.has(sourceId)) return sourceId;
      visited.add(sourceId);
      sourceId = rowsById.get(sourceId)?.sourceRowId;
    }
    return undefined;
  };

  timeline.forEach((row) => {
    if (row.skipped || row.step.type !== "skill" || !row.step.skill) return;
    const id = row.step.skill;
    const current = skills.get(id) ?? { id, name: row.skill?.name ?? id, casts: 0, triggers: 0, hits: 0, abrasionTotal: 0, normalTotal: 0, criticalTotal: 0, affinityTotal: 0, damage: 0, tags: row.skill?.tags ?? [] };
    if (row.kind === "rotation") current.casts += 1;
    else current.triggers += 1;
    row.actions.forEach((action, actionIndex) => {
      if (action.type === "damage") {
        const breakdown = actionBreakdowns[`${row.id}:${actionIndex}`];
        if (!breakdown) return;
        const castId = owningCastId(row);
        const cast = castId ? casts.get(castId) : undefined;
        if (cast) cast.damage += breakdown.total;
        current.hits += 1;
        current.damage += breakdown.total;
        current.abrasionTotal += breakdown.outcomeRates?.abrasion ?? 0;
        current.normalTotal += breakdown.outcomeRates?.normal ?? 0;
        current.criticalTotal += breakdown.outcomeRates?.critical ?? 0;
        current.affinityTotal += breakdown.outcomeRates?.affinity ?? 0;
      }
    });
    skills.set(id, current);
  });

  const categoryTotals = { martialArts: 0, mystic: 0, other: 0 };
  skills.forEach((skill) => {
    if (skill.tags.includes("MartialArts")) categoryTotals.martialArts += skill.damage;
    else if (skill.tags.includes("Mystic")) categoryTotals.mystic += skill.damage;
    else categoryTotals.other += skill.damage;
  });

  const damageTotals = Object.values(actionBreakdowns).reduce((total, breakdown) => ({
    physical: total.physical + breakdown.physical,
    bellstrike: total.bellstrike + breakdown.bellstrike,
    stonesplit: total.stonesplit + breakdown.stonesplit,
    silkbind: total.silkbind + breakdown.silkbind,
    bamboocut: total.bamboocut + breakdown.bamboocut,
  }), { physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 });

  return {
    skills: [...skills.values()].map(({ tags: _tags, abrasionTotal, normalTotal, criticalTotal, affinityTotal, ...skill }) => ({
      ...skill,
      abrasionRate: skill.hits > 0 ? abrasionTotal / skill.hits * 100 : 0,
      normalRate: skill.hits > 0 ? normalTotal / skill.hits * 100 : 0,
      criticalRate: skill.hits > 0 ? criticalTotal / skill.hits * 100 : 0,
      affinityRate: skill.hits > 0 ? affinityTotal / skill.hits * 100 : 0,
      percentage: percentage(skill.damage),
    }))
      .sort((left, right) => right.damage - left.damage || left.name.localeCompare(right.name)),
    casts: [...casts.values()]
      .filter((cast) => cast.damage > 0)
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order)
      .reduce<Array<{ id: string; skillId: string; name: string; casts: number; totalCastTime: number; dpsTotal: number; dpsSamples: number; damage: number }>>((groups, cast) => {
        const existing = groups.find((group) => group.skillId === cast.skillId);
        const group = existing ?? { id: cast.skillId, skillId: cast.skillId, name: cast.name, casts: 0, totalCastTime: 0, dpsTotal: 0, dpsSamples: 0, damage: 0 };
        if (!existing) groups.push(group);
        group.casts += 1;
        group.totalCastTime += cast.castTime;
        group.damage += cast.damage;
        if (cast.castTime > 0) {
          group.dpsTotal += cast.damage / cast.castTime;
          group.dpsSamples += 1;
        }
        return groups;
      }, [])
      .map(({ totalCastTime, dpsTotal, dpsSamples, ...group }) => ({
        ...group,
        averageCastTime: group.casts > 0 ? totalCastTime / group.casts : 0,
        ...(dpsSamples > 0 ? { averageDps: dpsTotal / dpsSamples } : {}),
        percentage: percentage(group.damage),
      }))
      .sort((left, right) => (right.averageDps ?? Number.NEGATIVE_INFINITY) - (left.averageDps ?? Number.NEGATIVE_INFINITY) || right.damage - left.damage || left.name.localeCompare(right.name)),
    categories: [
      { id: "martialArts", name: "Martial Arts", damage: categoryTotals.martialArts, percentage: percentage(categoryTotals.martialArts) },
      { id: "mystic", name: "Mystic", damage: categoryTotals.mystic, percentage: percentage(categoryTotals.mystic) },
      { id: "other", name: "Other", damage: categoryTotals.other, percentage: percentage(categoryTotals.other) },
    ],
    damageTypes: [
      { id: "physical", name: "Physical", damage: damageTotals.physical, percentage: percentage(damageTotals.physical) },
      { id: "bellstrike", name: "Bellstrike", damage: damageTotals.bellstrike, percentage: percentage(damageTotals.bellstrike) },
      { id: "stonesplit", name: "Stonesplit", damage: damageTotals.stonesplit, percentage: percentage(damageTotals.stonesplit) },
      { id: "silkbind", name: "Silkbind", damage: damageTotals.silkbind, percentage: percentage(damageTotals.silkbind) },
      { id: "bamboocut", name: "Bamboocut", damage: damageTotals.bamboocut, percentage: percentage(damageTotals.bamboocut) },
    ],
  };
}

function effectsForTrackedEffect(stack: number | undefined, definition: EffectDefinition | undefined) {
  if (Array.isArray(definition?.stackEffects)) {
    const stackEffects = definition.stackEffects[Math.max(0, (stack ?? 1) - 1)];
    return Array.isArray(stackEffects) ? stackEffects : [];
  }
  return definition?.effect ?? [];
}

function battleEndCutoff(timeline: TimelineRow[]) {
  const row = timeline
    .filter((candidate) => !candidate.skipped && candidate.kind === "rotation" && candidate.step.type === "event" && candidate.step.event === "BattleEnd")
    .sort((left, right) => compareTimelineTime(left.startTime, right.startTime) || left.order - right.order)[0];
  return row ? { time: row.startTime, order: row.order } : undefined;
}

function timelineDamageEntries(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  state: Pick<RotationSimulationBundle, "stats" | "attunement" | "enemy" | "derivedStats" | "weapons">,
  startAnchor: RotationSimulationBundle["startAnchor"],
  overrides: RotationSimulationVariant = { label: "" },
): RotationDamageEntry[] {
  const rules = overrides.innerWayRules ?? input.innerWayRules;
  const conditions = new Set(overrides.innerWayConditions ?? input.innerWayConditions);
  const setupEffects = overrides.setupEffects ?? input.setupEffects;
  const stats = overrides.stats ?? state.stats;
  const attunement = overrides.attunement ?? state.attunement;
  const derivedStats = overrides.stats ? calculateDerivedStats(stats, state.enemy.judgementResistance) : state.derivedStats;
  const anchorRow = timeline.find((row) => row.id === startAnchor.rowId) ?? timeline[0];
  const anchorActionIndex = startAnchor.actionIndex;
  const anchorTime = anchorRow ? anchorRow.startTime + (anchorActionIndex === undefined ? 0 : Number(anchorRow.actions[anchorActionIndex]?.time ?? 0)) : 0;
  const anchorOrder = anchorRow ? anchorRow.order + (anchorActionIndex === undefined ? 0 : 10 + anchorActionIndex) : 0;
  const battleEnd = battleEndCutoff(timeline);
  return timeline.flatMap((row) => row.skipped ? [] : row.actions.flatMap((action, actionIndex) => {
    if (action.type !== "damage") return [];
    const actionTime = row.startTime + Number(action.time ?? 0);
    const actionOrder = row.order + 10 + actionIndex;
    const anchorTimeOrder = compareTimelineTime(actionTime, anchorTime);
    if (anchorTimeOrder < 0 || (anchorTimeOrder === 0 && actionOrder < anchorOrder)) return [];
    const battleEndTimeOrder = battleEnd ? compareTimelineTime(actionTime, battleEnd.time) : -1;
    if (battleEnd && (battleEndTimeOrder > 0 || battleEndTimeOrder === 0 && actionOrder >= battleEnd.order)) return [];
    const actionState = row.actionStates[actionIndex] ?? { buffs: row.buffs, debuffs: row.debuffs, distance: row.distance, currentHPRatio: row.currentHPRatio };
    const buffs = actionState.buffs;
    const debuffs = actionState.debuffs;
    const skillTags = row.skill?.tags ?? [];
    const activeSetupEffects = setupEffects
      .filter((effect) => requirementsPass(effect.requirement, buffs, debuffs, skillTags, conditions, state.weapons))
      .map((effect) => effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect) ? effect.effect as EditableObject : effect);
    const activeInnerWayEffects = rules.filter((rule) => requirementsPass(rule.requirement, buffs, debuffs, skillTags, conditions, state.weapons)).map((rule) => rule.effect);
    const activeTrackedEffects = [...buffs, ...debuffs].flatMap((tracked) => {
      const setupModifiers = setupEffects.filter((effect) => effect.target === tracked.name && effect.modify && typeof effect.modify === "object" && !Array.isArray(effect.modify) && requirementsPass(effect.requirement, buffs, debuffs, skillTags, conditions, state.weapons))
        .map((effect) => effect.modify as EditableObject);
      const innerWayModifiers = rules.filter((rule) => rule.target === tracked.name && rule.modify && requirementsPass(rule.requirement, buffs, debuffs, skillTags, conditions, state.weapons))
        .map((rule) => rule.modify!);
      const definition = [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, { ...(input.effectDefinitions[tracked.name] ?? {}) });
      return effectsForTrackedEffect(tracked.stack, definition);
    })
      .filter((effect): effect is EditableObject => Boolean(effect) && typeof effect === "object" && !Array.isArray(effect))
      .filter((effect) => requirementsPass(effect.requirement, buffs, debuffs, skillTags, conditions, state.weapons))
      .map((effect) => effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect) ? effect.effect as EditableObject : effect);
    return [{
      id: `${row.id}:${actionIndex}`,
      action,
      context: {
        stats,
        attunement,
        skillTags,
        weapons: state.weapons,
        buffs: buffs.map((effect) => effect.name),
        enemy: state.enemy,
        derivedStats,
        effects: [...activeSetupEffects, ...activeInnerWayEffects, ...activeTrackedEffects, ...row.modifierEffects],
        distance: actionState.distance,
        currentHPRatio: actionState.currentHPRatio,
        isDot: row.kind === "dot",
      },
    }];
  }));
}

function timelineTiming(timeline: TimelineRow[], startAnchor: RotationSimulationBundle["startAnchor"]) {
  const anchorRow = timeline.find((row) => row.id === startAnchor.rowId) ?? timeline[0];
  const anchorTime = anchorRow ? anchorRow.startTime + (startAnchor.actionIndex === undefined ? 0 : Number(anchorRow.actions[startAnchor.actionIndex]?.time ?? 0)) : 0;
  const battleEnd = battleEndCutoff(timeline);
  const lastActionTime = battleEnd?.time ?? timeline.reduce((latest, row) => row.skipped ? latest : Math.max(latest, row.startTime, ...row.actions.map((action) => row.startTime + Number(action.time ?? 0))), 0);
  return { anchorTime, duration: Math.max(0, lastActionTime - anchorTime) };
}

export function calculateRotationBaseline(bundle: RotationSimulationBundle): RotationSimulationBaseline {
  const timeline = buildRotationTimeline(bundle.timeline);
  const { anchorTime, duration } = timelineTiming(timeline, bundle.startAnchor);
  const state = { stats: bundle.stats, attunement: bundle.attunement, enemy: bundle.enemy, derivedStats: bundle.derivedStats, weapons: bundle.weapons };
  const baseline = timelineDamageEntries(timeline, bundle.timeline, state, bundle.startAnchor);
  let baselineDamage = 0;
  const actionBreakdowns = Object.fromEntries(baseline.filter((entry) => entry.id).map((entry) => {
    const breakdown = calculateDamageBreakdown(entry.action, entry.context);
    baselineDamage += breakdown.total;
    return [entry.id!, breakdown];
  }));
  const metrics = calculateRotationMetrics({
    duration,
    baseline,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }, baselineDamage);
  metrics.breakdown = calculateBreakdown(timeline, actionBreakdowns, baselineDamage);
  return { metrics, timeline, anchorTime, duration, actionBreakdowns, baseline };
}

export function calculateRotationComparisons(bundle: RotationSimulationBundle, baselineResult: RotationSimulationBaseline): RotationMetrics {
  const state = { stats: bundle.stats, attunement: bundle.attunement, enemy: bundle.enemy, derivedStats: bundle.derivedStats, weapons: bundle.weapons };
  const calculationForVariant = (variant: RotationSimulationVariant) => {
    const timelineInput = variant.timeline ?? bundle.timeline;
    const variantTimeline = variant.timeline ? buildRotationTimeline(timelineInput) : baselineResult.timeline;
    return {
      entries: timelineDamageEntries(variantTimeline, timelineInput, state, bundle.startAnchor, variant),
      duration: variant.timeline ? timelineTiming(variantTimeline, bundle.startAnchor).duration : baselineResult.duration,
    };
  };
  const entryBundle: RotationCalculationBundle = {
    duration: baselineResult.duration,
    baseline: baselineResult.baseline,
    statPriority: bundle.statPriority.map((variant) => ({ label: variant.label, maxRoll: variant.maxRoll, ...calculationForVariant(variant) })),
    attunementPriority: bundle.attunementPriority.map((variant) => ({ label: variant.label, maxRoll: variant.maxRoll, ...calculationForVariant(variant) })),
    innerWayPriority: bundle.innerWayPriority.map((variant) => ({ label: variant.label, maxRoll: variant.maxRoll, ...calculationForVariant(variant) })),
    setupComparisons: Object.fromEntries(Object.entries(bundle.setupComparisons).map(([group, variants]) => [group, variants.map((variant) => ({ label: variant.label, maxRoll: variant.maxRoll, ...calculationForVariant(variant) }))])),
  };
  const metrics = calculateRotationMetrics(entryBundle, baselineResult.metrics.totalDamage);
  metrics.breakdown = baselineResult.metrics.breakdown;
  return metrics;
}

export function calculateRotationSimulation(bundle: RotationSimulationBundle): RotationSimulationResult {
  const baselineResult = calculateRotationBaseline(bundle);
  const metrics = calculateRotationComparisons(bundle, baselineResult);
  const { baseline: _baseline, ...publicResult } = baselineResult;
  return { ...publicResult, metrics };
}
