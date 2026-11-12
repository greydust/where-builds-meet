import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs"
import type { EditableObject, InnerWayEffectRule } from "./rotationTimeline"

export type CriticalHealingBuff = { name: string; durationTicks: number; effects: EditableObject[] }

/** Retain a conditional setup effect after any recipient receives a critical heal. */
export function criticalHealingBuffFor(setupEffects: EditableObject[]): CriticalHealingBuff | undefined {
  for (const effect of setupEffects) {
    const retention = effect.retainAfterCriticalHealing as { buff: string; duration: number } | undefined
    if (retention)
      return {
        name: retention.buff,
        durationTicks: outcomeBuffTick(retention.duration),
        effects: [effect.effect as EditableObject],
      }
  }
  return undefined
}

/** Exact expiration distribution; active and inactive branches have different refresh chances. */
export class CriticalHealingBuffTracker {
  private inactive = 1
  private expiries = new Map<number, number>()

  probability(tick: number) {
    for (const [expiry, mass] of this.expiries) {
      if (expiry > tick) continue
      this.inactive += mass
      this.expiries.delete(expiry)
    }
    return outcomeProbability(1 - this.inactive)
  }

  refresh(tick: number, durationTicks: number, inactiveChance: number, activeChance: number) {
    this.probability(tick)
    const fromInactive = this.inactive * outcomeProbability(inactiveChance)
    let refreshed = fromInactive
    this.inactive -= fromInactive
    for (const [expiry, mass] of this.expiries) {
      const gained = mass * outcomeProbability(activeChance)
      refreshed += gained
      this.expiries.set(expiry, mass - gained)
    }
    const expiry = tick + durationTicks
    this.expiries.set(expiry, (this.expiries.get(expiry) ?? 0) + refreshed)
  }
}

export type CriticalHealingStacks = {
  recipientBuff: string
  casterBuff: string
  duration: number
  maxStack: number
  receivedPerStack: number
  dealtPerStack: number
  lowHPThreshold?: number
  additionalLowHPStacks?: number
  recipientCount: number
}

/** Cumulative tier patches share one critical-healing mechanic. */
export function criticalHealingStacksFor(rules: InnerWayEffectRule[], recipientCount: number) {
  const patches = rules.flatMap(rule => {
    const value = rule.effect.criticalHealingStacks
    return value && typeof value === "object" ? [value] : []
  })
  return patches.length ? (Object.assign({ recipientCount }, ...patches) as CriticalHealingStacks) : undefined
}

type HealingStackState = {
  caster: number
  recipient: number
  casterExpiry: number
  recipientExpiry: number
  retentionExpiry: number
  weight: number
}

function mergeHealingStackState(states: Map<string, HealingStackState>, state: HealingStackState) {
  if (state.weight === 0) return
  const key = `${state.caster}:${state.recipient}:${state.casterExpiry}:${state.recipientExpiry}:${state.retentionExpiry}`
  const existing = states.get(key)
  if (existing) existing.weight += state.weight
  else states.set(key, state)
}

/**
 * Pair marginals retain each recipient's correlation with the caster and Ivorybloom.
 * No full party cross product is needed: healing depends on only these three states.
 */
export class CriticalHealingStackTracker {
  private recipients: Map<string, HealingStackState>[] = []

  private statesAt(config: CriticalHealingStacks, tick: number) {
    while (this.recipients.length < config.recipientCount) {
      const initial = {
        caster: 0,
        recipient: 0,
        casterExpiry: -Infinity,
        recipientExpiry: -Infinity,
        retentionExpiry: -Infinity,
        weight: 1,
      }
      this.recipients.push(new Map([["0:0:-Infinity:-Infinity:-Infinity", initial]]))
    }
    this.recipients = this.recipients.map(states => {
      const expired = new Map<string, HealingStackState>()
      for (const state of states.values()) {
        const casterExpiry = state.casterExpiry > tick ? state.casterExpiry : -Infinity
        const recipientExpiry = state.recipientExpiry > tick ? state.recipientExpiry : -Infinity
        mergeHealingStackState(expired, {
          ...state,
          caster: casterExpiry > tick ? state.caster : 0,
          recipient: recipientExpiry > tick ? state.recipient : 0,
          casterExpiry,
          recipientExpiry,
          retentionExpiry: state.retentionExpiry > tick ? state.retentionExpiry : -Infinity,
        })
      }
      return expired
    })
    return this.recipients
  }

  snapshot(config: CriticalHealingStacks, tick: number) {
    const recipients = this.statesAt(config, tick)
    let retainedProbability = 0
    let casterStacks = 0
    for (const state of recipients[0].values()) {
      retainedProbability += state.retentionExpiry > tick ? state.weight : 0
      casterStacks += state.caster * state.weight
    }
    const effects = (retained: boolean) =>
      recipients.map(states => {
        let mass = 0
        let received = 0
        let dealtWithReceived = 0
        for (const state of states.values()) {
          if (state.retentionExpiry > tick !== retained) continue
          mass += state.weight
          const incoming = state.recipient * config.receivedPerStack
          received += state.weight * incoming
          dealtWithReceived += state.weight * state.caster * config.dealtPerStack * (1 + incoming)
        }
        // E[(G + C)(1 + N)] = (G + E[C(1+N)] / E[1+N]) E[1+N].
        // This preserves the shared formula's additive outgoing bracket exactly.
        return mass
          ? [{ healingBonus: dealtWithReceived / (mass + received), healingReceivedBonus: received / mass }]
          : []
      })
    return {
      retainedProbability: outcomeProbability(retainedProbability),
      casterStacks,
      recipientStacks: recipients.map(states =>
        [...states.values()].reduce((sum, state) => sum + state.weight * state.recipient, 0),
      ),
      inactive: effects(false),
      active: effects(true),
    }
  }

  advance(
    config: CriticalHealingStacks,
    tick: number,
    recipientIndices: number[],
    inactiveRates: number[],
    activeRates: number[],
    selfHPRatio: number,
    retentionDurationTicks = 0,
  ) {
    const recipients = this.statesAt(config, tick)
    const gains = recipientIndices.map(
      index =>
        1 + Number(index === 0 && selfHPRatio < (config.lowHPThreshold ?? 0)) * (config.additionalLowHPStacks ?? 0),
    )
    this.recipients = recipients.map((states, recipientIndex) => {
      const next = new Map<string, HealingStackState>()
      const ownIndex = recipientIndices.indexOf(recipientIndex)
      const distributions = [inactiveRates, activeRates].map(rates => {
        let distribution = new Map([[0, 1]])
        recipientIndices.forEach((_, index) => {
          if (index === ownIndex) return
          const chance = outcomeProbability(rates[index] ?? 0)
          const updated = new Map<number, number>()
          for (const [gain, weight] of distribution) {
            updated.set(gain, (updated.get(gain) ?? 0) + weight * (1 - chance))
            const increased = Math.min(config.maxStack, gain + gains[index])
            updated.set(increased, (updated.get(increased) ?? 0) + weight * chance)
          }
          distribution = updated
        })
        return distribution
      })
      for (const state of states.values()) {
        const retained = state.retentionExpiry > tick
        const rates = retained ? activeRates : inactiveRates
        const ownChance = ownIndex < 0 ? 0 : outcomeProbability(rates[ownIndex] ?? 0)
        for (const [otherGain, otherWeight] of distributions[Number(retained)]) {
          for (const critical of [false, true]) {
            const ownGain = critical && ownIndex >= 0 ? gains[ownIndex] : 0
            const gain = otherGain + ownGain
            const casterGain = config.dealtPerStack ? gain : 0
            mergeHealingStackState(next, {
              caster: Math.min(config.maxStack, state.caster + casterGain),
              recipient: Math.min(config.maxStack, state.recipient + ownGain),
              casterExpiry: casterGain ? tick + outcomeBuffTick(config.duration) : state.casterExpiry,
              recipientExpiry: ownGain ? tick + outcomeBuffTick(config.duration) : state.recipientExpiry,
              retentionExpiry: gain && retentionDurationTicks ? tick + retentionDurationTicks : state.retentionExpiry,
              weight: state.weight * otherWeight * (critical ? ownChance : 1 - ownChance),
            })
          }
        }
      }
      return next
    })
  }
}
