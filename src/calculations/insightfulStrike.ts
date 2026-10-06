import type { DamageOutcome } from "./damage"
import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs"
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
type FocusDistribution = Map<string, FocusState & { probability: number }>

function addProbability(distribution: FocusDistribution, state: FocusState, probability: number) {
  if (probability <= 0) return
  const normalized = { ...state, decayStartsAtTick: state.focusUnits === 0 ? 0 : state.decayStartsAtTick }
  const key = [normalized.focusUnits, normalized.decayStartsAtTick, normalized.concentrationExpiresAtTick].join(":")
  const previous = distribution.get(key)
  distribution.set(key, { ...normalized, probability: (previous?.probability ?? 0) + probability })
}

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
  private distribution: FocusDistribution = new Map([
    ["0:0:0", { focusUnits: 0, decayStartsAtTick: 0, concentrationExpiresAtTick: 0, probability: 1 }],
  ])
  private lastTick = 0

  private advance(effect: InsightfulStrikeEffect, tick: number) {
    if (tick <= this.lastTick) return
    const next: FocusDistribution = new Map()
    for (const state of this.distribution.values())
      addProbability(next, advanceFocus(effect, state, this.lastTick, tick), state.probability)
    this.distribution = next
    this.lastTick = tick
  }

  expectedConcentration(effect: InsightfulStrikeEffect, tick: number) {
    this.advance(effect, tick)
    let probability = 0
    for (const state of this.distribution.values())
      if (state.concentrationExpiresAtTick > tick) probability += state.probability
    return probability
  }

  resolveAffinity(
    effect: InsightfulStrikeEffect,
    tick: number,
    inactiveProbability: number,
    activeProbability = inactiveProbability,
  ) {
    this.advance(effect, tick)
    const inactiveChance = outcomeProbability(inactiveProbability)
    const activeChance = outcomeProbability(activeProbability)
    const next: FocusDistribution = new Map()
    for (const state of this.distribution.values()) {
      const chance = state.concentrationExpiresAtTick > tick ? activeChance : inactiveChance
      addProbability(next, state, state.probability * (1 - chance))
      addProbability(next, gainFocus(effect, state, tick), state.probability * chance)
    }
    this.distribution = next
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
