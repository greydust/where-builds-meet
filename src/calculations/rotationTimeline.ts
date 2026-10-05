import type { WeaponFamily, WeaponId } from "../types"
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark"
import {
  bossDefinitionFor,
  DEFAULT_TARGET_HP_RATIO,
  normalizeEnemyCount,
  normalizePing,
  resolveTargetType,
  type TargetAttackPattern,
  type TargetType,
} from "./combatDefaults"
import { resolveSegmentValue, resolveSwitchValue, type SwitchValue } from "./dynamicValues"
import {
  ExpectedPeriodicTracker,
  nextBattlePeriodicTick,
  outcomeProbability,
  maxStackActionFor,
  type MaxStackAction,
} from "./outcomeTriggeredBuffs"
import {
  trackedEffectMetadata,
  effectKey,
  effectState,
  mapTrackedEffects,
  filterTrackedEffects,
  type EffectState,
} from "./trackedEffectState"
import {
  addUnconditionalDamageEffects,
  splitUnconditionalDamageEffectRules,
  type UnconditionalDamageEffects,
} from "./unconditionalDamageEffects"

export type EditableObject = Record<string, unknown>
export type PeriodicEffect = {
  interval?: number
  firstTick?: number
  /** Expected timelines only: share interval boundaries relative to battle start. */
  expectedTickAlignment?: "battle"
  resetOnRefresh?: boolean
  tickOnExpire?: boolean
  action?: unknown[]
}
export type SubActionReference = {
  value: string | string[]
  requirement?: unknown
  fallback?: string | string[]
  /** Delay the ordered cast until this component is ready after its action-free prefix. */
  waitForRequirement?: boolean
}
export type EditableCastTimeOptions = {
  /** The tracked effect whose duration follows the user-entered rotation duration. */
  effect?: string
  /** Hard upper bound for the authored duration. */
  max?: number
  /** Reject persisted/imported steps that omit an explicit duration. */
  required?: boolean
}
export type SkillRecord = {
  [key: string]: unknown
  name?: string
  damageGroup?: { id: string; name: string }
  shortName?: string
  skillBreakdownCategory?: string
  group?: boolean
  ignorePing?: boolean
  /** Opt in to paying the rotation ping when this skill is started by a trigger. */
  triggerPing?: boolean
  /** An inert charging component: no actions, cooldown, or skill-start notifications. */
  silent?: boolean
  attackResponse?: {
    endMargin?: number
    durationFrom?: string
    onSuccess: string
    perAttack?: boolean
    /** Resolve success at cast start only when no incoming attack is selected. */
    fallback?: boolean
  }
  /**
   * A duration-controlled skill uses the step duration as its held cast duration and
   * can mirror that value onto an internal tracked effect.
   */
  editableCastTime?: EditableCastTimeOptions | boolean
  castTime?: number | SwitchValue
  /**
   * Resource rates held for this skill's own cast. Regeneration replaces the
   * base rate and consumption drains on top of it; a direct spend suspends
   * regeneration without stopping consumption. A composite skill carries no
   * rates here — each sub-skill owns the phase it covers.
   */
  endurance?: { regeneration?: number; consumption?: number }
  cooldown?: number
  cooldownGroup?: string
  cooldownUses?: number
  cooldownRecovery?: "window" | "independent"
  duration?: number
  collectBoostDamage?: string
  subAction?: Array<string | SubActionReference>
  action?: unknown[]
  periodic?: PeriodicEffect
  modifier?: unknown[]
  tags?: string[]
  martialArt?: WeaponId
  weapon?: WeaponFamily
}
export type AttachedEventTarget = { action: number | "start"; trigger?: number }
/** Every event step also reads as carrying no skill, so `step.skill` stays a total read across
    `RotationStep` and a step can be filtered by name; only the skill variant may set it. */
type RotationEventStep =
  | { event: "Exhausted"; after: AttachedEventTarget; duration?: number; startTime?: number }
  | { event: "Exhausted"; before: AttachedEventTarget; duration?: number; startTime?: number }
  | { event: "Move"; before: AttachedEventTarget; distance: number; startTime?: number }
  | { event: "SelfHP"; before: AttachedEventTarget; currentHP: number; currentHPRatio?: number; startTime?: number }
  | { event: "SelfHP"; before: AttachedEventTarget; currentHPRatio: number; currentHP?: number; startTime?: number }
  | { event: "SelfHP"; startTime: number; currentHP: number; currentHPRatio?: number }
  | { event: "SelfHP"; startTime: number; currentHPRatio: number; currentHP?: number }
  | { event: "TakeDamage"; startTime: number; damage: number; automatic?: "targetAttack" }
  | { event: "Hellfire"; startTime: number; amount: number }
  // Accepted only at persistence/import boundaries and migrated to startTime.
  | { event: "TakeDamage"; before: AttachedEventTarget; damage: number; startTime?: number }
  | { event: "HP"; before: AttachedEventTarget; targetHPRatio: number; startTime?: number }
  | { event: "HP"; startTime: number; targetHPRatio: number; automatic?: true }
  | { event: "Qi"; before: AttachedEventTarget; targetQiRatio: number; startTime?: number }
  | { event: "Qi"; after: AttachedEventTarget; targetQiRatio: number; startTime?: number }
  | { event: "Qi"; startTime: number; targetQiRatio: number }
  | { event: "Buff"; before: AttachedEventTarget; buff: string; stack?: number; startTime?: number }
  | { event: "Buff"; startTime: number; buff: string; stack?: number }
  | { event: "Debuff"; before: AttachedEventTarget; debuff: string; stack?: number; startTime?: number }
  | { event: "Debuff"; startTime: number; debuff: string; stack?: number }
  | {
      event: "MartialArt"
      before: AttachedEventTarget & { action: "start"; trigger?: undefined }
      martialArt: WeaponId
    }
  | { event: "Delay"; duration: number; automatic?: "cooldown" | "attack" | "requirement" }
  | { event: "Controlled"; before: AttachedEventTarget; duration?: number; startTime?: number }
  | { event: "ShieldBroken"; before: AttachedEventTarget; startTime?: number }
  | { event: "BattleEnd"; before: AttachedEventTarget; startTime?: number }
  | { event: "Controlled" | "BattleEnd" | "ShieldBroken"; startTime: number; duration?: number }
  | { event: "Exhausted"; startTime: number; duration?: number }
  | { event: "Move"; startTime: number; distance: number }
  | { event: "Hellfire"; before: AttachedEventTarget; amount: number; startTime?: number }
export type RotationStep =
  | { type: "skill"; skill?: string; event?: undefined; duration?: number; causesBreak?: boolean; condition?: string }
  | ({ type: "event"; skill?: undefined } & RotationEventStep)

export function isFixedTimeEvent(
  step: RotationStep | undefined,
): step is Extract<RotationStep, { type: "event" }> & { startTime: number } {
  return (
    step?.type === "event" &&
    step.event !== "Delay" &&
    step.event !== "MartialArt" &&
    "startTime" in step &&
    typeof step.startTime === "number" &&
    Number.isFinite(step.startTime)
  )
}

export function isAttachmentAnchorStep(step: RotationStep | undefined): boolean {
  return Boolean(
    step && (step.type === "skill" || (step.type === "event" && step.event === "TakeDamage" && isFixedTimeEvent(step))),
  )
}

export function canAnchorAttachedEvent(step: RotationStep | undefined, target: AttachedEventTarget): boolean {
  if (!step) return false
  if (step.type === "skill") return true
  return (
    step.type === "event" &&
    step.event === "TakeDamage" &&
    isFixedTimeEvent(step) &&
    target.trigger === undefined &&
    target.action === 0
  )
}
export type RotationRecord = {
  name: string
  steps: RotationStep[]
  targetHP?: number
  /** Practice target for the encounter; omitted records resolve to `DEFAULT_TARGET_TYPE`. */
  targetType?: TargetType
  groupSize?: 1 | 5 | 10
  enemyCount?: number
  /** Optional per-rotation latency override, in milliseconds. */
  ping?: number
  infiniteVitality?: boolean
  /**
   * Whether the selected Divinecraft contributes its burn, poison, and Solid
   * Foundation to this rotation. Omitted means damage applies.
   */
  divinecraftDamage?: boolean
  start?: { step: number; action?: number }
  eventTimeReference?: "battleStart"
}
export type TrackedEffect = {
  name: string
  /** Zero is self; positive indexes are the other players represented by the rotation. */
  playerRecipientIndex?: number
  appliedAt?: number
  expiresAt?: number
  stack?: number
  maxStack?: number
  /** Remaining successful triggers for a finite effect listener. */
  remainingTriggers?: number
  /** Frozen attack conversion threshold for this activation. */
  accumulatorThreshold?: number
  persistent?: boolean
  sourceRowId?: string
  collectBoostDamage?: string
  unconditionalDamageEffects?: UnconditionalDamageEffects
  perHitEffectRules?: unknown[]
}
export type ExpectedEffectDistribution = Array<{ probability: number; effects: EditableObject[] }>
export type ResourceState = Record<string, number>
export type ResolvedHealingState = { self: number[]; teammateOverhealContributions: number[] }
export type ResourceRangeState = Record<string, { minimum: number; maximum: number; expected?: number }>
export type TimelineResourceSummary = Record<
  string,
  { initial: number; consumed: number; regenerated: number; final: number }
>
export type InnerWayEffectRule = {
  requirement?: unknown
  effect: EditableObject
  trigger?: EditableObject
  listen?: EditableObject
  target?: string
  modify?: EditableObject
  source: string
  tier: number
}
export type TimelineRowKind = "rotation" | "trigger" | "dot" | "periodic" | "damageGroup"
export type TimelineRow = {
  /** Resolved combat endpoint, including a final cast/Delay with no damage. */
  timelineEndTime?: number
  /** Internal clock timestamp of the detected battle start; -1 means no start was reached. */
  battleStartTime?: number
  /** Presentation-only placeholder while the editor's worker request is pending. */
  pendingCalculation?: boolean
  expectedBranch?: { effect: string; id: string }
  expectedExpiration?: { effect: string; source: string; time: number }
  /** Fractional cast attribution for an expected periodic tick. */
  sourceDamageWeights?: Record<string, number>
  id: string
  kind: TimelineRowKind
  sourceRowId?: string
  /** Ordered row whose queued trigger started this generated row. */
  queuedFrom?: string
  /** Recipient of a periodic player-target effect. Zero is self. */
  playerRecipientIndex?: number
  triggerSource?: "skill" | "setup" | "innerWay"
  /** Original cast tags for buff duration rules, independent of damage ownership and damage tags. */
  buffSourceSkillTags?: string[]
  rotationIndex?: number
  order: number
  step: RotationStep
  startTime: number
  distance: number
  currentHP: number
  currentHPRatio: number
  targetHPRatio: number
  targetQiRatio: number
  resources: ResourceState
  /** Current Endurance below its maximum, for the `enduranceLost` damage parameter. */
  enduranceLost: number
  /** Gross resource costs from accepted actions on this resolved row. */
  resourceConsumption?: ResourceState
  resourceRanges?: ResourceRangeState
  currentMartialArt?: WeaponId
  currentWeapon?: WeaponFamily
  effectiveCastTime: number
  skill?: SkillRecord
  actions: EditableObject[]
  buffs: EffectState
  debuffs: EffectState
  modifierEffects: EditableObject[]
  unconditionalDamageEffects?: UnconditionalDamageEffects
  actionSkillTags?: Record<number, string[]>
  actionModifierEffects?: Record<number, EditableObject[]>
  actionStates: Record<
    number,
    {
      buffs: EffectState
      debuffs: EffectState
      distance: number
      currentHP: number
      currentHPRatio: number
      targetHPRatio: number
      targetQiRatio: number
      resources: ResourceState
      enduranceLost?: number
      resourceRanges?: ResourceRangeState
      currentMartialArt?: WeaponId
      currentWeapon?: WeaponFamily
      unconditionalDamageEffects?: UnconditionalDamageEffects
      expectedEffects?: ExpectedEffectDistribution[]
      expectedDebuffStacks?: Record<string, number>
    }
  >
  /** Final ledger for the whole timeline. Present only on the first sorted row. */
  timelineResourceSummary?: TimelineResourceSummary
  /** Seconds at maximum stacks during combat, probability-weighted for chance debuffs. */
  debuffMaxStackSeconds?: Record<string, number>
  skipped?: boolean
  cooldownWait?: number
}

type OrderedQueueEntry<T> = { value: T; sequence: number }

class OrderedQueue<T> {
  private entries: Array<OrderedQueueEntry<T>> = []
  private nextSequence = 0
  private dirty = false
  private readonly compareValues: (left: T, right: T) => number

  constructor(compareValues: (left: T, right: T) => number) {
    this.compareValues = compareValues
  }

  get length() {
    return this.entries.length
  }

  peek() {
    this.ensureHeap()
    return this.entries[0]?.value
  }

  push(...values: T[]) {
    values.forEach(value => {
      const entry = { value, sequence: this.nextSequence++ }
      this.entries.push(entry)
      if (!this.dirty) this.siftUp(this.entries.length - 1)
    })
  }

  shift() {
    this.ensureHeap()
    const first = this.entries[0]
    const last = this.entries.pop()
    if (!first) return undefined
    if (last && this.entries.length > 0) {
      this.entries[0] = last
      this.siftDown(0)
    }
    return first.value
  }

  mutate(callback: (value: T) => void) {
    this.entries.forEach(entry => callback(entry.value))
    this.dirty = true
  }

  remove(predicate: (value: T) => boolean) {
    const remaining = this.entries.filter(entry => !predicate(entry.value))
    if (remaining.length === this.entries.length) return
    this.entries = remaining
    this.dirty = true
  }

  private compare(left: OrderedQueueEntry<T>, right: OrderedQueueEntry<T>) {
    return this.compareValues(left.value, right.value) || left.sequence - right.sequence
  }

  private ensureHeap() {
    if (!this.dirty) return
    for (let index = Math.floor(this.entries.length / 2) - 1; index >= 0; index -= 1) this.siftDown(index)
    this.dirty = false
  }

  private siftUp(startIndex: number) {
    let index = startIndex
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.compare(this.entries[parent], this.entries[index]) <= 0) return
      ;[this.entries[parent], this.entries[index]] = [this.entries[index], this.entries[parent]]
      index = parent
    }
  }

  private siftDown(startIndex: number) {
    let index = startIndex
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < this.entries.length && this.compare(this.entries[left], this.entries[smallest]) < 0) smallest = left
      if (right < this.entries.length && this.compare(this.entries[right], this.entries[smallest]) < 0) smallest = right
      if (smallest === index) return
      ;[this.entries[index], this.entries[smallest]] = [this.entries[smallest], this.entries[index]]
      index = smallest
    }
  }
}

function timelineRowsRepresentSameStep(left: TimelineRow, right: TimelineRow) {
  if (left.kind !== right.kind || left.step.type !== right.step.type) return false
  switch (left.step.type) {
    case "skill":
      return right.step.type === "skill" && left.step.skill === right.step.skill
    case "event":
      return right.step.type === "event" && left.step.event === right.step.event
  }
}

export function mergeCalculatedTimelineState(structuralTimeline: TimelineRow[], calculatedTimeline?: TimelineRow[]) {
  if (!calculatedTimeline) return structuralTimeline
  const groupIds = new Set(calculatedTimeline.filter(row => row.kind === "damageGroup").map(row => row.id))
  const calculatedRows = new Map(calculatedTimeline.map(row => [row.id, row]))
  const mergeEffectRuntimeState = (structural: EffectState, calculated: EffectState) =>
    mapTrackedEffects(structural, effect => {
      const calculatedEffect = calculated.get(effectKey(effect.name, effect.playerRecipientIndex))
      return calculatedEffect?.remainingTriggers === undefined
        ? effect
        : { ...effect, remainingTriggers: calculatedEffect.remainingTriggers }
    })
  const mergeStructuralRow = (row: TimelineRow) => {
    const calculatedRow = calculatedRows.get(row.id)
    if (!calculatedRow || !timelineRowsRepresentSameStep(row, calculatedRow)) return row
    const actionStates = Object.fromEntries(
      Object.entries(row.actionStates).map(([actionIndex, state]) => {
        const calculatedState = calculatedRow.actionStates[Number(actionIndex)]
        return [
          actionIndex,
          calculatedState
            ? {
                ...state,
                currentHP: calculatedState.currentHP,
                currentHPRatio: calculatedState.currentHPRatio,
                targetHPRatio: calculatedState.targetHPRatio,
                resourceRanges: calculatedState.resourceRanges,
                expectedDebuffStacks: calculatedState.expectedDebuffStacks,
                buffs: mergeEffectRuntimeState(state.buffs, calculatedState.buffs),
                debuffs: mergeEffectRuntimeState(state.debuffs, calculatedState.debuffs),
              }
            : state,
        ]
      }),
    )
    return {
      ...row,
      currentHP: calculatedRow.currentHP,
      currentHPRatio: calculatedRow.currentHPRatio,
      targetHPRatio: calculatedRow.targetHPRatio,
      resourceRanges: calculatedRow.resourceRanges,
      buffs: mergeEffectRuntimeState(row.buffs, calculatedRow.buffs),
      debuffs: mergeEffectRuntimeState(row.debuffs, calculatedRow.debuffs),
      actionStates,
    }
  }
  const mergedStructuralRows = new Map(structuralTimeline.map(row => [row.id, mergeStructuralRow(row)]))
  const acceptedRowIds = new Set(structuralTimeline.map(row => row.id))
  const displayedRows: TimelineRow[] = []
  const displayedRowIds = new Set<string>()

  for (const calculatedRow of calculatedTimeline) {
    if (calculatedRow.sourceRowId && groupIds.has(calculatedRow.sourceRowId)) {
      displayedRows.push(calculatedRow)
      displayedRowIds.add(calculatedRow.id)
      continue
    }
    const structuralRow = mergedStructuralRows.get(calculatedRow.id)
    if (structuralRow && timelineRowsRepresentSameStep(structuralRow, calculatedRow)) {
      displayedRows.push(structuralRow)
      displayedRowIds.add(structuralRow.id)
      continue
    }
    if (
      calculatedRow.kind === "rotation" ||
      !calculatedRow.sourceRowId ||
      !acceptedRowIds.has(calculatedRow.sourceRowId)
    )
      continue
    displayedRows.push(calculatedRow)
    displayedRowIds.add(calculatedRow.id)
    acceptedRowIds.add(calculatedRow.id)
  }

  for (const structuralRow of mergedStructuralRows.values()) {
    if (structuralRow.sourceRowId && groupIds.has(structuralRow.sourceRowId)) continue
    if (!displayedRowIds.has(structuralRow.id)) displayedRows.push(structuralRow)
  }
  return displayedRows.sort(
    (left, right) =>
      compareTimelineTime(left.startTime, right.startTime) ||
      left.order - right.order ||
      (left.kind === "rotation" ? -1 : right.kind === "rotation" ? 1 : 0),
  )
}

export type EffectDefinition = {
  badgeColor?: "red"
  damageGroup?: { id: string; name: string }
  onMaxStack?: MaxStackAction
  name?: string
  shortName?: string
  description?: string
  global?: boolean | { equippedMartialArt: WeaponId }
  shared?: boolean
  showCoverage?: boolean
  /** Internal bookkeeping effect, such as a cadence counter. Never shown in the timeline. */
  hidden?: boolean
  /** Internal counter lifetime and attribution follow this self buff. */
  parentEffect?: string
  /**
   * Reactive actions while this buff is active; uses the shared setup-trigger contract.
   * A definition always supplies the event and requirement here, so only `action`
   * may be an array, and that array is resolved by the timeline rather than indexed.
   */
  trigger?: EditableObject & { action?: EditableObject | EditableObject[] }
  refresh?: boolean
  duration?: number
  cooldown?: number
  maxStack?: number
  effect?: unknown[]
  stackEffects?: unknown[][]
  action?: unknown[]
  periodic?: PeriodicEffect
  recording?: { event: "damage"; requirement?: unknown; action: { type: "trigger"; value: string } }
  accumulator?: {
    threshold?: number | { physical: number; silkbind: number }
    event?: string
    checkEvent?: string
    amount?: number | SwitchValue
    requirement?: unknown
    oncePerSkill?: boolean
    resetOnRefresh?: boolean
  }
  listen?: Array<{ event?: string; cooldown?: number; maxTriggers?: number; action?: EditableObject }>
}

function finiteListenerTriggerLimit(definition: EffectDefinition) {
  const limit = definition.listen?.find(
    listener => typeof listener.maxTriggers === "number" && Number.isFinite(listener.maxTriggers),
  )?.maxTriggers
  return typeof limit === "number" ? Math.max(0, Math.floor(limit)) : undefined
}

export function effectsForTrackedEffect(stack: number | undefined, definition: EffectDefinition | undefined) {
  if (Array.isArray(definition?.stackEffects)) {
    const stackEffects = definition.stackEffects[Math.max(0, (stack ?? 1) - 1)]
    return Array.isArray(stackEffects) ? stackEffects : []
  }
  return definition?.effect ?? []
}

function boostDamageCollection(
  skill: SkillRecord | undefined,
  effectName: string,
  source: TrackedEffect | undefined,
  fallbackSourceRowId: string,
) {
  if (typeof skill?.collectBoostDamage === "string") {
    return { sourceRowId: fallbackSourceRowId, collectBoostDamage: skill.collectBoostDamage }
  }
  const inheritedSource = source?.collectBoostDamage === effectName && source.sourceRowId ? source : undefined
  return inheritedSource
    ? { sourceRowId: inheritedSource.sourceRowId ?? fallbackSourceRowId, collectBoostDamage: effectName }
    : { sourceRowId: fallbackSourceRowId }
}

export type TimelineBuildInput = {
  /** Storage comparison for the stack-indexed expected tracker. */
  expectedPeriodicStorage?: "packed" | "indexed"
  /** Diagnostic opt-out for the expected shared-clock tiny-state approximation. */
  expectedPeriodicStateMerging?: boolean
  rotation: RotationRecord
  skills: Record<string, SkillRecord>
  eventDefinitions: Record<string, SkillRecord>
  dots: Record<string, SkillRecord>
  effectDefinitions: Record<string, EffectDefinition>
  innerWayConditions: string[]
  innerWayRules: InnerWayEffectRule[]
  setupEffects: EditableObject[]
  weapons: WeaponId[]
  martialArtState?: Partial<Record<WeaponId, { weapon: WeaponFamily }>>
  initialBuffs?: TrackedEffect[]
  initialDebuffs?: TrackedEffect[]
  initialResources?: ResourceState
  resourceRegeneration?: ResourceState
  /** Seconds that a direct spend suppresses regeneration, per resource. */
  resourceSpendRegenDelay?: ResourceState
  resourceMaximums?: ResourceState
  infiniteResources?: string[]
  resourceEvents?: ResourceEventRule[]
  maxHP?: number
  cooldownPolicy?: "skip" | "wait"
}

/** Runtime callbacks stay inside the worker; they are never included in serialized calculation bundles. */
export type TimelineActionResolverFactory = (
  input: TimelineBuildInput,
  timeline: TimelineRow[],
  initialEffects: { buffs: EffectState; debuffs: EffectState },
) => ((
  row: TimelineRow,
  actionIndex: number,
) => { healing?: ResolvedHealingState; damage?: number; accumulatorThreshold?: number } | undefined) & {
  onCastEnd?: (row: TimelineRow) => void
}

export type ResourceEventRule = {
  event: "damage" | "takeDamage"
  resource: string
  amount: number | SwitchValue
  cooldown?: number
  perMaxHPRatio?: number
}

export type RequirementState = {
  enemyCount?: number
  distance?: number
  selfHPPercentage?: number
  targetHPPercentage?: number
  targetQiPercentage?: number
  /** Endurance as a percentage of the current maximum; absent while Endurance is not a tracked resource. */
  endurancePercentage?: number
  skillCooldowns?: Record<string, number>
  skillCooldownGroups?: Record<string, string>
  currentTime?: number
  currentMartialArt?: WeaponId
  currentWeapon?: WeaponFamily
  targetType?: TargetType
  /** False until the fight-start anchor, so a rule can exclude prepull hits. */
  battleStarted?: boolean
}

function resolveSkillCastTime(skill: SkillRecord | undefined, state: RequirementState = {}): number {
  const castTime = skill?.castTime
  if (typeof castTime === "number" && Number.isFinite(castTime)) return castTime
  const resolved = resolveSwitchValue(castTime, state)
  return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : 0
}

function editableCastTimeOptions(skill: SkillRecord | undefined) {
  const input = skill?.editableCastTime
  return input && typeof input === "object" ? input : undefined
}

export function editableCastTimeMaximum(skill: SkillRecord | undefined) {
  const maximum = editableCastTimeOptions(skill)?.max
  return typeof maximum === "number" && Number.isFinite(maximum) && maximum >= 0 ? maximum : undefined
}

export function editableCastTimeRequired(skill: SkillRecord | undefined) {
  return editableCastTimeOptions(skill)?.required === true
}

function editableCastTimeEffect(skill: SkillRecord | undefined) {
  return editableCastTimeOptions(skill)?.effect
}

/** Resolve the held duration, defaulting a bounded duration input to its maximum. */
export function resolveSkillStepDuration(
  step: RotationStep | undefined,
  skill: SkillRecord | undefined,
): number | undefined {
  if (step?.type !== "skill" || !skill) return undefined
  if (!skill.editableCastTime) return undefined
  const maximum = editableCastTimeMaximum(skill)
  if (typeof step.duration !== "number" || !Number.isFinite(step.duration)) return maximum
  return Math.max(0, maximum === undefined ? step.duration : Math.min(step.duration, maximum))
}

type ExpandedSkillSegment = {
  skillId: string
  skill: SkillRecord
  reference?: {
    value?: string
    requirement?: unknown
    fallback?: string
    waitForRequirement?: boolean
    choiceGroup?: number
    choiceIndex?: number
  }
  baseCastTime: number
  baseStartOffset: number
  actionIndexes: number[]
  localActionTimes: number[]
}
function expandSkill(skillId: string, skills: Record<string, SkillRecord>) {
  const root = skills[skillId]
  const segments: ExpandedSkillSegment[] = []
  const actions: EditableObject[] = []
  let castTime = 0
  let nextChoiceGroup = 0
  const normalizeSubAction = (value: string | SubActionReference): SubActionReference =>
    typeof value === "string" ? { value } : value
  const append = (
    currentSkillId: string | undefined,
    ancestry: Set<string>,
    reference?: ExpandedSkillSegment["reference"],
  ) => {
    if (currentSkillId && ancestry.has(currentSkillId)) return
    const skill = currentSkillId ? skills[currentSkillId] : undefined
    const fallbackSkill = reference?.fallback ? skills[reference.fallback] : undefined
    if (!skill && !fallbackSkill) return
    const baseCastTime = resolveSkillCastTime(skill)
    const baseActions = Array.isArray(skill?.action) ? (skill.action as EditableObject[]) : []
    if (skill?.silent && (baseActions.length || skill.cooldown !== undefined || skill.attackResponse))
      throw new Error(`Silent skill ${currentSkillId} cannot define actions, cooldowns, or attack responses.`)
    const fallbackActions = Array.isArray(fallbackSkill?.action) ? (fallbackSkill.action as EditableObject[]) : []
    const actionSlotCount = Math.max(baseActions.length, fallbackActions.length)
    const actionIndexes = Array.from({ length: actionSlotCount }, (_, localIndex) => {
      const action = baseActions[localIndex]
      const actionIndex = actions.length
      actions.push(
        action
          ? { ...action, time: castTime + (typeof action.time === "number" ? action.time : 0) }
          : { type: "inactive", time: castTime + baseCastTime },
      )
      return actionIndex
    })
    segments.push({
      skillId: currentSkillId ?? reference?.fallback ?? "",
      skill: skill ?? { name: "Inactive sub-action", castTime: 0, action: [], tags: ["SubAction"] },
      reference,
      baseCastTime,
      baseStartOffset: castTime,
      actionIndexes,
      localActionTimes: Array.from({ length: actionSlotCount }, (_, localIndex) => {
        const action = baseActions[localIndex]
        return action && typeof action.time === "number" ? action.time : baseCastTime
      }),
    })
    castTime += baseCastTime
    const nextAncestry = currentSkillId ? new Set(ancestry).add(currentSkillId) : new Set(ancestry)
    if (Array.isArray(skill?.subAction))
      skill.subAction.forEach(entry => {
        const subAction = normalizeSubAction(entry)
        appendSubAction(subAction, nextAncestry)
      })
  }
  const appendSubAction = (reference: SubActionReference, ancestry: Set<string>) => {
    const primary = Array.isArray(reference.value) ? reference.value : [reference.value]
    const fallback = Array.isArray(reference.fallback)
      ? reference.fallback
      : reference.fallback
        ? [reference.fallback]
        : []
    const isSequence = Array.isArray(reference.value) || Array.isArray(reference.fallback)
    if (!isSequence) {
      append(primary[0], ancestry, {
        value: primary[0],
        requirement: reference.requirement,
        waitForRequirement: reference.waitForRequirement,
        fallback: fallback[0],
      })
      return
    }
    const choiceGroup = nextChoiceGroup++
    const componentCount = Math.max(primary.length, fallback.length)
    for (let choiceIndex = 0; choiceIndex < componentCount; choiceIndex += 1)
      append(primary[choiceIndex], ancestry, {
        value: primary[choiceIndex],
        requirement: reference.requirement,
        waitForRequirement: reference.waitForRequirement,
        fallback: fallback[choiceIndex],
        choiceGroup,
        choiceIndex,
      })
  }
  append(skillId, new Set())
  return { skill: root, actions, segments, castTime, isMultiAction: Boolean(root?.subAction?.length) }
}

/** Resolve the reserved action slots and local times produced by a composite skill. */
export function expandedSkillActionLayout(skillId: string, skills: Record<string, SkillRecord>) {
  const expanded = expandSkill(skillId, skills)
  const actionTimes = expanded.segments.flatMap(segment => {
    const primary = Array.isArray(segment.skill.action) ? (segment.skill.action as EditableObject[]) : []
    const fallbackSkill = segment.reference?.fallback ? skills[segment.reference.fallback] : undefined
    const fallback = Array.isArray(fallbackSkill?.action) ? (fallbackSkill.action as EditableObject[]) : []
    return segment.actionIndexes.map((_, index) => {
      const action = primary[index] ?? fallback[index]
      return segment.baseStartOffset + (action && typeof action.time === "number" ? action.time : segment.baseCastTime)
    })
  })
  return { actionTimes, castTime: expanded.castTime }
}
/** Count the reserved action slots produced by a composite skill and all fallback branches. */
export function expandedSkillActionCount(skillId: string, skills: Record<string, SkillRecord>) {
  return expandedSkillActionLayout(skillId, skills).actionTimes.length
}

export const TIMELINE_TIME_EPSILON = 1e-4

export function compareTimelineTime(left: number, right: number): number {
  const difference = left - right
  return Math.abs(difference) <= TIMELINE_TIME_EPSILON ? 0 : difference
}

export function mergeEffectDefinition(definition: EffectDefinition, modify: EditableObject): EffectDefinition {
  const appendedEffects = Array.isArray(modify.effect)
    ? [...(Array.isArray(definition.effect) ? definition.effect : []), ...modify.effect]
    : definition.effect
  return {
    ...definition,
    ...modify,
    ...(appendedEffects === undefined ? {} : { effect: appendedEffects }),
    ...(definition.periodic || modify.periodic
      ? {
          periodic: {
            ...definition.periodic,
            ...(modify.periodic && typeof modify.periodic === "object" && !Array.isArray(modify.periodic)
              ? (modify.periodic as PeriodicEffect)
              : {}),
          },
        }
      : {}),
  }
}

export function requirementsPass(
  requirement: unknown,
  buffs: EffectState,
  debuffs: EffectState,
  skillTags: string[],
  innerWayConditions: Set<string>,
  weapons: WeaponId[] = [],
  resources: ResourceState = {},
  state: RequirementState = {},
  startEffects?: { buffs: EffectState; debuffs: EffectState },
): boolean {
  if (!Array.isArray(requirement)) return true
  const hasEffect = (target: unknown, value: unknown, requiredStack?: unknown, atStart = false) => {
    if (typeof value !== "string") return false
    switch (target) {
      case "skillTag":
      case "martialArt":
        return skillTags.includes(value)
      case "equippedMartialArt":
        return weapons.includes(value as WeaponId)
      case "currentMartialArt":
        return state.currentMartialArt === value
      case "currentWeapon":
        return state.currentWeapon === value
      case "targetType":
        return state.targetType === value
      default:
        break
    }
    // An element marked resolveAt: "skillStart" reads the state captured when the
    // skill started, so a rule can test whether an effect was up before a windup
    // let it lapse, and still apply it when the hit lands.
    const source = atStart && startEffects ? startEffects : { buffs, debuffs }
    const trackedEffect = target === "target" ? source.debuffs.get(value) : source.buffs.get(value)
    if (requiredStack === "max")
      return Boolean(trackedEffect?.maxStack !== undefined && (trackedEffect.stack ?? 0) >= trackedEffect.maxStack)
    if (typeof requiredStack === "number") return Boolean(trackedEffect && (trackedEffect.stack ?? 0) >= requiredStack)
    if (target === "target") return Boolean(trackedEffect)
    return Boolean(trackedEffect) || innerWayConditions.has(value)
  }
  const evaluate = (condition: unknown): boolean => {
    if (Array.isArray(condition)) return condition.every(evaluate)
    if (!condition || typeof condition !== "object") return false
    const item = condition as EditableObject
    if (item.operator === "or" && Array.isArray(item.operand)) return item.operand.some(evaluate)
    if (item.operator === "not" && Array.isArray(item.operand) && item.operand.length === 1)
      return !evaluate(item.operand[0])
    if (item.target === "battleStarted") return state.battleStarted === true
    if (item.target === "skillCooldown") {
      if (typeof item.value !== "string" || item.comparison !== "ready") return false
      const cooldownIdentity = state.skillCooldownGroups?.[item.value] ?? item.value
      return (state.skillCooldowns?.[`skill:${cooldownIdentity}`] ?? 0) <= (state.currentTime ?? 0)
    }
    if (
      item.target === "resource" ||
      item.target === "distance" ||
      item.target === "enemyCount" ||
      item.target === "selfHPPercentage" ||
      item.target === "targetHPPercentage" ||
      item.target === "targetQiPercentage" ||
      item.target === "endurancePercentage"
    ) {
      let current = 0
      switch (item.target) {
        case "enemyCount":
          current = normalizeEnemyCount(state.enemyCount)
          break
        case "distance":
          current = state.distance ?? 1
          break
        case "resource":
          current = typeof item.value === "string" ? (resources[item.value] ?? 0) : 0
          break
        case "selfHPPercentage":
          current = state.selfHPPercentage ?? 100
          break
        case "targetHPPercentage":
          current = state.targetHPPercentage ?? DEFAULT_TARGET_HP_RATIO * 100
          break
        case "targetQiPercentage":
          current = state.targetQiPercentage ?? 100
          break
        case "endurancePercentage":
          // An untracked Endurance has no meaningful percentage, so the condition
          // stays unsatisfied rather than defaulting to a full meter.
          if (state.endurancePercentage === undefined) return false
          current = state.endurancePercentage
          break
      }
      let comparedValue: number | undefined
      if (typeof item.amount === "number" && Number.isFinite(item.amount)) comparedValue = item.amount
      else if (typeof item.compareTo === "string") {
        switch (item.compareTo) {
          case "selfHPPercentage":
            comparedValue = state.selfHPPercentage ?? 100
            break
          case "targetHPPercentage":
            comparedValue = state.targetHPPercentage ?? DEFAULT_TARGET_HP_RATIO * 100
            break
          case "targetQiPercentage":
            comparedValue = state.targetQiPercentage ?? 100
            break
          case "endurancePercentage":
            comparedValue = state.endurancePercentage
            break
        }
      }
      if (comparedValue === undefined) return false
      switch (item.comparison) {
        case ">=":
          return current >= comparedValue
        case ">":
          return current > comparedValue
        case "<=":
          return current <= comparedValue
        case "<":
          return current < comparedValue
        case "==":
          return current === comparedValue
        case "!=":
          return current !== comparedValue
        default:
          return false
      }
    }
    return hasEffect(item.target, item.value, item.stack, item.resolveAt === "skillStart")
  }
  return requirement.every(evaluate)
}

function applyTrackedEffect(
  effects: EffectState,
  name: string,
  stack: number | undefined,
  duration: number | undefined,
  time: number,
  maxStackOverride?: number,
  refresh = true,
  sourceRowId?: string,
  collectBoostDamage?: string,
  playerRecipientIndex?: number,
  remainingTriggers?: number,
) {
  const existing = effects.get(effectKey(name, playerRecipientIndex))
  const nextStack = Math.min(maxStackOverride ?? Number.POSITIVE_INFINITY, (existing?.stack ?? 0) + (stack ?? 1))
  const persistent = existing?.persistent === true
  const expiresAt =
    persistent || duration === undefined ? undefined : existing && !refresh ? existing.expiresAt : time + duration
  const nextEffect: TrackedEffect = {
    name,
    ...(playerRecipientIndex !== undefined ? { playerRecipientIndex } : {}),
    appliedAt: existing && !refresh ? existing.appliedAt : time,
    stack: nextStack,
    maxStack: maxStackOverride,
    ...(remainingTriggers !== undefined ? { remainingTriggers } : {}),
    expiresAt,
    ...(persistent ? { persistent: true } : {}),
    ...(sourceRowId ? { sourceRowId } : existing?.sourceRowId ? { sourceRowId: existing.sourceRowId } : {}),
    ...(collectBoostDamage
      ? { collectBoostDamage }
      : existing?.collectBoostDamage
        ? { collectBoostDamage: existing.collectBoostDamage }
        : {}),
  }
  return new Map(effects).set(effectKey(name, playerRecipientIndex), nextEffect)
}

function extendTrackedEffect(effects: EffectState, name: string, duration: number, time: number) {
  return mapTrackedEffects(effects, effect =>
    effect.name !== name || effect.expiresAt === undefined || effect.expiresAt <= time
      ? effect
      : { ...effect, expiresAt: effect.expiresAt + duration },
  )
}

function consumeTrackedEffect(effects: EffectState, name: string, stack: number | "all" | undefined) {
  if (stack === "all") return filterTrackedEffects(effects, effect => effect.name !== name)
  const amount = Math.max(1, stack ?? 1)
  return mapTrackedEffects(effects, effect => {
    if (effect.name !== name || effect.persistent) return effect
    const remaining = (effect.stack ?? 1) - amount
    return remaining > 0 ? { ...effect, stack: remaining } : undefined
  })
}

function resolveCastModifierEffect(effect: EditableObject, buffs: EffectState, debuffs: EffectState) {
  return Object.fromEntries(
    Object.entries(effect).map(([field, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [field, value]
      const dynamicValue = value as EditableObject
      if (
        dynamicValue.function !== "byStack" ||
        typeof dynamicValue.param1 !== "string" ||
        typeof dynamicValue.param2 !== "number"
      )
        return [field, value]
      const trackedEffects = dynamicValue.target === "target" ? debuffs : buffs
      const stack = trackedEffects.get(dynamicValue.param1)?.stack ?? 0
      return [field, stack * dynamicValue.param2]
    }),
  )
}

export function buildRotationTimeline(
  input: TimelineBuildInput,
  procRoll?: (key: string) => number,
  createActionResolver?: TimelineActionResolverFactory,
): TimelineRow[] {
  type TimelineEvent = {
    time: number
    sortOrder: number[]
    kind:
      | "start"
      | "castEnd"
      | "attackResponse"
      | "subActionStart"
      | "queueTrigger"
      | "action"
      | "periodicTick"
      | "expectedTick"
      | "expectedExpire"
      | "nextOrdered"
      | "orderedReady"
      | "targetAttack"
    row: TimelineRow
    actionIndex?: number
    pattern?: TargetAttackPattern
    subActionIndex?: number
    selectedSubAction?: { skillId: string | undefined }
    expiresEffect?: { target: "self" | "target" | "player"; name: string; expiresAt: number; scheduleId: number }
    expectedWakeup?: { name: string; active: ActivePeriodicEffect }
    periodicWakeup?: { name: string; active: ActivePeriodicEffect }
  }
  const compareSortOrder = (left: number[], right: number[]) => {
    const sharedLength = Math.min(left.length, right.length)
    for (let index = 0; index < sharedLength; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index]
    }
    return left.length - right.length
  }
  const { rotation, skills, eventDefinitions, dots, effectDefinitions, innerWayRules, setupEffects, weapons } = input
  // Application bundles resolve the Settings default before reaching the scheduler.
  const pingSeconds = (normalizePing(rotation.ping) ?? 0) / 1000
  const skillPing = (skill: SkillRecord | undefined) => (skill && !skill.ignorePing ? pingSeconds : 0)
  const hasBattleEnd = rotation.steps.some(step => step.type === "event" && step.event === "BattleEnd")
  let timelineEndTime = 0
  const resolvedRows = new Set<TimelineRow>()
  const selectedInnerWays = new Set(innerWayRules.map(rule => rule.source))
  const damageGroups = new Map<string, { id: string; name: string }>()
  for (const definition of [...Object.values(skills), ...Object.values(dots)]) {
    const group = definition.damageGroup
    if (group && selectedInnerWays.has(group.id)) damageGroups.set(group.id, group)
  }
  const damageSource = (definition: Pick<SkillRecord, "damageGroup">, fallback: string) =>
    definition.damageGroup && damageGroups.has(definition.damageGroup.id)
      ? `innerway-${definition.damageGroup.id}`
      : fallback
  const isSequentialStep = (step: RotationStep) => step.type === "skill" || step.event === "Delay"
  const sequentialCastTime = (step: RotationStep) => {
    if (step.type === "skill") {
      const skill = skills[step.skill ?? ""]
      return resolveSkillStepDuration(step, skill) ?? expandSkill(step.skill ?? "", skills).castTime
    }
    return step.event === "Delay" ? Math.max(0, step.duration) : 0
  }
  const innerWayConditions = new Set(input.innerWayConditions)
  const conditionParameters = Object.fromEntries(input.innerWayConditions.map(condition => [condition, true]))
  const subActionChoices = new Map<string, boolean>()
  const rows: TimelineRow[] = []
  const events = new OrderedQueue<TimelineEvent>(
    (left, right) => compareTimelineTime(left.time, right.time) || compareSortOrder(left.sortOrder, right.sortOrder),
  )
  const attachedEvent = (step: RotationStep) => {
    if (step.type !== "event" || step.event === "Delay" || isFixedTimeEvent(step)) return undefined
    if (step.event === "Exhausted") {
      if ("after" in step && step.after)
        return { target: step.after as AttachedEventTarget, placement: "after" as const }
      if ("before" in step && step.before)
        return { target: step.before as AttachedEventTarget, placement: "after" as const }
    }
    if ("before" in step && step.before)
      return { target: step.before as AttachedEventTarget, placement: "before" as const }
    if ("after" in step && step.event === "Qi" && step.after)
      return { target: step.after as AttachedEventTarget, placement: "after" as const }
    return undefined
  }
  const authoredStart = rotation.start
  const authoredStartStep = authoredStart ? rotation.steps[authoredStart.step] : undefined
  const startStepCanAnchor =
    authoredStartStep?.type === "skill" ||
    (authoredStartStep?.type === "event" &&
      (authoredStartStep.event === "Delay" ||
        (!isFixedTimeEvent(authoredStartStep) && ("before" in authoredStartStep || "after" in authoredStartStep))))
  const authoredStartActions =
    authoredStartStep?.type === "skill" ? expandSkill(authoredStartStep.skill ?? "", skills).actions : undefined
  const startAction =
    authoredStart?.action !== undefined &&
    Number.isInteger(authoredStart.action) &&
    authoredStart.action >= 0 &&
    authoredStartStep?.type === "skill" &&
    authoredStart.action < (authoredStartActions?.length ?? 0)
      ? authoredStart.action
      : undefined
  const hasUsableStart = Boolean(
    authoredStart && startStepCanAnchor && (authoredStart.action === undefined || startAction !== undefined),
  )
  const startStepIndex = hasUsableStart ? authoredStart!.step : 0
  let battleStartTime = -1
  const multiActionSegments = new Map<
    string,
    Array<ExpandedSkillSegment & { startOffset: number; effectiveCastTime: number }>
  >()
  const createRow = (rowIndex: number, step: RotationStep, startTime: number) => {
    const expandedSkill = step.type === "skill" ? expandSkill(step.skill ?? "", skills) : undefined
    const skill = expandedSkill?.skill ?? (step.type === "event" ? eventDefinitions[step.event] : undefined)
    const requestedDuration = resolveSkillStepDuration(step, skill)
    const castTime = requestedDuration ?? expandedSkill?.castTime ?? sequentialCastTime(step)
    const durationEffect = editableCastTimeEffect(skill)
    const sourceActions = expandedSkill?.isMultiAction
      ? expandedSkill.actions
      : Array.isArray(skill?.action)
        ? (skill.action as EditableObject[])
        : []
    const actions: EditableObject[] = sourceActions.map(action =>
      Object.assign(
        {},
        action,
        step.type === "event" &&
          (step.event === "Controlled" || step.event === "Exhausted") &&
          action.type === "apply" &&
          step.duration !== undefined
          ? { duration: step.duration }
          : {},
        step.type === "event" && step.event === "Move" && action.type === "move" ? { distance: step.distance } : {},
        step.type === "event" && step.event === "SelfHP" && action.type === "setHP"
          ? "currentHP" in step && typeof step.currentHP === "number"
            ? { currentHP: step.currentHP }
            : { currentHPRatio: step.currentHPRatio }
          : {},
        step.type === "event" && step.event === "TakeDamage" && action.type === "takeDamage"
          ? { damage: step.damage }
          : {},
        step.type === "event" && step.event === "Hellfire" && action.type === "addResource"
          ? { type: step.amount < 0 ? "consumeResource" : "addResource", amount: Math.abs(step.amount) }
          : {},
        step.type === "event" && step.event === "HP" && action.type === "setTargetHP"
          ? { targetHPRatio: step.targetHPRatio }
          : {},
        step.type === "event" && step.event === "Qi" && action.type === "setQi"
          ? { targetQiRatio: step.targetQiRatio }
          : {},
        step.type === "event" && step.event === "Buff" && action.type === "apply"
          ? { value: step.buff, stack: step.stack ?? 1 }
          : {},
        step.type === "event" && step.event === "Debuff" && action.type === "apply"
          ? { value: step.debuff, stack: step.stack ?? 1 }
          : {},
        step.type === "event" && step.event === "MartialArt" && action.type === "switchMartialArt"
          ? { martialArt: step.martialArt }
          : {},
        requestedDuration !== undefined &&
          durationEffect !== undefined &&
          action.type === "apply" &&
          action.value === durationEffect
          ? { duration: requestedDuration }
          : {},
      ),
    )
    // Fixed-time and Move events resolve before other rows at an equal timestamp.
    // After-action Qi attachments receive a causal order after their target action below.
    const rowOrder = step.type === "event" ? -((rotation.steps.length - rowIndex) * 1000) : rowIndex * 1000
    const row: TimelineRow = {
      id: `rotation-${rowIndex}`,
      kind: "rotation",
      rotationIndex: rowIndex,
      order: rowOrder,
      step,
      startTime,
      distance: 1,
      currentHP: Math.max(0, input.maxHP ?? 1),
      currentHPRatio: 1,
      targetHPRatio: 1,
      targetQiRatio: 1,
      resources: {},
      enduranceLost: 0,
      effectiveCastTime: castTime,
      skill,
      actions,
      buffs: effectState(),
      debuffs: effectState(),
      modifierEffects: [],
      actionStates: {},
    }
    rows.push(row)
    if (expandedSkill?.isMultiAction)
      multiActionSegments.set(
        row.id,
        expandedSkill.segments.map(segment =>
          Object.assign({}, segment, { startOffset: segment.baseStartOffset, effectiveCastTime: segment.baseCastTime }),
        ),
      )
    return row
  }
  const queueRow = (row: TimelineRow) => {
    const { step, startTime, actions } = row
    const rowIndex = row.rotationIndex ?? 0
    const sortPrefix = step.type === "event" ? [-1, rowIndex] : [0, rowIndex]
    events.push({ time: startTime, sortOrder: [...sortPrefix, 0], kind: "start", row })
    multiActionSegments
      .get(row.id)
      ?.forEach((segment, subActionIndex) =>
        events.push({
          time: startTime + segment.startOffset,
          sortOrder: [...sortPrefix, 1, segment.actionIndexes[0] ?? actions.length, -1, subActionIndex],
          kind: "subActionStart",
          row,
          subActionIndex,
        }),
      )
    actions.forEach((action, actionIndex) => {
      events.push({
        time: startTime + (typeof action.time === "number" ? action.time : 0),
        sortOrder: [...sortPrefix, 1, actionIndex, 0],
        kind: "action",
        row,
        actionIndex,
      })
      if (
        action.type === "trigger" &&
        typeof action.queueTime === "number" &&
        Number.isFinite(action.queueTime) &&
        action.queueTime >= 0
      )
        events.push({
          time: startTime + action.queueTime,
          sortOrder: [...sortPrefix, 1, actionIndex, -1],
          kind: "queueTrigger",
          row,
          actionIndex,
        })
    })
  }
  const ordered = rotation.steps.flatMap((step, index) => (isSequentialStep(step) ? [{ step, index }] : []))
  type TimedStep = Extract<RotationStep, { type: "event" }> & { startTime: number }
  const timed: Array<{ step: TimedStep; index: number; time: number }> = rotation.steps.flatMap((step, index) =>
    isFixedTimeEvent(step)
      ? [{ step, index, time: step.startTime + (rotation.eventTimeReference === "battleStart" ? Infinity : 0) }]
      : [],
  )
  timed.sort(
    (left, right) => compareTimelineTime(left.step.startTime, right.step.startTime) || left.index - right.index,
  )
  let orderedCursor = 0
  let timedCursor = 0
  let nextOrderedEvent: TimelineEvent | undefined
  type AutomaticWait = { row: TimelineRow; until: number; reason: "cooldown" | "attack" | "requirement" }
  let waitingCast: { row: TimelineRow; requestedAt: number; delay: AutomaticWait } | undefined
  const automaticDelayRows: AutomaticWait[] = []
  let pendingCharge:
    | {
        event: TimelineEvent
        segment: ExpandedSkillSegment
        held: TimelineEvent[]
        earliest: number
        observed: number
        delay: AutomaticWait
      }
    | undefined
  const silentChargeStarts = new Map<TimelineRow, number>()
  const alignedAttacks = new Map<TimelineRow, number>()
  const fallbackResponseRows = new WeakSet<TimelineRow>()
  const reservedAttacks = new Set<number>()
  const responseWindows: Array<{ row: TimelineRow; endTime: number; succeeded: boolean }> = []
  type ResponseContext = Pick<TimelineRow, "currentMartialArt" | "currentWeapon">
  const responseContexts = new Map<TimelineRow, ResponseContext>()
  let responseContext: ResponseContext | undefined
  const queueAttackResponse = (row: TimelineRow, time: number, sortOrder: number[]) => {
    const response = responseWindows.find(candidate => candidate.row === row)
    if (!response || (response.succeeded && !row.skill?.attackResponse?.perAttack)) return false
    response.succeeded = true
    responseContexts.set(row, { currentMartialArt: row.currentMartialArt, currentWeapon: row.currentWeapon })
    events.push({ kind: "attackResponse", row, time, sortOrder: [...sortOrder, 0] })
    return true
  }

  type ResolvedAttachment = { eventRow: TimelineRow; target: AttachedEventTarget; placement: "before" | "after" }
  const directAttachments = new Map<string, ResolvedAttachment[]>()
  const triggeredAttachments = new Map<string, ResolvedAttachment[]>()
  const queueAttachedEvent = (
    attachment: ResolvedAttachment,
    targetTime: number,
    targetSortOrder: number[],
    targetDisplayOrder: number,
  ) => {
    const { eventRow } = attachment
    eventRow.startTime = targetTime
    if (attachment.placement === "after") eventRow.order = targetDisplayOrder + 0.5
    const prefix = attachment.placement === "before" ? [-1, eventRow.rotationIndex ?? 0] : [...targetSortOrder, 1]
    events.push({ time: targetTime, sortOrder: [...prefix, 0], kind: "start", row: eventRow })
    eventRow.actions.forEach((action, actionIndex) =>
      events.push({
        time: targetTime + Number(action.time ?? 0),
        sortOrder: [...prefix, 1, actionIndex],
        kind: "action",
        row: eventRow,
        actionIndex,
      }),
    )
  }
  const attachmentInputs = new Map<number, Array<{ step: RotationStep; index: number }>>()
  rotation.steps.forEach((step, index) => {
    const attachment = attachedEvent(step)
    if (!attachment) return
    const anchor = rotation.steps.findIndex(
      (candidate, candidateIndex) => candidateIndex > index && canAnchorAttachedEvent(candidate, attachment.target),
    )
    if (anchor < 0) return
    const entries = attachmentInputs.get(anchor) ?? []
    entries.push({ step, index })
    attachmentInputs.set(anchor, entries)
  })
  const hasAttachedTakeDamage = (row: TimelineRow) =>
    (attachmentInputs.get(row.rotationIndex ?? -1) ?? []).some(
      entry => entry.step.type === "event" && entry.step.event === "TakeDamage",
    )
  const expandRow = (targetRow: TimelineRow) => {
    queueRow(targetRow)
    for (const entry of attachmentInputs.get(targetRow.rotationIndex ?? -1) ?? []) {
      const eventRow = createRow(entry.index, entry.step, targetRow.startTime)
      const resolved = attachedEvent(entry.step)!
      eventRow.sourceRowId = targetRow.id
      const attachment = { eventRow, ...resolved }
      const collection = attachment.target.trigger === undefined ? directAttachments : triggeredAttachments
      collection.set(targetRow.id, [...(collection.get(targetRow.id) ?? []), attachment])
      if (attachment.target.trigger !== undefined) continue
      const targetTime =
        attachment.target.action === "start"
          ? targetRow.startTime
          : targetRow.startTime + Number(targetRow.actions[attachment.target.action]?.time ?? 0)
      const targetSortOrder =
        attachment.target.action === "start"
          ? [0, targetRow.rotationIndex ?? 0, 0]
          : [0, targetRow.rotationIndex ?? 0, 1, attachment.target.action, 0]
      const targetDisplayOrder =
        attachment.target.action === "start" ? targetRow.order : targetRow.order + 10 + attachment.target.action
      queueAttachedEvent(attachment, targetTime, targetSortOrder, targetDisplayOrder)
    }
  }
  const startNextOrdered = (time: number) => {
    const entry = ordered[orderedCursor++]
    if (!entry) return false
    const row = createRow(entry.index, entry.step, time)
    events.push({ time, row, kind: "orderedReady", sortOrder: [-2, entry.index] })
    return true
  }
  const scheduleNextOrdered = (row: TimelineRow) => {
    nextOrderedEvent = {
      time: row.startTime + row.effectiveCastTime,
      kind: "nextOrdered",
      row,
      sortOrder: [0, row.rotationIndex ?? 0, 2],
    }
    events.push(nextOrderedEvent)
  }
  const updateNextOrdered = (row: TimelineRow) => {
    events.mutate(event => {
      if (event.row === row && (event === nextOrderedEvent || event.kind === "castEnd"))
        event.time = row.startTime + row.effectiveCastTime
    })
  }

  const extendQueuedCast = (sourceRowId: string, endTime: number) => {
    const source = rows.find(row => row.id === sourceRowId && row.kind === "rotation")
    if (!source || source.step.type !== "skill" || endTime <= source.startTime + source.effectiveCastTime) return
    source.effectiveCastTime = endTime - source.startTime
    events.mutate(event => {
      if (event.row === source && (event.kind === "nextOrdered" || event.kind === "castEnd")) event.time = endTime
    })
    if (nextOrderedEvent?.row === source) nextOrderedEvent.time = endTime
  }

  const shiftSkillSegments = (row: TimelineRow, fromIndex: number, shift: number) => {
    if (!shift) return
    const shiftedSegments = multiActionSegments.get(row.id)!.slice(fromIndex)
    const shiftedActionIndexes = new Set(shiftedSegments.flatMap(segment => segment.actionIndexes))
    row.effectiveCastTime += shift
    for (const segment of shiftedSegments) segment.startOffset += shift
    for (const actionIndex of shiftedActionIndexes) {
      const action = row.actions[actionIndex]
      action.time = Number(action.time ?? 0) + shift
    }
    events.mutate(queued => {
      if (queued.row !== row) return
      if (queued.kind === "subActionStart" && (queued.subActionIndex ?? -1) >= fromIndex) queued.time += shift
      if (
        (queued.kind === "action" || queued.kind === "queueTrigger") &&
        shiftedActionIndexes.has(queued.actionIndex ?? -1)
      )
        queued.time += shift
    })
    updateNextOrdered(row)
  }

  const effectContentModifiedNames = new Set(
    [...setupEffects, ...innerWayRules]
      .filter(rule => {
        if (typeof rule.target !== "string" || !rule.modify || typeof rule.modify !== "object") return false
        const modify = rule.modify as EditableObject
        return Object.hasOwn(modify, "effect") || Object.hasOwn(modify, "stackEffects")
      })
      .map(rule => rule.target as string),
  )
  const withoutAggregatedDamageEffects = (tracked: TrackedEffect): TrackedEffect => {
    const {
      unconditionalDamageEffects: _removedDamageEffects,
      perHitEffectRules: _removedPerHitRules,
      ...unchanged
    } = tracked
    return unchanged
  }
  const preparedEffects = new WeakMap<TrackedEffect, TrackedEffect>()
  const preparedContributions = new Map<string, Map<number, ReturnType<typeof splitUnconditionalDamageEffectRules>>>()
  const prepareTrackedEffect = (tracked: TrackedEffect): TrackedEffect => {
    const cached = preparedEffects.get(tracked)
    if (cached) return cached
    let prepared: TrackedEffect
    if (effectContentModifiedNames.has(tracked.name)) prepared = withoutAggregatedDamageEffects(tracked)
    else {
      let stacks = preparedContributions.get(tracked.name)
      if (!stacks) preparedContributions.set(tracked.name, (stacks = new Map()))
      const stack = tracked.stack ?? 1
      let contribution = stacks.get(stack)
      if (!contribution) {
        contribution = splitUnconditionalDamageEffectRules(
          effectsForTrackedEffect(tracked.stack, effectDefinitions[tracked.name]),
        )
        stacks.set(stack, contribution)
      }
      prepared = {
        ...tracked,
        unconditionalDamageEffects: contribution.unconditional,
        perHitEffectRules: contribution.remaining,
      }
    }
    preparedEffects.set(tracked, prepared)
    preparedEffects.set(prepared, prepared)
    return prepared
  }
  const prepareTrackedEffects = (effects: EffectState) => mapTrackedEffects(effects, prepareTrackedEffect)
  let buffs: EffectState = prepareTrackedEffects(
    effectState(
      (input.initialBuffs ?? []).map(effect => Object.assign({}, effect, { persistent: true, expiresAt: undefined })),
    ),
  )
  let debuffs: EffectState = prepareTrackedEffects(
    effectState(
      (input.initialDebuffs ?? []).map(effect => Object.assign({}, effect, { persistent: true, expiresAt: undefined })),
    ),
  )
  const resolveAction = createActionResolver?.(input, rows, { buffs, debuffs })
  let unconditionalDamageEffects = addUnconditionalDamageEffects(
    ...Array.from(buffs.values())
      .filter(effect => (effect.playerRecipientIndex ?? 0) === 0)
      .map(effect => effect.unconditionalDamageEffects),
    ...Array.from(debuffs.values()).map(effect => effect.unconditionalDamageEffects),
  )
  const refreshUnconditionalDamageEffects = () => {
    unconditionalDamageEffects = addUnconditionalDamageEffects(
      ...Array.from(buffs.values())
        .filter(effect => (effect.playerRecipientIndex ?? 0) === 0)
        .map(effect => effect.unconditionalDamageEffects),
      ...Array.from(debuffs.values()).map(effect => effect.unconditionalDamageEffects),
    )
  }
  const parentBoundEffects = Object.entries(effectDefinitions).flatMap(([name, definition]) =>
    definition.parentEffect ? [{ name, parent: definition.parentEffect }] : [],
  )
  const setBuffs = (next: EffectState) => {
    if (next === buffs) return
    for (const { name, parent: parentName } of parentBoundEffects) {
      const effect = next.get(name)
      if (!effect) continue
      const parent = next.get(parentName)
      if (parent && effect.expiresAt === parent.expiresAt && effect.sourceRowId === parent.sourceRowId) continue
      const updated = new Map(next)
      if (parent) updated.set(name, { ...effect, expiresAt: parent.expiresAt, sourceRowId: parent.sourceRowId })
      else updated.delete(name)
      next = updated
    }
    buffs = prepareTrackedEffects(next)
    for (const name of accumulatorStates.keys()) {
      if (!buffs.has(name)) accumulatorStates.delete(name)
    }
    refreshUnconditionalDamageEffects()
  }
  const debuffMaxStackSeconds: Record<string, number> = {}
  let debuffCoverageTime = 0
  const advanceDebuffCoverage = (time: number) => {
    if (battleStartTime >= 0) {
      const start = Math.max(battleStartTime, debuffCoverageTime)
      for (const effect of debuffs.values()) {
        const definition = effectDefinitions[effect.name]
        if (!definition?.showCoverage || (effect.stack ?? 1) !== (effect.maxStack ?? definition.maxStack ?? 1)) continue
        const end = Math.min(time, effect.expiresAt ?? time)
        debuffMaxStackSeconds[effect.name] = (debuffMaxStackSeconds[effect.name] ?? 0) + Math.max(0, end - start)
      }
    }
    debuffCoverageTime = time
  }
  const setDebuffs = (next: EffectState) => {
    if (next === debuffs) return
    advanceDebuffCoverage(currentTimelineTime)
    debuffs = prepareTrackedEffects(next)
    trackedEffectMetadata(debuffs)
    refreshUnconditionalDamageEffects()
  }
  let distance = 1
  const maxHP = Math.max(0, input.maxHP ?? 1)
  let currentHP = maxHP
  let currentHPRatio = maxHP > 0 ? 1 : 0
  const setCurrentHP = (value: number) => {
    currentHP = Math.min(maxHP, Math.max(0, value))
    currentHPRatio = maxHP > 0 ? currentHP / maxHP : 0
  }
  let targetHPRatio = input.rotation.targetHP ? 1 : DEFAULT_TARGET_HP_RATIO
  let targetQiRatio = 1
  type AccumulatorState = {
    threshold: number
    accumulated: number
    firedTriggers: number
    nextReadyAt: number
    sourceRowId: string
    expiresAt?: number
  }
  const accumulatorStates = new Map<string, AccumulatorState>()
  const recordings = new Map<
    string,
    {
      id: number
      sourceDamage: number
      hasMatchedDamage: boolean
      sourceRowId: string
      expiresAt: number
      definition: NonNullable<EffectDefinition["recording"]>
    }
  >()
  let nextRecordingId = 0
  let currentMartialArt = weapons[0]
  let currentWeapon = currentMartialArt ? input.martialArtState?.[currentMartialArt]?.weapon : undefined
  const resourceMaximums = Object.fromEntries(
    Object.entries(input.resourceMaximums ?? {}).filter(
      ([, maximum]) => typeof maximum === "number" && Number.isFinite(maximum) && maximum >= 0,
    ),
  )
  const infiniteResources = new Set([
    ...(input.infiniteResources ?? []),
    ...(rotation.infiniteVitality ? ["Vitality"] : []),
  ])
  const clampResource = (name: string, value: number) => {
    const rounded = Math.round(value * 1e9) / 1e9
    const lowerBound = name === "Vitality" ? Number.NEGATIVE_INFINITY : 0
    return Math.min(resourceMaximums[name] ?? Number.POSITIVE_INFINITY, Math.max(lowerBound, rounded))
  }
  let resources: ResourceState = Object.fromEntries(
    Object.entries({ Qi: 100, ...input.initialResources }).map(([name, value]) => [name, clampResource(name, value)]),
  )
  infiniteResources.forEach(name => {
    resources[name] = resourceMaximums[name] ?? resources[name] ?? Number.MAX_SAFE_INTEGER
  })
  const initialResources = { ...resources }
  const resourceTotals = new Map<string, { consumed: number; regenerated: number }>()
  const recordResourceChange = (name: string, before: number, after: number, kind: "consume" | "regenerate") => {
    const current = resourceTotals.get(name) ?? { consumed: 0, regenerated: 0 }
    const difference = after - before
    if (kind === "consume" && difference < 0) current.consumed -= difference
    if (kind === "regenerate" && difference > 0) current.regenerated += difference
    resourceTotals.set(name, current)
  }
  const resourceRegeneration = Object.fromEntries(
    Object.entries(input.resourceRegeneration ?? {}).filter(
      ([, rate]) => typeof rate === "number" && Number.isFinite(rate) && rate > 0,
    ),
  )
  const resourceSpendRegenDelay = Object.fromEntries(
    Object.entries(input.resourceSpendRegenDelay ?? {}).filter(
      ([, delay]) => typeof delay === "number" && Number.isFinite(delay) && delay > 0,
    ),
  )
  /** Absolute-time rate overrides contributed by casts currently in progress. */
  const resourceRateWindows: Array<{
    resource: string
    from: number
    to: number
    regeneration?: number
    consumption?: number
  }> = []
  /** Resource regeneration stays at zero until this time after a direct spend. */
  const regenSuppressedUntil = new Map<string, number>()
  const resourceEventParameters = Object.fromEntries([...innerWayConditions].map(condition => [condition, true]))
  const resourceEventRules = (input.resourceEvents ?? [])
    .map(rule =>
      Object.assign({}, rule, {
        amount:
          typeof rule.amount === "number" ? rule.amount : resolveSwitchValue(rule.amount, resourceEventParameters),
      }),
    )
    .filter(
      (rule): rule is Omit<ResourceEventRule, "amount"> & { amount: number } =>
        typeof rule.resource === "string" &&
        typeof rule.amount === "number" &&
        Number.isFinite(rule.amount) &&
        rule.amount >= 0,
    )
  const resourceEventCooldowns = new Map<number, number>()
  const applyResourceEvent = (eventName: ResourceEventRule["event"], time: number, hpLost = 0, probability = 1) => {
    resourceEventRules.forEach((rule, ruleIndex) => {
      if (
        rule.event !== eventName ||
        infiniteResources.has(rule.resource) ||
        (resourceEventCooldowns.get(ruleIndex) ?? 0) > time
      )
        return
      let amount = rule.amount * probability
      if (eventName === "takeDamage") {
        if (!(typeof rule.perMaxHPRatio === "number" && rule.perMaxHPRatio > 0) || maxHP <= 0) return
        amount *= hpLost / maxHP / rule.perMaxHPRatio
      }
      if (amount <= 0) return
      const before = resources[rule.resource] ?? 0
      const after = clampResource(rule.resource, before + amount)
      resources = { ...resources, [rule.resource]: after }
      recordResourceChange(rule.resource, before, after, "regenerate")
      if (typeof rule.cooldown === "number" && rule.cooldown > 0)
        resourceEventCooldowns.set(ruleIndex, time + rule.cooldown)
    })
  }
  const applyResourceAction = (action: EditableObject, row: TimelineRow) => {
    if (
      (action.type !== "setResource" && action.type !== "addResource" && action.type !== "consumeResource") ||
      typeof action.value !== "string" ||
      !(
        (typeof action.amount === "number" && Number.isFinite(action.amount) && action.amount >= 0) ||
        (action.type === "consumeResource" && action.amount === "all")
      )
    )
      return false
    if (action.type === "consumeResource") {
      const spent = action.amount === "all" ? Math.max(0, resources[action.value] ?? 0) : action.amount
      row.resourceConsumption = {
        ...row.resourceConsumption,
        [action.value]: (row.resourceConsumption?.[action.value] ?? 0) + spent,
      }
    }
    if (infiniteResources.has(action.value)) return true
    const current = resources[action.value] ?? 0
    const amount = typeof action.amount === "number" ? action.amount : 0
    let next = current
    switch (action.type) {
      case "setResource":
        next = amount
        break
      case "addResource":
        next = current + amount
        break
      case "consumeResource":
        next = action.amount === "all" ? 0 : current - amount
        break
    }
    resources = { ...resources, [action.value]: clampResource(action.value, next) }
    recordResourceChange(
      action.value,
      current,
      resources[action.value],
      action.type === "consumeResource" ? "consume" : "regenerate",
    )
    // A direct spend suppresses regeneration for the configured delay. Only the
    // spend matters here: a windowed consumption rate drains on its own schedule.
    const spendDelay = resourceSpendRegenDelay[action.value]
    if (typeof spendDelay === "number" && resources[action.value] < current)
      regenSuppressedUntil.set(action.value, currentTimelineTime + spendDelay)
    return true
  }
  // Pre-fight actions can change resources, but passive regeneration begins only
  // when the live event loop detects battle start.
  let lastResourceRegenerationTime = Infinity
  /** Current Endurance against its own maximum, for the `endurancePercentage` requirement target. */
  const endurancePercentage = () => {
    const maximum = resourceMaximums.Endurance
    if (typeof maximum !== "number" || maximum <= 0) return undefined
    return ((resources.Endurance ?? 0) / maximum) * 100
  }
  /** Current Endurance below its maximum. Recovered Endurance counts as un-lost again. */
  const enduranceLost = () => {
    const maximum = resourceMaximums.Endurance
    if (typeof maximum !== "number" || maximum <= 0) return 0
    return Math.max(0, maximum - (resources.Endurance ?? 0))
  }
  /**
   * Register a cast's Endurance rates for the span the cast itself covers. A
   * composite skill's phases are separate sub-skills, each of which registers its
   * own span, so the window needs no authored start or end.
   */
  const registerEnduranceRates = (skill: SkillRecord | undefined, startTime: number, duration: number) => {
    const rates = skill?.endurance
    if (!rates || duration <= 0) return
    const regeneration = rates.regeneration
    const consumption = rates.consumption
    if (
      (typeof regeneration !== "number" || !Number.isFinite(regeneration)) &&
      (typeof consumption !== "number" || !Number.isFinite(consumption))
    )
      return
    resourceRateWindows.push({
      resource: "Endurance",
      from: startTime,
      to: startTime + duration,
      ...(typeof regeneration === "number" && Number.isFinite(regeneration) ? { regeneration } : {}),
      ...(typeof consumption === "number" && Number.isFinite(consumption) ? { consumption } : {}),
    })
  }
  const regenerateResources = (time: number) => {
    const from = lastResourceRegenerationTime
    if (from !== Infinity && time > from) {
      // Split the span at every window boundary so a rate change lands exactly
      // where it is authored rather than being smeared across the gap. A spend's
      // suppression deadline is an event time, so it splits too and the
      // suppression test below is exact within each piece.
      const boundaries = new Set<number>()
      for (const window of resourceRateWindows) {
        if (window.from > from && window.from < time) boundaries.add(window.from)
        if (window.to > from && window.to < time) boundaries.add(window.to)
      }
      for (const deadline of regenSuppressedUntil.values())
        if (deadline > from && deadline < time) boundaries.add(deadline)
      const names = new Set([
        ...Object.keys(resourceRegeneration),
        ...resourceRateWindows.map(window => window.resource),
      ])
      const stops = [from, ...[...boundaries].toSorted((a, b) => a - b), time]
      for (let index = 0; index < stops.length - 1; index += 1) {
        const spanStart = stops[index]
        const elapsed = stops[index + 1] - spanStart
        if (elapsed <= 0) continue
        resources = [...names].reduce(
          (next, name) => {
            if (infiniteResources.has(name)) return next
            const active = resourceRateWindows.filter(
              window => window.resource === name && window.from <= spanStart && spanStart < window.to,
            )
            const override = active.findLast(window => window.regeneration !== undefined)?.regeneration
            const drain = active.reduce((total, window) => total + (window.consumption ?? 0), 0)
            const rate = override ?? resourceRegeneration[name] ?? 0
            const suppressed = (regenSuppressedUntil.get(name) ?? Number.NEGATIVE_INFINITY) > spanStart
            if (rate <= 0 && drain <= 0) return next
            const before = next[name] ?? 0
            const after = clampResource(name, before + ((suppressed ? 0 : rate) - drain) * elapsed)
            if (after > before) recordResourceChange(name, before, after, "regenerate")
            if (after < before) recordResourceChange(name, before, after, "consume")
            return Object.assign(next, { [name]: after })
          },
          Object.assign({}, resources),
        )
      }
    }
    lastResourceRegenerationTime = Math.max(lastResourceRegenerationTime, time)
  }
  const cooldowns: Record<string, number> = {}
  const damageListeners = innerWayRules.filter(rule => rule.listen?.event === "damage")
  const listenerCooldowns = new Map<InnerWayEffectRule, number>()
  const skillCooldownStates: Record<
    string,
    { recovery: "window"; expiresAt: number; uses: number } | { recovery: "independent"; readyTimes: number[] }
  > = {}
  const effectTriggerCooldowns = new Map<number, number>()
  const buffDurationRules = setupEffects.filter(effect => typeof effect.buffDurationBonus === "number")
  const effectTriggersByEvent = new Map<
    string,
    Array<{ triggerIndex: number; trigger: EditableObject; owner?: string }>
  >()
  // One setup effect may declare several reactive triggers, so each gets its own index.
  let setupTriggerIndex = 0
  setupEffects.forEach(setup => {
    const declared = Array.isArray(setup.trigger) ? setup.trigger : [setup.trigger]
    for (const candidate of declared) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue
      const trigger = candidate as EditableObject
      if (typeof trigger.event !== "string") continue
      const triggerIndex = setupTriggerIndex++
      effectTriggersByEvent.set(trigger.event, [
        ...(effectTriggersByEvent.get(trigger.event) ?? []),
        { triggerIndex, trigger },
      ])
    }
  })
  const innerWayTriggersByEvent = new Map<string, InnerWayEffectRule[]>()
  Object.entries(effectDefinitions).forEach(([owner, definition], index) => {
    const trigger = definition.trigger
    if (typeof trigger?.event !== "string") return
    effectTriggersByEvent.set(trigger.event, [
      ...(effectTriggersByEvent.get(trigger.event) ?? []),
      { triggerIndex: setupEffects.length + setupTriggerIndex + index, trigger, owner },
    ])
  })
  const innerWayTriggerStates = new Map<InnerWayEffectRule, { hits: number[]; readyAt: number }>()
  innerWayRules.forEach(rule => {
    const triggerEvent = rule.trigger?.event ?? "damage"
    if (triggerEvent === "damageOutcome" || typeof triggerEvent !== "string") return
    innerWayTriggersByEvent.set(triggerEvent, [...(innerWayTriggersByEvent.get(triggerEvent) ?? []), rule])
  })
  const skillCooldownGroups = Object.fromEntries(
    Object.entries(skills)
      .filter((entry): entry is [string, SkillRecord & { cooldownGroup: string }] => Boolean(entry[1]?.cooldownGroup))
      .map(([skillId, skill]) => [skillId, skill.cooldownGroup]),
  )
  let currentTimelineTime = 0
  // The encounter begins at the fight-start anchor, so nothing can be put on the
  // target before it: a prepull hit does not apply a debuff or DOT. The anchored
  // row is created in step order, so while it is still missing the event is
  // necessarily prepull, and once it exists its own start time is the boundary.
  // Prepull is a question of rotation position, not of timestamps: a step before
  // the anchor is prepull in full. Inside the anchored step the boundary is the
  // anchored action's own time, so an action ordered ahead of it still counts when
  // it resolves at that same instant. A generated row inherits its source row's
  // position.
  const rotationIndexFor = (row: TimelineRow): number | undefined => {
    let current: TimelineRow | undefined = row
    for (let depth = 0; current && depth < 16; depth++) {
      if (current.rotationIndex !== undefined) return current.rotationIndex
      current = rows.find(candidate => candidate.id === current!.sourceRowId)
    }
    return undefined
  }
  /**
   * The instant the fight starts, once the anchored row exists. The anchor names an
   * action, but the boundary is its time: an action ordered before it that resolves
   * at the same instant belongs to the anchored hit rather than to prepull. The
   * requirement path reads this per action, so the row is searched once and the
   * resolved instant is cached against the row data that produces it.
   */
  let anchoredRow: TimelineRow | undefined
  let anchoredRowSearched = false
  let anchoredInstant: { startTime: number; actions: readonly EditableObject[]; time: number } | undefined
  const anchoredActionTime = (): number | undefined => {
    if (!hasUsableStart) return undefined
    if (!anchoredRowSearched) {
      anchoredRowSearched = true
      anchoredRow = rows.find(candidate => candidate.rotationIndex === startStepIndex)
    }
    const anchored = anchoredRow
    if (!anchored) return undefined
    if (startAction === undefined) return anchored.startTime
    const action = anchored.actions[startAction]
    if (!action) return undefined
    if (anchoredInstant?.startTime !== anchored.startTime || anchoredInstant.actions !== anchored.actions)
      anchoredInstant = {
        startTime: anchored.startTime,
        actions: anchored.actions,
        time: anchored.startTime + Number(action.time ?? 0),
      }
    return anchoredInstant.time
  }
  /**
   * Whether a queued event opens the fight. The anchor names an action, but the
   * boundary is that action's resolved time: an action ordered ahead of it that
   * resolves at the same instant belongs to the anchored hit rather than to prepull,
   * so the fight opens before any of them runs. Readiness and cast-start events are
   * not that instant; a step-level anchor opens on the anchored row's start event.
   */
  const opensBattleStart = (event: TimelineEvent | undefined): boolean => {
    if (!hasUsableStart || !event || event.row.rotationIndex !== startStepIndex) return false
    if (startAction === undefined) return event.kind === "start"
    if (event.kind !== "action") return false
    if (event.actionIndex === startAction) return true
    if ((event.actionIndex ?? 0) > startAction) return false
    const anchoredTime = anchoredActionTime()
    return anchoredTime !== undefined && event.time >= anchoredTime
  }
  const targetAcceptsApplications = (row: TimelineRow | undefined, actionIndex?: number) => {
    if (!hasUsableStart) return true
    const index = row ? rotationIndexFor(row) : undefined
    if (index === undefined || index > startStepIndex) return true
    if (index < startStepIndex) return false
    // The anchored step: only actions at or after the anchored one are in-combat.
    if (startAction === undefined || actionIndex === undefined || row === undefined) return true
    if (actionIndex >= startAction) return true
    const anchoredTime = anchoredActionTime()
    const action = row.actions[actionIndex]
    return (
      anchoredTime !== undefined && action !== undefined && row.startTime + Number(action.time ?? 0) >= anchoredTime
    )
  }
  const requirementState = (): RequirementState => ({
    enemyCount: normalizeEnemyCount(rotation.enemyCount),
    distance,
    selfHPPercentage: currentHPRatio * 100,
    targetHPPercentage: targetHPRatio * 100,
    targetQiPercentage: targetQiRatio * 100,
    endurancePercentage: endurancePercentage(),
    skillCooldowns: cooldowns,
    skillCooldownGroups,
    currentTime: currentTimelineTime,
    currentMartialArt,
    currentWeapon,
    targetType: resolveTargetType(rotation),
    battleStarted: targetAcceptsApplications(requirementRow()[0], requirementRow()[1]),
    ...responseContext,
  })
  // The row and action index currently resolving, used by the battle-start gate.
  let requirementRow: () => [TimelineRow | undefined, number | undefined] = () => [undefined, undefined]
  const applicationDuration = (
    duration: number | undefined,
    target: unknown,
    row: TimelineRow,
    skillTags: string[],
  ) => {
    if (duration === undefined || target === "target") return duration
    const sourceTags = row.buffSourceSkillTags ?? skillTags
    let bonus = 0
    for (const rule of buffDurationRules) {
      if (
        requirementsPass(
          rule.requirement,
          buffs,
          debuffs,
          sourceTags,
          innerWayConditions,
          weapons,
          resources,
          requirementState(),
        )
      )
        bonus += rule.buffDurationBonus as number
    }
    return duration * Math.max(0, 1 + bonus)
  }
  const skillCooldownKey = (skillId: string, skill = skills[skillId]) => `skill:${skill?.cooldownGroup ?? skillId}`
  const resolveActionChance = (value: unknown) => {
    if (value === undefined) return 1
    const resolved =
      typeof value === "number" ? value : resolveSwitchValue(value, { ...conditionParameters, ...requirementState() })
    if (typeof resolved !== "number" || !Number.isFinite(resolved))
      throw new Error("Action chance must resolve to a finite number.")
    return outcomeProbability(resolved)
  }
  const skillCooldownDuration = (skill: SkillRecord, modifierEffects: EditableObject[]) => {
    for (let index = modifierEffects.length - 1; index >= 0; index -= 1) {
      const override = modifierEffects[index]?.cooldown
      if (typeof override === "number") return override
    }
    return skill.cooldown
  }
  const skillCooldownReadyAt = (key: string, time: number, uses: number) => {
    const state = skillCooldownStates[key]
    if (!state) return time
    switch (state.recovery) {
      case "window":
        if (compareTimelineTime(time, state.expiresAt) >= 0 || state.uses < uses) return time
        return state.expiresAt
      case "independent": {
        const pending = state.readyTimes.filter(readyAt => compareTimelineTime(readyAt, time) > 0)
        return pending.length < uses ? time : pending[0]
      }
    }
  }
  const recordSkillCooldownCast = (
    key: string,
    time: number,
    duration: number,
    uses: number,
    recovery: SkillRecord["cooldownRecovery"] = "window",
  ) => {
    const state = skillCooldownStates[key]
    switch (recovery) {
      case "window":
        if (state?.recovery === "window" && compareTimelineTime(time, state.expiresAt) < 0)
          state.uses = Math.min(uses, state.uses + 1)
        else skillCooldownStates[key] = { recovery, expiresAt: time + duration, uses: 1 }
        break
      case "independent": {
        const readyTimes = state?.recovery === "independent" ? state.readyTimes : []
        skillCooldownStates[key] = {
          recovery,
          readyTimes: [...readyTimes.filter(readyAt => compareTimelineTime(readyAt, time) > 0), time + duration].sort(
            (left, right) => left - right,
          ),
        }
        break
      }
    }
    cooldowns[key] = skillCooldownReadyAt(key, time, uses)
  }
  const clearSkillCooldown = (skillId: string, time: number, charges?: number, seconds?: number) => {
    const key = skillCooldownKey(skillId)
    const state = skillCooldownStates[key]
    if (seconds !== undefined) {
      if (!Number.isFinite(seconds) || seconds < 0)
        throw new Error("Cooldown reduction seconds must be nonnegative and finite.")
      if (state) {
        switch (state.recovery) {
          case "window":
            state.expiresAt = Math.max(time, state.expiresAt - seconds)
            break
          case "independent":
            state.readyTimes = state.readyTimes.map(readyAt => Math.max(time, readyAt - seconds))
            break
        }
      }
    } else if (charges === undefined) delete skillCooldownStates[key]
    else if (state) {
      const restored = Math.max(0, Math.floor(charges))
      switch (state.recovery) {
        case "window":
          state.uses = Math.max(0, state.uses - restored)
          if (state.uses === 0) delete skillCooldownStates[key]
          break
        case "independent":
          // Restore the next recovering charge; all other recovery timestamps stay intact.
          state.readyTimes = state.readyTimes.filter(readyAt => compareTimelineTime(readyAt, time) > 0).slice(restored)
          break
      }
    }
    const readyAt = skillCooldownReadyAt(key, time, Math.max(1, Math.floor(skills[skillId]?.cooldownUses ?? 1)))
    cooldowns[key] = readyAt
    if (
      waitingCast &&
      compareTimelineTime(readyAt, waitingCast.delay.until) < 0 &&
      waitingCast.delay.reason === "cooldown" &&
      waitingCast.row.step.type === "skill" &&
      skillCooldownKey(waitingCast.row.step.skill ?? "", waitingCast.row.skill) === key
    ) {
      waitingCast.row.startTime = readyAt
      events.mutate(queued => {
        if (queued.kind === "orderedReady" && queued.row === waitingCast!.row) queued.time = readyAt
      })
      waitingCast.row.cooldownWait = readyAt - waitingCast.requestedAt
      waitingCast.delay.until = readyAt
    }
  }
  const prune = (effects: EffectState, time: number) =>
    trackedEffectMetadata(effects).nextExpiry <= time
      ? filterTrackedEffects(effects, effect => effect.expiresAt === undefined || effect.expiresAt > time)
      : effects
  const groupSize = input.rotation.groupSize === 5 || input.rotation.groupSize === 10 ? input.rotation.groupSize : 1
  const selectPlayerRecipient = (effects: EffectState, name: string) => {
    const copies = Array.from(effects.values()).filter(
      effect => effect.name === name && effect.playerRecipientIndex !== undefined,
    )
    const occupied = new Set(copies.map(effect => effect.playerRecipientIndex))
    for (let recipientIndex = 0; recipientIndex < groupSize; recipientIndex += 1) {
      if (!occupied.has(recipientIndex)) return recipientIndex
    }
    return copies.reduce((selected, candidate) => {
      const selectedExpiry = selected.expiresAt ?? Number.POSITIVE_INFINITY
      const candidateExpiry = candidate.expiresAt ?? Number.POSITIVE_INFINITY
      if (candidateExpiry !== selectedExpiry) return candidateExpiry < selectedExpiry ? candidate : selected
      return (candidate.playerRecipientIndex ?? 0) < (selected.playerRecipientIndex ?? 0) ? candidate : selected
    }).playerRecipientIndex!
  }
  const getModifiedEffectDefinition = (
    name: string,
    currentBuffs: EffectState,
    currentDebuffs: EffectState,
    skillTags: string[],
  ) => {
    const setupModifiers = setupEffects
      .filter(
        effect =>
          effect.target === name &&
          effect.modify &&
          typeof effect.modify === "object" &&
          !Array.isArray(effect.modify) &&
          requirementsPass(
            effect.requirement,
            currentBuffs,
            currentDebuffs,
            skillTags,
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          ),
      )
      .map(effect => effect.modify as EditableObject)
    const innerWayModifiers = innerWayRules
      .filter(
        rule =>
          rule.target === name &&
          rule.modify &&
          requirementsPass(
            rule.requirement,
            currentBuffs,
            currentDebuffs,
            skillTags,
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          ),
      )
      .map(rule => rule.modify!)
    return [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, { ...effectDefinitions[name] })
  }
  let nextDerivedOrder = rotation.steps.length * 1000 + 1
  type ActivePeriodicEffect = {
    expected?: ExpectedPeriodicTracker
    definition: EffectDefinition
    appliedAt: number
    expiresAt: number
    sourceRowId: string
    playerRecipientIndex?: number
    rows: TimelineRow[]
    schedulerRow?: TimelineRow
    pendingTick?: TimelineEvent
    pendingExpiration?: TimelineEvent
    expirationAfter?: number
  }
  const activePeriodicEffects: Record<string, ActivePeriodicEffect> = {}
  const expectedDebuffs = new Map<
    string,
    {
      tracker: ExpectedPeriodicTracker
      definition: EffectDefinition
      linkedDot?: string
      coverageTime: number
      maxStackSeconds: number
    }
  >()
  const expectedDebuffSnapshot = (time: number, dot?: string) => {
    const expectedEffects: ExpectedEffectDistribution[] = []
    const expectedDebuffStacks: Record<string, number> = {}
    for (const [name, { tracker, definition, linkedDot }] of expectedDebuffs) {
      if (debuffs.get(name)?.persistent) continue
      const probabilities =
        dot && dot === linkedDot ? tracker.tickStackProbabilities(time) : tracker.stackProbabilities(time)
      const distribution = probabilities.flatMap((probability, stack) =>
        probability > 0
          ? [
              {
                probability,
                effects:
                  stack === 0
                    ? []
                    : effectsForTrackedEffect(stack, definition).map(
                        rule => (rule as { effect: EditableObject }).effect,
                      ),
              },
            ]
          : [],
      )
      if (distribution.length) expectedEffects.push(distribution)
      if (definition.showCoverage)
        expectedDebuffStacks[name] = tracker
          .stackProbabilities(time)
          .reduce((total, probability, stack) => total + probability * stack, 0)
    }
    return { expectedEffects, expectedDebuffStacks }
  }

  const expirationScheduleIds = new Map<string, number>()
  const procOccurrences = new Map<string, number>()
  const periodicEffectKey = (target: "self" | "target" | "player", name: string, playerRecipientIndex?: number) =>
    target === "player" ? `${target}:${name}:${playerRecipientIndex ?? 0}` : `${target}:${name}`
  const removePendingPeriodicRows = (
    activeEffect: ActivePeriodicEffect,
    afterTime: number,
    includeRowsAtTime = false,
  ) => {
    const pendingRows = new Set(
      activeEffect.rows.filter(
        row =>
          (row.startTime > afterTime + 1e-6 || (includeRowsAtTime && Math.abs(row.startTime - afterTime) <= 1e-6)) &&
          Object.keys(row.actionStates).length === 0,
      ),
    )
    events.remove(event => event.periodicWakeup?.active === activeEffect)
    if (pendingRows.size === 0) return
    activeEffect.rows = activeEffect.rows.filter(row => !pendingRows.has(row))
    for (let index = rows.length - 1; index >= 0; index -= 1) if (pendingRows.has(rows[index])) rows.splice(index, 1)
    events.remove(event => pendingRows.has(event.row))
  }
  const schedulePeriodicActions = (
    name: string,
    activeEffect: ActivePeriodicEffect,
    afterTime: number,
    causalSortOrder: number[],
    sourceOrder: number,
    includeCurrentTime = false,
    resolvedTicks?: Array<ReturnType<ExpectedPeriodicTracker["tickAt"]>>,
  ) => {
    if (activeEffect.expected && !resolvedTicks) {
      scheduleExpectedTick(name, activeEffect, afterTime, causalSortOrder, includeCurrentTime)
      return
    }
    const periodic = activeEffect.definition.periodic
    const interval = typeof periodic?.interval === "number" && periodic.interval > 0 ? periodic.interval : undefined
    let firstTick = typeof periodic?.firstTick === "number" && periodic.firstTick >= 0 ? periodic.firstTick : interval
    const baseActions = Array.isArray(periodic?.action) ? (periodic.action as EditableObject[]) : []
    if (!interval || firstTick === undefined || baseActions.length === 0) return
    if (periodic?.expectedTickAlignment === "battle" && !procRoll) {
      if (battleStartTime < 0) return
      firstTick = nextBattlePeriodicTick(activeEffect.appliedAt, interval, battleStartTime) - activeEffect.appliedAt
    }
    const isDot = Boolean(dots[name])
    const rowSkill = (dots[name] ?? effectDefinitions[name]) as SkillRecord | undefined
    // Indefinite effects schedule only their next tick; generated ticks never extend combat.
    const indefinite = !Number.isFinite(activeEffect.expiresAt)
    const nextTickIndex = Math.max(0, Math.ceil((afterTime - activeEffect.appliedAt - firstTick - 1e-6) / interval))
    let nextTickTime = activeEffect.appliedAt + firstTick + nextTickIndex * interval
    if (!includeCurrentTime && nextTickTime <= afterTime + 1e-6) nextTickTime += interval
    const scheduledTicks =
      resolvedTicks ??
      (indefinite
        ? [{ time: nextTickTime, probability: undefined, sources: undefined }]
        : Array.from(
            {
              length: Math.max(
                0,
                Math.floor((activeEffect.expiresAt - activeEffect.appliedAt - firstTick + 1e-6) / interval) + 1,
              ),
            },
            (_, index) => ({
              time: activeEffect.appliedAt + firstTick + index * interval,
              probability: undefined,
              sources: undefined,
            }),
          ))
    for (const [tickIndex, tick] of scheduledTicks.entries()) {
      const tickTime = tick.time
      if (periodic?.tickOnExpire === false && tickTime >= activeEffect.expiresAt - 1e-6) continue
      if (tickTime < afterTime - 1e-6 || (!includeCurrentTime && Math.abs(tickTime - afterTime) <= 1e-6)) continue
      const derivedId = nextDerivedOrder++
      const derivedSortOrder = [...causalSortOrder, derivedId]
      const ordinal = Math.max(0, Math.round((tickTime - activeEffect.appliedAt - firstTick) / interval))
      const actions = baseActions.map(action =>
        Object.assign(
          {},
          action,
          typeof action.amount === "number" && typeof action.amountPerTick === "number"
            ? { amount: action.amount + ordinal * action.amountPerTick }
            : {},
          { time: 0 },
          tick.probability !== undefined ? { damageScale: tick.probability, hitProbability: tick.probability } : {},
        ),
      )
      const row: TimelineRow = {
        id: `${isDot ? "dot" : "periodic"}-${derivedId}`,
        kind: isDot ? "dot" : "periodic",
        sourceRowId: activeEffect.sourceRowId,
        ...(tick.sources
          ? {
              sourceDamageWeights: Object.fromEntries(
                Object.entries(tick.sources).map(([source, weight]) => [source, weight / tick.probability!]),
              ),
            }
          : {}),
        ...(activeEffect.playerRecipientIndex !== undefined
          ? { playerRecipientIndex: activeEffect.playerRecipientIndex }
          : {}),
        order: sourceOrder + 10 + tickIndex / 1000,
        step: { type: "skill", skill: name },
        startTime: tickTime,
        distance,
        currentHP,
        currentHPRatio,
        targetHPRatio,
        targetQiRatio,
        resources: { ...resources },
        enduranceLost: enduranceLost(),
        currentMartialArt,
        currentWeapon,
        effectiveCastTime: 0,
        skill: rowSkill,
        actions,
        buffs: effectState(),
        debuffs: effectState(),
        modifierEffects: [],
        actionStates: {},
      }
      if (indefinite)
        events.push({
          time: tickTime + interval,
          sortOrder: [...derivedSortOrder, 2],
          kind: "periodicTick",
          row,
          periodicWakeup: { name, active: activeEffect },
        })
      activeEffect.rows.push(row)
      rows.push(row)
      events.push({ time: tickTime, sortOrder: [...derivedSortOrder, 0], kind: "start", row })
      actions.forEach((_action, actionIndex) =>
        events.push({
          time: tickTime,
          sortOrder: [...derivedSortOrder, 1, actionIndex],
          kind: "action",
          row,
          actionIndex,
        }),
      )
    }
  }
  const scheduleExpectedTick = (
    name: string,
    active: ActivePeriodicEffect,
    afterTime: number,
    sortOrder: number[],
    includeCurrentTime = false,
  ) => {
    const time = active.expected!.nextTick(afterTime, includeCurrentTime)
    if (time === undefined) return
    if (active.pendingTick) {
      events.mutate(queued => {
        if (queued !== active.pendingTick) return
        queued.time = time
        queued.sortOrder = [...sortOrder, nextDerivedOrder++]
      })
      return
    }
    const wakeup: TimelineEvent = {
      time,
      sortOrder: [...sortOrder, nextDerivedOrder++],
      kind: "expectedTick",
      row: active.schedulerRow!,
      expectedWakeup: { name, active },
    }
    active.pendingTick = wakeup
    events.push(wakeup)
  }
  const scheduleExpectedExpiration = (name: string, active: ActivePeriodicEffect, sortOrder: number[]) => {
    const hasExpirationActions = active.definition.action?.some(
      action => action && typeof action === "object" && (action as EditableObject).time === "expire",
    )
    if (!hasExpirationActions) return
    const time = active.expected!.nextExpiration(active.expirationAfter)
    if (time === undefined) {
      if (active.pendingExpiration) events.remove(event => event === active.pendingExpiration)
      active.pendingExpiration = undefined
      return
    }
    if (active.pendingExpiration) {
      if (active.pendingExpiration.time !== time)
        events.mutate(event => {
          if (event === active.pendingExpiration) event.time = time
        })
      return
    }
    const wakeup: TimelineEvent = {
      time,
      kind: "expectedExpire",
      row: active.schedulerRow!,
      sortOrder: [-1, ...sortOrder, nextDerivedOrder++],
      expectedWakeup: { name, active },
    }
    active.pendingExpiration = wakeup
    events.push(wakeup)
  }
  const mergeTinyExpectedStates = (name: string, active: ActivePeriodicEffect, time: number, sortOrder: number[]) => {
    if (input.expectedPeriodicStateMerging !== false && active.expected?.mergeTinyExpirations(time))
      scheduleExpectedTick(name, active, time, sortOrder, true)
    scheduleExpectedExpiration(name, active, sortOrder)
  }
  const transferAndReschedulePeriodicEffect = (
    name: string,
    target: "self" | "target" | "player",
    definition: EffectDefinition,
    expiresAt: number,
    eventTime: number,
    sourceRowId: string,
    causalSortOrder: number[],
    sourceOrder: number,
    resetCadence = false,
    playerRecipientIndex?: number,
  ) => {
    const activeEffect = activePeriodicEffects[periodicEffectKey(target, name, playerRecipientIndex)]
    if (!activeEffect) return
    removePendingPeriodicRows(activeEffect, eventTime)
    activeEffect.definition = definition
    activeEffect.expiresAt = expiresAt
    activeEffect.sourceRowId = sourceRowId
    if (resetCadence) activeEffect.appliedAt = eventTime
    schedulePeriodicActions(name, activeEffect, eventTime, causalSortOrder, sourceOrder, resetCadence)
  }
  const enqueueEffectActions = (
    name: string,
    definition: EffectDefinition,
    eventTime: number,
    sourceRowId: string,
    causalSortOrder: number[],
    sourceOrder: number,
    target: "self" | "target" | "player",
    expiresAt?: number,
    expectedProbability?: number,
    publishRow = true,
  ) => {
    const actions = Array.isArray(definition.action) ? (definition.action as EditableObject[]) : []
    if (actions.length === 0) return
    const derivedId = nextDerivedOrder++
    if (expectedProbability === undefined && actions.some(action => action.time === "expire"))
      expirationScheduleIds.set(periodicEffectKey(target, name), derivedId)
    const derivedSortOrder = [...causalSortOrder, derivedId]
    const row: TimelineRow = {
      id: `effect-${derivedId}`,
      kind: "periodic",
      ...(expectedProbability !== undefined
        ? { expectedExpiration: { effect: name, source: sourceRowId, time: expiresAt! } }
        : {}),
      sourceRowId,
      order: sourceOrder + 10,
      step: { type: "skill", skill: name },
      startTime: eventTime,
      distance,
      currentHP,
      currentHPRatio,
      targetHPRatio,
      targetQiRatio,
      resources: { ...resources },
      enduranceLost: enduranceLost(),
      currentMartialArt,
      currentWeapon,
      effectiveCastTime: 0,
      skill: definition,
      actions: actions.map(action =>
        Object.assign(
          {},
          action,
          expectedProbability !== undefined ? { hitProbability: expectedProbability } : {},
          action.time === "expire" && expiresAt !== undefined ? { time: expiresAt - eventTime } : {},
          action.type === "resolveRecording"
            ? { recordingId: recordings.get(periodicEffectKey(target, name))?.id }
            : {},
        ),
      ),
      buffs: effectState(),
      debuffs: effectState(),
      modifierEffects: [],
      actionStates: {},
    }
    if (publishRow) rows.push(row)
    events.push({
      time: eventTime,
      sortOrder: [...(expectedProbability !== undefined ? [-1] : []), ...derivedSortOrder, 0],
      kind: "start",
      row,
    })
    row.actions.forEach((action, actionIndex) => {
      const definitionAction = actions[actionIndex]
      if (definitionAction.time === "expire" && expiresAt === undefined) return
      events.push({
        time:
          definitionAction.time === "expire"
            ? expiresAt!
            : eventTime + (typeof action.time === "number" ? action.time : 0),
        sortOrder: [...(definitionAction.time === "expire" ? [-1] : []), ...derivedSortOrder, 1, actionIndex],
        kind: "action",
        row,
        actionIndex,
        ...(definitionAction.time === "expire" && expectedProbability === undefined
          ? { expiresEffect: { target, name, expiresAt: expiresAt!, scheduleId: derivedId } }
          : {}),
      })
    })
    return row
  }
  let processedEvents = 0
  const validatedExpirationSchedules = new Set<number>()
  const startResolvedActionValues = new Map<string, unknown>()
  const startResolvedActionRequirements = new Map<string, boolean>()
  const queuedTriggerKeys = new Set<string>()
  const actionResolutionKey = (row: TimelineRow, actionIndex: number) => `${row.id}:${actionIndex}`
  const resolveStartBoundActionValues = (row: TimelineRow, actionIndexes: number[]) => {
    actionIndexes.forEach(actionIndex => {
      const action = row.actions[actionIndex]
      const requirementObject =
        action?.requirement && typeof action.requirement === "object" && !Array.isArray(action.requirement)
          ? (action.requirement as EditableObject)
          : undefined
      if (requirementObject?.resolveAt === "skillStart" && Array.isArray(requirementObject.operand))
        startResolvedActionRequirements.set(
          actionResolutionKey(row, actionIndex),
          requirementsPass(
            requirementObject.operand,
            buffs,
            debuffs,
            row.actionSkillTags?.[actionIndex] ?? row.skill?.tags ?? [],
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          ),
        )
      const valueObject =
        action?.value && typeof action.value === "object" && !Array.isArray(action.value)
          ? (action.value as EditableObject)
          : undefined
      if (valueObject?.function === "switch" && valueObject.resolveAt === "skillStart") {
        const resolvedValue = resolveSwitchValue(valueObject, requirementState())
        startResolvedActionValues.set(actionResolutionKey(row, actionIndex), resolvedValue)
        row.actions[actionIndex] = { ...action, value: resolvedValue }
        return
      }
      if (valueObject?.operator !== "first" || valueObject.resolveAt !== "skillStart") return
      const targetEffects = action.target === "target" ? debuffs : buffs
      const resolvedValue = Array.isArray(valueObject.operand)
        ? valueObject.operand.find(candidate => typeof candidate === "string" && targetEffects.has(candidate))
        : undefined
      startResolvedActionValues.set(actionResolutionKey(row, actionIndex), resolvedValue)
    })
  }
  const syncDirectAttachments = (row: TimelineRow) => {
    ;(directAttachments.get(row.id) ?? []).forEach(attachment => {
      const targetTime =
        attachment.target.action === "start"
          ? (silentChargeStarts.get(row) ?? row.startTime)
          : row.startTime + Number(row.actions[attachment.target.action]?.time ?? 0)
      attachment.eventRow.startTime = targetTime
      events.mutate(queued => {
        if (queued.row !== attachment.eventRow) return
        queued.time =
          targetTime +
          (queued.kind === "action" ? Number(attachment.eventRow.actions[queued.actionIndex ?? -1]?.time ?? 0) : 0)
      })
    })
  }
  const castTimingAdjuster = (modifiers: EditableObject[]) => {
    const timingValue = (value: unknown, actionTime: number, fallback: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? value
        : (resolveSegmentValue(value, { actionTime }) ?? fallback)
    return (time: number) => {
      const modifier = modifiers.reduce((total, effect) => total + timingValue(effect.castTimeModifier, time, 0), 0)
      const multiplier = modifiers.reduce((total, effect) => total * timingValue(effect.castTimeMultiplier, time, 1), 1)
      return Math.max(0, time + modifier) * multiplier
    }
  }
  const applyCastTimingModifiers = (row: TimelineRow, baseCastTime: number) => {
    const adjust = castTimingAdjuster(row.modifierEffects)
    row.effectiveCastTime = adjust(baseCastTime)
    row.actions = row.actions.map(action =>
      Object.assign({}, action, typeof action.time === "number" ? { time: adjust(action.time) } : {}),
    )
    events.mutate(queued => {
      if (queued.row !== row) return
      if (queued.kind === "action")
        queued.time =
          queued.expiresEffect?.expiresAt ??
          row.startTime +
            (typeof row.actions[queued.actionIndex ?? -1]?.time === "number"
              ? (row.actions[queued.actionIndex ?? -1].time as number)
              : 0)
      if (queued.kind === "queueTrigger") {
        const queueTime = row.actions[queued.actionIndex ?? -1]?.queueTime
        if (typeof queueTime === "number" && Number.isFinite(queueTime)) queued.time = row.startTime + adjust(queueTime)
      }
    })
    syncDirectAttachments(row)
    return row.effectiveCastTime
  }

  const modifiersFor = (skill: SkillRecord | undefined, time = currentTimelineTime) => {
    const activeBuffs = prune(buffs, time)
    const activeDebuffs = prune(debuffs, time)
    return Array.isArray(skill?.modifier)
      ? (skill.modifier as EditableObject[])
          .filter(item =>
            requirementsPass(
              item.requirement,
              activeBuffs,
              activeDebuffs,
              skill.tags ?? [],
              innerWayConditions,
              weapons,
              resources,
              { ...requirementState(), currentTime: time },
            ),
          )
          .map(item =>
            item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
              ? resolveCastModifierEffect(item.effect as EditableObject, activeBuffs, activeDebuffs)
              : {},
          )
      : []
  }
  const finishOrderedWait = (time: number) => {
    if (!waitingCast) return
    waitingCast.delay.until = time
    if (waitingCast.delay.reason === "cooldown") waitingCast.row.cooldownWait = time - waitingCast.requestedAt
    waitingCast = undefined
  }
  const waitForOrdered = (event: TimelineEvent, until: number, reason: AutomaticWait["reason"]) => {
    const row = event.row
    if (waitingCast && waitingCast.delay.reason !== reason) finishOrderedWait(event.time)
    if (!waitingCast) {
      const delay: AutomaticWait = {
        reason,
        until,
        row: {
          id: reason + "-" + row.id + "-" + automaticDelayRows.length,
          kind: "rotation",
          order: row.order,
          step: { type: "event", event: "Delay", duration: 0, automatic: reason },
          startTime: event.time,
          effectiveCastTime: 0,
          skill: { name: "Action: Delay", castTime: 0, action: [], tags: ["Event"] },
          actions: [],
          actionStates: {},
          modifierEffects: [],
          distance,
          currentHP,
          currentHPRatio,
          targetHPRatio,
          targetQiRatio,
          resources: { ...resources },
          enduranceLost: enduranceLost(),
          currentMartialArt,
          currentWeapon,
          buffs,
          debuffs,
          unconditionalDamageEffects: { ...unconditionalDamageEffects },
        },
      }
      automaticDelayRows.push(delay)
      waitingCast = { row, requestedAt: event.time, delay }
    }
    waitingCast.delay.until = until
    if (reason === "cooldown") row.cooldownWait = until - waitingCast.requestedAt
    row.startTime = until
    events.push({ ...event, time: until })
  }
  // Between queued events only passive resources and natural effect expiry can
  // change release readiness. Discrete gains/resets resolve in the live loop
  // while the silent charge's release and successor remain suspended.
  const nextRequirementTime = (segment: ExpandedSkillSegment, time: number, earliest: number) => {
    const candidates = [Math.max(time, earliest)]
    const collectThresholds = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collectThresholds)
        return
      }
      if (!value || typeof value !== "object") return
      const item = value as EditableObject
      if (Array.isArray(item.operand)) collectThresholds(item.operand)
      if (item.target !== "resource" || typeof item.value !== "string" || typeof item.amount !== "number") return
      const rate = resourceRegeneration[item.value] ?? 0
      if (rate > 0 && !infiniteResources.has(item.value))
        candidates.push(
          Math.max(time, earliest, lastResourceRegenerationTime + (item.amount - (resources[item.value] ?? 0)) / rate),
        )
    }
    collectThresholds(segment.reference?.requirement)
    for (const effect of [...buffs.values(), ...debuffs.values()])
      if (effect.expiresAt !== undefined) candidates.push(Math.max(time, earliest, effect.expiresAt))
    return (
      candidates
        .sort((a, b) => a - b)
        .find(candidate => {
          const projected = { ...resources }
          for (const [name, rate] of Object.entries(resourceRegeneration))
            if (!infiniteResources.has(name))
              projected[name] = clampResource(
                name,
                (resources[name] ?? 0) + rate * Math.max(0, candidate - lastResourceRegenerationTime),
              )
          return requirementsPass(
            segment.reference?.requirement,
            prune(buffs, candidate),
            prune(debuffs, candidate),
            segment.skill.tags ?? [],
            innerWayConditions,
            weapons,
            projected,
            { ...requirementState(), currentTime: candidate },
          )
        }) ?? Infinity
    )
  }
  const validateSilentCharge = (row: TimelineRow) => {
    const segments = multiActionSegments.get(row.id) ?? []
    const targetIndex = segments.findIndex(segment => segment.reference?.waitForRequirement)
    if (targetIndex < 0) return undefined
    for (let index = 0; index < targetIndex; index++) {
      const segment = segments[index]
      if (
        !segment.skill.silent ||
        segment.actionIndexes.length ||
        segment.reference?.requirement ||
        segment.skill.cooldown !== undefined
      )
        throw new Error("Readiness waits require an unconditional silent charging prefix without actions or cooldowns.")
    }
    return true
  }
  let firstTargetAttack = Infinity
  // A target may declare several patterns; each repeats independently on its own cadence.
  const targetAttackPatterns = bossDefinitionFor(resolveTargetType(rotation)).attackPattern
  const battleEndTime = (pendingRow?: TimelineRow) => {
    const timedEnd = timed.find(entry => entry.step.event === "BattleEnd")?.time ?? Infinity
    const resolvedEnd = rows
      .filter(
        row =>
          row.kind === "rotation" && row.sourceRowId && row.step.type === "event" && row.step.event === "BattleEnd",
      )
      .reduce((earliest, row) => Math.min(earliest, row.startTime), Infinity)
    // The current ordered row has not expanded its attachments yet, so include direct Battle End anchors here.
    const pendingEnd =
      pendingRow && pendingRow.step.type === "skill"
        ? (attachmentInputs.get(pendingRow.rotationIndex ?? -1) ?? []).reduce((earliest, entry) => {
            if (entry.step.type !== "event" || entry.step.event !== "BattleEnd" || !("before" in entry.step))
              return earliest
            if (entry.step.before.trigger !== undefined) return earliest
            const action = entry.step.before.action
            if (action !== "start" && !pendingRow.actions[action]) return earliest
            const time = pendingRow.startTime + (action === "start" ? 0 : Number(pendingRow.actions[action]?.time ?? 0))
            return Math.min(earliest, time)
          }, Infinity)
        : Infinity
    return Math.min(timedEnd, resolvedEnd, pendingEnd)
  }
  const responseDuration = (skill: SkillRecord, time: number) => {
    const durationSkill = skill.attackResponse?.durationFrom ? skills[skill.attackResponse.durationFrom] : skill
    return castTimingAdjuster(modifiersFor(durationSkill, time))(
      resolveSkillCastTime(durationSkill, { ...requirementState(), currentTime: time }),
    )
  }
  const attackReserved = (time: number) =>
    [...reservedAttacks].some(reserved => compareTimelineTime(reserved, time) === 0)
  const nextTargetAttackAt = (time: number, pattern: TargetAttackPattern, includeReserved: boolean) => {
    if (!Number.isFinite(firstTargetAttack)) return Infinity
    const occurrence = Math.max(0, Math.ceil((time - firstTargetAttack) / pattern.interval))
    let attackTime = firstTargetAttack + occurrence * pattern.interval
    while (!includeReserved && attackReserved(attackTime)) attackTime += pattern.interval
    return attackTime
  }
  const nextAttackAt = (time: number, pendingRow?: TimelineRow, includeReserved = false) => {
    let next =
      timed.find(
        entry =>
          entry.step.event === "TakeDamage" &&
          compareTimelineTime(entry.time, time) >= 0 &&
          (includeReserved || !attackReserved(entry.time)),
      )?.time ?? Infinity
    for (const pattern of targetAttackPatterns)
      next = Math.min(next, nextTargetAttackAt(time, pattern, includeReserved))
    return compareTimelineTime(next, battleEndTime(pendingRow)) < 0 ? next : undefined
  }

  if (!startNextOrdered(0) && !hasBattleEnd) return []
  let targetAttackOccurrence = 0
  // A timed-only encounter still has a clock even without an ordered cast.
  const initialTimedRow =
    targetAttackPatterns.length > 0 && !rows.length && timed[0]
      ? createRow(timed[0].index, timed[0].step, timed[0].time)
      : undefined
  const startBattle = (time: number) => {
    battleStartTime = time
    lastResourceRegenerationTime = time
    if (rotation.eventTimeReference === "battleStart")
      for (const entry of timed)
        entry.time = time + (typeof entry.step.startTime === "number" ? entry.step.startTime : 0)
    if (initialTimedRow) initialTimedRow.startTime = timed[0].time
    for (const pattern of targetAttackPatterns) {
      firstTargetAttack = time + pattern.firstDelay
      if (rows[0])
        events.push({
          kind: "targetAttack",
          time: firstTargetAttack,
          sortOrder: [-1, rotation.steps.length],
          row: rows[0],
          pattern,
        })
    }
    for (const { tracker, linkedDot } of expectedDebuffs.values())
      if (linkedDot && effectDefinitions[linkedDot]?.periodic?.expectedTickAlignment === "battle")
        tracker.startBattle(time)
    for (const [key, active] of Object.entries(activePeriodicEffects)) {
      if (active.definition.periodic?.expectedTickAlignment !== "battle" || procRoll) continue
      const name = key.split(":")[1]
      if (active.expected) {
        active.expected.startBattle(time)
        scheduleExpectedTick(name, active, time, [-1])
      } else schedulePeriodicActions(name, active, time, [-1], 0)
    }
  }
  if (!hasUsableStart || !ordered.length) startBattle(0)
  const nextTimedEvent = () =>
    rotation.eventTimeReference === "battleStart" && battleStartTime < 0 ? undefined : timed[timedCursor]
  while ((events.length || timedCursor < timed.length || pendingCharge) && processedEvents < 5000) {
    responseContext = undefined
    const anchorEvent = events.peek()
    if (
      battleStartTime < 0 &&
      opensBattleStart(anchorEvent) &&
      (anchorEvent?.time ?? Infinity) <= (nextTimedEvent()?.time ?? Infinity)
    ) {
      startBattle(anchorEvent!.time)
      continue
    }
    if (pendingCharge) {
      const pending = pendingCharge
      const readyAt = nextRequirementTime(pending.segment, pending.observed, pending.earliest)
      const nextTime = Math.min(events.peek()?.time ?? Infinity, nextTimedEvent()?.time ?? Infinity)
      // Resolve every event at a boundary first, including causal refunds/resets.
      if (compareTimelineTime(readyAt, nextTime) < 0 || !Number.isFinite(nextTime)) {
        pendingCharge = undefined
        const row = pending.event.row
        if (Number.isFinite(readyAt)) {
          const shift = readyAt - pending.earliest
          row.startTime += shift
          pending.delay.until = row.startTime
          for (const held of pending.held) {
            held.time += shift
            events.push(held)
          }
          events.push({ ...pending.event, time: readyAt, selectedSubAction: { skillId: pending.segment.skillId } })
          syncDirectAttachments(row)
        } else {
          row.skipped = true
          row.actions = []
          row.effectiveCastTime = 0
          row.startTime = pending.observed
          pending.delay.until = pending.observed
          scheduleNextOrdered(row)
        }
        continue
      }
    }
    const nextTimed = nextTimedEvent()
    const nextExpanded = events.peek()
    if (!nextTimed && !nextExpanded) break
    if (nextTimed && (!nextExpanded || compareTimelineTime(nextTimed.time, nextExpanded.time) <= 0)) {
      timedCursor++
      const row =
        initialTimedRow?.rotationIndex === nextTimed.index
          ? initialTimedRow
          : createRow(nextTimed.index, nextTimed.step, nextTimed.time)
      if (nextTimed.step.event === "BattleEnd") {
        timelineEndTime = nextTimed.time
        resolvedRows.add(row)
        break
      }
      expandRow(row)
      continue
    }
    const queueStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const event = events.shift()!
    responseContext = responseContexts.get(event.row)
    if (import.meta.env.DEV) finishCalculationPhase("timelineQueueOrdering", queueStartedAt)
    if (pendingCharge) pendingCharge.observed = event.time
    if (event.kind === "castEnd") {
      resolveAction?.onCastEnd?.(event.row)
      continue
    }
    if (event.kind === "targetAttack") {
      const pattern = event.pattern!
      for (let hit = 0; hit < pattern.count; hit++) {
        const index = rotation.steps.length + targetAttackOccurrence++
        expandRow(
          createRow(
            index,
            {
              type: "event",
              event: "TakeDamage",
              startTime: event.time,
              damage: pattern.damage,
              automatic: "targetAttack",
            },
            event.time,
          ),
        )
      }
      events.push({ ...event, time: event.time + pattern.interval })
      continue
    }
    if (event.kind === "nextOrdered") {
      nextOrderedEvent = undefined
      timelineEndTime = event.time
      if (!startNextOrdered(event.time) && !hasBattleEnd) break
      continue
    }
    if (event.row.step.type === "event" && event.row.step.event === "BattleEnd") {
      timelineEndTime = event.time
      resolvedRows.add(event.row)
      break
    }
    if (event.kind === "orderedReady") {
      const row = event.row
      const skillId = row.step.type === "skill" ? (row.step.skill ?? "") : ""
      const readyAt =
        row.step.type === "skill"
          ? skillCooldownReadyAt(
              skillCooldownKey(skillId, row.skill),
              event.time,
              Math.max(1, Math.floor(row.skill?.cooldownUses ?? 1)),
            )
          : event.time
      if (compareTimelineTime(readyAt, event.time) > 0) {
        if (input.cooldownPolicy === "skip") {
          row.skipped = true
          row.actions = []
          row.effectiveCastTime = 0
          resolvedRows.add(row)
          scheduleNextOrdered(row)
          continue
        }
        waitForOrdered(event, readyAt, "cooldown")
        continue
      }
      if (waitingCast?.delay.reason === "cooldown") finishOrderedWait(event.time)
      if (row.step.type === "skill" && row.skill?.attackResponse?.endMargin !== undefined) {
        const attackTime = alignedAttacks.get(row) ?? nextAttackAt(event.time + skillPing(row.skill), row)
        if (attackTime !== undefined) {
          alignedAttacks.set(row, attackTime)
          reservedAttacks.add(attackTime)
          const duration = responseDuration(row.skill, event.time)
          const alignedStart = attackTime + row.skill.attackResponse.endMargin - duration - skillPing(row.skill)
          if (compareTimelineTime(alignedStart, event.time) > 0) {
            waitForOrdered(event, alignedStart, "attack")
            continue
          }
        } else if (row.skill.attackResponse.fallback && !hasAttachedTakeDamage(row)) {
          fallbackResponseRows.add(row)
        }
      }
      if (validateSilentCharge(row)) silentChargeStarts.set(row, event.time + skillPing(row.skill))
      // Before-start attachments belong to the accepted cast, not its automatic wait.
      finishOrderedWait(event.time)
      if (row.step.type === "skill") row.startTime = event.time + skillPing(row.skill)
      expandRow(row)
      continue
    }
    if (event.periodicWakeup) {
      const { name, active } = event.periodicWakeup
      if (Object.values(activePeriodicEffects).includes(active))
        schedulePeriodicActions(name, active, event.time, event.sortOrder, event.row.order, true)
      continue
    }
    if (event.expectedWakeup) {
      const { name, active } = event.expectedWakeup
      if (activePeriodicEffects[periodicEffectKey("target", name)] !== active) continue
      switch (event.kind) {
        case "expectedTick": {
          active.pendingTick = undefined
          const tick = active.expected!.tickAt(event.time)
          if (tick.probability > 0)
            schedulePeriodicActions(name, active, event.time, event.sortOrder, active.schedulerRow!.order, true, [tick])
          scheduleExpectedTick(name, active, event.time, event.sortOrder)
          break
        }
        case "expectedExpire": {
          active.pendingExpiration = undefined
          active.expirationAfter = event.time
          const action = active.definition.action?.filter(
            item => item && typeof item === "object" && (item as EditableObject).time === "expire",
          )
          if (action?.length)
            for (const source of active.expected!.expirationSources(event.time)) {
              const probability = active.expected!.expirationProbability(event.time, source)
              if (!(probability > 0)) continue
              enqueueEffectActions(
                name,
                { ...active.definition, action },
                event.time,
                source,
                event.sortOrder,
                active.schedulerRow!.order,
                "target",
                event.time,
                probability,
                false,
              )
            }
          scheduleExpectedExpiration(name, active, event.sortOrder)
          break
        }
      }
      continue
    }
    if (!event.row.actions.some(action => typeof action.hitProbability === "number")) processedEvents += 1
    currentTimelineTime = event.time
    regenerateResources(event.time)
    // Natural expiration belongs to the clock boundary, even if another action
    // at that timestamp happens to be dequeued before the expiration action.
    for (const [target, effects] of [
      ["self", buffs],
      ["target", debuffs],
    ] as const) {
      for (const effect of effects.values()) {
        if (effect.expiresAt === undefined || effect.expiresAt > event.time) continue
        const schedule = expirationScheduleIds.get(
          periodicEffectKey(effect.playerRecipientIndex === undefined ? target : "player", effect.name),
        )
        if (schedule !== undefined) validatedExpirationSchedules.add(schedule)
      }
    }
    if (event.expiresEffect && !validatedExpirationSchedules.has(event.expiresEffect.scheduleId)) {
      const targetEffects = event.expiresEffect.target === "target" ? debuffs : buffs
      const current = targetEffects.get(event.expiresEffect!.name)
      if (
        current?.expiresAt !== event.expiresEffect.expiresAt ||
        expirationScheduleIds.get(periodicEffectKey(event.expiresEffect.target, event.expiresEffect.name)) !==
          event.expiresEffect.scheduleId
      )
        continue
      validatedExpirationSchedules.add(event.expiresEffect.scheduleId)
    }
    const activeBuffs = prune(buffs, event.time)
    const activeDebuffs = prune(debuffs, event.time)
    if (activeBuffs !== buffs) setBuffs(activeBuffs)
    if (activeDebuffs !== debuffs) setDebuffs(activeDebuffs)
    if (event.kind === "queueTrigger") {
      const action = event.row.actions[event.actionIndex ?? -1]
      if (action?.type === "trigger") {
        const sourceEffect = action.sourceEffect
        const sourceMatches =
          typeof sourceEffect !== "string" ||
          buffs.get(sourceEffect)?.sourceRowId === (event.row.sourceRowId ?? event.row.id)
        const queueRequirement = action.queueRequirement ?? action.requirement
        const queuePasses = requirementsPass(
          queueRequirement,
          buffs,
          debuffs,
          event.row.actionSkillTags?.[event.actionIndex ?? -1] ?? event.row.skill?.tags ?? [],
          innerWayConditions,
          weapons,
          resources,
          requirementState(),
        )
        if (sourceMatches && queuePasses) {
          queuedTriggerKeys.add(actionResolutionKey(event.row, event.actionIndex ?? -1))
          const target = typeof action.value === "string" ? skills[action.value] : undefined
          if (target) {
            const targetPing = target.triggerPing ? skillPing(target) : 0
            const targetModifiers = modifiersFor(target, event.time)
            const adjustTarget = castTimingAdjuster(targetModifiers)
            const targetCastTime = adjustTarget(
              resolveSkillCastTime(target, { ...requirementState(), currentTime: event.time }),
            )
            const targetActionEnd = Math.max(
              0,
              ...(Array.isArray(target.action)
                ? (target.action as EditableObject[]).map(item =>
                    typeof item.time === "number" ? adjustTarget(item.time) : 0,
                  )
                : []),
            )
            const targetStart = event.row.startTime + Number(action.time ?? 0) + targetPing
            extendQueuedCast(
              event.row.sourceRowId ?? event.row.id,
              targetStart + Math.max(targetCastTime, targetActionEnd),
            )
          }
        }
      }
      continue
    }
    if (event.kind === "subActionStart") {
      const segments = multiActionSegments.get(event.row.id)
      const segment = segments?.[event.subActionIndex ?? -1]
      if (!segment) continue
      if (segment.reference?.waitForRequirement && !event.selectedSubAction) {
        const ping = skillPing(segment.skill)
        shiftSkillSegments(event.row, event.subActionIndex ?? 0, ping)
        const held: TimelineEvent[] = []
        const attachments = new Set(
          (directAttachments.get(event.row.id) ?? [])
            .filter(attachment => attachment.target.action !== "start")
            .map(attachment => attachment.eventRow),
        )
        events.remove(queued => {
          if (queued.row !== event.row && !attachments.has(queued.row)) return false
          held.push(queued)
          return true
        })
        const delay: AutomaticWait = {
          reason: "requirement",
          until: Infinity,
          row: {
            ...event.row,
            id: `requirement-${event.row.id}`,
            skill: undefined,
            step: { type: "event", event: "Delay", duration: 0, automatic: "requirement" },
            effectiveCastTime: 0,
            actions: [],
            actionStates: {},
            resourceConsumption: undefined,
          },
        }
        automaticDelayRows.push(delay)
        pendingCharge = { event, segment, held, earliest: event.time + ping, observed: event.time, delay }
        continue
      }
      const reference = segment.reference
      const choiceKey = reference?.choiceGroup === undefined ? undefined : `${event.row.id}:${reference.choiceGroup}`
      let primaryPasses = choiceKey ? subActionChoices.get(choiceKey) : undefined
      if (!event.selectedSubAction && primaryPasses === undefined) {
        primaryPasses =
          !reference?.requirement ||
          requirementsPass(
            reference.requirement,
            buffs,
            debuffs,
            segment.skill.tags ?? [],
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          )
        if (choiceKey) subActionChoices.set(choiceKey, primaryPasses)
      }
      let selectedId: string | undefined = segment.skillId
      if (reference) selectedId = primaryPasses ? reference.value : reference.fallback
      if (event.selectedSubAction) selectedId = event.selectedSubAction.skillId
      const selectedSkill = selectedId ? skills[selectedId] : undefined
      // Parent latency is paid at dispatch; each selected component pays separately.
      // Skipped alternatives and triggered effects do not consume input latency.
      const ping = (event.subActionIndex ?? 0) > 0 ? skillPing(selectedSkill) : 0
      if (!event.selectedSubAction && ping > 0) {
        shiftSkillSegments(event.row, event.subActionIndex ?? 0, ping)
        syncDirectAttachments(event.row)
        events.push({ ...event, time: event.time + ping, selectedSubAction: { skillId: selectedId } })
        continue
      }
      const selectedActions = Array.isArray(selectedSkill?.action) ? (selectedSkill.action as EditableObject[]) : []
      const segmentStartOffset = event.time - event.row.startTime
      segment.skillId = selectedId ?? segment.skillId
      segment.skill = selectedSkill ?? { name: "Inactive sub-action", castTime: 0, action: [], tags: ["SubAction"] }
      segment.baseCastTime = resolveSkillCastTime(selectedSkill, requirementState())
      registerEnduranceRates(segment.skill, event.time, segment.baseCastTime)
      segment.localActionTimes = segment.actionIndexes.map((_, localIndex) => {
        const action = selectedActions[localIndex]
        return action && typeof action.time === "number" ? action.time : segment.baseCastTime
      })
      segment.actionIndexes.forEach((actionIndex, localIndex) => {
        const selectedAction = selectedActions[localIndex]
        event.row.actions[actionIndex] = selectedAction
          ? { ...selectedAction, time: segmentStartOffset + segment.localActionTimes[localIndex] }
          : { type: "inactive", time: segmentStartOffset + segment.baseCastTime }
      })
      if (selectedId && typeof selectedSkill?.cooldown === "number")
        recordSkillCooldownCast(
          skillCooldownKey(selectedId, selectedSkill),
          event.time,
          selectedSkill.cooldown,
          Math.max(1, Math.floor(selectedSkill.cooldownUses ?? 1)),
          selectedSkill.cooldownRecovery,
        )
      const inactiveActionIndexes = new Set(segment.actionIndexes.slice(selectedActions.length))
      ;(directAttachments.get(event.row.id) ?? []).forEach(({ eventRow, target }) => {
        if (typeof target.action !== "number" || !inactiveActionIndexes.has(target.action)) return
        eventRow.skipped = true
        events.remove(queued => queued.row === eventRow)
      })
      const skillTags = segment.skill.tags ?? []
      event.row.actionSkillTags ??= {}
      segment.actionIndexes.forEach(actionIndex => {
        event.row.actionSkillTags![actionIndex] = skillTags
      })
      resolveStartBoundActionValues(event.row, segment.actionIndexes)
      const modifiers = modifiersFor(segment.skill)
      const adjust = castTimingAdjuster(modifiers)
      event.row.actionModifierEffects ??= {}
      segment.actionIndexes.forEach((actionIndex, localIndex) => {
        const actionTime = segmentStartOffset + adjust(segment.localActionTimes[localIndex] ?? 0)
        event.row.actions[actionIndex] = { ...event.row.actions[actionIndex], time: actionTime }
        event.row.actionModifierEffects![actionIndex] = modifiers
        events.mutate(queued => {
          if (queued.row !== event.row || queued.actionIndex !== actionIndex) return
          if (queued.kind === "action") queued.time = event.row.startTime + actionTime
          if (queued.kind === "queueTrigger") {
            const queueTime = event.row.actions[actionIndex]?.queueTime
            if (typeof queueTime === "number" && Number.isFinite(queueTime))
              queued.time = event.row.startTime + adjust(queueTime)
          }
        })
      })
      const adjustedCastTime = adjust(segment.baseCastTime)
      const shift = adjustedCastTime - segment.effectiveCastTime
      segment.effectiveCastTime = adjustedCastTime
      shiftSkillSegments(event.row, (event.subActionIndex ?? -1) + 1, shift)
      if (event.row.queuedFrom) {
        const lastActionTime = Math.max(
          0,
          ...event.row.actions.map(action => (typeof action.time === "number" ? action.time : 0)),
        )
        extendQueuedCast(
          event.row.queuedFrom,
          event.row.startTime + Math.max(event.row.effectiveCastTime, lastActionTime),
        )
      }
      syncDirectAttachments(event.row)
      continue
    }
    if (event.kind === "start") {
      const skillId = event.row.step.type === "skill" ? (event.row.step.skill ?? "") : ""
      const skillModifiers = event.row.step.type === "skill" ? modifiersFor(event.row.skill, event.time) : []
      // A composite casts each phase as its own segment, so only standalone
      // skills take their span from the cast-start event.
      if (!multiActionSegments.has(event.row.id))
        registerEnduranceRates(event.row.skill, event.time, resolveSkillCastTime(event.row.skill))
      const cooldownDuration = event.row.skill ? skillCooldownDuration(event.row.skill, skillModifiers) : undefined
      const cooldownUses = Math.max(1, Math.floor(event.row.skill?.cooldownUses ?? 1))
      const cooldownKey = skillCooldownKey(skillId, event.row.skill)
      resolvedRows.add(event.row)
      if (waitingCast?.row === event.row) waitingCast = undefined
      if (event.row.kind === "rotation" && event.row.step.type === "skill" && typeof cooldownDuration === "number")
        recordSkillCooldownCast(
          cooldownKey,
          event.time,
          cooldownDuration,
          cooldownUses,
          event.row.skill?.cooldownRecovery,
        )
      if (
        event.row.step.type === "skill" &&
        event.row.skill?.tags?.includes("MartialArts") &&
        event.row.skill.martialArt &&
        event.row.skill.weapon
      ) {
        currentMartialArt = event.row.skill.martialArt
        currentWeapon = event.row.skill.weapon
      }
      event.row.buffs = buffs
      event.row.debuffs = debuffs
      event.row.distance = distance
      event.row.currentHP = currentHP
      event.row.currentHPRatio = currentHPRatio
      event.row.targetHPRatio = targetHPRatio
      event.row.targetQiRatio = targetQiRatio
      event.row.resources = { ...resources }
      event.row.currentMartialArt = requirementState().currentMartialArt
      event.row.currentWeapon = requirementState().currentWeapon
      event.row.unconditionalDamageEffects = { ...unconditionalDamageEffects }
      if (multiActionSegments.has(event.row.id)) {
        if (event.row.kind === "rotation") scheduleNextOrdered(event.row)
      } else {
        resolveStartBoundActionValues(
          event.row,
          event.row.actions.map((_action, actionIndex) => actionIndex),
        )
        event.row.modifierEffects = skillModifiers
        let baseCastTime =
          event.row.step.type === "event" && event.row.step.event === "Delay"
            ? Math.max(0, event.row.step.duration)
            : resolveSkillCastTime(event.row.skill, requirementState())
        const requestedDuration = resolveSkillStepDuration(event.row.step, event.row.skill)
        if (requestedDuration !== undefined) baseCastTime = requestedDuration
        applyCastTimingModifiers(event.row, baseCastTime)
        if (event.row.kind === "rotation" && isSequentialStep(event.row.step)) scheduleNextOrdered(event.row)
      }
      if (event.row.queuedFrom) {
        const lastActionTime = Math.max(
          0,
          ...event.row.actions.map(action => (typeof action.time === "number" ? action.time : 0)),
        )
        extendQueuedCast(
          event.row.queuedFrom,
          event.row.startTime + Math.max(event.row.effectiveCastTime, lastActionTime),
        )
      }
      if (event.row.skill?.attackResponse) {
        responseWindows.push({
          row: event.row,
          endTime:
            event.time +
            (event.row.skill.attackResponse.durationFrom
              ? responseDuration(event.row.skill, event.time)
              : event.row.effectiveCastTime),
          succeeded: false,
        })
        if (event.row.skill.attackResponse.fallback && fallbackResponseRows.has(event.row))
          queueAttackResponse(event.row, event.time, event.sortOrder)
      }
      if (
        resolveAction?.onCastEnd &&
        event.row.step.type === "skill" &&
        !event.row.skill?.silent &&
        (event.row.kind === "rotation" || event.row.kind === "trigger")
      )
        events.push({
          kind: "castEnd",
          row: event.row,
          time: event.row.startTime + event.row.effectiveCastTime,
          sortOrder: [-2, event.row.order],
        })
      if (
        event.row.skill?.silent ||
        !effectTriggersByEvent.has("skillStart") ||
        event.row.step.type !== "skill" ||
        (event.row.kind !== "rotation" && event.row.kind !== "trigger")
      )
        continue
    }

    // Lifecycle triggers share the ordinary action executor without adding a stored or displayed action.
    const lifecycleAction = () => {
      switch (event.kind) {
        case "start":
          return { type: "skillStart" }
        case "attackResponse":
          return { type: "attackResponse" }
        default:
          return event.row.actions[event.actionIndex ?? -1]
      }
    }
    // The battle-start gate reads the row resolving right now, so publish it first.
    const activeRow = event.row
    const activeActionIndex = event.actionIndex
    requirementRow = () => [activeRow, activeActionIndex]
    const action: EditableObject | undefined = lifecycleAction()
    if (!action) continue
    if (event.row.kind === "dot" && event.row.step.type === "skill" && event.row.step.skill) {
      const active = activePeriodicEffects[periodicEffectKey("target", event.row.step.skill)]
      if (active?.expected) {
        active.expected.consumeTick(event.time)
        active.rows = active.rows.filter(row => row !== event.row)
      }
    }
    if (event.row.kind === "dot" && action.type === "damage" && action.damageScale === undefined) action.damageScale = 1
    if (event.kind === "action")
      event.row.actionStates[event.actionIndex ?? -1] = {
        buffs,
        debuffs,
        distance,
        currentHP,
        currentHPRatio,
        targetHPRatio,
        targetQiRatio,
        resources: { ...resources },
        enduranceLost: enduranceLost(),
        currentMartialArt: requirementState().currentMartialArt,
        currentWeapon: requirementState().currentWeapon,
        unconditionalDamageEffects,
        ...expectedDebuffSnapshot(
          event.time,
          event.row.kind === "dot" && event.row.step.type === "skill" ? event.row.step.skill : undefined,
        ),
      }
    const skillTags = event.row.actionSkillTags?.[event.actionIndex ?? -1] ?? event.row.skill?.tags ?? []
    const resolutionKey = actionResolutionKey(event.row, event.actionIndex ?? -1)
    const requirementPasses = startResolvedActionRequirements.has(resolutionKey)
      ? startResolvedActionRequirements.get(resolutionKey) === true
      : requirementsPass(
          action.requirement,
          buffs,
          debuffs,
          skillTags,
          innerWayConditions,
          weapons,
          resources,
          requirementState(),
        )
    if (!requirementPasses) continue
    const skillKey = event.row.step.type === "skill" ? (event.row.step.skill ?? "") : event.row.step.event
    const queuedTrigger = action.type === "trigger" && typeof action.queueTime === "number"
    if (action.type === "trigger" && queuedTrigger) {
      if (!queuedTriggerKeys.has(resolutionKey)) continue
    } else if (
      action.type === "trigger" &&
      typeof action.sourceEffect === "string" &&
      buffs.get(action.sourceEffect)?.sourceRowId !== (event.row.sourceRowId ?? event.row.id)
    )
      continue
    const actionCooldownKey = `action:${skillKey}:${event.actionIndex ?? -1}`
    if (typeof action.cooldown === "number" && (cooldowns[actionCooldownKey] ?? 0) > event.time) continue
    if (action.type === "apply" && typeof action.value === "string" && (cooldowns[action.value] ?? 0) > event.time)
      continue
    const resolvedAction = event.kind === "action" ? resolveAction?.(event.row, event.actionIndex ?? -1) : undefined
    if (action.type === "clearCD" && typeof action.value === "string") {
      if (action.seconds === undefined) cooldowns[action.value] = event.time
      clearSkillCooldown(
        action.value,
        event.time,
        typeof action.charges === "number" ? action.charges : undefined,
        typeof action.seconds === "number" ? action.seconds : undefined,
      )
      continue
    }
    if (action.type === "move" && typeof action.distance === "number" && Number.isFinite(action.distance)) {
      distance = Math.max(0, Math.floor(action.distance))
      continue
    }
    if (action.type === "setHP") {
      if (typeof action.currentHP === "number" && Number.isFinite(action.currentHP)) setCurrentHP(action.currentHP)
      else if (typeof action.currentHPRatio === "number" && Number.isFinite(action.currentHPRatio))
        setCurrentHP(action.currentHPRatio * maxHP)
      continue
    }
    if (
      action.type === "setTargetHP" &&
      typeof action.targetHPRatio === "number" &&
      Number.isFinite(action.targetHPRatio)
    ) {
      targetHPRatio = Math.min(1, Math.max(0, action.targetHPRatio))
      continue
    }
    if (action.type === "setQi" && typeof action.targetQiRatio === "number" && Number.isFinite(action.targetQiRatio)) {
      targetQiRatio = Math.min(1, Math.max(0, action.targetQiRatio))
      resources = { ...resources, Qi: targetQiRatio * 100 }
      continue
    }
    if (
      action.type === "switchMartialArt" &&
      typeof action.martialArt === "string" &&
      input.martialArtState?.[action.martialArt as WeaponId]?.weapon
    ) {
      currentMartialArt = action.martialArt as WeaponId
      currentWeapon = input.martialArtState?.[currentMartialArt]?.weapon
      continue
    }
    if (applyResourceAction(action, event.row)) continue
    if (action.type === "consume") {
      const targetEffects = action.target === "target" ? debuffs : buffs
      const valueObject =
        action.value && typeof action.value === "object" && !Array.isArray(action.value)
          ? (action.value as EditableObject)
          : undefined
      let value = startResolvedActionValues.has(resolutionKey)
        ? startResolvedActionValues.get(resolutionKey)
        : action.value
      if (
        !startResolvedActionValues.has(resolutionKey) &&
        valueObject?.operator === "first" &&
        Array.isArray(valueObject.operand)
      )
        value = valueObject.operand.find(candidate => typeof candidate === "string" && targetEffects.has(candidate))
      if (typeof value === "string") {
        const next = consumeTrackedEffect(
          targetEffects,
          value,
          action.stack === "all" ? "all" : typeof action.stack === "number" ? action.stack : undefined,
        )
        if (action.target === "target") setDebuffs(next)
        else setBuffs(next)
        if (!next.has(value)) {
          const target = action.target === "target" ? "target" : "self"
          const key = periodicEffectKey(target, value)
          const activeEffect = activePeriodicEffects[key]
          if (activeEffect) {
            removePendingPeriodicRows(activeEffect, event.time, true)
            delete activePeriodicEffects[key]
          }
        }
      }
    }
    const enqueueTriggeredSkill = (
      skillId: string,
      sourceRowId?: string,
      attachedTriggerOrdinal?: number,
      triggerSource: "skill" | "setup" | "innerWay" = "skill",
      probability?: number,
      expectedBranch?: TimelineRow["expectedBranch"],
      triggerTags?: string[],
      replaySourceDamage?: number,
      suppressFallback = false,
      queuedFrom?: string,
    ) => {
      const definition = skills[skillId]
      const triggeredSkill =
        definition && triggerTags?.length
          ? { ...definition, tags: [...(definition.tags ?? []), ...triggerTags] }
          : definition
      if (triggeredSkill) sourceRowId = damageSource(triggeredSkill, sourceRowId ?? event.row.id)
      const key = skillCooldownKey(skillId, triggeredSkill)
      if (!triggeredSkill) return false
      const uses = Math.max(1, Math.floor(triggeredSkill.cooldownUses ?? 1))
      if (compareTimelineTime(skillCooldownReadyAt(key, event.time, uses), event.time) > 0) return false
      const actions = Array.isArray(triggeredSkill.action) ? (triggeredSkill.action as EditableObject[]) : []
      const triggeredStartTime = event.time + (triggeredSkill.triggerPing ? skillPing(triggeredSkill) : 0)
      const derivedId = nextDerivedOrder++
      const derivedSortOrder = [...event.sortOrder, derivedId]
      const rowOrder = event.row.order + 10 + (event.actionIndex ?? 0) + 0.5
      const row: TimelineRow = {
        id: `trigger-${derivedId}`,
        kind: "trigger",
        ...(expectedBranch ? { expectedBranch } : {}),
        sourceRowId,
        ...(queuedFrom ? { queuedFrom } : {}),
        triggerSource,
        buffSourceSkillTags: event.row.buffSourceSkillTags ?? skillTags,
        order: rowOrder,
        step: { type: "skill", skill: skillId },
        startTime: triggeredStartTime,
        distance,
        currentHP,
        currentHPRatio,
        targetHPRatio,
        targetQiRatio,
        resources: { ...resources },
        enduranceLost: enduranceLost(),
        currentMartialArt,
        currentWeapon,
        effectiveCastTime: resolveSkillCastTime(triggeredSkill, requirementState()),
        skill: triggeredSkill,
        actions: actions.map(item =>
          Object.assign(
            {},
            item,
            item.type === "replay" && replaySourceDamage !== undefined ? { replaySourceDamage } : {},
            probability !== undefined && item.type === "damage"
              ? { damageScale: Number(item.damageScale ?? 1) * probability, hitProbability: probability }
              : {},
          ),
        ),
        buffs,
        debuffs,
        modifierEffects: [],
        actionStates: {},
      }
      if (
        triggeredSkill.attackResponse?.fallback &&
        !suppressFallback &&
        nextAttackAt(event.time, undefined, true) === undefined
      )
        fallbackResponseRows.add(row)
      rows.push(row)
      if (responseContext) responseContexts.set(row, responseContext)
      events.push({ time: triggeredStartTime, sortOrder: [...derivedSortOrder, 0], kind: "start", row })
      actions.forEach((item, index) => {
        events.push({
          time: triggeredStartTime + (typeof item.time === "number" ? item.time : 0),
          sortOrder: [...derivedSortOrder, 1, index],
          kind: "action",
          row,
          actionIndex: index,
        })
        if (
          item.type === "trigger" &&
          typeof item.queueTime === "number" &&
          Number.isFinite(item.queueTime) &&
          item.queueTime >= 0
        )
          events.push({
            time: triggeredStartTime + item.queueTime,
            sortOrder: [...derivedSortOrder, 1, index, -1],
            kind: "queueTrigger",
            row,
            actionIndex: index,
          })
      })
      if (sourceRowId && attachedTriggerOrdinal !== undefined) {
        ;(triggeredAttachments.get(sourceRowId) ?? [])
          .filter(attachment => attachment.target.trigger === attachedTriggerOrdinal)
          .forEach(attachment => {
            directAttachments.set(row.id, [...(directAttachments.get(row.id) ?? []), attachment])
            const targetTime =
              attachment.target.action === "start"
                ? row.startTime
                : row.startTime + Number(row.actions[attachment.target.action]?.time ?? 0)
            const targetSortOrder =
              attachment.target.action === "start"
                ? [...derivedSortOrder, 0]
                : [...derivedSortOrder, 1, attachment.target.action]
            const targetDisplayOrder =
              attachment.target.action === "start" ? row.order : row.order + 10 + attachment.target.action
            queueAttachedEvent(attachment, targetTime, targetSortOrder, targetDisplayOrder)
          })
      }
      if (typeof triggeredSkill.cooldown === "number")
        recordSkillCooldownCast(key, triggeredStartTime, triggeredSkill.cooldown, uses, triggeredSkill.cooldownRecovery)
      return true
    }
    const resolveMaxStackApplication = (
      name: string,
      definition: EffectDefinition,
      resultingStack: number,
      target: "self" | "target" | "player",
      sourceRowId: string,
      playerRecipientIndex?: number,
    ) => {
      const threshold = maxStackActionFor(resultingStack, definition.maxStack, definition.onMaxStack)
      if (!threshold) return false
      const remaining = new Map(target === "target" ? debuffs : buffs)
      remaining.delete(effectKey(name, playerRecipientIndex))
      if (target === "target") setDebuffs(remaining)
      else setBuffs(remaining)
      const key = periodicEffectKey(target, name, playerRecipientIndex)
      const periodic = activePeriodicEffects[key]
      if (periodic) removePendingPeriodicRows(periodic, event.time, true)
      delete activePeriodicEffects[key]
      accumulatorStates.delete(name)
      if (definition.cooldown !== undefined) cooldowns[name] = event.time + definition.cooldown
      enqueueTriggeredSkill(
        threshold.trigger,
        sourceRowId,
        undefined,
        "skill",
        undefined,
        undefined,
        threshold.triggerTags,
      )
      return true
    }
    const emitCustomEvent = (eventName: string) => {
      for (const activeBuff of buffs.values()) {
        const definition = effectDefinitions[activeBuff.name]
        const accumulator = accumulatorStates.get(activeBuff.name)
        if (!accumulator || (accumulator.expiresAt !== undefined && accumulator.expiresAt <= event.time)) continue
        for (const listener of definition?.listen ?? []) {
          if (listener.event !== eventName) continue
          const maxTriggers = Math.max(0, Math.floor(listener.maxTriggers ?? Number.POSITIVE_INFINITY))
          if (accumulator.firedTriggers >= maxTriggers || accumulator.nextReadyAt > event.time) continue
          const available = accumulator.accumulated >= accumulator.threshold
          if (!available) continue
          const triggerAction = listener.action
          if (triggerAction?.type !== "trigger" || typeof triggerAction.value !== "string") continue
          if (!enqueueTriggeredSkill(triggerAction.value, accumulator.sourceRowId)) continue
          accumulator.firedTriggers += 1
          if (Number.isFinite(maxTriggers))
            setBuffs(
              mapTrackedEffects(buffs, effect =>
                effect.name === activeBuff.name && effect.playerRecipientIndex === activeBuff.playerRecipientIndex
                  ? { ...effect, remainingTriggers: Math.max(0, maxTriggers - accumulator.firedTriggers) }
                  : effect,
              ),
            )
          accumulator.nextReadyAt = event.time + Math.max(0, listener.cooldown ?? 0)
          accumulator.accumulated = 0
        }
      }
    }
    const isFirstDamageAction = () => {
      const stage = multiActionSegments
        .get(event.row.id)
        ?.find(segment => segment.actionIndexes.includes(event.actionIndex ?? -1))
      const firstDamageIndex = stage
        ? stage.actionIndexes.find(index => event.row.actions[index]?.type === "damage")
        : event.row.actions.findIndex(entry => entry.type === "damage")
      return event.actionIndex === firstDamageIndex
    }
    const accumulateEventValue = (eventName: string, amount: number) => {
      if (!(amount > 0)) return
      for (const activeBuff of buffs.values()) {
        const definition = effectDefinitions[activeBuff.name]
        const accumulatorDefinition = definition?.accumulator
        if (!accumulatorDefinition || accumulatorDefinition.event !== eventName) continue
        if (
          !requirementsPass(
            accumulatorDefinition.requirement,
            buffs,
            debuffs,
            skillTags,
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          )
        )
          continue
        if (accumulatorDefinition.oncePerSkill && !isFirstDamageAction()) continue
        let accumulator = accumulatorStates.get(activeBuff.name)
        if (
          !accumulator &&
          typeof accumulatorDefinition.threshold === "number" &&
          accumulatorDefinition.threshold > 0
        ) {
          accumulator = {
            threshold: accumulatorDefinition.threshold,
            accumulated: 0,
            firedTriggers: 0,
            nextReadyAt: event.time,
            sourceRowId: activeBuff.sourceRowId ?? event.row.id,
            expiresAt: activeBuff.expiresAt,
          }
          accumulatorStates.set(activeBuff.name, accumulator)
        }
        if (!accumulator) continue
        const configuredAmount = accumulatorDefinition.amount
        let increment: unknown
        switch (typeof configuredAmount) {
          case "undefined":
            increment = amount
            break
          case "number":
            increment = configuredAmount
            break
          default:
            increment = resolveSwitchValue(configuredAmount, requirementState())
        }
        if (typeof increment !== "number" || !Number.isFinite(increment) || increment <= 0) continue
        accumulator.accumulated += increment
        if (accumulatorDefinition.checkEvent) emitCustomEvent(accumulatorDefinition.checkEvent)
      }
    }
    // Both replacement and expiry settle the same activation exactly once.
    const resolveRecording = (key: string, expectedId?: number) => {
      const recording = recordings.get(key)
      if (!recording || (expectedId !== undefined && recording.id !== expectedId)) return
      recordings.delete(key)
      if (recording.hasMatchedDamage)
        enqueueTriggeredSkill(
          recording.definition.action.value,
          recording.sourceRowId,
          undefined,
          "skill",
          undefined,
          undefined,
          undefined,
          recording.sourceDamage,
        )
    }
    const startRecording = (
      name: string,
      definition: EffectDefinition,
      target: "self" | "target" | "player",
      appliedEffect: TrackedEffect,
      sourceRowId: string,
    ) => {
      if (!definition.recording || appliedEffect.expiresAt === undefined) return
      const key = periodicEffectKey(target, name)
      resolveRecording(key)
      recordings.set(key, {
        id: nextRecordingId++,
        sourceDamage: 0,
        hasMatchedDamage: false,
        sourceRowId,
        expiresAt: appliedEffect.expiresAt,
        definition: definition.recording,
      })
    }
    const applyTriggerAction = (
      triggerAction: EditableObject,
      triggerSource: "setup" | "innerWay",
      linkedDot?: string,
    ) => {
      // Multiple applications share one proc roll; expected mode retains each marginal distribution.
      if (triggerAction.type === "apply" && Array.isArray(triggerAction.value)) {
        const chance = resolveActionChance(triggerAction.chance)
        if (chance <= 0) return
        if (procRoll) {
          const key = `group:${event.row.sourceRowId ?? event.row.id}:${event.actionIndex}:${triggerSource}:${triggerAction.value.join(",")}`
          const occurrence = procOccurrences.get(key) ?? 0
          procOccurrences.set(key, occurrence + 1)
          if (procRoll(`${key}:${occurrence}`) >= chance) return
        }
        const groupDot = triggerAction.value.find(value => typeof value === "string" && dots[value]) as
          | string
          | undefined
        for (const value of triggerAction.value) {
          if (typeof value !== "string") throw new Error("Grouped applications require effect IDs.")
          applyTriggerAction(
            { ...triggerAction, value, chance: procRoll ? undefined : chance },
            triggerSource,
            groupDot,
          )
        }
        return
      }
      const hitProbability = typeof action.hitProbability === "number" ? action.hitProbability : 1
      if (triggerAction.type === "addResource" && typeof triggerAction.amount === "number" && hitProbability !== 1)
        triggerAction = { ...triggerAction, amount: triggerAction.amount * hitProbability }
      if (applyResourceAction(triggerAction, event.row)) return
      if (triggerAction.type === "clearCD" && typeof triggerAction.value === "string") {
        if (triggerAction.seconds === undefined) cooldowns[triggerAction.value] = event.time
        clearSkillCooldown(
          triggerAction.value,
          event.time,
          typeof triggerAction.charges === "number" ? triggerAction.charges : undefined,
          typeof triggerAction.seconds === "number" ? triggerAction.seconds : undefined,
        )
        return
      }
      if (triggerAction.type === "consume" && typeof triggerAction.value === "string") {
        const targetEffects = triggerAction.target === "target" ? debuffs : buffs
        const next = consumeTrackedEffect(
          targetEffects,
          triggerAction.value,
          triggerAction.stack === "all"
            ? "all"
            : typeof triggerAction.stack === "number"
              ? triggerAction.stack
              : undefined,
        )
        if (triggerAction.target === "target") setDebuffs(next)
        else setBuffs(next)
        if (!next.has(triggerAction.value as string)) {
          const target = triggerAction.target === "target" ? "target" : "self"
          const key = periodicEffectKey(target, triggerAction.value)
          const activeEffect = activePeriodicEffects[key]
          if (activeEffect) {
            removePendingPeriodicRows(activeEffect, event.time, true)
            delete activePeriodicEffects[key]
          }
        }
        return
      }
      if (triggerAction.type === "trigger" && typeof triggerAction.value === "string") {
        enqueueTriggeredSkill(triggerAction.value, event.row.sourceRowId ?? event.row.id, undefined, triggerSource)
        return
      }
      if (
        triggerAction.type !== "apply" ||
        typeof triggerAction.value !== "string" ||
        (cooldowns[triggerAction.value] ?? 0) > event.time ||
        (triggerAction.target === "target" && targetAcceptsApplications(event.row, event.actionIndex) === false)
      )
        return
      const targetEffects = triggerAction.target === "target" ? debuffs : buffs
      const periodicTarget = triggerAction.target === "target" ? "target" : "self"
      const definition = getModifiedEffectDefinition(triggerAction.value, buffs, debuffs, skillTags)
      const applicationSource = damageSource(definition, event.row.sourceRowId ?? event.row.id)
      const duration = applicationDuration(
        typeof triggerAction.duration === "number" ? triggerAction.duration : definition.duration,
        triggerAction.target,
        event.row,
        skillTags,
      )
      const baseStack = typeof triggerAction.stack === "number" ? triggerAction.stack : 1
      const conditionalBranch =
        event.row.expectedBranch?.effect === triggerAction.value ? event.row.expectedBranch.id : undefined
      if (triggerAction.chance !== undefined || conditionalBranch !== undefined) {
        const chance = resolveActionChance(triggerAction.chance)
        if (chance <= 0) return
        if (procRoll) {
          const key = `${event.row.sourceRowId ?? event.row.id}:${event.row.step.type === "skill" ? event.row.step.skill : "event"}:${event.actionIndex}:${triggerSource}:${triggerAction.value}`
          const occurrence = procOccurrences.get(key) ?? 0
          procOccurrences.set(key, occurrence + 1)
          if (procRoll(`${key}:${occurrence}`) >= chance) return
        } else {
          const periodic = definition.periodic
          if (!periodic && triggerAction.target === "target" && duration && definition.refresh !== false) {
            if (targetEffects.get(triggerAction.value)?.persistent) return
            const stackRules = definition.stackEffects?.flat() ?? definition.effect ?? []
            if (
              definition.action?.length ||
              stackRules.some(
                rule => !rule || typeof rule !== "object" || Object.keys(rule).some(key => key !== "effect"),
              )
            )
              throw new Error("Chance debuffs support unconditional damage effects only.")
            let expected = expectedDebuffs.get(triggerAction.value)
            if (!expected) {
              const dot = linkedDot ? effectDefinitions[linkedDot] : undefined
              const periodic = dot?.periodic
              let tickOrigin: number | null | undefined = linkedDot ? undefined : null
              if (periodic?.expectedTickAlignment === "battle")
                tickOrigin = battleStartTime < 0 ? null : battleStartTime
              expected = {
                tracker: new ExpectedPeriodicTracker(
                  periodic?.interval ?? 1,
                  periodic?.firstTick ?? periodic?.interval ?? 1,
                  tickOrigin,
                  input.expectedPeriodicStorage,
                  periodic?.tickOnExpire !== false,
                  dot?.duration,
                ),
                definition,
                linkedDot,
                coverageTime: event.time,
                maxStackSeconds: 0,
              }
              expectedDebuffs.set(triggerAction.value, expected)
            }
            expected.definition = definition
            if (definition.showCoverage && battleStartTime >= 0)
              expected.maxStackSeconds += expected.tracker.maxStackDuration(
                Math.max(battleStartTime, expected.coverageTime),
                event.time,
                definition.maxStack ?? 1,
              )
            expected.coverageTime = event.time
            expected.tracker.apply(
              event.time,
              chance * hitProbability,
              duration,
              definition.maxStack ?? 1,
              baseStack,
              triggerAction.value,
            )
            return
          }
          if (
            event.row.kind === "dot" ||
            !dots[triggerAction.value] ||
            triggerAction.target !== "target" ||
            !duration ||
            !periodic?.interval ||
            periodic.resetOnRefresh ||
            definition.refresh === false
          )
            throw new Error("Chance applications require a refreshing target DOT with a preserved cadence.")
          const key = periodicEffectKey("target", triggerAction.value)
          const activeEffect: ActivePeriodicEffect = activePeriodicEffects[key] ?? {
            definition,
            appliedAt: event.time,
            expiresAt: event.time + duration,
            sourceRowId: applicationSource,
            rows: [],
          }
          activeEffect.expected ??= new ExpectedPeriodicTracker(
            periodic.interval,
            periodic.firstTick ?? periodic.interval,
            periodic.expectedTickAlignment === "battle" ? (battleStartTime < 0 ? null : battleStartTime) : undefined,
            input.expectedPeriodicStorage,
            periodic.tickOnExpire !== false,
          )
          const emittedBranch = `threshold-${nextDerivedOrder++}`
          const thresholdProbability = activeEffect.expected.apply(
            event.time,
            conditionalBranch !== undefined ? chance : chance * hitProbability,
            duration,
            definition.maxStack ?? 1,
            baseStack,
            applicationSource,
            definition.onMaxStack,
            emittedBranch,
            conditionalBranch,
          )
          activeEffect.expiresAt = event.time + duration
          activeEffect.definition = definition
          activeEffect.schedulerRow = event.row
          removePendingPeriodicRows(activeEffect, event.time, true)
          activePeriodicEffects[key] = activeEffect
          schedulePeriodicActions(
            triggerAction.value,
            activeEffect,
            event.time,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            true,
          )
          scheduleExpectedExpiration(triggerAction.value, activeEffect, event.sortOrder)
          if (conditionalBranch === undefined)
            mergeTinyExpectedStates(triggerAction.value, activeEffect, event.time, event.sortOrder)
          if (thresholdProbability > 0 && definition.onMaxStack)
            enqueueTriggeredSkill(
              definition.onMaxStack.trigger,
              event.row.sourceRowId ?? event.row.id,
              undefined,
              "skill",
              thresholdProbability,
              { effect: triggerAction.value, id: emittedBranch },
              definition.onMaxStack.triggerTags,
            )
          return
        }
      }
      const additional =
        triggerAction.additionalStack &&
        typeof triggerAction.additionalStack === "object" &&
        !Array.isArray(triggerAction.additionalStack)
          ? (triggerAction.additionalStack as EditableObject)
          : undefined
      const additionalStack =
        additional &&
        requirementsPass(
          additional.requirement,
          buffs,
          debuffs,
          skillTags,
          innerWayConditions,
          weapons,
          resources,
          requirementState(),
        )
          ? typeof additional.stack === "number"
            ? additional.stack
            : 1
          : 0
      const fallbackSourceRowId =
        event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id)
      const collection = boostDamageCollection(
        undefined,
        triggerAction.value,
        typeof triggerAction.boostDamageSource === "string" ? buffs.get(triggerAction.boostDamageSource) : undefined,
        damageSource(
          definition,
          (definition.parentEffect ? buffs.get(definition.parentEffect)?.sourceRowId : undefined) ??
            fallbackSourceRowId,
        ),
      )
      const existing = targetEffects.get(triggerAction.value as string)
      if (existing && triggerAction.reapply === false) return
      if (
        resolveMaxStackApplication(
          triggerAction.value,
          definition,
          (existing?.stack ?? 0) + baseStack + additionalStack,
          periodicTarget,
          collection.sourceRowId,
        )
      )
        return
      const next = applyTrackedEffect(
        targetEffects,
        triggerAction.value,
        baseStack + additionalStack,
        duration,
        event.time,
        definition.maxStack,
        definition.refresh !== false,
        collection.sourceRowId,
        collection.collectBoostDamage,
        undefined,
        finiteListenerTriggerLimit(definition),
      )
      if (triggerAction.target === "target") setDebuffs(next)
      else setBuffs(next)
      const appliedEffect = next.get(triggerAction.value as string)
      if (definition.periodic && appliedEffect) {
        const key = periodicEffectKey(periodicTarget, triggerAction.value)
        const effectSourceRowId = applicationSource
        if (existing && activePeriodicEffects[key] && definition.refresh !== false) {
          transferAndReschedulePeriodicEffect(
            triggerAction.value,
            periodicTarget,
            definition,
            appliedEffect.expiresAt ?? Number.POSITIVE_INFINITY,
            event.time,
            effectSourceRowId,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            definition.periodic?.resetOnRefresh === true,
          )
        } else if (!existing || !activePeriodicEffects[key]) {
          const activeEffect: ActivePeriodicEffect = {
            definition,
            appliedAt: event.time,
            expiresAt: appliedEffect.expiresAt ?? Number.POSITIVE_INFINITY,
            sourceRowId: effectSourceRowId,
            rows: [],
          }
          activePeriodicEffects[key] = activeEffect
          schedulePeriodicActions(
            triggerAction.value,
            activeEffect,
            event.time,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            true,
          )
        }
      }
      if (appliedEffect) {
        startRecording(triggerAction.value, definition, periodicTarget, appliedEffect, collection.sourceRowId)
        enqueueEffectActions(
          triggerAction.value,
          definition,
          event.time,
          collection.sourceRowId,
          event.sortOrder,
          event.row.order + (event.actionIndex ?? 0),
          periodicTarget,
          appliedEffect.expiresAt,
        )
        if (definition.cooldown !== undefined) cooldowns[triggerAction.value] = event.time + definition.cooldown
      }
    }
    const runEffectTriggers = (triggerEvent: string, tracked = false) => {
      ;(effectTriggersByEvent.get(triggerEvent) ?? []).forEach(({ triggerIndex, trigger, owner }) => {
        if (Boolean(owner) !== tracked || (owner && !buffs.has(owner))) return
        if (trigger.oncePerSkill) {
          if (action.type !== "damage" || (!procRoll && action.hitProbability !== undefined)) return
          if (!isFirstDamageAction()) return
        }
        if (
          (effectTriggerCooldowns.get(triggerIndex) ?? 0) > event.time ||
          !requirementsPass(
            trigger.requirement,
            buffs,
            debuffs,
            skillTags,
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          )
        )
          return
        // A trigger's actions run in order in this one pass, so a `consume` ahead of a
        // `trigger` completes before the triggered row is queued. Ordering by
        // timestamp cannot do that: two damage actions sharing a timestamp would both
        // see the buff before either queued row removed it.
        const declaredActions = trigger.action
        const actions = Array.isArray(declaredActions) ? declaredActions : [declaredActions]
        const runnable = actions.filter(
          (action): action is EditableObject => Boolean(action) && typeof action === "object" && !Array.isArray(action),
        )
        if (runnable.length) {
          for (const triggerAction of runnable) applyTriggerAction(triggerAction, "setup")
          if (typeof trigger.cooldown === "number" && trigger.cooldown > 0)
            effectTriggerCooldowns.set(triggerIndex, event.time + trigger.cooldown)
        }
      })
    }
    const runInnerWayTriggers = (triggerEvent: "damage" | "heal" | "takeDamage", row?: TimelineRow) => {
      ;(innerWayTriggersByEvent.get(triggerEvent) ?? []).forEach(rule => {
        const requirement = rule.requirement ?? rule.trigger?.requirement
        if (
          !requirementsPass(
            requirement,
            buffs,
            debuffs,
            skillTags,
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
            // Rows carry the effect state as it was when the skill started, which is
            // what a resolveAt: "skillStart" element reads.
            row ? { buffs: row.buffs, debuffs: row.debuffs } : undefined,
          )
        )
          return
        const triggerActions = Array.isArray(rule.trigger?.action)
          ? rule.trigger.action
          : rule.trigger?.action && typeof rule.trigger.action === "object"
            ? [rule.trigger.action]
            : []
        const hitWindow = rule.trigger?.hitWindow as { count: number; seconds: number } | undefined
        const triggerCooldown = rule.trigger?.cooldown
        let triggerState: { hits: number[]; readyAt: number } | undefined
        if (hitWindow || typeof triggerCooldown === "number") {
          triggerState = innerWayTriggerStates.get(rule)
          if (!triggerState) {
            triggerState = { hits: [], readyAt: Number.NEGATIVE_INFINITY }
            innerWayTriggerStates.set(rule, triggerState)
          }
          if (hitWindow) {
            // Expected probability-weighted rows do not count, even at probability one.
            // Sampled timelines contain concrete successful procs and may count those hits.
            if (action.type !== "damage" || (!procRoll && action.hitProbability !== undefined)) return
            if (
              !Number.isInteger(hitWindow.count) ||
              hitWindow.count < 1 ||
              !Number.isFinite(hitWindow.seconds) ||
              hitWindow.seconds < 0
            )
              return
            triggerState.hits = triggerState.hits.filter(
              time => compareTimelineTime(time, event.time - hitWindow.seconds) >= 0,
            )
            triggerState.hits.push(event.time)
            if (triggerState.hits.length > hitWindow.count) triggerState.hits.shift()
            if (triggerState.hits.length < hitWindow.count) return
          }
          if (compareTimelineTime(event.time, triggerState.readyAt) < 0) return
        }
        triggerActions
          .filter(
            (triggerAction): triggerAction is EditableObject =>
              Boolean(triggerAction) && typeof triggerAction === "object" && !Array.isArray(triggerAction),
          )
          .forEach(triggerAction => applyTriggerAction(triggerAction, "innerWay"))
        if (triggerState && typeof triggerCooldown === "number" && triggerCooldown > 0 && triggerActions.length > 0)
          triggerState.readyAt = event.time + triggerCooldown
      })
    }
    if (event.kind === "start") {
      runEffectTriggers("skillStart")
      runEffectTriggers("skillStart", true)
      continue
    }
    if (event.kind === "attackResponse") {
      runEffectTriggers("attackResponse")
      runEffectTriggers("attackResponse", true)
      enqueueTriggeredSkill(
        event.row.skill!.attackResponse!.onSuccess,
        event.row.sourceRowId ?? event.row.id,
        undefined,
        "skill",
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      )
      continue
    }
    if (action.type === "takeDamage" && typeof action.damage === "number" && Number.isFinite(action.damage)) {
      const activeResponses = responseWindows.filter(
        ({ row, endTime }) =>
          compareTimelineTime(event.time, row.startTime) >= 0 && compareTimelineTime(event.time, endTime) <= 0,
      )
      // A Take Damage action is an incoming attack even when its resolved HP loss is zero.
      // This lets zero-damage manual events activate responses.
      activeResponses.forEach(response => queueAttackResponse(response.row, event.time, event.sortOrder))
      const incomingDamage = Math.max(0, action.damage)
      const resolvedDamage = activeResponses.length ? 0 : incomingDamage
      action.damage = resolvedDamage
      // A manually authored zero-damage event is still a Take Damage event. A
      // positive attack that a defense avoids remains excluded from damage-taken
      // effects; its response rewards are delivered by the attackResponse event.
      const applyTakeDamageEffects =
        resolvedDamage > 0 ||
        (incomingDamage === 0 && event.row.step.type === "event" && event.row.step.event === "TakeDamage")
      if (!applyTakeDamageEffects) continue
      const previousHP = currentHP
      setCurrentHP(currentHP - resolvedDamage)
      applyResourceEvent("takeDamage", event.time, previousHP - currentHP)
      const triggerStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
      runEffectTriggers("takeDamage")
      runInnerWayTriggers("takeDamage", event.row)
      runEffectTriggers("takeDamage", true)
      if (import.meta.env.DEV) finishCalculationPhase("effectTriggering", triggerStartedAt)
      continue
    }
    if (action.type === "resolveRecording" && typeof action.value === "string") {
      if (typeof action.recordingId === "number")
        resolveRecording(
          periodicEffectKey(action.target === "target" ? "target" : "self", action.value),
          action.recordingId,
        )
      continue
    }
    if (action.type === "replay") {
      if (resolvedAction?.damage && typeof input.rotation.targetHP === "number" && input.rotation.targetHP > 0)
        targetHPRatio = Math.max(0, targetHPRatio - resolvedAction.damage / input.rotation.targetHP)
      continue
    }
    if (action.type === "damage") {
      if ((resolvedAction?.damage ?? 0) > 0) {
        for (const rule of damageListeners) {
          const listener = rule.listen!
          if (
            (listenerCooldowns.get(rule) ?? -Infinity) > event.time ||
            !requirementsPass(
              listener.requirement ?? rule.requirement,
              buffs,
              debuffs,
              skillTags,
              innerWayConditions,
              weapons,
              resources,
              requirementState(),
            )
          )
            continue
          const trigger = listener.action as EditableObject | undefined
          const parameter = trigger?.parameter as EditableObject | undefined
          if (
            trigger?.type !== "trigger" ||
            typeof trigger.value !== "string" ||
            parameter?.damage !== "event.damage" ||
            !skills[trigger.value]?.tags?.includes("Replayed")
          )
            continue
          if (
            enqueueTriggeredSkill(
              trigger.value,
              event.row.sourceRowId ?? event.row.id,
              undefined,
              "innerWay",
              undefined,
              undefined,
              undefined,
              resolvedAction!.damage,
            )
          )
            listenerCooldowns.set(rule, event.time + Math.max(0, Number(listener.cooldown ?? 0)))
        }
      }
      for (const recording of recordings.values()) {
        if (
          compareTimelineTime(event.time, recording.expiresAt) < 0 &&
          requirementsPass(
            recording.definition.requirement,
            buffs,
            debuffs,
            skillTags,
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          )
        ) {
          recording.sourceDamage += resolvedAction?.damage ?? 0
          recording.hasMatchedDamage = true
        }
      }
      const triggerStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
      runEffectTriggers("damage")
      runInnerWayTriggers("damage", event.row)
      runEffectTriggers("damage", true)
      if (procRoll || action.hitProbability === undefined) accumulateEventValue("damage", 1)
      if (event.row.expectedBranch) {
        const branch = event.row.expectedBranch
        const active = activePeriodicEffects[periodicEffectKey("target", branch.effect)]
        active?.expected?.releaseBranch(branch.id)
        if (active) mergeTinyExpectedStates(branch.effect, active, event.time, event.sortOrder)
      }
      if (import.meta.env.DEV) finishCalculationPhase("effectTriggering", triggerStartedAt)
      applyResourceEvent("damage", event.time, 0, Number(action.hitProbability ?? 1))
      if (resolvedAction?.damage && typeof input.rotation.targetHP === "number" && input.rotation.targetHP > 0)
        targetHPRatio = Math.max(0, targetHPRatio - resolvedAction.damage / input.rotation.targetHP)
    }
    if (action.type === "heal") {
      const resolvedHealing = resolvedAction?.healing
      if (resolvedHealing) {
        resolvedHealing.self.forEach(healing => {
          const rawHealing = typeof healing === "number" && Number.isFinite(healing) ? Math.max(0, healing) : 0
          const missingHP = Math.max(0, maxHP - currentHP)
          const effectiveHealing = Math.min(rawHealing, missingHP)
          const overhealing = Math.max(0, rawHealing - effectiveHealing)
          setCurrentHP(currentHP + effectiveHealing)
          accumulateEventValue("overheal", overhealing)
        })
        resolvedHealing.teammateOverhealContributions.forEach(healing =>
          accumulateEventValue("overheal", Math.max(0, healing)),
        )
      }
      const triggerStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
      runEffectTriggers("heal")
      runInnerWayTriggers("heal", event.row)
      runEffectTriggers("heal", true)
      if (import.meta.env.DEV) finishCalculationPhase("effectTriggering", triggerStartedAt)
    }
    if (action.type === "trigger" && typeof action.value === "string") {
      const chance = resolveActionChance(action.chance)
      if (chance <= 0) continue
      let probability = Number(action.hitProbability ?? 1) * chance
      let expectedBranch: TimelineRow["expectedBranch"]
      if (!procRoll && event.row.expectedExpiration) {
        const expiration = event.row.expectedExpiration
        expectedBranch = { effect: expiration.effect, id: `expiration-${nextDerivedOrder++}` }
        probability =
          activePeriodicEffects[periodicEffectKey("target", expiration.effect)]?.expected?.expire(
            expiration.time,
            expiration.source,
            chance,
            expectedBranch.id,
          ) ?? 0
        if (probability <= 0) continue
      }
      if (procRoll && chance < 1) {
        const key = `${event.row.sourceRowId ?? event.row.id}:${event.row.step.type === "skill" ? event.row.step.skill : "event"}:${event.actionIndex}:trigger:${action.value}`
        const occurrence = procOccurrences.get(key) ?? 0
        procOccurrences.set(key, occurrence + 1)
        if (procRoll(`${key}:${occurrence}`) >= chance) continue
        probability = 1
      }
      const triggerOrdinal =
        event.row.kind === "rotation"
          ? event.row.actions.slice(0, (event.actionIndex ?? 0) + 1).filter(candidate => candidate.type === "trigger")
              .length - 1
          : undefined
      enqueueTriggeredSkill(
        action.value,
        event.row.sourceRowId ?? event.row.id,
        triggerOrdinal,
        "skill",
        probability === 1 ? undefined : probability,
        expectedBranch,
        undefined,
        undefined,
        false,
        queuedTrigger ? (event.row.sourceRowId ?? event.row.id) : undefined,
      )
    }
    if (action.type === "emitEvent" && typeof action.value === "string") emitCustomEvent(action.value)
    if ((action.type === "apply" || action.type === "extend") && typeof action.value === "string") {
      // Nothing reaches the target before the fight starts.
      if (action.target === "target" && targetAcceptsApplications(event.row, event.actionIndex) === false) continue
      const targetEffects = action.target === "target" ? debuffs : buffs
      const periodicTarget = action.target === "target" ? "target" : action.target === "player" ? "player" : "self"
      const playerRecipientIndex =
        action.type === "apply" && action.target === "player"
          ? selectPlayerRecipient(targetEffects, action.value)
          : undefined
      const modifierDuration = (
        event.row.actionModifierEffects?.[event.actionIndex ?? -1] ?? event.row.modifierEffects
      ).find(effect => typeof effect.duration === "number")
      const definition = getModifiedEffectDefinition(action.value, buffs, debuffs, skillTags)
      if (action.type === "extend" && definition.recording) continue
      let duration = definition.duration
      if (typeof modifierDuration?.duration === "number") duration = modifierDuration.duration
      if (typeof action.duration === "number") duration = action.duration
      if (action.type === "apply") duration = applicationDuration(duration, action.target, event.row, skillTags)
      const existing = targetEffects.get(effectKey(action.value, playerRecipientIndex))
      const fallbackSourceRowId =
        event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id)
      const collection = boostDamageCollection(
        event.row.skill,
        action.value,
        typeof action.boostDamageSource === "string" ? buffs.get(action.boostDamageSource) : undefined,
        damageSource(definition, fallbackSourceRowId),
      )
      const shouldApply = action.type === "apply" && (!existing || action.reapply !== false)
      if (
        shouldApply &&
        resolveMaxStackApplication(
          action.value,
          definition,
          (existing?.stack ?? 0) + (typeof action.stack === "number" ? action.stack : 1),
          periodicTarget,
          collection.sourceRowId,
          playerRecipientIndex,
        )
      )
        continue
      const next =
        action.type === "extend" && typeof duration === "number"
          ? extendTrackedEffect(targetEffects, action.value, duration, event.time)
          : shouldApply
            ? applyTrackedEffect(
                targetEffects,
                action.value,
                typeof action.stack === "number" ? action.stack : undefined,
                duration,
                event.time,
                definition.maxStack,
                definition.refresh !== false,
                collection.sourceRowId,
                collection.collectBoostDamage,
                playerRecipientIndex,
                finiteListenerTriggerLimit(definition),
              )
            : targetEffects
      const snapshotThreshold = resolvedAction?.accumulatorThreshold
      if (shouldApply && definition.accumulator && typeof snapshotThreshold === "number") {
        const applied = next.get(effectKey(action.value, playerRecipientIndex))
        if (applied) applied.accumulatorThreshold = snapshotThreshold
      }
      if (action.target === "target") setDebuffs(next)
      else setBuffs(next)
      const appliedEffect = next.get(effectKey(action.value, playerRecipientIndex))
      if (shouldApply && definition.periodic && appliedEffect) {
        const key = periodicEffectKey(periodicTarget, action.value, playerRecipientIndex)
        const effectSourceRowId = damageSource(definition, event.row.sourceRowId ?? event.row.id)
        if (existing && activePeriodicEffects[key] && definition.refresh !== false) {
          transferAndReschedulePeriodicEffect(
            action.value,
            periodicTarget,
            definition,
            appliedEffect.expiresAt ?? Number.POSITIVE_INFINITY,
            event.time,
            effectSourceRowId,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            definition.periodic?.resetOnRefresh === true,
            playerRecipientIndex,
          )
        } else if (!existing || !activePeriodicEffects[key]) {
          const activeEffect: ActivePeriodicEffect = {
            definition,
            appliedAt: event.time,
            expiresAt: appliedEffect.expiresAt ?? Number.POSITIVE_INFINITY,
            sourceRowId: effectSourceRowId,
            ...(playerRecipientIndex !== undefined ? { playerRecipientIndex } : {}),
            rows: [],
          }
          activePeriodicEffects[key] = activeEffect
          schedulePeriodicActions(
            action.value,
            activeEffect,
            event.time,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            true,
          )
        }
      }
      if (
        action.type === "extend" &&
        typeof duration === "number" &&
        existing?.expiresAt !== undefined &&
        existing.expiresAt > event.time &&
        activePeriodicEffects[periodicEffectKey(periodicTarget, action.value, playerRecipientIndex)]
      ) {
        transferAndReschedulePeriodicEffect(
          action.value,
          periodicTarget,
          definition,
          existing.expiresAt + duration,
          event.time,
          event.row.sourceRowId ?? event.row.id,
          event.sortOrder,
          event.row.order + (event.actionIndex ?? 0),
          false,
          playerRecipientIndex,
        )
      }
      if (shouldApply && appliedEffect) {
        startRecording(action.value, definition, periodicTarget, appliedEffect, collection.sourceRowId)
        if (definition.accumulator) {
          const threshold =
            typeof definition.accumulator.threshold === "number"
              ? definition.accumulator.threshold
              : resolvedAction?.accumulatorThreshold
          if (typeof threshold === "number" && Number.isFinite(threshold) && threshold > 0) {
            const previous =
              existing && definition.accumulator.resetOnRefresh === false
                ? accumulatorStates.get(action.value)
                : undefined
            accumulatorStates.set(action.value, {
              threshold,
              accumulated: previous?.accumulated ?? 0,
              firedTriggers: previous?.firedTriggers ?? 0,
              nextReadyAt: previous?.nextReadyAt ?? event.time,
              sourceRowId: collection.sourceRowId,
              expiresAt: appliedEffect.expiresAt,
            })
          }
        }
        enqueueEffectActions(
          action.value,
          definition,
          event.time,
          collection.sourceRowId,
          event.sortOrder,
          event.row.order + (event.actionIndex ?? 0),
          periodicTarget,
          appliedEffect.expiresAt,
        )
        if (definition.cooldown !== undefined) cooldowns[action.value] = event.time + definition.cooldown
      }
    }
    if (typeof action.cooldown === "number") cooldowns[actionCooldownKey] = event.time + action.cooldown
  }
  if (processedEvents >= 5000 && (events.length || timedCursor < timed.length))
    throw new Error("Combat timeline exceeded its 5,000-event safety limit before reaching combat end.")
  regenerateResources(timelineEndTime)
  if (pendingCharge) resolvedRows.delete(pendingCharge.event.row)
  for (const row of rows)
    row.actions = row.actions.map((action, index) =>
      row.actionStates[index] ? action : Object.assign({}, action, { type: "inactive" }),
    )
  // Describe elapsed waits without adding events or changing saved rotation steps.
  for (const { row: delay, until, reason } of automaticDelayRows) {
    const duration = Math.max(0, Math.min(until, timelineEndTime) - delay.startTime)
    if (compareTimelineTime(duration, 0) <= 0) continue
    delay.step = { type: "event", event: "Delay", duration, automatic: reason }
    delay.effectiveCastTime = duration
    rows.push(delay)
    resolvedRows.add(delay)
  }
  const sortedRows = rows
    .filter(row => resolvedRows.has(row))
    .sort(
      (left, right) =>
        compareTimelineTime(left.startTime, right.startTime) ||
        left.order - right.order ||
        (left.kind === "rotation" ? -1 : right.kind === "rotation" ? 1 : 0),
    )
  const firstRow = sortedRows[0]
  if (firstRow) {
    const groupRows: TimelineRow[] = [...damageGroups.values()].map((group, index) =>
      Object.assign({}, firstRow, {
        id: `innerway-${group.id}`,
        kind: "damageGroup",
        step: { type: "skill", skill: group.id },
        skill: { name: group.name, action: [], tags: [] },
        sourceRowId: undefined,
        sourceDamageWeights: undefined,
        rotationIndex: undefined,
        skipped: false,
        order: -1000 + index,
        effectiveCastTime: 0,
        actions: [],
        actionStates: {},
        buffs: effectState(),
        debuffs: effectState(),
        resourceConsumption: undefined,
      }),
    )
    sortedRows.unshift(...groupRows)
  }
  if (sortedRows[0]) {
    sortedRows[0].battleStartTime = battleStartTime
    sortedRows[0].timelineEndTime = timelineEndTime
    advanceDebuffCoverage(timelineEndTime)
    sortedRows[0].debuffMaxStackSeconds = {
      ...debuffMaxStackSeconds,
      ...Object.fromEntries(
        Array.from(expectedDebuffs)
          .filter(([, state]) => state.definition.showCoverage)
          .map(([name, state]) => [
            name,
            state.maxStackSeconds +
              state.tracker.maxStackDuration(
                Math.max(battleStartTime, state.coverageTime),
                timelineEndTime,
                state.definition.maxStack ?? 1,
              ),
          ]),
      ),
    }
    const resourceNames = new Set([
      ...Object.keys(initialResources),
      ...Object.keys(resources),
      ...resourceTotals.keys(),
    ])
    sortedRows[0].timelineResourceSummary = Object.fromEntries(
      [...resourceNames].map(name => {
        const totals = resourceTotals.get(name) ?? { consumed: 0, regenerated: 0 }
        return [
          name,
          {
            initial: initialResources[name] ?? 0,
            consumed: totals.consumed,
            regenerated: totals.regenerated,
            final: resources[name] ?? 0,
          },
        ]
      }),
    )
  }
  return sortedRows
}
