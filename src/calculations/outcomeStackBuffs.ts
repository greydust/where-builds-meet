import type { DamageOutcome } from "./damage"
import { ExpectedHawkwingTracker, SimulatedHawkwingTracker, type OutcomeStackTiming } from "./hawkwing"
import { outcomeBuffTick } from "./outcomeTriggeredBuffs"
import {
  effectsForTrackedEffect,
  type EditableObject,
  type EffectDefinition,
  type InnerWayEffectRule,
} from "./rotationTimeline"
import {
  splitStaticDamageEffect,
  subtractUnconditionalDamageEffects,
  type UnconditionalDamageEffects,
} from "./unconditionalDamageEffects"

/** Numeric stack buffs with an outcome trigger; stateful proc chains use their own lifecycle. */
export type OutcomeStackBuff = OutcomeStackTiming & {
  name: string
  outcome: DamageOutcome
  eligible: boolean
  effectsByStack: UnconditionalDamageEffects[]
  observed?: { stack: number; expiresAt: number }
}

export function outcomeStackBuffsFor(
  rules: InnerWayEffectRule[],
  definitions: Record<string, EffectDefinition>,
  passes: (requirement: unknown) => boolean,
  observed: (name: string) => { stack?: number; expiresAt?: number } | undefined,
  weapons: readonly string[],
): OutcomeStackBuff[] {
  return rules.flatMap(rule => {
    const trigger = rule.trigger
    if (trigger?.event !== "damageOutcome" || trigger.resource || trigger.outcome !== "affinity") return []
    const actions = Array.isArray(trigger.action) ? trigger.action : [trigger.action]
    return actions.flatMap(candidate => {
      if (!candidate || typeof candidate !== "object") return []
      const action = candidate as EditableObject
      if (
        action.type !== "apply" ||
        action.target !== "self" ||
        typeof action.value !== "string" ||
        !passes(action.requirement)
      )
        return []
      const definition = definitions[action.value]
      const duration = typeof action.duration === "number" ? action.duration : definition?.duration
      if (
        definition?.outcomeStack !== true ||
        !definition?.stackEffects ||
        definition.action?.length ||
        definition.periodic ||
        definition.onMaxStack ||
        typeof duration !== "number" ||
        duration <= 0 ||
        !definition.maxStack
      )
        return []
      const current = observed(action.value)
      return [
        {
          name: action.value,
          outcome: "affinity" as const,
          durationTicks: outcomeBuffTick(duration),
          maxStack: definition.maxStack,
          eligible: passes(rule.requirement ?? trigger.requirement),
          effectsByStack: Array.from({ length: definition.maxStack + 1 }, (_, stack) => {
            if (stack === 0) return {}
            const applicable = effectsForTrackedEffect(stack, definition).filter(value =>
              passes((value as EditableObject).requirement),
            )
            return applicable.reduce<UnconditionalDamageEffects>((total, value) => {
              const item = value as EditableObject
              const effect = item.effect && typeof item.effect === "object" ? (item.effect as EditableObject) : item
              const split = splitStaticDamageEffect(effect, weapons)
              for (const [key, amount] of Object.entries(split.aggregated))
                total[key as keyof UnconditionalDamageEffects] =
                  (total[key as keyof UnconditionalDamageEffects] ?? 0) + amount!
              return total
            }, {})
          }),
          ...(current?.expiresAt !== undefined
            ? { observed: { stack: current.stack ?? 0, expiresAt: current.expiresAt } }
            : {}),
        },
      ]
    })
  })
}

/** Reuses Hawkwing's stack/expiry transition algorithm, including its probability merging. */
export class OutcomeStackBuffTracker {
  private expected = new ExpectedHawkwingTracker()
  private simulated = new SimulatedHawkwingTracker()
  private observation?: { stack: number; expiresAt: number }

  private sampled: boolean

  constructor(sampled: boolean) {
    this.sampled = sampled
  }

  private effectsAtStack(effect: OutcomeStackBuff, stack: number) {
    const bounded = Math.max(0, Math.min(effect.maxStack, stack))
    const lower = Math.floor(bounded)
    const upper = Math.ceil(bounded)
    if (lower === upper) return effect.effectsByStack[lower]
    // The shared tiny-state merger preserves weighted stack counts, which can be fractional.
    const low = effect.effectsByStack[lower]
    const high = effect.effectsByStack[upper]
    const weight = bounded - lower
    return Object.fromEntries(
      [...new Set([...Object.keys(low), ...Object.keys(high)])].map(key => {
        const field = key as keyof UnconditionalDamageEffects
        return [key, (low[field] ?? 0) * (1 - weight) + (high[field] ?? 0) * weight]
      }),
    ) as UnconditionalDamageEffects
  }

  distribution(effect: OutcomeStackBuff, tick: number) {
    const current = effect.observed
    if (current && (current.stack !== this.observation?.stack || current.expiresAt !== this.observation?.expiresAt)) {
      const previous = this.observation
      const appliedAt = outcomeBuffTick(current.expiresAt) - effect.durationTicks
      const increment =
        previous && outcomeBuffTick(previous.expiresAt) > appliedAt
          ? Math.max(1, current.stack - previous.stack)
          : current.stack
      for (let index = 0; index < increment; index++) this.advance(effect, appliedAt, 1, true)
      this.observation = current
    }
    const states = this.sampled ? [[this.simulated.stack(tick), 1]] : this.expected.distribution(tick)
    const actual = this.effectsAtStack(effect, effect.observed?.stack ?? 0)
    return states.map(([stack, probability]) => ({
      stack,
      probability,
      effects: [subtractUnconditionalDamageEffects(this.effectsAtStack(effect, stack), actual)],
    }))
  }

  advance(effect: OutcomeStackBuff, tick: number, probability: number, occurred: boolean) {
    if (this.sampled) {
      if (occurred) this.simulated.resolveAffinity(effect, tick)
    } else this.expected.resolveAffinity(effect, tick, probability)
  }
}
