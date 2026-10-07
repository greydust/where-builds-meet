import type { DamageOutcome } from "./damage"
import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs"
import { mergeTinyProbabilityStates } from "./probabilityStateMerging"
import { effectsForTrackedEffect, type EditableObject, type EffectDefinition } from "./rotationTimeline"

export type HawkwingEffect = {
  name: string
  outcome: DamageOutcome
  durationTicks: number
  maxStack: number
  physicalAttackBonusPerStack: number
}

type StackDistribution = Map<number, Map<number, number>>
type ConcreteBuffState = { stack: number; expiresAtTick: number }

function unwrappedEffect(effect: EditableObject): EditableObject {
  return effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
    ? (effect.effect as EditableObject)
    : effect
}

function addProbability(distribution: StackDistribution, stack: number, expiresAtTick: number, probability: number) {
  if (probability <= 0) return
  const expiries = distribution.get(stack) ?? new Map<number, number>()
  expiries.set(expiresAtTick, (expiries.get(expiresAtTick) ?? 0) + probability)
  distribution.set(stack, expiries)
}

export function hawkwingEffectFor(
  setupEffects: EditableObject[],
  effectDefinitions: Record<string, EffectDefinition>,
): HawkwingEffect | undefined {
  for (const setupEffect of setupEffects) {
    const trigger =
      setupEffect.trigger && typeof setupEffect.trigger === "object" && !Array.isArray(setupEffect.trigger)
        ? (setupEffect.trigger as EditableObject)
        : undefined
    const action =
      trigger?.action && typeof trigger.action === "object" && !Array.isArray(trigger.action)
        ? (trigger.action as EditableObject)
        : undefined
    if (
      trigger?.event !== "damageOutcome" ||
      trigger.outcome !== "affinity" ||
      action?.type !== "apply" ||
      action.target !== "self" ||
      action.value !== "Hawkwing"
    )
      continue
    const definition = effectDefinitions.Hawkwing
    if (
      typeof definition?.duration !== "number" ||
      !Number.isFinite(definition.duration) ||
      typeof definition.maxStack !== "number" ||
      !Number.isFinite(definition.maxStack)
    )
      return undefined
    const physicalAttackBonusPerStack = effectsForTrackedEffect(1, definition).reduce<number>((total, effect) => {
      if (!effect || typeof effect !== "object" || Array.isArray(effect)) return total
      const unwrapped = unwrappedEffect(effect as EditableObject)
      return (
        total +
        (typeof unwrapped.physicalAttackBonus === "number" && Number.isFinite(unwrapped.physicalAttackBonus)
          ? unwrapped.physicalAttackBonus
          : 0)
      )
    }, 0)
    return {
      name: "Hawkwing",
      outcome: "affinity",
      durationTicks: outcomeBuffTick(definition.duration),
      maxStack: Math.max(1, Math.floor(definition.maxStack)),
      physicalAttackBonusPerStack,
    }
  }
  return undefined
}

export class ExpectedHawkwingTracker {
  private inactive = 1
  private active: (ConcreteBuffState & { probability: number })[] = []
  private expected = 0

  private expire(tick: number) {
    let count = 0
    while (count < this.active.length && this.active[count].expiresAtTick <= tick) {
      const state = this.active[count++]
      this.inactive += state.probability
      this.expected -= state.stack * state.probability
    }
    if (count) this.active = this.active.slice(count)
    if (!this.active.length) this.expected = 0
  }

  expectedStack(_effect: HawkwingEffect, tick: number) {
    this.expire(tick)
    return this.expected
  }

  resolveAffinity(effect: HawkwingEffect, tick: number, probability: number) {
    this.expire(tick)
    const chance = outcomeProbability(probability)
    const next: StackDistribution = new Map()
    addProbability(next, Math.min(effect.maxStack, 1), tick + effect.durationTicks, this.inactive * chance)
    this.inactive *= 1 - chance
    for (const state of this.active) {
      addProbability(next, state.stack, state.expiresAtTick, state.probability * (1 - chance))
      addProbability(
        next,
        Math.min(effect.maxStack, state.stack + 1),
        tick + effect.durationTicks,
        state.probability * chance,
      )
    }
    const states = [...next].flatMap(([stack, expiries]) =>
      [...expiries].map(([expiresAtTick, probability]) => ({ stack, expiresAtTick, probability })),
    )
    this.active = mergeTinyProbabilityStates(states, ["expiresAtTick"], ["stack"])
    this.expected = this.active.reduce((total, state) => total + state.stack * state.probability, 0)
    this.active.sort((left, right) => left.expiresAtTick - right.expiresAtTick)
  }
}

export class SimulatedHawkwingTracker {
  private state: ConcreteBuffState = { stack: 0, expiresAtTick: 0 }

  stack(tick: number) {
    if (this.state.stack > 0 && this.state.expiresAtTick <= tick) this.state = { stack: 0, expiresAtTick: 0 }
    return this.state.stack
  }

  resolveAffinity(effect: HawkwingEffect, tick: number) {
    this.state = { stack: Math.min(effect.maxStack, this.stack(tick) + 1), expiresAtTick: tick + effect.durationTicks }
  }
}
