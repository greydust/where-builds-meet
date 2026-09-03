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
  type InnerWayEffectRule,
  type ResourceState,
  type TimelineBuildInput,
  type TimelineRow,
  type TrackedEffect,
} from "./rotationTimeline";
import type { CharacterStats, EnemyProfile, WeaponId } from "../types";
import attunementJson from "../../data/attunement.json";
import type { AttunementStats } from "./damage";
import {
  calculateRawHealingAttackSnapshot,
  calculateHealingBreakdown,
  calculateSimulatedHealingBreakdown,
  type HealingBreakdown,
} from "./healing";
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark";
import { DEFAULT_TARGET_HP_RATIO } from "./combatDefaults";
import {
  addUnconditionalDamageEffects,
  splitStaticDamageEffect,
  subtractUnconditionalDamageEffects,
  type UnconditionalDamageEffects,
} from "./unconditionalDamageEffects";
import { calculateStatsWithEffects, type EffectiveStatEffectContainer, type StatEffectContainer } from "./statEffects";
import { outcomeBuffTick, type ExpectedOutcomeBuffSchedule } from "./outcomeTriggeredBuffs";
import { ExpectedHawkwingTracker, SimulatedHawkwingTracker, hawkwingEffectFor, type HawkwingEffect } from "./hawkwing";
import {
  ExpectedInsightfulStrikeTracker,
  SimulatedInsightfulStrikeTracker,
  insightfulStrikeDirectAffinityBonus,
  insightfulStrikeEffectFor,
  type InsightfulStrikeEffect,
} from "./insightfulStrike";
import {
  applySeasonalEdgeCooldownToTimeline,
  applySeasonalVitalityRanges,
  seasonalEdgeEffectFor,
  seasonalEdgeStateAt,
  seasonalEdgeWindows,
  type SeasonalEdgeEntryState,
  type SeasonalEdgeOutcomeDefinition,
  type SeasonalVitalityResult,
} from "./seasonalEdge";

export type RotationDamageEntry = {
  id?: string;
  action: DamageAction;
  context: DamageContext;
  attributionContexts?: Array<{ sourceRowId: string; context: DamageContext }>;
  timelineTime?: number;
  timelineOrder?: number;
  sourceRowId?: string;
  activeBuffStacks?: Record<string, number>;
  activeDebuffStacks?: Record<string, number>;
  replay?: { sourceEntryId: string; coef: number };
  hawkwing?: HawkwingEffect;
  insightfulStrike?: InsightfulStrikeEffect;
  seasonalEdge?: SeasonalEdgeEntryState;
  healingRecipients?: { self: number; teammates: number; teammateOverhealRatio: number };
  resolvedHealing?: ResolvedHealingBreakdown;
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

export type RotationActionBreakdown = DamageBreakdown & {
  healing?: HealingBreakdown;
  recipientHealing?: HealingBreakdown[];
  buffedDamageBySource?: Record<string, number>;
  expectedBuffStacks?: Record<string, number>;
};

type ResolvedHealingBreakdown = {
  total: HealingBreakdown;
  recipients: HealingBreakdown[];
};

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
    healing?: number;
  }>;
  attunementPriority: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
    healing?: number;
  }>;
  innerWayPriority: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
    healing?: number;
  }>;
  setupComparisons: Record<
    string,
    Array<{
      label: string;
      maxRoll?: number;
      entries: RotationDamageEntry[];
      duration?: number;
      damage?: number;
      healing?: number;
    }>
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
  mysticVitalityDamageScale: number;
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

function scaleHealingBreakdown(healing: HealingBreakdown, multiplier: number): HealingBreakdown {
  if (multiplier === 1) return healing;
  return {
    ...healing,
    physical: healing.physical * multiplier,
    silkbind: healing.silkbind * multiplier,
    total: healing.total * multiplier,
  };
}

function combineHealingBreakdowns(recipients: HealingBreakdown[]): HealingBreakdown {
  const count = recipients.length;
  const sum = (field: "physical" | "silkbind" | "total") =>
    recipients.reduce((total, healing) => total + healing[field], 0);
  return {
    physical: sum("physical"),
    silkbind: sum("silkbind"),
    total: sum("total"),
    normalRate: count > 0 ? recipients.reduce((total, healing) => total + (healing.normalRate ?? 0), 0) / count : 0,
    criticalRate: count > 0 ? recipients.reduce((total, healing) => total + (healing.criticalRate ?? 0), 0) / count : 0,
    ...(count === 1 && recipients[0].outcome ? { outcome: recipients[0].outcome } : {}),
  };
}

function calculateRotationDamageEntry(
  entry: RotationDamageEntry,
  resolved: Map<string, RotationActionBreakdown>,
  outcomeEffects?: UnconditionalDamageEffects,
  directAffinityBonus = 0,
  random?: () => number,
  record = true,
  additionalEffects: EditableObject[] = [],
): RotationActionBreakdown {
  let breakdown: RotationActionBreakdown;
  if (entry.replay) {
    const sourceDamage = resolved.get(entry.replay.sourceEntryId)?.total ?? 0;
    breakdown = replayBreakdown(sourceDamage * entry.replay.coef);
  } else if (entry.action.type === "heal") {
    const recipientCount = (entry.healingRecipients?.self ?? 1) + (entry.healingRecipients?.teammates ?? 0);
    const resolvedHealing = entry.resolvedHealing;
    const recipientHealing =
      resolvedHealing?.recipients ??
      Array.from({ length: recipientCount }, () =>
        random
          ? calculateSimulatedHealingBreakdown(entry.action, entry.context, random)
          : calculateHealingBreakdown(entry.action, entry.context),
      );
    breakdown = {
      ...emptyBreakdown(),
      healing: resolvedHealing?.total ?? combineHealingBreakdowns(recipientHealing),
      recipientHealing,
    };
  } else {
    const damageStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    const contextWithDamageEffects =
      outcomeEffects && Object.keys(outcomeEffects).length
        ? {
            ...entry.context,
            unconditionalDamageEffects: addUnconditionalDamageEffects(
              entry.context.unconditionalDamageEffects,
              outcomeEffects,
            ),
          }
        : entry.context;
    const context =
      directAffinityBonus || additionalEffects.length
        ? {
            ...contextWithDamageEffects,
            effects: [
              ...contextWithDamageEffects.effects,
              ...(directAffinityBonus ? [{ stat: { directAffinity: directAffinityBonus } }] : []),
              ...additionalEffects,
            ],
          }
        : contextWithDamageEffects;
    breakdown = random
      ? calculateSimulatedDamageBreakdown(entry.action, context, random)
      : calculateDamageBreakdown(entry.action, context);
    if (import.meta.env.DEV) finishCalculationPhase("damageCalculation", damageStartedAt);
  }
  if (record && entry.id) resolved.set(entry.id, breakdown);
  return breakdown;
}

function blendDamageBreakdowns(
  inactive: RotationActionBreakdown,
  active: RotationActionBreakdown,
  activeProbability: number,
): RotationActionBreakdown {
  const inactiveProbability = 1 - activeProbability;
  const weighted = (field: keyof DamageBreakdown) =>
    Number(inactive[field] ?? 0) * inactiveProbability + Number(active[field] ?? 0) * activeProbability;
  const outcomeRates =
    inactive.outcomeRates && active.outcomeRates
      ? {
          abrasion:
            inactive.outcomeRates.abrasion * inactiveProbability + active.outcomeRates.abrasion * activeProbability,
          normal: inactive.outcomeRates.normal * inactiveProbability + active.outcomeRates.normal * activeProbability,
          critical:
            inactive.outcomeRates.critical * inactiveProbability + active.outcomeRates.critical * activeProbability,
          affinity:
            inactive.outcomeRates.affinity * inactiveProbability + active.outcomeRates.affinity * activeProbability,
        }
      : undefined;
  return {
    physical: weighted("physical"),
    bellstrike: weighted("bellstrike"),
    stonesplit: weighted("stonesplit"),
    silkbind: weighted("silkbind"),
    bamboocut: weighted("bamboocut"),
    total: weighted("total"),
    ...(outcomeRates ? { outcomeRates } : {}),
  };
}

function effectsForSeasonalOutcome(context: DamageContext, outcome: SeasonalEdgeOutcomeDefinition) {
  return outcome.effects
    .filter(
      (effect): effect is EditableObject => Boolean(effect) && typeof effect === "object" && !Array.isArray(effect),
    )
    .filter((effect) =>
      requirementsPass(
        effect.requirement,
        context.buffs.map((name) => ({ name })),
        [],
        context.skillTags,
        new Set(),
        context.weapons,
        {},
        {
          selfHPPercentage: (context.currentHPRatio ?? 1) * 100,
          targetHPPercentage: (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
        },
      ),
    )
    .map((effect) =>
      effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
        ? (effect.effect as EditableObject)
        : effect,
    );
}

export type ResolvedRotationDamage = {
  entry: RotationDamageEntry;
  breakdown: RotationActionBreakdown;
  expectedBuffStacks?: Record<string, number>;
  outcomeEffects?: UnconditionalDamageEffects;
  expectedConcentration?: {
    probability: number;
    activeEffects: UnconditionalDamageEffects;
    directAffinityBonus: number;
  };
};

function createRotationDamageResolver(random?: () => number, schedule?: ExpectedOutcomeBuffSchedule) {
  const resolved = new Map<string, RotationActionBreakdown>();
  const expectedHawkwing = random ? undefined : new ExpectedHawkwingTracker();
  const simulatedHawkwing = random ? new SimulatedHawkwingTracker() : undefined;
  const expectedInsightfulStrike = random ? undefined : new ExpectedInsightfulStrikeTracker();
  const simulatedInsightfulStrike = random ? new SimulatedInsightfulStrikeTracker() : undefined;
  const simulatedSeasons = new Map<string, string>();
  const resolve = (entry: RotationDamageEntry): ResolvedRotationDamage => {
    const tick = outcomeBuffTick(entry.timelineTime);
    const expectedBuffStacks: Record<string, number> = {};
    let outcomeEffects: UnconditionalDamageEffects = {};
    if (entry.hawkwing) {
      const stack = random
        ? simulatedHawkwing!.stack(tick)
        : (schedule?.[entry.id ?? ""]?.Hawkwing ?? expectedHawkwing!.expectedStack(entry.hawkwing, tick));
      expectedBuffStacks.Hawkwing = stack;
      outcomeEffects = addUnconditionalDamageEffects(outcomeEffects, {
        physicalAttackBonus: stack * entry.hawkwing.physicalAttackBonusPerStack,
      });
    }
    let concentrationProbability: number | undefined;
    let concentrationEffects: UnconditionalDamageEffects = {};
    let concentrationDirectAffinity = 0;
    if (entry.insightfulStrike) {
      concentrationProbability = random
        ? Number(simulatedInsightfulStrike!.concentrationActive(entry.insightfulStrike, tick))
        : (schedule?.[entry.id ?? ""]?.Concentration ??
          expectedInsightfulStrike!.expectedConcentration(entry.insightfulStrike, tick));
      expectedBuffStacks.Concentration = concentrationProbability;
      concentrationEffects = {
        affinityDmgBonus: entry.insightfulStrike.affinityDamageBonus,
      };
      concentrationDirectAffinity = insightfulStrikeDirectAffinityBonus(entry.insightfulStrike, {
        selfHPPercentage: (entry.context.currentHPRatio ?? 1) * 100,
        targetHPPercentage: (entry.context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
      });
    }
    const seasonalOutcomes = entry.seasonalEdge?.outcomes;
    let selectedSeasonalOutcome: SeasonalEdgeOutcomeDefinition | undefined;
    if (random && seasonalOutcomes?.length) {
      const windowId = entry.seasonalEdge!.windowId!;
      let selectedId = simulatedSeasons.get(windowId);
      if (!selectedId) {
        const roll = random();
        let cumulative = 0;
        selectedId = seasonalOutcomes[seasonalOutcomes.length - 1].id;
        for (const outcome of seasonalOutcomes) {
          cumulative += outcome.weight;
          if (roll < cumulative) {
            selectedId = outcome.id;
            break;
          }
        }
        simulatedSeasons.set(windowId, selectedId);
      }
      selectedSeasonalOutcome = seasonalOutcomes.find((outcome) => outcome.id === selectedId);
    }
    if (random) selectedSeasonalOutcome?.buffs.forEach((buff) => (expectedBuffStacks[buff] = 1));
    else
      seasonalOutcomes?.forEach((outcome) => {
        outcome.buffs.forEach((buff) => {
          expectedBuffStacks[buff] = (expectedBuffStacks[buff] ?? 0) + outcome.weight;
        });
      });
    const calculateWithSeason = (
      baseOutcomeEffects: UnconditionalDamageEffects,
      directAffinityBonus: number,
    ): RotationActionBreakdown => {
      const outcomes = entry.seasonalEdge?.outcomes;
      if (!outcomes?.length || entry.action.type !== "damage" || entry.replay)
        return calculateRotationDamageEntry(entry, resolved, baseOutcomeEffects, directAffinityBonus, random, false);
      if (random) {
        return calculateRotationDamageEntry(
          entry,
          resolved,
          baseOutcomeEffects,
          directAffinityBonus,
          random,
          false,
          effectsForSeasonalOutcome(entry.context, selectedSeasonalOutcome!),
        );
      }
      const grouped = new Map<string, { weight: number; effects: EditableObject[] }>();
      outcomes.forEach((outcome) => {
        const effects = effectsForSeasonalOutcome(entry.context, outcome);
        const key = JSON.stringify(effects);
        const current = grouped.get(key);
        grouped.set(key, { weight: (current?.weight ?? 0) + outcome.weight, effects });
      });
      let combined: RotationActionBreakdown | undefined;
      let combinedWeight = 0;
      grouped.forEach(({ weight, effects }) => {
        const current = calculateRotationDamageEntry(
          entry,
          resolved,
          baseOutcomeEffects,
          directAffinityBonus,
          undefined,
          false,
          effects,
        );
        combined = combined ? blendDamageBreakdowns(combined, current, weight / (combinedWeight + weight)) : current;
        combinedWeight += weight;
      });
      return combined!;
    };
    let inactiveBreakdown: RotationActionBreakdown | undefined;
    let activeBreakdown: RotationActionBreakdown | undefined;
    let breakdown: RotationActionBreakdown;
    if (concentrationProbability !== undefined && entry.action.type === "damage" && !entry.replay && !random) {
      if (concentrationProbability < 1) inactiveBreakdown = calculateWithSeason(outcomeEffects, 0);
      if (concentrationProbability > 0)
        activeBreakdown = calculateWithSeason(
          addUnconditionalDamageEffects(outcomeEffects, concentrationEffects),
          concentrationDirectAffinity,
        );
      breakdown =
        inactiveBreakdown && activeBreakdown
          ? blendDamageBreakdowns(inactiveBreakdown, activeBreakdown, concentrationProbability)
          : (activeBreakdown ?? inactiveBreakdown)!;
      if (entry.id) resolved.set(entry.id, breakdown);
    } else {
      const concentrationActive = concentrationProbability === 1;
      breakdown = calculateWithSeason(
        concentrationActive ? addUnconditionalDamageEffects(outcomeEffects, concentrationEffects) : outcomeEffects,
        concentrationActive ? concentrationDirectAffinity : 0,
      );
      if (!random) {
        if (concentrationActive) activeBreakdown = breakdown;
        else inactiveBreakdown = breakdown;
      }
    }
    if (!entry.replay && breakdown.total > 0) {
      if (entry.hawkwing) {
        if (random && breakdown.outcome === entry.hawkwing.outcome)
          simulatedHawkwing!.resolveAffinity(entry.hawkwing, tick);
        else if (!random && !schedule)
          expectedHawkwing!.resolveAffinity(
            entry.hawkwing,
            tick,
            breakdown.outcomeRates?.[entry.hawkwing.outcome] ?? 0,
          );
      }
      if (entry.insightfulStrike) {
        if (random && breakdown.outcome === entry.insightfulStrike.outcome)
          simulatedInsightfulStrike!.resolveAffinity(entry.insightfulStrike, tick);
        else if (!random && !schedule)
          expectedInsightfulStrike!.resolveAffinity(
            entry.insightfulStrike,
            tick,
            (inactiveBreakdown ?? breakdown).outcomeRates?.[entry.insightfulStrike.outcome] ?? 0,
            (activeBreakdown ?? breakdown).outcomeRates?.[entry.insightfulStrike.outcome] ?? 0,
          );
      }
    }
    if (entry.id) resolved.set(entry.id, breakdown);
    return {
      entry,
      breakdown,
      ...(Object.keys(expectedBuffStacks).length ? { expectedBuffStacks, outcomeEffects } : {}),
      ...(!random && concentrationProbability !== undefined
        ? {
            expectedConcentration: {
              probability: concentrationProbability,
              activeEffects: concentrationEffects,
              directAffinityBonus: concentrationDirectAffinity,
            },
          }
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
    entry.action.type === "damage" && !entry.replay && expectedBuffStacks?.[buffName] !== undefined
      ? [expectedBuffStacks[buffName]]
      : [],
  );
  return stacks.length ? stacks.reduce((total, stack) => total + stack, 0) / stacks.length : undefined;
}

function contextWithOutcomeEffects(
  context: DamageContext,
  outcomeEffects: UnconditionalDamageEffects | undefined,
  directAffinityBonus = 0,
  additionalEffects: EditableObject[] = [],
) {
  const withDamageEffects =
    outcomeEffects && Object.keys(outcomeEffects).length
      ? {
          ...context,
          unconditionalDamageEffects: addUnconditionalDamageEffects(context.unconditionalDamageEffects, outcomeEffects),
        }
      : context;
  return directAffinityBonus || additionalEffects.length
    ? {
        ...withDamageEffects,
        effects: [
          ...withDamageEffects.effects,
          ...(directAffinityBonus ? [{ stat: { directAffinity: directAffinityBonus } }] : []),
          ...additionalEffects,
        ],
      }
    : withDamageEffects;
}

function calculateExpectedSeasonalDamage(
  action: DamageAction,
  context: DamageContext,
  outcomeEffects: UnconditionalDamageEffects | undefined,
  directAffinityBonus: number,
  seasonalEdge: SeasonalEdgeEntryState | undefined,
) {
  if (!seasonalEdge?.outcomes?.length || action.type !== "damage")
    return calculateDamageBreakdown(action, contextWithOutcomeEffects(context, outcomeEffects, directAffinityBonus));
  const grouped = new Map<string, { weight: number; effects: EditableObject[] }>();
  seasonalEdge.outcomes.forEach((outcome) => {
    const effects = effectsForSeasonalOutcome(context, outcome);
    const key = JSON.stringify(effects);
    const current = grouped.get(key);
    grouped.set(key, { weight: (current?.weight ?? 0) + outcome.weight, effects });
  });
  let combined: RotationActionBreakdown | undefined;
  let combinedWeight = 0;
  grouped.forEach(({ weight, effects }) => {
    const current = calculateDamageBreakdown(
      action,
      contextWithOutcomeEffects(context, outcomeEffects, directAffinityBonus, effects),
    );
    combined = combined ? blendDamageBreakdowns(combined, current, weight / (combinedWeight + weight)) : current;
    combinedWeight += weight;
  });
  return combined!;
}

function calculateExpectedOutcomeDamage(
  action: DamageAction,
  context: DamageContext,
  outcomeEffects: UnconditionalDamageEffects | undefined,
  concentration: ResolvedRotationDamage["expectedConcentration"],
  seasonalEdge?: SeasonalEdgeEntryState,
) {
  const inactive = calculateExpectedSeasonalDamage(action, context, outcomeEffects, 0, seasonalEdge);
  if (!concentration || concentration.probability <= 0) return inactive;
  const active = calculateExpectedSeasonalDamage(
    action,
    context,
    addUnconditionalDamageEffects(outcomeEffects, concentration.activeEffects),
    concentration.directAffinityBonus,
    seasonalEdge,
  );
  return concentration.probability >= 1 ? active : blendDamageBreakdowns(inactive, active, concentration.probability);
}

function sumResolvedSequence(sequence: ResolvedRotationDamageSequence) {
  return sequence.reduce(
    (total, { breakdown }) => {
      return {
        physical: total.physical + breakdown.physical,
        bellstrike: total.bellstrike + breakdown.bellstrike,
        stonesplit: total.stonesplit + breakdown.stonesplit,
        silkbind: total.silkbind + breakdown.silkbind,
        bamboocut: total.bamboocut + breakdown.bamboocut,
        total: total.total + breakdown.total,
        healing: total.healing + (breakdown.healing?.total ?? 0),
      };
    },
    { ...emptyBreakdown(), healing: 0 },
  );
}

function mysticDamageInResolvedSequence(sequence: ResolvedRotationDamageSequence) {
  return sequence.reduce(
    (total, { entry, breakdown }) => total + (entry.context.skillTags.includes("Mystic") ? breakdown.total : 0),
    0,
  );
}

function vitalityDamageScale(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  seasonalVitality?: SeasonalVitalityResult,
) {
  if (input.rotation.infiniteVitality) return 1;
  const summary = timeline.find((row) => row.timelineResourceSummary)?.timelineResourceSummary?.Vitality;
  if (!summary || summary.consumed <= 0) return 1;
  const scaleForEndingVitality = (endingVitality: number) =>
    endingVitality < 0 ? Math.max(0, Math.min(1, (summary.consumed + endingVitality) / summary.consumed)) : 1;
  return seasonalVitality
    ? seasonalVitality.endingDistribution.reduce(
        (total, outcome) => total + scaleForEndingVitality(outcome.vitality) * outcome.probability,
        0,
      )
    : scaleForEndingVitality(summary.final);
}

function adjustedDamageTotal(sequence: ResolvedRotationDamageSequence, mysticDamageScale: number) {
  const total = sumResolvedSequence(sequence).total;
  return total - mysticDamageInResolvedSequence(sequence) * (1 - mysticDamageScale);
}

function sumEntries(entries: RotationDamageEntry[]) {
  return sumResolvedSequence(calculateRotationDamageSequence(entries));
}

function priorityRow(
  label: string,
  baselineDps: number,
  variantDps: number,
  baselineHps: number,
  variantHps: number,
  maxRoll?: number,
): RotationPriority {
  return {
    label,
    maxRoll,
    increase: baselineDps > 0 ? (variantDps / baselineDps - 1) * 100 : 0,
    dpsDifference: variantDps - baselineDps,
    healingIncrease: baselineHps > 0 ? (variantHps / baselineHps - 1) * 100 : 0,
    hpsDifference: variantHps - baselineHps,
  };
}

function calculatePriorityRows(
  baselineDps: number,
  baselineHps: number,
  duration: number,
  variants: Array<{
    label: string;
    maxRoll?: number;
    entries: RotationDamageEntry[];
    duration?: number;
    damage?: number;
    healing?: number;
  }>,
  order: "ascending" | "descending" = "descending",
) {
  const rows = variants.map(({ label, maxRoll, entries, duration: variantDuration = duration, damage, healing }) => {
    const totals = damage === undefined || healing === undefined ? sumEntries(entries) : undefined;
    return priorityRow(
      label,
      baselineDps,
      variantDuration > 0 ? (damage ?? totals?.total ?? 0) / variantDuration : 0,
      baselineHps,
      variantDuration > 0 ? (healing ?? totals?.healing ?? 0) / variantDuration : 0,
      maxRoll,
    );
  });
  return sortRotationPriorityRows(rows, order);
}

export function sortRotationPriorityRows(rows: RotationPriority[], order: "ascending" | "descending" = "descending") {
  const direction = order === "ascending" ? 1 : -1;
  return [...rows].sort(
    (left, right) =>
      direction * (left.dpsDifference - right.dpsDifference) || direction * (left.hpsDifference - right.hpsDifference),
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
  baselineHealingOverride?: number,
  unscaledDamageOverride?: number,
): RotationMetrics {
  const duration = Math.max(0, bundle.duration);
  const baselineTotals =
    baselineDamageOverride === undefined || baselineHealingOverride === undefined
      ? sumEntries(bundle.baseline)
      : undefined;
  const baselineDamage = baselineDamageOverride ?? baselineTotals?.total ?? 0;
  const unscaledDamage = unscaledDamageOverride ?? baselineDamage;
  const baselineHealing = baselineHealingOverride ?? baselineTotals?.healing ?? 0;
  const baselineDps = duration > 0 ? baselineDamage / duration : 0;
  const unscaledDps = duration > 0 ? unscaledDamage / duration : 0;
  const baselineHps = duration > 0 ? baselineHealing / duration : 0;
  const setupComparisons = Object.fromEntries(
    Object.entries(bundle.setupComparisons).map(([group, variants]) => [
      group,
      calculatePriorityRows(baselineDps, baselineHps, duration, variants),
    ]),
  );

  const attunementRows = calculatePriorityRows(baselineDps, baselineHps, duration, bundle.attunementPriority);
  return {
    totalDamage: baselineDamage,
    dps: baselineDps,
    unscaledTotalDamage: unscaledDamage,
    unscaledDps,
    totalHealing: baselineHealing,
    hps: baselineHps,
    breakdown: emptyRotationBreakdown(),
    statPriority: calculatePriorityRows(baselineDps, baselineHps, duration, bundle.statPriority, "descending"),
    attunementPriority: sortAttunementPriorityRows(attunementRows),
    innerWayPriority: calculatePriorityRows(baselineDps, baselineHps, duration, bundle.innerWayPriority, "ascending"),
    setupComparisons,
  };
}

function calculateBreakdown(
  timeline: TimelineRow[],
  actionBreakdowns: Record<string, RotationActionBreakdown>,
  entries: RotationDamageEntry[],
  effectDefinitions: TimelineBuildInput["effectDefinitions"],
  anchorTime: number,
  duration: number,
  totalDamage: number,
  totalHealing: number,
): RotationBreakdown {
  const percentage = (damage: number) => (totalDamage > 0 ? (damage / totalDamage) * 100 : 0);
  const healingPercentage = (healing: number) => (totalHealing > 0 ? (healing / totalHealing) * 100 : 0);
  const outputEntries = entries.filter((entry) => {
    if (!entry.id || entry.replay) return false;
    const breakdown = actionBreakdowns[entry.id];
    return Boolean(breakdown && (breakdown.total > 0 || (breakdown.healing?.total ?? 0) > 0));
  });
  const healingRecipientCounts = new Map(
    entries.flatMap((entry) => {
      if (!entry.id || entry.action.type !== "heal") return [];
      const recipients = entry.healingRecipients ?? { self: 1, teammates: 0 };
      return [[entry.id, recipients.self + recipients.teammates] as const];
    }),
  );
  const debuffTimeCoverage = (id: string) => {
    if (duration <= 0) return 0;
    const windowEnd = anchorTime + duration;
    const intervals: Array<[number, number]> = [];
    const collect = (effects: TrackedEffect[]) => {
      const effect = effects.find((candidate) => candidate.name === id);
      if (!effect) return;
      const start = Math.max(anchorTime, effect.appliedAt ?? anchorTime);
      const end = Math.min(windowEnd, effect.expiresAt ?? windowEnd);
      if (end > start) intervals.push([start, end]);
    };
    for (const row of timeline) {
      collect(row.debuffs);
      Object.values(row.actionStates).forEach((state) => collect(state.debuffs));
    }
    intervals.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    let covered = 0;
    let currentStart = 0;
    let currentEnd = 0;
    intervals.forEach(([start, end], index) => {
      if (index === 0) {
        currentStart = start;
        currentEnd = end;
        return;
      }
      if (start <= currentEnd) currentEnd = Math.max(currentEnd, end);
      else {
        covered += currentEnd - currentStart;
        currentStart = start;
        currentEnd = end;
      }
    });
    if (intervals.length) covered += currentEnd - currentStart;
    return (covered / duration) * 100;
  };
  const effectCoverage = (field: "activeBuffStacks" | "activeDebuffStacks") => {
    const isDebuff = field === "activeDebuffStacks";
    return Object.entries(effectDefinitions)
      .filter(([, definition]) => definition.showCoverage === true)
      .map(([id, definition]) => {
        const totalStacks = outputEntries.reduce((total, entry) => {
          const expectedStacks =
            !isDebuff && entry.id ? actionBreakdowns[entry.id]?.expectedBuffStacks?.[id] : undefined;
          const trackedStacks = entry[field]?.[id] ?? 0;
          return total + (expectedStacks ?? trackedStacks);
        }, 0);
        const averageStacks = outputEntries.length > 0 ? totalStacks / outputEntries.length : 0;
        return {
          id,
          averageStacks,
          ...(isDebuff && definition.shared === true ? { timeCoverage: debuffTimeCoverage(id) } : {}),
        };
      })
      .filter((row) => row.averageStacks > 0 || (row.timeCoverage ?? 0) > 0)
      .sort(
        (left, right) =>
          right.averageStacks - left.averageStacks ||
          (right.timeCoverage ?? 0) - (left.timeCoverage ?? 0) ||
          left.id.localeCompare(right.id),
      );
  };
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
  const healingSkills = new Map<
    string,
    {
      id: string;
      name: string;
      casts: number;
      triggers: number;
      heals: number;
      healing: number;
      normalTotal: number;
      criticalTotal: number;
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
        healing: 0,
        buffedDamage: 0,
        vitalitySpent: row.resourceConsumption?.Vitality ?? 0,
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
    const hasCountedDamage = row.actions.some(
      (action, actionIndex) =>
        (action.type === "damage" || action.type === "replay") && Boolean(actionBreakdowns[`${row.id}:${actionIndex}`]),
    );
    const hasCountedHealing = row.actions.some(
      (action, actionIndex) => action.type === "heal" && Boolean(actionBreakdowns[`${row.id}:${actionIndex}`]?.healing),
    );
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
    const currentHealing = healingSkills.get(id) ?? {
      id,
      name: row.skill?.name ?? id,
      casts: 0,
      triggers: 0,
      heals: 0,
      healing: 0,
      normalTotal: 0,
      criticalTotal: 0,
      tags: row.skill?.tags ?? [],
    };
    if (row.kind === "rotation") current.casts += 1;
    else if (hasCountedDamage) current.triggers += 1;
    if (row.kind === "rotation") currentHealing.casts += 1;
    else if (hasCountedHealing) currentHealing.triggers += 1;
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
      } else if (action.type === "heal") {
        const actionId = `${row.id}:${actionIndex}`;
        const breakdown = actionBreakdowns[actionId];
        if (!breakdown?.healing) return;
        const castId = owningCastId(row);
        const cast = castId ? casts.get(castId) : undefined;
        if (cast) cast.healing += breakdown.healing.total;
        const recipientCount = healingRecipientCounts.get(actionId) ?? 1;
        currentHealing.heals += recipientCount;
        currentHealing.healing += breakdown.healing.total;
        currentHealing.normalTotal += (breakdown.healing.normalRate ?? 0) * recipientCount;
        currentHealing.criticalTotal += (breakdown.healing.criticalRate ?? 0) * recipientCount;
      }
    });
    skills.set(id, current);
    healingSkills.set(id, currentHealing);
  });

  const categoryTotals = { martialArts: 0, mystic: 0, other: 0 };
  skills.forEach((skill) => {
    if (skill.tags.includes("MartialArts")) categoryTotals.martialArts += skill.damage;
    else if (skill.tags.includes("Mystic")) categoryTotals.mystic += skill.damage;
    else categoryTotals.other += skill.damage;
  });
  const healingCategoryTotals = { martialArts: 0, mystic: 0, other: 0 };
  healingSkills.forEach((skill) => {
    if (skill.tags.includes("MartialArts")) healingCategoryTotals.martialArts += skill.healing;
    else if (skill.tags.includes("Mystic")) healingCategoryTotals.mystic += skill.healing;
    else healingCategoryTotals.other += skill.healing;
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
  const healingTotals = Object.values(actionBreakdowns).reduce(
    (total, breakdown) => ({
      physical: total.physical + (breakdown.healing?.physical ?? 0),
      silkbind: total.silkbind + (breakdown.healing?.silkbind ?? 0),
    }),
    { physical: 0, silkbind: 0 },
  );

  return {
    skills: [...skills.values()]
      .filter((skill) => skill.damage > 0)
      .map(({ tags: _tags, abrasionTotal, normalTotal, criticalTotal, affinityTotal, ...skill }) => ({
        ...skill,
        abrasionRate: skill.hits > 0 ? (abrasionTotal / skill.hits) * 100 : 0,
        normalRate: skill.hits > 0 ? (normalTotal / skill.hits) * 100 : 0,
        criticalRate: skill.hits > 0 ? (criticalTotal / skill.hits) * 100 : 0,
        affinityRate: skill.hits > 0 ? (affinityTotal / skill.hits) * 100 : 0,
        percentage: percentage(skill.damage),
      }))
      .sort((left, right) => right.damage - left.damage || left.name.localeCompare(right.name)),
    healingSkills: [...healingSkills.values()]
      .filter((skill) => skill.healing > 0)
      .map(({ tags: _tags, normalTotal, criticalTotal, ...skill }) => ({
        ...skill,
        normalRate: skill.heals > 0 ? (normalTotal / skill.heals) * 100 : 0,
        criticalRate: skill.heals > 0 ? (criticalTotal / skill.heals) * 100 : 0,
        percentage: healingPercentage(skill.healing),
      }))
      .sort((left, right) => right.healing - left.healing || left.name.localeCompare(right.name)),
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
          vitalitySpent: number;
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
          vitalitySpent: 0,
        };
        if (!existing) groups.push(group);
        group.casts += 1;
        group.totalCastTime += cast.castTime;
        group.damage += cast.damage;
        group.buffedDamage += cast.buffedDamage;
        group.vitalitySpent += cast.vitalitySpent;
        if (cast.castTime > 0) {
          group.dpsTotal += cast.damage / cast.castTime;
          group.dpsWithBuffTotal += (cast.damage + cast.buffedDamage) / cast.castTime;
          group.dpsSamples += 1;
        }
        return groups;
      }, [])
      .map(({ totalCastTime, dpsTotal, dpsWithBuffTotal, dpsSamples, buffedDamage, ...group }) => {
        const damagePerVitality = group.vitalitySpent > 0 ? group.damage / group.vitalitySpent : undefined;
        return {
          ...group,
          averageCastTime: group.casts > 0 ? totalCastTime / group.casts : 0,
          averageDamage: group.casts > 0 ? group.damage / group.casts : 0,
          ...(dpsSamples > 0 ? { averageDps: dpsTotal / dpsSamples } : {}),
          ...(damagePerVitality === undefined ? {} : { damagePerVitality }),
          ...(buffedDamage > 0
            ? {
                averageDamageWithBuff: group.casts > 0 ? (group.damage + buffedDamage) / group.casts : 0,
                damageWithBuff: group.damage + buffedDamage,
                ...(dpsSamples > 0 ? { averageDpsWithBuff: dpsWithBuffTotal / dpsSamples } : {}),
                ...(group.vitalitySpent > 0
                  ? { damagePerVitalityWithBuff: (group.damage + buffedDamage) / group.vitalitySpent }
                  : {}),
              }
            : {}),
          percentage: percentage(group.damage),
        };
      })
      .sort(
        (left, right) =>
          (right.averageDpsWithBuff ?? right.averageDps ?? Number.NEGATIVE_INFINITY) -
            (left.averageDpsWithBuff ?? left.averageDps ?? Number.NEGATIVE_INFINITY) ||
          (right.damageWithBuff ?? right.damage) - (left.damageWithBuff ?? left.damage) ||
          left.name.localeCompare(right.name),
      ),
    healingCasts: [...casts.values()]
      .filter((cast) => cast.healing > 0)
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order)
      .reduce<
        Array<{
          id: string;
          skillId: string;
          name: string;
          casts: number;
          totalCastTime: number;
          hpsTotal: number;
          hpsSamples: number;
          healing: number;
        }>
      >((groups, cast) => {
        const existing = groups.find((group) => group.skillId === cast.skillId);
        const group = existing ?? {
          id: cast.skillId,
          skillId: cast.skillId,
          name: cast.name,
          casts: 0,
          totalCastTime: 0,
          hpsTotal: 0,
          hpsSamples: 0,
          healing: 0,
        };
        if (!existing) groups.push(group);
        group.casts += 1;
        group.totalCastTime += cast.castTime;
        group.healing += cast.healing;
        if (cast.castTime > 0) {
          group.hpsTotal += cast.healing / cast.castTime;
          group.hpsSamples += 1;
        }
        return groups;
      }, [])
      .map(({ totalCastTime, hpsTotal, hpsSamples, ...group }) => ({
        ...group,
        averageCastTime: group.casts > 0 ? totalCastTime / group.casts : 0,
        averageHealing: group.casts > 0 ? group.healing / group.casts : 0,
        ...(hpsSamples > 0 ? { averageHps: hpsTotal / hpsSamples } : {}),
        percentage: healingPercentage(group.healing),
      }))
      .sort(
        (left, right) =>
          (right.averageHps ?? Number.NEGATIVE_INFINITY) - (left.averageHps ?? Number.NEGATIVE_INFINITY) ||
          right.healing - left.healing ||
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
    healingCategories: [
      {
        id: "martialArts",
        name: "Martial Arts",
        healing: healingCategoryTotals.martialArts,
        percentage: healingPercentage(healingCategoryTotals.martialArts),
      },
      {
        id: "mystic",
        name: "Mystic",
        healing: healingCategoryTotals.mystic,
        percentage: healingPercentage(healingCategoryTotals.mystic),
      },
      {
        id: "other",
        name: "Other",
        healing: healingCategoryTotals.other,
        percentage: healingPercentage(healingCategoryTotals.other),
      },
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
    healingTypes: [
      {
        id: "physical",
        name: "Physical",
        healing: healingTotals.physical,
        percentage: healingPercentage(healingTotals.physical),
      },
      {
        id: "silkbind",
        name: "Silkbind",
        healing: healingTotals.silkbind,
        percentage: healingPercentage(healingTotals.silkbind),
      },
    ],
    buffCoverage: effectCoverage("activeBuffStacks"),
    debuffCoverage: effectCoverage("activeDebuffStacks"),
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

function requirementIsUnconditional(requirement: unknown) {
  return requirement === undefined || requirement === null || (Array.isArray(requirement) && requirement.length === 0);
}

function splitStaticStatEffect(effect: EditableObject): {
  statEffect?: StatEffectContainer & EffectiveStatEffectContainer;
  remaining?: EditableObject;
} {
  const statEffect: StatEffectContainer & EffectiveStatEffectContainer = {};
  if (effect.stat && typeof effect.stat === "object" && !Array.isArray(effect.stat))
    statEffect.stat = effect.stat as StatEffectContainer["stat"];
  if (effect.effectiveStat && typeof effect.effectiveStat === "object" && !Array.isArray(effect.effectiveStat))
    statEffect.effectiveStat = effect.effectiveStat as EffectiveStatEffectContainer["effectiveStat"];

  const remaining = { ...effect };
  delete remaining.stat;
  delete remaining.effectiveStat;
  const hasStatEffect = Object.keys(statEffect).length > 0;
  if (Object.keys(remaining).every((key) => key === "id")) return hasStatEffect ? { statEffect } : {};
  return {
    ...(hasStatEffect ? { statEffect } : {}),
    ...(Object.keys(remaining).length ? { remaining } : {}),
  };
}

function timelineDamageEntries(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  state: Pick<RotationSimulationBundle, "stats" | "attunement" | "enemy" | "derivedStats" | "weapons">,
  startAnchor: RotationSimulationBundle["startAnchor"],
  overrides: RotationSimulationVariant = { label: "" },
  updateTimelineState = false,
  expectedBuffSchedule?: ExpectedOutcomeBuffSchedule,
  random?: () => number,
  resolvedHealing?: Record<string, ResolvedHealingBreakdown>,
): {
  entries: RotationDamageEntry[];
  resolvedSequence?: ResolvedRotationDamageSequence;
  seasonalVitality?: SeasonalVitalityResult;
} {
  const rules = overrides.innerWayRules ?? input.innerWayRules;
  const damageListeners = rules.flatMap((rule, index) =>
    rule.listen?.event === "damage" ? [{ key: `${rule.source}:T${rule.tier}:${index}`, rule }] : [],
  );
  const conditions = new Set(overrides.innerWayConditions ?? input.innerWayConditions);
  const setupEffects = overrides.setupEffects ?? input.setupEffects;
  const hawkwing = hawkwingEffectFor(setupEffects, input.effectDefinitions);
  const insightfulStrike = insightfulStrikeEffectFor(rules, input.effectDefinitions);
  const seasonalEdge = seasonalEdgeEffectFor(rules, input.effectDefinitions);
  const seasonalWindows = seasonalEdge ? seasonalEdgeWindows(timeline, seasonalEdge) : [];
  if (seasonalEdge && updateTimelineState) applySeasonalEdgeCooldownToTimeline(timeline, seasonalWindows);
  const seasonalVitality =
    seasonalEdge && !input.rotation.infiniteVitality
      ? applySeasonalVitalityRanges(timeline, seasonalWindows, input.resourceMaximums?.Vitality, updateTimelineState)
      : undefined;
  const baseStats = overrides.stats ?? state.stats;
  const characterStaticEffects = [
    ...setupEffects.filter((effect) => requirementIsUnconditional(effect.requirement)).map(unwrappedEffect),
    ...rules.filter((rule) => requirementIsUnconditional(rule.requirement)).map((rule) => rule.effect),
  ].flatMap((effect) => {
    const split = splitStaticStatEffect(effect);
    return split.statEffect ? [split.statEffect] : [];
  });
  const characterStaticState = characterStaticEffects.length
    ? calculateStatsWithEffects(baseStats, characterStaticEffects, state.enemy.judgementResistance, state.weapons)
    : {
        stats: baseStats,
        derivedStats: overrides.stats
          ? calculateDerivedStats(baseStats, state.enemy.judgementResistance, {}, state.weapons)
          : state.derivedStats,
      };
  const calculationSetupEffects = setupEffects.flatMap((effect) => {
    if (!requirementIsUnconditional(effect.requirement)) return [effect];
    const split = splitStaticStatEffect(unwrappedEffect(effect));
    return split.remaining ? [split.remaining] : [];
  });
  const staticSetupEffects = calculationSetupEffects.filter((effect) => requirementIsSkillStatic(effect.requirement));
  const dynamicSetupEffects = calculationSetupEffects.filter((effect) => !requirementIsSkillStatic(effect.requirement));
  const staticInnerWayRules = rules.flatMap((rule) => {
    if (!requirementIsSkillStatic(rule.requirement)) return [];
    if (!requirementIsUnconditional(rule.requirement)) return [rule];
    const split = splitStaticStatEffect(rule.effect);
    return split.remaining ? [{ ...rule, effect: split.remaining }] : [];
  });
  const dynamicInnerWayRules = rules.filter((rule) => !requirementIsSkillStatic(rule.requirement));
  const skillStaticEffectCache = new Map<
    string,
    {
      stats: CharacterStats;
      derivedStats: DamageContext["derivedStats"];
      aggregated: UnconditionalDamageEffects;
      remaining: EditableObject[];
    }
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
    const statEffects: Array<StatEffectContainer & EffectiveStatEffectContainer> = [];
    const remaining: EditableObject[] = [];
    for (const effect of applicableEffects) {
      const statSplit = splitStaticStatEffect(effect);
      if (statSplit.statEffect) statEffects.push(statSplit.statEffect);
      if (!statSplit.remaining) continue;
      const damageSplit = splitStaticDamageEffect(statSplit.remaining, state.weapons);
      aggregated = addUnconditionalDamageEffects(aggregated, damageSplit.aggregated);
      if (damageSplit.remaining && !Object.keys(damageSplit.remaining).every((field) => field === "id"))
        remaining.push(damageSplit.remaining);
    }
    const staticState = statEffects.length
      ? calculateStatsWithEffects(
          characterStaticState.stats,
          statEffects,
          state.enemy.judgementResistance,
          state.weapons,
        )
      : characterStaticState;
    const resolved = {
      stats: staticState.stats,
      derivedStats: staticState.derivedStats,
      aggregated,
      remaining,
    };
    skillStaticEffectCache.set(key, resolved);
    if (import.meta.env.DEV) finishCalculationPhase("skillStaticEffectAggregation", startedAt);
    return resolved;
  };
  const attunement = overrides.attunement ?? state.attunement;
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
          if (action.type !== "damage" && action.type !== "heal") return [];
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
          const buffs = actionState.buffs.filter((effect) => (effect.playerRecipientIndex ?? 0) === 0);
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
            stats: skillStaticEffects.stats,
            attunement,
            skillTags,
            weapons: state.weapons,
            buffs: buffs.map((effect) => effect.name),
            enemy: state.enemy,
            derivedStats: skillStaticEffects.derivedStats,
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
          const attributionContexts =
            action.type === "damage"
              ? buffs.flatMap((tracked) => {
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
                })
              : [];
          return [
            {
              id: `${row.id}:${actionIndex}`,
              action,
              context,
              timelineTime: actionTime,
              timelineOrder: actionOrder,
              sourceRowId: row.sourceRowId ?? row.id,
              activeBuffStacks: Object.fromEntries(buffs.map((effect) => [effect.name, effect.stack ?? 1])),
              activeDebuffStacks: Object.fromEntries(debuffs.map((effect) => [effect.name, effect.stack ?? 1])),
              ...(hawkwing ? { hawkwing } : {}),
              ...(insightfulStrike ? { insightfulStrike } : {}),
              ...(seasonalEdge
                ? {
                    seasonalEdge: seasonalEdgeStateAt(actionTime, row.id, seasonalEdge, seasonalWindows),
                  }
                : {}),
              ...(action.type === "heal"
                ? {
                    healingRecipients:
                      row.playerRecipientIndex !== undefined
                        ? {
                            self: row.playerRecipientIndex === 0 ? 1 : 0,
                            teammates: row.playerRecipientIndex === 0 ? 0 : 1,
                            teammateOverhealRatio: 1,
                          }
                        : row.skill?.group === true
                          ? {
                              self: 1,
                              teammates:
                                input.rotation.groupSize === 5 || input.rotation.groupSize === 10
                                  ? input.rotation.groupSize - 1
                                  : 0,
                              teammateOverhealRatio: 0.2,
                            }
                          : { self: 1, teammates: 0, teammateOverhealRatio: 0 },
                  }
                : {}),
              ...(resolvedHealing?.[`${row.id}:${actionIndex}`]
                ? { resolvedHealing: resolvedHealing[`${row.id}:${actionIndex}`] }
                : {}),
              ...(action.type === "damage" && damageListeners.length
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
    return { entries: damageEntries.map(stripTargetHPUpdater), seasonalVitality };
  }
  let targetHPRatio = usesTargetDamage ? 1 : DEFAULT_TARGET_HP_RATIO;
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
  const damageResolver = createRotationDamageResolver(random, expectedBuffSchedule);
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
        activeBuffStacks: { ...(sourceEntry.activeBuffStacks ?? {}) },
        activeDebuffStacks: { ...(sourceEntry.activeDebuffStacks ?? {}) },
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
      ...(resolvedRow?.outcomeEffects ? { outcomeEffects: resolvedRow.outcomeEffects } : {}),
    };
  });
  return { entries: resolvedSequence.map(({ entry }) => entry), resolvedSequence, seasonalVitality };
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

type HealingTimelineRuntime = {
  timeline: Pick<TimelineBuildInput, "resolvedHealing" | "accumulatorThresholds" | "accumulatorMode">;
  healingBreakdowns: Record<string, ResolvedHealingBreakdown>;
};

function healingTimelineRuntime(
  timeline: TimelineRow[],
  resolvedSequence: ResolvedRotationDamageSequence,
  accumulatorMode: NonNullable<TimelineBuildInput["accumulatorMode"]>,
): HealingTimelineRuntime | undefined {
  const applications = timeline.flatMap((row) =>
    row.actions.flatMap((action, actionIndex) =>
      action.type === "apply" && action.target !== "target" && action.value === "WorldToSword"
        ? [
            {
              key: `${row.id}:${actionIndex}`,
              time: row.startTime + Number(action.time ?? 0),
              order: row.order + 10 + actionIndex,
            },
          ]
        : [],
    ),
  );
  const orderedEntries = resolvedSequence
    .filter(({ entry }) => typeof entry.timelineTime === "number")
    .sort(
      (left, right) =>
        compareTimelineTime(left.entry.timelineTime ?? 0, right.entry.timelineTime ?? 0) ||
        (left.entry.timelineOrder ?? 0) - (right.entry.timelineOrder ?? 0),
    );
  const resolvedHealing = Object.fromEntries(
    resolvedSequence.flatMap(({ entry, breakdown }) => {
      if (!entry.id || !breakdown.healing) return [];
      const healingRecipients = entry.healingRecipients ?? { self: 1, teammates: 0, teammateOverhealRatio: 0 };
      const recipientCount = healingRecipients.self + healingRecipients.teammates;
      const recipientHealing =
        breakdown.recipientHealing ??
        Array.from({ length: recipientCount }, () => scaleHealingBreakdown(breakdown.healing!, 1 / recipientCount));
      return [
        [
          entry.id,
          {
            self: recipientHealing.slice(0, healingRecipients.self).map((healing) => healing.total),
            teammateOverhealContributions: recipientHealing
              .slice(healingRecipients.self)
              .map((healing) => healing.total * healingRecipients.teammateOverhealRatio),
          },
        ] as const,
      ];
    }),
  );
  const healingBreakdowns = Object.fromEntries(
    resolvedSequence.flatMap(({ entry, breakdown }) => {
      if (!entry.id || !breakdown.healing) return [];
      const healingRecipients = entry.healingRecipients ?? { self: 1, teammates: 0, teammateOverhealRatio: 0 };
      const recipientCount = healingRecipients.self + healingRecipients.teammates;
      const recipients =
        breakdown.recipientHealing ??
        Array.from({ length: recipientCount }, () => scaleHealingBreakdown(breakdown.healing!, 1 / recipientCount));
      return [[entry.id, { total: breakdown.healing, recipients }] as const];
    }),
  );
  if (applications.length === 0 && Object.keys(resolvedHealing).length === 0) return undefined;
  const accumulatorThresholds = Object.fromEntries(
    applications.flatMap((application) => {
      const following = orderedEntries.find(
        ({ entry }) =>
          compareTimelineTime(entry.timelineTime ?? 0, application.time) > 0 ||
          (compareTimelineTime(entry.timelineTime ?? 0, application.time) === 0 &&
            (entry.timelineOrder ?? 0) >= application.order),
      );
      const preceding = [...orderedEntries]
        .reverse()
        .find(
          ({ entry }) =>
            compareTimelineTime(entry.timelineTime ?? 0, application.time) < 0 ||
            (compareTimelineTime(entry.timelineTime ?? 0, application.time) === 0 &&
              (entry.timelineOrder ?? 0) <= application.order),
        );
      const representative = following ?? preceding;
      if (!representative) return [];
      const { averagePhysicalAttack, averageSilkbindAttack } = calculateRawHealingAttackSnapshot(
        representative.entry.context,
      );
      return [[application.key, averagePhysicalAttack * 12 + averageSilkbindAttack * 18] as const];
    }),
  );
  return {
    timeline: { resolvedHealing, accumulatorThresholds, accumulatorMode },
    healingBreakdowns,
  };
}

export function calculateSimulatedRotationRun(
  bundle: RotationSimulationBundle,
  random: () => number,
): {
  resolvedSequence: ResolvedRotationDamage[];
  duration: number;
  mysticVitalityDamageScale: number;
} {
  const state = {
    stats: bundle.stats,
    attunement: bundle.attunement,
    enemy: bundle.enemy,
    derivedStats: bundle.derivedStats,
    weapons: bundle.weapons,
  };
  const structuralInput = {
    ...bundle.timeline,
    resolvedHealing: undefined,
    accumulatorThresholds: undefined,
  };
  let timeline = buildRotationTimeline(structuralInput);
  let resolution = timelineDamageEntries(
    timeline,
    structuralInput,
    state,
    bundle.startAnchor,
    { label: "" },
    false,
    undefined,
    random,
  );
  let resolvedSequence = resolution.resolvedSequence ?? calculateRotationDamageSequence(resolution.entries, random);
  const runtime = healingTimelineRuntime(timeline, resolvedSequence, "simulation");
  if (runtime) {
    const resolvedTimelineInput = { ...bundle.timeline, ...runtime.timeline };
    timeline = buildRotationTimeline(resolvedTimelineInput);
    resolution = timelineDamageEntries(
      timeline,
      resolvedTimelineInput,
      state,
      bundle.startAnchor,
      { label: "" },
      false,
      undefined,
      random,
      runtime.healingBreakdowns,
    );
    resolvedSequence = resolution.resolvedSequence ?? calculateRotationDamageSequence(resolution.entries, random);
  }
  return {
    resolvedSequence,
    duration: timelineTiming(timeline, bundle.startAnchor, resolution.entries).duration,
    mysticVitalityDamageScale: vitalityDamageScale(timeline, bundle.timeline, resolution.seasonalVitality),
  };
}

export function calculateRotationBaseline(bundle: RotationSimulationBundle): RotationSimulationBaseline {
  const timelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  let timeline = buildRotationTimeline(bundle.timeline);
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
  let baselineResolution = timelineDamageEntries(
    timeline,
    bundle.timeline,
    state,
    bundle.startAnchor,
    { label: "" },
    true,
  );
  let baseline = baselineResolution.entries;
  let resolvedSequence = baselineResolution.resolvedSequence ?? calculateRotationDamageSequence(baseline);
  const healingRuntime = healingTimelineRuntime(timeline, resolvedSequence, "expected");
  if (healingRuntime) {
    const resolvedTimelineInput = { ...bundle.timeline, ...healingRuntime.timeline };
    timeline = buildRotationTimeline(resolvedTimelineInput);
    baselineResolution = timelineDamageEntries(
      timeline,
      resolvedTimelineInput,
      state,
      bundle.startAnchor,
      { label: "" },
      true,
    );
    baseline = baselineResolution.entries;
    resolvedSequence = baselineResolution.resolvedSequence ?? calculateRotationDamageSequence(baseline);
  }
  const mysticVitalityDamageScale = vitalityDamageScale(timeline, bundle.timeline, baselineResolution.seasonalVitality);
  if (import.meta.env.DEV) finishCalculationPhase("damagePipeline", damagePipelineStartedAt);
  const finalTimingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  const { duration } = timelineTiming(timeline, bundle.startAnchor, baseline);
  if (import.meta.env.DEV) finishCalculationPhase("timingResolution", finalTimingStartedAt);
  const metricsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
  let rawBaselineDamage = 0;
  let baselineHealing = 0;
  const actionBreakdowns = Object.fromEntries(
    resolvedSequence
      .filter(({ entry }) => entry.id)
      .map(({ entry, breakdown, expectedBuffStacks, outcomeEffects, expectedConcentration }) => {
        rawBaselineDamage += breakdown.total;
        baselineHealing += breakdown.healing?.total ?? 0;
        const buffedDamageBySource = Object.fromEntries(
          (entry.replay ? [] : (entry.attributionContexts ?? []))
            .map(({ sourceRowId, context }) => {
              const damageStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
              const counterfactualDamage = calculateExpectedOutcomeDamage(
                entry.action,
                context,
                outcomeEffects,
                expectedConcentration,
                entry.seasonalEdge,
              ).total;
              if (import.meta.env.DEV) finishCalculationPhase("damageCalculation", damageStartedAt);
              return [sourceRowId, breakdown.total - counterfactualDamage];
            })
            .filter(([, damage]) => Math.abs(damage as number) > 1e-9),
        );
        return [
          entry.id!,
          {
            ...breakdown,
            ...(Object.keys(buffedDamageBySource).length ? { buffedDamageBySource } : {}),
            ...(expectedBuffStacks ? { expectedBuffStacks } : {}),
          },
        ];
      }),
  );
  const baselineDamage =
    rawBaselineDamage - mysticDamageInResolvedSequence(resolvedSequence) * (1 - mysticVitalityDamageScale);
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
    baselineHealing,
    rawBaselineDamage,
  );
  metrics.breakdown = calculateBreakdown(
    timeline,
    actionBreakdowns,
    resolvedSequence.map(({ entry }) => entry),
    bundle.timeline.effectDefinitions,
    anchorTime,
    duration,
    rawBaselineDamage,
    baselineHealing,
  );
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
    mysticVitalityDamageScale,
  };
}

function canReuseExpectedOutcomeBuffSchedule(variant: RotationSimulationVariant) {
  // Affinity can change indirectly through formula effects such as Momentum,
  // conditions, conversions, or tracked effects. Reuse is safe only when the
  // variant cannot alter any input involved in per-hit outcome resolution.
  return !(
    variant.timeline ||
    variant.stats ||
    variant.setupEffects ||
    variant.innerWayRules ||
    variant.innerWayConditions
  );
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
    const usesWorldToSword = timelineInput.rotation.steps.some(
      (step) => step.type === "skill" && step.skill === "WorldToSword",
    );
    const rebuildStructuralTimeline = Boolean(variant.timeline) || usesWorldToSword;
    const timelineStartedAt = import.meta.env.DEV && rebuildStructuralTimeline ? startCalculationPhase() : 0;
    let variantTimeline = rebuildStructuralTimeline
      ? buildRotationTimeline({
          ...timelineInput,
          resolvedHealing: undefined,
          accumulatorThresholds: undefined,
        })
      : baselineResult.timeline;
    if (import.meta.env.DEV && rebuildStructuralTimeline)
      finishCalculationPhase("timelineConstruction", timelineStartedAt);
    const damagePipelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    const reusableExpectedBuffSchedule =
      !usesWorldToSword && canReuseExpectedOutcomeBuffSchedule(variant)
        ? baselineResult.expectedOutcomeBuffSchedule
        : undefined;
    let resolution = timelineDamageEntries(
      variantTimeline,
      timelineInput,
      state,
      bundle.startAnchor,
      variant,
      false,
      reusableExpectedBuffSchedule,
    );
    let entries = resolution.entries;
    let resolvedSequence =
      resolution.resolvedSequence ?? calculateRotationDamageSequence(entries, undefined, reusableExpectedBuffSchedule);
    const healingRuntime = healingTimelineRuntime(variantTimeline, resolvedSequence, "expected");
    if (healingRuntime) {
      const resolvedTimelineInput = { ...timelineInput, ...healingRuntime.timeline };
      variantTimeline = buildRotationTimeline(resolvedTimelineInput);
      resolution = timelineDamageEntries(
        variantTimeline,
        resolvedTimelineInput,
        state,
        bundle.startAnchor,
        variant,
        false,
      );
      entries = resolution.entries;
      resolvedSequence = resolution.resolvedSequence ?? calculateRotationDamageSequence(entries);
    }
    if (import.meta.env.DEV) finishCalculationPhase("damagePipeline", damagePipelineStartedAt);
    let duration = baselineResult.duration;
    if (variant.timeline || healingRuntime) {
      const timingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
      duration = timelineTiming(variantTimeline, bundle.startAnchor, entries).duration;
      if (import.meta.env.DEV) finishCalculationPhase("timingResolution", timingStartedAt);
    }
    const mysticVitalityDamageScale = vitalityDamageScale(variantTimeline, timelineInput, resolution.seasonalVitality);
    const totals = sumResolvedSequence(resolvedSequence);
    const calculation = {
      entries,
      damage: totals.total - mysticDamageInResolvedSequence(resolvedSequence) * (1 - mysticVitalityDamageScale),
      healing: totals.healing,
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
  const metrics = calculateRotationMetrics(
    entryBundle,
    baselineResult.metrics.totalDamage,
    baselineResult.metrics.totalHealing,
  );
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
    mysticVitalityDamageScale: _mysticVitalityDamageScale,
    ...publicResult
  } = baselineResult;
  return { ...publicResult, metrics };
}
