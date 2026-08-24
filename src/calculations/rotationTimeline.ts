import type { WeaponFamily, WeaponId } from "../types";
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark";
import { resolveSegmentValue } from "./dynamicValues";

export type EditableObject = Record<string, unknown>;
export type PeriodicEffect = {
  interval?: number;
  firstTick?: number;
  resetOnRefresh?: boolean;
  action?: unknown[];
};
export type SubActionReference = {
  value: string;
  requirement?: unknown;
  fallback?: string;
};
export type SkillRecord = {
  [key: string]: unknown;
  name?: string;
  shortName?: string;
  castTime?: number;
  cooldown?: number;
  duration?: number;
  collectBoostDamage?: string;
  subAction?: Array<string | SubActionReference>;
  action?: unknown[];
  periodic?: PeriodicEffect;
  modifier?: unknown[];
  tags?: string[];
  martialArt?: WeaponId;
  weapon?: WeaponFamily;
};
export type AttachedEventTarget = { action: number | "start"; trigger?: number };
export type RotationStep =
  | { type: "skill"; skill?: string; causesBreak?: boolean; condition?: string }
  | { type: "event"; event: "Exhausted"; after: AttachedEventTarget; duration?: number }
  | { type: "event"; event: "Exhausted"; before: AttachedEventTarget; duration?: number }
  | { type: "event"; event: "Move"; before: AttachedEventTarget; distance: number }
  | { type: "event"; event: "SelfHP"; before: AttachedEventTarget; currentHP: number; currentHPRatio?: number }
  | { type: "event"; event: "SelfHP"; before: AttachedEventTarget; currentHPRatio: number; currentHP?: number }
  | { type: "event"; event: "TakeDamage"; startTime: number; damage: number }
  // Accepted only at persistence/import boundaries and migrated to startTime.
  | { type: "event"; event: "TakeDamage"; before: AttachedEventTarget; damage: number }
  | { type: "event"; event: "HP"; before: AttachedEventTarget; targetHPRatio: number }
  | { type: "event"; event: "Qi"; before: AttachedEventTarget; targetQiRatio: number }
  | { type: "event"; event: "Qi"; after: AttachedEventTarget; targetQiRatio: number }
  | { type: "event"; event: "Buff"; before: AttachedEventTarget; buff: string; stack?: number }
  | { type: "event"; event: "Debuff"; before: AttachedEventTarget; debuff: string; stack?: number }
  | {
      type: "event";
      event: "MartialArt";
      before: AttachedEventTarget & { action: "start"; trigger?: undefined };
      martialArt: WeaponId;
    }
  | { type: "event"; event: "Delay"; duration: number }
  | { type: "event"; event: "Controlled" | "BattleEnd" | "ShieldBroken"; startTime: number; duration?: number }
  | { type: "event"; event: "Exhausted"; startTime: number; duration?: number }
  | { type: "event"; event: "Move"; startTime: number; distance: number };

export function isAttachmentAnchorStep(step: RotationStep | undefined): boolean {
  return Boolean(
    step && (step.type === "skill" || (step.type === "event" && step.event === "TakeDamage" && "startTime" in step)),
  );
}

export function canAnchorAttachedEvent(step: RotationStep | undefined, target: AttachedEventTarget): boolean {
  if (!step) return false;
  if (step.type === "skill") return true;
  return step.event === "TakeDamage" && "startTime" in step && target.trigger === undefined && target.action === 0;
}
export type RotationRecord = {
  name: string;
  steps: RotationStep[];
  targetHP?: number;
  start?: { step: number; action?: number };
  eventTimeReference?: "battleStart";
};
export type TrackedEffect = {
  name: string;
  expiresAt?: number;
  stack?: number;
  maxStack?: number;
  persistent?: boolean;
  sourceRowId?: string;
  collectBoostDamage?: string;
};
export type ResourceState = Record<string, number>;
export type InnerWayEffectRule = {
  requirement?: unknown;
  effect: EditableObject;
  trigger?: EditableObject;
  listen?: EditableObject;
  target?: string;
  modify?: EditableObject;
  source: string;
  tier: number;
};
export type TimelineRowKind = "rotation" | "trigger" | "dot" | "periodic";
export type TimelineRow = {
  id: string;
  kind: TimelineRowKind;
  sourceRowId?: string;
  triggerSource?: "skill" | "setup" | "innerWay";
  rotationIndex?: number;
  order: number;
  step: RotationStep;
  startTime: number;
  distance: number;
  currentHP: number;
  currentHPRatio: number;
  targetHPRatio: number;
  targetQiRatio: number;
  resources: ResourceState;
  currentMartialArt?: WeaponId;
  currentWeapon?: WeaponFamily;
  effectiveCastTime: number;
  skill?: SkillRecord;
  actions: EditableObject[];
  buffs: TrackedEffect[];
  debuffs: TrackedEffect[];
  modifierEffects: EditableObject[];
  actionSkillTags?: Record<number, string[]>;
  actionModifierEffects?: Record<number, EditableObject[]>;
  actionStates: Record<
    number,
    {
      buffs: TrackedEffect[];
      debuffs: TrackedEffect[];
      distance: number;
      currentHP: number;
      currentHPRatio: number;
      targetHPRatio: number;
      targetQiRatio: number;
      resources: ResourceState;
      currentMartialArt?: WeaponId;
      currentWeapon?: WeaponFamily;
    }
  >;
  skipped?: boolean;
};

function timelineRowsRepresentSameStep(left: TimelineRow, right: TimelineRow) {
  if (left.kind !== right.kind || left.step.type !== right.step.type) return false;
  switch (left.step.type) {
    case "skill":
      return right.step.type === "skill" && left.step.skill === right.step.skill;
    case "event":
      return right.step.type === "event" && left.step.event === right.step.event;
  }
}

export function mergeCalculatedTargetHPState(structuralTimeline: TimelineRow[], calculatedTimeline?: TimelineRow[]) {
  if (!calculatedTimeline) return structuralTimeline;
  const calculatedRows = new Map(calculatedTimeline.map((row) => [row.id, row]));
  return structuralTimeline.map((row) => {
    const calculatedRow = calculatedRows.get(row.id);
    if (!calculatedRow || !timelineRowsRepresentSameStep(row, calculatedRow)) return row;
    const actionStates = Object.fromEntries(
      Object.entries(row.actionStates).map(([actionIndex, state]) => {
        const calculatedState = calculatedRow.actionStates[Number(actionIndex)];
        return [actionIndex, calculatedState ? { ...state, targetHPRatio: calculatedState.targetHPRatio } : state];
      }),
    );
    return { ...row, targetHPRatio: calculatedRow.targetHPRatio, actionStates };
  });
}

export type EffectDefinition = {
  name?: string;
  shortName?: string;
  description?: string;
  refresh?: boolean;
  duration?: number;
  cooldown?: number;
  maxStack?: number;
  effect?: unknown[];
  stackEffects?: unknown[][];
  action?: unknown[];
  periodic?: PeriodicEffect;
};

function boostDamageCollection(
  skill: SkillRecord | undefined,
  effectName: string,
  activeEffects: TrackedEffect[],
  fallbackSourceRowId: string,
) {
  if (typeof skill?.collectBoostDamage === "string") {
    return { sourceRowId: fallbackSourceRowId, collectBoostDamage: skill.collectBoostDamage };
  }
  const inheritedSource = activeEffects.find(
    (effect) => effect.collectBoostDamage === effectName && effect.sourceRowId,
  );
  return inheritedSource
    ? { sourceRowId: inheritedSource.sourceRowId ?? fallbackSourceRowId, collectBoostDamage: effectName }
    : { sourceRowId: fallbackSourceRowId };
}

export type TimelineBuildInput = {
  rotation: RotationRecord;
  skills: Record<string, SkillRecord>;
  eventDefinitions: Record<string, SkillRecord>;
  dots: Record<string, SkillRecord>;
  effectDefinitions: Record<string, EffectDefinition>;
  innerWayConditions: string[];
  innerWayRules: InnerWayEffectRule[];
  setupEffects: EditableObject[];
  weapons: WeaponId[];
  martialArtState?: Partial<Record<WeaponId, { weapon: WeaponFamily }>>;
  initialBuffs?: TrackedEffect[];
  initialDebuffs?: TrackedEffect[];
  initialResources?: ResourceState;
  resourceRegeneration?: ResourceState;
  resourceMaximums?: ResourceState;
  maxHP?: number;
};

export type RequirementState = {
  selfHPPercentage?: number;
  targetHPPercentage?: number;
  targetQiPercentage?: number;
  skillCooldowns?: Record<string, number>;
  currentTime?: number;
  currentMartialArt?: WeaponId;
  currentWeapon?: WeaponFamily;
};

export const TIMELINE_TIME_EPSILON = 1e-4;

export function compareTimelineTime(left: number, right: number): number {
  const difference = left - right;
  return Math.abs(difference) <= TIMELINE_TIME_EPSILON ? 0 : difference;
}

export function mergeEffectDefinition(definition: EffectDefinition, modify: EditableObject): EffectDefinition {
  const appendedEffects = Array.isArray(modify.effect)
    ? [...(Array.isArray(definition.effect) ? definition.effect : []), ...modify.effect]
    : definition.effect;
  return {
    ...definition,
    ...modify,
    ...(appendedEffects === undefined ? {} : { effect: appendedEffects }),
    ...(definition.periodic || modify.periodic
      ? {
          periodic: {
            ...(definition.periodic ?? {}),
            ...(modify.periodic && typeof modify.periodic === "object" && !Array.isArray(modify.periodic)
              ? (modify.periodic as PeriodicEffect)
              : {}),
          },
        }
      : {}),
  };
}

export function requirementsPass(
  requirement: unknown,
  buffs: TrackedEffect[],
  debuffs: TrackedEffect[],
  skillTags: string[],
  innerWayConditions: Set<string>,
  weapons: WeaponId[] = [],
  resources: ResourceState = {},
  state: RequirementState = {},
): boolean {
  if (!Array.isArray(requirement)) return true;
  const hasEffect = (target: unknown, value: unknown, requiredStack?: unknown) => {
    if (typeof value !== "string") return false;
    switch (target) {
      case "skillTag":
      case "martialArt":
        return skillTags.includes(value);
      case "equippedMartialArt":
        return weapons.includes(value as WeaponId);
      case "currentMartialArt":
        return state.currentMartialArt === value;
      case "currentWeapon":
        return state.currentWeapon === value;
      default:
        break;
    }
    const trackedEffect = (target === "target" ? debuffs : buffs).find((effect) => effect.name === value);
    if (requiredStack === "max")
      return Boolean(trackedEffect?.maxStack !== undefined && (trackedEffect.stack ?? 0) >= trackedEffect.maxStack);
    if (typeof requiredStack === "number") return Boolean(trackedEffect && (trackedEffect.stack ?? 0) >= requiredStack);
    if (target === "target") return Boolean(trackedEffect);
    return Boolean(trackedEffect) || innerWayConditions.has(value);
  };
  const evaluate = (condition: unknown): boolean => {
    if (Array.isArray(condition)) return condition.every(evaluate);
    if (!condition || typeof condition !== "object") return false;
    const item = condition as EditableObject;
    if (item.operator === "or" && Array.isArray(item.operand)) return item.operand.some(evaluate);
    if (item.operator === "not" && Array.isArray(item.operand) && item.operand.length === 1)
      return !evaluate(item.operand[0]);
    if (item.target === "skillCooldown") {
      if (typeof item.value !== "string" || item.comparison !== "ready") return false;
      return (state.skillCooldowns?.[`skill:${item.value}`] ?? 0) <= (state.currentTime ?? 0);
    }
    if (
      item.target === "resource" ||
      item.target === "selfHPPercentage" ||
      item.target === "targetHPPercentage" ||
      item.target === "targetQiPercentage"
    ) {
      let current = 0;
      switch (item.target) {
        case "resource":
          current = typeof item.value === "string" ? (resources[item.value] ?? 0) : 0;
          break;
        case "selfHPPercentage":
          current = state.selfHPPercentage ?? 100;
          break;
        case "targetHPPercentage":
          current = state.targetHPPercentage ?? 100;
          break;
        case "targetQiPercentage":
          current = state.targetQiPercentage ?? 100;
          break;
      }
      if (typeof item.amount !== "number" || !Number.isFinite(item.amount)) return false;
      switch (item.comparison) {
        case ">=":
          return current >= item.amount;
        case ">":
          return current > item.amount;
        case "<=":
          return current <= item.amount;
        case "<":
          return current < item.amount;
        case "==":
          return current === item.amount;
        case "!=":
          return current !== item.amount;
        default:
          return false;
      }
    }
    return hasEffect(item.target, item.value, item.stack);
  };
  return requirement.every(evaluate);
}

function applyTrackedEffect(
  effects: TrackedEffect[],
  name: string,
  stack: number | undefined,
  duration: number | undefined,
  time: number,
  maxStackOverride?: number,
  refresh = true,
  sourceRowId?: string,
  collectBoostDamage?: string,
) {
  const existing = effects.find((effect) => effect.name === name);
  const nextStack = Math.min(maxStackOverride ?? Number.POSITIVE_INFINITY, (existing?.stack ?? 0) + (stack ?? 1));
  const persistent = existing?.persistent === true;
  const expiresAt =
    persistent || duration === undefined ? undefined : existing && !refresh ? existing.expiresAt : time + duration;
  const nextEffect: TrackedEffect = {
    name,
    stack: nextStack,
    maxStack: maxStackOverride,
    expiresAt,
    ...(persistent ? { persistent: true } : {}),
    ...(sourceRowId ? { sourceRowId } : existing?.sourceRowId ? { sourceRowId: existing.sourceRowId } : {}),
    ...(collectBoostDamage
      ? { collectBoostDamage }
      : existing?.collectBoostDamage
        ? { collectBoostDamage: existing.collectBoostDamage }
        : {}),
  };
  return [...effects.filter((effect) => effect.name !== name), nextEffect];
}

function extendTrackedEffect(effects: TrackedEffect[], name: string, duration: number, time: number) {
  return effects.map((effect) =>
    effect.name !== name || effect.expiresAt === undefined || effect.expiresAt <= time
      ? effect
      : { ...effect, expiresAt: effect.expiresAt + duration },
  );
}

function consumeTrackedEffect(effects: TrackedEffect[], name: string, stack: number | "all" | undefined) {
  if (stack === "all") return effects.filter((effect) => effect.name !== name);
  const amount = Math.max(1, stack ?? 1);
  return effects.flatMap((effect) => {
    if (effect.name !== name || effect.persistent) return [effect];
    const remaining = (effect.stack ?? 1) - amount;
    return remaining > 0 ? [{ ...effect, stack: remaining }] : [];
  });
}

function resolveCastModifierEffect(effect: EditableObject, buffs: TrackedEffect[], debuffs: TrackedEffect[]) {
  return Object.fromEntries(
    Object.entries(effect).map(([field, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [field, value];
      const dynamicValue = value as EditableObject;
      if (
        dynamicValue.function !== "byStack" ||
        typeof dynamicValue.param1 !== "string" ||
        typeof dynamicValue.param2 !== "number"
      )
        return [field, value];
      const trackedEffects = dynamicValue.target === "target" ? debuffs : buffs;
      const stack = trackedEffects.find((trackedEffect) => trackedEffect.name === dynamicValue.param1)?.stack ?? 0;
      return [field, stack * dynamicValue.param2];
    }),
  );
}

function buildRotationTimelinePass(input: TimelineBuildInput, resolvedAnchorTime?: number): TimelineRow[] {
  type TimelineEvent = {
    time: number;
    sortOrder: number[];
    kind: "start" | "subActionStart" | "action";
    row: TimelineRow;
    actionIndex?: number;
    subActionIndex?: number;
    expiresEffect?: { target: "self" | "target"; name: string; expiresAt: number };
  };
  const compareSortOrder = (left: number[], right: number[]) => {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
  };
  const { rotation, skills, eventDefinitions, dots, effectDefinitions, innerWayRules, setupEffects, weapons } = input;
  const isSequentialStep = (step: RotationStep) => step.type === "skill" || step.event === "Delay";
  type ExpandedSkillSegment = {
    skillId: string;
    skill: SkillRecord;
    reference?: SubActionReference;
    baseCastTime: number;
    baseStartOffset: number;
    actionIndexes: number[];
    localActionTimes: number[];
  };
  const expandSkill = (skillId: string) => {
    const root = skills[skillId];
    const segments: ExpandedSkillSegment[] = [];
    const actions: EditableObject[] = [];
    let castTime = 0;
    const normalizeSubAction = (value: string | SubActionReference): SubActionReference =>
      typeof value === "string" ? { value } : value;
    const append = (currentSkillId: string, ancestry: Set<string>, reference?: SubActionReference) => {
      if (ancestry.has(currentSkillId)) return;
      const skill = skills[currentSkillId];
      if (!skill) return;
      const baseCastTime = typeof skill.castTime === "number" ? skill.castTime : 0;
      const baseActions = Array.isArray(skill.action) ? (skill.action as EditableObject[]) : [];
      const fallbackActions = reference?.fallback
        ? Array.isArray(skills[reference.fallback]?.action)
          ? (skills[reference.fallback].action as EditableObject[])
          : []
        : [];
      const actionSlotCount = Math.max(baseActions.length, fallbackActions.length);
      const actionIndexes = Array.from({ length: actionSlotCount }, (_, localIndex) => {
        const action = baseActions[localIndex];
        const actionIndex = actions.length;
        actions.push(
          action
            ? { ...action, time: castTime + (typeof action.time === "number" ? action.time : 0) }
            : { type: "inactive", time: castTime + baseCastTime },
        );
        return actionIndex;
      });
      segments.push({
        skillId: currentSkillId,
        skill,
        reference,
        baseCastTime,
        baseStartOffset: castTime,
        actionIndexes,
        localActionTimes: Array.from({ length: actionSlotCount }, (_, localIndex) => {
          const action = baseActions[localIndex];
          return action && typeof action.time === "number" ? action.time : baseCastTime;
        }),
      });
      castTime += baseCastTime;
      const nextAncestry = new Set(ancestry).add(currentSkillId);
      if (Array.isArray(skill.subAction))
        skill.subAction.forEach((entry) => {
          const subAction = normalizeSubAction(entry);
          append(subAction.value, nextAncestry, subAction);
        });
    };
    append(skillId, new Set());
    return { skill: root, actions, segments, castTime, isMultiAction: Boolean(root?.subAction?.length) };
  };
  const sequentialCastTime = (step: RotationStep) =>
    step.type === "skill"
      ? expandSkill(step.skill ?? "").castTime
      : step.event === "Delay"
        ? Math.max(0, step.duration)
        : 0;
  const innerWayConditions = new Set(input.innerWayConditions);
  const rows: TimelineRow[] = [];
  const events: TimelineEvent[] = [];
  const attachedEvent = (step: RotationStep) => {
    if (step.type !== "event") return undefined;
    if (
      (step.event === "Move" ||
        step.event === "SelfHP" ||
        step.event === "TakeDamage" ||
        step.event === "HP" ||
        step.event === "Qi" ||
        step.event === "Buff" ||
        step.event === "Debuff" ||
        step.event === "MartialArt") &&
      "before" in step
    )
      return { target: step.before, placement: "before" as const };
    if (step.event === "Qi" && "after" in step) return { target: step.after, placement: "after" as const };
    if (step.event === "Exhausted") {
      if ("after" in step) return { target: step.after, placement: "after" as const };
      if ("before" in step) return { target: step.before, placement: "after" as const };
    }
    return undefined;
  };
  const startStepIndex = rotation.start?.step ?? 0;
  const initialAnchorTime = (() => {
    let time = 0;
    for (const [stepIndex, step] of rotation.steps.entries()) {
      if (stepIndex === startStepIndex) {
        if (step.type !== "skill") return time;
        const expanded = expandSkill(step.skill ?? "");
        const actionIndex = rotation.start?.action;
        return time + (actionIndex === undefined ? 0 : Number(expanded.actions[actionIndex]?.time ?? 0));
      }
      if (isSequentialStep(step)) time += sequentialCastTime(step);
    }
    return 0;
  })();
  const multiActionSegments = new Map<
    string,
    Array<ExpandedSkillSegment & { startOffset: number; effectiveCastTime: number }>
  >();
  let elapsed = 0;
  for (const [rowIndex, step] of rotation.steps.entries()) {
    const expandedSkill = step.type === "skill" ? expandSkill(step.skill ?? "") : undefined;
    const skill = expandedSkill?.skill ?? (step.type === "event" ? eventDefinitions[step.event] : undefined);
    const castTime = expandedSkill?.castTime ?? sequentialCastTime(step);
    const startTime =
      step.type === "event"
        ? step.event === "Delay"
          ? elapsed
          : "startTime" in step
            ? step.startTime +
              (rotation.eventTimeReference === "battleStart" ? (resolvedAnchorTime ?? initialAnchorTime) : 0)
            : 0
        : elapsed;
    const sourceActions = expandedSkill?.isMultiAction
      ? expandedSkill.actions
      : Array.isArray(skill?.action)
        ? (skill.action as EditableObject[])
        : [];
    const actions: EditableObject[] = sourceActions.map((action) => ({
      ...action,
      ...(step.type === "event" &&
      (step.event === "Controlled" || step.event === "Exhausted") &&
      action.type === "apply" &&
      step.duration !== undefined
        ? { duration: step.duration }
        : {}),
      ...(step.type === "event" && step.event === "Move" && action.type === "move" ? { distance: step.distance } : {}),
      ...(step.type === "event" && step.event === "SelfHP" && action.type === "setHP"
        ? "currentHP" in step && typeof step.currentHP === "number"
          ? { currentHP: step.currentHP }
          : { currentHPRatio: step.currentHPRatio }
        : {}),
      ...(step.type === "event" && step.event === "TakeDamage" && action.type === "takeDamage"
        ? { damage: step.damage }
        : {}),
      ...(step.type === "event" && step.event === "HP" && action.type === "setTargetHP"
        ? { targetHPRatio: step.targetHPRatio }
        : {}),
      ...(step.type === "event" && step.event === "Qi" && action.type === "setQi"
        ? { targetQiRatio: step.targetQiRatio }
        : {}),
      ...(step.type === "event" && step.event === "Buff" && action.type === "apply"
        ? { value: step.buff, stack: step.stack ?? 1 }
        : {}),
      ...(step.type === "event" && step.event === "Debuff" && action.type === "apply"
        ? { value: step.debuff, stack: step.stack ?? 1 }
        : {}),
      ...(step.type === "event" && step.event === "MartialArt" && action.type === "switchMartialArt"
        ? { martialArt: step.martialArt }
        : {}),
    }));
    // Fixed-time and Move events resolve before other rows at an equal timestamp.
    // After-action Qi attachments receive a causal order after their target action below.
    const rowOrder = step.type === "event" ? -((rotation.steps.length - rowIndex) * 1000) : rowIndex * 1000;
    const sortPrefix = step.type === "event" ? [-1, rowIndex] : [0, rowIndex];
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
      effectiveCastTime: castTime,
      skill,
      actions,
      buffs: [],
      debuffs: [],
      modifierEffects: [],
      actionStates: {},
    };
    rows.push(row);
    if (expandedSkill?.isMultiAction)
      multiActionSegments.set(
        row.id,
        expandedSkill.segments.map((segment) => ({
          ...segment,
          startOffset: segment.baseStartOffset,
          effectiveCastTime: segment.baseCastTime,
        })),
      );
    if (!attachedEvent(step)) {
      events.push({ time: startTime, sortOrder: [...sortPrefix, 0], kind: "start", row });
      multiActionSegments.get(row.id)?.forEach((segment, subActionIndex) =>
        events.push({
          time: startTime + segment.startOffset,
          sortOrder: [...sortPrefix, 1, segment.actionIndexes[0] ?? actions.length, -1, subActionIndex],
          kind: "subActionStart",
          row,
          subActionIndex,
        }),
      );
      actions.forEach((action, actionIndex) =>
        events.push({
          time: startTime + (typeof action.time === "number" ? action.time : 0),
          sortOrder: [...sortPrefix, 1, actionIndex, 0],
          kind: "action",
          row,
          actionIndex,
        }),
      );
    }
    if (isSequentialStep(step)) elapsed += castTime;
  }

  type ResolvedAttachment = { eventRow: TimelineRow; target: AttachedEventTarget; placement: "before" | "after" };
  const directAttachments = new Map<string, ResolvedAttachment[]>();
  const triggeredAttachments = new Map<string, ResolvedAttachment[]>();
  const queueAttachedEvent = (
    attachment: ResolvedAttachment,
    targetTime: number,
    targetSortOrder: number[],
    targetDisplayOrder: number,
  ) => {
    const { eventRow } = attachment;
    eventRow.startTime = targetTime;
    if (attachment.placement === "after") eventRow.order = targetDisplayOrder + 0.5;
    const prefix = attachment.placement === "before" ? [-1, eventRow.rotationIndex ?? 0] : [...targetSortOrder, 1];
    events.push({ time: targetTime, sortOrder: [...prefix, 0], kind: "start", row: eventRow });
    eventRow.actions.forEach((action, actionIndex) =>
      events.push({
        time: targetTime + Number(action.time ?? 0),
        sortOrder: [...prefix, 1, actionIndex],
        kind: "action",
        row: eventRow,
        actionIndex,
      }),
    );
  };
  rows.forEach((eventRow) => {
    const resolved = attachedEvent(eventRow.step);
    if (!resolved) return;
    const targetRow = rows.find(
      (candidate) =>
        candidate.kind === "rotation" &&
        canAnchorAttachedEvent(candidate.step, resolved.target) &&
        (candidate.rotationIndex ?? -1) > (eventRow.rotationIndex ?? -1),
    );
    if (!targetRow) {
      eventRow.skipped = true;
      return;
    }
    eventRow.sourceRowId = targetRow.id;
    const attachment = { eventRow, ...resolved };
    const collection = attachment.target.trigger === undefined ? directAttachments : triggeredAttachments;
    collection.set(targetRow.id, [...(collection.get(targetRow.id) ?? []), attachment]);
    if (attachment.target.trigger !== undefined) return;
    const targetTime =
      attachment.target.action === "start"
        ? targetRow.startTime
        : targetRow.startTime + Number(targetRow.actions[attachment.target.action]?.time ?? 0);
    const targetSortOrder =
      attachment.target.action === "start"
        ? [0, targetRow.rotationIndex ?? 0, 0]
        : [0, targetRow.rotationIndex ?? 0, 1, attachment.target.action, 0];
    const targetDisplayOrder =
      attachment.target.action === "start" ? targetRow.order : targetRow.order + 10 + attachment.target.action;
    queueAttachedEvent(attachment, targetTime, targetSortOrder, targetDisplayOrder);
  });

  const shiftRotationRowAndAttachments = (targetRow: TimelineRow, shift: number) => {
    targetRow.startTime += shift;
    const attachedRows = new Set((directAttachments.get(targetRow.id) ?? []).map(({ eventRow }) => eventRow));
    attachedRows.forEach((eventRow) => {
      eventRow.startTime += shift;
    });
    events.forEach((queued) => {
      if (queued.row === targetRow || attachedRows.has(queued.row)) queued.time += shift;
    });
  };

  let buffs: TrackedEffect[] = (input.initialBuffs ?? []).map((effect) => ({
    ...effect,
    persistent: true,
    expiresAt: undefined,
  }));
  let debuffs: TrackedEffect[] = (input.initialDebuffs ?? []).map((effect) => ({
    ...effect,
    persistent: true,
    expiresAt: undefined,
  }));
  let distance = 1;
  const maxHP = Math.max(0, input.maxHP ?? 1);
  let currentHP = maxHP;
  let currentHPRatio = maxHP > 0 ? 1 : 0;
  const setCurrentHP = (value: number) => {
    currentHP = Math.min(maxHP, Math.max(0, value));
    currentHPRatio = maxHP > 0 ? currentHP / maxHP : 0;
  };
  let targetHPRatio = 1;
  let targetQiRatio = 1;
  let currentMartialArt = weapons[0];
  let currentWeapon = currentMartialArt ? input.martialArtState?.[currentMartialArt]?.weapon : undefined;
  const resourceMaximums = Object.fromEntries(
    Object.entries(input.resourceMaximums ?? {}).filter(
      ([, maximum]) => typeof maximum === "number" && Number.isFinite(maximum) && maximum >= 0,
    ),
  );
  const clampResource = (name: string, value: number) =>
    Math.min(resourceMaximums[name] ?? Number.POSITIVE_INFINITY, Math.max(0, Math.round(value * 1e9) / 1e9));
  let resources: ResourceState = Object.fromEntries(
    Object.entries({ Qi: 100, ...(input.initialResources ?? {}) }).map(([name, value]) => [
      name,
      clampResource(name, value),
    ]),
  );
  const resourceRegeneration = Object.fromEntries(
    Object.entries(input.resourceRegeneration ?? {}).filter(
      ([, rate]) => typeof rate === "number" && Number.isFinite(rate) && rate > 0,
    ),
  );
  // Pre-fight actions can change resources, but passive regeneration begins only
  // when combat starts. The converged pass supplies the exact resolved anchor.
  let lastResourceRegenerationTime = resolvedAnchorTime ?? initialAnchorTime;
  const regenerateResources = (time: number) => {
    const elapsed = Math.max(0, time - lastResourceRegenerationTime);
    if (elapsed > 0) {
      resources = Object.entries(resourceRegeneration).reduce(
        (next, [name, rate]) => ({
          ...next,
          [name]: clampResource(name, (next[name] ?? 0) + rate * elapsed),
        }),
        resources,
      );
    }
    lastResourceRegenerationTime = Math.max(lastResourceRegenerationTime, time);
  };
  const cooldowns: Record<string, number> = {};
  let currentTimelineTime = 0;
  const requirementState = (): RequirementState => ({
    selfHPPercentage: currentHPRatio * 100,
    targetHPPercentage: targetHPRatio * 100,
    targetQiPercentage: targetQiRatio * 100,
    skillCooldowns: cooldowns,
    currentTime: currentTimelineTime,
    currentMartialArt,
    currentWeapon,
  });
  const prune = (effects: TrackedEffect[], time: number) =>
    effects.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > time);
  const getModifiedEffectDefinition = (
    name: string,
    currentBuffs: TrackedEffect[],
    currentDebuffs: TrackedEffect[],
    skillTags: string[],
  ) => {
    const setupModifiers = setupEffects
      .filter(
        (effect) =>
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
      .map((effect) => effect.modify as EditableObject);
    const innerWayModifiers = innerWayRules
      .filter(
        (rule) =>
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
      .map((rule) => rule.modify!);
    return [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, {
      ...(effectDefinitions[name] ?? {}),
    });
  };
  let nextDerivedOrder = rotation.steps.length * 1000 + 1;
  type ActivePeriodicEffect = {
    definition: EffectDefinition;
    appliedAt: number;
    expiresAt: number;
    sourceRowId: string;
    rows: TimelineRow[];
  };
  const activePeriodicEffects: Record<string, ActivePeriodicEffect> = {};
  const periodicEffectKey = (target: "self" | "target", name: string) => `${target}:${name}`;
  const removePendingPeriodicRows = (
    activeEffect: ActivePeriodicEffect,
    afterTime: number,
    includeRowsAtTime = false,
  ) => {
    const pendingRows = new Set(
      activeEffect.rows.filter(
        (row) =>
          (row.startTime > afterTime + 1e-6 || (includeRowsAtTime && Math.abs(row.startTime - afterTime) <= 1e-6)) &&
          Object.keys(row.actionStates).length === 0,
      ),
    );
    if (pendingRows.size === 0) return;
    activeEffect.rows = activeEffect.rows.filter((row) => !pendingRows.has(row));
    for (let index = rows.length - 1; index >= 0; index -= 1) if (pendingRows.has(rows[index])) rows.splice(index, 1);
    for (let index = events.length - 1; index >= 0; index -= 1)
      if (pendingRows.has(events[index].row)) events.splice(index, 1);
  };
  const schedulePeriodicActions = (
    name: string,
    activeEffect: ActivePeriodicEffect,
    afterTime: number,
    causalSortOrder: number[],
    sourceOrder: number,
    includeCurrentTime = false,
  ) => {
    const periodic = activeEffect.definition.periodic;
    const interval = typeof periodic?.interval === "number" && periodic.interval > 0 ? periodic.interval : undefined;
    const firstTick =
      typeof periodic?.firstTick === "number" && periodic.firstTick >= 0 ? periodic.firstTick : interval;
    const baseActions = Array.isArray(periodic?.action) ? (periodic.action as EditableObject[]) : [];
    if (!interval || firstTick === undefined || baseActions.length === 0) return;
    const isDot = Boolean(dots[name]);
    const rowSkill = (dots[name] ?? effectDefinitions[name]) as SkillRecord | undefined;
    for (let tickIndex = 0; ; tickIndex += 1) {
      const tickTime = activeEffect.appliedAt + firstTick + tickIndex * interval;
      if (tickTime > activeEffect.expiresAt + 1e-6) break;
      if (tickTime < afterTime - 1e-6 || (!includeCurrentTime && Math.abs(tickTime - afterTime) <= 1e-6)) continue;
      const derivedId = nextDerivedOrder++;
      const derivedSortOrder = [...causalSortOrder, derivedId];
      const actions = baseActions.map((action) => ({ ...action, time: 0 }));
      const row: TimelineRow = {
        id: `${isDot ? "dot" : "periodic"}-${derivedId}`,
        kind: isDot ? "dot" : "periodic",
        sourceRowId: activeEffect.sourceRowId,
        order: sourceOrder + 10 + tickIndex / 1000,
        step: { type: "skill", skill: name },
        startTime: tickTime,
        distance,
        currentHP,
        currentHPRatio,
        targetHPRatio,
        targetQiRatio,
        resources: { ...resources },
        currentMartialArt,
        currentWeapon,
        effectiveCastTime: 0,
        skill: rowSkill,
        actions,
        buffs: [],
        debuffs: [],
        modifierEffects: [],
        actionStates: {},
      };
      activeEffect.rows.push(row);
      rows.push(row);
      events.push({ time: tickTime, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
      actions.forEach((_action, actionIndex) =>
        events.push({
          time: tickTime,
          sortOrder: [...derivedSortOrder, 1, actionIndex],
          kind: "action",
          row,
          actionIndex,
        }),
      );
    }
  };
  const transferAndReschedulePeriodicEffect = (
    name: string,
    target: "self" | "target",
    definition: EffectDefinition,
    expiresAt: number,
    eventTime: number,
    sourceRowId: string,
    causalSortOrder: number[],
    sourceOrder: number,
    resetCadence = false,
  ) => {
    const activeEffect = activePeriodicEffects[periodicEffectKey(target, name)];
    if (!activeEffect) return;
    removePendingPeriodicRows(activeEffect, eventTime);
    activeEffect.definition = definition;
    activeEffect.expiresAt = expiresAt;
    activeEffect.sourceRowId = sourceRowId;
    if (resetCadence) activeEffect.appliedAt = eventTime;
    schedulePeriodicActions(name, activeEffect, eventTime, causalSortOrder, sourceOrder, resetCadence);
  };
  const enqueueEffectActions = (
    name: string,
    definition: EffectDefinition,
    eventTime: number,
    sourceRowId: string,
    causalSortOrder: number[],
    sourceOrder: number,
    target: "self" | "target",
    expiresAt?: number,
  ) => {
    const actions = Array.isArray(definition.action) ? (definition.action as EditableObject[]) : [];
    if (actions.length === 0) return;
    const derivedId = nextDerivedOrder++;
    const derivedSortOrder = [...causalSortOrder, derivedId];
    const row: TimelineRow = {
      id: `effect-${derivedId}`,
      kind: "periodic",
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
      currentMartialArt,
      currentWeapon,
      effectiveCastTime: 0,
      skill: definition,
      actions: actions.map((action) => ({ ...action })),
      buffs: [],
      debuffs: [],
      modifierEffects: [],
      actionStates: {},
    };
    rows.push(row);
    events.push({ time: eventTime, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
    row.actions.forEach((action, actionIndex) => {
      if (action.time === "expire" && expiresAt === undefined) return;
      events.push({
        time: action.time === "expire" ? expiresAt! : eventTime + (typeof action.time === "number" ? action.time : 0),
        sortOrder: [...derivedSortOrder, 1, actionIndex],
        kind: "action",
        row,
        actionIndex,
        ...(action.time === "expire" ? { expiresEffect: { target, name, expiresAt: expiresAt! } } : {}),
      });
    });
  };
  let processedEvents = 0;
  const startResolvedActionValues = new Map<string, unknown>();
  const startResolvedActionRequirements = new Map<string, boolean>();
  const actionResolutionKey = (row: TimelineRow, actionIndex: number) => `${row.id}:${actionIndex}`;
  const resolveStartBoundActionValues = (row: TimelineRow, actionIndexes: number[]) => {
    actionIndexes.forEach((actionIndex) => {
      const action = row.actions[actionIndex];
      const requirementObject =
        action?.requirement && typeof action.requirement === "object" && !Array.isArray(action.requirement)
          ? (action.requirement as EditableObject)
          : undefined;
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
        );
      const valueObject =
        action?.value && typeof action.value === "object" && !Array.isArray(action.value)
          ? (action.value as EditableObject)
          : undefined;
      if (valueObject?.operator !== "first" || valueObject.resolveAt !== "skillStart") return;
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const resolvedValue = Array.isArray(valueObject.operand)
        ? valueObject.operand.find(
            (candidate) => typeof candidate === "string" && targetEffects.some((effect) => effect.name === candidate),
          )
        : undefined;
      startResolvedActionValues.set(actionResolutionKey(row, actionIndex), resolvedValue);
    });
  };
  const syncDirectAttachments = (row: TimelineRow) => {
    (directAttachments.get(row.id) ?? []).forEach((attachment) => {
      const targetTime =
        attachment.target.action === "start"
          ? row.startTime
          : row.startTime + Number(row.actions[attachment.target.action]?.time ?? 0);
      attachment.eventRow.startTime = targetTime;
      events.forEach((queued) => {
        if (queued.row !== attachment.eventRow) return;
        queued.time =
          targetTime +
          (queued.kind === "action" ? Number(attachment.eventRow.actions[queued.actionIndex ?? -1]?.time ?? 0) : 0);
      });
    });
  };
  const applyCastTimingModifiers = (row: TimelineRow, baseCastTime: number) => {
    const timingValue = (value: unknown, actionTime: number, fallback: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? value
        : (resolveSegmentValue(value, { actionTime }) ?? fallback);
    const adjust = (time: number) => {
      const modifier = row.modifierEffects.reduce(
        (total, effect) => total + timingValue(effect.castTimeModifier, time, 0),
        0,
      );
      const multiplier = row.modifierEffects.reduce(
        (total, effect) => total * timingValue(effect.castTimeMultiplier, time, 1),
        1,
      );
      return Math.max(0, time + modifier) * multiplier;
    };
    row.effectiveCastTime = adjust(baseCastTime);
    row.actions = row.actions.map((action) => ({
      ...action,
      ...(typeof action.time === "number" ? { time: adjust(action.time) } : {}),
    }));
    events.forEach((queued) => {
      if (queued.row === row && queued.kind === "action")
        queued.time =
          queued.expiresEffect?.expiresAt ??
          row.startTime +
            (typeof row.actions[queued.actionIndex ?? -1]?.time === "number"
              ? (row.actions[queued.actionIndex ?? -1].time as number)
              : 0);
    });
    syncDirectAttachments(row);
    return row.effectiveCastTime;
  };

  while (events.length && processedEvents < 2000) {
    const queueStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
    events.sort(
      (left, right) => compareTimelineTime(left.time, right.time) || compareSortOrder(left.sortOrder, right.sortOrder),
    );
    const event = events.shift()!;
    if (import.meta.env.DEV) finishCalculationPhase("timelineQueueOrdering", queueStartedAt);
    processedEvents += 1;
    currentTimelineTime = event.time;
    regenerateResources(event.time);
    if (event.expiresEffect) {
      const targetEffects = event.expiresEffect.target === "target" ? debuffs : buffs;
      const current = targetEffects.find((effect) => effect.name === event.expiresEffect!.name);
      if (current?.expiresAt !== event.expiresEffect.expiresAt) continue;
    }
    buffs = prune(buffs, event.time);
    debuffs = prune(debuffs, event.time);
    if (event.kind === "subActionStart") {
      const segments = multiActionSegments.get(event.row.id);
      const segment = segments?.[event.subActionIndex ?? -1];
      if (!segment) continue;
      const modifiersFor = (skill: SkillRecord) => {
        const tags = skill.tags ?? [];
        return Array.isArray(skill.modifier)
          ? (skill.modifier as EditableObject[])
              .filter((item) =>
                requirementsPass(
                  item.requirement,
                  buffs,
                  debuffs,
                  tags,
                  innerWayConditions,
                  weapons,
                  resources,
                  requirementState(),
                ),
              )
              .map((item) =>
                item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
                  ? resolveCastModifierEffect(item.effect as EditableObject, buffs, debuffs)
                  : {},
              )
          : [];
      };
      const reference = segment.reference;
      const primaryPasses =
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
        );
      const selectedId = reference ? (primaryPasses ? reference.value : reference.fallback) : segment.skillId;
      const selectedSkill = selectedId ? skills[selectedId] : undefined;
      const selectedActions = Array.isArray(selectedSkill?.action) ? (selectedSkill.action as EditableObject[]) : [];
      const segmentStartOffset = event.time - event.row.startTime;
      segment.skillId = selectedId ?? segment.skillId;
      segment.skill = selectedSkill ?? { name: "Inactive sub-action", castTime: 0, action: [], tags: ["SubAction"] };
      segment.baseCastTime = typeof selectedSkill?.castTime === "number" ? selectedSkill.castTime : 0;
      segment.localActionTimes = segment.actionIndexes.map((_, localIndex) => {
        const action = selectedActions[localIndex];
        return action && typeof action.time === "number" ? action.time : segment.baseCastTime;
      });
      segment.actionIndexes.forEach((actionIndex, localIndex) => {
        const selectedAction = selectedActions[localIndex];
        event.row.actions[actionIndex] = selectedAction
          ? { ...selectedAction, time: segmentStartOffset + segment.localActionTimes[localIndex] }
          : { type: "inactive", time: segmentStartOffset + segment.baseCastTime };
      });
      if (selectedId && typeof selectedSkill?.cooldown === "number")
        cooldowns[`skill:${selectedId}`] = event.time + selectedSkill.cooldown;
      const inactiveActionIndexes = new Set(segment.actionIndexes.slice(selectedActions.length));
      (directAttachments.get(event.row.id) ?? []).forEach(({ eventRow, target }) => {
        if (typeof target.action !== "number" || !inactiveActionIndexes.has(target.action)) return;
        eventRow.skipped = true;
        for (let index = events.length - 1; index >= 0; index -= 1)
          if (events[index].row === eventRow) events.splice(index, 1);
      });
      const skillTags = segment.skill.tags ?? [];
      event.row.actionSkillTags ??= {};
      segment.actionIndexes.forEach((actionIndex) => {
        event.row.actionSkillTags![actionIndex] = skillTags;
      });
      resolveStartBoundActionValues(event.row, segment.actionIndexes);
      const modifiers = modifiersFor(segment.skill);
      const timingValue = (value: unknown, actionTime: number, fallback: number) =>
        typeof value === "number" && Number.isFinite(value)
          ? value
          : (resolveSegmentValue(value, { actionTime }) ?? fallback);
      const adjust = (time: number) => {
        const modifier = modifiers.reduce((total, effect) => total + timingValue(effect.castTimeModifier, time, 0), 0);
        const multiplier = modifiers.reduce(
          (total, effect) => total * timingValue(effect.castTimeMultiplier, time, 1),
          1,
        );
        return Math.max(0, time + modifier) * multiplier;
      };
      event.row.actionModifierEffects ??= {};
      segment.actionIndexes.forEach((actionIndex, localIndex) => {
        const actionTime = segmentStartOffset + adjust(segment.localActionTimes[localIndex] ?? 0);
        event.row.actions[actionIndex] = { ...event.row.actions[actionIndex], time: actionTime };
        event.row.actionModifierEffects![actionIndex] = modifiers;
        events.forEach((queued) => {
          if (queued.row === event.row && queued.kind === "action" && queued.actionIndex === actionIndex)
            queued.time = event.row.startTime + actionTime;
        });
      });
      const adjustedCastTime = adjust(segment.baseCastTime);
      const shift = adjustedCastTime - segment.effectiveCastTime;
      segment.effectiveCastTime = adjustedCastTime;
      if (shift) {
        event.row.effectiveCastTime += shift;
        segments!.slice((event.subActionIndex ?? -1) + 1).forEach((laterSegment) => {
          laterSegment.startOffset += shift;
          laterSegment.actionIndexes.forEach((actionIndex) => {
            const action = event.row.actions[actionIndex];
            if (typeof action?.time === "number") action.time += shift;
          });
        });
        events.forEach((queued) => {
          if (queued.row !== event.row) return;
          if (queued.kind === "subActionStart" && (queued.subActionIndex ?? -1) > (event.subActionIndex ?? -1))
            queued.time += shift;
          if (
            queued.kind === "action" &&
            segments!
              .slice((event.subActionIndex ?? -1) + 1)
              .some((laterSegment) => laterSegment.actionIndexes.includes(queued.actionIndex ?? -1))
          )
            queued.time += shift;
        });
        rows.forEach((row) => {
          if (
            row.kind !== "rotation" ||
            (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) ||
            !isSequentialStep(row.step)
          )
            return;
          shiftRotationRowAndAttachments(row, shift);
        });
      }
      syncDirectAttachments(event.row);
      continue;
    }
    if (event.kind === "start") {
      const skillId = event.row.step.type === "skill" ? (event.row.step.skill ?? "") : "";
      if (
        event.row.kind === "rotation" &&
        event.row.step.type === "skill" &&
        typeof event.row.skill?.cooldown === "number" &&
        (cooldowns[`skill:${skillId}`] ?? 0) > event.time
      ) {
        const skippedCastTime = event.row.effectiveCastTime;
        event.row.skipped = true;
        event.row.actions = [];
        event.row.effectiveCastTime = 0;
        [...(directAttachments.get(event.row.id) ?? []), ...(triggeredAttachments.get(event.row.id) ?? [])].forEach(
          ({ eventRow }) => {
            eventRow.skipped = true;
            for (let index = events.length - 1; index >= 0; index -= 1)
              if (events[index].row === eventRow) events.splice(index, 1);
          },
        );
        rows.forEach((row) => {
          if (
            row.kind !== "rotation" ||
            (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) ||
            !isSequentialStep(row.step)
          )
            return;
          shiftRotationRowAndAttachments(row, -skippedCastTime);
        });
        continue;
      }
      if (
        event.row.kind === "rotation" &&
        event.row.step.type === "skill" &&
        typeof event.row.skill?.cooldown === "number"
      )
        cooldowns[`skill:${skillId}`] = event.time + event.row.skill.cooldown;
      if (
        event.row.step.type === "skill" &&
        event.row.skill?.tags?.includes("MartialArts") &&
        event.row.skill.martialArt &&
        event.row.skill.weapon
      ) {
        currentMartialArt = event.row.skill.martialArt;
        currentWeapon = event.row.skill.weapon;
      }
      event.row.buffs = [...buffs];
      event.row.debuffs = [...debuffs];
      event.row.distance = distance;
      event.row.currentHP = currentHP;
      event.row.currentHPRatio = currentHPRatio;
      event.row.targetHPRatio = targetHPRatio;
      event.row.targetQiRatio = targetQiRatio;
      event.row.resources = { ...resources };
      event.row.currentMartialArt = currentMartialArt;
      event.row.currentWeapon = currentWeapon;
      if (multiActionSegments.has(event.row.id)) continue;
      resolveStartBoundActionValues(
        event.row,
        event.row.actions.map((_action, actionIndex) => actionIndex),
      );
      const modifiers = Array.isArray(event.row.skill?.modifier) ? (event.row.skill.modifier as EditableObject[]) : [];
      event.row.modifierEffects = modifiers
        .filter((item) =>
          requirementsPass(
            item.requirement,
            buffs,
            debuffs,
            event.row.skill?.tags ?? [],
            innerWayConditions,
            weapons,
            resources,
            requirementState(),
          ),
        )
        .map((item) =>
          item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
            ? resolveCastModifierEffect(item.effect as EditableObject, buffs, debuffs)
            : {},
        );
      const previousCastTime = event.row.effectiveCastTime;
      const baseCastTime =
        event.row.step.type === "event" && event.row.step.event === "Delay"
          ? Math.max(0, event.row.step.duration)
          : typeof event.row.skill?.castTime === "number"
            ? event.row.skill.castTime
            : 0;
      const adjustedCastTime = applyCastTimingModifiers(event.row, baseCastTime);
      if (event.row.kind === "rotation" && event.row.step.type === "skill") {
        const shift = adjustedCastTime - previousCastTime;
        if (shift)
          rows.forEach((row) => {
            if (
              row.kind !== "rotation" ||
              (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) ||
              !isSequentialStep(row.step)
            )
              return;
            shiftRotationRowAndAttachments(row, shift);
          });
      }
      continue;
    }

    const action = event.row.actions[event.actionIndex ?? -1];
    if (!action) continue;
    event.row.actionStates[event.actionIndex ?? -1] = {
      buffs: [...buffs],
      debuffs: [...debuffs],
      distance,
      currentHP,
      currentHPRatio,
      targetHPRatio,
      targetQiRatio,
      resources: { ...resources },
      currentMartialArt,
      currentWeapon,
    };
    const skillTags = event.row.actionSkillTags?.[event.actionIndex ?? -1] ?? event.row.skill?.tags ?? [];
    const resolutionKey = actionResolutionKey(event.row, event.actionIndex ?? -1);
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
        );
    if (!requirementPasses) continue;
    const skillKey = event.row.step.type === "skill" ? (event.row.step.skill ?? "") : event.row.step.event;
    const actionCooldownKey = `action:${skillKey}:${event.actionIndex ?? -1}`;
    if (typeof action.cooldown === "number" && (cooldowns[actionCooldownKey] ?? 0) > event.time) continue;
    if (action.type === "apply" && typeof action.value === "string" && (cooldowns[action.value] ?? 0) > event.time)
      continue;
    if (action.type === "clearCD" && typeof action.value === "string") {
      cooldowns[action.value] = event.time;
      cooldowns[`skill:${action.value}`] = event.time;
      continue;
    }
    if (action.type === "move" && typeof action.distance === "number" && Number.isFinite(action.distance)) {
      distance = Math.max(1, Math.floor(action.distance));
      continue;
    }
    if (action.type === "setHP") {
      if (typeof action.currentHP === "number" && Number.isFinite(action.currentHP)) setCurrentHP(action.currentHP);
      else if (typeof action.currentHPRatio === "number" && Number.isFinite(action.currentHPRatio))
        setCurrentHP(action.currentHPRatio * maxHP);
      continue;
    }
    if (
      action.type === "setTargetHP" &&
      typeof action.targetHPRatio === "number" &&
      Number.isFinite(action.targetHPRatio)
    ) {
      targetHPRatio = Math.min(1, Math.max(0, action.targetHPRatio));
      continue;
    }
    if (action.type === "setQi" && typeof action.targetQiRatio === "number" && Number.isFinite(action.targetQiRatio)) {
      targetQiRatio = Math.min(1, Math.max(0, action.targetQiRatio));
      resources = { ...resources, Qi: targetQiRatio * 100 };
      continue;
    }
    if (
      action.type === "switchMartialArt" &&
      typeof action.martialArt === "string" &&
      input.martialArtState?.[action.martialArt as WeaponId]?.weapon
    ) {
      currentMartialArt = action.martialArt as WeaponId;
      currentWeapon = input.martialArtState?.[currentMartialArt]?.weapon;
      continue;
    }
    if (
      (action.type === "setResource" || action.type === "addResource" || action.type === "consumeResource") &&
      typeof action.value === "string" &&
      ((typeof action.amount === "number" && Number.isFinite(action.amount) && action.amount >= 0) ||
        (action.type === "consumeResource" && action.amount === "all"))
    ) {
      const current = resources[action.value] ?? 0;
      const resourceAmount = typeof action.amount === "number" ? action.amount : 0;
      let next = current;
      switch (action.type) {
        case "setResource":
          next = resourceAmount;
          break;
        case "addResource":
          next = current + resourceAmount;
          break;
        case "consumeResource":
          next = action.amount === "all" ? 0 : current - resourceAmount;
          break;
      }
      resources = { ...resources, [action.value]: clampResource(action.value, next) };
      continue;
    }
    if (action.type === "consume") {
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const valueObject =
        action.value && typeof action.value === "object" && !Array.isArray(action.value)
          ? (action.value as EditableObject)
          : undefined;
      let value = startResolvedActionValues.has(resolutionKey)
        ? startResolvedActionValues.get(resolutionKey)
        : action.value;
      if (
        !startResolvedActionValues.has(resolutionKey) &&
        valueObject?.operator === "first" &&
        Array.isArray(valueObject.operand)
      )
        value = valueObject.operand.find(
          (candidate) => typeof candidate === "string" && targetEffects.some((effect) => effect.name === candidate),
        );
      if (typeof value === "string") {
        const next = consumeTrackedEffect(
          targetEffects,
          value,
          action.stack === "all" ? "all" : typeof action.stack === "number" ? action.stack : undefined,
        );
        if (action.target === "target") debuffs = next;
        else buffs = next;
        if (!next.some((effect) => effect.name === value)) {
          const target = action.target === "target" ? "target" : "self";
          const key = periodicEffectKey(target, value);
          const activeEffect = activePeriodicEffects[key];
          if (activeEffect) {
            removePendingPeriodicRows(activeEffect, event.time, true);
            delete activePeriodicEffects[key];
          }
        }
      }
    }
    const enqueueTriggeredSkill = (
      skillId: string,
      sourceRowId?: string,
      attachedTriggerOrdinal?: number,
      triggerSource: "skill" | "setup" | "innerWay" = "skill",
    ) => {
      const triggeredSkill = skills[skillId];
      const key = `skill:${skillId}`;
      if (!triggeredSkill || (cooldowns[key] ?? 0) > event.time) return;
      const actions = Array.isArray(triggeredSkill.action) ? (triggeredSkill.action as EditableObject[]) : [];
      const derivedId = nextDerivedOrder++;
      const derivedSortOrder = [...event.sortOrder, derivedId];
      const rowOrder = event.row.order + 10 + (event.actionIndex ?? 0) + 0.5;
      const row: TimelineRow = {
        id: `trigger-${derivedId}`,
        kind: "trigger",
        sourceRowId,
        triggerSource,
        order: rowOrder,
        step: { type: "skill", skill: skillId },
        startTime: event.time,
        distance,
        currentHP,
        currentHPRatio,
        targetHPRatio,
        targetQiRatio,
        resources: { ...resources },
        currentMartialArt,
        currentWeapon,
        effectiveCastTime: typeof triggeredSkill.castTime === "number" ? triggeredSkill.castTime : 0,
        skill: triggeredSkill,
        actions: actions.map((item) => ({ ...item })),
        buffs: [...buffs],
        debuffs: [...debuffs],
        modifierEffects: [],
        actionStates: {},
      };
      rows.push(row);
      events.push({ time: event.time, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
      actions.forEach((item, index) =>
        events.push({
          time: event.time + (typeof item.time === "number" ? item.time : 0),
          sortOrder: [...derivedSortOrder, 1, index],
          kind: "action",
          row,
          actionIndex: index,
        }),
      );
      if (sourceRowId && attachedTriggerOrdinal !== undefined) {
        (triggeredAttachments.get(sourceRowId) ?? [])
          .filter((attachment) => attachment.target.trigger === attachedTriggerOrdinal)
          .forEach((attachment) => {
            directAttachments.set(row.id, [...(directAttachments.get(row.id) ?? []), attachment]);
            const targetTime =
              attachment.target.action === "start"
                ? row.startTime
                : row.startTime + Number(row.actions[attachment.target.action]?.time ?? 0);
            const targetSortOrder =
              attachment.target.action === "start"
                ? [...derivedSortOrder, 0]
                : [...derivedSortOrder, 1, attachment.target.action];
            const targetDisplayOrder =
              attachment.target.action === "start" ? row.order : row.order + 10 + attachment.target.action;
            queueAttachedEvent(attachment, targetTime, targetSortOrder, targetDisplayOrder);
          });
      }
      if (typeof triggeredSkill.cooldown === "number") cooldowns[key] = event.time + triggeredSkill.cooldown;
    };
    const applyTriggerAction = (triggerAction: EditableObject, triggerSource: "setup" | "innerWay") => {
      if (triggerAction.type === "clearCD" && typeof triggerAction.value === "string") {
        cooldowns[triggerAction.value] = event.time;
        cooldowns[`skill:${triggerAction.value}`] = event.time;
        return;
      }
      if (triggerAction.type === "consume" && typeof triggerAction.value === "string") {
        const targetEffects = triggerAction.target === "target" ? debuffs : buffs;
        const next = consumeTrackedEffect(
          targetEffects,
          triggerAction.value,
          triggerAction.stack === "all"
            ? "all"
            : typeof triggerAction.stack === "number"
              ? triggerAction.stack
              : undefined,
        );
        if (triggerAction.target === "target") debuffs = next;
        else buffs = next;
        if (!next.some((effect) => effect.name === triggerAction.value)) {
          const target = triggerAction.target === "target" ? "target" : "self";
          const key = periodicEffectKey(target, triggerAction.value);
          const activeEffect = activePeriodicEffects[key];
          if (activeEffect) {
            removePendingPeriodicRows(activeEffect, event.time, true);
            delete activePeriodicEffects[key];
          }
        }
        return;
      }
      if (triggerAction.type === "trigger" && typeof triggerAction.value === "string") {
        enqueueTriggeredSkill(triggerAction.value, event.row.sourceRowId ?? event.row.id, undefined, triggerSource);
        return;
      }
      if (
        triggerAction.type !== "apply" ||
        typeof triggerAction.value !== "string" ||
        (cooldowns[triggerAction.value] ?? 0) > event.time
      )
        return;
      const targetEffects = triggerAction.target === "target" ? debuffs : buffs;
      const periodicTarget = triggerAction.target === "target" ? "target" : "self";
      const definition = getModifiedEffectDefinition(triggerAction.value, buffs, debuffs, skillTags);
      const duration = typeof triggerAction.duration === "number" ? triggerAction.duration : definition.duration;
      const baseStack = typeof triggerAction.stack === "number" ? triggerAction.stack : 1;
      const additional =
        triggerAction.additionalStack &&
        typeof triggerAction.additionalStack === "object" &&
        !Array.isArray(triggerAction.additionalStack)
          ? (triggerAction.additionalStack as EditableObject)
          : undefined;
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
          : 0;
      const fallbackSourceRowId =
        event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id);
      const collection = boostDamageCollection(
        undefined,
        triggerAction.value,
        [...buffs, ...debuffs],
        fallbackSourceRowId,
      );
      const existing = targetEffects.find((effect) => effect.name === triggerAction.value);
      if (existing && triggerAction.reapply === false) return;
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
      );
      if (triggerAction.target === "target") debuffs = next;
      else buffs = next;
      const appliedEffect = next.find((effect) => effect.name === triggerAction.value);
      if (definition.periodic && appliedEffect?.expiresAt !== undefined) {
        const key = periodicEffectKey(periodicTarget, triggerAction.value);
        const effectSourceRowId = event.row.sourceRowId ?? event.row.id;
        if (existing && activePeriodicEffects[key] && definition.refresh !== false) {
          transferAndReschedulePeriodicEffect(
            triggerAction.value,
            periodicTarget,
            definition,
            appliedEffect.expiresAt,
            event.time,
            effectSourceRowId,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            definition.periodic?.resetOnRefresh === true,
          );
        } else if (!existing || !activePeriodicEffects[key]) {
          const activeEffect: ActivePeriodicEffect = {
            definition,
            appliedAt: event.time,
            expiresAt: appliedEffect.expiresAt,
            sourceRowId: effectSourceRowId,
            rows: [],
          };
          activePeriodicEffects[key] = activeEffect;
          schedulePeriodicActions(
            triggerAction.value,
            activeEffect,
            event.time,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            true,
          );
        }
      }
      if (appliedEffect) {
        enqueueEffectActions(
          triggerAction.value,
          definition,
          event.time,
          collection.sourceRowId,
          event.sortOrder,
          event.row.order + (event.actionIndex ?? 0),
          periodicTarget,
          appliedEffect.expiresAt,
        );
        if (definition.cooldown !== undefined) cooldowns[triggerAction.value] = event.time + definition.cooldown;
      }
    };
    const runSetupTriggers = (triggerEvent: string) => {
      setupEffects.forEach((setup) => {
        const trigger =
          setup.trigger && typeof setup.trigger === "object" && !Array.isArray(setup.trigger)
            ? (setup.trigger as EditableObject)
            : undefined;
        if (
          trigger?.event !== triggerEvent ||
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
          return;
        if (trigger.action && typeof trigger.action === "object" && !Array.isArray(trigger.action))
          applyTriggerAction(trigger.action as EditableObject, "setup");
      });
    };
    if (action.type === "takeDamage" && typeof action.damage === "number" && Number.isFinite(action.damage)) {
      setCurrentHP(currentHP - Math.max(0, action.damage));
      const triggerStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
      runSetupTriggers("takeDamage");
      if (import.meta.env.DEV) finishCalculationPhase("effectTriggering", triggerStartedAt);
      continue;
    }
    if (action.type === "damage") {
      const triggerStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0;
      runSetupTriggers("damage");
      innerWayRules
        .filter((rule) => rule.trigger?.event === "damage" || rule.trigger?.target === "self")
        .forEach((rule) => {
          const requirement = rule.requirement ?? rule.trigger?.requirement;
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
            )
          )
            return;
          const triggerActions = Array.isArray(rule.trigger?.action)
            ? rule.trigger.action
            : rule.trigger?.action && typeof rule.trigger.action === "object"
              ? [rule.trigger.action]
              : [];
          triggerActions
            .filter(
              (triggerAction): triggerAction is EditableObject =>
                Boolean(triggerAction) && typeof triggerAction === "object" && !Array.isArray(triggerAction),
            )
            .forEach((triggerAction) => applyTriggerAction(triggerAction, "innerWay"));
        });
      if (import.meta.env.DEV) finishCalculationPhase("effectTriggering", triggerStartedAt);
    }
    if (action.type === "trigger" && typeof action.value === "string") {
      const triggerOrdinal =
        event.row.kind === "rotation"
          ? event.row.actions.slice(0, (event.actionIndex ?? 0) + 1).filter((candidate) => candidate.type === "trigger")
              .length - 1
          : undefined;
      enqueueTriggeredSkill(action.value, event.row.sourceRowId ?? event.row.id, triggerOrdinal);
    }
    if ((action.type === "apply" || action.type === "extend") && typeof action.value === "string") {
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const periodicTarget = action.target === "target" ? "target" : "self";
      const modifierDuration = (
        event.row.actionModifierEffects?.[event.actionIndex ?? -1] ?? event.row.modifierEffects
      ).find((effect) => typeof effect.duration === "number");
      const definition = getModifiedEffectDefinition(action.value, buffs, debuffs, skillTags);
      const duration =
        typeof action.duration === "number"
          ? action.duration
          : typeof modifierDuration?.duration === "number"
            ? modifierDuration.duration
            : definition.duration;
      const existing = targetEffects.find((effect) => effect.name === action.value);
      const fallbackSourceRowId =
        event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id);
      const collection = boostDamageCollection(
        event.row.skill,
        action.value,
        [...buffs, ...debuffs],
        fallbackSourceRowId,
      );
      const shouldApply = action.type === "apply" && (!existing || action.reapply !== false);
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
              )
            : targetEffects;
      if (action.target === "target") debuffs = next;
      else buffs = next;
      const appliedEffect = next.find((effect) => effect.name === action.value);
      if (shouldApply && definition.periodic && appliedEffect?.expiresAt !== undefined) {
        const key = periodicEffectKey(periodicTarget, action.value);
        const effectSourceRowId = event.row.sourceRowId ?? event.row.id;
        if (existing && activePeriodicEffects[key] && definition.refresh !== false) {
          transferAndReschedulePeriodicEffect(
            action.value,
            periodicTarget,
            definition,
            appliedEffect.expiresAt,
            event.time,
            effectSourceRowId,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            definition.periodic?.resetOnRefresh === true,
          );
        } else if (!existing || !activePeriodicEffects[key]) {
          const activeEffect: ActivePeriodicEffect = {
            definition,
            appliedAt: event.time,
            expiresAt: appliedEffect.expiresAt,
            sourceRowId: effectSourceRowId,
            rows: [],
          };
          activePeriodicEffects[key] = activeEffect;
          schedulePeriodicActions(
            action.value,
            activeEffect,
            event.time,
            event.sortOrder,
            event.row.order + (event.actionIndex ?? 0),
            true,
          );
        }
      }
      if (
        action.type === "extend" &&
        typeof duration === "number" &&
        existing?.expiresAt !== undefined &&
        existing.expiresAt > event.time &&
        activePeriodicEffects[periodicEffectKey(periodicTarget, action.value)]
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
        );
      }
      if (shouldApply && appliedEffect) {
        enqueueEffectActions(
          action.value,
          definition,
          event.time,
          collection.sourceRowId,
          event.sortOrder,
          event.row.order + (event.actionIndex ?? 0),
          periodicTarget,
          appliedEffect.expiresAt,
        );
        if (definition.cooldown !== undefined) cooldowns[action.value] = event.time + definition.cooldown;
      }
    }
    if (typeof action.cooldown === "number") cooldowns[actionCooldownKey] = event.time + action.cooldown;
  }
  return rows.sort(
    (left, right) =>
      compareTimelineTime(left.startTime, right.startTime) ||
      left.order - right.order ||
      (left.kind === "rotation" ? -1 : right.kind === "rotation" ? 1 : 0),
  );
}

export function buildRotationTimeline(input: TimelineBuildInput): TimelineRow[] {
  if (input.rotation.eventTimeReference !== "battleStart") return buildRotationTimelinePass(input);
  let anchorTime: number | undefined;
  let rows: TimelineRow[] = [];
  for (let pass = 0; pass < 8; pass += 1) {
    rows = buildRotationTimelinePass(input, anchorTime);
    const anchorRow = rows.find((row) => row.id === `rotation-${input.rotation.start?.step ?? 0}`);
    const actionIndex = input.rotation.start?.action;
    const nextAnchorTime = anchorRow
      ? anchorRow.startTime + (actionIndex === undefined ? 0 : Number(anchorRow.actions[actionIndex]?.time ?? 0))
      : 0;
    if (anchorTime !== undefined && compareTimelineTime(nextAnchorTime, anchorTime) === 0) return rows;
    anchorTime = nextAnchorTime;
  }
  return buildRotationTimelinePass(input, anchorTime);
}
