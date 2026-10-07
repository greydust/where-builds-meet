import type { DamageOutcome } from "./damage"
import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs"
import { mergeTinyProbabilityStates } from "./probabilityStateMerging"
import {
  mergeEffectDefinition,
  requirementsPass,
  type EditableObject,
  type EffectDefinition,
  type InnerWayEffectRule,
  type RequirementState,
} from "./rotationTimeline"

type DirectAffinityRule = { value: number; requirement?: unknown }

export type InsightfulStrikeEffect = {
  outcome: DamageOutcome
  resourceName: string
  concentrationName: string
  focusGainUnits: number
  focusThresholdUnits: number
  focusDecayUnitsPerTick: number
  focusDecayDelayTicks: number
  concentrationDurationTicks: number
  affinityDamageBonus: number
  directAffinityRules: DirectAffinityRule[]
  damageBonusRules?: { value: number; requirement?: unknown }[]
  leechRules?: { value: number; requirement?: unknown }[]
  incomingDamageReduction?: { chance: number; reduction: number }
}

type FocusState = { focusUnits: number; decayStartsAtTick: number; concentrationExpiresAtTick: number }
type WeightedFocusState = FocusState & { probability: number }

function advanceFocus(effect: InsightfulStrikeEffect, state: FocusState, lastTick: number, tick: number): FocusState {
  const decayTicks = Math.max(0, tick - Math.max(lastTick, state.decayStartsAtTick))
  const focusUnits = Math.max(0, state.focusUnits - decayTicks * effect.focusDecayUnitsPerTick)
  return {
    focusUnits,
    // Once decay runs, lastTick carries elapsed time. Zero Focus has no timer.
    decayStartsAtTick: focusUnits === 0 || state.decayStartsAtTick <= tick ? 0 : state.decayStartsAtTick,
    concentrationExpiresAtTick: state.concentrationExpiresAtTick <= tick ? 0 : state.concentrationExpiresAtTick,
  }
}

function gainFocus(effect: InsightfulStrikeEffect, state: FocusState, tick: number): FocusState {
  const gainedFocus = state.focusUnits + effect.focusGainUnits
  const converted = gainedFocus >= effect.focusThresholdUnits
  return {
    focusUnits: converted ? 0 : gainedFocus,
    decayStartsAtTick: converted ? 0 : tick + effect.focusDecayDelayTicks,
    concentrationExpiresAtTick: converted ? tick + effect.concentrationDurationTicks : state.concentrationExpiresAtTick,
  }
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function effectAffinityDamageBonus(definition: EffectDefinition | undefined) {
  return (definition?.effect ?? []).reduce<number>((total, rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return total
    const wrapper = rule as EditableObject
    const effect =
      wrapper.effect && typeof wrapper.effect === "object" && !Array.isArray(wrapper.effect)
        ? (wrapper.effect as EditableObject)
        : wrapper
    const bonus = numericValue(effect.affinityDmgBonus)
    return total + (bonus ?? 0)
  }, 0)
}

function effectDirectAffinityRules(definition: EffectDefinition | undefined): DirectAffinityRule[] {
  return (definition?.effect ?? []).flatMap(rule => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return []
    const wrapper = rule as EditableObject
    const stat =
      wrapper.stat && typeof wrapper.stat === "object" && !Array.isArray(wrapper.stat)
        ? (wrapper.stat as EditableObject)
        : undefined
    const value = numericValue(stat?.directAffinity)
    return value === undefined ? [] : [{ value, requirement: wrapper.requirement }]
  })
}

export function insightfulStrikeDirectAffinityBonus(effect: InsightfulStrikeEffect, state: RequirementState): number {
  return effect.directAffinityRules.reduce(
    (total, rule) =>
      requirementsPass(rule.requirement, new Map(), new Map(), [], new Set(), [], {}, state)
        ? total + rule.value
        : total,
    0,
  )
}

export function insightfulStrikeConditionalBonus(
  effect: InsightfulStrikeEffect,
  state: RequirementState,
  tags: string[],
  kind: "damageBonusRules" | "leechRules" = "damageBonusRules",
): number {
  return (effect[kind] ?? []).reduce(
    (total, rule) =>
      requirementsPass(rule.requirement, new Map(), new Map(), tags, new Set(), [], {}, state)
        ? total + rule.value
        : total,
    0,
  )
}

export function insightfulStrikeEffectFor(
  rules: InnerWayEffectRule[],
  effectDefinitions: Record<string, EffectDefinition>,
): InsightfulStrikeEffect | undefined {
  for (const rule of rules) {
    const trigger = rule.trigger
    const resource =
      trigger?.resource && typeof trigger.resource === "object" && !Array.isArray(trigger.resource)
        ? (trigger.resource as EditableObject)
        : undefined
    const actions = Array.isArray(trigger?.action) ? trigger.action : trigger?.action ? [trigger.action] : []
    const applyAction = actions.find(
      (action): action is EditableObject =>
        Boolean(action) &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        (action as EditableObject).type === "apply" &&
        (action as EditableObject).target === "self" &&
        typeof (action as EditableObject).value === "string",
    )
    if (
      trigger?.event !== "damageOutcome" ||
      trigger.outcome !== "affinity" ||
      resource?.name !== "Focus" ||
      !applyAction
    )
      continue
    const resourceModifiers = rules
      .filter(candidate => candidate.target === resource.name && candidate.modify)
      .map(candidate => candidate.modify as EditableObject)
    const modifiedResource = Object.assign({}, resource, ...resourceModifiers)
    const gain = numericValue(modifiedResource.gain)
    const decayRate = numericValue(modifiedResource.decayRate)
    const decayDelay = numericValue(modifiedResource.decayDelay)
    const threshold = numericValue(modifiedResource.threshold)
    const resetTo = numericValue(modifiedResource.resetTo)
    const concentrationName = applyAction.value as string
    const baseConcentration = effectDefinitions[concentrationName]
    if (!baseConcentration) return undefined
    const concentration = rules
      .filter(candidate => candidate.target === concentrationName && candidate.modify)
      .reduce(
        (definition, candidate) => mergeEffectDefinition(definition, candidate.modify as EditableObject),
        baseConcentration,
      )
    if (
      gain === undefined ||
      gain <= 0 ||
      decayRate === undefined ||
      decayRate >= 0 ||
      decayDelay === undefined ||
      decayDelay < 0 ||
      threshold === undefined ||
      threshold <= 0 ||
      resetTo !== 0 ||
      typeof concentration?.duration !== "number" ||
      !Number.isFinite(concentration.duration)
    )
      return undefined
    const focusUnitsPerPoint = outcomeBuffTick(1 / Math.abs(decayRate))
    return {
      outcome: "affinity",
      resourceName: "Focus",
      concentrationName,
      focusGainUnits: Math.round(gain * focusUnitsPerPoint),
      focusThresholdUnits: Math.round(threshold * focusUnitsPerPoint),
      focusDecayUnitsPerTick: 1,
      focusDecayDelayTicks: outcomeBuffTick(decayDelay),
      concentrationDurationTicks: outcomeBuffTick(concentration.duration),
      affinityDamageBonus: effectAffinityDamageBonus(concentration),
      directAffinityRules: effectDirectAffinityRules(concentration),
      damageBonusRules: (concentration.effect ?? []).flatMap(rule => {
        const wrapper = rule as EditableObject
        const effect = (wrapper.effect ?? wrapper) as EditableObject
        return typeof effect.dmgBonus === "number" ? [{ value: effect.dmgBonus, requirement: wrapper.requirement }] : []
      }),
      leechRules: (concentration.effect ?? []).flatMap(rule => {
        const wrapper = rule as EditableObject
        const effect = (wrapper.effect ?? wrapper) as EditableObject
        return typeof effect.leech === "number" ? [{ value: effect.leech, requirement: wrapper.requirement }] : []
      }),
      incomingDamageReduction: concentration.incomingDamageReduction,
    }
  }
  return undefined
}

export class ExpectedInsightfulStrikeTracker {
  private inactive: WeightedFocusState[] = [
    { focusUnits: 0, decayStartsAtTick: 0, concentrationExpiresAtTick: 0, probability: 1 },
  ]
  // Min-heap: the earliest Concentration expiry is always at index zero.
  private active: WeightedFocusState[] = []
  private activeProbability = 0
  private lastTick = 0

  private expire(tick: number) {
    while (this.active.length && this.active[0].concentrationExpiresAtTick <= tick) {
      const expired = this.active[0]
      const tail = this.active.pop()!
      if (this.active.length) {
        this.active[0] = tail
        this.siftDown(0)
      }
      this.activeProbability -= expired.probability
      expired.concentrationExpiresAtTick = 0
      this.inactive.push(expired)
    }
    if (!this.active.length) this.activeProbability = 0
  }

  private siftDown(index: number) {
    const state = this.active[index]
    while (index * 2 + 1 < this.active.length) {
      let child = index * 2 + 1
      if (
        child + 1 < this.active.length &&
        this.active[child + 1].concentrationExpiresAtTick < this.active[child].concentrationExpiresAtTick
      )
        child++
      if (state.concentrationExpiresAtTick <= this.active[child].concentrationExpiresAtTick) break
      this.active[index] = this.active[child]
      index = child
    }
    this.active[index] = state
  }

  expectedConcentration(_effect: InsightfulStrikeEffect, tick: number) {
    this.expire(tick)
    return this.activeProbability
  }

  resolveAffinity(
    effect: InsightfulStrikeEffect,
    tick: number,
    inactiveProbability: number,
    activeProbability = inactiveProbability,
  ) {
    this.expire(tick)
    const nextInactive: WeightedFocusState[] = []
    const nextActive: WeightedFocusState[] = []
    const split = (states: WeightedFocusState[], chance: number) => {
      for (const state of states) {
        const advanced = advanceFocus(effect, state, this.lastTick, tick)
        const failed = state.probability * (1 - chance)
        const gained = state.probability * chance
        if (failed > 0) {
          const branch = { ...advanced, probability: failed }
          ;(branch.concentrationExpiresAtTick > tick ? nextActive : nextInactive).push(branch)
        }
        if (gained > 0) {
          const branch = { ...gainFocus(effect, advanced, tick), probability: gained }
          ;(branch.concentrationExpiresAtTick > tick ? nextActive : nextInactive).push(branch)
        }
      }
    }
    split(this.inactive, outcomeProbability(inactiveProbability))
    split(this.active, outcomeProbability(activeProbability))
    // One weighted rare state per category, with no timing-bucket restriction.
    // The shared helper still rounds weighted deadlines to the common clock.
    const merge = (states: WeightedFocusState[]) => {
      const statesByFocus = new Map<number, Map<number, Map<number, WeightedFocusState>>>()
      const result: WeightedFocusState[] = []
      for (const state of mergeTinyProbabilityStates(
        states,
        ["decayStartsAtTick", "concentrationExpiresAtTick"],
        ["focusUnits"],
        undefined,
        undefined,
        Infinity,
      )) {
        let decay = statesByFocus.get(state.focusUnits)
        if (!decay) statesByFocus.set(state.focusUnits, (decay = new Map()))
        let expiry = decay.get(state.decayStartsAtTick)
        if (!expiry) decay.set(state.decayStartsAtTick, (expiry = new Map()))
        const previous = expiry.get(state.concentrationExpiresAtTick)
        if (previous) previous.probability += state.probability
        else {
          expiry.set(state.concentrationExpiresAtTick, state)
          result.push(state)
        }
      }
      return result
    }
    this.inactive = merge(nextInactive)
    this.active = merge(nextActive)
    this.activeProbability = this.active.reduce((total, state) => total + state.probability, 0)
    for (let index = Math.floor(this.active.length / 2) - 1; index >= 0; index--) this.siftDown(index)
    this.lastTick = tick
  }
}

export class SimulatedInsightfulStrikeTracker {
  private state: FocusState = { focusUnits: 0, decayStartsAtTick: 0, concentrationExpiresAtTick: 0 }
  private lastTick = 0

  private advance(effect: InsightfulStrikeEffect, tick: number) {
    this.state = advanceFocus(effect, this.state, this.lastTick, tick)
    this.lastTick = tick
  }

  concentrationActive(effect: InsightfulStrikeEffect, tick: number) {
    this.advance(effect, tick)
    return this.state.concentrationExpiresAtTick > tick
  }

  resolveAffinity(effect: InsightfulStrikeEffect, tick: number) {
    this.advance(effect, tick)
    this.state = gainFocus(effect, this.state, tick)
  }
}
