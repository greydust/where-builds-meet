import type { DamageOutcome } from "./damage";
import { effectsForTrackedEffect, type EditableObject, type EffectDefinition } from "./rotationTimeline";
import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs";

export type HawkwingEffect = {
  name: string;
  outcome: DamageOutcome;
  durationTicks: number;
  maxStack: number;
  physicalAttackBonusPerStack: number;
};

type StackDistribution = Map<number, Map<number, number>>;
type ConcreteBuffState = { stack: number; expiresAtTick: number };

function unwrappedEffect(effect: EditableObject): EditableObject {
  return effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
    ? (effect.effect as EditableObject)
    : effect;
}

function addProbability(distribution: StackDistribution, stack: number, expiresAtTick: number, probability: number) {
  if (probability <= 0) return;
  const expiries = distribution.get(stack) ?? new Map<number, number>();
  expiries.set(expiresAtTick, (expiries.get(expiresAtTick) ?? 0) + probability);
  distribution.set(stack, expiries);
}

function activeDistribution(distribution: StackDistribution, tick: number): StackDistribution {
  const active = new Map<number, Map<number, number>>();
  for (const [stack, expiries] of distribution) {
    for (const [expiresAtTick, probability] of expiries) {
      if (stack > 0 && expiresAtTick <= tick) addProbability(active, 0, 0, probability);
      else addProbability(active, stack, expiresAtTick, probability);
    }
  }
  return active;
}

export function hawkwingEffectFor(
  setupEffects: EditableObject[],
  effectDefinitions: Record<string, EffectDefinition>,
): HawkwingEffect | undefined {
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
      action.value !== "Hawkwing"
    )
      continue;
    const definition = effectDefinitions.Hawkwing;
    if (
      typeof definition?.duration !== "number" ||
      !Number.isFinite(definition.duration) ||
      typeof definition.maxStack !== "number" ||
      !Number.isFinite(definition.maxStack)
    )
      return undefined;
    const physicalAttackBonusPerStack = effectsForTrackedEffect(1, definition).reduce<number>((total, effect) => {
      if (!effect || typeof effect !== "object" || Array.isArray(effect)) return total;
      const unwrapped = unwrappedEffect(effect as EditableObject);
      return (
        total +
        (typeof unwrapped.physicalAttackBonus === "number" && Number.isFinite(unwrapped.physicalAttackBonus)
          ? unwrapped.physicalAttackBonus
          : 0)
      );
    }, 0);
    return {
      name: "Hawkwing",
      outcome: "affinity",
      durationTicks: outcomeBuffTick(definition.duration),
      maxStack: Math.max(1, Math.floor(definition.maxStack)),
      physicalAttackBonusPerStack,
    };
  }
  return undefined;
}

export class ExpectedHawkwingTracker {
  private distribution: StackDistribution = new Map([[0, new Map([[0, 1]])]]);

  expectedStack(effect: HawkwingEffect, tick: number) {
    this.distribution = activeDistribution(this.distribution, tick);
    let expected = 0;
    for (const [stack, expiries] of this.distribution)
      for (const probability of expiries.values()) expected += stack * probability;
    return expected;
  }

  resolveAffinity(effect: HawkwingEffect, tick: number, probability: number) {
    const chance = outcomeProbability(probability);
    const current = activeDistribution(this.distribution, tick);
    const next: StackDistribution = new Map();
    for (const [stack, expiries] of current) {
      for (const [expiresAtTick, stateProbability] of expiries) {
        addProbability(next, stack, expiresAtTick, stateProbability * (1 - chance));
        addProbability(
          next,
          Math.min(effect.maxStack, stack + 1),
          tick + effect.durationTicks,
          stateProbability * chance,
        );
      }
    }
    this.distribution = next;
  }
}

export class SimulatedHawkwingTracker {
  private state: ConcreteBuffState = { stack: 0, expiresAtTick: 0 };

  stack(tick: number) {
    if (this.state.stack > 0 && this.state.expiresAtTick <= tick) this.state = { stack: 0, expiresAtTick: 0 };
    return this.state.stack;
  }

  resolveAffinity(effect: HawkwingEffect, tick: number) {
    this.state = {
      stack: Math.min(effect.maxStack, this.stack(tick) + 1),
      expiresAtTick: tick + effect.durationTicks,
    };
  }
}
