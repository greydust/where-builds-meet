import {
  calculateDamageBreakdown,
  calculateSimulatedDamageBreakdown,
  type DamageBreakdown,
  type DamageContext,
  type DamageAction,
} from "./damage";
import {
  emptyRotationBreakdown,
  type RotationBreakdown,
  type RotationMetrics,
  type RotationPriority,
} from "./rotationMetrics";
import { calculateDerivedStats } from "./effectiveStats";
import {
  buildRotationTimeline,
  compareTimelineTime,
  effectsForTrackedEffect,
  mergeEffectDefinition,
  requirementsPass,
  type EditableObject,
  type EffectDefinition,
  type InnerWayEffectRule,
  type ResourceState,
  type TimelineBuildInput,
  type TimelineRow,
  type TrackedEffect,
} from "./rotationTimeline";
import type { CharacterStats, EnemyProfile, WeaponId } from "../types";
import attunementJson from "../../data/attunement.json";
import type { AttunementStats } from "./damage";
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark";
import {
  addUnconditionalDamageEffects,
  splitStaticDamageEffect,
  subtractUnconditionalDamageEffects,
  type UnconditionalDamageEffects,
} from "./unconditionalDamageEffects";
import {
  ExpectedOutcomeBuffTracker,
  SimulatedOutcomeBuffTracker,
  outcomeBuffTick,
  type ExpectedOutcomeBuffSchedule,
  type OutcomeTriggeredBuff,
} from "./outcomeTriggeredBuffs";

export type RotationDamageEntry = {
  id?: string;
  action: DamageAction;
  context: DamageContext;
  attributionContexts?: Array<{ sourceRowId: string; context: DamageContext }>;
  timelineTime?: number;
  timelineOrder?: number;
  sourceRowId?: string;
  replay?: { sourceEntryId: string; coef: number };
  outcomeTriggeredBuffs?: OutcomeTriggeredBuff[];
  damageEvent?: {
    buffs: TrackedEffect[];
    debuffs: TrackedEffect[];
    resources: ResourceState;
    requirementState: {
      selfHPPercentage: number;
      targetHPPercentage: number;
      targetQiPercentage: number;
    };
    listeners: Array<{ key: string; rule: InnerWayEffectRule }>;
  };
};

export type RotationActionBreakdown = DamageBreakdown & { buffedDamageBySource?: Record<string, number> };

export type RotationCalculationVariant = {
  key: string;
  entries: RotationDamageEntry[];
  duration?: number;
};

export type RotationCalculationBundle = {
  duration: number;
  baseline: RotationDamageEntry[];
  statPriority: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
  }>;
  attunementPriority: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
  }>;
  innerWayPriority: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
  }>;
  setupComparisons: Record<
    string,
    Array<{ label: string; maxRoll?: number; entries: RotationDamageEntry[]; duration?: number; damage?: number }>
  >;
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
  actionBreakdowns: Record<string, RotationActionBreakdown>;
};

export type RotationSimulationBaseline = RotationSimulationResult & {
  baseline: RotationDamageEntry[];
  expectedOutcomeBuffSchedule: ExpectedOutcomeBuffSchedule;
};

const emptyBreakdown = (): DamageBreakdown => ({
  physical: 0,
  bellstrike: 0,
  stonesplit: 0,
  silkbind: 0,
  bamboocut: 0,
  total: 0,
});

function replayBreakdown(damage: number): DamageBreakdown {
  const total = Math.max(0, damage);
  return { physical: total, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total };
}

function calculateRotationDamageEntry(
  entry: RotationDamageEntry,
  resolved: Map<string, DamageBreakdown>,
  physicalAttackBonus = 0,
  random?: () => number,
): DamageBreakdown {
  let breakdown: DamageBreakdown;
  if (entry.replay) {
    const sourceDamage = resolved.get(entry.replay.sourceEntryId)?.total ?? 0;
    breakdown = replayBreakdown(sourceDamage * entry.replay.coef);
  } else {
    const damageStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    const context = physicalAttackBonus
      ? {
          ...entry.context,
          unconditionalDamageEffects: addUnconditionalDamageEffects(entry.context.unconditionalDamageEffects, {
            physicalAttackBonus,
          }),
        }
      : entry.context;
    breakdown = random
      ? calculateSimulatedDamageBreakdown(entry.action, context, random)
      : calculateDamageBreakdown(entry.action, context);
    if (import.meta.env.DEV) finishCalculationPhase("damageCalculation", damageStartedAt);
  }
  if (entry.id) resolved.set(entry.id, breakdown);
  return breakdown;
}

export type ResolvedRotationDamage = {
  entry: RotationDamageEntry;
  breakdown: DamageBreakdown;
  expectedBuffStacks?: Record<string, number>;
  outcomePhysicalAttackBonus?: number;
};

function createRotationDamageResolver(random?: () => number, schedule?: ExpectedOutcomeBuffSchedule) {
  const resolved = new Map<string, DamageBreakdown>();
  const expectedTracker = random ? undefined : new ExpectedOutcomeBuffTracker();
  const simulatedTracker = random ? new SimulatedOutcomeBuffTracker() : undefined;
  const resolve = (entry: RotationDamageEntry): ResolvedRotationDamage => {
    const tick = outcomeBuffTick(entry.timelineTime);
    const expectedBuffStacks: Record<string, number> = {};
    let physicalAttackBonus = 0;
    for (const buff of entry.outcomeTriggeredBuffs ?? []) {
      const stack = random
        ? simulatedTracker!.stack(buff, tick)
        : (schedule?.[entry.id ?? ""]?.[buff.name] ?? expectedTracker!.expectedStack(buff, tick));
      expectedBuffStacks[buff.name] = stack;
      physicalAttackBonus += stack * buff.physicalAttackBonusPerStack;
    }
    const breakdown = calculateRotationDamageEntry(entry, resolved, physicalAttackBonus, random);
    if (!entry.replay && breakdown.total > 0) {
      for (const buff of entry.outcomeTriggeredBuffs ?? []) {
        if (random) {
          if (breakdown.outcome === buff.outcome) simulatedTracker!.resolveOutcome(buff, tick);
        } else if (!schedule) {
          expectedTracker!.resolveOutcome(buff, tick, breakdown.outcomeRates?.[buff.outcome] ?? 0);
        }
      }
    }
    return {
      entry,
      breakdown,
      ...(Object.keys(expectedBuffStacks).length
        ? { expectedBuffStacks, outcomePhysicalAttackBonus: physicalAttackBonus }
        : {}),
    };
  };
  return { resolve };
}

export function calculateRotationDamageSequence(
  entries: RotationDamageEntry[],
  random?: () => number,
  schedule?: ExpectedOutcomeBuffSchedule,
) {
  const resolver = createRotationDamageResolver(random, schedule);
  return entries.map(resolver.resolve);
}

type ResolvedRotationDamageSequence = ReturnType<typeof calculateRotationDamageSequence>;

function expectedOutcomeBuffSchedule(sequence: ResolvedRotationDamageSequence): ExpectedOutcomeBuffSchedule {
  return Object.fromEntries(
    sequence.flatMap(({ entry, expectedBuffStacks }) =>
      entry.id && expectedBuffStacks ? [[entry.id, { ...expectedBuffStacks }] as const] : [],
    ),
  );
}

function averageExpectedBuffStack(sequence: ResolvedRotationDamageSequence, buffName: string) {
  const stacks = sequence.flatMap(({ entry, expectedBuffStacks }) =>
    !entry.replay && expectedBuffStacks?.[buffName] !== undefined ? [expectedBuffStacks[buffName]] : [],
  );
  return stacks.length ? stacks.reduce((total, stack) => total + stack, 0) / stacks.length : undefined;
}

function contextWithOutcomePhysicalAttackBonus(context: DamageContext, bonus: number | undefined): DamageContext {
  if (!bonus) return context;
  return {
    ...context,
    unconditionalDamageEffects: addUnconditionalDamageEffects(context.unconditionalDamageEffects, {
      physicalAttackBonus: bonus,
    }),
  };
}

function sumResolvedSequence(sequence: ResolvedRotationDamageSequence) {
  return sequence.reduce((total, { breakdown }) => {
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

function sumEntries(entries: RotationDamageEntry[]) {
  return sumResolvedSequence(calculateRotationDamageSequence(entries));
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
  variants: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
  }>,
  order: "ascending" | "descending" = "descending",
) {
  return sortRotationPriorityRows(
    variants.map(({ label, maxRoll, entries, duration: variantDuration = duration, damage }) =>
      priorityRow(
        label,
        baselineDps,
        variantDuration > 0 ? (damage ?? sumEntries(entries).total) / variantDuration : 0,
        maxRoll,
      ),
    ),
    order,
  );
}

export function sortRotationPriorityRows(rows: RotationPriority[], order: "ascending" | "descending" = "descending") {
  return [...rows].sort((left, right) =>
    order === "ascending" ? left.dpsDifference - right.dpsDifference : right.dpsDifference - left.dpsDifference,
  );
}

export function sortAttunementPriorityRows(rows: RotationPriority[]) {
  const penetrationLabels = new Set(
    Object.values(attunementJson)
      .filter((definition) =>
        Object.keys(definition.effect?.stat ?? {}).some(
          (key) => key === "physicalPenetration" || key === "formlessPenetration",
        ),
      )
      .map((definition) => definition.name),
  );
  return [
    ...sortRotationPriorityRows(rows.filter((row) => penetrationLabels.has(row.label))),
    ...sortRotationPriorityRows(rows.filter((row) => !penetrationLabels.has(row.label))),
  ];
}

/**
 * Pure calculation entry point. It has no React or browser storage dependency;
 * callers build the timeline and provide all state needed for each variant.
 */
export function calculateRotationMetrics(
  bundle: RotationCalculationBundle,
  baselineDamageOverride?: number,
): RotationMetrics {
  const duration = Math.max(0, bundle.duration);
  const baselineDamage = baselineDamageOverride ?? sumEntries(bundle.baseline).total;
  const baselineDps = duration > 0 ? baselineDamage / duration : 0;
  const setupComparisons = Object.fromEntries(
    Object.entries(bundle.setupComparisons).map(([group, variants]) => [
      group,
      calculatePriorityRows(baselineDps, duration, variants),
    ]),
  );

  const attunementRows = calculatePriorityRows(baselineDps, duration, bundle.attunementPriority);
  return {
    totalDamage: baselineDamage,
    dps: baselineDps,
    breakdown: emptyRotationBreakdown(),
    statPriority: calculatePriorityRows(baselineDps, duration, bundle.statPriority),
    attunementPriority: sortAttunementPriorityRows(attunementRows),
    innerWayPriority: calculatePriorityRows(baselineDps, duration, bundle.innerWayPriority, "ascending"),
    setupComparisons,
  };
}

function calculateBreakdown(
  timeline: TimelineRow[],
  actionBreakdowns: Record<string, RotationActionBreakdown>,
  totalDamage: number,
): RotationBreakdown {
  const percentage = (damage: number) => (totalDamage > 0 ? (damage / totalDamage) * 100 : 0);
  const skills = new Map<
    string,
    {
      id: string;
      name: string;
      casts: number;
      triggers: number;
      hits: number;
      abrasionTotal: number;
      normalTotal: number;
      criticalTotal: number;
      affinityTotal: number;
      damage: number;
      tags: string[];
    }
  >();
  const castRows = timeline.filter(
    (row) =>
      !row.skipped &&
      row.step.type === "skill" &&
      row.step.skill &&
      (row.kind === "rotation" || (row.kind === "trigger" && row.triggerSource === "innerWay")),
  );
  const casts = new Map(
    castRows.map((row) => [
      row.id,
      {
        id: row.id,
        skillId: row.step.type === "skill" ? (row.step.skill ?? "") : "",
        name: row.skill?.name ?? (row.step.type === "skill" ? (row.step.skill ?? "") : ""),
        castTime: row.effectiveCastTime,
        damage: 0,
        buffedDamage: 0,
        time: row.startTime,
        order: row.order,
      },
    ]),
  );
  const rowsById = new Map(timeline.map((row) => [row.id, row]));
  const orderedRotationCasts = castRows
    .filter((row) => row.kind === "rotation")
    .sort(
      (left, right) =>
        (left.rotationIndex ?? Number.MAX_SAFE_INTEGER) - (right.rotationIndex ?? Number.MAX_SAFE_INTEGER),
    );
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
    const current = skills.get(id) ?? {
      id,
      name: row.skill?.name ?? id,
      casts: 0,
      triggers: 0,
      hits: 0,
      abrasionTotal: 0,
      normalTotal: 0,
      criticalTotal: 0,
      affinityTotal: 0,
      damage: 0,
      tags: row.skill?.tags ?? [],
    };
    if (row.kind === "rotation") current.casts += 1;
    else current.triggers += 1;
    row.actions.forEach((action, actionIndex) => {
      if (action.type === "damage" || action.type === "replay") {
        const breakdown = actionBreakdowns[`${row.id}:${actionIndex}`];
        if (!breakdown) return;
        const castId = owningCastId(row);
        const cast = castId ? casts.get(castId) : undefined;
        if (cast) cast.damage += breakdown.total;
        Object.entries(breakdown.buffedDamageBySource ?? {}).forEach(([sourceRowId, damage]) => {
          const sourceCast = casts.get(sourceRowId);
          if (sourceCast) sourceCast.buffedDamage += damage;
        });
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

  const damageTotals = Object.values(actionBreakdowns).reduce(
    (total, breakdown) => ({
      physical: total.physical + breakdown.physical,
      bellstrike: total.bellstrike + breakdown.bellstrike,
      stonesplit: total.stonesplit + breakdown.stonesplit,
      silkbind: total.silkbind + breakdown.silkbind,
      bamboocut: total.bamboocut + breakdown.bamboocut,
    }),
    { physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 },
  );

  return {
    skills: [...skills.values()]
      .map(({ tags: _tags, abrasionTotal, normalTotal, criticalTotal, affinityTotal, ...skill }) => ({
        ...skill,
        abrasionRate: skill.hits > 0 ? (abrasionTotal / skill.hits) * 100 : 0,
        normalRate: skill.hits > 0 ? (normalTotal / skill.hits) * 100 : 0,
        criticalRate: skill.hits > 0 ? (criticalTotal / skill.hits) * 100 : 0,
        affinityRate: skill.hits > 0 ? (affinityTotal / skill.hits) * 100 : 0,
        percentage: percentage(skill.damage),
      }))
      .sort((left, right) => right.damage - left.damage || left.name.localeCompare(right.name)),
    casts: [...casts.values()]
      .filter((cast) => cast.damage > 0 || cast.buffedDamage > 0)
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order)
      .reduce<
        Array<{
          id: string;
          skillId: string;
          name: string;
          casts: number;
          totalCastTime: number;
          dpsTotal: number;
          dpsWithBuffTotal: number;
          dpsSamples: number;
          damage: number;
          buffedDamage: number;
        }>
      >((groups, cast) => {
        const existing = groups.find((group) => group.skillId === cast.skillId);
        const group = existing ?? {
          id: cast.skillId,
          skillId: cast.skillId,
          name: cast.name,
          casts: 0,
          totalCastTime: 0,
          dpsTotal: 0,
          dpsWithBuffTotal: 0,
          dpsSamples: 0,
          damage: 0,
          buffedDamage: 0,
        };
        if (!existing) groups.push(group);
        group.casts += 1;
        group.totalCastTime += cast.castTime;
        group.damage += cast.damage;
        group.buffedDamage += cast.buffedDamage;
        if (cast.castTime > 0) {
          group.dpsTotal += cast.damage / cast.castTime;
          group.dpsWithBuffTotal += (cast.damage + cast.buffedDamage) / cast.castTime;
          group.dpsSamples += 1;
        }
        return groups;
      }, [])
      .map(({ totalCastTime, dpsTotal, dpsWithBuffTotal, dpsSamples, buffedDamage, ...group }) => ({
        ...group,
        averageCastTime: group.casts > 0 ? totalCastTime / group.casts : 0,
        averageDamage: group.casts > 0 ? group.damage / group.casts : 0,
        ...(dpsSamples > 0 ? { averageDps: dpsTotal / dpsSamples } : {}),
        ...(buffedDamage > 0
          ? {
              averageDamageWithBuff: group.casts > 0 ? (group.damage + buffedDamage) / group.casts : 0,
              damageWithBuff: group.damage + buffedDamage,
              ...(dpsSamples > 0 ? { averageDpsWithBuff: dpsWithBuffTotal / dpsSamples } : {}),
            }
          : {}),
        percentage: percentage(group.damage),
      }))
      .sort(
        (left, right) =>
          (right.averageDpsWithBuff ?? right.averageDps ?? Number.NEGATIVE_INFINITY) -
            (left.averageDpsWithBuff ?? left.averageDps ?? Number.NEGATIVE_INFINITY) ||
          (right.damageWithBuff ?? right.damage) - (left.damageWithBuff ?? left.damage) ||
          left.name.localeCompare(right.name),
      ),
    categories: [
      {
        id: "martialArts",
        name: "Martial Arts",
        damage: categoryTotals.martialArts,
        percentage: percentage(categoryTotals.martialArts),
      },
      { id: "mystic", name: "Mystic", damage: categoryTotals.mystic, percentage: percentage(categoryTotals.mystic) },
      { id: "other", name: "Other", damage: categoryTotals.other, percentage: percentage(categoryTotals.other) },
    ],
    damageTypes: [
      {
        id: "physical",
        name: "Physical",
        damage: damageTotals.physical,
        percentage: percentage(damageTotals.physical),
      },
      {
        id: "bellstrike",
        name: "Bellstrike",
        damage: damageTotals.bellstrike,
        percentage: percentage(damageTotals.bellstrike),
      },
      {
        id: "stonesplit",
        name: "Stonesplit",
        damage: damageTotals.stonesplit,
        percentage: percentage(damageTotals.stonesplit),
      },
      {
        id: "silkbind",
        name: "Silkbind",
        damage: damageTotals.silkbind,
        percentage: percentage(damageTotals.silkbind),
      },
      {
        id: "bamboocut",
        name: "Bamboocut",
        damage: damageTotals.bamboocut,
        percentage: percentage(damageTotals.bamboocut),
      },
    ],
  };
}

function battleEndCutoff(timeline: TimelineRow[]) {
  const row = timeline
    .filter(
      (candidate) =>
        !candidate.skipped &&
        candidate.kind === "rotation" &&
        candidate.step.type === "event" &&
        candidate.step.event === "BattleEnd",
    )
    .sort((left, right) => compareTimelineTime(left.startTime, right.startTime) || left.order - right.order)[0];
  return row ? { time: row.startTime, order: row.order } : undefined;
}

const skillStaticRequirementTargets = new Set(["skillTag", "martialArt", "equippedMartialArt"]);

function requirementNodeIsSkillStatic(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(requirementNodeIsSkillStatic);
  if (!node || typeof node !== "object") return false;
  const condition = node as EditableObject;
  switch (condition.operator) {
    case "or":
      return Array.isArray(condition.operand) && condition.operand.every(requirementNodeIsSkillStatic);
    case "not":
      return (
        Array.isArray(condition.operand) &&
        condition.operand.length === 1 &&
        requirementNodeIsSkillStatic(condition.operand[0])
      );
    default:
      return typeof condition.target === "string" && skillStaticRequirementTargets.has(condition.target);
  }
}

function requirementIsSkillStatic(requirement: unknown): boolean {
  if (requirement === undefined) return true;
  return Array.isArray(requirement)
    ? requirement.every(requirementNodeIsSkillStatic)
    : requirementNodeIsSkillStatic(requirement);
}

function unwrappedEffect(effect: EditableObject): EditableObject {
  return effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
    ? (effect.effect as EditableObject)
    : effect;
}

function outcomeTriggeredBuffsFor(
  setupEffects: EditableObject[],
  effectDefinitions: Record<string, EffectDefinition>,
): OutcomeTriggeredBuff[] {
  const buffs = new Map<string, OutcomeTriggeredBuff>();
  for (const setupEffect of setupEffects) {
    const trigger =
      setupEffect.trigger && typeof setupEffect.trigger === "object" && !Array.isArray(setupEffect.trigger)
        ? (setupEffect.trigger as EditableObject)
        : undefined;
    const action =
      trigger?.action && typeof trigger.action === "object" && !Array.isArray(trigger.action)
        ? (trigger.action as EditableObject)
        : undefined;
    if (
      trigger?.event !== "damageOutcome" ||
      trigger.outcome !== "affinity" ||
      action?.type !== "apply" ||
      action.target !== "self" ||
      typeof action.value !== "string"
    )
      continue;
    const definition = effectDefinitions[action.value];
    if (
      typeof definition?.duration !== "number" ||
      !Number.isFinite(definition.duration) ||
      typeof definition.maxStack !== "number" ||
      !Number.isFinite(definition.maxStack)
    )
      continue;
    const firstStackEffects = effectsForTrackedEffect(1, definition);
    const physicalAttackBonusPerStack = firstStackEffects.reduce<number>((total, effect) => {
      if (!effect || typeof effect !== "object" || Array.isArray(effect)) return total;
      const unwrapped = unwrappedEffect(effect as EditableObject);
      return (
        total +
        (typeof unwrapped.physicalAttackBonus === "number" && Number.isFinite(unwrapped.physicalAttackBonus)
          ? unwrapped.physicalAttackBonus
          : 0)
      );
    }, 0);
    buffs.set(action.value, {
      name: action.value,
      outcome: "affinity",
      durationTicks: outcomeBuffTick(definition.duration),
      maxStack: Math.max(1, Math.floor(definition.maxStack)),
      physicalAttackBonusPerStack,
    });
  }
  return [...buffs.values()];
}

function timelineDamageEntries(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  state: Pick<RotationSimulationBundle, "stats" | "attunement" | "enemy" | "derivedStats" | "weapons">,
  startAnchor: RotationSimulationBundle["startAnchor"],
  overrides: RotationSimulationVariant = { label: "" },
  updateTimelineState = false,
  expectedBuffSchedule?: ExpectedOutcomeBuffSchedule,
): { entries: RotationDamageEntry[]; resolvedSequence?: ResolvedRotationDamageSequence } {
  const rules = overrides.innerWayRules ?? input.innerWayRules;
  const damageListeners = rules.flatMap((rule, index) =>
    rule.listen?.event === "damage" ? [{ key: `${rule.source}:T${rule.tier}:${index}`, rule }] : [],
  );
  const conditions = new Set(overrides.innerWayConditions ?? input.innerWayConditions);
  const setupEffects = overrides.setupEffects ?? input.setupEffects;
  const outcomeTriggeredBuffs = outcomeTriggeredBuffsFor(setupEffects, input.effectDefinitions);
  const staticSetupEffects = setupEffects.filter((effect) => requirementIsSkillStatic(effect.requirement));
  const dynamicSetupEffects = setupEffects.filter((effect) => !requirementIsSkillStatic(effect.requirement));
  const staticInnerWayRules = rules.filter((rule) => requirementIsSkillStatic(rule.requirement));
  const dynamicInnerWayRules = rules.filter((rule) => !requirementIsSkillStatic(rule.requirement));
  const skillStaticEffectCache = new Map<
    string,
    { aggregated: UnconditionalDamageEffects; remaining: EditableObject[] }
  >();
  const skillStaticEffectsFor = (skillTags: string[]) => {
    const key = [...skillTags].sort().join("\u001f");
    const cached = skillStaticEffectCache.get(key);
    if (cached) return cached;
    const startedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    const applicableEffects = [
      ...staticSetupEffects
        .filter((effect) => requirementsPass(effect.requirement, [], [], skillTags, conditions, state.weapons, {}, {}))
        .map(unwrappedEffect),
      ...staticInnerWayRules
        .filter((rule) => requirementsPass(rule.requirement, [], [], skillTags, conditions, state.weapons, {}, {}))
        .map((rule) => rule.effect),
    ];
    let aggregated: UnconditionalDamageEffects = {};
    const remaining: EditableObject[] = [];
    for (const effect of applicableEffects) {
      const split = splitStaticDamageEffect(effect, state.weapons);
      aggregated = addUnconditionalDamageEffects(aggregated, split.aggregated);
      if (split.remaining) remaining.push(split.remaining);
    }
    const resolved = { aggregated, remaining };
    skillStaticEffectCache.set(key, resolved);
    if (import.meta.env.DEV) finishCalculationPhase("skillStaticEffectAggregation", startedAt);
    return resolved;
  };
  const stats = overrides.stats ?? state.stats;
  const attunement = overrides.attunement ?? state.attunement;
  const derivedStats = overrides.stats
    ? calculateDerivedStats(stats, state.enemy.judgementResistance)
    : state.derivedStats;
  const anchorRow = timeline.find((row) => row.id === startAnchor.rowId) ?? timeline[0];
  const anchorActionIndex = startAnchor.actionIndex;
  const anchorTime = anchorRow
    ? anchorRow.startTime +
      (anchorActionIndex === undefined ? 0 : Number(anchorRow.actions[anchorActionIndex]?.time ?? 0))
    : 0;
  const anchorOrder = anchorRow ? anchorRow.order + (anchorActionIndex === undefined ? 0 : 10 + anchorActionIndex) : 0;
  const battleEnd = battleEndCutoff(timeline);
  const damageEntryStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const damageEntries = timeline.flatMap((row) =>
    row.skipped
      ? []
      : row.actions.flatMap((action, actionIndex) => {
          if (action.type !== "damage") return [];
          const actionTime = row.startTime + Number(action.time ?? 0);
          const actionOrder = row.order + 10 + actionIndex;
          const anchorTimeOrder = compareTimelineTime(actionTime, anchorTime);
          if (anchorTimeOrder < 0 || (anchorTimeOrder === 0 && actionOrder < anchorOrder)) return [];
          const battleEndTimeOrder = battleEnd ? compareTimelineTime(actionTime, battleEnd.time) : -1;
          if (battleEnd && (battleEndTimeOrder > 0 || (battleEndTimeOrder === 0 && actionOrder >= battleEnd.order)))
            return [];
          const actionState = row.actionStates[actionIndex] ?? {
            buffs: row.buffs,
            debuffs: row.debuffs,
            distance: row.distance,
            currentHPRatio: row.currentHPRatio,
            targetHPRatio: row.targetHPRatio,
            targetQiRatio: row.targetQiRatio,
            resources: row.resources,
            unconditionalDamageEffects: row.unconditionalDamageEffects,
          };
          const buffs = actionState.buffs;
          const debuffs = actionState.debuffs;
          const resources = actionState.resources;
          const skillTags = row.actionSkillTags?.[actionIndex] ?? row.skill?.tags ?? [];
          const skillStaticEffects = skillStaticEffectsFor(skillTags);
          const requirementState = {
            selfHPPercentage: actionState.currentHPRatio * 100,
            targetHPPercentage: actionState.targetHPRatio * 100,
            targetQiPercentage: actionState.targetQiRatio * 100,
          };
          const effectsForState = (
            currentBuffs: typeof buffs,
            currentDebuffs: typeof debuffs,
            currentResources: typeof resources,
            currentRequirementState = requirementState,
          ) => {
            const effectStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
            const activeSetupEffects = dynamicSetupEffects
              .filter((effect) =>
                requirementsPass(
                  effect.requirement,
                  currentBuffs,
                  currentDebuffs,
                  skillTags,
                  conditions,
                  state.weapons,
                  currentResources,
                  currentRequirementState,
                ),
              )
              .map(unwrappedEffect);
            const activeInnerWayEffects = dynamicInnerWayRules
              .filter((rule) =>
                requirementsPass(
                  rule.requirement,
                  currentBuffs,
                  currentDebuffs,
                  skillTags,
                  conditions,
                  state.weapons,
                  currentResources,
                  currentRequirementState,
                ),
              )
              .map((rule) => rule.effect);
            const activeTrackedEffects = [...currentBuffs, ...currentDebuffs]
              .flatMap((tracked) => {
                if (tracked.perHitEffectRules) return tracked.perHitEffectRules;
                const setupModifiers = setupEffects
                  .filter(
                    (effect) =>
                      effect.target === tracked.name &&
                      effect.modify &&
                      typeof effect.modify === "object" &&
                      !Array.isArray(effect.modify) &&
                      requirementsPass(
                        effect.requirement,
                        currentBuffs,
                        currentDebuffs,
                        skillTags,
                        conditions,
                        state.weapons,
                        currentResources,
                        currentRequirementState,
                      ),
                  )
                  .map((effect) => effect.modify as EditableObject);
                const innerWayModifiers = rules
                  .filter(
                    (rule) =>
                      rule.target === tracked.name &&
                      rule.modify &&
                      requirementsPass(
                        rule.requirement,
                        currentBuffs,
                        currentDebuffs,
                        skillTags,
                        conditions,
                        state.weapons,
                        currentResources,
                        currentRequirementState,
                      ),
                  )
                  .map((rule) => rule.modify!);
                const definition = [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, {
                  ...(input.effectDefinitions[tracked.name] ?? {}),
                });
                return effectsForTrackedEffect(tracked.stack, definition);
              })
              .filter(
                (effect): effect is EditableObject =>
                  Boolean(effect) && typeof effect === "object" && !Array.isArray(effect),
              )
              .filter((effect) =>
                requirementsPass(
                  effect.requirement,
                  currentBuffs,
                  currentDebuffs,
                  skillTags,
                  conditions,
                  state.weapons,
                  currentResources,
                  currentRequirementState,
                ),
              )
              .map((effect) =>
                effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
                  ? (effect.effect as EditableObject)
                  : effect,
              );
            const resolvedEffects = [
              ...skillStaticEffects.remaining,
              ...activeSetupEffects,
              ...activeInnerWayEffects,
              ...activeTrackedEffects,
              ...(row.actionModifierEffects?.[actionIndex] ?? row.modifierEffects),
            ];
            if (import.meta.env.DEV) finishCalculationPhase("effectResolution", effectStartedAt);
            return resolvedEffects;
          };
          const context: DamageContext = {
            stats,
            attunement,
            skillTags,
            weapons: state.weapons,
            buffs: buffs.map((effect) => effect.name),
            enemy: state.enemy,
            derivedStats,
            effects: effectsForState(buffs, debuffs, resources),
            unconditionalDamageEffects: addUnconditionalDamageEffects(
              actionState.unconditionalDamageEffects,
              skillStaticEffects.aggregated,
            ),
            distance: actionState.distance,
            currentHPRatio: actionState.currentHPRatio,
            targetHPRatio: actionState.targetHPRatio,
            isDot: row.kind === "dot",
          };
          const attributionContexts = buffs.flatMap((tracked) => {
            if (tracked.collectBoostDamage !== tracked.name || !tracked.sourceRowId) return [];
            const counterfactualBuffs = buffs.filter((candidate) => candidate !== tracked);
            return [
              {
                sourceRowId: tracked.sourceRowId,
                context: {
                  ...context,
                  buffs: counterfactualBuffs.map((effect) => effect.name),
                  effects: effectsForState(counterfactualBuffs, debuffs, resources),
                  unconditionalDamageEffects: subtractUnconditionalDamageEffects(
                    context.unconditionalDamageEffects,
                    tracked.unconditionalDamageEffects,
                  ),
                },
              },
            ];
          });
          return [
            {
              id: `${row.id}:${actionIndex}`,
              action,
              context,
              timelineTime: actionTime,
              timelineOrder: actionOrder,
              sourceRowId: row.sourceRowId ?? row.id,
              ...(outcomeTriggeredBuffs.length ? { outcomeTriggeredBuffs } : {}),
              ...(damageListeners.length
                ? {
                    damageEvent: {
                      buffs: buffs.map((effect) => ({ ...effect })),
                      debuffs: debuffs.map((effect) => ({ ...effect })),
                      resources: { ...resources },
                      requirementState: { ...requirementState },
                      listeners: damageListeners,
                    },
                  }
                : {}),
              updateTargetHPRatio: (ratio: number) => {
                const currentRequirementState = { ...requirementState, targetHPPercentage: ratio * 100 };
                context.targetHPRatio = ratio;
                context.effects = effectsForState(buffs, debuffs, resources, currentRequirementState);
                attributionContexts.forEach(({ context: attributionContext }) => {
                  const counterfactualBuffs = buffs.filter((tracked) =>
                    attributionContext.buffs.includes(tracked.name),
                  );
                  attributionContext.targetHPRatio = ratio;
                  attributionContext.effects = effectsForState(
                    counterfactualBuffs,
                    debuffs,
                    resources,
                    currentRequirementState,
                  );
                });
              },
              ...(attributionContexts.length ? { attributionContexts } : {}),
            },
          ];
        }),
  ) as Array<
    RotationDamageEntry & { timelineTime: number; timelineOrder: number; updateTargetHPRatio: (ratio: number) => void }
  >;
  if (import.meta.env.DEV) finishCalculationPhase("damageEntryConstruction", damageEntryStartedAt);
  const hpEvents = timeline.flatMap((row) =>
    row.skipped
      ? []
      : row.actions.flatMap((action, actionIndex) =>
          action.type === "setTargetHP" &&
          typeof action.targetHPRatio === "number" &&
          Number.isFinite(action.targetHPRatio)
            ? [
                {
                  kind: "set" as const,
                  time: row.startTime + Number(action.time ?? 0),
                  order: row.order + 10 + actionIndex,
                  priority: 1,
                  ratio: Math.min(1, Math.max(0, action.targetHPRatio)),
                },
              ]
            : [],
        ),
  );
  const targetMaxHP = input.rotation.targetHP;
  const usesTargetDamage = typeof targetMaxHP === "number" && targetMaxHP > 0;
  const stripTargetHPUpdater = (entry: (typeof damageEntries)[number]): RotationDamageEntry => {
    const { updateTargetHPRatio: _updateTargetHPRatio, ...strippedEntry } = entry;
    return strippedEntry;
  };
  const requiresOrderedDamageResolution = damageListeners.length > 0 || hpEvents.length > 0 || usesTargetDamage;
  if (!requiresOrderedDamageResolution) {
    return { entries: damageEntries.map(stripTargetHPUpdater) };
  }
  let targetHPRatio = 1;
  const targetHPStateSnapshots = updateTimelineState
    ? timeline.flatMap((row) => {
        if (row.skipped) return [];
        return [
          {
            kind: "rowState" as const,
            time: row.startTime,
            order: row.order,
            priority: 0,
            update: (ratio: number) => {
              row.targetHPRatio = ratio;
            },
          },
          ...row.actions.flatMap((action, actionIndex) => {
            const actionState = row.actionStates[actionIndex];
            if (!actionState) return [];
            return [
              {
                kind: "actionState" as const,
                time: row.startTime + Number(action.time ?? 0),
                order: row.order + 10 + actionIndex,
                priority: 0,
                update: (ratio: number) => {
                  actionState.targetHPRatio = ratio;
                },
              },
            ];
          }),
        ];
      })
    : [];
  type OrderedItem =
    | (typeof targetHPStateSnapshots)[number]
    | (typeof hpEvents)[number]
    | {
        kind: "damage";
        time: number;
        order: number;
        priority: number;
        entry: (typeof damageEntries)[number];
      };
  const compareOrderedItems = (left: OrderedItem, right: OrderedItem) =>
    compareTimelineTime(left.time, right.time) || left.order - right.order || left.priority - right.priority;
  const damageEventOrderingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const ordered: OrderedItem[] = [
    ...targetHPStateSnapshots,
    ...hpEvents,
    ...damageEntries.map((entry) => ({
      kind: "damage" as const,
      time: entry.timelineTime,
      order: entry.timelineOrder,
      priority: 1,
      entry,
    })),
  ].sort(compareOrderedItems);
  if (import.meta.env.DEV) finishCalculationPhase("damageEventOrdering", damageEventOrderingStartedAt);
  const damageResolver = createRotationDamageResolver(undefined, expectedBuffSchedule);
  const resolvedByEntry = new Map<(typeof damageEntries)[number], ResolvedRotationDamage>();
  const listenerCooldowns = new Map<string, number>();
  let replayInvocation = 0;
  let replayOrder = timeline.reduce((maximum, row) => Math.max(maximum, row.order), 0) + 1;
  let orderedIndex = 0;
  const insertOrderedItem = (newItem: OrderedItem) => {
    let low = orderedIndex;
    let high = ordered.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (compareOrderedItems(ordered[middle], newItem) <= 0) low = middle + 1;
      else high = middle;
    }
    ordered.splice(low, 0, newItem);
  };
  const enqueueReplay = (
    sourceEntry: (typeof damageEntries)[number],
    listenerKey: string,
    listener: EditableObject,
  ) => {
    const replayConstructionStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    const finishReplayConstruction = () => {
      if (import.meta.env.DEV) finishCalculationPhase("replayConstruction", replayConstructionStartedAt);
    };
    if (!sourceEntry.id || typeof sourceEntry.timelineTime !== "number") {
      finishReplayConstruction();
      return false;
    }
    const triggerAction =
      listener.action && typeof listener.action === "object" && !Array.isArray(listener.action)
        ? (listener.action as EditableObject)
        : undefined;
    const parameter =
      triggerAction?.parameter && typeof triggerAction.parameter === "object" && !Array.isArray(triggerAction.parameter)
        ? (triggerAction.parameter as EditableObject)
        : undefined;
    if (
      triggerAction?.type !== "trigger" ||
      typeof triggerAction.value !== "string" ||
      parameter?.damage !== "event.damage"
    ) {
      finishReplayConstruction();
      return false;
    }
    const replaySkill = input.skills[triggerAction.value];
    if (!replaySkill?.tags?.includes("Replayed") || !Array.isArray(replaySkill.action)) {
      finishReplayConstruction();
      return false;
    }
    const invocationId = `replay-${listenerKey}-${sourceEntry.id}-${replayInvocation++}`;
    const rowOrder = replayOrder++;
    const replayActions = (replaySkill.action as EditableObject[]).map((action) => ({ ...action }));
    const replayRow: TimelineRow = {
      id: invocationId,
      kind: "trigger",
      sourceRowId: sourceEntry.sourceRowId,
      triggerSource: "innerWay",
      order: rowOrder,
      step: { type: "skill", skill: triggerAction.value },
      startTime: sourceEntry.timelineTime,
      distance: sourceEntry.context.distance ?? 1,
      currentHP: (sourceEntry.context.currentHPRatio ?? 1) * (input.maxHP ?? 0),
      currentHPRatio: sourceEntry.context.currentHPRatio ?? 1,
      targetHPRatio,
      targetQiRatio:
        typeof sourceEntry.damageEvent?.requirementState.targetQiPercentage === "number"
          ? sourceEntry.damageEvent.requirementState.targetQiPercentage / 100
          : 1,
      resources: { ...(sourceEntry.damageEvent?.resources ?? {}) },
      effectiveCastTime: typeof replaySkill.castTime === "number" ? replaySkill.castTime : 0,
      skill: replaySkill,
      actions: replayActions,
      buffs: [...(sourceEntry.damageEvent?.buffs ?? [])],
      debuffs: [...(sourceEntry.damageEvent?.debuffs ?? [])],
      modifierEffects: [],
      actionStates: {},
    };
    const replayEntries = replayActions.flatMap((action, actionIndex) => {
      if (action.type !== "replay" || typeof action.coef !== "number" || !Number.isFinite(action.coef)) return [];
      const actionTime = replayRow.startTime + Number(action.time ?? 0);
      const actionOrder = replayRow.order + 10 + actionIndex;
      const battleEndTimeOrder = battleEnd ? compareTimelineTime(actionTime, battleEnd.time) : -1;
      if (battleEnd && (battleEndTimeOrder > 0 || (battleEndTimeOrder === 0 && actionOrder >= battleEnd.order)))
        return [];
      const context: DamageContext = { ...sourceEntry.context, targetHPRatio };
      replayRow.actionStates[actionIndex] = {
        buffs: [...replayRow.buffs],
        debuffs: [...replayRow.debuffs],
        distance: replayRow.distance,
        currentHP: replayRow.currentHP,
        currentHPRatio: replayRow.currentHPRatio,
        targetHPRatio,
        targetQiRatio: replayRow.targetQiRatio,
        resources: { ...replayRow.resources },
      };
      const entry = {
        id: `${invocationId}:${actionIndex}`,
        action,
        context,
        timelineTime: actionTime,
        timelineOrder: actionOrder,
        sourceRowId: sourceEntry.sourceRowId,
        replay: { sourceEntryId: sourceEntry.id!, coef: action.coef },
        updateTargetHPRatio: (ratio: number) => {
          context.targetHPRatio = ratio;
          replayRow.targetHPRatio = ratio;
          replayRow.actionStates[actionIndex].targetHPRatio = ratio;
        },
      };
      return [entry];
    });
    if (replayEntries.length === 0) {
      finishReplayConstruction();
      return false;
    }
    if (updateTimelineState) timeline.push(replayRow);
    damageEntries.push(...replayEntries);
    finishReplayConstruction();
    const replayQueueInsertionStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    replayEntries.forEach((entry) =>
      insertOrderedItem({
        kind: "damage" as const,
        time: entry.timelineTime,
        order: entry.timelineOrder,
        priority: 1,
        entry,
      }),
    );
    if (import.meta.env.DEV) finishCalculationPhase("replayQueueInsertion", replayQueueInsertionStartedAt);
    return true;
  };
  const traversalStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  while (orderedIndex < ordered.length) {
    const item = ordered[orderedIndex++];
    const targetStateStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    if (item.kind === "set") {
      targetHPRatio = item.ratio;
      if (import.meta.env.DEV) finishCalculationPhase("targetStatePropagation", targetStateStartedAt);
      continue;
    }
    if (item.kind === "rowState" || item.kind === "actionState") {
      item.update(targetHPRatio);
      if (import.meta.env.DEV) finishCalculationPhase("targetStatePropagation", targetStateStartedAt);
      continue;
    }
    item.entry.updateTargetHPRatio(targetHPRatio);
    if (import.meta.env.DEV) finishCalculationPhase("targetStatePropagation", targetStateStartedAt);
    const resolvedRow = damageResolver.resolve(item.entry);
    const breakdown = resolvedRow.breakdown;
    resolvedByEntry.set(item.entry, resolvedRow);
    const damageEvent = item.entry.damageEvent;
    if (!item.entry.replay && breakdown.total > 0 && damageEvent) {
      const listenerStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
      damageEvent.listeners.forEach(({ key, rule }) => {
        const listener = rule.listen;
        const listenerRequirementStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
        if (!listener || (listenerCooldowns.get(key) ?? Number.NEGATIVE_INFINITY) > item.time) {
          if (import.meta.env.DEV)
            finishCalculationPhase("listenerRequirementEvaluation", listenerRequirementStartedAt);
          return;
        }
        const eventRequirementState = {
          ...damageEvent.requirementState,
          targetHPPercentage: targetHPRatio * 100,
        };
        const listenerRequirementsPassed = requirementsPass(
          listener.requirement ?? rule.requirement,
          damageEvent.buffs,
          damageEvent.debuffs,
          item.entry.context.skillTags,
          conditions,
          state.weapons,
          damageEvent.resources,
          eventRequirementState,
        );
        if (import.meta.env.DEV) finishCalculationPhase("listenerRequirementEvaluation", listenerRequirementStartedAt);
        if (!listenerRequirementsPassed) return;
        const triggered = enqueueReplay(item.entry, key, listener);
        if (triggered && typeof listener.cooldown === "number" && Number.isFinite(listener.cooldown))
          listenerCooldowns.set(key, item.time + Math.max(0, listener.cooldown));
      });
      if (import.meta.env.DEV) finishCalculationPhase("eventListening", listenerStartedAt);
    }
    if (usesTargetDamage) {
      const targetHPUpdateStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
      targetHPRatio = Math.max(0, targetHPRatio - breakdown.total / targetMaxHP);
      if (import.meta.env.DEV) finishCalculationPhase("targetHPUpdate", targetHPUpdateStartedAt);
    }
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageEventTraversal", traversalStartedAt);
  damageEntries.sort(
    (left, right) =>
      compareTimelineTime(left.timelineTime, right.timelineTime) ||
      (left.timelineOrder ?? 0) - (right.timelineOrder ?? 0),
  );
  const resolvedSequence = damageEntries.map((entry) => {
    const resolvedRow = resolvedByEntry.get(entry);
    return {
      entry: stripTargetHPUpdater(entry),
      breakdown: resolvedRow?.breakdown ?? emptyBreakdown(),
      ...(resolvedRow?.expectedBuffStacks ? { expectedBuffStacks: resolvedRow.expectedBuffStacks } : {}),
      ...(resolvedRow?.outcomePhysicalAttackBonus !== undefined
        ? { outcomePhysicalAttackBonus: resolvedRow.outcomePhysicalAttackBonus }
        : {}),
    };
  });
  return { entries: resolvedSequence.map(({ entry }) => entry), resolvedSequence };
}

function timelineTiming(
  timeline: TimelineRow[],
  startAnchor: RotationSimulationBundle["startAnchor"],
  damageEntries: RotationDamageEntry[] = [],
) {
  const anchorRow = timeline.find((row) => row.id === startAnchor.rowId) ?? timeline[0];
  const anchorTime = anchorRow
    ? anchorRow.startTime +
      (startAnchor.actionIndex === undefined ? 0 : Number(anchorRow.actions[startAnchor.actionIndex]?.time ?? 0))
    : 0;
  const battleEnd = battleEndCutoff(timeline);
  const lastActionTime =
    battleEnd?.time ??
    timeline.reduce(
      (latest, row) =>
        row.skipped
          ? latest
          : Math.max(
              latest,
              row.step.type === "event" && row.step.event === "Delay"
                ? row.startTime + row.effectiveCastTime
                : row.startTime,
              ...row.actions.flatMap((action) =>
                typeof action.time === "number" ? [row.startTime + action.time] : [],
              ),
            ),
      0,
    );
  const lastDamageTime = damageEntries.reduce(
    (latest, entry) => Math.max(latest, entry.timelineTime ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY,
  );
  return {
    anchorTime,
    duration: Math.max(0, (battleEnd ? lastActionTime : Math.max(lastActionTime, lastDamageTime)) - anchorTime),
  };
}

export function calculateRotationBaseline(bundle: RotationSimulationBundle): RotationSimulationBaseline {
  const timelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const timeline = buildRotationTimeline(bundle.timeline);
  if (import.meta.env.DEV) finishCalculationPhase("timelineConstruction", timelineStartedAt);
  const initialTimingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const { anchorTime } = timelineTiming(timeline, bundle.startAnchor);
  if (import.meta.env.DEV) finishCalculationPhase("timingResolution", initialTimingStartedAt);
  const state = {
    stats: bundle.stats,
    attunement: bundle.attunement,
    enemy: bundle.enemy,
    derivedStats: bundle.derivedStats,
    weapons: bundle.weapons,
  };
  const damagePipelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const baselineResolution = timelineDamageEntries(
    timeline,
    bundle.timeline,
    state,
    bundle.startAnchor,
    { label: "" },
    true,
  );
  const baseline = baselineResolution.entries;
  const resolvedSequence = baselineResolution.resolvedSequence ?? calculateRotationDamageSequence(baseline);
  if (import.meta.env.DEV) finishCalculationPhase("damagePipeline", damagePipelineStartedAt);
  const finalTimingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const { duration } = timelineTiming(timeline, bundle.startAnchor, baseline);
  if (import.meta.env.DEV) finishCalculationPhase("timingResolution", finalTimingStartedAt);
  const metricsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  let baselineDamage = 0;
  const actionBreakdowns = Object.fromEntries(
    resolvedSequence
      .filter(({ entry }) => entry.id)
      .map(({ entry, breakdown, outcomePhysicalAttackBonus }) => {
        baselineDamage += breakdown.total;
        const buffedDamageBySource = Object.fromEntries(
          (entry.replay ? [] : (entry.attributionContexts ?? []))
            .map(({ sourceRowId, context }) => {
              const damageStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
              const counterfactualDamage = calculateDamageBreakdown(
                entry.action,
                contextWithOutcomePhysicalAttackBonus(context, outcomePhysicalAttackBonus),
              ).total;
              if (import.meta.env.DEV) finishCalculationPhase("damageCalculation", damageStartedAt);
              return [sourceRowId, breakdown.total - counterfactualDamage];
            })
            .filter(([, damage]) => Math.abs(damage as number) > 1e-9),
        );
        return [
          entry.id!,
          { ...breakdown, ...(Object.keys(buffedDamageBySource).length ? { buffedDamageBySource } : {}) },
        ];
      }),
  );
  const metrics = calculateRotationMetrics(
    {
      duration,
      baseline,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    },
    baselineDamage,
  );
  metrics.breakdown = calculateBreakdown(timeline, actionBreakdowns, baselineDamage);
  metrics.expectedHawkwingStacks = averageExpectedBuffStack(resolvedSequence, "Hawkwing");
  if (import.meta.env.DEV) finishCalculationPhase("metricsAndBreakdown", metricsStartedAt);
  return {
    metrics,
    timeline,
    anchorTime,
    duration,
    actionBreakdowns,
    baseline,
    expectedOutcomeBuffSchedule: expectedOutcomeBuffSchedule(resolvedSequence),
  };
}

const affinityRateDependencyFields = new Set(["affinity", "directaffinity", "effectiveaffinity", "finalaffinity"]);

function affinityDependencySnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(affinityDependencySnapshot).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const lowerKey = key.toLowerCase();
    if (
      affinityRateDependencyFields.has(lowerKey) ||
      (key === "outcome" && child === "affinity") ||
      ((key === "from" || key === "to") &&
        typeof child === "string" &&
        affinityRateDependencyFields.has(child.toLowerCase()))
    )
      return [[key, child] as const];
    const nested = affinityDependencySnapshot(child);
    return nested === undefined ? [] : [[key, nested] as const];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function canReuseExpectedOutcomeBuffSchedule(bundle: RotationSimulationBundle, variant: RotationSimulationVariant) {
  if (variant.timeline) return false;
  if (variant.stats) {
    const variantDerivedStats = calculateDerivedStats(variant.stats, bundle.enemy.judgementResistance);
    if (Math.abs(variantDerivedStats.finalAffinity - bundle.derivedStats.finalAffinity) > 1e-12) return false;
  }
  const baselineSetup = JSON.stringify(affinityDependencySnapshot(bundle.timeline.setupEffects));
  const variantSetup = JSON.stringify(affinityDependencySnapshot(variant.setupEffects ?? bundle.timeline.setupEffects));
  if (baselineSetup !== variantSetup) return false;
  const baselineInnerWays = JSON.stringify(affinityDependencySnapshot(bundle.timeline.innerWayRules));
  const variantInnerWays = JSON.stringify(
    affinityDependencySnapshot(variant.innerWayRules ?? bundle.timeline.innerWayRules),
  );
  return baselineInnerWays === variantInnerWays;
}

export function calculateRotationComparisons(
  bundle: RotationSimulationBundle,
  baselineResult: RotationSimulationBaseline,
  onProgress?: (completed: number, total: number) => void,
): RotationMetrics {
  const state = {
    stats: bundle.stats,
    attunement: bundle.attunement,
    enemy: bundle.enemy,
    derivedStats: bundle.derivedStats,
    weapons: bundle.weapons,
  };
  const totalVariants =
    bundle.statPriority.length +
    bundle.attunementPriority.length +
    bundle.innerWayPriority.length +
    Object.values(bundle.setupComparisons).reduce((total, variants) => total + variants.length, 0);
  let completedVariants = 0;
  onProgress?.(0, totalVariants);
  const calculationForVariant = (variant: RotationSimulationVariant) => {
    const timelineInput = variant.timeline ?? bundle.timeline;
    const timelineStartedAt = import.meta.env.DEV && variant.timeline ? startCalculationPhase() : 0;
    const variantTimeline = variant.timeline ? buildRotationTimeline(timelineInput) : baselineResult.timeline;
    if (import.meta.env.DEV && variant.timeline) finishCalculationPhase("timelineConstruction", timelineStartedAt);
    const damagePipelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    const reusableExpectedBuffSchedule = canReuseExpectedOutcomeBuffSchedule(bundle, variant)
      ? baselineResult.expectedOutcomeBuffSchedule
      : undefined;
    const resolution = timelineDamageEntries(
      variantTimeline,
      timelineInput,
      state,
      bundle.startAnchor,
      variant,
      false,
      reusableExpectedBuffSchedule,
    );
    const entries = resolution.entries;
    const resolvedSequence =
      resolution.resolvedSequence ?? calculateRotationDamageSequence(entries, undefined, reusableExpectedBuffSchedule);
    if (import.meta.env.DEV) finishCalculationPhase("damagePipeline", damagePipelineStartedAt);
    let duration = baselineResult.duration;
    if (variant.timeline) {
      const timingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
      duration = timelineTiming(variantTimeline, bundle.startAnchor, entries).duration;
      if (import.meta.env.DEV) finishCalculationPhase("timingResolution", timingStartedAt);
    }
    const calculation = {
      entries,
      damage: sumResolvedSequence(resolvedSequence).total,
      duration,
    };
    completedVariants += 1;
    onProgress?.(completedVariants, totalVariants);
    return calculation;
  };
  const entryBundle: RotationCalculationBundle = {
    duration: baselineResult.duration,
    baseline: baselineResult.baseline,
    statPriority: bundle.statPriority.map((variant) => ({
      label: variant.label,
      maxRoll: variant.maxRoll,
      ...calculationForVariant(variant),
    })),
    attunementPriority: bundle.attunementPriority.map((variant) => ({
      label: variant.label,
      maxRoll: variant.maxRoll,
      ...calculationForVariant(variant),
    })),
    innerWayPriority: bundle.innerWayPriority.map((variant) => ({
      label: variant.label,
      maxRoll: variant.maxRoll,
      ...calculationForVariant(variant),
    })),
    setupComparisons: Object.fromEntries(
      Object.entries(bundle.setupComparisons).map(([group, variants]) => [
        group,
        variants.map((variant) => ({
          label: variant.label,
          maxRoll: variant.maxRoll,
          ...calculationForVariant(variant),
        })),
      ]),
    ),
  };
  const metricsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const metrics = calculateRotationMetrics(entryBundle, baselineResult.metrics.totalDamage);
  metrics.breakdown = baselineResult.metrics.breakdown;
  metrics.expectedHawkwingStacks = baselineResult.metrics.expectedHawkwingStacks;
  if (import.meta.env.DEV) finishCalculationPhase("metricsAndBreakdown", metricsStartedAt);
  return metrics;
}

export function calculateRotationSimulation(bundle: RotationSimulationBundle): RotationSimulationResult {
  const baselineResult = calculateRotationBaseline(bundle);
  const metrics = calculateRotationComparisons(bundle, baselineResult);
  const {
    baseline: _baseline,
    expectedOutcomeBuffSchedule: _expectedOutcomeBuffSchedule,
    ...publicResult
  } = baselineResult;
  return { ...publicResult, metrics };
}
