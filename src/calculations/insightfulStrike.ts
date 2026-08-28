import type { DamageOutcome } from "./damage";
import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs";
import {
  mergeEffectDefinition,
  requirementsPass,
  type EditableObject,
  type EffectDefinition,
  type InnerWayEffectRule,
  type RequirementState,
} from "./rotationTimeline";

type DirectAffinityRule = { value: number; requirement?: unknown };

export type InsightfulStrikeEffect = {
  outcome: DamageOutcome;
  resourceName: string;
  concentrationName: string;
  focusGainUnits: number;
  focusThresholdUnits: number;
  focusDecayUnitsPerTick: number;
  concentrationDurationTicks: number;
  affinityDamageBonus: number;
  directAffinityRules: DirectAffinityRule[];
};

type FocusDistribution = Map<number, Map<number, number>>;
type ConcreteFocusState = { focusUnits: number; concentrationExpiresAtTick: number; lastTick: number };

function addProbability(
  distribution: FocusDistribution,
  focusUnits: number,
  concentrationExpiresAtTick: number,
  probability: number,
) {
  if (probability <= 0) return;
  const concentrations = distribution.get(focusUnits) ?? new Map<number, number>();
  concentrations.set(concentrationExpiresAtTick, (concentrations.get(concentrationExpiresAtTick) ?? 0) + probability);
  distribution.set(focusUnits, concentrations);
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function effectAffinityDamageBonus(definition: EffectDefinition | undefined) {
  return (definition?.effect ?? []).reduce<number>((total, rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return total;
    const wrapper = rule as EditableObject;
    const effect =
      wrapper.effect && typeof wrapper.effect === "object" && !Array.isArray(wrapper.effect)
        ? (wrapper.effect as EditableObject)
        : wrapper;
    const bonus = numericValue(effect.affinityDmgBonus);
    return total + (bonus ?? 0);
  }, 0);
}

function effectDirectAffinityRules(definition: EffectDefinition | undefined): DirectAffinityRule[] {
  return (definition?.effect ?? []).flatMap((rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return [];
    const wrapper = rule as EditableObject;
    const stat =
      wrapper.stat && typeof wrapper.stat === "object" && !Array.isArray(wrapper.stat)
        ? (wrapper.stat as EditableObject)
        : undefined;
    const value = numericValue(stat?.directAffinity);
    return value === undefined ? [] : [{ value, requirement: wrapper.requirement }];
  });
}

export function insightfulStrikeDirectAffinityBonus(effect: InsightfulStrikeEffect, state: RequirementState): number {
  return effect.directAffinityRules.reduce(
    (total, rule) =>
      requirementsPass(rule.requirement, [], [], [], new Set(), [], {}, state) ? total + rule.value : total,
    0,
  );
}

export function insightfulStrikeEffectFor(
  rules: InnerWayEffectRule[],
  effectDefinitions: Record<string, EffectDefinition>,
): InsightfulStrikeEffect | undefined {
  for (const rule of rules) {
    const trigger = rule.trigger;
    const resource =
      trigger?.resource && typeof trigger.resource === "object" && !Array.isArray(trigger.resource)
        ? (trigger.resource as EditableObject)
        : undefined;
    const actions = Array.isArray(trigger?.action) ? trigger.action : trigger?.action ? [trigger.action] : [];
    const applyAction = actions.find(
      (action): action is EditableObject =>
        Boolean(action) &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        (action as EditableObject).type === "apply" &&
        (action as EditableObject).target === "self" &&
        typeof (action as EditableObject).value === "string",
    );
    if (
      trigger?.event !== "damageOutcome" ||
      trigger.outcome !== "affinity" ||
      resource?.name !== "Focus" ||
      !applyAction
    )
      continue;
    const resourceModifiers = rules
      .filter((candidate) => candidate.target === resource.name && candidate.modify)
      .map((candidate) => candidate.modify as EditableObject);
    const modifiedResource = resourceModifiers.reduce<EditableObject>(
      (current, modifier) => ({ ...current, ...modifier }),
      resource,
    );
    const gain = numericValue(modifiedResource.gain);
    const decayRate = numericValue(resource.decayRate);
    const threshold = numericValue(resource.threshold);
    const resetTo = numericValue(resource.resetTo);
    const concentrationName = applyAction.value as string;
    const baseConcentration = effectDefinitions[concentrationName];
    if (!baseConcentration) return undefined;
    const concentration = rules
      .filter((candidate) => candidate.target === concentrationName && candidate.modify)
      .reduce(
        (definition, candidate) => mergeEffectDefinition(definition, candidate.modify as EditableObject),
        baseConcentration,
      );
    if (
      gain === undefined ||
      gain <= 0 ||
      decayRate === undefined ||
      decayRate >= 0 ||
      threshold === undefined ||
      threshold <= 0 ||
      resetTo !== 0 ||
      typeof concentration?.duration !== "number" ||
      !Number.isFinite(concentration.duration)
    )
      return undefined;
    const focusUnitsPerPoint = outcomeBuffTick(1 / Math.abs(decayRate));
    return {
      outcome: "affinity",
      resourceName: "Focus",
      concentrationName,
      focusGainUnits: Math.round(gain * focusUnitsPerPoint),
      focusThresholdUnits: Math.round(threshold * focusUnitsPerPoint),
      focusDecayUnitsPerTick: 1,
      concentrationDurationTicks: outcomeBuffTick(concentration.duration),
      affinityDamageBonus: effectAffinityDamageBonus(concentration),
      directAffinityRules: effectDirectAffinityRules(concentration),
    };
  }
  return undefined;
}

export class ExpectedInsightfulStrikeTracker {
  private distribution: FocusDistribution = new Map([[0, new Map([[0, 1]])]]);
  private lastTick = 0;

  private advance(effect: InsightfulStrikeEffect, tick: number) {
    const elapsedTicks = Math.max(0, tick - this.lastTick);
    if (elapsedTicks === 0) return;
    const next: FocusDistribution = new Map();
    for (const [focusUnits, concentrations] of this.distribution) {
      for (const [expiresAtTick, probability] of concentrations) {
        addProbability(
          next,
          Math.max(0, focusUnits - elapsedTicks * effect.focusDecayUnitsPerTick),
          expiresAtTick <= tick ? 0 : expiresAtTick,
          probability,
        );
      }
    }
    this.distribution = next;
    this.lastTick = tick;
  }

  expectedConcentration(effect: InsightfulStrikeEffect, tick: number) {
    this.advance(effect, tick);
    let probability = 0;
    for (const concentrations of this.distribution.values())
      for (const [expiresAtTick, stateProbability] of concentrations)
        if (expiresAtTick > tick) probability += stateProbability;
    return probability;
  }

  resolveAffinity(
    effect: InsightfulStrikeEffect,
    tick: number,
    inactiveProbability: number,
    activeProbability = inactiveProbability,
  ) {
    this.advance(effect, tick);
    const inactiveChance = outcomeProbability(inactiveProbability);
    const activeChance = outcomeProbability(activeProbability);
    const next: FocusDistribution = new Map();
    for (const [focusUnits, concentrations] of this.distribution) {
      for (const [expiresAtTick, stateProbability] of concentrations) {
        const chance = expiresAtTick > tick ? activeChance : inactiveChance;
        addProbability(next, focusUnits, expiresAtTick, stateProbability * (1 - chance));
        const gainedFocus = focusUnits + effect.focusGainUnits;
        if (gainedFocus >= effect.focusThresholdUnits)
          addProbability(next, 0, tick + effect.concentrationDurationTicks, stateProbability * chance);
        else addProbability(next, gainedFocus, expiresAtTick, stateProbability * chance);
      }
    }
    this.distribution = next;
  }
}

export class SimulatedInsightfulStrikeTracker {
  private state: ConcreteFocusState = { focusUnits: 0, concentrationExpiresAtTick: 0, lastTick: 0 };

  private advance(effect: InsightfulStrikeEffect, tick: number) {
    const elapsedTicks = Math.max(0, tick - this.state.lastTick);
    this.state = {
      focusUnits: Math.max(0, this.state.focusUnits - elapsedTicks * effect.focusDecayUnitsPerTick),
      concentrationExpiresAtTick:
        this.state.concentrationExpiresAtTick <= tick ? 0 : this.state.concentrationExpiresAtTick,
      lastTick: tick,
    };
  }

  concentrationActive(effect: InsightfulStrikeEffect, tick: number) {
    this.advance(effect, tick);
    return this.state.concentrationExpiresAtTick > tick;
  }

  resolveAffinity(effect: InsightfulStrikeEffect, tick: number) {
    this.advance(effect, tick);
    const gainedFocus = this.state.focusUnits + effect.focusGainUnits;
    this.state = {
      focusUnits: gainedFocus >= effect.focusThresholdUnits ? 0 : gainedFocus,
      concentrationExpiresAtTick:
        gainedFocus >= effect.focusThresholdUnits
          ? tick + effect.concentrationDurationTicks
          : this.state.concentrationExpiresAtTick,
      lastTick: tick,
    };
  }
}
